"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ProjectRecord } from "@/types/projectTypes";
import { TEXT_MODEL_OPTIONS, IMAGE_MODEL_OPTIONS } from "@/types/projectTypes";
import {
  loadApiConfig,
  saveApiConfig,
  loadProjectHistory,
  deleteProjectRecord,
  loadCurrentUserProfile,
  updateCurrentUserProfile,
  type StoredUser,
} from "@/utils/profileStorage";

type Props = {
  onBack: () => void;
  onRestoreProject: (record: ProjectRecord) => void;
};

export default function ProfilePage({ onBack, onRestoreProject }: Props) {
  const [apiConfig, setApiConfig] = useState(() =>
    loadApiConfig() ?? { textModelApiKey: "", textModelName: TEXT_MODEL_OPTIONS[0]!.name, imageModelApiKey: "", imageModelName: IMAGE_MODEL_OPTIONS[0]!.name }
  );
  const [saved, setSaved] = useState(false);
  const [showTextKey, setShowTextKey] = useState(false);
  const [showImageKey, setShowImageKey] = useState(false);
  const [profile, setProfile] = useState<StoredUser>(() => loadCurrentUserProfile() ?? { nickname: "豆韵用户", avatarUrl: "", createdAt: Date.now() });
  const [nicknameEditing, setNicknameEditing] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState(profile.nickname);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const history = useMemo(() => loadProjectHistory(), []);

  const saveProfile = useCallback((p: StoredUser) => {
    setProfile(p);
    updateCurrentUserProfile({ nickname: p.nickname, avatarUrl: p.avatarUrl });
  }, []);

  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      saveProfile({ ...profile, avatarUrl: String(reader.result) });
    };
    reader.readAsDataURL(file);
  }, [profile, saveProfile]);

  const removeAvatar = useCallback(() => {
    saveProfile({ ...profile, avatarUrl: "" });
  }, [profile, saveProfile]);

  const saveNickname = useCallback(() => {
    const trimmed = nicknameDraft.trim();
    if (trimmed) {
      saveProfile({ ...profile, nickname: trimmed });
    }
    setNicknameEditing(false);
  }, [nicknameDraft, profile, saveProfile]);

  const handleSaveApi = useCallback(() => { saveApiConfig(apiConfig); setSaved(true); setTimeout(() => setSaved(false), 2000); }, [apiConfig]);

  const handleExport = useCallback((record: ProjectRecord, format: "png" | "preview" | "csv" | "pdf") => {
    const title = record.title || "豆韵作品";
    switch (format) {
      case "png": if (record.patternUrl) { const a = document.createElement("a"); a.href = record.patternUrl; a.download = `${title}-拼豆图纸.png`; a.click(); } break;
      case "preview": if (record.mockupUrl) { const a = document.createElement("a"); a.href = record.mockupUrl; a.download = `${title}-场景预览.png`; a.click(); } break;
      case "csv": alert("请进入作品后，在「拼豆图纸」步骤下载用量 CSV。"); break;
      case "pdf": alert("请进入作品后，在「场景预览」步骤使用打印/PDF 导出。"); break;
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#f8f5ef] text-stone-950">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-[#fffdf7]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-950">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            返回首页
          </button>
          <span className="text-lg font-semibold tracking-tight">个人主页</span>
          <div className="w-20" />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        {/* 头像 & 昵称 */}
        <section className="rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="text-xl font-semibold">个人资料</h2>
          <p className="mt-1 text-sm text-stone-500">设置头像和昵称，信息仅存储在本地浏览器中。</p>
          <div className="mt-5 flex items-center gap-5">
            {/* 头像 */}
            <div className="relative shrink-0">
              <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-stone-200 bg-stone-100">
                {profile.avatarUrl ? (
                  profile.avatarUrl.startsWith("data:") ? (
                    <img src={profile.avatarUrl} alt="头像" className="h-full w-full object-cover" />
                  ) : profile.avatarUrl.startsWith("emoji:") ? (
                    <span className="grid h-full w-full place-items-center text-3xl">{profile.avatarUrl.slice(6)}</span>
                  ) : (
                    <div className="flex h-full items-center justify-center bg-stone-200 text-2xl font-semibold text-stone-500">
                      {profile.nickname.charAt(0)}
                    </div>
                  )
                ) : (
                  <div className="flex h-full items-center justify-center bg-stone-200 text-2xl font-semibold text-stone-500">
                    {profile.nickname.charAt(0)}
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              <div className="mt-2 flex justify-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs font-medium text-[#8f1d21] hover:underline">更换</button>
                {profile.avatarUrl && (
                  <button type="button" onClick={removeAvatar} className="text-xs font-medium text-stone-400 hover:text-red-600 hover:underline">移除</button>
                )}
              </div>
            </div>

            {/* 昵称 */}
            <div className="flex-1">
              {nicknameEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    value={nicknameDraft}
                    onChange={(e) => setNicknameDraft(e.target.value)}
                    className="w-full max-w-xs rounded-md border border-stone-300 px-3 py-2 text-base font-medium"
                    onKeyDown={(e) => { if (e.key === "Enter") saveNickname(); if (e.key === "Escape") { setNicknameDraft(profile.nickname); setNicknameEditing(false); } }}
                    autoFocus
                  />
                  <button type="button" onClick={saveNickname} className="text-sm font-semibold text-[#8f1d21]">保存</button>
                  <button type="button" onClick={() => { setNicknameDraft(profile.nickname); setNicknameEditing(false); }} className="text-sm text-stone-500">取消</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{profile.nickname}</span>
                  <button type="button" onClick={() => { setNicknameDraft(profile.nickname); setNicknameEditing(true); }} className="text-sm text-stone-400 hover:text-[#8f1d21]">✎ 编辑</button>
                </div>
              )}
              <p className="mt-1 text-xs text-stone-400">头像支持 JPG/PNG 格式，昵称可随时修改</p>
            </div>
          </div>
        </section>

        {/* API 配置 */}
        <section className="rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="text-xl font-semibold">API 配置</h2>
          <p className="mt-1 text-sm text-stone-500">填写模型 API 密钥以启用 AI 生成功能，密钥仅存储在本地浏览器中。</p>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {/* 文本模型 */}
            <div>
              <label className="text-sm font-medium">文本模型</label>
              <div className="relative mt-1">
                <select value={apiConfig.textModelName} onChange={(e) => setApiConfig(p => ({ ...p, textModelName: e.target.value }))} className="w-full appearance-none rounded-md border border-stone-300 py-2 pl-9 pr-8 text-sm">
                  {TEXT_MODEL_OPTIONS.map(m => <option key={m.name} value={m.name}>{m.icon} {m.name}</option>)}
                </select>
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base">{TEXT_MODEL_OPTIONS.find(m => m.name === apiConfig.textModelName)?.icon ?? "🤖"}</span>
              </div>
              <div className="relative mt-2">
                <input type={showTextKey ? "text" : "password"} placeholder="API Key" value={apiConfig.textModelApiKey} onChange={(e) => setApiConfig(p => ({ ...p, textModelApiKey: e.target.value }))} className="w-full rounded-md border border-stone-300 py-2 pl-3 pr-9 text-sm" />
                <button type="button" onClick={() => setShowTextKey(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-700">{showTextKey ? "🙈" : "👁️"}</button>
              </div>
            </div>
            {/* 生图模型 */}
            <div>
              <label className="text-sm font-medium">生图模型</label>
              <div className="relative mt-1">
                <select value={apiConfig.imageModelName} onChange={(e) => setApiConfig(p => ({ ...p, imageModelName: e.target.value }))} className="w-full appearance-none rounded-md border border-stone-300 py-2 pl-9 pr-8 text-sm">
                  {IMAGE_MODEL_OPTIONS.map(m => <option key={m.name} value={m.name}>{m.icon} {m.name}</option>)}
                </select>
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base">{IMAGE_MODEL_OPTIONS.find(m => m.name === apiConfig.imageModelName)?.icon ?? "🎨"}</span>
              </div>
              <div className="relative mt-2">
                <input type={showImageKey ? "text" : "password"} placeholder="API Key" value={apiConfig.imageModelApiKey} onChange={(e) => setApiConfig(p => ({ ...p, imageModelApiKey: e.target.value }))} className="w-full rounded-md border border-stone-300 py-2 pl-3 pr-9 text-sm" />
                <button type="button" onClick={() => setShowImageKey(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-700">{showImageKey ? "🙈" : "👁️"}</button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={handleSaveApi} className="rounded-md bg-[#8f1d21] px-4 py-2 text-sm font-semibold text-white">保存配置</button>
            {saved && <span className="text-sm text-emerald-600">✓ 已保存到本地</span>}
          </div>
        </section>

        {/* 历史作品 */}
        <section className="rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="text-xl font-semibold">历史作品</h2>
          <p className="mt-1 text-sm text-stone-500">点击作品可恢复进度继续编辑，已完成的作品支持导出。</p>
          {history.length === 0 ? (
            <div className="mt-6 grid place-items-center rounded-lg border border-dashed border-stone-300 py-16 text-sm text-stone-400">暂无作品记录</div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {history.map(record => (
                <ProjectCard key={record.id} record={record} onRestore={() => onRestoreProject(record)} onExport={(f) => handleExport(record, f)} onDelete={() => { deleteProjectRecord(record.id); window.location.reload(); }} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ProjectCard({ record, onRestore, onExport, onDelete }: { record: ProjectRecord; onRestore: () => void; onExport: (f: "png" | "preview" | "csv" | "pdf") => void; onDelete: () => void }) {
  const [showMenu, setShowMenu] = useState(false);
  const previewUrl = record.mockupUrl || record.patternUrl || record.cleanPatternUrl;
  return (
    <div className="group relative rounded-lg border border-stone-200 bg-stone-50 p-3 transition hover:border-stone-400">
      <div className="aspect-video cursor-pointer overflow-hidden rounded-md border border-stone-200 bg-white" onClick={onRestore}>
        {previewUrl ? <img src={previewUrl} alt={record.title} className="h-full w-full object-contain" /> : <div className="grid h-full place-items-center text-xs text-stone-400">无预览</div>}
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{record.title || record.theme}</h3>
          <p className="text-xs text-stone-500">{record.element} · {record.productId}</p>
          <p className="text-[11px] text-stone-400">{new Date(record.updatedAt).toLocaleDateString("zh-CN")}</p>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setShowMenu(v => !v)} className="rounded p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-8 z-20 w-48 rounded-md border border-stone-200 bg-white py-1 shadow-lg">
                <MenuItem onClick={() => { onExport("png"); setShowMenu(false); }}>📄 图纸 PNG</MenuItem>
                <MenuItem onClick={() => { onExport("preview"); setShowMenu(false); }}>🖼️ 预览 PNG</MenuItem>
                <MenuItem onClick={() => { onExport("csv"); setShowMenu(false); }}>📊 导出 CSV</MenuItem>
                <MenuItem onClick={() => { onExport("pdf"); setShowMenu(false); }}>📝 导出 PDF</MenuItem>
                <hr className="my-1 border-stone-200" />
                <MenuItem onClick={() => { onRestore(); setShowMenu(false); }}>📂 恢复进度</MenuItem>
                <MenuItem onClick={() => { if (confirm("确定删除？")) { onDelete(); setShowMenu(false); } }} className="text-red-600">🗑️ 删除记录</MenuItem>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuItem({ children, onClick, className = "" }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-stone-100 ${className}`}>{children}</button>;
}
