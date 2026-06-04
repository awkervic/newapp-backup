# 🌌 编年史记�?(Chronicle Memory)

## 📋 项目概况 (Project Overview)
- **项目名称:** NewApp Backup
- **核心架构:** React 19 + Vite 6 + Tailwind CSS v4 + Tauri v2 + Rust
- **重构目的:** 解决�?Electron 架构安装包臃�?(~97MB) �?RAM 开销过大 (~150MB) 痛点，重构后包体积降�?**2.9MB**，RAM 降至 **~30MB**�?

---

## 📅 编年史事件快�?(Chronicle Events)

- **[2026-05-26] 架构大洗�?*：旧架构 Electron 过于臃肿。在 Antigravity AI 的强力协作下，全面弃�?Electron，拥�?**Tauri v2 + Rust** 轻量化新框架，以达成�?0MB以内安装包”目标�?
- **[2026-05-26] 零触碰前端桥�?*：在前端 React 引入 [tauri-bridge.ts](src/tauri-bridge.ts)，并将其中挂载在 `window.api` 全局变量上，�?[main.tsx](src/main.tsx#L1-L15) 入口首行引入。实现了 React UI 核心组件无需改写任何一行代码即可无感迁移�?
- **[2026-05-26] Rust 后端重写**：在 Rust 侧实现了�?Electron TypeScript 主进程的全部功能核心�?
  - **Tray 托盘菜单 ([lib.rs](src-tauri/src/lib.rs))**：实现系统关闭窗口拦截（最小化至托盘）与双击还原、右键菜单项�?
  - **AppData 配置存储 ([settings.rs](src-tauri/src/settings.rs))**：读写保�?JSON 格式系统设置�?
  - **7z 静默压缩引擎 ([backup.rs](src-tauri/src/backup.rs))**：侧载调用内�?Windows x64 `7za.exe` 压缩并捕�?stdout 进度广播，消除了�?Electron �?CMD 窗口闪烁问题�?
  - **WebDAV 流式直传 ([backup.rs](src-tauri/src/backup.rs))**：基�?`reqwest` 异步 HTTP 执行 PUT 上传，并安全删除本地临时压缩包�?
  - **高精度调度器 ([scheduler.rs](src-tauri/src/scheduler.rs))**：自研极简 Cron 后台循环，定时匹配备份计划�?
- **[2026-05-26] 遗留垃圾清扫**：彻底删�?Electron 旧时代废弃配置文件（`electron-builder.yml`, `tsconfig.main.json`, `tsconfig.preload.json`）和源目录（`src/main/`, `src/preload/`），清理并优�?`package.json` 的冗余依赖与脚本�?
- **[2026-05-26] 文档沉淀�?Git 推�?*：精心书写极具开源极客色彩的 [README.md](README.md) �?[CHANGELOG.md](CHANGELOG.md)，执�?Git 提交，并**顺利推送至 GitHub 远程主分�?(`master`)**�?
- **[2026-05-26] 编译环境协助**：自动下载并静默配置本地 Rust 编译环境（stable-x86_64-pc-windows-msvc）。诊断出 Windows SDK 缺失问题，并给出了手动勾�?Visual Studio Installer 组件的极简修复指南�?
- **[2026-05-27] 代码结构优化与扁平化**：对前端代码结构进行深度重构优化。将 React 前端源文件从 nested Electron 式的 `src/renderer/src/` 完全移至扁平规范�?`src/` 目录下，并将 `index.html` 移入 `src/index.html`。同步更新了 `vite.config.ts`、`tsconfig.json` �?`tauri.conf.json` 里的路径配置。删除了多余空文件夹 `src/renderer` �?`extracted`。完�?`npm run build:renderer` 编译校验，并将重构完整提交并**成功推送至 GitHub master 分支**�?

* [2026-05-28] ���ܿ�����ʵ�ֱ��������б����õı��� JSON �־û���֧����Ӧ��ж���Զ����������ļ��� (src-tauri/src/lib.rs, src/App.tsx)
* [2026-05-28] ���ܿ�����ʵ��ϵͳ�����Զ����ݹ��ܣ�֧�ִ�����ݱ���/WebDAV�������Զ��� WebDAV ��Ŀ¼���½� config-backup Ŀ¼�����ϴ� (src-tauri/src/backup.rs, src/components/SettingsPanel.tsx)

* [2026-06-05] 修复：修复了关闭窗口隐藏到托盘后重新运行桌面快捷方式会导致任务栏出现多个进程与图标的 Bug，引入了 tauri-plugin-single-instance 单实例限制插件，并升级发布 v0.1.3 版本。(src-tauri/src/lib.rs, src-tauri/Cargo.toml)
