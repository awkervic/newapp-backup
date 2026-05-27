import { useState, useEffect } from "react";

interface WebdavPreset {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
}

interface Props {
  onClose: () => void;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function SettingsPanel({ onClose }: Props) {
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [startOnBoot, setStartOnBoot] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [webdavPresets, setWebdavPresets] = useState<WebdavPreset[]>([]);
  const [loaded, setLoaded] = useState(false);

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
      setWebdavPresets(s.webdavPresets || []);
      setLoaded(true);
    });
  }, []);

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
