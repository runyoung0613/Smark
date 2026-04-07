# Smark（阅记）— 开发进度与实现细节

> **用途**：给协作者与 AI 助手看的「当前代码与进度真值」。产品愿景与路线图见仓库根目录 [`README.md`](README.md)。  
> **最后同步代码状态**：2026-04-02（以仓库 `smark-app/` 为准）

---

## 0. 产品规格（阅读 / 编辑 / 复习 / 展示 · 已与用户对齐）

以下为目标行为；**与当前代码不一致处 = 待开发**，实现时以本节为准。

### 0.1 阅读模块

- **划线**、**字号**、**画面主题**均在**阅读**内完成（导入乱码等不在此纠正正文）。
- 划线交互目标：长按选中文本 → **弹出选项**（含「划线」等），再写入数据库。**当前实现**：先选中句柄范围，再点顶栏 **「划线」**（WebView 内自定义弹出菜单可后续加）。
- **回原文定位**：`/read/[id]?highlightId=…`，正文内 `span.hl` 带 `data-hl-id`，加载后滚动到视区中部。

### 0.2 编辑模块

- **仅用于对正文人工矫正**（乱码、错字、格式等）：独立页 **`/edit/[id]`**（入口：阅读顶栏 **「矫正」**），保存时更新 `articles.content`。
- **保存编辑时**：若正文相对**上一次已保存版本**有变化 → **先提示用户**；确认后执行 **软删除本篇全部划线**（`highlights` 中该 `article_id` 且未删记录统一写入 `deleted_at`），再写入新正文。避免 `start/end` 与改后正文错位。

### 0.3 划线列表

- **「加入复习」开关**（`in_review`）；**新建划线默认 `in_review=0`**，需用户打开开关后才进入复习池（见 0.4）。
- `in_review=0` 的划线不参与划线复习（仍可在阅读/列表中查看）。

### 0.4 复习池抽取（划线复习 + Quick Card 展示）

- **范围**：复习 Tab 使用一个合并随机池：`highlights` 中 `in_review=1` 的划线 + `quick_cards` 的展示条目。
- **交互**：随机展示一条；若为划线条目则可 **回原文** 定位（`/read/[articleId]?highlightId=…`，由阅读页滚动到对应 `span.hl`）；若为 Quick Card 则仅展示文本（不做回原文定位）。
- **说明**：此处「复习」仅指划线相关的回顾；Quick Card 仍然是展示板（不提供复习能力）。

### 0.5 Quick Card（展示板，非复习）

- **产品定位**：核心目的是 **展示**，Quick Card 不提供复习能力（无间隔重复、无掌握度等规划）。
- **交互理解**：Quick Card 与划线条目同在一个随机池中被抽取展示；展示板切换由复习页的「换一条」完成（具体按钮文案与布局实现时再定）。
- **与复习的关系**：Quick Card 参与同一随机池展示，但不改变其“展示板、无复习能力”的定义；界面根据条目类型仅展示不同能力（划线才回原文）。

### 0.6 数据层

- `highlights.in_review`：**已实现**（`initDb` 内 `CREATE` 含列 + `migrateHighlightsInReviewColumn` 对旧库 `ALTER`）。
- `quick_cards` 无复习字段；展示板仅读库随机 + 刷新。

---

## 1. 里程碑总览

| 阶段 | 目标 | 状态 |
|------|------|------|
| **M1** | 本地闭环：导入 → 阅读 → 划线 → 划线列表 → 划线复习 + Quick Card（合并随机池） | **已对齐 §0 主路径**：`in_review`、回原文定位、展示板与合并随机池、**矫正正文**页与清划线；**待增强**：WebView 内长按弹出菜单（当前为顶栏「划线」）；可选：减少 WebView 整页重载闪动 |
| **M2** | Supabase 邮箱 OTP 登录；Profile 登录/退出 | **未开始**（`profile.tsx` 仅占位文案） |
| **M3** | 增量同步、软删除、LWW 冲突 | **未开始** |

---

## 2. 已实现功能清单（按页面）

### 2.1 根与数据

- [`smark-app/app/_layout.tsx`](smark-app/app/_layout.tsx)：启动时 `initDb()`，Stack 注册 tabs / import / read / **edit** / highlights。
- [`smark-app/services/db.ts`](smark-app/services/db.ts)：SQLite `smark.db`；表 `articles`、`highlights`、`quick_cards`；软删除字段 `deleted_at`；文章/划线/Quick Card 的 CRUD 与列表查询。
- **未建表**：独立 `cards` 表未落地。`listReviewHighlights()` 仅 `in_review=1`；Quick Card 与划线条目合并参与复习 Tab 的随机池展示。

### 2.2 `/(tabs)/index` — 文章列表

- [`smark-app/app/(tabs)/index.tsx`](smark-app/app/(tabs)/index.tsx)：拉取未删除文章，点击进入 `/read/[id]`；入口跳转 `/import`。

