# Spec — 分镜旁白由脚本派生（脚本为唯一来源）

日期：2026-06-17
作者会话：本会话（ProductionStudio / 生成视频）
状态：待用户评审

---

## 1. 背景与问题

ProductionStudio（生成视频）的「脚本」与「分镜」由同一次 DeepSeek 调用一起产出（[generateProduction](../../../lib/production/deepseek-script.ts)），prompt 强制每个分镜的 `voiceOver` 是脚本正文按时间顺序切分后的逐字原文。生成那一刻两者一致。

但二者在 `ProductionPackage` 里是**两个独立字段**（`script.sections[]` 与 `storyboard[].voiceOver`），各自可编辑、"修改会保留"。改脚本不会同步分镜旁白，反之亦然 → **会漂移**。

用户结论：脚本既然就是旁白，分镜旁白应始终等于脚本，不应是可独立漂移的副本。

## 2. 目标 / 非目标

**目标**
- 脚本（`script.sections`）成为旁白的**唯一来源**。
- 分镜「旁白」列**只读**，由脚本自动派生；改脚本即同步、永不漂移。
- 保证：所有镜头旁白按顺序拼接 == 脚本全文（逐字）。
- 分镜的 `shot`（镜头描述）/ `visual`（画面·B-ROLL）/ `notes`（备注）/ `time`（时长）仍可编辑。
- 标题卡/转场卡等「无人声」镜头显示「（无）」，不占用脚本文本。

**非目标**
- 不改脚本本身的生成逻辑/段落结构（仍是 hook/context/core/close 四段）。
- 不做分镜旁白的手工覆写（用户已选择"旁白全只读"）。
- 不改 task（视频任务）页签。

## 3. 核心设计：派生规则

新增纯函数 `deriveVoiceOvers(script, shots): string[]`（每个镜头一条旁白）：

1. 把 `script.sections` 各 `body` 按句子边界切成有序句子序列 `S`（句末标点：。！？；以及换行；保留标点）。
2. 选出**非静音镜头**（`silent !== true`）按 `n` 升序排列。
3. 按每个非静音镜头的 `time` 解析出时长权重 `w_i`（"0:24-0:36" → 12 秒；解析失败则等权）。
4. 按权重比例把句子序列 `S` **依次、在句子边界处**分配给各非静音镜头：累计目标字数 = 该镜头权重占比 × 总字数；逐句填入直到达到该镜头目标，余下进下一镜头。最后一个非静音镜头兜底收掉剩余所有句子。
5. 静音镜头旁白 = `"（无）"`（中文）/ `"(none)"`（英文，走 copy 字典）。
6. 返回顺序与 `shots` 对齐的 `string[]`。

**不变量（单测保证）**：`非静音镜头旁白按 n 顺序拼接（去掉空白）== 脚本 sections.body 顺序拼接`。

**取舍**：句子+时长比例的确定性切分，分句结果可能与 AI 原始艺术性切分略有差异，但永远一致、可预测、可复现。这是换取"永不漂移 + 改脚本即同步"的代价（用户已认可）。

**边界**：
- 句子数 < 非静音镜头数：靠后的镜头分到空 → 该镜头旁白置 `"（无）"`（视作无人声，不报错）。
- 全部镜头都静音 / 脚本为空：全部 `"（无）"`。

## 4. 数据模型改动

`lib/domain/production.ts`：
```ts
export interface StoryboardShot {
  n: number;
  time: string;
  shot: string;
  voiceOver: string;      // 语义变更：派生缓存值（始终由 deriveVoiceOvers 写入，UI 只读）
  visual: string;
  notes: string;
  silent?: boolean;       // 新增：无人声镜头（标题卡/转场卡）。缺省 false
}
```
`voiceOver` 字段保留（导出 .md / 存储仍需文本），但不再由用户直接编辑，始终是派生结果的缓存。`silent?` 可选，向后兼容旧数据（缺省视为非静音）。

