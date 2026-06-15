# 多空间账号层设计（第一阶段：账号层地基）

- 日期：2026-06-14
- 范围：本设计仅覆盖**第一阶段**——账号层地基。内容流水线迁库（第二阶段）与应用级管理后台（第三阶段）在末尾"后续阶段"中仅作占位，不在本设计实现范围内。
- 架构方案：**方案一**（Supabase 账号层 + 服务端会话 + 空间作用域的内存内容）

---

## 1. 背景与目标

### 1.1 现状

「林哈哈聊太空」情报工作台是一个 Next.js 应用，当前为**单租户**：整个部署等于一个隐式的内容品牌。关键事实：

- 数据全部来自内存 fixtures（`lib/data/phase1-fixtures.ts`），由 `lib/workflow/local-workflow.ts` 的 `createInitialWorkflowState()` 一次性装载。
- **没有任何真实鉴权/登录**。顶部的"成员切换器"（[top-nav.tsx](../../../components/workbench/top-nav.tsx)）是个假身份开关：点一下就换人，无密码、无账号、无会话。
- `supabase/migrations/0001_initial_schema.sql` 只定义了内容侧的表，且**当前并未被 app 使用**；没有装 `@supabase/supabase-js`，没有任何 DB 读写。
- 业务链路：追踪对象（TrackingObject）→ 搜索信号（Signal）→ 编辑简报（Brief）→ 选题卡（TopicCard）→ 制作包（Production）。
- 应用为双语路由（`/` 英文、`/zh` 中文）。

### 1.2 目标

把现在扁平的"应用 = 单一内容品牌"升级为三层结构，以便按不同媒体内容主题分别管理看板：

```
应用（Application，单组织：林哈哈）
   └── 空间（Space，每个 = 一个内容主题，如 聊太空 / 聊军事）
          └── 空间成员（其中一位是管理员）
```

### 1.3 已确认的关键决策

| 决策点 | 结论 |
|--------|------|
| 数据归属 | 每个空间拥有自己独立的一套追踪对象 / 信号 / 简报 |
| 持久化 | 账号层接 Supabase 做真实持久化 |
| 应用模型 | **单应用 / 单组织**，纯邀请制，不开放公开注册 |
| 鉴权 | Supabase Auth，**邮箱魔法链接 / OTP**（无密码） |
| 角色 | **仅应用所有者**创建空间并指派管理员；三级角色：所有者 / 空间管理员 / 成员 |
| 邀请 | **邮箱定向、一次性、可过期**的邀请链接 |
| 跨空间 | 同一账号可加入多个空间，且可在不同空间任不同角色 |
| 数据落地 | 林哈哈 = 所有者；聊太空 = 首个空间，承接现有全部 fixtures |
| 新空间内容 | 克隆聊太空的演示内容（归属按启发式重映射到新空间成员） |
| 本阶段边界 | A 多租户模型 + B 鉴权 + D 空间/成员/邀请 UI；内容流水线**仍用 fixtures，但按空间隔离** |

---

## 2. 数据模型（Supabase 账号层）

层级：`auth.users` ←→ `profiles`（展示信息）；`applications → spaces → space_members`；`space_invites` 挂在空间下。

新建迁移 `supabase/migrations/0002_account_layer.sql`。

### 2.1 表结构

**`applications`**（单组织，种子里只有 1 行）
- `id uuid pk` · `name text`（"林哈哈"）· `owner_id uuid → auth.users` · `created_at timestamptz`

**`spaces`**
- `id uuid pk` · `application_id uuid → applications` · `name text`（"聊太空"）
- `theme text`（内容主题描述）· `created_at` · `updated_at`

**`space_members`**（跨空间靠同一 user_id 多行实现）
- `id uuid pk` · `space_id uuid → spaces` · `user_id uuid → auth.users`
- `role text check (role in ('admin','member'))` —— **管理员 = role='admin' 的那条成员**（单一真相源，不另存 admin_id）
- `title text`（自由文本职衔，保留现有卡片的"主编·主笔"展示）· `joined_at`
- 约束：`unique(space_id, user_id)`；偏唯一索引保证每空间至多一个 `role='admin'`

