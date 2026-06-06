import { useState } from "react";
import type { Task } from "../App";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function describeSchedule(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return schedule;

  const [min, hour, dom, _month, dow] = parts;

  if (dow === "*" && dom === "*" && min !== "*") {
    if (hour === "*") return `每小时的第 ${min} 分钟`;
    return `每天 ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  if (dow !== "*" && dom === "*" && hour !== "*" && min !== "*") {
    const days = dow
      .split(",")
      .map((d) => `周${WEEKDAYS[Number(d)]}`)
      .join("、");
    return `每周 ${days} ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  return `Cron: ${schedule}`;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return "未知";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

interface TaskListProps {
  tasks: Task[];
  selectedTaskIds: Set<string>;
  onSelectTask: (id: string) => void;
  onStart: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
}

const statusConfig = {
  idle: { label: "就绪", class: "text-gray-400" },
  running: { label: "备份中...", class: "text-blue-400" },
  completed: { label: "已完成", class: "text-green-400" },
  error: { label: "失败", class: "text-red-400" },
};

interface TaskStats {
  size?: number;
  count?: number;
  loading: boolean;
}

export function TaskList({ tasks, selectedTaskIds, onSelectTask, onStart, onDelete, onEdit }: TaskListProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [taskStats, setTaskStats] = useState<Record<string, TaskStats>>({});

  const toggleExpand = async (taskId: string, sourcePaths: string[]) => {
    const isExpanding = !expandedTasks.has(taskId);
    
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });

    if (isExpanding && !taskStats[taskId]) {
      setTaskStats((prev) => ({
        ...prev,
        [taskId]: { loading: true },
      }));
      try {
        const stats = await window.api.backup.getTaskStats(sourcePaths);
        setTaskStats((prev) => ({
          ...prev,
          [taskId]: { size: stats.total_size, count: stats.file_count, loading: false },
        }));
      } catch (err) {
        console.error("Failed to load task stats:", err);
        setTaskStats((prev) => ({
          ...prev,
          [taskId]: { loading: false },
        }));
      }
    }
  };

  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const status = statusConfig[task.status || "idle"];
        const checked = selectedTaskIds.has(task.id);
        const isExpanded = expandedTasks.has(task.id);
        const stats = taskStats[task.id];

        return (
          <div
            key={task.id}
            onClick={() => toggleExpand(task.id, task.sourcePaths)}
            className="group rounded-xl border border-gray-800 bg-gray-900/50 p-4 hover:border-gray-700 transition-all cursor-pointer select-text"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {/* Expand Chevron Icon */}
                <div className="shrink-0 flex items-center justify-center p-0.5 rounded hover:bg-gray-800 transition-colors">
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                      isExpanded ? "rotate-90 text-gray-300" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    task.status === "running"
                      ? "bg-blue-400 animate-pulse"
                      : task.status === "completed"
                      ? "bg-green-400"
                      : task.status === "error"
                      ? "bg-red-400"
                      : "bg-gray-600"
                  }`}
                />
                
                <div className="min-w-0">
                  <h3 className="font-medium text-gray-200 truncate">{task.name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">
                    {task.sourcePaths.join("; ")}
                  </p>
                  {task.schedule && (
                    <p className="text-xs text-blue-400/70 mt-1 flex items-center gap-1">
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {describeSchedule(task.schedule)}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Controls Section */}
              <div
                className="flex items-center gap-3 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-xs text-gray-500 hidden md:inline">
                  {task.options.format.toUpperCase()} · Lv{task.options.compressionLevel}
                </span>
                <span className={`text-xs ${status.class}`}>{status.label}</span>

                {/* Select toggle switch */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTask(task.id);
                  }}
                  className="w-8 h-4 rounded-full relative shrink-0"
                >
                  <div className={`absolute inset-0 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-gray-700"}`} />
                  <div className={`absolute w-3 h-3 rounded-full bg-white transition-all top-0.5 ${checked ? "left-[18px]" : "left-0.5"}`} />
                </button>

                {/* Edit Button: Hidden until hovered on the card, placed to the left of backup button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task);
                  }}
                  className="px-3 py-1.5 text-xs bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200"
                >
                  编辑
                </button>

                {/* Backup Button: Blue, placed at the far right */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStart(task.id);
                  }}
                  disabled={task.status === "running"}
                  className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-blue-100 rounded-lg hover:bg-blue-500 disabled:opacity-40 transition-colors"
                >
                  {task.status === "running" ? "备份中" : "备份"}
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {task.status === "running" && task.progress && (
              <div className="mt-3 space-y-1" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-400/80 truncate max-w-[70%]">
                    {task.progress.currentFile}
                  </span>
                  <span className="text-gray-500 tabular-nums">{task.progress.percent}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300 ease-out"
                    style={{ width: `${task.progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {task.lastBackup && task.status !== "running" && (
              <div className="mt-2 text-xs text-gray-600" onClick={(e) => e.stopPropagation()}>
                上次备份: {task.lastBackup}
              </div>
            )}

            {/* Second-Level Details Expanded Area */}
            {isExpanded && (
              <div
                className="mt-4 pt-4 border-t border-gray-800 space-y-4 text-sm text-gray-400 transition-all animate-fadeIn"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 1. Directory Location */}
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">目录位置</div>
                  <div className="bg-gray-950/40 p-2.5 rounded-lg border border-gray-800/80 font-mono text-xs break-all select-all hover:border-gray-800 transition-colors">
                    {task.sourcePaths.map((p, idx) => (
                      <div key={idx} className={idx > 0 ? "mt-1.5 border-t border-gray-800/50 pt-1.5" : ""}>
                        {p}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Directory Size and File Count */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-950/15 p-3 rounded-lg border border-gray-800/40">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">目录大小</span>
                    <span className="text-sm font-medium text-gray-300 mt-1.5 flex items-center min-h-[20px]">
                      {stats?.loading ? (
                        <span className="flex items-center gap-1.5 text-xs text-gray-500 font-normal">
                          <svg className="animate-spin h-3.5 w-3.5 text-blue-500" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          计算中...
                        </span>
                      ) : (
                        formatBytes(stats?.size)
                      )}
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">文件数量</span>
                    <span className="text-sm font-medium text-gray-300 mt-1.5 flex items-center min-h-[20px]">
                      {stats?.loading ? (
                        <span className="flex items-center gap-1.5 text-xs text-gray-500 font-normal">
                          <svg className="animate-spin h-3.5 w-3.5 text-blue-500" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          计算中...
                        </span>
                      ) : (
                        stats?.count !== undefined ? `${stats.count} 个文件` : "未知"
                      )}
                    </span>
                  </div>
                </div>

                {/* 3. Bottom options display and Delete Button */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-800/40">
                  <div className="text-xs text-gray-500">
                    备份目标: <span className="text-gray-400 font-medium">{task.destination.type === "local" ? "本地" : "WebDAV"}</span> ({task.destination.path})
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`确定要删除备份任务 "${task.name}" 吗？`)) {
                        onDelete(task.id);
                      }
                    }}
                    className="px-3.5 py-1.5 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 hover:border-red-500/30 transition-all flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    删除任务
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
