# 候选信号卡片：重新生成简报（↻ icon）

日期：2026-06-17 · 分支：`fix/regenerate-brief`

## 背景与目标

候选信号卡片在「已生成简报」时只提供「查看已生成简报」。用户有时对生成结果不满意，
希望能就地重跑一次 AI 生成（DeepSeek + x-search 核查），用新结果**覆盖**旧简报，并持久化。
本特性在卡片上加一个轻量 ↻ icon 按钮表达「重新生成」。

非目标：不处理「已进入筛选/选题库」的简报的特殊回收（见下「已知取舍」）。

## 设计（A–E，已获用户认可）

### A. UI — `components/workbench/signal-strip.tsx`
- 新增 prop `onRegenerate(signalId: string): void`（与 `onGenerate` 一样必填）。
- `hasBrief` 分支：保留「查看已生成简报」按钮，在其旁加一个小 ↻ icon 按钮（重新生成）。
- 该信号 id 在 `generatingIds` 里时：icon 旋转 + `disabled`（与现有 loading 一致）。
- 文案走字典 `t.workbench.signals.regenBrief`（en/zh），作为 `title` + `aria-label`，不硬编码中文。

### B. 动作 — `components/workbench/workflow-provider.tsx`
- store 新增 `regenerateBrief(signalId): Promise<void>`。
- 流程镜像 `generateBrief` 的「实时调 AI」分支：
  1. 找到 signal 与既有 brief；若无既有 brief 则回退到 `generateBrief`。
  2. `setGeneratingBriefIds` 加入该 id；调 `generateBriefAction`（DeepSeek + 来源核查），失败回退模板并记 warning。
  3. 在 `setState` 中：先用 `stripBrief(current)` 移除该信号的旧 brief + 其评分，再
     `generateBriefForSignal(stripped, signalId, { ai, verification })`。因 brief id 为确定式
     `brief-${signalId}`，重生成沿用同一 id。
  4. 成功记 `L.aiBriefRegenerated(headline)` 日志，展开该简报。
  5. 持久化覆盖：用 `stripBrief(state)` 重算 draft（避免闭包里的旧 state 触发短路），调 `persistGeneratedBrief`。

### C. 内存覆盖
- `stripBrief(s)`：移除 `editorialBriefs` 中 `candidateSignalId === signalId` 的项，及 `contentValueScores`
  中其 `editorialBriefId` 对应的评分；无旧 brief 时原样返回。

### D. DB 覆盖 — `lib/account/content-mutations.ts` `persistGeneratedBrief`
- 在 insert 之前，先删除该 `(candidate_signal_id, space_id)` 的旧 `editorial_briefs`
  （FK `on delete cascade` 连带删 `content_value_scores`）。
- 该「先删后插」对首次生成是 no-op（无旧行），对重生成是覆盖；统一一条路径，
  顺带修掉 0005 放宽唯一约束后重复 insert 的隐患。

### E. 接线 — `components/workbench/workbench.tsx`
- `onRegenerate={store.regenerateBrief}` 传给 `<SignalStrip>`。

## 文案（`lib/i18n/copy.ts`，en + zh）
- `workbench.signals.regenBrief`：en `"Regenerate brief"` / zh `"重新生成简报"`。
- `log.aiBriefRegenerated(headline)`：en `"AI brief regenerated · ${headline}"` /
  zh `"AI 简报已重新生成 · ${headline}"`。

## 样式（`app/globals.css`）
- `.signal-actions`：flex 行，`gap`，`align-self: flex-start`，承载「查看简报」+ ↻。
- `.regen-brief`：紧凑透明 icon 按钮，主题色；`:disabled` 半透明；`.spinning` 旋转动画。

## 已知取舍
- 若被重生成的简报已进入筛选/选题库：DB 侧因级联会一并删除其 `screening_decisions` /
  `topic_cards`；内存侧仅移除 brief+评分。重生成定位为「定稿前重做」，此边界不特殊处理。
- 持久化失败只记 warning（与 `generateBrief` 一致），内存结果仍可见。

## 验证
- `tsc --noEmit`、`eslint`、`vitest`（含 i18n 守卫：无硬编码中文 + en/zh 键齐平）。
- 不做 `vercel --prod`；推分支，后续按 main 自动部署约定走。
