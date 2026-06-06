import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const tauriApi = {
  backup: {
    start: (config: any) => invoke("backup_start", { config }),
    runAll: () => invoke("backup_run_all"),
    listTasks: () => invoke("backup_list_tasks"),
    saveTasks: (tasks: any[]) => invoke("backup_save_tasks", { tasks }),
  },
  config: {
    restoreLocal: (archivePath: string) => invoke("config_restore_local", { archivePath }),
    listWebdavBackups: (destination: any) => invoke("config_list_webdav_backups", { destination }),
    restoreWebdav: (destination: any, remoteFileName: string) => invoke("config_restore_webdav", { destination, remoteFileName }),
  },
  scheduler: {
    getJobs: () => invoke("scheduler_get_jobs"),
  },
  settings: {
    load: () => invoke("settings_load"),
    save: (settings: any) => invoke("settings_save", { settings }),
  },
  dialog: {
    openDirectory: () => invoke("dialog_open_directory"),
    openFile: () => invoke("dialog_open_file"),
  },
  app: {
    minimizeToTray: () => invoke("app_minimize_to_tray"),
    onBackupProgress: (callback: (progress: any) => void) => {
      let unlistenFn: (() => void) | undefined;
      listen("backup:progress", (event) => {
        callback(event.payload);
      }).then((fn) => {
        unlistenFn = fn;
      });
      return () => {
        if (unlistenFn) {
          unlistenFn();
        }
      };
    },
    onFileDrop: (callback: (paths: string[]) => void) => {
      let unlistenFn: (() => void) | undefined;
      listen<any>("tauri://drag-drop", (event) => {
        if (event.payload && Array.isArray(event.payload.paths)) {
          callback(event.payload.paths);
        }
      }).then((fn) => {
        unlistenFn = fn;
      });
      return () => {
        if (unlistenFn) {
          unlistenFn();
        }
      };
    },
  },
};

window.api = tauriApi as any;