**`space_invites`**
- `id uuid pk` · `space_id uuid → spaces` · `email text`（受邀邮箱）· `token text unique`
- `role text default 'member' check (role in ('admin','member'))` —— 仅所有者可发 `admin` 邀请；管理员只能发 `member`
- `invited_by uuid → auth.users`
- `status text check (status in ('pending','accepted','revoked','expired'))`
- `expires_at timestamptz`（默认 7 天）· `created_at` · `accepted_at`
- 约束：同 `(space_id, email)` 至多一条 `pending`

**`profiles`**（auth.users 的公开镜像）
- `id uuid pk → auth.users` · `display_name text` · `avatar_char text` · `color text` · `created_at`

### 2.2 关键取舍

- **角色拆两层**：`role`（admin/member，权限）与 `title`（自由职衔，纯展示）分开 —— 既满足"一位管理员"，又保住现有成员卡片文案。
- **内容表本轮不动**：`0001` 的内容表不使用、不加 `space_id`，留给第二阶段。
- 全表开 **RLS**。

### 2.3 RLS 策略（要点）

- `applications`：owner 读写；该应用成员可读。
- `spaces`：空间成员可读；空间管理员可改本空间（name/theme）；所有者可读写全部空间。
- `space_members`：空间成员可读本空间名册；管理员可增删本空间成员；所有者可管全部。
- `space_invites`：空间管理员 + 所有者可建/读/撤本空间邀请；按 token 的落地校验走服务端（service-role），不依赖匿名 RLS 直读。
- `profiles`：可读与自己共享空间的成员资料；可改自己的资料。

---

## 3. 鉴权与会话

### 3.1 技术栈

- `@supabase/supabase-js` + `@supabase/ssr`（Cookie 会话），登录走**邮箱 OTP / 魔法链接**（无密码）。
- 四个客户端入口：浏览器端、服务端（带 RLS）、中间件端（仅刷新会话）、**service-role**（仅服务端，用于必须绕过 RLS 的操作：创建邀请、接受邀请写 member）。

### 3.2 路由保护（Next 中间件）

- 公开：`/login`（含 `/zh/login`）、`/invite/[token]`。
- 受保护：其余全部页面 —— 无会话重定向到 `/login`，保留当前 locale。
- 已登录但不属于任何空间 → 落到"无空间 / 等待邀请"空状态页。

### 3.3 登录流

输入邮箱 → 收 6 位验证码 / 魔法链接 → 回跳建立会话。

### 3.4 Bootstrap（所有者怎么进来）

纯邀请制、无公开注册，所有者 = **种子预置**。种子建好 林哈哈的 `auth.users + profile + application + 聊太空 空间`；林哈哈首次登录时对预置邮箱发验证码即可。新成员只能通过邀请进入。

### 3.5 取代假成员切换器

- 假身份开关 → **真实账号菜单**（头像 + 当前用户 + 当前空间角色 + 登出）。
- 新增**空间切换器**（属于多个空间时切换），与账号菜单分开。
- 现有 `scope`（我关注的 / 全团队）保留，收敛到"当前空间内"。

### 3.6 新增环境变量

