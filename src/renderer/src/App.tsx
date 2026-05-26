import { useState, useEffect, useCallback } from "react";
import { TaskList } from "./components/TaskList";
import { CreateTaskModal } from "./components/CreateTaskModal";
import { SettingsPanel } from "./components/SettingsPanel";

export interface Task {
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
  lastBackup?: string;
  status?: "idle" | "running" | "completed" | "error";
  progress?: { percent: number; currentFile: string };
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  // Listen for backup progress from main process
  useEffect(() => {
    const unsubscribe = window.api.app.onBackupProgress((progress: any) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === progress.taskId
            ? {
                ...t,
                status: progress.status === "running" ? "running" as const : t.status,
                progress: {
                  percent: progress.percent,
                  currentFile: progress.currentFile,
                },
                lastBackup:
                  progress.status === "completed"
                    ? new Date().toLocaleString()
                    : t.lastBackup,
              }
            : t
        )
      );

      // Update final status
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== progress.taskId) return t;
          if (progress.status === "completed") return { ...t, status: "completed" as const, progress: undefined };
          if (progress.status === "error") return { ...t, status: "error" as const, progress: undefined };
          return t;
        })
      );
    });
    return unsubscribe;
  }, []);

  const addTask = useCallback((task: Omit<Task, "id" | "status">) => {
    const newTask: Task = { ...task, id: generateId(), status: "idle" };
    setTasks((prev) => [...prev, newTask]);
  }, []);

  const updateTask = useCallback((id: string, updates: Omit<Task, "id" | "status">) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const startBackup = useCallback(async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === "running") return;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: "running" as const, progress: { percent: 0, currentFile: "准备中..." } } : t
      )
    );

    try {
      const result = await window.api.backup.start({
        id: task.id,
        name: task.name,
        sourcePaths: task.sourcePaths,
        destination: task.destination,
        options: task.options,
        schedule: task.schedule,
      });

      if (!result.success) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, status: "error" as const, progress: undefined }
              : t
          )
        );
      }
    } catch {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: "error" as const, progress: undefined } : t
        )
      );
    }
  }, [tasks]);

  const runAllBackups = useCallback(async () => {
    setBackingUp(true);
    for (const task of tasks) {
      if (task.status !== "running") {
        await startBackup(task.id);
      }
    }
    setBackingUp(false);
  }, [tasks, startBackup]);

  const handleSelectTask = useCallback((id: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const backupSelected = useCallback(async () => {
    setBackingUp(true);
    for (const id of selectedTaskIds) {
      const task = tasks.find((t) => t.id === id);
      if (task && task.status !== "running") {
        await startBackup(id);
      }
    }
    setBackingUp(false);
  }, [selectedTaskIds, tasks, startBackup]);

  const openEdit = useCallback((task: Task) => {
    setEditingTask(task);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* Title bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm font-bold">
            B
          </div>
          <h1 className="text-lg font-semibold text-gray-100">NewApp Backup</h1>
        </div>
        <div className="flex items-center gap-2">
          {tasks.length > 0 && (
            <>
              <button
                onClick={runAllBackups}
                disabled={backingUp}
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 text-white rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {backingUp && (
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                全部备份
              </button>
              <button
                onClick={backupSelected}
                disabled={backingUp || selectedTaskIds.size === 0}
                className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                备份所选项
              </button>
            </>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            设置
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            + 新建任务
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <h2 className="text-xl font-medium text-gray-300 mb-2">还没有备份任务</h2>
            <p className="text-gray-500 mb-6 max-w-md">
              点击"新建任务"按钮创建您的第一个本地或 WebDAV 备份任务
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              创建第一个任务
            </button>
          </div>
        ) : (
          <TaskList
            tasks={tasks}
            selectedTaskIds={selectedTaskIds}
            onSelectTask={handleSelectTask}
            onStart={startBackup}
            onDelete={deleteTask}
            onEdit={openEdit}
          />
        )}
      </main>

      {/* Status bar */}
      <footer className="flex items-center justify-between px-6 py-2 border-t border-gray-800 bg-gray-900/50 text-xs text-gray-500">
        <span>{tasks.length} 个任务</span>
        <span>{backingUp ? "正在备份..." : "就绪"}</span>
      </footer>

      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onSave={addTask}
        />
      )}

      {editingTask && (
        <CreateTaskModal
          task={editingTask}
          onClose={() => setEditingTask(undefined)}
          onSave={(updated) => updateTask(editingTask.id, updated)}
        />
      )}

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
