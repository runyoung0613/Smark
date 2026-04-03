# Smark / 阅记

面向 **Android** 的离线优先阅读与划线工具：导入长文 → 在阅读器中标注 → 用随机卡片复习关键句（含不挂文章的「一句话」卡片）。云端登录与同步在本地闭环稳定后再接入。

---

## 整体框架构思

### 产品边界（MVP）

- **先做通本地闭环**：不依赖网络即可导入、阅读、划线、列表管理、随机复习。
- **阅读与划线**：用 **WebView + HTML** 渲染正文，选区映射回原文 `start/end` 写入 SQLite，保证与纯文本索引一致。
- **复习**：不做间隔重复算法；卡片池 = 全部划线句 + Quick Card。
- **隐私**：MVP 阶段数据仅存本机、不加密；同步阶段再考虑加密与账号模型。

### 技术栈（选型理由）

| 层级 | 选择 | 作用 |
|------|------|------|
| 应用框架 | Expo（SDK 54） | 单代码库、真机调试成本低 |
| 路由 | Expo Router | 文件即路由，与页面范围一一对应 |
| 主数据 | `expo-sqlite` | 离线主库、结构便于后续增量同步 |
| 阅读器 | `react-native-webview` | 选区、荧光笔样式、与 RN 消息桥 |
| UI 状态 | 本地 `useState` / 可选 Zustand | 不以全局 store 替代 SQLite 真相源 |

### 架构原则

1. **离线优先**：读写先落 SQLite；同步（M3）只做增量与冲突策略，不改变「本机即主库」的心智。
2. **同步友好字段**：表中带 `created_at` / `updated_at` / `deleted_at`，为 LWW 与软删预留。
3. **前后阶段解耦**：M1 只做本地；M2 Auth；M3 Postgres + RLS + push/pull，避免早期反复迁移。

### 里程碑（摘要）

- **M1**：本地 SQLite + 导入 → 阅读 → 划线 → 划线列表 → 随机复习（含 Quick Card）。
- **M2**：Supabase 邮箱 OTP，Profile 登录/退出。
- **M3**：增量同步、软删除、Last-Write-Wins。

各页功能细节、数据表与实现差异、待办项见 **[claude.md](./claude.md)**。

---

## 仓库结构（与当前代码一致）

```text
Smark/
├── claude.md              # 任务级说明与规划（详）
├── README.md              # 框架与入口（略）
└── smark-app/             # Expo 工程
    ├── app/
    │   ├── _layout.tsx
    │   ├── import.tsx
    │   ├── read/[id].tsx
    │   ├── highlights/[id].tsx
    │   └── (tabs)/        # index · review · profile
    ├── services/
    │   └── db.ts          # SQLite 初始化与 CRUD
    ├── App.tsx            # 占位（实际入口为 expo-router/entry）
    ├── app.json
    └── package.json
```

---

## 设计与原型（参考）

- [墨刀思维导图](https://modao.cc/board/share/XwaixF2CtcozzdfpHnRdb)
- [墨刀交互原型](https://modao.cc/proto/Eif4tWiptcg5a3liDrdGyz/sharing?view_mode=read_only&screen=rbpVErmSRVAZwsjnF)（Android 竖屏、原生风格）
- UI 探索记录（Stitch / Lovart / Lovable 等）可归档在 `claude.md` 或团队笔记；产品实现以当前仓库与 `claude.md` 为准。

---

## 版本与分支（约定）

语义化版本 `x.y.z`：`x` 重大架构变更，`y` 功能新增，`z` 修复。

- `main`：稳定可发布  
- `develop`：集成开发  
- `feature/*`、`fix/*`：特性与修复分支  
