# 🛡️ NewApp Backup

[![Tauri](https://img.shields.io/badge/Framework-Tauri%20v2-blue?style=for-the-badge&logo=tauri)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Language-Rust-red?style=for-the-badge&logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/Frontend-React%2019-darkblue?style=for-the-badge&logo=react)](https://react.dev/)
[![Tailwind](https://img.shields.io/badge/Styling-Tailwind%20v4-teal?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)
[![Built with AI](https://img.shields.io/badge/Built%20with-Antigravity%20AI-blueviolet?style=for-the-badge)](https://deepmind.google/)

一个极致轻量、现代、安全的 Windows 备份专家。支持 **WebDAV 云端同步**、**7z/ZIP 高比例压缩** 与 **AES-256 军事级加密**。

> 💡 **重构奇迹：** 本项目最初基于 **Electron** 架构开发，打包体积高达 **97MB**，解压占用近 **300MB** 磁盘。
> 在 **Google DeepMind Antigravity AI** 的硬核重构下，项目全面迁往 **Tauri v2 + Rust** 架构，最终将安装包极限压缩至 **3.0MB**，内存占用降低 **80%**！

---

## ✨ 核心特性

- 📦 **双格式压缩支持：** 提供行业标准 `ZIP` 与极致压缩比的 `7z` 备份格式。
- 🔑 **军事级安全加密：** 支持 `AES-256` 算法，可一键为您的备份文件加锁，支持对 7z 文件名进行彻底混淆加密。
- ⏰ **智能定时任务：** 基于 Rust 异步高精度时钟，支持每小时、每天、每周及自定义 Cron 表达式自动备份。
- 🎨 **极简现代视觉：** 搭载 Tailwind CSS v4 打造的暗黑科技风 UI，支持平滑流畅的微动效，赏心悦目。
- 📥 **系统托盘运行：** 支持最小化至 Windows 系统托盘静默运行，双击还原，右键一键备份所有任务。

### 🚀 最新升级（v0.1.3+ 新增高级监控与策略）
- ☁️ **WebDAV 流式上传与重试监控：**
  - **进度条分阶段监测**：压缩阶段精准占比 50%（非 WebDAV 任务自适应为 100%），上传阶段精准占比 50%（50%~100%）。
  - **上传速率实时显示**：实时计算并渲染瞬时上传速度（例如 `2.34 MB/s`、`520 KB/s`）。
  - **超大备份超时保护**：内置 1 小时大文件传输保护与 30 秒连接超时，保障 1G 以上大体积备份在网络波动中不会被异常掐断。
  - **异常自动重试与提示**：上传网络中断时，每 5 秒自动重试一次，最大重试 3 次，且在界面中同步输出提示文字（如 `上传出错，5秒后进行第 X/3 次重试...`）。
  - **零残留文件清理**：无论上传成功还是最终重试失败，都会在任务退出前物理销毁本地临时压缩文件，防止磁盘空间泄漏。
- 🧹 **本地历史备份自动清理策略 (Local Retention Policy)：**
  - 支持在新建/编辑备份任务时开启“自动清理历史备份”开关，可选择自定义保留天数。
  - 开启时仅保留在期备份，关闭时默认永久保存。
  - 备份成功后，后端自动解析文件夹下历史压缩包文件名中的日期戳，智能移除过期的旧文件。
- 📂 **配置文件一键恢复备份 (Config Restore Panel)：**
  - 独立控制面板集成在“设置 - 应用配置备份”模块中。
  - **本地恢复**：可选择本地的 `.zip`/`.7z` 配置备份包，一键还原 `app-settings.json` 及 `app-tasks.json` 并自动重载刷新应用。
  - **云端 WebDAV 恢复**：自动发起 `PROPFIND` 命令拉取云端历史配置备份目录，支持在下拉框中直接选择指定的云端备份包进行一键下载、提取与还原。
- 🤫 **托盘静默开机自启 (Silent Autostart)：**
  - 与 Windows 注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 启动项原生绑定。
  - 采用 `--minimized` 命令行参数。开机自动运行后会静默启动在系统托盘后台，不弹出任何窗口打扰用户，打造真正的金牌托盘工具体验。

---

## ⚡ 架构大洗牌：Electron vs Tauri v2

| 维度 | 旧架构 (Electron) | 新架构 (Tauri v2 + Rust) | 优化对比 |
| :--- | :--- | :--- | :--- |
| **打包体积 (.exe)** | **~97.0 MB** | **~3.0 MB** | 🟢 **瘦身 97%** |
| **内存占用 (RAM)** | ~120 - 150 MB | **~25 - 45 MB** | 🟢 **降低 80%** |
| **磁盘空间占用** | ~280 MB | **~30 MB** | 🟢 **节省 89%** |
| **后端语言** | Node.js (TypeScript) | **Rust** | 🟢 **更安全、更高性能** |
| **压缩执行方式** | 外部二进制大包复制 | **Tauri 资源内置 & 隐蔽运行** | 🟢 **完全隐藏 CMD 弹窗闪烁** |

---

## 🛠️ 编译与开发准备

由于新架构采用了 native 机器码编译，在编译本项目前，您的电脑上需要具备 Rust 开发环境：

### 1. 安装 Rust 环境
1. 访问并下载 Rust 官方管理工具：**[rustup.rs](https://rustup.rs/)**
2. 运行 `rustup-init.exe`，选择 `1` (默认安装) 回车。
3. 确保安装了 **Windows 10 / 11 SDK** 组件（可通过 *Visual Studio Installer* 快速补充勾选）。

### 2. 安装前端依赖
```bash
npm install
```

### 3. 启动开发调试
```bash
npm run dev
```

### 4. 一键编译 Sub-10MB 安装包！
```bash
npm run build
```
编译生成的超轻量级 Windows 安装包 (`.msi`、`.exe`) 和可执行文件将生成在：
`src-tauri/target/release/bundle/` 目录下。

---

## 🤖 AI 重构背后的故事
本项目是由开发者与 **Google DeepMind 开发的 AI 编程助手 Antigravity** 深度结对编程重构而成。
面对 Electron 臃肿的 Chromium 浏览器和 Node.js 运行时内核，AI 提出了极具前瞻性的 **"Tauri v2 零动效 UI 桥接"** 重构方案：
- 完美保留了原有的 React UI 前端组件，无需改写任何一行前端界面逻辑。
- 在前端架设 `tauri-bridge.ts` 垫片，将 Electron IPC 管道完美映射到 Tauri 核心 Command 和 Event API。
- 用 Rust 重写了整个底层，引入高精度异步定时器和 WebDAV 流式传输，从而创造了 10MB 的重构奇迹。
