# Token 成本追踪设计（claude / gemini / codex / deepseek）

- 日期：2026-06-16
- 状态：设计待评审
- 目标：为每次 AI 调用记录 token 用量并换算成本（USD），按 provider / model 区分，用于后续成本报表。

## 背景

当前版本**完全没有** token 用量/成本的追踪机制：

- 实际接入的 provider 只有 2 家：Gemini（`lib/ingest/gemini-search.ts`）和 DeepSeek（`lib/ingest/deepseek-analyze.ts`、`lib/article/deepseek-article.ts`、`lib/production/deepseek-script.ts`）。
- 两家调用都**丢弃了 SDK 返回的 `usage` 对象**，只取 `text` / `choices[0].message.content`。
- 数据库 migration（`0001`–`0009`）没有任何用量/成本字段。

本设计新增数据层 + 计算逻辑，并为 4 家 provider（含尚未接入的 claude / codex）预留价格表。报表 UI 本轮**不做**，留待后续单独 spec。

## 决策（已与需求方确认）

1. **存储粒度**：每次 AI 调用写一行（`usage_logs` 表），不预聚合。
2. **价格来源**：代码常量表；**每行快照**调用时的单价与成本，价格表后续变动不影响历史数据。
3. **价格数字**：构建时通过 web search 查当前真实定价填入常量表（运行时仍读常量，不实时联网查价）。
4. **报表 UI**：本轮推迟，仅提供 `aggregateUsage()` 查询辅助。
5. **实现顺序**：先做价格层（pricing + cost + extract），再做持久化与接入。

## 架构总览

```
provider 调用 (lib/*)         返回 { value, usage }   ← 保持纯函数，不写库
        │
        ▼
action / route 层             有 space_id / user_id / operation 上下文
   ├─ extractUsage(provider, rawResponse) → TokenUsage
   ├─ computeCost(provider, model, usage) → { 单价快照, costUsd }
   └─ recordUsage(...)  → 插入 usage_logs（try/catch 包裹，失败不影响主流程）
```

设计原则：provider 库函数保持纯净，只额外返回归一化前的 usage；成本计算与落库放在已有 space/user 上下文的调用层。

## 组件

### 1. 价格常量 — `lib/usage/pricing.ts`

```ts
export type Provider = "claude" | "gemini" | "codex" | "deepseek";

export interface ModelPrice {
  inputPer1M: number;        // USD / 1M input tokens
  outputPer1M: number;       // USD / 1M output tokens
  cachedInputPer1M?: number; // 可选：缓存命中输入单价
  currency: "USD";
}

export const PRICING: Record<Provider, Record<string, ModelPrice>> = {
  claude: {
    "claude-opus-4-8":   { inputPer1M: 5.0,  outputPer1M: 25.0, cachedInputPer1M: 0.5,  currency: "USD" },
    "claude-sonnet-4-6": { inputPer1M: 3.0,  outputPer1M: 15.0, cachedInputPer1M: 0.3,  currency: "USD" },
  },
  gemini: {
    "gemini-3.5-flash":  { inputPer1M: 1.5,  outputPer1M: 9.0,  cachedInputPer1M: 0.15, currency: "USD" },
  },
  codex: {
    "gpt-5.2-codex":     { inputPer1M: 1.75, outputPer1M: 14.0, currency: "USD" },
    "gpt-5.3-codex":     { inputPer1M: 1.75, outputPer1M: 14.0, currency: "USD" },
    "codex-mini":        { inputPer1M: 0.75, outputPer1M: 3.0,  currency: "USD" },
  },
  deepseek: {
    "deepseek-v4-flash": { inputPer1M: 0.14, outputPer1M: 0.28, cachedInputPer1M: 0.0028, currency: "USD" },
  },
};
```

价格为 2026-06 web search 查得的真实定价（来源见文末）。`gemini-3.5-flash`（2026-05-19 发布）与 `deepseek-v4-flash`（2026-04 发布）均为真实模型，非占位。claude / codex 条目为未来接入预留，当前无调用方。

注：单价会随 provider 调价变动；新增模型需在此表登记，否则 `computeCost` 走未知模型兜底。

### 2. 用量归一化 — `lib/usage/extract.ts`

各 SDK 的 usage 字段不同，统一成：

```ts
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
}
```

| Provider | 原始字段 | 映射 |
|---|---|---|
| gemini | `response.usageMetadata.{promptTokenCount, candidatesTokenCount, totalTokenCount, cachedContentTokenCount}` | → TokenUsage |
| deepseek | `response.usage.{prompt_tokens, completion_tokens, total_tokens}`（`prompt_tokens_details.cached_tokens`） | → TokenUsage |
| claude（未来） | `response.usage.{input_tokens, output_tokens, cache_read_input_tokens}` | → TokenUsage |
| codex（未来） | OpenAI `response.usage.{prompt_tokens, completion_tokens}` | → TokenUsage |

`extractUsage(provider, rawResponse): TokenUsage | null`。字段缺失返回 `null`（不抛错）。

### 3. 成本计算 — `lib/usage/cost.ts`

```ts
export interface CostResult {
  inputPricePer1M: number;
  outputPricePer1M: number;
  costUsd: number;
  currency: "USD";
}

export function computeCost(
  provider: Provider, model: string, usage: TokenUsage
): CostResult | null;
```

