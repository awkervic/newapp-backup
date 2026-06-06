# 🌌 NewApp Backup 核心开发规则与边界矩阵

## 🎯 核心开发红线 (Hard Rules)
1. **数据持久化与还原规范**：
   - 任务配置持久化文件：`app_data_dir()/app-tasks.json`。
   - 通用配置持久化文件：`app_data_dir()/app-settings.json`。
   - 所有任务增/删/改，前端即时调用 `backup_save_tasks` 全量同步并重载调度器。
   - 配置文件恢复（`config_restore_local` / `config_restore_webdav`）必须在提取文件覆盖后，触发前端 `window.location.reload()` 热重载以载入新状态。
2. **应用配置备份约束**：
   - 隐藏特殊任务 ID 固定为 `__app_config_backup__`，备份源强制指定为配置文件。
   - WebDAV 备份上传时，需通过 `MKCOL` 探测创建 `config-backup` 文件夹。
3. **外部压缩命令与管道安全**：
   - 调用 7za.exe 时，必须将 stderr 重定向至 `Stdio::null()`，以防止高数量小文件警告导致管道缓冲区满而发生死锁。
   - 7-Zip 退出码判定允许 `0` (Success) 和 `1` (Warning - 锁定文件放行)。
4. **WebDAV 流式上传与零残留**：
   - WebDAV 上传必须使用 `ReaderStream` 配合 `ProgressStream` 保证流式分块监听及测速。
   - 失败重试上限 3 次，每次间隔 5s，需向前端发送重试文案。
   - 无论上传结果成功还是重试失败，在 `upload_to_webdav` 退出前必须彻底删除本地临时压缩包，防磁盘空间泄漏。
5. **单实例与托盘自启静默**：
   - 必须启用单实例插件防止任务栏窗口多开。
   - 自启注册表添加 `--minimized` 启动参数。Rust 端 setup 初始化匹配该参数时需调用 `window.hide()` 隐藏窗口静默后台运行。

## 🛠️ 重大变更与 API 速查矩阵 (Change Matrix)
* **IPC 桥接层速查 (`src/tauri-bridge.ts`, `src/global.d.ts`)**:
  - `backup.saveTasks(tasks: Task[])` -> 触发全量任务配置保存及调度器同步。
  - `config.restoreLocal(archivePath)`, `config.listWebdavBackups(dest)`, `config.restoreWebdav(dest, file)` -> 配置备份还原接口。
* **Rust 核心指令结构 (`src-tauri/src/lib.rs`)**:
  - `backup_start`, `backup_run_all`, `backup_list_tasks`, `backup_save_tasks`, `scheduler_get_jobs`, `config_restore_local`, `config_list_webdav_backups`, `config_restore_webdav`

## ⚙️ 极速开发命令 (Dev CheatSheet)
- 安装前端依赖: `npm install`
- 渲染层编译测试: `npm run build:renderer`
- Tauri 生产构建包: `npm run build`
- 杀锁被占进程: `taskkill /f /im app.exe`

