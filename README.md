# 林哈哈聊太空 · 情报工作台

面向航空航天科技内容团队的内部情报筛选与选题工作台（Next.js + Supabase）。

## 账号层（多空间 · Supabase）— 本地起步

账号体系采用「单组织 → 多空间 → 空间成员」三层模型，账号数据持久化到 Supabase（云端项目），内容流水线本阶段仍由 fixtures 驱动、按空间在内存隔离。

### 一次性配置

1. 在 [supabase.com](https://supabase.com) 建一个云端项目（Region 选 Singapore / Tokyo）。
2. 复制 `.env.example` 为 `.env.local`，填入 Settings → API 的三项：
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```
3. 跑迁移：Supabase 控制台 → SQL Editor → 粘贴并运行 `supabase/migrations/0002_account_layer.sql`
   （会建 `profiles / applications / spaces / space_members / space_invites` 五张表 + RLS）。
4. 跑种子：`npm run seed:account`
   建出所有者 **林哈哈** + 空间 **聊太空** + 成员 **周野 / 何远**（占位邮箱 `*@linhaha.local`，可在 `scripts/seed-account.ts` 改）。
5. Authentication → URL Configuration：把 `http://localhost:3000` 加进 **Site URL** 与 **Redirect URLs**（魔法链接回跳所需）。

### 运行

```bash
npm run dev
# 打开 http://localhost:3000/zh/login，用种子邮箱（如 lin@linhaha.local）登录
```

> 占位邮箱收不到真实验证码。本地验证登录可用 admin API 免邮件签发令牌；正式使用请把所有者/成员换成可收件的真实邮箱。

### 角色与邀请

- **所有者**（应用唯一）：创建空间、为每个空间指派一位管理员、跨空间总览（`/zh/spaces`）。
- **空间管理员**：管理本空间成员、用「邮箱一次性邀请」拉人（`/zh/space/members`）。
- **成员**：通过邀请链接 `/invite/<token>` 加入；同一账号可跨多个空间任不同角色。

### 阶段边界

空间 / 成员 / 邀请 / 资料**持久化**在 Supabase。每个空间的**内容**（追踪对象 / 信号 / 简报 / 选题）本阶段仍由 fixtures 在内存克隆、按空间隔离，**刷新会重置**——把内容流水线迁入 Supabase（每条带 `space_id`）是第二阶段的工作。详见 `docs/superpowers/specs/2026-06-14-multi-space-account-layer-design.md` §8。

## 测试

```bash
npm test            # vitest
npx tsc --noEmit    # 类型检查
npm run lint        # eslint
```
