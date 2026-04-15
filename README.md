# Smark / 阅记

Smark（阅记）一个 **本地优先（SQLite）** 的 Android 阅读工具
具体功能
1、导入文章、阅读划线把部分划线加入复习池，
2、用户向AI提问，AI对所提问内容进行判断将提问知识加入复习池。
复习池：Quick Card 随机展示，快速回看重点内容。

---

## README 给谁看

这份文档面向两类人：

- **项目使用者**：想知道 App 现在能做什么、怎么跑起来、怎么验证流程。
- **新加入开发者**：第一次接手代码，想快速理解项目边界、当前进度、关键目录。

文档分工：

- `README.md`：讲清楚项目是什么、怎么跑、现在到哪一步。
- `claude.md`：讲清楚当前实现真值与后续规划，主要给协作者/AI 做开发对齐。

---

## 1 分钟看懂项目

### 产品目标

把“阅读 + 划线 + 回看”做成一个轻量闭环，优先保证本地可用，再逐步上云同步。

### 当前核心能力

- 文章导入：粘贴标题和正文后保存到本地 SQLite。
- 阅读器：支持主题、字号切换和正文划线。
- 划线管理：每条划线可单独“加入复习”（默认关闭）。
- 复习池：`in_review=1` 的划线 + Quick Card 合并随机展示。
- 矫正正文：正文改动保存时会清除本篇旧划线，避免偏移错位。

### 明确边界（MVP）

- 当前不做云同步、不做账号系统、不做加密。
- Quick Card 是“展示板”，不是间隔重复卡片系统。

---

## 项目进度（截至当前仓库代码）

| 阶段 | 目标 | 当前状态 |
|---|---|---|
| M1 | 本地闭环（导入→阅读→划线→划线列表→复习池） | 已完成主路径；仍有交互打磨项（写想法联动、搜索接入、减少 WebView 重载闪动） |
| M2 | Supabase 邮箱 OTP 登录（Profile） | 未开始（Profile 仍为占位） |
| M3 | 增量同步、软删除同步、LWW 冲突策略 | 未开始 |

更细的实现细节与规划请看 `claude.md`。

---

## 快速上手（首次 10 分钟）

### 1) 环境准备

- Node.js 18+（建议 LTS）
- npm 9+（或兼容版本）
- Android 手机安装 `Expo Go`
- 电脑可正常访问外网（跨网调试依赖 Expo Tunnel）

### 2) 安装依赖（必须在 `smark-app` 目录）

```bash
cd smark-app
npm install
```

如遇依赖冲突（`ERESOLVE`）：

```bash
npm install --legacy-peer-deps
```

### 3) 启动项目（你的手机和电脑不在同一网络时）

```bash
cd smark-app
npx expo start --tunnel
```

> 不同网络场景必须优先使用 `--tunnel`。  
> 普通 `npx expo start`（LAN）通常要求手机和电脑在同一局域网。

---

## 跨网络真机预览（重点）

你的条件是“电脑和手机不在同一网络”，按下面做：

1. 在电脑项目目录执行：
   ```bash
   cd smark-app
   npx expo start --tunnel
   ```
2. 等待终端出现 `Tunnel ready` / 二维码。
3. 手机打开 `Expo Go`。
4. 推荐方式：**电脑和手机登录同一个 Expo 账号**（比纯扫码更稳，跨网成功率更高）。
5. 在 Expo Go 的项目列表中打开当前项目；也可以直接扫描二维码尝试进入。
6. 首次加载可能较慢，等待打包完成后进入 App。

### 跨网络建议

- 网络波动时先等 20~60 秒，不要频繁重复点开项目。
- 如果卡死在 connecting，先在电脑终端 `Ctrl + C`，重新执行 `npx expo start --tunnel`。
- 必要时加清缓存：
  ```bash
  npx expo start --tunnel -c
  ```
- 如果公司网络限制较多，换一个更稳定网络（如手机热点）再试。

---

## 如何确认你看到的是“项目成果”

进入 App 后按以下路径点一遍：

1. 首页 → 右上角“导入”。
2. 输入标题和正文 → “保存并阅读”。
3. 阅读页选中文字并划线。
4. 打开“列表”，把该划线“加入复习”开关打开。
5. 切到“复习”Tab，确认能抽到该划线。
6. 在复习页添加一条 Quick Card，再次“换一条”，确认可抽到展示板条目。
7. 回到阅读页点“矫正”，改正文并保存，确认旧划线被清除。

这条链路完整通过，就代表 M1 主路径已跑通。

---

## 目录与关键文件（新开发者必看）

可运行应用在 `smark-app/`：

```text
Smark/
├── README.md
├── claude.md
└── smark-app/
    ├── app/
    │   ├── _layout.tsx
    │   ├── (tabs)/index.tsx
    │   ├── (tabs)/review.tsx
    │   ├── (tabs)/profile.tsx
    │   ├── import.tsx
    │   ├── read/[id].tsx
    │   ├── edit/[id].tsx
    │   └── highlights/[id].tsx
    ├── services/db.ts
    ├── services/readerPrefs.ts
    ├── app.json
    └── package.json
```

常见改动入口：

- 阅读交互/高亮逻辑：`smark-app/app/read/[id].tsx`
- 复习池规则：`smark-app/app/(tabs)/review.tsx`
- 数据结构与迁移：`smark-app/services/db.ts`
- 阅读偏好与滚动恢复：`smark-app/services/readerPrefs.ts`

---

## 常见问题排查

### 1) `ERESOLVE` 安装失败

使用：

```bash
npm install --legacy-peer-deps
```

### 2) `expo start --tunnel` 很慢或连不上

- 先重启命令：`npx expo start --tunnel`
- 再试清缓存：`npx expo start --tunnel -c`
- 切换网络（例如电脑改连手机热点）
- 确保 Expo Go 已登录账号且网络可访问外网

### 3) 手机能打开 Expo Go，但看不到项目

- 确认电脑端确实使用了 `--tunnel`
- 电脑端和手机端尽量登录同一个 Expo 账号
- 重新启动 Expo Go 后刷新项目列表

### 4) 为什么 Expo Go 下某些原生行为和预期不一致

本项目用了 `patch-package` 修补 `react-native-webview` 的 Android 行为；这类原生补丁在 Expo Go（预编译客户端）里通常不会生效。  
如果要严格验证这部分行为，请使用 Dev Client 或正式构建。

---

## 技术栈

- Expo SDK 54
- Expo Router
- React Native 0.81
- SQLite（`expo-sqlite`）
- WebView（`react-native-webview`）
- AsyncStorage

---

## 下一步开发建议

1. M1 收尾：阅读交互细节（写想法、搜索接入）+ WebView 减少重载闪动。
2. M2 启动：Supabase OTP 登录与 Profile 页真正落地。
3. M3 设计：增量同步、冲突策略与恢复机制。

以上详细执行视角请看 `claude.md`。
