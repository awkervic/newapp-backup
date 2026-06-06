use serde::{Serialize, Deserialize};
use std::path::{Path, PathBuf};
use std::fs;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tauri::{AppHandle, Emitter, Manager};
use chrono::{Local, TimeZone};

// Added for streaming upload and progress tracking
use std::pin::Pin;
use std::task::{Context, Poll};
use futures_util::Stream;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio_util::io::ReaderStream;


#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Destination {
    pub r#type: String, // "local" | "webdav"
    pub path: String,
    pub webdav_url: Option<String>,
    pub webdav_user: Option<String>,
    pub webdav_password: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupOptions {
    pub format: String, // "zip" | "7z"
    pub compression_level: u32,
    pub password: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupTask {
    pub id: String,
    pub name: String,
    pub source_paths: Vec<String>,
    pub destination: Destination,
    pub options: BackupOptions,
    pub schedule: Option<String>,
    pub retention_days: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupProgress {
    pub task_id: String,
    pub percent: u32,
    pub current_file: String,
    pub status: String, // "running" | "completed" | "error"
    pub error: Option<String>,
}

fn app_temp_dir() -> PathBuf {
    let mut p = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    p.push("temp");
    if !p.exists() {
        let _ = fs::create_dir_all(&p);
    }
    p
}

pub async fn execute_backup(app: AppHandle, task: BackupTask) -> Result<(), String> {
    let mut task = task;
    if task.id == "__app_config_backup__" {
        let app_data = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
        let settings_file = app_data.join("app-settings.json");
        let tasks_file = app_data.join("app-tasks.json");
        
        task.source_paths = vec![
            settings_file.to_string_lossy().to_string(),
            tasks_file.to_string_lossy().to_string(),
        ];
    }
    let task_id = task.id.clone();
    let now = Local::now();
    let date_str = now.format("%Y-%m-%d_%H-%M-%S").to_string();
    let clean_name = task.name.replace(|c: char| c.is_whitespace(), "_");
    let backup_file_name = format!("{}_{}.{}", clean_name, date_str, task.options.format);

    let emit_progress = {
        let app = app.clone();
        let task_id = task_id.clone();
        move |percent: u32, current_file: &str, status: &str, error: Option<String>| {
            let progress = BackupProgress {
                task_id: task_id.clone(),
                percent,
                current_file: current_file.to_string(),
                status: status.to_string(),
                error,
            };
            let _ = app.emit("backup:progress", progress);
        }
    };

    emit_progress(0, "正在准备备份...", "running", None);

    // Determine local archive output path
    let is_local = task.destination.r#type == "local";
    let archive_dir = if is_local {
        PathBuf::from(&task.destination.path)
    } else {
        app_temp_dir()
    };

    if !archive_dir.exists() {
        let _ = fs::create_dir_all(&archive_dir);
    }

    let archive_path = archive_dir.join(&backup_file_name);
    let archive_path_str = archive_path.to_string_lossy().to_string();

    // 1. Spawning 7za compression process
    let sidecar_path = match app.path().resolve("resources/7za.exe", tauri::path::BaseDirectory::Resource) {
        Ok(p) => p,
        Err(e) => {
            let err_msg = format!("无法定位压缩工具 (7za.exe): {}", e);
            emit_progress(0, "备份失败", "error", Some(err_msg.clone()));
            return Err(err_msg);
        }
    };

    if !sidecar_path.exists() {
        let err_msg = "7zip binary (7za.exe) not found in resources folder.".to_string();
        emit_progress(0, "备份失败", "error", Some(err_msg.clone()));
        return Err(err_msg);
    }

    // Collect files list to calculate progress
    let all_files = collect_files(&task.source_paths);
    let total_files = all_files.len();

    // Build 7za arguments
    let is_zip = task.options.format == "zip";
    let mut args = vec![
        "a".to_string(),
        if is_zip { "-tzip".to_string() } else { "-t7z".to_string() },
        archive_path_str,
    ];

    // Compression level
    let mx_level = match task.options.compression_level {
        0 => "0", 1 => "1", 2 => "3", 3 => "3",
        4 => "5", 5 => "5", 6 => "7", 7 => "7",
        8 => "9", 9 => "9", _ => "5"
    };
    args.push(format!("-mx{}", mx_level));

    // Password encryption
    if let Some(ref pwd) = task.options.password {
        if is_zip {
            args.push("-mem=AES256".to_string());
        } else {
            args.push("-mhe=on".to_string());
        }
        args.push(format!("-p{}", pwd));
    }

    // Source files
    for src in &task.source_paths {
        args.push(src.clone());
    }

    let mut cmd = Command::new(sidecar_path);
    cmd.args(args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::null()); // Discard stderr to prevent blocking/hanging due to pipe buffer limits!

    // Create a hidden window process on Windows to avoid flashing cmd windows
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let err_msg = format!("启动 7zip 失败: {}", e);
            emit_progress(0, "备份失败", "error", Some(err_msg.clone()));
            return Err(err_msg);
        }
    };

    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout).lines();
    let mut processed_count = 0;
    let compress_max = if is_local { 100u32 } else { 50u32 };

    // Read stdout for progress updates
    while let Ok(Some(line)) = reader.next_line().await {
        let trimmed = line.trim();
        if trimmed.starts_with("Compressing") || trimmed.starts_with("Updating") {
            processed_count += 1;
            let current_file = if let Some(idx) = trimmed.find(' ') {
                trimmed[idx..].trim().to_string()
            } else {
                trimmed.to_string()
            };

            let percent = if total_files > 0 {
                std::cmp::min((processed_count as u32 * compress_max) / total_files as u32, compress_max)
            } else {
                compress_max / 2
            };
            emit_progress(percent, &format!("正在压缩: {}", current_file), "running", None);
        }
    }

    let status = match child.wait().await {
        Ok(s) => s,
        Err(e) => {
            let err_msg = format!("等待 7zip 结束失败: {}", e);
            emit_progress(0, "备份失败", "error", Some(err_msg.clone()));
            return Err(err_msg);
        }
    };

    let exit_code = status.code().unwrap_or(-1);
    if exit_code != 0 && exit_code != 1 {
        let err_msg = format!("7zip 执行失败，退出码: {}", exit_code);
        emit_progress(0, "备份失败", "error", Some(err_msg.clone()));
        return Err(err_msg);
    }

    if is_local {
        emit_progress(100, "备份完成", "completed", None);
        return Ok(());
    }

    emit_progress(50, "压缩完成，开始上传...", "running", None);

    // 2. Upload to WebDAV if destination is WebDAV
    if task.destination.r#type == "webdav" {
        let is_config_backup = task.id == "__app_config_backup__";
        if let Err(e) = upload_to_webdav(app.clone(), task_id.clone(), &archive_path, &backup_file_name, &task.destination, is_config_backup).await {
            let err_msg = format!("上传至 WebDAV 失败: {}", e);
            emit_progress(0, "备份失败", "error", Some(err_msg.clone()));
            return Err(err_msg);
        }
    }

    emit_progress(100, "备份完成", "completed", None);

    // Retention policy cleanup for local backups
    if is_local {
        if let Some(days) = task.retention_days {
            if days > 0 {
                let _ = cleanup_old_backups(&archive_dir, &clean_name, &task.options.format, days);
            }
        }
    }
    Ok(())
}

