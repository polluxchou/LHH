# A1 · 抓取队列(Supabase queue + 自触发 worker)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把每日抓取从"单请求串行跑所有对象"改为"Supabase 队列 + 自触发 worker",支撑 50-100 对象不触 Vercel 60s 上限。

**Architecture:** cron → `/api/ingest/enqueue`(每对象入队 `ingest_jobs`,幂等)→ 踢 K 条 worker 链 → `/api/ingest/worker` 每次乐观锁领 1 个 job、调现成 `ingestTrackingObject` 跑流水线、done/retry/failed,还有 pending 就 fetch 自己续跑。队列逻辑(领取竞态/重试/入队映射)抽到可注入 `JobStore` 之上,用内存 fake 单测;supabase 适配层薄、不单测(同 ingest-writer)。

**Tech Stack:** Next.js 15 App Router · TypeScript · @supabase/supabase-js(service-role)· vitest。

**Worktree:** `/Users/fengzhou/Code/lhh-ingest-queue`(分支 `feature/ingest-queue`,off `edf4422`)。`node_modules` 已软链。**精确 `git add <file>`,绝不 `git add -A`。** 测试:`npx vitest run <path>`;类型:`npx tsc --noEmit`。

**复用(不改)：** `ingestTrackingObject(db, brand)` @ `lib/ingest/run.ts`(IngestBrandInput = {id,spaceId,name,aliases,keywords,excludedTerms,languages,regions});`getServiceClient()` @ `lib/db/supabase.ts`。`tracking_objects` 列:`id, space_id, name, aliases, keywords, excluded_terms, languages, regions`。

---

## Task 1: `JobStore` 接口 + 类型 + `enqueueDailyJobs`

**Files:**
- Create: `lib/ingest/jobs.ts`
- Test: `tests/ingest/jobs.test.ts`

- [ ] **Step 1: 写失败测试(建文件)**

```ts
// tests/ingest/jobs.test.ts
import { describe, it, expect } from "vitest";
import { enqueueDailyJobs, type JobStore, type IngestJob } from "@/lib/ingest/jobs";

/** 内存版 JobStore,用于单测队列逻辑。 */
function makeFakeStore(opts?: { objects?: { id: string; space_id: string }[] }): JobStore & { jobs: IngestJob[] } {
  const objects = opts?.objects ?? [{ id: "o1", space_id: "s1" }, { id: "o2", space_id: "s1" }];
  const jobs: IngestJob[] = [];
  let seq = 0;
  return {
    jobs,
    async listTrackingObjects() {
      return objects;
    },
    async insertJobsIgnoreDup(rows) {
      let inserted = 0;
      for (const r of rows) {
        if (jobs.some((j) => j.tracking_object_id === r.tracking_object_id && j.run_date === r.run_date)) continue;
        jobs.push({ id: `j${++seq}`, tracking_object_id: r.tracking_object_id, space_id: r.space_id, run_date: r.run_date, status: "pending", attempts: 0 });
        inserted += 1;
      }
      return inserted;
    },
    async selectOnePending(runDate, maxAttempts) {
      return jobs.find((j) => j.status === "pending" && j.run_date === runDate && j.attempts < maxAttempts) ?? null;
    },
    async tryClaim(id, currentAttempts) {
      const j = jobs.find((x) => x.id === id);
      if (!j || j.status !== "pending") return null;
      j.status = "running";
      j.attempts = currentAttempts + 1;
      return { ...j };
    },
    async setStatus(id, patch) {
      const j = jobs.find((x) => x.id === id);
      if (j) Object.assign(j, patch);
    },
    async countPending(runDate, maxAttempts) {
      return jobs.filter((j) => j.status === "pending" && j.run_date === runDate && j.attempts < maxAttempts).length;
    },
  };
}

describe("enqueueDailyJobs", () => {
  it("每个对象入队一条 pending", async () => {
    const store = makeFakeStore();
    const n = await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    expect(n).toBe(2);
    expect(store.jobs.filter((j) => j.status === "pending")).toHaveLength(2);
    expect(store.jobs[0].space_id).toBe("s1");
  });
  it("重复入队幂等(同 run_date 不重复插)", async () => {
    const store = makeFakeStore();
    await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    const n2 = await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    expect(n2).toBe(0);
    expect(store.jobs).toHaveLength(2);
  });
});

export { makeFakeStore };
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/ingest/jobs.test.ts` → FAIL(模块/导出不存在)。

- [ ] **Step 3: 实现 `lib/ingest/jobs.ts`(类型 + 接口 + enqueueDailyJobs)**

```ts
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

/** 队列存储原语;supabase 实现见 createSupabaseJobStore(Task 4),单测用内存 fake。 */
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/ingest/jobs.test.ts` → PASS。