- 公式：`costUsd = promptTokens/1e6 * inputPer1M + completionTokens/1e6 * outputPer1M`（若有 `cachedInputTokens` 且配置了 `cachedInputPer1M`，缓存部分按缓存单价、其余按标准输入单价）。
- 未知 `(provider, model)`：返回 `null`，`console.warn` 告警；调用方仍记录 token 数（`cost_usd = null`），**绝不因缺价格中断用户生成**。

### 4. 持久化

#### 4a. Migration — `supabase/migrations/00XX_usage_logs.sql`

```sql
create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references public.spaces(id) on delete set null,
  user_id  uuid references auth.users(id)  on delete set null,
  provider text not null check (provider in ('claude','gemini','codex','deepseek')),
  model text not null,
  operation text not null check (operation in
    ('ingest_search','ingest_analyze','article','production')),
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens      integer not null default 0,
  cached_input_tokens integer,
  input_price_per_1m  numeric,   -- 调用时单价快照
  output_price_per_1m numeric,
  cost_usd            numeric,   -- 计算结果快照；未知价格为 null
  currency text not null default 'USD',
  status text not null default 'success' check (status in ('success','error')),
  created_at timestamptz not null default now()
);

create index usage_logs_space_created_idx on public.usage_logs (space_id, created_at desc);
create index usage_logs_provider_model_idx on public.usage_logs (provider, model);

alter table public.usage_logs enable row level security;

-- 读：space 成员可读本 space 的记录（沿用现有 space 成员判定模式）
create policy usage_logs_select on public.usage_logs
  for select using ( /* space membership check, 参照现有 RLS 模式 */ );
-- 写：仅服务端 admin（service role）插入，无 client insert policy
```

space_id / user_id 可空：ingest 管线可能是系统任务、无登录用户。

#### 4b. 落库辅助 — `lib/usage/record.ts`

```ts
export async function recordUsage(input: {
  spaceId?: string; userId?: string;
  provider: Provider; model: string;
  operation: "ingest_search" | "ingest_analyze" | "article" | "production";
  usage: TokenUsage; status?: "success" | "error";
}): Promise<void>;
```

内部用 `lib/supabase/admin.ts` 的 service-role client；调用 `computeCost` 取单价/成本快照后插入。整体 try/catch，落库失败仅告警，不向上抛。

### 5. 接入 4 个调用点

provider 库函数改为额外返回归一化 usage，落库在调用层完成：

| 库函数 | 落库位置 | operation |
|---|---|---|
| `lib/ingest/gemini-search.ts` | `app/api/ingest/route.ts` | `ingest_search` |
| `lib/ingest/deepseek-analyze.ts` | `app/api/ingest/route.ts` | `ingest_analyze` |
| `lib/article/deepseek-article.ts` | `app/actions/generate-article.ts` | `article` |
| `lib/production/deepseek-script.ts` | `app/actions/generate-production.ts` | `production` |

库函数签名由返回 `value` 改为 `{ value, usage }`（或 `{ value, rawUsage }`，由调用层 `extractUsage`）。

### 6. 报表查询辅助（本轮仅占位）— `lib/usage/aggregate.ts`

```ts
// 本轮仅设计，UI 后续 spec
export async function aggregateUsage(filter: {
  spaceId?: string; from?: Date; to?: Date;
  groupBy: ("provider" | "model" | "operation" | "day")[];
}): Promise<Array<{ key: Record<string,string>; totalTokens: number; totalCostUsd: number; calls: number }>>;
```

## 错误处理

- 缺 usage 字段 → `extractUsage` 返回 null → 跳过落库（告警）。
- 未知价格 → 记录 token 数、`cost_usd = null`、告警。
- 落库异常 → try/catch 吞掉 + 告警，绝不影响用户生成主流程。

## 测试

- `pricing` 查表：已知/未知 model。
- `cost`：标准计费、含缓存 token 计费、未知模型返回 null 的快照正确性。
- `extract`：gemini / deepseek 两种 SDK 形状归一化（claude / codex 形状可加单测预埋）。
- `record`：插入一行、字段快照正确、落库失败被吞且告警。
- 更新现有 4 个调用点的测试，断言返回 `usage`。

## 实现顺序

1. **价格层**（先做）：`pricing.ts` → `extract.ts` → `cost.ts` + 单测。
2. 持久化：migration + `record.ts` + RLS。
3. 接入 4 个调用点 + 更新调用点测试。
4. `aggregate.ts` 查询辅助（占位）。

## 待办 / 风险

- **价格需上线前复核**：单价会变动，且 codex / claude 尚无真实调用方，其条目为预留。
- claude / codex 真正接入时，需确认实际使用的具体 model 字符串并在 `PRICING` 登记。
- RLS 的 space 成员判定需对齐现有 migration 中既有策略写法。

## 价格来源（2026-06 web search）

- Gemini 3.5 Flash：[devtk.ai](https://devtk.ai/en/models/gemini-3-5-flash/)、[OpenRouter](https://openrouter.ai/google/gemini-3.5-flash)
- DeepSeek V4 Flash：[devtk.ai](https://devtk.ai/en/models/deepseek-v4-flash/)、[morphllm.com](https://www.morphllm.com/deepseek-v4)
- Claude Opus 4.8 / Sonnet 4.6：[cloudzero.com](https://www.cloudzero.com/blog/claude-opus-4-8-pricing/)、[metacto.com](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)
- OpenAI Codex（GPT-5.2/5.3 Codex、Codex Mini）：[OpenAI](https://developers.openai.com/codex/pricing)、[pricepertoken.com](https://pricepertoken.com/pricing-page/model/openai-gpt-5.2-codex)
