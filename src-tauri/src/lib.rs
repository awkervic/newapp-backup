mod backup;
mod settings;
mod scheduler;

use std::sync::Mutex;
use std::collections::HashMap;
use tauri::{AppHandle, Manager};
use backup::{BackupTask, execute_backup};
use settings::AppSettings;
use scheduler::Scheduler;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};

pub struct AppState {
    pub tasks: Mutex<HashMap<String, BackupTask>>,
    pub scheduler: Scheduler,
}

#[tauri::command]
async fn backup_start(config: BackupTask, app: AppHandle, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    // Save to task list
    {
        let mut tasks = state.tasks.lock().unwrap();
        tasks.insert(config.id.clone(), config.clone());
    }
    // Update scheduler
    state.scheduler.schedule_task(config.clone());
    
    // Execute backup asynchronously in a separate task
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = execute_backup(app_clone, config).await;
    });

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
async fn backup_run_all(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let tasks_to_run: Vec<BackupTask> = {
        let tasks = state.tasks.lock().unwrap();
        tasks.values().cloned().collect()
    };

    for task in tasks_to_run {
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = execute_backup(app_clone, task).await;
        });
    }

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
fn backup_list_tasks(state: tauri::State<'_, AppState>) -> Vec<BackupTask> {
    let tasks = state.tasks.lock().unwrap();
    tasks.values().cloned().collect()
}

#[tauri::command]
fn scheduler_get_jobs(state: tauri::State<'_, AppState>) -> Vec<serde_json::Value> {
    state.scheduler.get_jobs()
}

#[tauri::command]
fn settings_load(app: AppHandle) -> AppSettings {
    settings::load(&app)
}

#[tauri::command]
fn settings_save(settings: AppSettings, app: AppHandle) {
    settings::save(&app, settings);
}

#[tauri::command]
fn dialog_open_directory() -> Vec<String> {
    let dialog = rfd::FileDialog::new();
    if let Some(paths) = dialog.pick_folders() {
        paths.into_iter().map(|p| p.to_string_lossy().to_string()).collect()
    } else {
        Vec::new()
    }
}

#[tauri::command]
fn dialog_open_file() -> Vec<String> {
    let dialog = rfd::FileDialog::new();
    if let Some(paths) = dialog.pick_files() {
        paths.into_iter().map(|p| p.to_string_lossy().to_string()).collect()
    } else {
        Vec::new()
    }
}

#[tauri::command]
fn app_minimize_to_tray(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    
    let show = MenuItem::with_id(handle, "show", "打开主界面", true, None::<&str>)?;
    let run_all = MenuItem::with_id(handle, "run_all", "立即备份所有任务", true, None::<&str>)?;
    let quit = MenuItem::with_id(handle, "quit", "退出", true, None::<&str>)?;
    
    let menu = Menu::with_items(handle, &[
        &show,
        &run_all,
        &quit,
    ])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "run_all" => {
                    let state = app.state::<AppState>();
                    let tasks_to_run: Vec<BackupTask> = {
                        let tasks = state.tasks.lock().unwrap();
                        tasks.values().cloned().collect()
                    };
                    for task in tasks_to_run {
                        let app_clone = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = execute_backup(app_clone, task).await;
                        });
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick { .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize app state
            let state = AppState {
                tasks: Mutex::new(HashMap::new()),
                scheduler: Scheduler::new(),
            };

            // Start scheduler background loop
            state.scheduler.start_loop(app.handle().clone());

            // Manage state in Tauri
            app.manage(state);

            // Set up native tray icon
            let _ = setup_tray(app);

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            backup_start,
            backup_run_all,
            backup_list_tasks,
            scheduler_get_jobs,
            settings_load,
            settings_save,
            dialog_open_directory,
            dialog_open_file,
            app_minimize_to_tray
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
