# Smark（阅记）— 开发进度与实现细节

> **用途**：给协作者与 AI 助手看的「当前代码与进度真值」。产品愿景与路线图见仓库根目录 [`README.md`](README.md)。  
> **最后同步代码状态**：2026-05-01（以仓库 `smark-app/` 为准）

**协作者 / AI 助手**：每次开工或提交前应先阅读本节与下方「已实现功能」真值；完成功能或行为变更后，**必须同步更新 `claude.md`**（必要时再更新 `README.md`），避免文档与代码漂移。

---

## 0. 产品规格（阅读 / 编辑 / 复习 / 展示 · 已与用户对齐）

以下为目标行为；**与当前代码不一致处 = 待开发**，实现时以本节为准。

### 0.1 阅读模块

- **划线**、**字号**、**画面主题**均在**阅读**内完成（导入乱码等不在此纠正正文）。
- **选字与划线交互（目标，已实现主路径）**
  - **进入可选中状态**：在正文区域 **长按约半秒**，由系统选中一词并出现左右拖动手柄；长按明确作为「我要选字」入口。
  - **扩大/缩小选区**：单侧拖动手柄扩展或收缩选区（系统行为）。
  - **选区稳定后**：出现 **RN 层横向工具条**（划线、复制、搜索）；`selectionchange` 侧经防抖后再上报，减少抖动。
  - **已有划线**：轻点高亮区弹出工具条（删除划线、复制、搜索）。
- **系统浮层**：Android WebView 对 `menuItems={[]}` 原实现会绕开系统 `ActionMode` 回调导致选区异常；已用 **`patch-package`** 修补 `react-native-webview`（`RNCWebView.startActionMode` 在空菜单时委托系统 callback 并 `menu.clear()`），以保留选区句柄、去掉系统复制条，便于只展示上述 RN 工具条。
- **阅读工具条**：导航栏右上角 **「编辑」**（黑底白字，进 `/edit/[id]`）；**主题、字号、列表**为 **叠在 WebView 底部的绝对定位条**（不占 flex 高度），随滚动与点按正文区域可 **收起/展开**；正文 **`padding-top`** 固定小留白、**`padding-bottom`** 随底栏显隐与安全区由注入 JS 调整，避免底栏遮挡末段文字。
- **回原文定位**：`/read/[id]?highlightId=…`，正文内 `span.hl` 带 `data-hl-id`，加载后滚动到视区中部。

#### 0.1.1 阅读交互待办（后续迭代）

- **写想法**：选区工具条、划线工具条上的「写想法」及与笔记/划线列表的联动（产品与数据结构另定）。
- **搜索**：当前为外链（如百度）占位；**未接入**外部百科/词典等；后续接具体提供方或应用内页。
- **想法与笔记关系**：与 `highlights.note`、列表编辑等一并做交互与信息架构优化。
- **更细的动效与布局**：工具条贴选区、安全区、横屏等（在稳定功能后再打磨）。

### 0.2 编辑模块

- **仅用于对正文人工矫正**（乱码、错字、格式等）：独立页 **`/edit/[id]`**（入口：阅读页导航栏 **「编辑」**），可编辑 **标题与正文**，保存时更新 `articles`。
- **保存编辑时**：若正文相对**上一次已保存版本**有变化 → **先提示用户**；确认后执行 **软删除本篇全部划线**（`highlights` 中该 `article_id` 且未删记录统一写入 `deleted_at`），再写入新标题与正文。若仅标题变化而正文未变，则不清划线。避免 `start/end` 与改后正文错位。

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
| **M1** | 本地闭环：导入 → 阅读 → 划线 → 划线列表 → 划线复习 + Quick Card（合并随机池） | **已对齐 §0 主路径**：`in_review`、回原文定位、展示板与合并随机池、**矫正正文**页与清划线；阅读页 **RN 选区/划线工具条** + **底栏叠层**（主题/字号/列表）+ Android 空 `menuItems` 补丁；**待增强**：写想法、搜索接入、动效；可选：减少 WebView 整页重载闪动 |
| **M2** | Supabase 邮箱 OTP 登录；Profile 登录/退出 | **部分落地**：`profile.tsx` 已含 OTP、退出、立即同步与本机服务配置；完整 DoD 仍以 §8.2 为准 |
| **M3** | 增量同步、软删除、LWW 冲突 | **未开始** |

