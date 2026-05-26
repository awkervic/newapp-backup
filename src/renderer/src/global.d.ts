import type { BackupApi } from "../../preload/index";

declare global {
  interface Window {
    api: BackupApi;
  }
}
