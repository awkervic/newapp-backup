import { useState, useMemo, useEffect } from "react";
import type { Task } from "../App";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

interface WebdavPreset {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
}

interface Props {
  task?: Task;
  initialSourcePaths?: string[];
  onClose: () => void;
  onSave: (task: Omit<Task, "id" | "status">) => void;
}

export function CreateTaskModal({ task, initialSourcePaths, onClose, onSave }: Props) {
  const isEdit = !!task;
  const [name, setName] = useState(() => {
    if (task?.name) return task.name;
    if (initialSourcePaths && initialSourcePaths.length > 0) {
      const firstPath = initialSourcePaths[0];
      const baseName = firstPath.split(/[\\/]/).filter(Boolean).pop() || "";
      return baseName ? `${baseName} 备份` : "新备份任务";
    }
    return "";
  });
  const [sourcePaths, setSourcePaths] = useState<string[]>(
    task?.sourcePaths ?? initialSourcePaths ?? []
  );
  const [destType, setDestType] = useState<"local" | "webdav">(task?.destination.type ?? "local");
  const [destPath, setDestPath] = useState(
    task?.destination.type === "local" ? task.destination.path : ""
  );

  // WebDAV
  const [webdavPresets, setWebdavPresets] = useState<WebdavPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [webdavUrl, setWebdavUrl] = useState(task?.destination.type === "webdav" ? task.destination.webdavUrl ?? "" : "");
  const [webdavUser, setWebdavUser] = useState(task?.destination.type === "webdav" ? task.destination.webdavUser ?? "" : "");
  const [webdavPassword, setWebdavPassword] = useState(task?.destination.type === "webdav" ? task.destination.webdavPassword ?? "" : "");

  // Load WebDAV presets on mount
  useEffect(() => {
    window.api.settings.load().then((s) => {
      setWebdavPresets(s.webdavPresets || []);
    });
  }, []);

  // Apply preset when selected
  function applyPreset(presetId: string) {
    setSelectedPreset(presetId);
    const preset = webdavPresets.find((p) => p.id === presetId);
    if (preset) {
      setWebdavUrl(preset.url);
      setWebdavUser(preset.username);
      setWebdavPassword(preset.password);
    }
  }
  const [format, setFormat] = useState<"zip" | "7z">(task?.options.format ?? "zip");
  const [compressionLevel, setCompressionLevel] = useState(task?.options.compressionLevel ?? 5);
  const [password, setPassword] = useState(task?.options.password ?? "");

  // Schedule state
  const existingCron = task?.schedule;
  const [scheduleEnabled, setScheduleEnabled] = useState(!!existingCron);
  const [schedulePreset, setSchedulePreset] = useState<"hourly" | "daily" | "weekly" | "custom">("daily");
  const [scheduleHour, setScheduleHour] = useState(9);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [scheduleDay, setScheduleDay] = useState(1);
  const [scheduleCron, setScheduleCron] = useState(existingCron ?? "0 9 * * *");

  // Parse existing cron into preset when editing
  useEffect(() => {
    if (!existingCron) return;
    setScheduleCron(existingCron);
    const parts = existingCron.trim().split(/\s+/);
    if (parts.length >= 2) {
      setScheduleMinute(Number(parts[0]) || 0);
      setScheduleHour(Number(parts[1]) || 0);
    }
    if (parts.length >= 5) {
      const dow = parts[4];
      if (dow !== "*" && parts[2] === "*") {
        setSchedulePreset("weekly");
        setScheduleDay(Number(dow) || 1);
      } else if (parts[1] !== "*" && parts[2] === "*" && parts[3] === "*" && dow === "*") {
        setSchedulePreset("daily");
      } else if (parts[1] === "*" && parts[2] === "*" && parts[3] === "*" && dow === "*") {
        setSchedulePreset("hourly");
      } else {
        setSchedulePreset("custom");
      }
    }
  }, [existingCron]);

  const computedCron = useMemo(() => {
    if (!scheduleEnabled) return undefined;
    if (schedulePreset === "custom") return scheduleCron;
    switch (schedulePreset) {
      case "hourly":
        return `${scheduleMinute} * * * *`;
      case "daily":
        return `${scheduleMinute} ${scheduleHour} * * *`;
      case "weekly":
        return `${scheduleMinute} ${scheduleHour} * * ${scheduleDay}`;
      default:
        return scheduleCron;
    }
  }, [scheduleEnabled, schedulePreset, scheduleHour, scheduleMinute, scheduleDay, scheduleCron]);

  const selectSourceDir = async () => {
    const paths = await window.api.dialog.openDirectory();
    if (paths.length > 0) {
      setSourcePaths((prev) => [...prev, ...paths]);
    }
  };

  const selectDestDir = async () => {
    const paths = await window.api.dialog.openDirectory();
    if (paths.length > 0) {
      setDestPath(paths[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || sourcePaths.length === 0 || (destType === "local" && !destPath)) return;

    onSave({
      name,
      sourcePaths,
      destination:
        destType === "webdav"
          ? { type: "webdav", path: "/", webdavUrl, webdavUser, webdavPassword }
          : { type: "local", path: destPath },
      options: { format, compressionLevel, password: password || undefined },
      schedule: computedCron,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <h2 className="text-lg font-semibold text-gray-100">
            {isEdit ? "编辑备份任务" : "新建备份任务"}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {/* Task name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">任务名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入备份名称"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
              required
            />
          </div>

          {/* Source paths */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">备份来源</label>
            <div className="space-y-2">
              {sourcePaths.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-400 bg-gray-800/50 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 shrink-0 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="truncate">{p}</span>
                  <button type="button" onClick={() => setSourcePaths((prev) => prev.filter((_, j) => j !== i))} className="ml-auto text-gray-600 hover:text-red-400">&times;</button>
                </div>
              ))}
              <button type="button" onClick={selectSourceDir} className="w-full py-2 border-2 border-dashed border-gray-700 rounded-lg text-sm text-gray-500 hover:border-gray-600 hover:text-gray-400 transition-colors">
                + 添加文件或文件夹
              </button>
            </div>
          </div>

          {/* Destination */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">备份目的地</label>
            <div className="flex gap-2 mb-3">
              <button type="button" onClick={() => setDestType("local")} className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${destType === "local" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"}`}>本地磁盘</button>
              <button type="button" onClick={() => setDestType("webdav")} className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${destType === "webdav" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"}`}>WebDAV</button>
            </div>

            {destType === "local" ? (
              <div className="flex items-center gap-2">
                <input value={destPath} readOnly placeholder="选择目标文件夹..." className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-sm" />
                <button type="button" onClick={selectDestDir} className="px-3 py-2 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700">浏览</button>
              </div>
            ) : (
              <div className="space-y-2">
                {webdavPresets.length > 0 && (
                  <select
                    value={selectedPreset}
                    onChange={(e) => applyPreset(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- 选择预设 --</option>
                    {webdavPresets.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
                <input value={webdavUrl} onChange={(e) => { setWebdavUrl(e.target.value); setSelectedPreset(""); }} placeholder="WebDAV URL (https://...)" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm" />
                <div className="flex gap-2">
                  <input value={webdavUser} onChange={(e) => { setWebdavUser(e.target.value); setSelectedPreset(""); }} placeholder="用户名" className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm" />
                  <input value={webdavPassword} onChange={(e) => { setWebdavPassword(e.target.value); setSelectedPreset(""); }} type="password" placeholder="密码/Token" className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm" />
                </div>
              </div>
            )}
          </div>

          {/* Compression settings */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">压缩设置</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">格式</label>
                <select value={format} onChange={(e) => setFormat(e.target.value as "zip" | "7z")} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-blue-500">
                  <option value="zip">ZIP</option>
                  <option value="7z">7z</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">压缩等级</label>
                <select value={compressionLevel} onChange={(e) => setCompressionLevel(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-blue-500">
                  <option value={0}>无压缩</option>
                  <option value={1}>快速</option>
                  <option value={5}>标准</option>
                  <option value={9}>极限</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">密码</label>
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="可选" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm" />
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-300">定时调度</label>
              <button
                type="button"
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                className={`w-9 h-4.5 rounded-full transition-colors ${scheduleEnabled ? "bg-blue-600" : "bg-gray-700"}`}
              >
                <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${scheduleEnabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
              </button>
            </div>

            {scheduleEnabled && (
              <div className="space-y-2.5 mt-2">
                <div className="flex gap-2 flex-wrap">
                  {(["hourly", "daily", "weekly"] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSchedulePreset(preset)}
                      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        schedulePreset === preset
                          ? "bg-blue-600 text-white"
                          : "bg-gray-800 text-gray-400 hover:text-gray-300"
                      }`}
                    >
                      {preset === "hourly" ? "每小时" : preset === "daily" ? "每天" : "每周"}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSchedulePreset("custom")}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      schedulePreset === "custom"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-gray-300"
                    }`}
                  >
                    Cron
                  </button>
                </div>

                {schedulePreset !== "custom" && (
                  <div className="flex items-center gap-3">
                    {schedulePreset === "weekly" && (
                      <select
                        value={scheduleDay}
                        onChange={(e) => setScheduleDay(Number(e.target.value))}
                        className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                      >
                        {WEEKDAYS.map((d, i) => (
                          <option key={i} value={i === 0 ? 0 : i}>
                            {i === 0 ? "周日" : `周${d}`}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={scheduleHour}
                      onChange={(e) => setScheduleHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
                      className="w-16 px-2 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm text-center focus:outline-none focus:border-blue-500"
                      placeholder="时"
                    />
                    <span className="text-gray-500">:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={scheduleMinute}
                      onChange={(e) => setScheduleMinute(Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
                      className="w-16 px-2 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm text-center focus:outline-none focus:border-blue-500"
                      placeholder="分"
                    />
                    <span className="text-xs text-gray-500">
                      {schedulePreset === "hourly"
                        ? "每小时的此时刻执行"
                        : schedulePreset === "daily"
                        ? "每天此时执行"
                        : "每周此时执行"}
                    </span>
                  </div>
                )}

                {schedulePreset === "custom" && (
                  <div>
                    <input
                      value={scheduleCron}
                      onChange={(e) => setScheduleCron(e.target.value)}
                      placeholder="分 时 日 月 周 (例如: 0 9 * * 1)"
                      className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      格式: 分 时 日 月 周 — 0 9 * * 1 表示每周一上午9点
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Cron: {computedCron}</span>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">取消</button>
            <button type="submit" className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
              {isEdit ? "保存修改" : "创建任务"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
