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
    let p = settings_path(app);
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(&settings) {
        let _ = fs::write(p, content);
    }
}
