# Supabase（Smark 多端同步）

本目录提供 **Smark 多端同步 MVP** 所需的最小 Supabase 后端：

- 数据表与索引：`migrations/0001_init.sql`
- RLS 策略：`rls.sql`
- Edge Functions：
  - `functions/sync`：多端增量同步（客户端 Profile 页“立即同步”会调用）
  - `functions/perses_proxy`：可选的 AI 代理（把上游 key 放服务端；当前 MVP 可先不用）

---

## 路径 A：用 Dashboard（最简单）

### 1) 建表 + RLS

Supabase Dashboard → SQL Editor：

1. 执行 `migrations/0001_init.sql`
2. 执行 `rls.sql`

### 2) 部署 sync

Supabase Dashboard → Edge Functions：

- 新建/部署函数 `sync`
- 代码粘贴自 `functions/sync/index.ts`

> `sync` 不需要额外环境变量（使用平台内置 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`）。
---

## 路径 B：用 Supabase CLI（可选）

适合你希望把 migrations/functions 用 git 管起来、以后多次迭代同步后端的情况。

大致步骤（不同系统命令略有差异，以 Supabase 官方文档为准）：

1. 安装并登录 CLI
2. 在仓库根目录初始化/链接项目（project ref）
3. 推送数据库迁移（`migrations/0001_init.sql`）并执行 `rls.sql`
4. 部署函数：`sync`（可选再部署 `perses_proxy`）
---

## 客户端如何接入

见 `docs/supabase-setup.md`。

