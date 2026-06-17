# 设计:追踪对象弹窗的主题 + 对象自适应文案

日期:2026-06-16
状态:已批准,实现中

## 背景与目标

「新增追踪对象」弹窗(`add-tracked-dialog.tsx`)的辅助文案目前是静态的(已去航空航天化、改为通用)。
希望它:

1. **结合空间主题适配** —— 新建空间时填的「内容主题」(`spaces.theme`,自由文本)体现在文案里。
2. **随对象自适应** —— 空间陆续新增真实关注对象后,placeholder 示例取自这些真实对象。

无 LLM、无主题字典、无 autocomplete。纯数据驱动 + 主题字符串插值。两个输入(主题、对象列表)
在弹窗渲染处都已是客户端可得(`useSpaceSession` / `useWorkflow`),不需要新增服务端调用。

## 已确认的决策

- 有主题、无对象:主题轻量织进**标题**,placeholder 仍用通用文案。
- 有对象:placeholder 取自空间里**真实对象**的字段。
- 二者可叠加;都没有时 = 当前通用文案(不变)。
- 所有 locale 文案必须留在 `copy.ts`(满足 i18n 守卫:en/zh key 集对齐、英文字典无 CJK;函数豁免 CJK 检查)。

## 组件与数据流

### 1. 新增 copy key(`lib/i18n/copy.ts` 的 `dialogs.addTracked`,中英文都加)

- `titleThemed: (theme: string) => string`
  - zh:`添加一个新的「${theme}」追踪对象`
  - en:`Add a new "${theme}" tracked object`
  - 函数 → i18n 守卫的 CJK 检查豁免;`keyPaths` 仍要求两 locale 都有此 key。
- `egPrefix: string` —— zh `例：` / en `e.g. `(派生 placeholder 的前缀;英文无 CJK,守卫通过)。

### 2. 纯函数 `lib/workbench/adaptive-add-copy.ts`

```
interface AdaptiveAddFields {
  title: string;
  nameZhPlaceholder: string;
  nameEnPlaceholder: string;
  trackPlaceholder: string;
  hqPlaceholder: string;
  keywordsPlaceholder: string;
}

buildAdaptiveAddCopy(input: {
  base: AdaptiveAddFields & { titleThemed: (t: string) => string; egPrefix: string };
  theme?: string | null;
  objects: TrackingObject[];
  locale: Locale;   // 预留;当前逻辑不依赖,文案差异已由 base 承载
}): AdaptiveAddFields
```

逻辑:

1. `theme?.trim()` 非空 → `out.title = base.titleThemed(theme.trim())`;否则保留 `base.title`。
2. `objects.length > 0`:
   - `recent = [...objects].sort((a,b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))`
   - `ex = recent[0]`;`p = base.egPrefix`
   - `display = ex.nameZh?.trim() || ex.name?.trim()`;非空 → `nameZhPlaceholder = p + display`
   - `ex.name?.trim()` 且 `!= display` → `nameEnPlaceholder = p + ex.name.trim()`
   - `ex.primaryTrack?.trim()` → `trackPlaceholder = p + …`
   - `ex.countryOrRegion?.trim()` → `hqPlaceholder = p + …`
   - `kwObj = recent.find(o => (o.keywords?.length ?? 0) > 0)` → `keywordsPlaceholder = p + kwObj.keywords.slice(0,4).join(", ")`
   - 任一源字段为空 → 该 placeholder 保留 base 值。
3. 返回 `out`(只含 `AdaptiveAddFields` 六个字段)。

helper 不含任何硬编码 locale 文案 → i18n 守卫不受影响。

### 3. 接线

- `app-frame.tsx`:`const session = useSpaceSession();`
  `const spaceTheme = session.mySpaces.find(s => s.space.id === session.currentSpaceId)?.space.theme ?? "";`
  给 `<AddTrackedDialog>` 传 `spaceTheme`、`existingObjects={store.state.trackingObjects}`、`locale`。
- `add-tracked-dialog.tsx`:新增 props `spaceTheme?: string`、`existingObjects: TrackingObject[]`、`locale: Locale`。
  `const base = useCopy().dialogs.addTracked;`
  `const a = buildAdaptiveAddCopy({ base, theme: spaceTheme, objects: existingObjects, locale });`
  标题用 `a.title`,五个 placeholder 用 `a.*`,其余字段(kicker / labels / 按钮 / sub 等)仍用 `base.*`。

## 行为矩阵

| 空间状态 | 标题 | placeholder |
|---|---|---|
| 有主题、无对象 | `titleThemed(theme)` | 通用 |
| 无主题、有对象 | 通用 | 取自真实对象 |
| 有主题、有对象 | `titleThemed(theme)` | 取自真实对象 |
| 都没有 | 通用 | 通用 |

## 错误处理 / 边界

- `theme` 为 `null`/空白 → 不改标题。
- `objects` 为空 → 不改 placeholder。
- 对象字段为空 → 对应 placeholder 回退到通用值。
- helper 为纯函数、无副作用;输入只读(用 `[...objects]` 复制后排序)。

## 测试

`tests/unit/adaptive-add-copy.test.ts`:

- 有主题无对象:title 变、placeholder 不变。
- 无主题有对象:title 不变、placeholder 取自对象(name/track/hq/keywords)。
- 有主题有对象:二者叠加。
- 都没有:全部 = base。
- 对象字段缺失(无 keywords / 空 track):对应 placeholder 回退 base。
- 取最近更新对象(updatedAt 排序);关键词取最近一个有关键词的对象。
- en / zh:`egPrefix`、`titleThemed` 走对应 locale 的 base。

i18n key-set 守卫(已有)自动覆盖新增的 `titleThemed` / `egPrefix` 两 locale 对齐。

## 范围外(YAGNI)

- 不引入 LLM / 主题字典 / autocomplete。
- 不动其它弹窗或页面文案。
- 不改对象的增删/订阅逻辑。
