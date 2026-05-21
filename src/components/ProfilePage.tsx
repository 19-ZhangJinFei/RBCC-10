"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectRecord } from "@/types/projectTypes";
import { TEXT_MODEL_OPTIONS, IMAGE_MODEL_OPTIONS, VISION_MODEL_OPTIONS } from "@/types/projectTypes";
import {
  loadApiConfig,
  saveApiConfig,
  loadProjectHistory,
  deleteProjectRecord,
  deleteProjectRecords,
  loadCurrentUserProfile,
  loadCurrentUser,
  updateCurrentUserProfile,
  logoutUser,
  type StoredUser,
} from "@/utils/profileStorage";
import AvatarCropper from "@/components/AvatarCropper";
import LoginModal from "@/components/LoginModal";
import { publishCommunityPost } from "@/utils/communityForum";

type Props = {
  onBack: () => void;
  onRestoreProject: (record: ProjectRecord) => void;
  onLogout?: () => void;
};

export default function ProfilePage({ onBack, onRestoreProject, onLogout }: Props) {
  const [apiConfig, setApiConfig] = useState(() =>
    loadApiConfig() ?? { textModelApiKey: "", textModelName: "", imageModelApiKey: "", imageModelName: "", visionModelApiKey: "", visionModelName: "" }
  );
  const [saved, setSaved] = useState(false);
  const [showTextKey, setShowTextKey] = useState(false);
  const [showImageKey, setShowImageKey] = useState(false);
  const [showVisionKey, setShowVisionKey] = useState(false);
  const [envConfig, setEnvConfig] = useState<{ configured: boolean; baseUrl: string; defaultImageModel: string; defaultTextModel: string; defaultVisionModel?: string } | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [profile, setProfile] = useState<StoredUser>(() => loadCurrentUserProfile() ?? { nickname: "豆韵用户", avatarUrl: "", createdAt: Date.now() });
  const [nicknameEditing, setNicknameEditing] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState(profile.nickname);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropperFile, setCropperFile] = useState<File | null>(null);
  const [history, setHistory] = useState(() => loadProjectHistory());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [publishMessageType, setPublishMessageType] = useState<"success" | "error">("success");

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === history.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(history.map(r => r.id)));
    }
  }, [history, selectedIds.size]);

  const batchDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`确定删除选中的 ${ids.length} 条作品记录？此操作不可撤销。`)) return;
    deleteProjectRecords(ids);
    setHistory(loadProjectHistory());
    setSelectedIds(new Set());
  }, [selectedIds]);

  const batchExport = useCallback(() => {
    const records = history.filter(r => selectedIds.has(r.id));
    if (records.length === 0) return;
    records.forEach((record, i) => {
      const url = record.patternUrl || record.cleanPatternUrl || record.mockupUrl;
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        const prefix = String(i + 1).padStart(2, "0");
        a.download = `${prefix}-${record.title || record.theme || "作品"}.png`;
        a.click();
      }
    });
  }, [history, selectedIds]);

  const saveProfile = useCallback((p: StoredUser) => {
    setProfile(p);
    updateCurrentUserProfile({ nickname: p.nickname, avatarUrl: p.avatarUrl });
  }, []);

  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropperFile(file);
    e.target.value = "";
  }, []);

  const handleCropperSave = useCallback((dataUrl: string) => {
    saveProfile({ ...profile, avatarUrl: dataUrl });
    setCropperFile(null);
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

  useEffect(() => {
    if (!apiConfig.useDefaultModel) {
      setEnvConfig(null);
      return;
    }
    setEnvLoading(true);
    fetch("/api/env-config")
      .then(res => res.json())
      .then(data => {
        setEnvConfig(data);
        setApiConfig(prev => ({
          ...prev,
          textModelName: data.defaultTextModel || prev.textModelName,
          imageModelName: data.defaultImageModel || prev.imageModelName,
          visionModelName: data.defaultVisionModel || data.defaultTextModel || prev.visionModelName,
        }));
      })
      .catch(() => setEnvConfig(null))
      .finally(() => setEnvLoading(false));
  }, [apiConfig.useDefaultModel]);

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

  const handlePublish = useCallback(async (record: ProjectRecord) => {
    try {
      await publishCommunityPost({
        record,
        author: profile.nickname || "豆韵用户",
        avatar: profile.avatarUrl,
      });
      setPublishMessageType("success");
      setPublishMessage("作品已发布到云端社区");
    } catch (err) {
      setPublishMessageType("error");
      setPublishMessage(err instanceof Error ? err.message : "作品发布失败");
    }
  }, [profile.avatarUrl, profile.nickname]);

  useEffect(() => {
    if (!publishMessage) return;
    const timer = setTimeout(() => setPublishMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [publishMessage]);

  const isLoggedIn = !!loadCurrentUser();
  const currentTextOption = TEXT_MODEL_OPTIONS.find(m => m.name === apiConfig.textModelName);
  const currentImageOption = IMAGE_MODEL_OPTIONS.find(m => m.name === apiConfig.imageModelName);
  const currentVisionOption = VISION_MODEL_OPTIONS.find(m => m.name === apiConfig.visionModelName);

  const handleLoggedIn = useCallback((user: StoredUser) => {
    setProfile(user);
    setHistory(loadProjectHistory());
    setShowLoginModal(false);
  }, []);

  const confirmLogout = useCallback(() => {
    logoutUser();
    saveApiConfig({ textModelApiKey: "", textModelName: "", imageModelApiKey: "", imageModelName: "", visionModelApiKey: "", visionModelName: "" });
    setProfile({ nickname: "豆韵用户", avatarUrl: "", createdAt: Date.now() });
    setApiConfig({ textModelApiKey: "", textModelName: "", imageModelApiKey: "", imageModelName: "", visionModelApiKey: "", visionModelName: "" });
    setHistory(loadProjectHistory());
    setSelectedIds(new Set());
    setBatchMode(false);
    setShowLogoutConfirm(false);
    onLogout?.();
  }, [onLogout]);

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

          <div className="mt-4 flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-stone-800">使用系统默认模型</div>
              <div className="text-xs text-stone-500">
                {apiConfig.useDefaultModel
                  ? envLoading
                    ? "正在读取环境配置…"
                    : envConfig?.configured
                      ? "已检测到服务端 API 密钥，无需手动填写"
                      : "服务端未配置环境变量密钥"
                  : "手动填写 API Key"}
              </div>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={apiConfig.useDefaultModel ?? false}
                onChange={(e) => setApiConfig(p => ({ ...p, useDefaultModel: e.target.checked }))}
                className="peer sr-only"
              />
              <div className="h-6 w-11 rounded-full bg-stone-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-stone-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white" />
            </label>
          </div>

          {apiConfig.useDefaultModel && envConfig?.configured ? (
            <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="font-medium">✓ 已使用服务端默认配置</p>
              <ul className="mt-1 space-y-1 text-xs text-emerald-700">
                {envConfig.baseUrl && <li>接口地址：<code className="rounded bg-emerald-100 px-1">{envConfig.baseUrl}</code></li>}
                {envConfig.defaultTextModel && <li>默认文本模型：<code className="rounded bg-emerald-100 px-1">{envConfig.defaultTextModel}</code></li>}
                {envConfig.defaultImageModel && <li>默认图片模型：<code className="rounded bg-emerald-100 px-1">{envConfig.defaultImageModel}</code></li>}
                <li>主体识别模型：<code className="rounded bg-emerald-100 px-1">{envConfig.defaultVisionModel || envConfig.defaultTextModel || "未单独配置"}</code></li>
              </ul>
            </div>
          ) : apiConfig.useDefaultModel && !envLoading ? (
            <div className="mt-4 rounded-md border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
              ⚠️ 服务端未配置环境变量密钥（AI_API_KEY / ARK_API_KEY / OPENAI_API_KEY），请手动填写下方的 API Key。
            </div>
          ) : null}

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {/* 文本模型 */}
            <div>
              <label className="text-sm font-medium">文本模型</label>
              <div className="relative mt-1">
                <select
                  value={apiConfig.textModelName}
                  onChange={(e) => setApiConfig(p => ({ ...p, textModelName: e.target.value }))}
                  className={`w-full appearance-none rounded-md border py-2 pl-3 pr-8 text-sm ${apiConfig.useDefaultModel ? 'border-emerald-200 bg-emerald-50/50 text-stone-500' : 'border-stone-300'}`}
                  disabled={apiConfig.useDefaultModel}
                >
                  <option value="" disabled>请选择</option>
                  {TEXT_MODEL_OPTIONS.map(m => <option key={m.name} value={m.name}>{m.icon} {m.name}</option>)}
                </select>
              </div>
              {!apiConfig.useDefaultModel && (
                <>
                  <div className="relative mt-2">
                    <input type={showTextKey ? "text" : "password"} placeholder="API Key" value={apiConfig.textModelApiKey} onChange={(e) => setApiConfig(p => ({ ...p, textModelApiKey: e.target.value }))} className="w-full rounded-md border border-stone-300 py-2 pl-3 pr-9 text-sm" />
                    <button type="button" onClick={() => setShowTextKey(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-700">{showTextKey ? "🙈" : "👁️"}</button>
                  </div>
                  {!apiConfig.textModelApiKey && currentTextOption?.purchaseUrl && (
                    <p className="mt-1.5 text-xs text-stone-400">
                      还没有 API Key？前往
                      <a href={currentTextOption.purchaseUrl} target="_blank" rel="noopener noreferrer" className="mx-1 font-medium text-[#8f1d21] underline hover:text-[#a52327]">官方网站购买</a>
                    </p>
                  )}
                </>
              )}
            </div>
            {/* 生图模型 */}
            <div>
              <label className="text-sm font-medium">生图模型</label>
              <div className="relative mt-1">
                <select
                  value={apiConfig.imageModelName}
                  onChange={(e) => setApiConfig(p => ({ ...p, imageModelName: e.target.value }))}
                  className={`w-full appearance-none rounded-md border py-2 pl-3 pr-8 text-sm ${apiConfig.useDefaultModel ? 'border-emerald-200 bg-emerald-50/50 text-stone-500' : 'border-stone-300'}`}
                  disabled={apiConfig.useDefaultModel}
                >
                  <option value="" disabled>请选择</option>
                  {IMAGE_MODEL_OPTIONS.map(m => <option key={m.name} value={m.name}>{m.icon} {m.name}</option>)}
                </select>
              </div>
              {!apiConfig.useDefaultModel && (
                <>
                  <div className="relative mt-2">
                    <input type={showImageKey ? "text" : "password"} placeholder="API Key" value={apiConfig.imageModelApiKey} onChange={(e) => setApiConfig(p => ({ ...p, imageModelApiKey: e.target.value }))} className="w-full rounded-md border border-stone-300 py-2 pl-3 pr-9 text-sm" />
                    <button type="button" onClick={() => setShowImageKey(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-700">{showImageKey ? "🙈" : "👁️"}</button>
                  </div>
                  {!apiConfig.imageModelApiKey && currentImageOption?.purchaseUrl && (
                    <p className="mt-1.5 text-xs text-stone-400">
                      还没有 API Key？前往
                      <a href={currentImageOption.purchaseUrl} target="_blank" rel="noopener noreferrer" className="mx-1 font-medium text-[#8f1d21] underline hover:text-[#a52327]">官方网站购买</a>
                    </p>
                  )}
                </>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">图像理解模型</label>
              <div className="relative mt-1">
                <select
                  value={apiConfig.visionModelName ?? ""}
                  onChange={(e) => setApiConfig(p => ({ ...p, visionModelName: e.target.value }))}
                  className={`w-full appearance-none rounded-md border py-2 pl-3 pr-8 text-sm ${apiConfig.useDefaultModel ? 'border-emerald-200 bg-emerald-50/50 text-stone-500' : 'border-stone-300'}`}
                  disabled={apiConfig.useDefaultModel}
                >
                  <option value="" disabled>请选择</option>
                  {VISION_MODEL_OPTIONS.map(m => <option key={m.name} value={m.name}>{m.icon} {m.name}</option>)}
                </select>
              </div>
              {!apiConfig.useDefaultModel && (
                <>
                  <div className="relative mt-2">
                    <input
                      type={showVisionKey ? "text" : "password"}
                      placeholder="API Key"
                      value={apiConfig.visionModelApiKey ?? ""}
                      onChange={(e) => setApiConfig(p => ({ ...p, visionModelApiKey: e.target.value }))}
                      className="w-full rounded-md border border-stone-300 py-2 pl-3 pr-9 text-sm"
                    />
                    <button type="button" onClick={() => setShowVisionKey(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-700">{showVisionKey ? "🙈" : "👁️"}</button>
                  </div>
                  {!apiConfig.visionModelApiKey && currentVisionOption?.purchaseUrl && (
                    <p className="mt-1.5 text-xs text-stone-400">
                      还没有 API Key？前往
                      <a href={currentVisionOption.purchaseUrl} target="_blank" rel="noopener noreferrer" className="mx-1 font-medium text-[#8f1d21] underline hover:text-[#a52327]">官方网站购买</a>
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={handleSaveApi} className="rounded-md bg-[#8f1d21] px-4 py-2 text-sm font-semibold text-white">保存配置</button>
            {saved && <span className="text-sm text-emerald-600">✓ 已保存到本地</span>}
          </div>
        </section>

        {/* 历史作品 */}
        <section className="rounded-lg border border-stone-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">历史作品</h2>
              <p className="mt-1 text-sm text-stone-500">点击作品可恢复进度继续编辑，已完成的作品支持导出。</p>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setBatchMode(v => !v)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  batchMode
                    ? "bg-stone-200 text-stone-700"
                    : "border border-stone-300 bg-white text-stone-600 hover:bg-stone-100"
                }`}
              >
                {batchMode ? "退出多选" : "多选"}
              </button>
            )}
          </div>
          {publishMessage && (
            <div className={`fixed left-1/2 top-20 z-[200] -translate-x-1/2 animate-bounce rounded-lg px-5 py-3 text-sm font-medium text-white shadow-lg ${
              publishMessageType === "error" ? "bg-[#6b1a20]" : "bg-emerald-600"
            }`}>
              {publishMessage}
            </div>
          )}

          {history.length === 0 ? (
            <div className="mt-6 grid place-items-center rounded-lg border border-dashed border-stone-300 py-16 text-sm text-stone-400">暂无作品记录</div>
          ) : (
            <>
              {batchMode && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-stone-50 px-4 py-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-stone-700">
                    <input type="checkbox" checked={selectedIds.size === history.length} onChange={toggleSelectAll} className="h-4 w-4 rounded border-stone-300" />
                    全选
                  </label>
                  <span className="text-xs text-stone-400">已选 {selectedIds.size} / {history.length}</span>
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={batchExport} disabled={selectedIds.size === 0} className="rounded-md bg-[#8f1d21] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">📦 批量导出图纸</button>
                    <button type="button" onClick={batchDelete} disabled={selectedIds.size === 0} className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 disabled:opacity-50">🗑️ 批量删除</button>
                  </div>
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {history.map(record => (
                  <ProjectCard
                    key={record.id}
                    record={record}
                    selected={batchMode ? selectedIds.has(record.id) : undefined}
                    onToggleSelect={batchMode ? () => toggleSelect(record.id) : undefined}
                    onRestore={() => { if (!batchMode) onRestoreProject(record); }}
                    onExport={(f) => handleExport(record, f)}
                    onPublish={() => handlePublish(record)}
                    onDelete={() => { deleteProjectRecord(record.id); setHistory(loadProjectHistory()); }}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* 账号设置 */}
        <section className="rounded-lg border border-red-100 bg-white p-6">
          <h2 className="text-xl font-semibold text-stone-800">账号设置</h2>
          {isLoggedIn ? (
            <>
              <p className="mt-1 text-sm text-stone-500">登出后将不再显示与该账号有关的信息，本地未保存的作品不会被删除。</p>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                className="mt-4 rounded-md border border-red-300 bg-red-50 px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                退出登录
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-stone-500">登录后可同步作品进度和个性化设置到本设备。</p>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(true)}
                  className="rounded-md bg-[#8f1d21] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#a52327]"
                >
                  登录 / 注册
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-stone-950">确认退出登录</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              退出后将无法看到当前账号的历史作品，并会清空当前创作进度。重新登录该账号后，可以恢复该账号保存的历史作品。
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={confirmLogout}
                className="rounded-md bg-[#8f1d21] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#a82428]"
              >
                确认退出
              </button>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="rounded-md border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                鏀惧純閫€鍑?
              </button>
            </div>
          </div>
        </div>
      )}

      {cropperFile && (
        <AvatarCropper
          file={cropperFile}
          onSave={handleCropperSave}
          onCancel={() => setCropperFile(null)}
        />
      )}

      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onLoggedIn={handleLoggedIn}
        />
      )}
    </main>
  );
}

function ProjectCard({ record, selected, onToggleSelect, onRestore, onExport, onPublish, onDelete }: {
  record: ProjectRecord;
  selected?: boolean;
  onToggleSelect?: () => void;
  onRestore: () => void;
  onExport: (f: "png" | "preview" | "csv" | "pdf") => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const previewUrl = record.mockupUrl || record.patternUrl || record.cleanPatternUrl;
  return (
    <div className={`group relative rounded-lg border p-3 transition ${
      selected ? "border-[#8f1d21] ring-2 ring-[#8f1d21]/30 bg-[#8f1d21]/5" : "border-stone-200 bg-stone-50 hover:border-stone-400"
    }`}>
      {onToggleSelect && (
        <div
          className="absolute left-2 top-2 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 bg-white"
          style={{ borderColor: selected ? '#8f1d21' : '#d6d3d1' }}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        >
          {selected && <svg className="h-3 w-3 text-[#8f1d21]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
        </div>
      )}
      <div className="aspect-video overflow-hidden rounded-md border border-stone-200 bg-white" onClick={onToggleSelect || onRestore}>
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
                <MenuItem onClick={() => { onPublish(); setShowMenu(false); }}>🌐 发布到社区</MenuItem>
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