---

## 2. 已实现功能清单（按页面）

### 2.1 根与数据

- [`smark-app/app/_layout.tsx`](smark-app/app/_layout.tsx)：启动时 `initDb()`，根包裹 **`SafeAreaProvider`**（供 Tab 页内 `TabScreenHeader` 使用 `useSafeAreaInsets`），Stack 注册 tabs / import / read / **edit** / highlights / **quick-cards** / **review-search** / perses-memory。
- [`smark-app/app/(tabs)/_layout.tsx`](smark-app/app/(tabs)/_layout.tsx)：`Tabs` **`headerShown: false`**；底栏图标：**未选中**为 **`Feather` 细线**（`home` / `book-open` / `star` / `user`），**选中**为 **`Ionicons` 实心**（`home` / `book` / `sparkles` / `person`），避免 Ionicons outline 笔画偏粗；**`tabBarActiveTintColor`** `#2563eb`、未选中 `#6b7280`、标签 **`fontWeight: '500'`**、顶部分割线。顶栏由各 Tab 页内 [`TabScreenHeader`](smark-app/components/TabScreenChrome.tsx) 自建（大标题 + 右侧主按钮 / 自定义左侧 + 分隔线），与首页 mockup 一致。
- [`smark-app/services/db.ts`](smark-app/services/db.ts)：SQLite `smark.db`；表 `articles`、`highlights`、`quick_cards`；软删除字段 `deleted_at`；文章/划线/Quick Card 的 CRUD 与列表查询；划线含 **`updateHighlightQuote`**（仅更新 `quote` 字段，供复习池弹窗编辑摘录）；**学习动态**用 **`getLearningOverview`**（总量 + 近 7 日粗指标）、**`getLearningActivityFeed`**（按 `updated_at` 混排最近条）。
- **未建表**：独立 `cards` 表未落地。`listReviewHighlights()` 仅 `in_review=1`；Quick Card 与划线条目合并参与复习 Tab 的随机池展示。

### 2.2 `/(tabs)/index` — 文章列表

- [`smark-app/app/(tabs)/index.tsx`](smark-app/app/(tabs)/index.tsx)：页内顶栏 **「文章」** + 黑底 **「导入」** + 分隔线（顶栏随 **安全区** 下移，避免压住状态栏）；列表为圆角卡片：**标题单行**、**摘要两行**（超出省略）；底栏左侧 **更新时间**（与图示一致的 `en-US` 12h 含秒）、右侧蓝色 **「编辑」**（进 `/edit/[id]` 矫正正文）；点击标题区进 `/read/[id]`；**向左滑**（`renderRightActions`）露出**右侧**红色 **「删除」**，确认后软删除。

### 2.3 `/import` — 导入文章

- [`smark-app/app/import.tsx`](smark-app/app/import.tsx)：全屏页（Stack **`headerShown: false`**）；顶栏 **安全区**（外层 `headerWrap`，与 [`TabScreenHeader`](smark-app/components/TabScreenChrome.tsx) 一致避免覆盖内容行 `paddingTop`）+ 返回（`Ionicons`）+ **分段器**（链接导入 / 粘贴导入）+ 分隔线；内容行复用 **`tabHeaderRowVerticalLayout`** 与 **横向 16**；返回与右侧占位宽度为 **`tabHeaderTapTargetSize`（40）**，与 `HeaderSearchIconButton` 行高一致，避免 44px 触控框撑高整行导致分隔线与 Tab 页不齐；分段器略收紧垂直内边距以不高于该行。**链接导入**：初始仅链接框（占位「粘贴文章链接」）与黑底 **「从链接抓取并填充」**（[`importUrlFetch`](smark-app/services/importUrlFetch.ts)）；**抓取成功后才出现** 标题、正文与 **「保存」**（保存后仍进入阅读）。**粘贴导入**：无链接区与抓取按钮，直接进入标题 + 正文 + **「保存」**；两种模式共用同一套标题/正文草稿；从粘贴切回链接时若已有标题或正文则展开编辑区，避免草稿被隐藏。