`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。

---

## 4. 邀请流

### 4.1 生成

空间管理员（或所有者对任意空间）：成员管理面板 →「邀请成员」→ 输入受邀邮箱 → 服务端 action 写一条 `space_invites`（`token`、`email`、`role`、`expires_at` 默认 7 天、`status=pending`、`invited_by`）→ 返回链接 `/invite/[token]`，复制发出。
- 拦截：该邮箱已是本空间成员 → 阻止；同邮箱已有 pending → 复用/重发（换新 token、续期）。
- `role=admin` 的邀请**仅所有者**可发（用于新建空间时指派新人管理员）。

### 4.2 落地 `/invite/[token]`（公开页）

服务端按 token 取邀请并校验（存在 / `pending` / 未过期）：
- 失效/过期/已撤销/已接受 → 对应提示页。
- 有效 → 展示「你被邀请加入 **聊太空** · 内容主题 · 邀请人」。
- 未登录 → 引导邮箱登录，**登录邮箱必须等于邀请目标邮箱**。
- 已登录但邮箱 ≠ 邀请邮箱 → 阻止并提示用该邮箱登录。

### 4.3 接受（服务端 service-role action）

校验 token 有效 + 会话邮箱匹配 → 写 `space_members`（role 取邀请上的值）→ 确保 `profiles` 存在 → 置邀请 `status=accepted` + `accepted_at` → 跳进该空间。
- 首次新用户：插一步「完善资料」（`display_name` 必填，`avatar_char` 默认取首字，`color` 自动分配）。
- 跨空间老用户：一键接受，仅新增一行 `space_members`。

### 4.4 管理 / 撤销

管理员在成员面板看到 pending 邀请列表，可**撤销**（`status=revoked`）或**重发**（新 token + 续期）。

### 4.5 种子成员

周野 / 何远 不走邀请，由种子脚本直接预置 `auth.users + profiles + space_members`（占位邮箱）。邀请流只服务未来新拉的人。

---

## 5. 空间作用域的内容（fixtures 如何按空间隔离）

核心思路：**账号层（Supabase）是成员的唯一真相源，内容引擎按空间各持一份内存态。**

### 5.1 内容引擎改成"按空间"

- 在 `WorkflowProvider` 之上套 `SpaceProvider`（知道当前用户、所属空间、当前空间、角色）。
- 内存 store：`Map<spaceId, LocalWorkflowState>`，**懒加载**。
- 切空间 = 换 active 状态；会话内编辑**按空间各自保留**；刷新重置内容。

### 5.2 成员只有一套（不搞双轨）

`LocalWorkflowState.teamMembers` / `currentMemberId` 改为**注入真实账号成员**（来自 `space_members + profiles`），不再用 fixtures 里的 u-lin/u-zhou/u-he。

新增 `seedSpaceContent(space, realMembers, currentUserId)`（置于 `lib/workflow/`）：
- 克隆 fixtures 内容（追踪对象/信号/简报/评分/筛选/选题卡/制作/来源/锚点/run/log）。
- 把内容里对成员的引用（`topicCard.ownerId`、`screeningDecision.decidedBy`、成员订阅 `trackingObjectIds`）**重映射到该空间真实成员**：
  - **聊太空**：用显式映射（林哈哈→原 u-lin、周野→u-zhou、何远→u-he）保住策划好的归属/订阅。
  - **新建空间**：克隆同一份演示内容，归属按"管理员优先、其余成员轮转"启发式重新分配（演示占位）。
- `currentMemberId` = 当前登录用户。
- 刚被邀请、无预设内容的人：自然就是一个真实成员，「我关注的」先为空，自己订阅后填充。

### 5.3 切空间体验

顶部空间切换器切换 → `SpaceProvider` 换 `currentSpaceId` → 内容 store 命中或懒 seed → 工作台整页跟随刷新（追踪对象/简报/选题池/地图均为该空间）。`scope` 收敛在当前空间内。

### 5.4 明确边界

本轮内容**不进库、刷新即重置**；只有账号层（空间/成员/邀请/资料）真持久化。新空间是克隆的演示数据，归属为启发式占位。第二阶段迁库后该"演示占位"消失。

---

## 6. UI / 导航

### 6.1 新增页面

- `/login`（+ `/zh/login`）：输邮箱 → 收验证码 → 填码进入。
- `/invite/[token]`：展示「邀你加入 X」+ 接受按钮；未登录先登录、新用户插「完善资料」。
- 「无空间」空状态页：已登录但无空间 →「等待邀请」；所有者且零空间 → 引导「新建空间」。

### 6.2 顶部导航改造（`top-nav.tsx`）

- 品牌：`林哈哈` 保留为组织标识；旁边「聊太空」改为**可点的空间名 chip**。
- **空间切换器（新）**：下拉列出我所属的空间，高亮当前；所有者额外有「＋新建空间」「全部空间」入口。
- **账号菜单（替换假成员切换器）**：头像 + 名字 + 当前空间角色 + 登出（+ 完善资料）。
- 现有「⊞ 切换视图」launcher 不动（空间内换视图与换空间是两个轴）。

### 6.3 成员管理面板（当前空间，管理员 / 所有者可见，成员只读名册）

- 成员列表：头像 · 名字 · 职衔 · 角色徽标（管理员/成员）。
- 待处理邀请列表：撤销 / 重发。
- 「邀请成员」：输邮箱 → 生成链接 → 复制。

### 6.4 空间设置（管理员 / 所有者）

改空间名、内容主题。

### 6.5 所有者专属

- 「新建空间」：填名称 + 内容主题 + **指派管理员**——已有账号直接指派；新人则发 `role=admin` 邀请（仅所有者可发 admin 邀请）。
- 「全部空间」轻量总览：列出所有空间 + 成员数 + 进入/新建（完整应用级后台是第三阶段，这里只给最小够用版）。

### 6.6 双语

所有新页面/文案走现有 `lib/i18n/`，保留 zh + en。

---

## 7. 种子脚本与迁移

### 7.1 迁移 `supabase/migrations/0002_account_layer.sql`

建 5 张表 + 索引/约束（见 §2.1）+ RLS 策略（见 §2.3）。`0001` 内容表本轮不动。

### 7.2 种子 `scripts/seed-account.ts`（service-role）

> 建 `auth.users` 真账号用 Node 脚本走 service-role `admin.createUser`（纯 SQL 不便）。

- 建 3 个账号（占位邮箱，可改）：林哈哈 / 周野 / 何远
- application「林哈哈」owner = 林哈哈
- space「聊太空」theme = 商业航天/太空
- profiles（`display_name / avatar_char / color` 取自现有 fixtures）
- space_members：林哈哈 `admin`、周野/何远 `member`，`title` 沿用现有职衔

### 7.3 与现有 fixtures 接线

- `phase1-fixtures.ts` 的内容继续作为演示内容源不变。
- 其 `teamMembers`（u-lin/u-zhou/u-he）保留，专用作：种子里 3 位真实成员的资料来源、`seedSpaceContent()` 的"聊太空 内容成员 → 真实成员"显式映射。

### 7.4 环境与本地起步

- 新增 `.env`：`NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`
- 流程：`supabase start` → 跑 0002 迁移 → 跑 seed 脚本 → `npm run dev`；写进 docs。

### 7.5 测试（vitest 已有）

- 邀请校验逻辑（过期 / 邮箱匹配 / 状态机）
- `seedSpaceContent` 重映射
- 关键服务端 action 的权限判定（所有者/管理员/成员边界）

---

## 8. 不在本阶段范围（后续）

- **第二阶段**：内容流水线（信号/简报/选题/制作）真正迁到 Supabase，每条数据带 `space_id` + RLS；`seedSpaceContent` 的演示占位退役。
- **第三阶段**：完整应用级管理后台（跨空间运营总览、审计、批量管理）。

---

## 9. 风险与注意

- **内容不持久化的预期管理**：本阶段刷新会重置内容（仅账号层持久化）。需在 UI/文档明确说明，避免误判为 bug。
- **auth.users 种子**：本地与线上的种子方式差异（service-role admin API），需在 docs 写清。
- **邮箱定向邀请的登录约束**：登录邮箱必须等于邀请邮箱，需要清晰的错误文案，避免用户卡住。
- **新空间克隆演示数据**的归属是启发式占位，可能与真实分工不符——属已知演示瑕疵，第二阶段消除。
