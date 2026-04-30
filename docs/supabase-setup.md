# Supabase 最小后端搭建（Smark 多端同步 MVP）

> 目标：让 App 能用 **邮箱 OTP 登录**，并通过 **Edge Function `sync`** 同步三类数据：`articles / highlights / quick_cards`。

---

## 0. 你需要准备什么

- 一个 Supabase 项目（你已创建）
- 项目里启用 Email 登录（Auth → Providers → Email）

---

## 1. 建表（一次性）

在 Supabase Dashboard 打开 **SQL Editor**，依次执行仓库内两段 SQL：

1. `supabase/migrations/0001_init.sql`（建表与索引）
2. `supabase/rls.sql`（开启 RLS + 仅允许访问自己的数据）

执行成功后，你应该能在 **Table Editor** 看到这些表：

- `public.articles`
- `public.highlights`
- `public.quick_cards`
- `public.perses_settings`（可选，目前 MVP 不用也没关系）

---

## 2. 部署 Edge Function：sync（一次性）

在 Supabase Dashboard 打开 **Edge Functions**：

- 创建/部署函数，名字必须是：`sync`
- 函数代码使用仓库文件：`supabase/functions/sync/index.ts`

说明：
- 该函数使用平台自带的 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`，无需你额外配置环境变量。
- 客户端点击“立即同步”时会调用 `functions.invoke('sync', ...)`。

---

## 3. 客户端配置（一次性）

### 3.1 获取 URL 与 anon key

Supabase Dashboard → **Project Settings → API**：

- `Project URL`：形如 `https://<project-ref>.supabase.co`
- `anon public`：作为 `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### 3.2 写入 `smark-app/.env`

在 `smark-app/.env` 写入：

- `EXPO_PUBLIC_SUPABASE_URL=...`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY=...`

然后在电脑端重启开发服务（建议清缓存）：

```bash
cd smark-app
npx expo start -c
```

---

## 4. 最小验收（两台设备）

两台设备（或真机 + 模拟器）登录**同一个邮箱**：

1. 设备 A：导入文章（带正文）→ 划线 → 添加 Quick Card → 「我的」→ **立即同步**
2. 设备 B：登录 → 「我的」→ **立即同步**
3. 预期：设备 B 能看到文章/划线/Quick Card（复习池能抽到）

---

## 5. 常见问题

### 5.1 同步提示 401 / Invalid token

- 先确认你已在「我的」完成邮箱 OTP 登录
- 确认 `smark-app/.env` 的 URL / anon key 正确
- 确认 Edge Function `sync` 已部署且名称是 `sync`

### 5.2 同步成功但云端没数据 / 拉不回来

- 确认 `0001_init.sql` 与 `rls.sql` 都执行成功
- 确认表在 `public` schema

