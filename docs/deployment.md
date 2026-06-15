# 发布 / 部署规范

生产环境 = Vercel 项目 **`lhh-news-ingestion`**，**生产分支 = `main`**。
线上域名从 `main` 分支构建。

## 核心规则：只通过 git 发布

**push 到 `main` → Vercel 自动部署。** 这是唯一的发布路径。

- ✅ `git push origin main` 触发生产部署。
- ❌ **不要**用 `vercel --prod` / `vercel deploy` 等本地 CLI 直接部署。
  - 原因：CLI 直接部署会上线"本地工作区当前状态"，可能包含未提交/未推送的代码，造成**线上与 git 历史不一致**、难以追溯和回滚。
  - git 历史是唯一事实来源：任何上线的代码都必须先在 `main` 上有对应提交。

## 发布前检查清单

在 `git push` 之前，本地依次确认：

```bash
npx tsc --noEmit        # 类型检查通过
npm test                # vitest 全过
npm run lint            # eslint（可选但推荐）
```

如果本地 `main` 和 `origin/main` 分叉（别的机器/PR 合并过）：

```bash
git fetch origin
git log --oneline main..origin/main      # 看远端领先的提交
git merge-tree --write-tree origin/main main; echo "exit=$?"   # 只读演练：0=可干净合并
git merge origin/main                    # 干净则合并（已有 merge 历史，用 merge 而非 rebase）
npx tsc --noEmit && npm test             # 合并后复检
git push origin main
```

> 演练有冲突（exit≠0）就停下来人工解决，别强推。

## 数据库迁移：与代码部署分开

**`git push` 只部署代码，不会执行任何数据库变更。** Supabase 的 schema / RLS / 数据迁移必须**单独应用**：

- 迁移文件放在 `supabase/migrations/`，按编号顺序。
- 应用方式：`supabase db push`，或在 Supabase 控制台 SQL Editor 手动跑该文件内容。
- **依赖某迁移的代码**：要么先应用迁移再部署代码，要么同时，避免线上代码引用了尚未存在的表/列/策略。
- 已手动在 SQL Editor 跑过的迁移，仍要把文件提交进仓库（保证别处建库 / 重建时不丢）。

## 摄取（ingestion）改动的生效范围

涉及"如何写入数据"的改动（如来源链接取法、字段填充）**只影响部署后新摄取**的数据；
**既有数据行不会自动变**，需要重新摄取对应对象或手动改库。

## 环境变量 / 密钥

在 **Vercel 项目设置 → Environment Variables** 配置（`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `GEMINI_API_KEY` 等），**不提交进仓库**。本地用 `.env.local`。

## 部署后验证

```bash
vercel ls        # 最新一条 Environment=Production 且 Status=Ready 即部署完成
```

然后在**对应空间**冒烟测试本次改动（例如改了 Mr.Marco 的功能，就用 Mr.Marco 账号登录验证；改了航天空间就用对应账号）。

## 一句话总结

> 改代码 → 本地 tsc/test 过 → 提交到 `main` → `git push`（自动部署）。
> 改数据库 → 写迁移文件 + 单独 `supabase db push` / SQL Editor。
> 永不 `vercel --prod` 直接推本地。
