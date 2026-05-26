import { contextBridge, ipcRenderer } from "electron";

export interface BackupTaskConfig {
  id: string;
  name: string;
  sourcePaths: string[];
  destination: {
    type: "local" | "webdav";
    path: string;
    webdavUrl?: string;
    webdavUser?: string;
    webdavPassword?: string;
  };
  options: {
    format: "zip" | "7z";
    compressionLevel: number;
    password?: string;
  };
  schedule?: string;
}

export interface BackupResult {
  success: boolean;
  error?: string;
}

export interface WebdavPreset {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
}

export interface AppSettings {
  minimizeToTray: boolean;
  startOnBoot: boolean;
  theme: "dark" | "light";
  webdavPresets: WebdavPreset[];
}

const api = {
  backup: {
    start: (config: BackupTaskConfig): Promise<BackupResult> =>
      ipcRenderer.invoke("backup:start", config),
    runAll: (): Promise<BackupResult> =>
      ipcRenderer.invoke("backup:run-all"),
    listTasks: (): Promise<BackupTaskConfig[]> =>
      ipcRenderer.invoke("backup:list-tasks"),
  },
  scheduler: {
    getJobs: (): Promise<any[]> => ipcRenderer.invoke("scheduler:get-jobs"),
  },
  settings: {
    load: (): Promise<AppSettings> => ipcRenderer.invoke("settings:load"),
    save: (settings: AppSettings): Promise<void> =>
      ipcRenderer.invoke("settings:save", settings),
  },
  dialog: {
    openDirectory: (): Promise<string[]> =>
      ipcRenderer.invoke("dialog:open-directory"),
    openFile: (): Promise<string[]> =>
      ipcRenderer.invoke("dialog:open-file"),
  },
  app: {
    minimizeToTray: (): Promise<void> =>
      ipcRenderer.invoke("app:minimize-to-tray"),
    onBackupProgress: (callback: (progress: any) => void) => {
      const handler = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on("backup:progress", handler);
      return () => { ipcRenderer.removeListener("backup:progress", handler); };
    },
  },
};

contextBridge.exposeInMainWorld("api", api);

export type BackupApi = typeof api;
