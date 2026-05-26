import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import archiver from "archiver";
import { createClient, WebDAVClient } from "webdav";
import { path7za } from "7zip-bin";

export interface BackupTask {
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

export interface BackupProgress {
  taskId: string;
  percent: number;
  currentFile: string;
  status: "running" | "completed" | "error";
  error?: string;
}

type ProgressCallback = (progress: BackupProgress) => void;

export class BackupEngine {
  private tasks: Map<string, BackupTask> = new Map();
  private progressCallbacks: ProgressCallback[] = [];

  addTask(task: BackupTask): void {
    this.tasks.set(task.id, task);
  }

  removeTask(taskId: string): void {
    this.tasks.delete(taskId);
  }

  getTask(taskId: string): BackupTask | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(): BackupTask[] {
    return Array.from(this.tasks.values());
  }

  onProgress(callback: ProgressCallback): void {
    this.progressCallbacks.push(callback);
  }

  private emitProgress(progress: BackupProgress): void {
    this.progressCallbacks.forEach((cb) => cb(progress));
  }

  async executeBackup(task: BackupTask): Promise<void> {
    const taskId = task.id;
    const now = new Date();
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}_${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
    const backupFileName = `${task.name.replace(/\s+/g, "_")}_${dateStr}.${task.options.format}`;

    this.emitProgress({
      taskId,
      percent: 0,
      currentFile: "正在准备备份...",
      status: "running",
    });

    try {
      const archivePath = path.join(
        task.destination.type === "local" ? task.destination.path : appTempDir(),
        backupFileName
      );

      await this.createArchive(task.sourcePaths, archivePath, task.options, (file, percent) => {
        this.emitProgress({
          taskId,
          percent,
          currentFile: `正在压缩: ${file}`,
          status: "running",
        });
      });

      this.emitProgress({
        taskId,
        percent: 90,
        currentFile: "压缩完成，正在传输...",
        status: "running",
      });

      if (task.destination.type === "webdav") {
        await this.uploadToWebdav(archivePath, backupFileName, task.destination);
      }

      if (task.destination.type === "local" && archivePath !== path.join(task.destination.path, backupFileName)) {
        fs.copyFileSync(archivePath, path.join(task.destination.path, backupFileName));
        fs.unlinkSync(archivePath);
      }

      this.emitProgress({
        taskId,
        percent: 100,
        currentFile: "备份完成",
        status: "completed",
      });
    } catch (err: any) {
      this.emitProgress({
        taskId,
        percent: 0,
        currentFile: "备份失败",
        status: "error",
        error: err.message,
      });
      throw err;
    }
  }

  private createArchive(
    sourcePaths: string[],
    outputPath: string,
    options: BackupTask["options"],
    onProgress: (file: string, percent: number) => void
  ): Promise<void> {
    // archiver does not support password encryption, so when a password is set,
    // use 7za for both zip (AES-256) and 7z formats
    if (options.format === "7z" || options.password) {
      return this.create7zArchive(sourcePaths, outputPath, options, onProgress);
    }
    return this.createZipArchive(sourcePaths, outputPath, options, onProgress);
  }

  private createZipArchive(
    sourcePaths: string[],
    outputPath: string,
    options: BackupTask["options"],
    onProgress: (file: string, percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver("zip", {
        zlib: { level: options.compressionLevel },
      });

      output.on("close", () => resolve());
      archive.on("error", (err) => reject(err));

      archive.pipe(output);

      let totalSize = 0;
      let processedSize = 0;
      const fileList: { path: string; name: string }[] = [];

      for (const sourcePath of sourcePaths) {
        const stat = fs.statSync(sourcePath);
        if (stat.isDirectory()) {
          const files = collectFiles(sourcePath);
          files.forEach((f) => {
            fileList.push(f);
            totalSize += fs.statSync(f.path).size;
          });
        } else {
          fileList.push({ path: sourcePath, name: path.basename(sourcePath) });
          totalSize += stat.size;
        }
      }

      for (const file of fileList) {
        archive.file(file.path, { name: file.name });
        processedSize += fs.statSync(file.path).size;
        const percent = Math.round((processedSize / totalSize) * 80);
        onProgress(file.name, percent);
      }

      archive.finalize();
    });
  }

  private create7zArchive(
    sourcePaths: string[],
    outputPath: string,
    options: BackupTask["options"],
    onProgress: (file: string, percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Collect all files first to estimate total size
      const allFiles: string[] = [];

      for (const sourcePath of sourcePaths) {
        const stat = fs.statSync(sourcePath);
        if (stat.isDirectory()) {
          const files = collectFiles(sourcePath);
          for (const f of files) {
            allFiles.push(f.path);
          }
        } else {
          allFiles.push(sourcePath);
        }
      }

      // Build 7za arguments
      const isZip = options.format === "zip";
      const args: string[] = ["a", isZip ? "-tzip" : "-t7z", outputPath];

      // Compression level: -mx0..9
      const mxMap: Record<number, string> = {
        0: "0", 1: "1", 2: "3", 3: "3",
        4: "5", 5: "5", 6: "7", 7: "7",
        8: "9", 9: "9",
      };
      args.push(`-mx${mxMap[options.compressionLevel] ?? "5"}`);

      // AES-256 encryption (for zip: -mem=AES256, for 7z: -mhe=on)
      if (options.password) {
        if (isZip) {
          args.push("-mem=AES256");
        } else {
          args.push("-mhe=on"); // encrypt file names
        }
        args.push(`-p${options.password}`);
      }

      // Add source files/dirs
      for (const p of allFiles) {
        args.push(p);
      }

      let processedSize = 0;
      const proc = execFile(path7za, args);

      proc.on("error", (err) => reject(err));

      proc.on("exit", (code) => {
        if (code === 0) {
          onProgress(outputPath, 100);
          resolve();
        } else {
          reject(new Error(`7za exited with code ${code}`));
        }
      });

      // Parse stdout for progress
      proc.stdout?.on("data", (data: string) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          const match = line.match(/^\s*(Compressing|Updating)\s+(.+)$/);
          if (match) {
            const fileName = match[2].trim();
            processedSize++;
            const percent = Math.min(
              Math.round((processedSize / allFiles.length) * 80),
              80
            );
            onProgress(fileName, percent);
          }
        }
      });

      proc.stderr?.on("data", () => {
        // 7za may output warnings to stderr, only treat as error on non-zero exit
      });
    });
  }

  private async uploadToWebdav(
    localPath: string,
    remoteFileName: string,
    dest: BackupTask["destination"]
  ): Promise<void> {
    const client = createClient(dest.webdavUrl!, {
      username: dest.webdavUser,
      password: dest.webdavPassword,
    });

    const remotePath = `/${remoteFileName}`;
    const fileContent = fs.createReadStream(localPath);
    await client.putFileContents(remotePath, fileContent, { overwrite: true });
    fs.unlinkSync(localPath);
  }

  async runAllTasks(): Promise<void> {
    for (const task of this.tasks.values()) {
      await this.executeBackup(task);
    }
  }
}

function appTempDir(): string {
  const dir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function collectFiles(dir: string): { path: string; name: string }[] {
  const result: { path: string; name: string }[] = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      result.push(...collectFiles(fullPath));
    } else {
      result.push({ path: fullPath, name: path.relative(dir, fullPath) });
    }
  }
  return result;
}
