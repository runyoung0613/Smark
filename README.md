# Smark / 阅记

**阅记（Smark）**：Android 侧重的本地优先阅读工具——导入文章、阅读时荧光笔划线；划线可进入随机复习；**Quick Card** 为随机**展示板**（刷新切换），当前不按「复习」能力设计（见 [`claude.md`](claude.md) §0.5）。

---

## 项目规划与路线图

### 产品目标（MVP / 1.0）

1. **导入**：手动标题 + 粘贴正文（先跑通闭环；网页剪藏等后续扩展）。
2. **阅读**：可读、可配置字号与主题；划线为「荧光笔」式高亮（规划：长按选区弹出选项再划线，见 [`claude.md`](claude.md) §0）。
3. **编辑（正文矫正）**：导入后可单独进入编辑，对正文人工纠错；**若保存时正文相对上次有变，提示后软删除本篇全部划线**（避免偏移错位），详见 [`claude.md`](claude.md) §0.2。
4. **划线**：选区对应原文 `start/end` + `quote` 存库；列表支持备注、删除；**规划**：多选勾选后仅被选划线进入复习池（`in_review`）。
5. **复习/展示（合并随机池）**：复习 Tab 将 **已勾选进入复习池的划线** 与 **Quick Card 展示板** 合并随机展示；抽到划线可 **回原文** 定位，抽到 Quick Card 仅展示文本；不做间隔重复算法（MVP）。见 [`claude.md`](claude.md) §0.4–§0.5。
6. **Quick Card（展示板）**：Quick Card 仅用于展示，参与与划线同一随机池的展示抽取；不提供复习能力。见 [`claude.md`](claude.md) §0.5。
7. **隐私**：MVP 阶段数据仅本地 SQLite，**不加密**；云端同步为后续阶段。

### 里程碑

| 阶段 | 内容 | 状态 |
|------|------|------|
| **M1** | 本地闭环：SQLite、导入、阅读、划线、划线列表、划线复习、Quick Card 合并随机池展示 | **已完成主体**；待对齐 [`claude.md`](claude.md) §0（编辑正文与清空划线、`in_review`、回原文、随机池展示等） |
| **M2** | Supabase Auth（邮箱 OTP）、Profile 登录/退出 | **规划中** |
| **M3** | 云端备份与增量同步、软删除、Last-Write-Wins | **规划中** |

### 技术方向（已定）

- **客户端**：Expo（React Native）+ Expo Router；本地主库 **SQLite**（`expo-sqlite`）；阅读器 **WebView**（选区与渲染）；阅读偏好与滚动 **AsyncStorage**（见 `services/readerPrefs.ts`）。
- **云端（M2/M3）**：Supabase Auth + Postgres + RLS；同步策略以 `updated_at`、软删除为基础。

### 详细开发进度（给实现与 AI 用）

**请以 [`claude.md`](claude.md) 为准**：其中按文件列出了当前已实现能力、已知限制、目录与依赖说明，并会随开发更新。

---

## 仓库与运行方式

### 实际目录结构（与代码一致）

应用代码在子目录 **`smark-app/`**（仓库根目录下的 `README` / `claude.md` 为产品说明；**不要在根目录执行 `npm run start`**）。

```
Smark/
├── README.md                 # 本文件：规划与如何运行
├── claude.md                 # 开发进度与实现细节（真值）
└── smark-app/
    ├── app/                  # Expo Router
    │   ├── _layout.tsx
    │   ├── (tabs)/           # 首页、复习、我的
    │   ├── import.tsx
    │   ├── read/[id].tsx
    │   └── highlights/[id].tsx
    ├── services/
    │   ├── db.ts             # SQLite
    │   └── readerPrefs.ts    # 阅读主题/字号/滚动
    ├── package.json
    └── ...
```

### 本地运行（Expo Go / 真机）

```bash
cd smark-app
npm install
# 若遇依赖 peer 冲突，可改用：npm install --legacy-peer-deps
npx expo start
# 手机与电脑不在同一 Wi-Fi 时：
npx expo start --tunnel
```

使用 **Expo Go** 扫描终端中的二维码；需保证 Expo Go 支持当前 **Expo SDK**（与 `smark-app/package.json` 中 `expo` 版本一致）。

---

## 设计与原型（参考）

- [墨刀思维导图](https://modao.cc/board/share/XwaixF2CtcozzdfpHnRdb)
- 以下为历史选型记录，**不等价于当前仓库文件结构**（实现以 `smark-app/app` + `services` 为准）：

**UI 工具与原型（摘录）**

- [Stitch](https://stitch.withgoogle.com/projects/17313191523047679250)、[Lovart](https://www.lovart.ai/canvas)、[Lovable](https://lovable.dev/projects/b24fe8fb-354d-444d-841a-daf5132403df)、[墨刀原型](https://modao.cc/proto/Eif4tWiptcg5a3liDrdGyz/sharing?view_mode=read_only&screen=rbpVErmSRVAZwsjnD)  
- 目标：**Android 竖屏**风格；具体交互以可运行 App 与 `claude.md` 为准。

---

## 版本与分支（约定）

- 版本号 `x.y.z`：`x` 重大架构，`y` 功能，`z` 修复。
- `main`：稳定；`develop`：开发；`feature/*`、`fix/*`：特性与修复分支。