### 2.4 `/read/[id]` — 阅读 + 划线

- [`smark-app/app/read/[id].tsx`](smark-app/app/read/[id].tsx)：
  - 高亮 `<span class="hl" data-hl-id>`；query **`highlightId`** 时加载后滚到对应句。
  - 顶栏：导航栏 **「编辑」**（进 `/edit/[id]`）；**主题、字号、列表**为 **叠层**于 WebView **底部**，不挤占 flex 高度。
  - **选区**：`selectionchange` 防抖后上报；RN 浮层 **复制 / 划线 / 搜索 / 取消**；选区 `rect` 使用 **视口坐标** 定位工具条。
  - **已有划线**：轻点高亮 → **复制 / 删除 / 搜索 / 关闭**。
  - WebView：`menuItems={[]}` + 补丁 [`smark-app/patches/react-native-webview+13.15.0.patch`](smark-app/patches/react-native-webview+13.15.0.patch)；`npm` **`postinstall`: `patch-package`**。
  - **滚动**：页内 `scroll` 节流 → `postMessage` → RN 写入 AsyncStorage；`onLoadEnd` 用 `pendingRestoreY`（保存划线前）或存储值 `scrollTo`（减轻整页重载回顶）。
  - **正文边距**：WebView 内 `body` 顶 `padding-top` 固定小值；**`padding-bottom`** 由 `injectBodyPaddingBottom` 随底栏显隐与 **`useSafeAreaInsets().bottom`** 注入，避免末段被底栏遮挡。
  - **反馈**：成功 `ToastAndroid` + `expo-haptics` Light；无选区/重复区间有短提示。
- [`smark-app/services/readerPrefs.ts`](smark-app/services/readerPrefs.ts)：
  - `smark_reader_prefs`：主题 `light | eye | dark`，字号 `sm | md | lg`。
  - `smark_read_scroll_${articleId}`：滚动 `y`。

### 2.5 `/highlights/[id]` — 本文划线列表

- [`smark-app/app/highlights/[id].tsx`](smark-app/app/highlights/[id].tsx)：列表、**加入复习** `Switch`、`note`、软删除。

### 2.6 `/edit/[id]` — 矫正正文

- [`smark-app/app/edit/[id].tsx`](smark-app/app/edit/[id].tsx)：与 Quick Card 编辑相同范式——自建顶栏 **← · 居中「编辑」· 黑底「保存」**、分隔线；**标题** + **正文** 分区与占位文案；**正文框固定可视高度**（约屏高 36%，上限 340），过长时在框内滚动编辑；底部居中红色 **删除此文章**（`softDeleteArticle`）。保存：标题或正文任一有改动时可保存；仅**正文**相对载入变化 → 提示 → 软删除本篇全部划线 → `updateArticle`；仅改标题则直接 `updateArticle`。`Stack` **`headerShown: false`**。

### 2.7 `/(tabs)/review` — 复习 Tab