struct ProgressStream<S> {
    inner: S,
    uploaded: Arc<AtomicU64>,
}

impl<S, O, E> Stream for ProgressStream<S>
where
    S: Stream<Item = Result<O, E>> + Unpin,
    O: AsRef<[u8]>,
{
    type Item = Result<O, E>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Result<O, E>>> {
        match Pin::new(&mut self.inner).poll_next(cx) {
            Poll::Ready(Some(Ok(chunk))) => {
                let len = chunk.as_ref().len() as u64;
                self.uploaded.fetch_add(len, Ordering::Relaxed);
                Poll::Ready(Some(Ok(chunk)))
            }
            other => other,
        }
    }
}

fn format_speed(bytes_per_sec: f64) -> String {
    if bytes_per_sec >= 1024.0 * 1024.0 {
        format!("{:.2} MB/s", bytes_per_sec / (1024.0 * 1024.0))
    } else if bytes_per_sec >= 1024.0 {
        format!("{:.2} KB/s", bytes_per_sec / 1024.0)
    } else {
        format!("{:.0} B/s", bytes_per_sec)
    }
}

async fn upload_to_webdav(
    app: AppHandle,
    task_id: String,
    local_path: &Path,
    remote_file_name: &str,
    destination: &Destination,
    is_config_backup: bool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let webdav_url = destination.webdav_url.as_ref().ok_or("Missing WebDAV URL")?;
    let user = destination.webdav_user.as_deref().unwrap_or("");
    let password = destination.webdav_password.as_deref().unwrap_or("");

    // Use a custom builder with large/no timeout to prevent timeout issues on large uploads
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3600)) // 1 hour timeout
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()?;

    let mut base_url = webdav_url.trim_end_matches('/').to_string();

    if is_config_backup {
        // Try creating config-backup folder in the root path using MKCOL
        let folder_url = format!("{}/config-backup", base_url);
        let mut mkcol_req = client.request(reqwest::Method::from_bytes(b"MKCOL")?, &folder_url);
        if !user.is_empty() {
            mkcol_req = mkcol_req.basic_auth(user, Some(password));
        }
        let _ = mkcol_req.send().await;
        base_url = folder_url;
    }

    let mut upload_url = base_url;
    upload_url.push('/');
    upload_url.push_str(remote_file_name);

    let uploaded = Arc::new(AtomicU64::new(0));
    let upload_finished = Arc::new(std::sync::atomic::AtomicBool::new(false));

    // Spawn progress reporter
    let uploaded_clone = uploaded.clone();
    let upload_finished_clone = upload_finished.clone();
    let app_clone = app.clone();
    let task_id_clone = task_id.clone();
    let remote_file_name_str = remote_file_name.to_string();

    let metadata = tokio::fs::metadata(local_path).await?;
    let total_size = metadata.len();

    let reporter_handle = tauri::async_runtime::spawn(async move {
        let start_time = std::time::Instant::now();
        let mut last_emit_time = start_time;
        let mut last_bytes = 0u64;

        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

            if upload_finished_clone.load(Ordering::Relaxed) {
                break;
            }

            let now = std::time::Instant::now();
            let bytes = uploaded_clone.load(Ordering::Relaxed);

            if total_size > 0 && bytes > 0 {
                let elapsed_secs = now.duration_since(last_emit_time).as_secs_f64();
                let speed = if elapsed_secs > 0.0 {
                    let diff = if bytes >= last_bytes { bytes - last_bytes } else { 0 };
                    diff as f64 / elapsed_secs
                } else {
                    0.0
                };

                last_emit_time = now;
                last_bytes = bytes;

                // Overall progress goes from 50% to 99% during upload
                let upload_percent = std::cmp::min((bytes * 49) / total_size, 49) as u32;
                let overall_percent = 50 + upload_percent;

                let speed_str = format_speed(speed);
                let progress = BackupProgress {
                    task_id: task_id_clone.clone(),
                    percent: overall_percent,
                    current_file: format!("正在上传: {} ({})", remote_file_name_str, speed_str),
                    status: "running".to_string(),
                    error: None,
                };
                let _ = app_clone.emit("backup:progress", progress);
            }
        }
    });

    let mut attempts = 0;
    let max_attempts = 3;
    let mut last_error: Option<Box<dyn std::error::Error + Send + Sync>> = None;

    while attempts < max_attempts {
        attempts += 1;
        if attempts > 1 {
            let msg = format!("上传出错，5秒后进行第 {}/{} 次重试...", attempts, max_attempts);
            let _ = app.emit("backup:progress", BackupProgress {
                task_id: task_id.clone(),
                percent: 50,
                current_file: msg,
                status: "running".to_string(),
                error: None,
            });
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }

        // Reset uploaded bytes count
        uploaded.store(0, Ordering::Relaxed);

        let file = match tokio::fs::File::open(local_path).await {
            Ok(f) => f,
            Err(e) => {
                last_error = Some(Box::new(e));
                continue;
            }
        };
        let reader_stream = ReaderStream::new(file);

        let progress_stream = ProgressStream {
            inner: reader_stream,
            uploaded: uploaded.clone(),
        };

        let body = reqwest::Body::wrap_stream(progress_stream);
        let mut req = client.put(&upload_url).body(body);

        if !user.is_empty() {
            req = req.basic_auth(user, Some(password));
        }

        match req.send().await {
            Ok(res) => {
                if res.status().is_success() {
                    // Success! Stop the reporter and delete file
                    upload_finished.store(true, Ordering::Relaxed);
                    let _ = reporter_handle.await;
                    let _ = fs::remove_file(local_path);
                    return Ok(());
                } else {
                    last_error = Some(format!("WebDAV upload failed with status code: {}", res.status()).into());
                }
            }
            Err(e) => {
                last_error = Some(Box::new(e));
            }
        }
    }

    // Stop the progress reporter
    upload_finished.store(true, Ordering::Relaxed);
    let _ = reporter_handle.await;

    // Always delete local temporary file on final failure
    let _ = fs::remove_file(local_path);

    Err(last_error.unwrap_or_else(|| "Unknown upload error".into()))
}

