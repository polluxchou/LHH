# 设计:手动删除自己添加的追踪对象

日期:2026-06-15
状态:已批准,实现中

## 背景与目标

工作台支持通过「新增对象」把追踪对象(`tracking_objects`)加入空间,但**无法删除**。
用户希望能手动删除**自己添加的**追踪对象。

当前约束:

- `tracking_objects` 表原本**没有记录是谁添加的**(无 `created_by`),因此"自己添加的"
  无法区分。已通过新列 `created_by` 解决(见迁移)。
- 删除一个追踪对象会**级联**:`search_runs`、`candidate_signals`、`editorial_briefs`、
  `space_subscriptions`、`ingest_jobs` 均 `on delete cascade`。即删对象会一并清掉它的
  信号、已生成简报、所有人对它的订阅、搜索/采集记录。

## 已确认的决策

1. **删除语义**:硬删除该对象(连级联数据),不是取消关注、也不是软删除。
2. **权限**:对象的**创建者**,或当前空间的**管理员 / 所有者**,可删除。
3. **级联安全**:允许删除,但点击后弹**确认框**,明确写出将一并删除的数量
   (N 条信号 · M 份简报 · K 个订阅者),用户确认后才硬删。
4. 既有/演示/团队种子对象 `created_by = null` → **不可删除**(保护既有数据)。

## 数据库

迁移 `supabase/migrations/0009_tracking_object_created_by.sql`(**已在线上手动执行**,
文件仅用于仓库一致性):

```sql
alter table tracking_objects
  add column if not exists created_by uuid references auth.users(id) on delete set null;
```

- 可空列,非破坏性,可重复执行。
- 不改 RLS:写入仍走 service-role(action 内校验成员/权限);`created_by` 随既有
  member/owner 读策略对成员可读。
- `on delete set null`:删用户不连带删对象,只把归属置空。

## 组件与数据流

### 1. 权限纯函数(可测,前后端共用)

`lib/workflow/can-delete-tracking-object.ts`

```
canDeleteTrackingObject({ createdBy, userId, role, isOwner }): boolean
  = createdBy != null && createdBy === userId
    || role === "admin"
    || isOwner === true
```

- 前端:决定是否显示删除按钮。
- 后端:action 内**再校验一次**(权威),不信任前端。

### 2. 域类型

`lib/domain/types.ts`:`TrackingObject` 增加 `createdBy: string | null`。

### 3. 读取路径

- `lib/account/content-queries.ts` `getSpaceContent`:映射 `createdBy: r.created_by ?? null`。
- `lib/workflow/build-space-state.ts`:DB 对象透传 `createdBy`;demo/fixture 对象保持 `null`。

### 4. 写入路径(落创建者)

`lib/account/content-mutations.ts` `addTrackingObjectToSpace`:insert 时带
`created_by: userId`(用 `createSupabaseServerClient().auth.getUser()` 取,与
`setSubscription` 一致)。

### 5. 服务端 action

`lib/account/content-mutations.ts` `deleteTrackingObject(spaceId, trackingObjectId): Promise<void>`

1. `getMySpaces()` → 非成员 throw `forbidden`,同时拿到该空间的 `role` / `isOwner`。
2. 用 admin client 读该对象的 `created_by` 与 `space_id`(校验属于该空间)。
3. 取当前 `userId`(server client `auth.getUser()`)。
4. `canDeleteTrackingObject({ createdBy, userId, role, isOwner })` 为 false → throw `forbidden`。
5. `admin.from("tracking_objects").delete().eq("id", id).eq("space_id", spaceId)`;级联由 FK 处理。

### 6. 客户端 store

- `lib/workflow/local-workflow.ts` 新 reducer `removeTrackingObject(state, trackingObjectId)`:
  - 从 `trackingObjects` 移除该对象;
  - 从每个 `teamMembers[].trackingObjectIds` 移除该 id;
  - 清理本地关联数据(`candidateSignals`、`editorialBriefs`、`searchRuns` 中
    `trackingObjectId === id` 的项),保持本地状态自洽;
  - 若 `selectedTrackingObjectId === id`,改选其余第一个。
- `components/workbench/workflow-provider.tsx` 新 action `removeTracked(id)`:
  乐观调用 `removeTrackingObject` reducer → 调 `deleteTrackingObject(spaceId, id)` →
  成功 `router.refresh()`;失败回滚(重新 `router.refresh()` 拉回权威状态)+ 写错误日志。
  镜像现有 `addTracked` 的"持久化后刷新"模式。

### 7. UI

`components/workbench/views/tracked-manage-view.tsx`:

- 操作列在「查看 / 订阅」旁加 **🗑 删除** 按钮,仅 `canDeleteTrackingObject(...)` 为 true 时显示。
  当前用户 id 与角色来自 `useSpaceSession()`(`userId` / `currentRole` / `isOwnerOfCurrent`)。
- 点击 → 打开**确认框**(本视图内的轻量模态,样式与 `add-tracked-dialog` 一致),
  文案写明对象名 + 将一并删除的 `N 条信号 · M 份简报 · K 个订阅者`(数量来自
  `getSignalCounts` / `briefCounts` / `subscribers`)。
- 确认 → 调 `store.removeTracked(id)`,关闭弹窗;取消 → 仅关闭。
- 范围:**只在管理页**提供删除;侧栏 `tracked-list` 不放,避免误删。

## 错误处理

- action 任何失败抛错;`removeTracked` catch 后 `router.refresh()` 拉回权威状态并写
  workflow 错误日志(同 `addTracked`)。
- 前端按钮可见性仅为体验;真正授权在 action 内,前端被绕过也删不动。

## 测试

- `tests/unit/can-delete-tracking-object.test.ts`:创建者 / 管理员 / owner / 无关用户 /
  `createdBy=null` / `userId=null` 各分支。
- `tests/unit/remove-tracking-object.test.ts`(reducer):对象移除、订阅清理、关联
  信号/简报/搜索记录清理、`selectedTrackingObjectId` 重选。

## 范围外(YAGNI)

- 不做软删除/回收站。
- 不做批量删除。
- 侧栏 `tracked-list` 不加删除入口。
- 不改既有取消关注(`subToggle`)行为。
