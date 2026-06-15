# A1 · 抓取并行/分批(Supabase 队列 + 自触发 worker)— 设计 (2026-06-15)

> 让"每日定时抓取"从 1 个监控对象扩展到 50-100 个,而不触碰 Vercel 函数 60s 上限。隶属 news-ingestion 抓取侧(remaining 文档 A1,🔴 上规模必做)。
> 分支:`feature/ingest-queue`(off `edf4422` 集成 tip)。

## 0. 一句话
现在 `/api/ingest` 在**一次请求里串行跑完所有对象**(单对象 ~57s,Vercel Hobby 60s 上限 → 2 个就超时)。改为:**cron 把每个对象入队到 Supabase `ingest_jobs` 表 → 自触发 worker 每次领 1 个 job 跑(复用 `ingestTrackingObject`)→ 还有 pending 就 fetch 自己续跑**;开 K 条并行链加速。队列给持久化 + 重试 + 可观测。

## 1. 背景与约束
- 单对象 ~57s(Gemini grounding 搜 + DeepSeek 分析 + 写 Supabase);Vercel Hobby 函数硬上限 60s(`maxDuration=300` 在 Hobby 被压到 60)。
- 现状 `app/api/ingest/route.ts`:加载 `tracking_objects` → 分页加载 seen urls → `for` 串行 `runIngestForBrand` + `writeIngestResult`。1 对象没问题,N 对象必超时。
- 已有积木:`ingestTrackingObject(db, brand)`(`lib/ingest/run.ts`)= 对单对象跑完整流水线并写库,返回 `{wrote, reason?}`。worker 直接调它。
- 不引第二套栈/付费队列;复用 Supabase(账号层已在用)。

## 2. 架构与数据流
```
Vercel Cron(每日 0 0 * * *) → POST /api/ingest/enqueue   (鉴权 CRON_SECRET/INGEST_SECRET)
  1. 读所有 tracking_objects(id, space_id, …)
  2. 每个对象 upsert 一条 ingest_jobs(status=pending, run_date=今天 UTC)
     幂等:唯一 (tracking_object_id, run_date) → 重复触发不重复入队
  3. 入队完,fire-and-forget 踢 K 条 worker 链:K 次并发 fetch(/api/ingest/worker)(带 secret)
  4. 立即返回 {enqueued: N, kicked: K}

POST /api/ingest/worker  (鉴权;自触发)
  1. 原子领取 1 个可处理 job(乐观锁,见 §4)→ 抢不到任何 job 则结束
  2. 加载该对象完整字段 → ingestTrackingObject(admin, brand)
  3. 成功:job.status=done, wrote 记录;失败:attempts++、last_error,
     attempts<MAX_ATTEMPTS 置回 pending(下轮重试)否则 failed
  4. 若仍有可处理 job → fire-and-forget fetch(/api/ingest/worker) 续跑;否则结束
```
- **并行**:每个 invocation 只处理 1 个对象(单对象 ~57s,塞不下第二个 < 60s)。靠 §3 的 K 条链并行。K=4 时 100 对象约 25 分钟抽干。
- enqueue 必须**快**(只插表 + 踢链,不跑流水线),稳在 60s 内。

## 3. 配置(env,带默认)
- `INGEST_WORKER_CONCURRENCY`(K)默认 **4** — 并行 worker 链数。
- `INGEST_MAX_ATTEMPTS` 默认 **3** — 单 job 最大尝试次数。
- `INGEST_WINDOW_DAYS` 默认 **7**(沿用现有)。
- worker 自触发与 enqueue 踢链,URL 用 `NEXT_PUBLIC_SITE_URL`(已存在);鉴权头带 `INGEST_SECRET`。

## 4. `ingest_jobs` 表(迁移 `0008_ingest_jobs.sql`)
> **协调点**:迁移归账号层 DB 序列(他们在 0007)。本设计给出 SQL,**由账号层 apply / 或确认后并入序列**,我方不擅自动库。新增式、非破坏性。

