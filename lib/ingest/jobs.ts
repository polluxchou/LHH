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