### 2.3 `/import` — 导入文章

- [`smark-app/app/import.tsx`](smark-app/app/import.tsx)：标题 + 正文粘贴，`createArticle` 写入 SQLite。

### 2.4 `/read/[id]` — 阅读 + 划线

- [`smark-app/app/read/[id].tsx`](smark-app/app/read/[id].tsx)：
  - 高亮 `<span class="hl" data-hl-id>`；query **`highlightId`** 时加载后滚到对应句。
  - 顶栏：**主题、字号、划线、列表、矫正**（进 `/edit/[id]`）。选中后点 **「划线」** 提交选区。
  - **无** `selectionchange`/`touchend` 自动保存。
  - **滚动**：页内 `scroll` 节流 → `postMessage` → RN 写入 AsyncStorage；`onLoadEnd` 用 `pendingRestoreY`（保存划线前）或存储值 `scrollTo`（减轻整页重载回顶）。
  - **反馈**：成功 `ToastAndroid` + `expo-haptics` Light；无选区/重复区间有短提示。
- [`smark-app/services/readerPrefs.ts`](smark-app/services/readerPrefs.ts)：
  - `smark_reader_prefs`：主题 `light | eye | dark`，字号 `sm | md | lg`。
  - `smark_read_scroll_${articleId}`：滚动 `y`。

### 2.5 `/highlights/[id]` — 本文划线列表

- [`smark-app/app/highlights/[id].tsx`](smark-app/app/highlights/[id].tsx)：列表、**加入复习** `Switch`、`note`、软删除。

### 2.6 `/edit/[id]` — 矫正正文

- [`smark-app/app/edit/[id].tsx`](smark-app/app/edit/[id].tsx)：多行编辑正文；保存且正文相对载入时有变化 → 提示 → 软删除本篇全部划线 → `updateArticleContent`。

### 2.7 `/(tabs)/review` — 复习 Tab

- [`smark-app/app/(tabs)/review.tsx`](smark-app/app/(tabs)/review.tsx)：**合并随机池**（`listReviewHighlights` + `listQuickCards`）；单按钮「换一条」抽取；抽到划线显示来源并提供「回原文定位」，抽到 Quick Card 仅展示文本；支持添加 Quick Card。

### 2.8 `/(tabs)/profile` — 我的

- [`smark-app/app/(tabs)/profile.tsx`](smark-app/app/(tabs)/profile.tsx)：**占位**；文案说明后续 Supabase 登录与同步。

---

## 3. 依赖与工程

- **目录**：可运行代码在 [`smark-app/`](smark-app/)（Expo SDK 54、Expo Router、TypeScript）。
- **主要依赖**：`expo`、`expo-router`、`expo-sqlite`、`react-native-webview`、`@react-native-async-storage/async-storage`、`expo-haptics`、`zustand`（已装；业务仍以组件 state + DB 为主）。
- **真机调试**：`cd smark-app && npx expo start`；跨网用 `npx expo start --tunnel`。需在 **`smark-app`** 下执行，勿在仓库根目录无 `package.json` 处执行。
- **npm**：若 `ERESOLVE` peer 冲突，可使用 `npm install --legacy-peer-deps`。

---

## 4. 已知限制与后续可选项

- **§0 待开发清单（摘要）**：WebView **长按弹出**「划线」菜单（当前为顶栏按钮）；其余 §0 主路径已在代码落地。
- **WebView 整页重载**：新划线后仍会更新 `source` 导致整页重载；当前用 **滚动恢复** 缓解回顶；若要「零闪」需 M1+ 方案（例如 `injectJavaScript` 在 DOM 内包 span、延迟 `setHighlights` 等），尚未实现。
- **平台**：规划为 Android 为主；`ToastAndroid` 等部分反馈未做 iOS 等价实现。
- **Zustand / 组件库**：README 规划中曾列出的 `components/`、`hooks/`、`summary/` 等**当前仓库不存在**；以本节文件列表为准。

---

## 5. 数据模型（与同步预留一致）

- `articles`：`id, title, content, created_at, updated_at, deleted_at`
- `highlights`：… + **`in_review`**（0/1，默认 0）
- `quick_cards`：`id, front, back, created_at, updated_at, deleted_at`

---

## 6. 协作提示

- 改阅读行为时优先改 [`read/[id].tsx`](smark-app/app/read/[id].tsx) 与 [`readerPrefs.ts`](smark-app/services/readerPrefs.ts)。
- 改数据结构时改 [`db.ts`](smark-app/services/db.ts) 并评估迁移（MVP 阶段可接受卸载重装清库）。

---

## 7. 需要你配合的验证

- Android 真机 + Expo Go（SDK 与项目一致）或 dev client。
- UI 仍以原型可用为主；隐私 MVP 不加密。
