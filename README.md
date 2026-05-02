# Smark / 阅记

**本地优先（SQLite）的 Android 阅读 App**：导入文章 → 阅读划线 → 选择部分划线加入复习池 → 复习页随机回看（含 Quick Card 展示）。

更细的实现真值与规划见 `claude.md`。

---

## 30 秒启动

### 环境

- Node.js 18+（建议 LTS）
- Android 手机安装 Expo Go

### 安装依赖（必须在 `smark-app/` 目录）

```bash
cd smark-app
npm install
```

如果遇到 `ERESOLVE`：

```bash
npm install --legacy-peer-deps
```

### 启动（跨网优先用 tunnel）

```bash
cd smark-app
npx expo start --tunnel
```

清缓存重试：

```bash
npx expo start --tunnel -c
```

### 在手机打开

- 终端出现二维码后用 Expo Go 扫码
- 跨网更稳：电脑和手机登录同一个 Expo 账号，从 Expo Go 项目列表进入

---

## 3 个常见坑

- **必须在 `smark-app/` 下执行命令**（仓库根目录没有可运行的 `package.json`）
- **跨网就用 `--tunnel`**（普通 `npx expo start` 需要手机和电脑同一局域网）
- **Expo Go 与 Dev Client 行为可能不同**：本项目对 `react-native-webview` 有 `patch-package` 原生补丁，Expo Go（预编译）通常不会应用补丁；要严格验证 Android 选区/工具条等原生行为，用 Dev Client 或正式构建

---

## 1 分钟验收（确保你跑到的是“项目成果”）

1. 首页 → 导入一篇文章 → 保存并阅读
2. 阅读页长按进入选字 → 划线
3. 点阅读页右上角「列表」→ 把该划线「加入复习」打开
4. 切到“复习”Tab → 抽到该划线并可回原文定位
5. 在复习页添加一条 Quick Card → “换一条”能抽到展示条目
6. 阅读页底栏点「编辑」改正文并保存 → 旧划线被清除

---

## 开启多端同步（可选，Supabase）

如果你需要多设备同步：按文档一步步配置 Supabase（建表/RLS/部署 `sync` 函数/客户端 `.env`）。

- 见：`docs/supabase-setup.md`

