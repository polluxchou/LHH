-- 0011_usage_logs.sql — 每次 AI 调用的 token 用量与成本快照
-- 新增式、非破坏性。写入走 service-role（绕过 RLS）；读策略与 0003/0008 一致。
-- 沿用 0002 的 security-definer helper is_space_member / is_space_owner（避免在 space_members 上递归 RLS）。

create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references public.spaces (id) on delete set null,
  user_id  uuid references auth.users (id)   on delete set null,
  provider text not null check (provider in ('claude','gemini','codex','deepseek')),
  model text not null,
  operation text not null check (operation in ('ingest_search','ingest_analyze','article','production')),
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cached_input_tokens integer,
  input_price_per_1m numeric,   -- 调用时单价快照
  output_price_per_1m numeric,
  cost_usd numeric,             -- 计算结果快照；未知价格为 null
  currency text not null default 'USD',
  status text not null default 'success' check (status in ('success','error')),
  created_at timestamptz not null default now()
);

create index if not exists usage_logs_space_created_idx on public.usage_logs (space_id, created_at desc);
create index if not exists usage_logs_provider_model_idx on public.usage_logs (provider, model);

alter table public.usage_logs enable row level security;

-- 仅 SELECT 策略（space_id 可空，需先判非空）；写入由 service-role 绕过 RLS。
drop policy if exists usage_logs_space_read on public.usage_logs;
create policy usage_logs_space_read on public.usage_logs
  for select using (
    space_id is not null and (is_space_member(space_id) or is_space_owner(space_id))
  );