fn collect_files(source_paths: &[String]) -> Vec<PathBuf> {
    let mut all_files = Vec::new();
    for path_str in source_paths {
        let p = PathBuf::from(path_str);
        if p.is_dir() {
            if let Ok(entries) = walk_dir(&p) {
                all_files.extend(entries);
            }
        } else if p.is_file() {
            all_files.push(p);
        }
    }
    all_files
}

fn walk_dir(dir: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    if dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                files.extend(walk_dir(&path)?);
            } else {
                files.push(path);
            }
        }
    }
    Ok(files)
}

fn tasks_path(app: &AppHandle) -> PathBuf {
    let mut p = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    p.push("app-tasks.json");
    p
}

pub fn load_tasks(app: &AppHandle) -> Vec<BackupTask> {
    let p = tasks_path(app);
    if p.exists() {
        if let Ok(content) = fs::read_to_string(p) {
            if let Ok(tasks) = serde_json::from_str::<Vec<BackupTask>>(&content) {
                return tasks;
            }
        }
    }
    Vec::new()
}

pub fn save_tasks(app: &AppHandle, tasks: &[BackupTask]) -> Result<(), String> {
    let p = tasks_path(app);
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let content = serde_json::to_string_pretty(tasks)
        .map_err(|e| format!("序列化任务列表失败: {}", e))?;
    fs::write(p, content)
        .map_err(|e| format!("写入任务列表文件失败: {}", e))?;
    Ok(())
}

