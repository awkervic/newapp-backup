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

export function TaskList({ tasks, selectedTaskIds, onSelectTask, onStart, onDelete, onEdit }: TaskListProps) {
  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const status = statusConfig[task.status || "idle"];
        const checked = selectedTaskIds.has(task.id);
        return (
          <div
            key={task.id}
            className="group rounded-xl border border-gray-800 bg-gray-900/50 p-4 hover:border-gray-700 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 min-w-0">
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

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-500 hidden sm:inline">
                  {task.options.format.toUpperCase()} · Lv{task.options.compressionLevel}
                </span>
                <span className={`text-xs ${status.class}`}>{status.label}</span>

                {/* Select toggle switch */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectTask(task.id)}
                    className="w-8 h-4 rounded-full relative shrink-0"
                  >
                    <div className={`absolute inset-0 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-gray-700"}`} />
                    <div className={`absolute w-3 h-3 rounded-full bg-white transition-all top-0.5 ${checked ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                  {checked && <span className="text-xs text-blue-400 whitespace-nowrap">已选</span>}
                </div>

                <button
                  onClick={() => onStart(task.id)}
                  disabled={task.status === "running"}
                  className="px-5 py-2 text-sm font-medium bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 disabled:opacity-40 transition-colors"
                >
                  {task.status === "running" ? "备份中" : "备份"}
                </button>
                <button
                  onClick={() => onEdit(task)}
                  className="px-3 py-2 text-xs bg-gray-700 text-gray-400 rounded-lg hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-all"
                >
                  编辑
                </button>
                <button
                  onClick={() => onDelete(task.id)}
                  className="px-3 py-2 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 opacity-0 group-hover:opacity-100 transition-all"
                >
                  删除
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {task.status === "running" && task.progress && (
              <div className="mt-3 space-y-1">
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
              <div className="mt-2 text-xs text-gray-600">
                上次备份: {task.lastBackup}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
