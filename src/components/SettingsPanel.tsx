import { useState, useEffect } from "react";

import { Task } from "../App";

interface WebdavPreset {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
}

interface Props {
  onClose: () => void;
  configBackupTask?: Task;
  onSaveConfigBackup: (task: Omit<Task, "id" | "status"> | null) => Promise<void>;
  onStartConfigBackup: () => Promise<void>;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function SettingsPanel({ 
  onClose,
  configBackupTask,
  onSaveConfigBackup,
  onStartConfigBackup
}: Props) {
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [startOnBoot, setStartOnBoot] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [webdavPresets, setWebdavPresets] = useState<WebdavPreset[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Configuration backup states
  const [configEnabled, setConfigEnabled] = useState(false);
  const [destType, setDestType] = useState<"local" | "webdav">("local");
  const [localPath, setLocalPath] = useState<string>("");
  const [selectedWebdavId, setSelectedWebdavId] = useState<string>("");
  const [backupFrequency, setBackupFrequency] = useState<"daily" | "weekly" | "manual">("daily");
  const [backupHour, setBackupHour] = useState<number>(3);
  const [backupDayOfWeek, setBackupDayOfWeek] = useState<number>(1);

  // Config restore states
  const [showRestoreSection, setShowRestoreSection] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [webdavBackups, setWebdavBackups] = useState<string[]>([]);
  const [selectedWebdavBackup, setSelectedWebdavBackup] = useState("");
  const [loadingWebdavBackups, setLoadingWebdavBackups] = useState(false);

  // New preset form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formUser, setFormUser] = useState("");
  const [formPass, setFormPass] = useState("");

  useEffect(() => {
    window.api.settings.load().then((s) => {
      setMinimizeToTray(s.minimizeToTray);
      setStartOnBoot(s.startOnBoot);
      setTheme(s.theme || "dark");
      const presets = s.webdavPresets || [];
      setWebdavPresets(presets);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (configBackupTask) {
      setConfigEnabled(true);
      setDestType(configBackupTask.destination.type || "local");
      
      if (configBackupTask.destination.type === "webdav") {
        const match = webdavPresets.find(p => p.url === configBackupTask.destination.webdavUrl);
        if (match) {
          setSelectedWebdavId(match.id);
        } else if (webdavPresets.length > 0) {
          setSelectedWebdavId(webdavPresets[0].id);
        }
      } else {
        setLocalPath(configBackupTask.destination.path || "");
      }
      
      if (configBackupTask.schedule) {
        const parts = configBackupTask.schedule.split(" ");
        if (parts.length >= 5) {
          const hour = parseInt(parts[1]) || 0;
          setBackupHour(hour);
          
          if (parts[4] !== "*") {
            setBackupFrequency("weekly");
            setBackupDayOfWeek(parseInt(parts[4]) || 1);
          } else {
            setBackupFrequency("daily");
          }
        }
      } else {
        setBackupFrequency("manual");
      }
    } else {
      setConfigEnabled(false);
      setDestType("local");
      setLocalPath("");
      if (webdavPresets.length > 0 && !selectedWebdavId) {
        setSelectedWebdavId(webdavPresets[0].id);
      }
    }
  }, [configBackupTask, webdavPresets]);

  const handleSaveConfigBackup = (
    enabled: boolean,
    dType: "local" | "webdav",
    webdavId: string,
    locPath: string,
    freq: "daily" | "weekly" | "manual",
    hour: number,
    dow: number
  ) => {
    if (!enabled) {
      onSaveConfigBackup(null);
      return;
    }
    
    let dest: any = { type: dType, path: "" };
    if (dType === "webdav") {
      const preset = webdavPresets.find(p => p.id === webdavId);
      if (!preset) return;
      dest = {
        type: "webdav",
        path: "",
        webdavUrl: preset.url,
        webdavUser: preset.username,
        webdavPassword: preset.password
      };
    } else {
      if (!locPath) return; // Empty path doesn't save yet
      dest = {
        type: "local",
        path: locPath
      };
    }
    
    let cron: string | undefined = undefined;
    if (freq === "daily") {
      cron = `0 ${hour} * * *`;
    } else if (freq === "weekly") {
      cron = `0 ${hour} * * ${dow}`;
    }
    
    onSaveConfigBackup({
      name: "应用配置备份",
      sourcePaths: [], 
      destination: dest,
      options: {
        format: "zip",
        compressionLevel: 5
      },
      schedule: cron,
      lastBackup: configBackupTask?.lastBackup
    });
  };

  async function selectLocalPath() {
    const paths = await window.api.dialog.openDirectory();
    if (paths && paths.length > 0) {
      const path = paths[0];
      setLocalPath(path);
      handleSaveConfigBackup(configEnabled, destType, selectedWebdavId, path, backupFrequency, backupHour, backupDayOfWeek);
    }
  }

  const handleRestoreLocal = async () => {
    try {
      const paths = await window.api.dialog.openFile();
      if (!paths || paths.length === 0) return;
      
      setIsRestoring(true);
      setRestoreMessage("正在读取并恢复本地配置...");
      
      const result = await window.api.config.restoreLocal(paths[0]);
      if (result.success) {
        setRestoreMessage("🎉 配置恢复成功！应用即将自动重启...");
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setRestoreMessage("❌ 恢复失败：备份文件不符或损坏");
      }
    } catch (err: any) {
      setRestoreMessage(`❌ 恢复出错: ${err}`);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleFetchWebdavBackups = async () => {
    try {
      setLoadingWebdavBackups(true);
      setRestoreMessage("");
      const selectedPreset = webdavPresets.find(p => p.id === selectedWebdavId);
      if (!selectedPreset) {
        setRestoreMessage("❌ 错误：请先选择一个有效的 WebDAV 预设！");
        return;
      }
      const destination = {
        type: "webdav",
        path: "/",
        webdavUrl: selectedPreset.url,
        webdavUser: selectedPreset.username,
        webdavPassword: selectedPreset.password,
      };
      const backups = await window.api.config.listWebdavBackups(destination);
      setWebdavBackups(backups);
      if (backups.length > 0) {
        setSelectedWebdavBackup(backups[0]);
      } else {
        setRestoreMessage("⚠️ 未在 WebDAV 备份目录中发现备份文件");
      }
    } catch (err: any) {
      setRestoreMessage(`❌ 获取列表失败: ${err}`);
    } finally {
      setLoadingWebdavBackups(false);
    }
  };

  const handleRestoreWebdav = async () => {
    if (!selectedWebdavBackup) return;
    try {
      setIsRestoring(true);
      setRestoreMessage("正在从 WebDAV 下载并恢复配置...");
      const selectedPreset = webdavPresets.find(p => p.id === selectedWebdavId);
      if (!selectedPreset) {
        setRestoreMessage("❌ 错误：请先选择一个有效的 WebDAV 预设！");
        return;
      }
      const destination = {
        type: "webdav",
        path: "/",
        webdavUrl: selectedPreset.url,
        webdavUser: selectedPreset.username,
        webdavPassword: selectedPreset.password,
      };
      const result = await window.api.config.restoreWebdav(destination, selectedWebdavBackup);
      if (result.success) {
        setRestoreMessage("🎉 配置恢复成功！应用即将自动重启...");
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setRestoreMessage("❌ 恢复失败：备份文件损坏或格式不符");
      }
    } catch (err: any) {
      setRestoreMessage(`❌ 恢复出错: ${err}`);
    } finally {
      setIsRestoring(false);
    }
  };

  function save(next: {
    minimizeToTray?: boolean;
    startOnBoot?: boolean;
    theme?: "dark" | "light";
    webdavPresets?: WebdavPreset[];
  }) {
    const data = {
      minimizeToTray: next.minimizeToTray ?? minimizeToTray,
      startOnBoot: next.startOnBoot ?? startOnBoot,
      theme: next.theme ?? theme,
      webdavPresets: next.webdavPresets ?? webdavPresets,
    };
    if (next.minimizeToTray !== undefined) setMinimizeToTray(next.minimizeToTray);
    if (next.startOnBoot !== undefined) setStartOnBoot(next.startOnBoot);
    if (next.theme !== undefined) setTheme(next.theme);
    if (next.webdavPresets !== undefined) setWebdavPresets(next.webdavPresets);
    window.api.settings.save(data);
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    if (next === "light") {
      document.documentElement.classList.add("light-mode");
    } else {
      document.documentElement.classList.remove("light-mode");
    }
    save({ theme: next });
  }

  function addPreset() {
    if (!formName.trim() || !formUrl.trim()) return;
    const preset: WebdavPreset = {
      id: genId(),
      name: formName.trim(),
      url: formUrl.trim(),
      username: formUser.trim(),
      password: formPass,
    };
    const next = [...webdavPresets, preset];
    save({ webdavPresets: next });
    setFormName("");
    setFormUrl("");
    setFormUser("");
    setFormPass("");
    setShowForm(false);
  }

  function deletePreset(id: string) {
    const next = webdavPresets.filter((p) => p.id !== id);
    save({ webdavPresets: next });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <h2 className="text-lg font-semibold text-gray-100">设置</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* General settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">常规</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-200">关闭时最小化到托盘</p>
                <p className="text-xs text-gray-500">关闭窗口时在后台继续运行</p>
              </div>
              <button
                type="button"
                onClick={() => save({ minimizeToTray: !minimizeToTray })}
                disabled={!loaded}
                className={`w-10 h-5 rounded-full transition-colors ${minimizeToTray ? "bg-blue-600" : "bg-gray-700"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mt-0.5 ${minimizeToTray ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-200">开机自启</p>
                <p className="text-xs text-gray-500">登录 Windows 时自动启动</p>
              </div>
              <button
                type="button"
                onClick={() => save({ startOnBoot: !startOnBoot })}
                disabled={!loaded}
                className={`w-10 h-5 rounded-full transition-colors ${startOnBoot ? "bg-blue-600" : "bg-gray-700"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mt-0.5 ${startOnBoot ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-200">主题</p>
                <p className="text-xs text-gray-500">{theme === "dark" ? "深色模式" : "浅色模式"}</p>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                disabled={!loaded}
                className="w-10 h-5 rounded-full relative"
              >
                {/* Track */}
                <div className={`absolute inset-0 rounded-full transition-colors ${theme === "dark" ? "bg-blue-600" : "bg-amber-400"}`} />
                {/* Thumb with icon */}
                <div className={`absolute w-4 h-4 rounded-full bg-white transition-all top-0.5 flex items-center justify-center ${
                  theme === "dark" ? "left-0.5" : "left-5"
                }`}>
                  {theme === "dark" ? (
                    <svg className="w-2.5 h-2.5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                    </svg>
                  ) : (
                    <svg className="w-2.5 h-2.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
                    </svg>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* 配置备份 */}
          <div className="space-y-4 pt-4 border-t border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-200">系统配置备份</p>
                <p className="text-xs text-gray-500">自动备份软件的任务配置和通用设置到 WebDAV</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !configEnabled;
                  setConfigEnabled(next);
                  if (next && webdavPresets.length > 0 && !selectedWebdavId) {
                    const firstId = webdavPresets[0].id;
                    setSelectedWebdavId(firstId);
                    handleSaveConfigBackup(next, destType, firstId, localPath, backupFrequency, backupHour, backupDayOfWeek);
                  } else {
                    handleSaveConfigBackup(next, destType, selectedWebdavId, localPath, backupFrequency, backupHour, backupDayOfWeek);
                  }
                }}
                className={`w-10 h-5 rounded-full transition-colors ${configEnabled ? "bg-blue-600" : "bg-gray-700"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mt-0.5 ${configEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>

            {configEnabled && (
              <div className="space-y-4 p-4 rounded-xl border border-gray-800 bg-gray-955/30">
                {/* 目的地类型 Segmented Control */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400">备份目的地类型</label>
                  <div className="flex rounded-lg bg-gray-850 p-0.5 border border-gray-700">
                    <button
                      type="button"
                      onClick={() => {
                        setDestType("local");
                        handleSaveConfigBackup(configEnabled, "local", selectedWebdavId, localPath, backupFrequency, backupHour, backupDayOfWeek);
                      }}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                        destType === "local" ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-gray-205"
                      }`}
                    >
                      本地文件夹
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDestType("webdav");
                        let wId = selectedWebdavId;
                        if (!wId && webdavPresets.length > 0) {
                          wId = webdavPresets[0].id;
                          setSelectedWebdavId(wId);
                        }
                        handleSaveConfigBackup(configEnabled, "webdav", wId, localPath, backupFrequency, backupHour, backupDayOfWeek);
                      }}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                        destType === "webdav" ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-gray-205"
                      }`}
                    >
                      WebDAV 云端
                    </button>
                  </div>
                </div>

                {/* 本地选择路径 */}
                {destType === "local" && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400">本地备份文件夹</label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={localPath}
                        placeholder="点击右侧按钮选择保存目录"
                        className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-sm focus:outline-none placeholder-gray-500"
                      />
                      <button
                        type="button"
                        onClick={selectLocalPath}
                        className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg border border-gray-700 transition-colors shrink-0 cursor-pointer"
                      >
                        浏览...
                      </button>
                    </div>
                  </div>
                )}

                {/* WebDAV 选择路径 */}
                {destType === "webdav" && (
                  <div className="space-y-1.5">
                    {webdavPresets.length === 0 ? (
                      <p className="text-xs text-amber-400">⚠️ 请先在下方添加 WebDAV 预设，然后选择它来保存配置备份。</p>
                    ) : (
                      <>
                        <label className="text-xs text-gray-400">选择 WebDAV 备份目的地</label>
                        <select
                          value={selectedWebdavId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            setSelectedWebdavId(nextId);
                            handleSaveConfigBackup(configEnabled, destType, nextId, localPath, backupFrequency, backupHour, backupDayOfWeek);
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
                        >
                          {webdavPresets.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.url})</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                )}

                {/* 只有在配置完备的情况下才展示频率和状态 */}
                {((destType === "local" && localPath) || (destType === "webdav" && webdavPresets.length > 0)) && (
                  <>
                    {/* 备份频率 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs text-gray-400">备份频率</label>
                        <select
                          value={backupFrequency}
                          onChange={(e) => {
                            const nextFreq = e.target.value as any;
                            setBackupFrequency(nextFreq);
                            handleSaveConfigBackup(configEnabled, destType, selectedWebdavId, localPath, nextFreq, backupHour, backupDayOfWeek);
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
                        >
                          <option value="daily">每天自动备份</option>
                          <option value="weekly">每周自动备份</option>
                          <option value="manual">仅手动备份</option>
                        </select>
                      </div>

                      {backupFrequency !== "manual" && (
                        <div className="space-y-1.5">
                          <label className="text-xs text-gray-400">触发时间</label>
                          <div className="flex gap-2">
                            {backupFrequency === "weekly" && (
                              <select
                                value={backupDayOfWeek}
                                onChange={(e) => {
                                  const nextDow = parseInt(e.target.value);
                                  setBackupDayOfWeek(nextDow);
                                  handleSaveConfigBackup(configEnabled, destType, selectedWebdavId, localPath, backupFrequency, backupHour, nextDow);
                                }}
                                className="flex-1 px-2 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
                              >
                                <option value="1">周一</option>
                                <option value="2">周二</option>
                                <option value="3">周三</option>
                                <option value="4">周四</option>
                                <option value="5">周五</option>
                                <option value="6">周六</option>
                                <option value="0">周日</option>
                              </select>
                            )}
                            <select
                              value={backupHour}
                              onChange={(e) => {
                                const nextHour = parseInt(e.target.value);
                                setBackupHour(nextHour);
                                handleSaveConfigBackup(configEnabled, destType, selectedWebdavId, localPath, backupFrequency, nextHour, backupDayOfWeek);
                              }}
                              className="flex-1 px-2 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
                            >
                              {Array.from({ length: 24 }).map((_, i) => (
                                <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 状态与触发操作 */}
                    <div className="pt-2 border-t border-gray-800/60 flex items-center justify-between">
                      <div className="min-w-0">
                        {configBackupTask?.lastBackup ? (
                          <p className="text-[11px] text-gray-500 truncate">上次备份：{configBackupTask.lastBackup}</p>
                        ) : (
                          <p className="text-[11px] text-gray-500 italic">从未备份过</p>
                        )}
                        {configBackupTask?.status === "running" && (
                          <p className="text-[11px] text-blue-400 animate-pulse mt-0.5">
                            正在备份中... {configBackupTask.progress?.percent !== undefined ? `${configBackupTask.progress.percent}%` : ""}
                          </p>
                        )}
                        {configBackupTask?.status === "completed" && (
                          <p className="text-[11px] text-green-400 mt-0.5">上次备份成功</p>
                        )}
                        {configBackupTask?.status === "error" && (
                          <p className="text-[11px] text-red-400 mt-0.5">上次备份失败</p>
                        )}
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => { setShowRestoreSection(!showRestoreSection); setRestoreMessage(""); }}
                          disabled={configBackupTask?.status === "running" || isRestoring}
                          className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          恢复配置
                        </button>
                        <button
                          type="button"
                          onClick={onStartConfigBackup}
                          disabled={configBackupTask?.status === "running" || isRestoring}
                          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          {configBackupTask?.status === "running" ? "正在备份" : "立即备份"}
                        </button>
                      </div>
                    </div>

                    {showRestoreSection && (
                      <div className="mt-3 p-3 rounded-lg bg-gray-950 border border-gray-800 space-y-3">
                        <h4 className="text-xs font-semibold text-gray-300">恢复配置备份</h4>
                        
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={handleRestoreLocal}
                            disabled={isRestoring}
                            className="w-full px-3 py-2 text-xs bg-gray-900 hover:bg-gray-800 text-gray-200 border border-gray-750 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            📁 选择本地备份文件并恢复...
                          </button>

                          {destType === "webdav" && (
                            <div className="space-y-2 mt-1 border-t border-gray-850 pt-2">
                              <button
                                type="button"
                                onClick={handleFetchWebdavBackups}
                                disabled={isRestoring || loadingWebdavBackups}
                                className="w-full px-2.5 py-1.5 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                              >
                                {loadingWebdavBackups ? "正在获取在线列表..." : "☁️ 获取 WebDAV 在线备份列表"}
                              </button>

                              {webdavBackups.length > 0 && (
                                <div className="flex gap-2 items-center">
                                  <select
                                    value={selectedWebdavBackup}
                                    onChange={(e) => setSelectedWebdavBackup(e.target.value)}
                                    className="flex-1 px-2.5 py-2 text-xs rounded-lg bg-gray-900 border border-gray-700 text-gray-150 focus:outline-none focus:border-blue-500"
                                  >
                                    <option value="">-- 选择云端备份文件 --</option>
                                    {webdavBackups.map((filename) => (
                                      <option key={filename} value={filename}>
                                        {filename}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={handleRestoreWebdav}
                                    disabled={isRestoring || !selectedWebdavBackup}
                                    className="px-3.5 py-2 text-xs bg-green-600 hover:bg-green-500 text-white rounded-lg disabled:opacity-40 transition-colors cursor-pointer shrink-0"
                                  >
                                    开始恢复
                                  </button>
                                </div>
                              )}
                              
                              {webdavBackups.length === 0 && !loadingWebdavBackups && (
                                <p className="text-[10px] text-gray-500 text-center italic">暂无云端备份</p>
                              )}
                            </div>
                          )}
                        </div>

                        {restoreMessage && (
                          <div className={`text-[11px] text-center font-medium mt-1 ${restoreMessage.includes("成功") ? "text-green-400" : "text-red-400"}`}>
                            {restoreMessage}
                          </div>
                        )}
                        
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => { setShowRestoreSection(false); setRestoreMessage(""); }}
                            className="text-[10px] text-gray-500 hover:text-gray-400 cursor-pointer"
                          >
                            收起面板
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* WebDAV presets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">WebDAV 预设</h3>
              <button
                type="button"
                onClick={() => setShowForm(!showForm)}
                className="text-xs px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition-colors"
              >
                + 添加
              </button>
            </div>

            {showForm && (
              <div className="space-y-2 rounded-xl border border-gray-700 bg-gray-800/50 p-3">
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="名称 (例如: 我的NAS)"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                  autoFocus
                />
                <input
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="WebDAV URL (https://...)"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                />
                <div className="flex gap-2">
                  <input
                    value={formUser}
                    onChange={(e) => setFormUser(e.target.value)}
                    placeholder="用户名"
                    className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                  />
                  <input
                    value={formPass}
                    onChange={(e) => setFormPass(e.target.value)}
                    type="password"
                    placeholder="密码/Token"
                    className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => { setShowForm(false); setFormName(""); setFormUrl(""); setFormUser(""); setFormPass(""); }} className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors">取消</button>
                  <button type="button" onClick={addPreset} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors">保存</button>
                </div>
              </div>
            )}

            {webdavPresets.length === 0 && !showForm && (
              <p className="text-xs text-gray-500 italic">还没有 WebDAV 预设</p>
            )}

            {webdavPresets.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center text-sm font-bold shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500 truncate">{p.url}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deletePreset(p.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
