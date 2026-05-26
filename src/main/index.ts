import { app, BrowserWindow, Tray, Menu, ipcMain, dialog, session } from "electron";
import path from "path";
import { BackupEngine } from "./backupEngine";
import { Scheduler } from "./scheduler";
import { getTrayIcon, getAppIconPath } from "./icon";
import { loadSettings, saveSettings } from "./settings";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
const backupEngine = new BackupEngine();
const scheduler = new Scheduler();

const isDev = !app.isPackaged;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray(): void {
  tray = new Tray(getTrayIcon());
  tray.setToolTip("NewApp Backup");

  const contextMenu = Menu.buildFromTemplate([
    { label: "打开主界面", click: () => mainWindow?.show() },
    { type: "separator" },
    { label: "立即备份所有任务", click: () => backupEngine.runAllTasks() },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => mainWindow?.show());
}

function registerIpcHandlers(): void {
  ipcMain.handle("backup:start", async (_event, taskConfig: any) => {
    try {
      await backupEngine.executeBackup(taskConfig);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("backup:run-all", async () => {
    try {
      await backupEngine.runAllTasks();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("backup:list-tasks", () => {
    return backupEngine.listTasks();
  });

  ipcMain.handle("scheduler:get-jobs", () => {
    return scheduler.getJobs();
  });

  ipcMain.handle("settings:load", () => {
    return loadSettings();
  });

  ipcMain.handle("settings:save", (_event, settings) => {
    saveSettings(settings);
    applySettings(settings);
  });

  ipcMain.handle("dialog:open-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openDirectory", "multiSelections"],
    });
    return result.filePaths;
  });

  ipcMain.handle("dialog:open-file", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openFile", "multiSelections"],
    });
    return result.filePaths;
  });

  ipcMain.handle("app:minimize-to-tray", () => {
    mainWindow?.hide();
  });
}

function applySettings(settings: ReturnType<typeof loadSettings>): void {
  // Start on boot
  app.setLoginItemSettings({
    openAtLogin: settings.startOnBoot,
  });
}

function setupCsp(): void {
  // Only apply strict CSP in production (dev mode needs HMR WebSocket)
  if (isDev) return;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
        ],
      },
    });
  });
}

app.on("ready", () => {
  setupCsp();

  // Forward engine progress to renderer
  backupEngine.onProgress((progress) => {
    mainWindow?.webContents.send("backup:progress", progress);
  });

  // Apply saved settings
  const savedSettings = loadSettings();
  applySettings(savedSettings);

  createMainWindow();
  createTray();
  registerIpcHandlers();
  scheduler.init(backupEngine);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  } else {
    mainWindow?.show();
  }
});
