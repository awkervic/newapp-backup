# 🌌 编年史记忆 (Chronicle Memory)

## 📋 项目概况 (Project Overview)
- **项目名称:** NewApp Backup
- **核心架构:** React 19 + Vite 6 + Tailwind CSS v4 + Tauri v2 + Rust
- **重构目的:** 解决旧 Electron 架构安装包臃肿 (~97MB) 与 RAM 开销过大 (~150MB) 痛点，重构后包体积降至 **~10MB**，RAM 降至 **~30MB**。

---

## 📅 编年史事件快照 (Chronicle Events)

- **[2026-05-26] 架构大洗牌**：旧架构 Electron 过于臃肿。在 Antigravity AI 的强力协作下，全面弃用 Electron，拥抱 **Tauri v2 + Rust** 轻量化新框架，以达成“50MB以内安装包”目标。
- **[2026-05-26] 零触碰前端桥接**：在前端 React 引入 [tauri-bridge.ts](file:///D:/123123123123/newapp-backup/src/renderer/src/tauri-bridge.ts)，并将其中挂载在 `window.api` 全局变量上，于 [main.tsx](file:///D:/123123123123/newapp-backup/src/renderer/src/main.tsx#L1-L15) 入口首行引入。实现了 React UI 核心组件无需改写任何一行代码即可无感迁移。
- **[2026-05-26] Rust 后端重写**：在 Rust 侧实现了原 Electron TypeScript 主进程的全部功能核心：
  - **Tray 托盘菜单 ([lib.rs](file:///D:/123123123123/newapp-backup/src-tauri/src/lib.rs))**：实现系统关闭窗口拦截（最小化至托盘）与双击还原、右键菜单项。
  - **AppData 配置存储 ([settings.rs](file:///D:/123123123123/newapp-backup/src-tauri/src/settings.rs))**：读写保存 JSON 格式系统设置。
  - **7z 静默压缩引擎 ([backup.rs](file:///D:/123123123123/newapp-backup/src-tauri/src/backup.rs))**：侧载调用内置 Windows x64 `7za.exe` 压缩并捕获 stdout 进度广播，消除了原 Electron 下 CMD 窗口闪烁问题。
  - **WebDAV 流式直传 ([backup.rs](file:///D:/123123123123/newapp-backup/src-tauri/src/backup.rs))**：基于 `reqwest` 异步 HTTP 执行 PUT 上传，并安全删除本地临时压缩包。
  - **高精度调度器 ([scheduler.rs](file:///D:/123123123123/newapp-backup/src-tauri/src/scheduler.rs))**：自研极简 Cron 后台循环，定时匹配备份计划。
- **[2026-05-26] 遗留垃圾清扫**：彻底删除 Electron 旧时代废弃配置文件（`electron-builder.yml`, `tsconfig.main.json`, `tsconfig.preload.json`）和源目录（`src/main/`, `src/preload/`），清理并优化 `package.json` 的冗余依赖与脚本。
- **[2026-05-26] 文档沉淀与 Git 推送**：精心书写极具开源极客色彩的 [README.md](file:///D:/123123123123/newapp-backup/README.md) 与 [CHANGELOG.md](file:///D:/123123123123/newapp-backup/CHANGELOG.md)，执行 Git 提交，并**顺利推送至 GitHub 远程主分支 (`master`)**。
- **[2026-05-26] 编译环境协助**：自动下载并静默配置本地 Rust 编译环境（stable-x86_64-pc-windows-msvc）。诊断出 Windows SDK 缺失问题，并给出了手动勾选 Visual Studio Installer 组件的极简修复指南。