字段:
- `id uuid pk default gen_random_uuid()`
- `tracking_object_id uuid not null`(FK tracking_objects.id)
- `space_id uuid not null`(stamp,与内容表一致)
- `run_date date not null`(入队当天 UTC)
- `status text not null default 'pending'`(`pending|running|done|failed`)
- `attempts int not null default 0`
- `last_error text`
- `wrote boolean`(成功时是否真写了内容)
- `created_at timestamptz default now()` / `updated_at timestamptz default now()`
- **唯一索引** `(tracking_object_id, run_date)` — 幂等入队
- 索引 `(status, run_date)` — 领取查询

RLS:沿用内容表策略(仅 SELECT 策略,**写入用 service-role 绕过**);worker/enqueue 都用 service-role client。

## 5. 原子领取(无需扩展/RPC)
乐观锁,纯 supabase-js,**不需要 FOR UPDATE / pgmq / 任何扩展**:
1. `select id from ingest_jobs where status='pending' and run_date=today and attempts < MAX order by created_at limit 1`
2. `update ingest_jobs set status='running', attempts=attempts+1, updated_at=now() where id=$1 and status='pending' returning *`
3. 若 update 返回 0 行(被别的链抢走)→ 回到 1 取下一个;连续抢空/无 pending → 结束。
最多重试取几次避免活锁。`running` 卡死兜底:领取查询可额外捞 `status='running' and updated_at < now()-interval '5 min'`(僵尸 job 回收),本期可选。

## 6. 复用与改造
- **worker 核心** = 现成 `ingestTrackingObject(admin, brand)`,流水线(gemini-search/deepseek-analyze/pipeline/ingest-writer)**一行不改**。
- 新增 `lib/ingest/jobs.ts`:纯逻辑 + 可注入 db —— `enqueueDailyJobs(db, {runDate})`、`claimNextJob(db, {runDate, maxAttempts})`、`completeJob(db, id, {wrote})`、`failJob(db, id, {error, maxAttempts})`、`countPending(db, runDate)`。可单测(注入 mock db)。
- 新增 `app/api/ingest/enqueue/route.ts` 与 `app/api/ingest/worker/route.ts`(薄 HTTP 壳,调 lib/ingest/jobs + ingestTrackingObject)。
- `vercel.json` cron 从 `/api/ingest` 改指向 `/api/ingest/enqueue`。
- **旧 `/api/ingest` 保留**(向后兼容 / 小规模手动整跑用),不删;文档标注新路径为生产路径。

## 7. 错误处理 / 幂等
- 单对象失败不影响其他:worker 只标该 job failed/retry,继续。
- 内容写入幂等已由 writer 的 `dedupe_key` 保证;同一对象当天重试不会重复写内容。
- 入队幂等由唯一约束保证。
- 鉴权失败 / 缺 secret → 401,不泄露。错误信息脱敏(不回显 key)。
- fire-and-forget 的 fetch 不 await 结果(避免阻塞),但要 `.catch` 吞掉防止 unhandled rejection。

## 8. 测试
- `tests/ingest/jobs.test.ts`(注入 mock db):enqueue 幂等(重复不重复插)、claimNextJob 领取并置 running、抢占冲突回退、completeJob/failJob 状态流转、attempts 达上限置 failed。
- 端点壳薄(网络副作用),不单测;靠 lib 单测 + 一次本地/Vercel 小规模 e2e(seed 2-3 个对象,跑 enqueue→worker 链,查 jobs 表全 done)。
- 全绿 + tsc + build。

## 9. 协调 / 前置
- **迁移 0008** 需账号层并入序列(新增式)。我给 SQL,他们 apply 或确认。
- **规模实测需 C4**:用户提供 50-100 对象清单并 seed(带 space_id)。架构可先建并用少量对象验链路。
- 分支 `feature/ingest-queue` off `edf4422`;集成时 merge 回 main(= edf4422)。

## 10. 非目标(YAGNI)
- 不引 pgmq / QStash / Inngest / 第三方队列。
- 不做优先级队列 / 延迟队列 / 实时进度推送(查 jobs 表即可)。
- 不改流水线内部(搜索/分析/打分/写库)。
- 不做 Vercel Pro 依赖(自触发链在 Hobby 即可);僵尸 job 回收为可选增强。
