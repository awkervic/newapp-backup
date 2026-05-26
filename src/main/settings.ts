import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

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

const defaults: AppSettings = {
  minimizeToTray: true,
  startOnBoot: false,
  theme: "dark",
  webdavPresets: [],
};

function settingsPath(): string {
  return path.join(app.getPath("userData"), "app-settings.json");
}

export function loadSettings(): AppSettings {
  try {
    const p = settingsPath();
    if (fs.existsSync(p)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(p, "utf-8")) };
    }
  } catch {
    // corrupted file — fall back to defaults
  }
  return { ...defaults };
}

export function saveSettings(settings: AppSettings): void {
  const p = settingsPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(settings, null, 2));
}