- [`smark-app/app/(tabs)/review.tsx`](smark-app/app/(tabs)/review.tsx)：页内顶栏 **「复习」** + **`HeaderSearchIconButton`**（`Ionicons` 放大镜 + 浅灰圆形容器，`router.push('/review-search')`）+ **⋯** → `/quick-cards`。**添加到Quick Card** 卡片：输入 + 主按钮「加入复习池」（写入 `quick_cards`）。**随机复习池**卡片：标题行右侧 **「共 n 条」** 胶囊；**展示舞台** 左侧色条（划线蓝 / Quick Card 紫）+ 浅底圆角区 + 轻阴影；**类型徽章**行：划线 / Quick Card 右侧 **「编辑」** 打开与 **Perses 助手「编辑」同构** 的居中 Modal（半透明遮罩、白底圆角卡、标题 **「编辑」**、说明文案、**浅蓝描边**主输入框、底栏 **取消** / **黑底保存**）；划线走 **`updateHighlightQuote`**（仅改 `quote` 展示；阅读原文仍以 `start`/`end` 为准），Quick Card 走 **`updateQuickCard`**（正文 + 可选备注）；**不展示**「来自…」与「展示板」副行；正文 **更大字号与行距**；空态含图标；**换一条**；划线底栏 **左「从复习池移除」**、**右「回原文定位」**；Quick Card **「删除 Quick Card」**（软删除）。
- [`smark-app/app/review-search.tsx`](smark-app/app/review-search.tsx)：独立全屏 **`headerShown: false`**；顶栏 **安全区** + **`Ionicons` 返回** + **胶囊搜索框**（浅灰底、占位「输入文本内容进行搜索」、框内右侧放大镜，仅搜 **Quick Card** 正文/备注）；分隔线；下方列表为与复习页一致的 **`tabListCard`** 结果卡片，**点按命中行**打开 **底部弹层 Modal** 展示 **正文 + 备注全文** 与更新时间；弹层 **「关闭」** / **「编辑」**（`router.push` 至 `/quick-cards` 并带 **`editId`**，由 Quick Card 页自动打开该条编辑 Modal）；无关键词时灰色说明文案，无命中时提示「无匹配的 Quick Card」。
- [`smark-app/app/quick-cards.tsx`](smark-app/app/quick-cards.tsx)：**全部 Quick Card**；顶栏返回 + 居中标题 **QuickCard** + 分隔线；列表项为圆角灰框卡片（正文、可选备注、`updated_at` 时间 + **编辑**，与文章列表同色）；**向左滑**露出**右侧**红色 **「删除」**（`Swipeable` + `renderRightActions`），确认后 `deleteQuickCard`；**编辑** 打开全屏 Modal：顶栏 **`Ionicons` 返回** + 居中粗体 **「编辑」** + 黑底圆角 **「保存」**；**正文** 大输入框（灰边圆角、占位与稿图一致）、**备注（可选）**、底部居中红色 **「删除此卡片」**（`updateQuickCard` / `deleteQuickCard`）；`Stack` **`headerShown: false`** 自建顶栏。支持路由参数 **`editId`**（复习搜索页「编辑」跳转）：`useFocusEffect` 拉列表后匹配 id 并自动打开编辑 Modal，随后 **`router.replace('/quick-cards')`** 清参。入口为复习页顶栏「⋯」或 `router.push('/quick-cards')`。

### 2.8 `/(tabs)/profile` — 我的

- [`smark-app/app/(tabs)/profile.tsx`](smark-app/app/(tabs)/profile.tsx)：顶栏 **`TabScreenHeader`** 左侧分段器 **「学习动态」|「个人中心」**（与导入页同款黑底选中；分段器轨道为浅灰小块，**整页白底**），**无**顶栏「导入」。**学习动态**：顶部说明文案；摘要区为 **单块浅灰底列表卡**（细边框）：首行 **复习随机池 · 可抽取条目** 与大号合计数 + 脚注（组成说明）；分隔线后 **本地总量** 四行键值（文章 / 划线 / Quick Card / 划线·已加入复习）；再分隔线后 **近 7 日** 三行（新划线 / 文章有更新 / Quick Card 变动）；无彩色图标卡栅格；**最近动态** 先 **三分类分段器**（文章 / 划线 / Quick Card），再列出该分类下按时间排序的左图标圆底 + 正文 + **`chevron-forward`** 列表；数据来自 `getLearningOverview` / `getLearningActivityFeed`；进入分段或回到本 Tab 时刷新。**个人中心**：白底卡片 **「账号」**（已登录：邮箱、上次同步、**立即同步** 描边按钮浅灰边框、**退出登录** 黑底实心；未登录：OTP）；**服务与接口** 圆角灰框卡片：**Perses API Key**（`SK-`、`secureTextEntry`）+ **Perses 接入地址（可选，https）** + **保存服务配置**；说明文案含 **阿里云百炼 OpenAI 兼容 Base** 用法（见 §2.9）。直连时 **本机接入地址优先于** `EXPO_PUBLIC_PERSES_HTTP_URL`，请求头 `Authorization: Bearer <Key>`；仅地址无 Key 仍兼容旧版无密钥 POST。Supabase **不在此填写**，由构建时 `EXPO_PUBLIC_SUPABASE_*` 注入。**不含**阅读偏好编辑（阅读主题与字号仅在阅读页顶栏调整）。未配置直连时可登录后用 Edge `perses_proxy`。

