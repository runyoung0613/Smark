# Smark（阅记）开发进度与架构记录

## 1. 当前目标（MVP）

- **平台**: Android Only（真机测试）
- **导入**: 粘贴正文 + 手动标题
- **阅读**: 简单阅读即可（先把闭环跑通）
- **划线**: 原文中“荧光笔高亮”（建议 WebView 渲染 HTML + 选区高亮）
- **卡片**:
  - 随机展示所有划线句子（不做间隔重复算法）
  - 支持“导入句子”作为 Quick Card（不挂文章）
- **隐私**: MVP 阶段不加密

## 2. 总体架构（个人开发者最省事的全栈）

### 2.1 客户端（Expo / React Native）

- **路由**: Expo Router
- **本地数据库**: SQLite（`expo-sqlite`），作为离线主库
- **阅读器**: WebView（`react-native-webview`），用于选区与荧光笔效果
- **状态管理**: Zustand（只管理 UI 状态/缓存，不作为最终数据源）

### 2.2 云端（后续接入）

- **Supabase Auth**: 邮箱 OTP（多设备同账号）
- **Supabase Postgres + RLS**: 云端备份/同步（`user_id = auth.uid()`）
- **同步策略（MVP）**: 增量 push/pull + 软删除 + Last-Write-Wins（以 `updated_at` 新者覆盖）

> 说明：先完成本地闭环（M1），数据结构稳定后再接入 Supabase（M2/M3），避免早期频繁迁移。

## 3. 数据模型（同步友好）

- `articles`: `id,title,content,created_at,updated_at,deleted_at`
- `highlights`: `id,article_id,start,end,quote,note,created_at,updated_at,deleted_at`
- `cards`: `id,article_id,highlight_id,front,back,created_at,updated_at,deleted_at`
- `quick_cards`: `id,front,back,created_at,updated_at,deleted_at`

## 4. 页面范围（MVP）

- `/(tabs)/index`: 文章列表
- `/import`: 导入文章（粘贴正文）
- `/read/[id]`: 阅读 + 选区高亮（荧光笔）
- `/highlights/[id]`: 文章内高亮列表/编辑
- `/(tabs)/review`: 随机卡片展示（含 quick cards）
- `/(tabs)/profile`: 登录/同步入口（后续）

## 5. 关键技术决策（已定）

- **高亮实现**: WebView HTML + `<span class="highlight">`（荧光笔效果），JS 回传 `quote + start/end`
- **离线优先**: 所有操作先写 SQLite，再考虑同步
- **导入句子**: Quick Card（独立于文章）

## 6. 里程碑计划

- **M1 本地闭环**: SQLite + 导入 → 阅读 → 荧光笔划线 → 列表展示 → 随机复习
- **M2 登录**: Supabase Auth 邮箱 OTP + Profile 登录/退出
- **M3 同步**: push/pull 增量同步 + 软删除 + 冲突 LWW

## 7. 当前仓库状态（已发现）

- Expo 工程目录：`smark-app/`
- 依赖已包含：`expo-router`、`expo-sqlite`、`react-native-webview`、`zustand`
- 需要在实现阶段补齐：Expo Router `app/` 目录、页面与数据层

## 8. 需要你提供的支持项

- **真机测试**: 你将使用 Android 真机（Expo Go 或自定义 dev client）
- **UI**: 先原型可用即可
- **隐私**: MVP 不加密（后续如要加密可再设计）

