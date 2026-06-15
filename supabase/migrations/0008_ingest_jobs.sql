-- 0008_ingest_jobs.sql — 每日抓取队列(A1)
-- 草案:迁移归账号层 DB 序列,apply 前请账号层核对 RLS 成员子查询(space_members 表名/列以实际为准)。
-- 新增式、非破坏性。

create table if not exists public.ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  tracking_object_id uuid not null references public.tracking_objects (id) on delete cascade,
  space_id uuid not null,
  run_date date not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  wrote boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 幂等入队:同一对象同一天只一条
create unique index if not exists ingest_jobs_object_rundate_uniq
  on public.ingest_jobs (tracking_object_id, run_date);

-- 领取查询:按 (status, run_date) 过滤
create index if not exists ingest_jobs_status_rundate_idx
  on public.ingest_jobs (status, run_date);

alter table public.ingest_jobs enable row level security;

-- 仅 SELECT 策略,与 0003 content 表一致:复用 0002 的 security-definer helper
-- is_space_member / is_space_owner(避免在 space_members 上递归 RLS)。写入由
-- worker/enqueue 用 service-role 绕过 RLS。
create policy ingest_jobs_space_read on public.ingest_jobs
  for select using (is_space_member(space_id) or is_space_owner(space_id));
