use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WebdavPreset {
    pub id: String,
    pub name: String,
    pub url: String,
    pub username: String,
    pub password: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub minimize_to_tray: bool,
    pub start_on_boot: bool,
    pub theme: String,
    pub webdav_presets: Vec<WebdavPreset>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            minimize_to_tray: true,
            start_on_boot: false,
            theme: "dark".to_string(),
            webdav_presets: Vec::new(),
        }
    }
}

fn settings_path(app: &AppHandle) -> PathBuf {
    let mut p = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    p.push("app-settings.json");
    p
}

pub fn load(app: &AppHandle) -> AppSettings {
    let p = settings_path(app);
    if p.exists() {
        if let Ok(content) = fs::read_to_string(p) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                return settings;
            }
        }
    }
    AppSettings::default()
}

pub fn save(app: &AppHandle, settings: AppSettings) {
    let start_on_boot = settings.start_on_boot;
    let p = settings_path(app);
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(&settings) {
        let _ = fs::write(p, content);
    }
    let _ = set_auto_start("NewAppBackup", start_on_boot);
}

#[cfg(target_os = "windows")]
pub fn set_auto_start(app_name: &str, enable: bool) -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::RegKey;
    use std::env;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu
        .open_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            KEY_SET_VALUE,
        )
        .map_err(|e| format!("打开启动项注册表失败: {}", e))?;

    if enable {
        let current_exe = env::current_exe()
            .map_err(|e| format!("获取当前可执行文件路径失败: {}", e))?;
        let exe_path = current_exe.to_string_lossy().to_string();
        let value = format!("\"{}\" --minimized", exe_path);
        run_key
            .set_value(app_name, &value)
            .map_err(|e| format!("写入启动项失败: {}", e))?;
    } else {
        let _ = run_key.delete_value(app_name);
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn set_auto_start(_app_name: &str, _enable: bool) -> Result<(), String> {
    Ok(())
}
