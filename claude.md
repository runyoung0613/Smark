# Smark / 阅记 — 任务说明与规划

本文档承接 [README.md](./README.md) 的框架描述，按**功能模块 / 页面**记录目标、实现要点、与文档差异及后续规划。

---

## 1. 当前目标（MVP 范围）

- **平台**：Android 真机为主（Expo Go 或 dev client）。
- **导入**：手动标题 + 粘贴正文。
- **阅读**：可滚动阅读；划线为「荧光笔」式高亮。
- **划线**：保存 `quote` + 原文 `start/end`（与 `articles.content` 字符串索引一致）。
- **复习**：随机展示所有划线句；支持 **Quick Card**（一句话，不挂文章）。
- **隐私**：MVP 不加密。

---

## 2. 总体架构（实现对照）

### 2.1 客户端

- **路由**：Expo Router（`Stack` + `Tabs`），见 `smark-app/app/`。
- **数据库**：`expo-sqlite`，封装在 [`smark-app/services/db.ts`](smark-app/services/db.ts)。
- **阅读器**：`react-native-webview`，HTML 由 `buildHtml` 生成，选区经 `postMessage` 回传。
- **Zustand**：依赖已装，**当前业务未使用**；UI 状态以页面 state 为主。若后续有跨页阅读偏好等，可再接入。

### 2.2 云端（未开始）

- **Supabase Auth**：邮箱 OTP。
- **Supabase Postgres + RLS**：`user_id = auth.uid()`。
- **同步**：增量 push/pull + 软删除 + LWW（`updated_at` 新者胜）。

---

## 3. 数据模型

### 3.1 文档目标（同步友好）

| 表 | 字段要点 |
|----|-----------|
| `articles` | `id, title, content, created_at, updated_at, deleted_at` |
| `highlights` | `id, article_id, start, end, quote, note, …, deleted_at` |
| `cards` | `id, article_id, highlight_id, front, back, …`（规划中） |
| `quick_cards` | `id, front, back, …` |

### 3.2 与实现的差异（重要）

- **已建表**：`articles`、`highlights`、`quick_cards`（见 `db.ts`）。
- **`cards` 表未建**：复习页直接使用 **`highlights.quote`** 作为卡片正文，不经过独立 `cards` 行。若未来需要「一条划线多张卡面 / 正反面分离编辑」，再引入 `cards` 并迁移。
- **Quick Card**：表含 `back` 字段，但当前 UI 主要使用 **front**；复习页未做「翻面看 back」。

---

## 4. 按页面 / 任务的详细说明

### 4.1 `/(tabs)/index` — 首页（文章列表）

| 项 | 说明 |
|----|------|
| **目标** | 展示未删除文章列表，按 `updated_at` 降序；入口进入阅读；入口进入导入。 |
| **已实现** | `listArticles` + `FlatList`；「导入」跳转 `/import`；条目跳转 `/read/[id]`。 |
| **待办** | 文章编辑、软删、搜索/筛选（按需）。 |

### 4.2 `/import` — 导入文章

| 项 | 说明 |
|----|------|
| **目标** | 标题 + 正文校验后写入 `articles`，保存后进入该篇阅读页。 |
| **已实现** | `createArticle`；非空校验；`router.replace` 至 `/read/[id]`。 |
| **待办** | 从剪贴板一键粘贴、网页抓取（1.0+）、草稿自动保存（可选）。 |

### 4.3 `/read/[id]` — 阅读 + 划线

| 项 | 说明 |
|----|------|
| **目标** | WebView 展示正文与已有高亮；用户选中文本后写入 `highlights` 并刷新高亮层。 |
| **已实现** | `getArticle` / `listHighlights`；`buildHtml` 按 offset 插入 `<span class="hl">`；`mouseup`/`touchend` 后 `postMessage`；`createHighlight`。入口「划线列表」→ `/highlights/[id]`。 |
| **技术注意** | 高亮依赖**原文 `content` 不变**；`start/end` 为整串 `content` 的字符偏移。 |
| **待办（体验）** | 排版与主题（字号、行距、浅/深）；按篇保存滚动位置；沉浸模式与导航栏控件；加载态；见下文「阅读页专项规划」。 |
| **待办（功能）** | 误触划线确认/撤销；过长选区限制提示（可选）。 |