fn cleanup_old_backups(dir: &Path, prefix: &str, format: &str, retention_days: u32) -> std::io::Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }
    
    let now = chrono::Local::now();
    let retention_duration = chrono::Duration::days(retention_days as i64);
    let cutoff_time = now - retention_duration;
    
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        
        if path.is_file() {
            if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                if filename.starts_with(prefix) && filename.ends_with(format) {
                    let without_prefix = &filename[prefix.len()..];
                    if without_prefix.starts_with('_') {
                        let without_prefix_under = &without_prefix[1..];
                        let name_len = without_prefix_under.len();
                        let format_len = format.len() + 1; // including the dot
                        if name_len > format_len {
                            let date_part = &without_prefix_under[..name_len - format_len];
                            if let Ok(file_time) = chrono::NaiveDateTime::parse_from_str(date_part, "%Y-%m-%d_%H-%M-%S") {
                                let local_file_time = chrono::Local.from_local_datetime(&file_time).single();
                                if let Some(local_time) = local_file_time {
                                    if local_time < cutoff_time {
                                        let _ = fs::remove_file(path);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

fn find_file_recursive(dir: &Path, target_name: &str) -> Option<PathBuf> {
    if !dir.is_dir() {
        return None;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(found) = find_file_recursive(&path, target_name) {
                        return Some(found);
                    }
                } else if path.is_file() {
                    if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                        if filename == target_name {
                            return Some(path);
                        }
                    }
                }
            }
        }
    }
    None
}

fn extract_hrefs(xml: &str) -> Vec<String> {
    let mut hrefs = Vec::new();
    let mut temp = xml;
    while let Some(start_idx) = temp.find("<d:href>") {
        let end_tag = "</d:href>";
        if let Some(end_idx) = temp[start_idx..].find(end_tag) {
            let href = &temp[start_idx + 8..start_idx + end_idx];
            hrefs.push(href.to_string());
            temp = &temp[start_idx + end_idx + end_tag.len()..];
        } else {
            break;
        }
    }
    if hrefs.is_empty() {
        let mut temp = xml;
        while let Some(start_idx) = temp.find("<D:href>") {
            let end_tag = "</D:href>";
            if let Some(end_idx) = temp[start_idx..].find(end_tag) {
                let href = &temp[start_idx + 8..start_idx + end_idx];
                hrefs.push(href.to_string());
                temp = &temp[start_idx + end_idx + end_tag.len()..];
            } else {
                break;
            }
        }
    }
    if hrefs.is_empty() {
        let mut temp = xml;
        while let Some(start_idx) = temp.find("<href>") {
            let end_tag = "</href>";
            if let Some(end_idx) = temp[start_idx..].find(end_tag) {
                let href = &temp[start_idx + 6..start_idx + end_idx];
                hrefs.push(href.to_string());
                temp = &temp[start_idx + end_idx + end_tag.len()..];
            } else {
                break;
            }
        }
    }
    hrefs
}

#[tauri::command]
pub async fn config_restore_local(app: AppHandle, archive_path: String) -> Result<serde_json::Value, String> {
    let app_data = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    
    let sidecar_path = match app.path().resolve("resources/7za.exe", tauri::path::BaseDirectory::Resource) {
        Ok(p) => p,
        Err(e) => return Err(format!("无法定位压缩工具 (7za.exe): {}", e)),
    };
    
    let temp_dir = app_temp_dir().join(format!("restore_{}", Local::now().format("%Y%m%d%H%M%S")));
    if !temp_dir.exists() {
        let _ = fs::create_dir_all(&temp_dir);
    }
    
    let mut cmd = Command::new(sidecar_path);
    cmd.args(&[
        "x",
        &archive_path,
        &format!("-o{}", temp_dir.to_string_lossy()),
        "-y",
    ]);
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());
    
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    let mut child = cmd.spawn().map_err(|e| format!("启动 7zip 失败: {}", e))?;
    let status = child.wait().await.map_err(|e| format!("等待 7zip 结束失败: {}", e))?;
    
    let exit_code = status.code().unwrap_or(-1);
    if exit_code != 0 && exit_code != 1 {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!("解压备份文件失败，退出码: {}", exit_code));
    }
    
    let settings_src = find_file_recursive(&temp_dir, "app-settings.json");
    let tasks_src = find_file_recursive(&temp_dir, "app-tasks.json");
    
    let mut restored_settings = false;
    let mut restored_tasks = false;
    
    if let Some(src) = settings_src {
        if let Err(e) = fs::copy(&src, app_data.join("app-settings.json")) {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(format!("恢复 app-settings.json 失败: {}", e));
        }
        restored_settings = true;
    }
    
    if let Some(src) = tasks_src {
        if let Err(e) = fs::copy(&src, app_data.join("app-tasks.json")) {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(format!("恢复 app-tasks.json 失败: {}", e));
        }
        restored_tasks = true;
    }
    
    let _ = fs::remove_dir_all(&temp_dir);
    
    if !restored_settings && !restored_tasks {
        return Err("备份文件中未找到配置文件 (app-settings.json 或 app-tasks.json)".to_string());
    }
    
    Ok(serde_json::json!({
        "success": true,
        "restoredSettings": restored_settings,
        "restoredTasks": restored_tasks,
    }))
}

#[tauri::command]
pub async fn config_list_webdav_backups(destination: Destination) -> Result<Vec<String>, String> {
    let webdav_url = destination.webdav_url.as_ref().ok_or("Missing WebDAV URL")?;
    let user = destination.webdav_user.as_deref().unwrap_or("");
    let password = destination.webdav_password.as_deref().unwrap_or("");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = webdav_url.trim_end_matches('/').to_string();
    let folder_url = format!("{}/config-backup", base_url);

    let mut req = client.request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &folder_url)
        .header("Depth", "1");

    if !user.is_empty() {
        req = req.basic_auth(user, Some(password));
    }

    let res = req.send().await.map_err(|e| format!("无法连接至 WebDAV: {}", e))?;
    if !res.status().is_success() {
        return Ok(Vec::new());
    }

    let body = res.text().await.map_err(|e| format!("读取 WebDAV 响应失败: {}", e))?;

    let hrefs = extract_hrefs(&body);
    let mut backups = Vec::new();
    for href in hrefs {
        if let Ok(decoded) = percent_encoding::percent_decode_str(&href).decode_utf8() {
            let decoded_str = decoded.to_string();
            if let Some(filename) = Path::new(&decoded_str).file_name().and_then(|n| n.to_str()) {
                if filename.ends_with(".zip") || filename.ends_with(".7z") {
                    backups.push(filename.to_string());
                }
            }
        }
    }
    
    backups.sort_by(|a, b| b.cmp(a));
    Ok(backups)
}

