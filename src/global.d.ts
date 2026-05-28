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

export interface BackupApi {
  backup: {
    start: (config: BackupTaskConfig) => Promise<BackupResult>;
    runAll: () => Promise<BackupResult>;
    listTasks: () => Promise<BackupTaskConfig[]>;
    saveTasks: (tasks: any[]) => Promise<void>;
  };
  scheduler: {
    getJobs: () => Promise<any[]>;
  };
  settings: {
    load: () => Promise<AppSettings>;
    save: (settings: AppSettings) => Promise<void>;
  };
  dialog: {
    openDirectory: () => Promise<string[]>;
    openFile: () => Promise<string[]>;
  };
  app: {
    minimizeToTray: () => Promise<void>;
    onBackupProgress: (callback: (progress: any) => void) => () => void;
    onFileDrop: (callback: (paths: string[]) => void) => () => void;
  };
}

declare global {
  interface Window {
    api: BackupApi;
  }
}
