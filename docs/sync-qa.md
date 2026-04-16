# 同步回归清单（Smark / Supabase）

本文用于验证：**离线优先** + **增量同步** + **软删除** + **LWW 冲突** 是否正确。

## 0. 前置准备

### 0.1 Supabase（一次性）
- **执行 SQL**：
  - `supabase/migrations/0001_init.sql`
  - `supabase/rls.sql`
- **部署 Edge Functions**：
  - `supabase/functions/sync/index.ts`
  - `supabase/functions/perses_proxy/index.ts`（可选）
- **配置 Edge Function 环境变量**（在 Supabase 控制台 Functions 设置里）：
  - sync：无需额外变量（使用平台自带 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`）
  - perses_proxy：`PERSES_UPSTREAM_URL`（必填），`PERSES_UPSTREAM_AUTH_HEADER`（可选）

### 0.2 客户端（一次性）
- `smark-app/.env` 写入：
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- 重启开发服务器：
  - `cd smark-app && npx expo start -c`

### 0.3 登录
- 进入「我的」→ 邮箱 OTP 登录。

## 1. 单设备回归（基础）

### 1.1 离线新增 → 上线同步
- **断网**（模拟器可直接关闭网络）
- 新建：
  - 导入 1 篇文章
  - 新建 1 个 Quick Card
  - 在文章内划线 1 条（并在划线列表打开 in_review）
- **恢复网络**
- 「我的」→ 点击 **立即同步**
- 预期：
  - 同步成功提示：push 条数 > 0，pull 条数 >= 0
  - 复习 Tab 能抽到刚添加的 Quick Card / 划线条目

### 1.2 重装/清数据后拉回
- 卸载 App 或清除应用数据
- 重新安装并登录
- 点击 **立即同步**
- 预期：
  - 文章/Quick Card/划线均回到本地（列表可见、回原文定位可用）

## 2. 双设备回归（同步一致性）

准备两台设备：A、B（模拟器+真机也可），登录同一账号。

### 2.1 A 新增，B 拉取
- A：新增 1 个 Quick Card → 同步
- B：点击同步
- 预期：B 出现该 Quick Card（复习池可抽到 / 列表可见）

### 2.2 B 删除，A 拉取（软删除）
- B：删除该 Quick Card（或删除某条划线）→ 同步
- A：点击同步
- 预期：A 也不可见该记录；不会“复活”

## 3. 软删除墓碑回归（关键）

### 3.1 删除文章应连带删除划线（墓碑存在）
- A：对一篇文章有多条划线
- A：删除文章（或矫正正文触发 soft delete highlights 的流程）→ 同步
- B：点击同步
- 预期：
  - B 文章不可见
  - B 对应 highlights 不再出现（复习池/划线列表）
  - 重新同步多次不会出现“复活”

## 4. 冲突回归（LWW）

> 当前策略：按 `client_updated_at`（若没有则用 `updated_at`）做 LWW。客户端使用本地写入时的时间，云端写入时会校准 `updated_at`。

### 4.1 同一条 Quick Card 双端同时修改
- A：离线修改 Quick Card 文本（更改 front）但不 sync
- B：在线修改同一条 Quick Card 文本 → sync
- A：上线后 sync
- 预期：
  - 最终两端收敛为“更新更晚”的那一版
  - 不出现来回震荡（重复 sync 不会反复改动）

### 4.2 删除 vs 更新冲突
- A：离线删除某条 Quick Card（产生 deleted_at）
- B：在线更新同一条 Quick Card（front/back）→ sync
- A：上线 sync
- 预期：
  - 以更晚的那次操作为准（更晚删除则最终删除；更晚更新则最终存在）

## 5. AI 代理回归（可选）

### 5.1 未填 Perses API URL，走云端代理
- 确保已登录
- Perses 页顶部 API URL 留空
- 提问
- 预期：能返回回答；回答可编辑并加入 Quick Card；同步后能在另一设备拉取到该 Quick Card

## 6. 常见故障排查
- 同步失败且提示 401：
  - 检查是否已登录；检查 Supabase URL/AnonKey 是否正确；确认 Edge Function 已部署
- 同步成功但云端没有数据：
  - 检查 RLS policy 是否执行；检查表是否在 `public` schema；确认 user_id 写入正确
- 记录“复活”：
  - 检查删除是否写 `deleted_at`；pull/push 是否携带墓碑；本地 upsert 是否覆盖 deleted_at