- [ ] **Step 5: 提交**

```bash
git add lib/ingest/jobs.ts tests/ingest/jobs.test.ts
git commit -m "feat: ingest jobs store interface + enqueueDailyJobs"
```

---

## Task 2: `claimNextJob`(乐观锁领取 + 竞态重试)

**Files:**
- Modify: `lib/ingest/jobs.ts`
- Test: `tests/ingest/jobs.test.ts`

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 tests/ingest/jobs.test.ts
import { claimNextJob } from "@/lib/ingest/jobs";

describe("claimNextJob", () => {
  it("领取一条 pending → 置 running、attempts+1", async () => {
    const store = makeFakeStore();
    await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    const job = await claimNextJob(store, { runDate: "2026-06-15", maxAttempts: 3 });
    expect(job).not.toBeNull();
    expect(job!.status).toBe("running");
    expect(job!.attempts).toBe(1);
  });
  it("无 pending → null", async () => {
    const store = makeFakeStore({ objects: [] });
    expect(await claimNextJob(store, { runDate: "2026-06-15", maxAttempts: 3 })).toBeNull();
  });
  it("竞态:selectOnePending 选中但被抢(tryClaim 返回 null)→ 跳过该条取下一条", async () => {
    const store = makeFakeStore();
    await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    // 让第一次 tryClaim 模拟被抢:把第一条直接标记成 running(别的链抢走)
    let firstCall = true;
    const orig = store.tryClaim.bind(store);
    store.tryClaim = async (id, currentAttempts) => {
      if (firstCall) { firstCall = false; return null; } // 第一条被抢
      return orig(id, currentAttempts);
    };
    const job = await claimNextJob(store, { runDate: "2026-06-15", maxAttempts: 3 });
    expect(job).not.toBeNull(); // 仍领到一条(第二次成功)
    expect(job!.status).toBe("running");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/ingest/jobs.test.ts` → 新用例 FAIL。

- [ ] **Step 3: 实现 `claimNextJob`(追加到 jobs.ts)**

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/ingest/jobs.test.ts` → 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add lib/ingest/jobs.ts tests/ingest/jobs.test.ts
git commit -m "feat: claimNextJob optimistic-lock claim with race retry"
```

---

## Task 3: `completeJob` / `failJob`(状态流转 + 重试上限)

**Files:**
- Modify: `lib/ingest/jobs.ts`
- Test: `tests/ingest/jobs.test.ts`

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 tests/ingest/jobs.test.ts
import { completeJob, failJob } from "@/lib/ingest/jobs";

describe("completeJob / failJob", () => {
  it("completeJob → done + wrote", async () => {
    const store = makeFakeStore();
    await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    const job = (await claimNextJob(store, { runDate: "2026-06-15", maxAttempts: 3 }))!;
    await completeJob(store, job, { wrote: true });
    const after = store.jobs.find((j) => j.id === job.id)!;
    expect(after.status).toBe("done");
  });
  it("failJob:attempts < max → 置回 pending(可重试)", async () => {
    const store = makeFakeStore();
    await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    const job = (await claimNextJob(store, { runDate: "2026-06-15", maxAttempts: 3 }))!; // attempts=1
    await failJob(store, job, { error: "gemini timeout", maxAttempts: 3 });
    const after = store.jobs.find((j) => j.id === job.id)!;
    expect(after.status).toBe("pending");
  });
  it("failJob:attempts >= max → failed", async () => {
    const store = makeFakeStore();
    await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    const job = { ...(await claimNextJob(store, { runDate: "2026-06-15", maxAttempts: 3 }))!, attempts: 3 };
    await failJob(store, job, { error: "boom", maxAttempts: 3 });
    const after = store.jobs.find((j) => j.id === job.id)!;
    expect(after.status).toBe("failed");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/ingest/jobs.test.ts` → 新用例 FAIL。

- [ ] **Step 3: 实现(追加到 jobs.ts)**

```ts
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
```

- [ ] **Step 4: 跑测试确认通过 + tsc**

Run: `npx vitest run tests/ingest/jobs.test.ts && npx tsc --noEmit` → PASS / clean。

- [ ] **Step 5: 提交**

```bash
git add lib/ingest/jobs.ts tests/ingest/jobs.test.ts
git commit -m "feat: completeJob/failJob status transitions with retry cap"
```

---

## Task 4: `createSupabaseJobStore`(薄 supabase 适配层,不单测)

**Files:**
- Modify: `lib/ingest/jobs.ts`

> 薄适配:把 JobStore 原语映射到 supabase-js 链。不单测(网络副作用,同 ingest-writer);靠 Task 1-3 逻辑单测 + Task 9 集成验证。

- [ ] **Step 1: 实现(追加到 jobs.ts)**

```ts
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
```

> `tryClaim(id, currentAttempts)` 与 Task 1 接口、Task 2 调用一致:supabase-js 不能在 update 里写 `attempts = attempts + 1` 表达式,所以由 `claimNextJob` 把 `candidate.attempts` 传进来,这里写常量 `currentAttempts + 1`。乐观锁靠 `.eq("status","pending")`:被别的链抢走则 0 行返回 → null。

- [ ] **Step 2: tsc + 全量测试(确保 Task 1-3 仍绿)**

Run: `npx tsc --noEmit && npx vitest run tests/ingest/jobs.test.ts` → clean / 全绿。

- [ ] **Step 3: 提交**

```bash
git add lib/ingest/jobs.ts tests/ingest/jobs.test.ts
git commit -m "feat: createSupabaseJobStore adapter + attempts increment on claim"
```

---

## Task 5: `/api/ingest/enqueue` 路由(入队 + 踢 K 条 worker 链)

**Files:**
- Create: `app/api/ingest/enqueue/route.ts`

> 参考现有 `app/api/ingest/route.ts` 的鉴权(`INGEST_SECRET`/`CRON_SECRET`,Authorization: Bearer)与 `getServiceClient()`。

- [ ] **Step 1: 实现**

```ts
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db/supabase";
import { createSupabaseJobStore, enqueueDailyJobs, utcRunDate } from "@/lib/ingest/jobs";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  return token === process.env.INGEST_SECRET || token === process.env.CRON_SECRET;
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getServiceClient();
  const store = createSupabaseJobStore(db);
  const runDate = utcRunDate(new Date());
  const enqueued = await enqueueDailyJobs(store, { runDate });

  // 踢 K 条并行 worker 链(fire-and-forget)
  const K = Number(process.env.INGEST_WORKER_CONCURRENCY ?? "4");
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const secret = process.env.INGEST_SECRET ?? "";
  for (let i = 0; i < K; i++) {
    void fetch(`${base}/api/ingest/worker`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }).catch(() => {});
  }

  return NextResponse.json({ runDate, enqueued, kicked: K });
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
```

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit` → clean。

- [ ] **Step 3: 提交**

```bash
git add app/api/ingest/enqueue/route.ts
git commit -m "feat: /api/ingest/enqueue — daily enqueue + kick K worker chains"
```

---

## Task 6: `/api/ingest/worker` 路由(领取 → 跑 → done/fail → 自触发)

**Files:**
- Create: `app/api/ingest/worker/route.ts`

- [ ] **Step 1: 实现**

```ts
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db/supabase";
import { createSupabaseJobStore, claimNextJob, completeJob, failJob, utcRunDate } from "@/lib/ingest/jobs";
import { ingestTrackingObject, type IngestBrandInput } from "@/lib/ingest/run";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  return token === process.env.INGEST_SECRET || token === process.env.CRON_SECRET;
}

function selfInvoke(): void {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const secret = process.env.INGEST_SECRET ?? "";
  void fetch(`${base}/api/ingest/worker`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  }).catch(() => {});
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getServiceClient();
  const store = createSupabaseJobStore(db);
  const runDate = utcRunDate(new Date());
  const maxAttempts = Number(process.env.INGEST_MAX_ATTEMPTS ?? "3");

  const job = await claimNextJob(store, { runDate, maxAttempts });
  if (!job) return NextResponse.json({ processed: false, reason: "no_pending" });

  try {
    const { data, error } = await db
      .from("tracking_objects")
      .select("id, space_id, name, aliases, keywords, excluded_terms, languages, regions")
      .eq("id", job.tracking_object_id)
      .maybeSingle();
    if (error || !data) throw new Error(`load tracking_object: ${error?.message ?? "not found"}`);

    const brand: IngestBrandInput = {
      id: data.id as string,
      spaceId: data.space_id as string,
      name: data.name as string,
      aliases: (data.aliases as string[]) ?? [],
      keywords: (data.keywords as string[]) ?? [],
      excludedTerms: (data.excluded_terms as string[]) ?? [],
      languages: (data.languages as string[]) ?? [],
      regions: (data.regions as string[]) ?? [],
    };
    const result = await ingestTrackingObject(db, brand);
    await completeJob(store, job, { wrote: result.wrote });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "worker error";
    await failJob(store, job, { error: reason, maxAttempts });
  }

  // 还有可处理 job → 续跑
  const remaining = await store.countPending(runDate, maxAttempts);
  if (remaining > 0) selfInvoke();

  return NextResponse.json({ processed: true, jobId: job.id, remaining });
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
```

- [ ] **Step 2: tsc + 全量测试(确保未破坏)**

Run: `npx tsc --noEmit && npx vitest run` → clean / 全绿。

- [ ] **Step 3: 提交**

```bash
git add app/api/ingest/worker/route.ts
git commit -m "feat: /api/ingest/worker — claim, run via ingestTrackingObject, self-invoke"
```

---

## Task 7: cron 指向 enqueue

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: 改 cron path**

把 `vercel.json` 里 crons 的 `"path": "/api/ingest"` 改为 `"path": "/api/ingest/enqueue"`(schedule 不变 `0 0 * * *`)。旧 `/api/ingest` 路由保留不删。

- [ ] **Step 2: 校验 json + build**

Run: `npx tsc --noEmit && npm run build` → clean / 通过。

- [ ] **Step 3: 提交**

```bash
git add vercel.json
git commit -m "chore: point daily cron at /api/ingest/enqueue"
```

---

## Task 8: 迁移 `0008_ingest_jobs.sql`(草案,交账号层 apply)

**Files:**
- Create: `supabase/migrations/0008_ingest_jobs.sql`

> **协调**:迁移归账号层 DB 序列。此文件是草案,需账号层确认/apply。新增式、非破坏性。

- [ ] **Step 1: 写迁移 SQL**

```sql
-- 0008_ingest_jobs.sql — 每日抓取队列
create table if not exists public.ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  tracking_object_id uuid not null references public.tracking_objects (id) on delete cascade,
  space_id uuid not null,
  run_date date not null,
  status text not null default 'pending' check (status in ('pending','running','done','failed')),
  attempts int not null default 0,
  last_error text,
  wrote boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ingest_jobs_object_rundate_uniq
  on public.ingest_jobs (tracking_object_id, run_date);
create index if not exists ingest_jobs_status_rundate_idx
  on public.ingest_jobs (status, run_date);

alter table public.ingest_jobs enable row level security;
-- 仅 SELECT 策略(与内容表一致);写入用 service-role 绕过 RLS。
create policy "ingest_jobs select for space members" on public.ingest_jobs
  for select using (
    space_id in (select space_id from public.space_members where user_id = auth.uid())
  );
```

> 注:`space_members` 表名/列以账号层实际为准;apply 前请账号层核对 RLS 子查询(他们 0002/0003 的成员表结构)。若策略不确定,可先只建表 + 索引,RLS SELECT 策略由账号层补。

- [ ] **Step 2: 提交(仅文件,不执行)**

```bash
git add supabase/migrations/0008_ingest_jobs.sql
git commit -m "feat: 0008 ingest_jobs migration (draft, pending account-layer apply)"
```

---

## Task 9: 集成验证(队列机制 + 真实链路)

**Files:** 无代码改动。

- [ ] **Step 1: 前置** — 账号层 apply 0008;`.env.local` 含 `INGEST_SECRET`、`NEXT_PUBLIC_SITE_URL`、supabase service-role、GEMINI/DEEPSEEK。seed 2-3 个 tracking_objects(带 space_id)用于验链路。

- [ ] **Step 2: 队列机制本地验**(Gemini 国内不可达,搜索这步会失败,但**正好验重试/状态流转**):
  起 dev server(preview 工具)→ `POST /api/ingest/enqueue`(带 Bearer INGEST_SECRET)→ 查 `ingest_jobs`:应有 N 条 pending → 自触发 worker 跑起来 → 观察 job pending→running→(Gemini 失败)attempts 递增→重试→达上限 failed。**证明入队/领取/竞态/重试/自触发抽干全链路工作**(与搜索成功与否无关)。

- [ ] **Step 3: 真实成功验(Vercel)**:部署 `feature/ingest-queue`(或 merge 后)到 Vercel → 手动 `POST /api/ingest/enqueue` → 查 `ingest_jobs` 应逐步全部 `done`、内容表(editorial_briefs 等)新增对应记录(Gemini 在 Vercel 可达)。确认 K 条链并行、无单请求超时。

- [ ] **Step 4:** 验证通过后,更新 remaining 文档把 A1 标记完成(单独 docs 提交)。

---

## 协调说明
- **迁移 0008** 交账号层 apply / 并入序列(Task 8)。
- 端点 + jobs.ts + vercel.json 均在 `feature/ingest-queue`(off `edf4422`),归我;集成时 merge 回 main(= `edf4422`)。
- 安全:鉴权 INGEST_SECRET/CRON_SECRET;写库 service-role;错误脱敏不回显 key;fire-and-forget fetch 带 `.catch` 防 unhandled rejection。
- 规模实测要 C4 对象清单 seed。
