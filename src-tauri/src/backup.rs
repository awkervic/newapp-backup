use serde::{Serialize, Deserialize};
use std::path::{Path, PathBuf};
use std::fs;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tauri::{AppHandle, Emitter, Manager};
use chrono::Local;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

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
    cmd.stderr(Stdio::piped());

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
                std::cmp::min((processed_count * 80) / total_files, 80) as u32
            } else {
                40
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

    if !status.success() {
        let err_msg = format!("7zip 执行失败，退出码: {:?}", status.code());
        emit_progress(0, "备份失败", "error", Some(err_msg.clone()));
        return Err(err_msg);
    }

    emit_progress(90, "压缩完成，正在传输...", "running", None);

    // 2. Upload to WebDAV if destination is WebDAV
    if task.destination.r#type == "webdav" {
        let is_config_backup = task.id == "__app_config_backup__";
        if let Err(e) = upload_to_webdav(&archive_path, &backup_file_name, &task.destination, is_config_backup).await {
            let err_msg = format!("上传至 WebDAV 失败: {}", e);
            emit_progress(0, "备份失败", "error", Some(err_msg.clone()));
            return Err(err_msg);
        }
    }

    emit_progress(100, "备份完成", "completed", None);
    Ok(())
}

async fn upload_to_webdav(
    local_path: &Path,
    remote_file_name: &str,
    destination: &Destination,
    is_config_backup: bool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let webdav_url = destination.webdav_url.as_ref().ok_or("Missing WebDAV URL")?;
    let user = destination.webdav_user.as_deref().unwrap_or("");
    let password = destination.webdav_password.as_deref().unwrap_or("");

    let client = reqwest::Client::new();
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

    let file_bytes = tokio::fs::read(local_path).await?;

    let mut req = client.put(&upload_url)
        .body(file_bytes);

    if !user.is_empty() {
        req = req.basic_auth(user, Some(password));
    }

    let res = req.send().await?;
    if res.status().is_success() {
        // Delete local temporary file
        let _ = fs::remove_file(local_path);
        Ok(())
    } else {
        Err(format!("WebDAV upload failed with status code: {}", res.status()).into())
    }
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