### 2.9 Perses（对话 + 人设文件）

- **内置默认文案**：`docs/perses/memory/SOUL.md`、`USER.md`、`MEMORY.md` 与 [`docs/perses/PERSES_RUNTIME_SYSTEM.zh.md`](docs/perses/PERSES_RUNTIME_SYSTEM.zh.md) 为真源；经脚本生成与 App 集成的副本为 [`smark-app/services/persesBundled.ts`](smark-app/services/persesBundled.ts)（勿手改该生成文件，改 docs 后重新生成）。
- **生成命令**（仓库根目录）：`node scripts/embed-perses-bundled.js`
- **本地持久化**：[`smark-app/services/persesMemory.ts`](smark-app/services/persesMemory.ts) 用 AsyncStorage 存用户编辑后的三文件内容；未保存覆盖时使用 `persesBundled` 默认。
- **UI**：[`smark-app/app/(tabs)/perses.tsx`](smark-app/app/(tabs)/perses.tsx) 页内顶栏 **「Perses」** + **⋯**（`/perses-memory`）；会话区 **浅灰底**（`#f1f3f5`）。**用户消息**为 **深色气泡**（大圆角 + **右下小圆角**作尾巴）。**助手消息**为 **白色对话气泡**：细灰边 + 轻阴影，**左上/上/右下大圆角、左下小圆角**；气泡内正文 + 底部分隔线 + **左时间（`en-US`）+ 右「编辑」**；**「编辑」** 打开居中弹窗后 **「加入 Quick Card」** 入库。底部为圆角输入条 + 发送 FAB。
- **请求体**：默认由 `buildPersesRequestPayload` 组装 `prompt`、`soulMd`、`userMd`、`memoryMd`、`runtimeSystemZh`；**自定义网关**与 Supabase [`perses_proxy`](supabase/functions/perses_proxy/index.ts) 走该 JSON（Edge 将五段拼成一条 `prompt` 再 POST 上游 `PERSES_UPSTREAM_URL`）。若接入地址为 **阿里云百炼 OpenAI 兼容模式**（URL 含 `dashscope*.aliyuncs.com` 与 `compatible-mode`），App 自动 POST `…/v1/chat/completions`，请求体为 **`{ model, messages }`**（人设与本轮合并为一条 `user` 内容，与 Edge 拼装规则一致），默认模型 **`qwen-turbo`**，可用 **`EXPO_PUBLIC_PERSES_DASHSCOPE_MODEL`** 与本机「对话模型（百炼）」覆盖；解析 `choices[0].message.content`。若接入地址为 **DeepSeek**（主机 `api.deepseek.com` 且非 `/anthropic` 路径），App 自动 POST [官方文档](https://api-docs.deepseek.com/zh-cn/) 中的 **`…/chat/completions`**（仅填 Base `https://api.deepseek.com` 或 `…/v1` 时自动补全，避免根路径 404），请求体同为 **`{ model, messages }`**，默认模型 **`deepseek-chat`**，可用 **`EXPO_PUBLIC_PERSES_DEEPSEEK_MODEL`** 与本机「对话模型（DeepSeek）」覆盖。
- **直连错误提示**：非 2xx 时助手气泡展示状态码与响应体片段；**HTTP 404** 时额外附 **实际 POST 路径**（不含主机）及百炼 / DeepSeek / 自定义网关各一句排查说明（多为路径未对齐文档）。

---

## 3. 依赖与工程

- **目录**：可运行代码在 [`smark-app/`](smark-app/)（Expo SDK 54、Expo Router、TypeScript）。
- **主要依赖**：`expo`、`expo-router`、`expo-sqlite`、`react-native-webview`、`@react-native-async-storage/async-storage`、`expo-haptics`；业务状态以组件 state + DB 为主。
- **原生补丁**：`patch-package`（`devDependencies`）；安装依赖后自动执行 `patch-package`，对 `react-native-webview` Android `RNCWebView` 的文本选择 `ActionMode` 行为打补丁。补丁在 **`expo run:android` / EAS Build 等会编译本机 `node_modules` 原生代码的流程** 中生效；**Expo Go 自带预编译原生**，不会应用仓库内对 `RNCWebView.java` 的修改，Android 上若仍出现系统选词条与 RN 工具条冲突，需改用 **Dev Client** 或正式构建验证。
- **真机调试**：`cd smark-app && npx expo start`；跨网用 `npx expo start --tunnel`。需在 **`smark-app`** 下执行，勿在仓库根目录无 `package.json` 处执行。
- **npm**：若 `ERESOLVE` peer 冲突，可使用 `npm install --legacy-peer-deps`。
- **Perses 文案嵌入**：修改 `docs/perses/` 下 Markdown 后，在仓库根目录执行 `node scripts/embed-perses-bundled.js`，再提交 `smark-app/services/persesBundled.ts`。

---

## 4. 已知限制与后续可选项

- **§0 待开发清单（摘要）**：写想法、搜索接入、想法与笔记关系等见 **§0.1.1**；其余 §0 主路径已在代码落地。
- **WebView 整页重载**：新划线后仍会更新 `source` 导致整页重载；当前用 **滚动恢复** 缓解回顶；若要「零闪」需 M1+ 方案（例如 `injectJavaScript` 在 DOM 内包 span、延迟 `setHighlights` 等），尚未实现。
- **Android 文本选择**：依赖上游 WebView + 本仓库补丁；大版本升级 `react-native-webview` 后需复查补丁是否仍适用或已合并上游。
- **平台**：规划为 Android 为主；`ToastAndroid` 等部分反馈未做 iOS 等价实现。
- **组件库**：README 规划中曾列出的 `hooks/`、`summary/` 等**当前仓库不存在**；Tab 顶栏与列表卡片样式见 [`smark-app/components/TabScreenChrome.tsx`](smark-app/components/TabScreenChrome.tsx)。

---

## 5. 数据模型（与同步预留一致）

- `articles`：`id, title, content, created_at, updated_at, deleted_at`
- `highlights`：… + **`in_review`**（0/1，默认 0）
- `quick_cards`：`id, front, back, created_at, updated_at, deleted_at`

---

## 6. 协作提示

- **文档**：行为或架构有变时先更新 `claude.md` 真值；对外说明再改 `README.md`。
- 改阅读行为时优先改 [`read/[id].tsx`](smark-app/app/read/[id].tsx) 与 [`readerPrefs.ts`](smark-app/services/readerPrefs.ts)。
- 改数据结构时改 [`db.ts`](smark-app/services/db.ts) 并评估迁移（MVP 阶段可接受卸载重装清库）。
- 改 Perses 默认人设/运行时提示时改 `docs/perses/`，运行 `node scripts/embed-perses-bundled.js`，提交 `persesBundled.ts`。

---

## 7. 需要你配合的验证

- Android 真机 + Expo Go（SDK 与项目一致）或 dev client。
- UI 仍以原型可用为主；隐私 MVP 不加密。

---

## 8. 项目规划（执行视角，给协作者/AI）

本节是“接下来怎么做”的执行计划，不替代第 0~7 节的现状真值。若计划与代码不一致，以“现状真值”优先，再补计划。

### 8.1 近期（M1 收尾，1~2 周）

**目标**
- 完成阅读交互细节，减少“可用但不顺滑”的体验缺口。
- 在不改动核心数据结构前提下，降低 WebView 重载闪动感。

**核心任务**
- 选区工具条补全“写想法”入口，并与 `highlights.note` 的读写联动。
- 搜索从外链占位升级为可配置 provider（先保留最小可行实现）。
- 评估并落地“减少整页重载”的一版策略（优先 DOM 注入与局部更新）。

**完成定义（DoD）**
- 阅读页可在选区工具条中直达“写想法”，并在列表页看到一致结果。
- 新增划线后滚动位置稳定，不出现明显“跳顶”或整屏闪烁（可接受轻微刷新）。
- Android 真机回归：划线、删除、回原文定位、矫正清划线全部通过。

**风险点**
- WebView 注入脚本复杂度上升，容易引入边界 bug（如重复包裹、高亮错位）。
- Expo Go 与 Dev Client 原生行为差异，可能导致验证结果不一致。

**验证方式**
- 使用“导入→划线→加入复习→复习回原文→矫正”全链路回归。
- Android 至少两台不同系统版本机型验证（建议一台主力机 + 一台备用机）。

### 8.2 中期（M2，2~4 周）

**目标**
- 完成账号基础能力（Supabase OTP），补齐 §8.2 DoD（含重启后登录态恢复等）。

**核心任务**
- 引入 Supabase 客户端配置与环境变量约定（仅 `.env.example` 入库）。
- 完成登录态管理、登录/退出流程、Profile 页面状态展示。
- 处理未登录与已登录下的页面差异（最小可行版本）。

**完成定义（DoD）**
- 用户可通过邮箱 OTP 登录和退出。
- 重启 App 后登录态可恢复（在合理安全边界内）。
- Profile 页展示当前登录信息和可用操作（至少含退出）。

**风险点**
- Expo 环境变量与多环境配置混乱，导致联调成本增加。
- 鉴权状态与本地数据边界不清，可能产生“看似登录成功但功能不可用”。

**验证方式**
- 新账号/旧账号各走一遍 OTP 登录流程。
- 弱网场景验证超时、重发、退出后的状态一致性。

### 8.3 中长期（M3，4~8 周）

**目标**
- 建立“本地优先 + 云端同步”的可恢复机制，支持多端与冲突处理。

**核心任务**
- 设计并实现增量同步（按 `updated_at` + `deleted_at` 拉推）。
- 明确冲突策略（LWW）及同一记录多端修改行为。
- 建立失败重试、断网恢复、手动触发同步入口。

**完成定义（DoD）**
- 同一账号在两台设备增删改后，最终数据一致。
- 软删除可正确同步，不出现“墓碑丢失导致数据复活”。
- 同步失败可恢复，且不会破坏本地可读可写能力。

**风险点**
- 时间戳依赖导致时钟偏差问题（设备时间不准时冲突判断可能失真）。
- 批量同步时数据库写入性能与 UI 卡顿。

**验证方式**
- 双设备脚本化回归：离线改动→上线同步→冲突写入→最终一致性检查。
- 灰度期间记录同步日志，追踪失败率与恢复率。

---

## 9. 文档职责边界（README vs claude）

- `README.md`：面向项目使用者与新开发者，目标是“快速理解项目做什么、怎么跑起来、怎么验证成果（含跨网络 Expo）”。
- `claude.md`：面向协作者与 AI，目标是“当前实现真值 + 可执行规划 + 风险与验证标准”；**Cursor / AI 助手每次完成任务或改动行为前应对照本节真值，完成后若行为或架构有变须更新本章**。
- 维护原则：功能行为有变化时先更新 `claude.md` 真值，再回写 `README.md` 的对外说明，避免两份文档相互漂移。