#[tauri::command]
pub async fn config_restore_webdav(app: AppHandle, destination: Destination, remote_file_name: String) -> Result<serde_json::Value, String> {
    let webdav_url = destination.webdav_url.as_ref().ok_or("Missing WebDAV URL")?;
    let user = destination.webdav_user.as_deref().unwrap_or("");
    let password = destination.webdav_password.as_deref().unwrap_or("");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = webdav_url.trim_end_matches('/').to_string();
    let file_url = format!("{}/config-backup/{}", base_url, remote_file_name);

    let mut req = client.get(&file_url);
    if !user.is_empty() {
        req = req.basic_auth(user, Some(password));
    }

    let res = req.send().await.map_err(|e| format!("下载 WebDAV 备份文件失败: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("下载 WebDAV 备份文件失败，状态码: {}", res.status()));
    }

    let bytes = res.bytes().await.map_err(|e| format!("读取备份文件数据失败: {}", e))?;
    
    let temp_file_path = app_temp_dir().join(format!("temp_restore_{}", remote_file_name));
    fs::write(&temp_file_path, bytes).map_err(|e| format!("保存备份文件至本地失败: {}", e))?;

    let restore_result = config_restore_local(app, temp_file_path.to_string_lossy().to_string()).await;
    let _ = fs::remove_file(&temp_file_path);

    restore_result
}