## 5. 写入时机（何时重算）

旁白在**脚本或静音标记变化时**重算，保证存储里的 `voiceOver` 永远是最新派生值：

- **生成时**（`generateProduction`）：解析 AI 输出后，把 AI 给 `voiceOver` 为「（无）」/空 的镜头标记 `silent = true`，随后跑 `deriveVoiceOvers` 覆盖所有 `voiceOver`，确保出厂即一致。
- **改脚本段**（`updateScriptSection`，lib/workflow/local-workflow.ts）：更新 section 后，对该 brief 的 production draft 重算 `storyboard[].voiceOver`。
- **切换镜头静音 / 改时长**（`updateStoryboardShot`）：因为静音集合与权重变了，重算 `voiceOver`。
- `updateStoryboardShot` 不再接受对 `voiceOver` 的写入（patch 中忽略该字段）。

实现建议：把重算收敛到 local-workflow 里一个内部 helper `recomputeStoryboardVoiceOvers(draft)`，上述三处调用它，避免逻辑分散。

## 6. UI 改动（components/workbench/production-studio.tsx）

- 「旁白」列改为**只读文本**（移除该列的双击编辑 / 不纳入可编辑字段）。
- 每行新增**静音切换**（勾选框或图标，标记「无人声 / 标题卡」），切换即触发重算。
- 顶部提示语更新（copy 字典，en+zh）：从"双击行可编辑，修改会保留"改为说明"旁白由脚本自动生成、只读；镜头描述/画面/备注/时长可编辑；可标记无人声镜头"。
- 「脚本」页签编辑 section 后切到「分镜」页签，旁白应已同步（同一 draft 状态）。

## 7. i18n（lib/i18n/copy.ts）

新增/调整（en+zh，key 对齐，守卫测试把关）：
- 分镜顶部提示语文案。
- 「无人声」标记的标签 + 「（无）」/「(none)」占位（派生函数取自 copy 或由 UI 注入，避免在 domain 层硬编码中文——`deriveVoiceOvers` 接收一个 `noneLabel` 参数，由调用方传入本地化字符串；服务端生成默认用中文「（无）」）。

## 8. 测试

`tests/production/derive-voiceovers.test.ts`（新增）：
- 拼接不变量：非静音镜头旁白拼接 == 脚本拼接。
- 静音镜头返回「（无）」、不占文本。
- 按时长比例切分：长镜头分到更多句子。
- 句子边界：不在句中截断。
- 边界：句子数 < 非静音镜头数；空脚本；全静音。
- `recomputeStoryboardVoiceOvers`：改 section 后旁白更新；切静音后重算。

既有 production 测试（若有引用 voiceOver 可编辑的断言）相应更新。

## 9. 影响面 / 风险

- 旧 production draft（无 `silent` 字段、voiceOver 为手工值）：首次进入或下次重算时被派生值覆盖 —— 可接受（用户要的就是以脚本为准）。fixtures 里 `b-cna-01` 精品包作为 few-shot 范本：其 `storyboard.voiceOver` 仍可保留为静态文本（范本不经过派生），不受影响；但若范本镜头无 `silent` 字段也没关系（缺省非静音）。
- `deepseek-script.ts` 用 `b-cna-01` 做 exemplar：派生逻辑不动 exemplar 文本，only 运行时 draft 走派生。
- 多会话共享工作树：本特性从 main 起**独立分支 / worktree**，与已合并分支隔离；落地后单独开 PR。

## 10. 验收

- 生成视频后：分镜旁白拼接 == 脚本全文；标题卡显示「（无）」。
- 改任一脚本段文字 → 切到分镜页签，对应镜头旁白同步更新。
- 旁白列不可编辑；镜头描述/画面/备注/时长仍可编辑；可勾选某镜为无人声并即时重算。
- `tsc` 0、新增单测全过、`next build` 通过。
