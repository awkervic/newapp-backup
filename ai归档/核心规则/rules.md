# 🌌 NewApp Backup 核心开发规则与边界矩阵

## 🎯 核心开发红线 (Hard Rules)
1. **数据持久化规范**：
   - 任务配置持久化文件存放在 `app_data_dir()/app-tasks.json`。
   - 通用配置持久化文件存放在 `app_data_dir()/app-settings.json`。
   - 所有任务的增/删/改操作，前端必须即时发起 `backup_save_tasks` IPC 通信同步最新配置并重载后端调度器。
2. **应用配置备份约束**：
   - 配置备份作为一个隐藏特殊任务（固定 ID 为 `__app_config_backup__`）。
   - 无论前端传何参数，Rust 端在 `execute_backup` 发现此 ID 后，必须强制覆盖并重写 `task.source_paths` 为 `app-settings.json` 和 `app-tasks.json`。
   - WebDAV 备份目的地上传时，必须自动在根路径发起 `MKCOL` 探测创建 `config-backup` 文件夹。
3. **构建无残留卸载**：
   - Tauri 打包 NSIS 选项中必须保证清理 AppData 目录以响应干净卸载。
4. **单实例限制**：
   - 应用启动必须注册 `tauri-plugin-single-instance`，二次启动时通过主窗口 `main` 的 `show()`、`unminimize()` 与 `set_focus()` 唤醒旧实例，防止任务栏多进程多窗口。


## 🛠️ 重大变更与 API 速查矩阵 (Change Matrix)
* **IPC 桥接层速查 (`src/tauri-bridge.ts`, `src/global.d.ts`)**:
  - `backup.saveTasks(tasks: Task[])` -> 触发全量任务配置保存及调度器同步。
  - `settings_load()`, `settings_save(settings)` -> 管理托盘、开机自启、主题与 WebDAV 预设。
* **Rust 核心指令结构 (`src-tauri/src/lib.rs`)**:
  - `backup_start`, `backup_run_all`, `backup_list_tasks`, `backup_save_tasks`, `scheduler_get_jobs`

## ⚙️ 极速开发命令 (Dev CheatSheet)
- 安装前端依赖: `npm install`
- 渲染层编译测试: `npm run build:renderer`
- Tauri 生产构建包: `npm run build`
- 杀锁被占进程: `taskkill /f /im app.exe`
