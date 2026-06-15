export type JobStatus = "pending" | "running" | "done" | "failed";

export interface IngestJob {
  id: string;
  tracking_object_id: string;
  space_id: string;
  run_date: string;
  status: JobStatus;
  attempts: number;
}

export interface NewJobRow {
  tracking_object_id: string;
  space_id: string;
  run_date: string;
}

/** 队列存储原语;supabase 实现见后续任务,单测用内存 fake。 */
export interface JobStore {
  listTrackingObjects(): Promise<{ id: string; space_id: string }[]>;
  /** 插入若干 job,(tracking_object_id, run_date) 已存在则忽略;返回真正插入条数。 */
  insertJobsIgnoreDup(rows: NewJobRow[]): Promise<number>;
  /** 取一条可处理的 pending(attempts < maxAttempts);无则 null。 */
  selectOnePending(runDate: string, maxAttempts: number): Promise<IngestJob | null>;
  /** 原子认领:仅当仍是 pending 时置 running 并把 attempts 设为 currentAttempts+1,返回认领后的 job;被抢则 null。 */
  tryClaim(id: string, currentAttempts: number): Promise<IngestJob | null>;
  setStatus(id: string, patch: Partial<Pick<IngestJob, "status">> & { last_error?: string | null; wrote?: boolean }): Promise<void>;
  countPending(runDate: string, maxAttempts: number): Promise<number>;
}

/** 当天 UTC 日期 YYYY-MM-DD。 */
export function utcRunDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** 为所有监控对象入队当天的 job;幂等。返回真正新增条数。 */
export async function enqueueDailyJobs(store: JobStore, opts: { runDate: string }): Promise<number> {
  const objects = await store.listTrackingObjects();
  const rows: NewJobRow[] = objects.map((o) => ({
    tracking_object_id: o.id,
    space_id: o.space_id,
    run_date: opts.runDate,
  }));
  if (rows.length === 0) return 0;
  return store.insertJobsIgnoreDup(rows);
}

/**
 * 领取下一条可处理 job:乐观锁。selectOnePending → tryClaim;被抢(null)则取下一条重试,
 * 最多 maxTries 次防活锁;无可领则 null。
 */
export async function claimNextJob(
  store: JobStore,
  opts: { runDate: string; maxAttempts: number; maxTries?: number },
): Promise<IngestJob | null> {
  const maxTries = opts.maxTries ?? 12;
  for (let i = 0; i < maxTries; i++) {
    const candidate = await store.selectOnePending(opts.runDate, opts.maxAttempts);
    if (!candidate) return null;
    const claimed = await store.tryClaim(candidate.id, candidate.attempts);
    if (claimed) return claimed;
    // 被别的链抢走 → 继续取下一条
  }
  return null;
}

/** 成功:置 done,记录是否真写了内容。 */
export async function completeJob(store: JobStore, job: IngestJob, opts: { wrote: boolean }): Promise<void> {
  await store.setStatus(job.id, { status: "done", wrote: opts.wrote, last_error: null });
}

/** 失败:已达重试上限置 failed,否则置回 pending 等下轮。job.attempts 是认领后(已 +1)的值。 */
export async function failJob(
  store: JobStore,
  job: IngestJob,
  opts: { error: string; maxAttempts: number },
): Promise<void> {
  const status: JobStatus = job.attempts >= opts.maxAttempts ? "failed" : "pending";
  await store.setStatus(job.id, { status, last_error: opts.error.slice(0, 500) });
}

import type { SupabaseClient } from "@supabase/supabase-js";

/** service-role supabase 支撑的 JobStore。表 ingest_jobs(见迁移 0008)。 */
export function createSupabaseJobStore(db: SupabaseClient): JobStore {
  return {
    async listTrackingObjects() {
      const { data, error } = await db.from("tracking_objects").select("id, space_id");
      if (error) throw new Error(`listTrackingObjects: ${error.message}`);
      return (data ?? []) as { id: string; space_id: string }[];
    },
    async insertJobsIgnoreDup(rows) {
      if (rows.length === 0) return 0;
      const { data, error } = await db
        .from("ingest_jobs")
        .upsert(
          rows.map((r) => ({ ...r, status: "pending" })),
          { onConflict: "tracking_object_id,run_date", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw new Error(`insertJobsIgnoreDup: ${error.message}`);
      return data?.length ?? 0;
    },
    async selectOnePending(runDate, maxAttempts) {
      const { data, error } = await db
        .from("ingest_jobs")
        .select("id, tracking_object_id, space_id, run_date, status, attempts")
        .eq("status", "pending")
        .eq("run_date", runDate)
        .lt("attempts", maxAttempts)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`selectOnePending: ${error.message}`);
      return (data as IngestJob) ?? null;
    },
    async tryClaim(id, currentAttempts) {
      // 仅当仍 pending 时置 running 并把 attempts 写成 currentAttempts+1(乐观锁:被抢则 0 行返回)。
      const { data, error } = await db
        .from("ingest_jobs")
        .update({ status: "running", attempts: currentAttempts + 1, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "pending")
        .select("id, tracking_object_id, space_id, run_date, status, attempts")
        .maybeSingle();
      if (error) throw new Error(`tryClaim: ${error.message}`);
      return (data as IngestJob) ?? null;
    },
    async setStatus(id, patch) {
      const { error } = await db
        .from("ingest_jobs")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(`setStatus: ${error.message}`);
    },
    async countPending(runDate, maxAttempts) {
      const { count, error } = await db
        .from("ingest_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("run_date", runDate)
        .lt("attempts", maxAttempts);
      if (error) throw new Error(`countPending: ${error.message}`);
      return count ?? 0;
    },
  };
}