### 4.4 `/highlights/[id]` — 本文划线列表

| 项 | 说明 |
|----|------|
| **目标** | 列出该文所有未删除划线；支持备注、软删。 |
| **已实现** | `listHighlights`、`updateHighlightNote`、`deleteHighlight`（软删）。 |
| **待办** | 跳转回原文定位（高亮 scroll into view）；批量操作（按需）。 |

### 4.5 `/(tabs)/review` — 随机复习

| 项 | 说明 |
|----|------|
| **目标** | 从「全部划线 + 全部 Quick Card」中随机抽一条展示；支持「换一条」；支持录入 Quick Card。 |
| **已实现** | 遍历文章拉取 highlights 合并 quick_cards；`pickRandom`；`createQuickCard`（front）。 |
| **待办** | Quick Card 展示 `back`、编辑/删除 Quick Card；若引入 `cards` 表则调整数据源。 |

### 4.6 `/(tabs)/profile` — 我的

| 项 | 说明 |
|----|------|
| **目标** | M2 起：登录/退出、同步入口、基础设置。 |
| **已实现** | 占位文案。 |
| **待办** | Supabase Auth、同步状态、导出备份（可选）。 |

---

## 5. 阅读页专项规划（待实现）

以下为一轮「阅读体验」改进的共识方向（实现时以 `smark-app/app/read/[id].tsx` 为主，可抽 `services/readerPrefs.ts`）：

1. **持久化**：`@react-native-async-storage/async-storage` 存全局阅读偏好（字号、主题等）与按篇 `scrollY`。
2. **排版**：CSS 变量控制字号、行距、浅/深背景与高亮对比色；加载中 `ActivityIndicator`。
3. **滚动恢复**：WebView 内节流上报 `scrollY`；`onLoadEnd` 注入 `scrollTo`（**每次 HTML 重载后执行**，避免划线刷新后回顶）。
4. **沉浸与导航**：可选隐藏 Stack 头与顶栏，安全区内悬浮入口进划线列表；`headerRight` 放 A−/A+、主题切换等。

---

## 6. 里程碑与完成度

| 里程碑 | 内容 | 状态 |
|--------|------|------|
| **M1** | SQLite + 导入 → 阅读 → 划线 → 列表 → 随机复习（含 Quick） | **主体已完成**；阅读体验增强、文章管理、Quick `back` 等为增量 |
| **M2** | Supabase 邮箱 OTP + Profile | 未开始 |
| **M3** | 增量同步 + 软删 + LWW | 未开始 |

---

## 7. 协作与支持

- **真机**：Android + Expo Go / dev client；局域网开发时注意 Windows 网络配置文件（专用网络）与防火墙，以便 Expo Go 访问 Metro。
- **隧道**：`expo start --tunnel` 依赖 Ngrok，部分网络环境不稳定；同网优先 LAN。
- **UI**：先可用后美化；墨刀原型为视觉与信息架构参考。

---

## 8. 设计与工具备忘（可选归档）

以下为早期 UI 方向探索，**不替代**当前代码与本文档 4.x 节为准的需求。

- AI UI：Stitch、Lovart、Lovable 等评分与链接曾记在旧版 README；需要时可从 Git 历史恢复长版说明。
- 墨刀：[思维导图](https://modao.cc/board/share/XwaixF2CtcozzdfpHnRdb)、[原型](https://modao.cc/proto/Eif4tWiptcg5a3liDrdGyz/sharing?view_mode=read_only&screen=rbpVErmSRVAZwsjnF)。
