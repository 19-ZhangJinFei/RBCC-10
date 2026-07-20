"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiConfig, ProjectRecord } from "@/types/projectTypes";
import { TEXT_MODEL_OPTIONS, IMAGE_MODEL_OPTIONS, VISION_MODEL_OPTIONS } from "@/types/projectTypes";
import {
  loadApiConfig,
  saveApiConfig,
  loadProjectHistoryAsync,
  deleteProjectRecord,
  deleteProjectRecords,
  loadCurrentUserProfile,
  loadCurrentUser,
  loadUserSkillLevel,
  saveUserSkillLevel,
  updateCurrentUserProfile,
  logoutUser,
  DEFAULT_AUTO_SAVE_INTERVAL_SECONDS,
  DEFAULT_USER_SKILL_LEVEL,
  normalizeAutoSaveIntervalSeconds,
  type StoredUser,
  type UserSkillLevel,
} from "@/utils/profileStorage";
import AvatarCropper from "@/components/AvatarCropper";
import LoginModal from "@/components/LoginModal";
import { ProjectFallbackPreview } from "@/components/ProjectFallbackPreview";
import { publishCommunityPost } from "@/utils/communityForum";
import { languageLabel, type AppLanguage } from "@/utils/language";

type Props = {
  onBack: () => void;
  onRestoreProject: (record: ProjectRecord) => void;
  onLogin?: (user: StoredUser) => void;
  onLogout?: () => void;
  onApiConfigSaved?: (config: ApiConfig) => void;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
};

type EnvConfig = {
  configured: boolean;
  baseUrl: string;
  imageBaseUrl?: string;
  textBaseUrl?: string;
  defaultImageModel: string;
  defaultTextModel: string;
  defaultVisionModel?: string;
};

let cachedEnvConfig: EnvConfig | null = null;
let envConfigLoaded = false;
let envConfigPromise: Promise<EnvConfig | null> | null = null;

function loadEnvConfigOnce(): Promise<EnvConfig | null> {
  if (envConfigLoaded) return Promise.resolve(cachedEnvConfig);
  if (envConfigPromise) return envConfigPromise;

  envConfigPromise = fetch("/api/env-config")
    .then(res => res.json())
    .then((data: EnvConfig) => {
      cachedEnvConfig = data;
      envConfigLoaded = true;
      return data;
    })
    .catch(() => {
      envConfigLoaded = true;
      return null;
    })
    .finally(() => {
      envConfigPromise = null;
    });

  return envConfigPromise;
}

export default function ProfilePage({ onBack, onRestoreProject, onLogin, onLogout, onApiConfigSaved, language, onLanguageChange }: Props) {
  const text = {
    backHome: language === "en" ? "Back Home" : "返回首页",
    profileTitle: language === "en" ? "Profile" : "个人主页",
    languageTitle: "中文/Language",
    languageDesc: language === "en"
      ? "Select the system language. Navigation, profile settings, and future AI responses follow this choice."
      : "选择系统语言。导航、个人配置和后续 AI 输出都会跟随此选项。",
    personalInfo: language === "en" ? "Personal Info" : "个人资料",
    personalInfoDesc: language === "en" ? "Set your avatar and nickname. This information is stored only in this browser." : "设置头像和昵称，信息仅存储在本地浏览器中。",
    skillLevel: language === "en" ? "Skill Level" : "制作熟练度",
    skillLevelDesc: language === "en"
      ? "This affects how complex AI-generated images are."
      : "用于控制 AI 生图的图案难度、细节密度和配色层次。",
    change: language === "en" ? "Change" : "更换",
    remove: language === "en" ? "Remove" : "移除",
    save: language === "en" ? "Save" : "保存",
    cancel: language === "en" ? "Cancel" : "取消",
    edit: language === "en" ? "Edit" : "编辑",
    avatarHint: language === "en" ? "JPG/PNG avatars are supported. Nickname can be changed anytime." : "头像支持 JPG/PNG 格式，昵称可随时修改",
    apiConfig: language === "en" ? "API Configuration" : "API 配置",
    apiConfigDesc: language === "en" ? "Add model API keys to enable AI features. Keys are stored only in this browser." : "填写模型 API 密钥以启用 AI 生成功能，密钥仅存储在本地浏览器中。",
    useDefaultModel: language === "en" ? "Use System Default Model" : "使用系统默认模型",
    loadingEnv: language === "en" ? "Reading environment configuration..." : "正在读取环境配置…",
    envConfigured: language === "en" ? "Server API key detected. Manual input is not required." : "已检测到服务端 API 密钥，无需手动填写",
    envMissing: language === "en" ? "Server environment API key is not configured." : "服务端未配置环境变量密钥",
    manualKey: language === "en" ? "Manual API Key" : "手动填写 API Key",
    history: language === "en" ? "Project History" : "历史作品",
    historyDesc: language === "en" ? "Restore saved work and continue editing. Finished works can be exported." : "点击作品可恢复进度继续编辑，已完成的作品支持导出。",
    account: language === "en" ? "Account Settings" : "账号设置",
    logout: language === "en" ? "Log out" : "退出登录",
    loginRegister: language === "en" ? "Log in / Register" : "登录 / 注册",
    deleteConfirm: language === "en" ? "Delete the selected project records? This cannot be undone." : "确定删除选中的作品记录？此操作不可撤销。",
    defaultWork: language === "en" ? "Work" : "作品",
    defaultDouyunWork: language === "en" ? "Doge Work" : "豆阁作品",
    patternPng: language === "en" ? "Pattern PNG" : "拼豆图纸",
    previewPng: language === "en" ? "Preview PNG" : "场景预览",
    csvAlert: language === "en" ? "Open the work and download the usage CSV from the bead pattern step." : "请进入作品后，在「拼豆图纸」步骤下载用量 CSV。",
    pdfAlert: language === "en" ? "Open the work and use print/PDF export from the scene preview step." : "请进入作品后，在「场景预览」步骤使用打印/PDF 导出。",
    publishSuccess: language === "en" ? "Work published to the cloud community." : "作品已发布到云端社区",
    publishFailed: language === "en" ? "Failed to publish work." : "作品发布失败",
    avatarAlt: language === "en" ? "Avatar" : "头像",
    defaultConfigured: language === "en" ? "System default configuration is active" : "已使用服务端默认配置",
    imageBaseUrl: language === "en" ? "Image/Vision API" : "图像/视觉接口",
    textBaseUrl: language === "en" ? "Text API" : "纯文本接口",
    defaultTextModel: language === "en" ? "Default text model" : "默认文本模型",
    defaultImageModel: language === "en" ? "Default image model" : "默认图片模型",
    visionModel: language === "en" ? "Vision model" : "主体识别模型",
    notConfiguredSeparately: language === "en" ? "Not separately configured" : "未单独配置",
    envMissingDetail: language === "en" ? "The server requires both ARK_API_KEY (image/vision) and DEEPSEEK_API_KEY (text)." : "服务端需要同时配置 ARK_API_KEY（图像/视觉）和 DEEPSEEK_API_KEY（纯文本）。",
    textModel: language === "en" ? "Text Model" : "文本模型",
    imageModel: language === "en" ? "Image Model" : "生图模型",
    visionModelLabel: language === "en" ? "Vision Model" : "图像理解模型",
    selectPlaceholder: language === "en" ? "Select" : "请选择",
    noApiKey: language === "en" ? "Need an API key? Visit" : "还没有 API Key？前往",
    officialSite: language === "en" ? "official site" : "官方网站购买",
    autoSaveInterval: language === "en" ? "Auto-save Interval" : "自动保存间隔",
    seconds: language === "en" ? "seconds" : "秒",
    autoSaveHint: language === "en" ? "Projects are auto-saved at this interval while creating. Default is 30 seconds." : "创作进行中会按这个间隔自动保存到历史作品，默认 30 秒。",
    saveConfig: language === "en" ? "Save Configuration" : "保存配置",
    savedLocal: language === "en" ? "Saved locally" : "已保存到本地",
    multiSelect: language === "en" ? "Multi-select" : "多选",
    exitMultiSelect: language === "en" ? "Exit multi-select" : "退出多选",
    noRecords: language === "en" ? "No project records yet" : "暂无作品记录",
    selectAll: language === "en" ? "Select all" : "全选",
    selectedCount: language === "en" ? "Selected" : "已选",
    batchExport: language === "en" ? "Batch export patterns" : "批量导出图纸",
    batchDelete: language === "en" ? "Batch delete" : "批量删除",
    logoutDesc: language === "en" ? "After logging out, this account's history will be hidden. Unsaved local works are not deleted." : "登出后将不再显示与该账号有关的信息，本地未保存的作品不会被删除。",
    loginDesc: language === "en" ? "Log in to keep project progress and personalized settings on this device." : "登录后可同步作品进度和个性化设置到本设备。",
    logoutTitle: language === "en" ? "Confirm Log Out" : "确认退出登录",
    logoutConfirmDesc: language === "en" ? "After logging out, this account's project history will be hidden and current progress will be cleared. Log in again to restore the saved history for this account." : "退出后将无法看到当前账号的历史作品，并会清空当前创作进度。重新登录该账号后，可以恢复该账号保存的历史作品。",
    confirmLogout: language === "en" ? "Confirm Log Out" : "确认退出",
    keepLoggedIn: language === "en" ? "Stay Logged In" : "放弃退出",
    noPreview: language === "en" ? "No preview" : "无预览",
    restoreProgress: language === "en" ? "Restore Progress" : "恢复进度",
    publishCommunity: language === "en" ? "Publish to Community" : "发布到社区",
    deleteRecord: language === "en" ? "Delete Record" : "删除记录",
    deleteOneConfirm: language === "en" ? "Delete this record?" : "确定删除？",
  };
  const [apiConfig, setApiConfig] = useState(() =>
    loadApiConfig() ?? { textModelApiKey: "", textModelName: "", imageModelApiKey: "", imageModelName: "", visionModelApiKey: "", visionModelName: "", autoSaveIntervalSeconds: DEFAULT_AUTO_SAVE_INTERVAL_SECONDS, useDefaultModel: true }
  );
  const [saved, setSaved] = useState(false);
  const [showTextKey, setShowTextKey] = useState(false);
  const [showImageKey, setShowImageKey] = useState(false);
  const [showVisionKey, setShowVisionKey] = useState(false);
  const [envConfig, setEnvConfig] = useState<EnvConfig | null>(() => cachedEnvConfig);
  const [envLoading, setEnvLoading] = useState(false);
  const [profile, setProfile] = useState<StoredUser>(() => loadCurrentUserProfile() ?? { nickname: "豆阁用户", avatarUrl: "", createdAt: Date.now(), skillLevel: loadUserSkillLevel() });
  const [nicknameEditing, setNicknameEditing] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState(profile.nickname);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropperFile, setCropperFile] = useState<File | null>(null);
  const [history, setHistory] = useState<ProjectRecord[]>([]);
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

  const refreshHistory = useCallback(async () => {
    setHistory(await loadProjectHistoryAsync());
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const batchDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`${text.deleteConfirm} (${ids.length})`)) return;
    void deleteProjectRecords(ids).then(() => {
      void refreshHistory();
      setSelectedIds(new Set());
    });
  }, [refreshHistory, selectedIds, text.deleteConfirm]);

  const batchExport = useCallback(() => {
    const records = history.filter(r => selectedIds.has(r.id));
    if (records.length === 0) return;
    records.forEach((record, i) => {
      const url = record.patternUrl || record.cleanPatternUrl || record.mockupUrl;
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        const prefix = String(i + 1).padStart(2, "0");
        a.download = `${prefix}-${record.title || record.theme || text.defaultWork}.png`;
        a.click();
      }
    });
  }, [history, selectedIds, text.defaultWork]);

  const saveProfile = useCallback((p: StoredUser) => {
    setProfile(p);
    const skillLevel = p.skillLevel ?? DEFAULT_USER_SKILL_LEVEL;
    saveUserSkillLevel(skillLevel);
    updateCurrentUserProfile({ nickname: p.nickname, avatarUrl: p.avatarUrl, skillLevel });
  }, []);

  const skillOptions: Array<{ id: UserSkillLevel; zh: string; en: string; zhDesc: string; enDesc: string }> = [
    { id: "beginner", zh: "新手", en: "Beginner", zhDesc: "轮廓清楚，色块更大，细节适中", enDesc: "Clear silhouettes, larger color blocks, moderate detail" },
    { id: "skilled", zh: "熟练", en: "Skilled", zhDesc: "增加纹样层次和辅助色，难度中等", enDesc: "More pattern layers and accent colors, medium difficulty" },
    { id: "expert", zh: "精通", en: "Expert", zhDesc: "更丰富细节和复杂配色，适合挑战", enDesc: "Richer details and complex color work for a challenge" },
  ];

  const handleSkillLevelChange = useCallback((skillLevel: UserSkillLevel) => {
    saveProfile({ ...profile, skillLevel });
  }, [profile, saveProfile]);

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
      setEnvLoading(false);
      return;
    }

    if (envConfigLoaded) {
      setEnvConfig(cachedEnvConfig);
      setEnvLoading(false);
      setApiConfig(prev => ({
        ...prev,
        textModelName: cachedEnvConfig?.defaultTextModel || prev.textModelName,
        imageModelName: cachedEnvConfig?.defaultImageModel || prev.imageModelName,
        visionModelName: cachedEnvConfig?.defaultVisionModel || prev.visionModelName,
      }));
      return;
    }

    let alive = true;
    setEnvLoading(true);
    loadEnvConfigOnce()
      .then(data => {
        if (!alive) return;
        setEnvConfig(data);
        setApiConfig(prev => ({
          ...prev,
          textModelName: data?.defaultTextModel || prev.textModelName,
          imageModelName: data?.defaultImageModel || prev.imageModelName,
          visionModelName: data?.defaultVisionModel || prev.visionModelName,
        }));
      })
      .finally(() => {
        if (alive) setEnvLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [apiConfig.useDefaultModel]);

  const handleSaveApi = useCallback(() => {
    const normalizedConfig: ApiConfig = {
      ...apiConfig,
      autoSaveIntervalSeconds: normalizeAutoSaveIntervalSeconds(apiConfig.autoSaveIntervalSeconds),
    };
    saveApiConfig(normalizedConfig);
    setApiConfig(normalizedConfig);
    onApiConfigSaved?.(normalizedConfig);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [apiConfig, onApiConfigSaved]);

  const handleDefaultModelToggle = useCallback((checked: boolean) => {
    const nextConfig: ApiConfig = {
      ...apiConfig,
      useDefaultModel: checked,
      autoSaveIntervalSeconds: normalizeAutoSaveIntervalSeconds(apiConfig.autoSaveIntervalSeconds),
    };
    setApiConfig(nextConfig);
    saveApiConfig(nextConfig);
    onApiConfigSaved?.(nextConfig);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [apiConfig, onApiConfigSaved]);

  const handleExport = useCallback((record: ProjectRecord, format: "png" | "preview" | "csv" | "pdf") => {
    const title = record.title || text.defaultDouyunWork;
    switch (format) {
      case "png": if (record.patternUrl) { const a = document.createElement("a"); a.href = record.patternUrl; a.download = `${title}-${text.patternPng}.png`; a.click(); } break;
      case "preview": if (record.mockupUrl) { const a = document.createElement("a"); a.href = record.mockupUrl; a.download = `${title}-${text.previewPng}.png`; a.click(); } break;
      case "csv": alert(text.csvAlert); break;
      case "pdf": alert(text.pdfAlert); break;
    }
  }, [text.csvAlert, text.defaultDouyunWork, text.patternPng, text.pdfAlert, text.previewPng]);

  const handlePublish = useCallback(async (record: ProjectRecord) => {
    try {
      await publishCommunityPost({
        record,
        author: profile.nickname || text.defaultDouyunWork,
        avatar: profile.avatarUrl,
      });
      setPublishMessageType("success");
      setPublishMessage(text.publishSuccess);
    } catch (err) {
      setPublishMessageType("error");
      setPublishMessage(err instanceof Error ? err.message : text.publishFailed);
    }
  }, [profile.avatarUrl, profile.nickname, text.defaultDouyunWork, text.publishFailed, text.publishSuccess]);

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
    const nextUser = { ...user, skillLevel: user.skillLevel ?? loadUserSkillLevel() };
    setProfile(nextUser);
    onLogin?.(nextUser);
    saveUserSkillLevel(nextUser.skillLevel ?? DEFAULT_USER_SKILL_LEVEL);
    void refreshHistory();
    setShowLoginModal(false);
  }, [onLogin, refreshHistory]);

  const confirmLogout = useCallback(() => {
    logoutUser();
    saveApiConfig({ textModelApiKey: "", textModelName: "", imageModelApiKey: "", imageModelName: "", visionModelApiKey: "", visionModelName: "", autoSaveIntervalSeconds: DEFAULT_AUTO_SAVE_INTERVAL_SECONDS, useDefaultModel: true });
    setProfile({ nickname: "豆阁用户", avatarUrl: "", createdAt: Date.now(), skillLevel: loadUserSkillLevel() });
    setApiConfig({ textModelApiKey: "", textModelName: "", imageModelApiKey: "", imageModelName: "", visionModelApiKey: "", visionModelName: "", autoSaveIntervalSeconds: DEFAULT_AUTO_SAVE_INTERVAL_SECONDS, useDefaultModel: true });
    void refreshHistory();
    setSelectedIds(new Set());
    setBatchMode(false);
    setShowLogoutConfirm(false);
    onLogout?.();
  }, [onLogout, refreshHistory]);

  return (
    <main className="min-h-screen bg-[#f3efe7] text-stone-950">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-[#f3efe7]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-950">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            {text.backHome}
          </button>
          <span className="text-lg font-semibold tracking-tight">{text.profileTitle}</span>
          <div className="w-20" />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-stone-200 bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">{text.languageTitle}</h2>
              <p className="mt-1 text-sm text-stone-500">{text.languageDesc}</p>
            </div>
            <div className="inline-flex rounded-lg border border-[#33596a]/25 bg-[#33596a]/8 p-1">
              {(["zh", "en"] as AppLanguage[]).map((item) => {
                const selected = language === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onLanguageChange(item)}
                    className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                      selected ? "bg-[#33596a] text-white shadow-sm" : "text-[#33596a] hover:bg-white"
                    }`}
                  >
                    {languageLabel(item)}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 头像 & 昵称 */}
        <section className="rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="text-xl font-semibold">{text.personalInfo}</h2>
          <p className="mt-1 text-sm text-stone-500">{text.personalInfoDesc}</p>
          <div className="mt-5 flex items-center gap-5">
            <div className="relative shrink-0">
              <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-stone-200 bg-stone-100">
                {profile.avatarUrl ? (
                  profile.avatarUrl.startsWith("data:") ? (
                    <img src={profile.avatarUrl} alt={text.avatarAlt} className="h-full w-full object-cover" />
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
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs font-medium text-[#33596a] hover:underline">{text.change}</button>
                {profile.avatarUrl && (
                  <button type="button" onClick={removeAvatar} className="text-xs font-medium text-stone-400 hover:text-red-600 hover:underline">{text.remove}</button>
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
                  <button type="button" onClick={saveNickname} className="text-sm font-semibold text-[#33596a]">{text.save}</button>
                  <button type="button" onClick={() => { setNicknameDraft(profile.nickname); setNicknameEditing(false); }} className="text-sm text-stone-500">{text.cancel}</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{profile.nickname}</span>
                  <button type="button" onClick={() => { setNicknameDraft(profile.nickname); setNicknameEditing(true); }} className="text-sm text-stone-400 hover:text-[#33596a]">✎ {text.edit}</button>
                </div>
              )}
              <p className="mt-1 text-xs text-stone-400">{text.avatarHint}</p>
            </div>
          </div>

          <div className="mt-6 border-t border-stone-100 pt-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-stone-800">{text.skillLevel}</h3>
                <p className="mt-1 text-xs leading-5 text-stone-500">{text.skillLevelDesc}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {skillOptions.map((option) => {
                  const selected = (profile.skillLevel ?? DEFAULT_USER_SKILL_LEVEL) === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSkillLevelChange(option.id)}
                      className={`rounded-md border px-4 py-3 text-left transition ${
                        selected
                          ? "border-[#33596a] bg-[#33596a] text-white shadow-sm"
                          : "border-stone-200 bg-stone-50 text-stone-700 hover:border-[#33596a]/40 hover:bg-white"
                      }`}
                    >
                      <span className="block text-sm font-semibold">{language === "en" ? option.en : option.zh}</span>
                      <span className={`mt-1 block text-xs leading-5 ${selected ? "text-white/80" : "text-stone-500"}`}>
                        {language === "en" ? option.enDesc : option.zhDesc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* API 配置 */}
        <section className="rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="text-xl font-semibold">{text.apiConfig}</h2>
          <p className="mt-1 text-sm text-stone-500">{text.apiConfigDesc}</p>

          <div className="mt-4 flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-stone-800">{text.useDefaultModel}</div>
              <div className="text-xs text-stone-500">
                {apiConfig.useDefaultModel
                  ? envLoading
                    ? text.loadingEnv
                    : envConfig?.configured
                      ? text.envConfigured
                      : text.envMissing
                  : text.manualKey}
              </div>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={apiConfig.useDefaultModel ?? false}
                onChange={(e) => handleDefaultModelToggle(e.target.checked)}
                className="peer sr-only"
              />
              <div className="h-6 w-11 rounded-full bg-stone-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-stone-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white" />
            </label>
          </div>

          {apiConfig.useDefaultModel && envConfig?.configured ? (
            <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="font-medium">✓ {text.defaultConfigured}</p>
              <ul className="mt-1 space-y-1 text-xs text-emerald-700">
                {(envConfig.imageBaseUrl || envConfig.baseUrl) && <li>{text.imageBaseUrl}: <code className="rounded bg-emerald-100 px-1">{envConfig.imageBaseUrl || envConfig.baseUrl}</code></li>}
                {envConfig.textBaseUrl && <li>{text.textBaseUrl}: <code className="rounded bg-emerald-100 px-1">{envConfig.textBaseUrl}</code></li>}
                {envConfig.defaultTextModel && <li>{text.defaultTextModel}: <code className="rounded bg-emerald-100 px-1">{envConfig.defaultTextModel}</code></li>}
                {envConfig.defaultImageModel && <li>{text.defaultImageModel}: <code className="rounded bg-emerald-100 px-1">{envConfig.defaultImageModel}</code></li>}
                <li>{text.visionModel}: <code className="rounded bg-emerald-100 px-1">{envConfig.defaultVisionModel || text.notConfiguredSeparately}</code></li>
              </ul>
            </div>
          ) : apiConfig.useDefaultModel && !envLoading ? (
            <div className="mt-4 rounded-md border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
              ⚠️ {text.envMissingDetail}
            </div>
          ) : null}

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {/* 文本模型 */}
            <div>
              <label className="text-sm font-medium">{text.textModel}</label>
              <div className="relative mt-1">
                <select
                  value={apiConfig.textModelName}
                  onChange={(e) => setApiConfig(p => ({ ...p, textModelName: e.target.value }))}
                  className={`w-full appearance-none rounded-md border py-2 pl-3 pr-8 text-sm ${apiConfig.useDefaultModel ? 'border-emerald-200 bg-emerald-50/50 text-stone-500' : 'border-stone-300'}`}
                  disabled={apiConfig.useDefaultModel}
                >
                  <option value="" disabled>{text.selectPlaceholder}</option>
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
                      {text.noApiKey}
                      <a href={currentTextOption.purchaseUrl} target="_blank" rel="noopener noreferrer" className="mx-1 font-medium text-[#33596a] underline hover:text-[#446f80]">{text.officialSite}</a>
                    </p>
                  )}
                </>
              )}
            </div>
            {/* 生图模型 */}
            <div>
              <label className="text-sm font-medium">{text.imageModel}</label>
              <div className="relative mt-1">
                <select
                  value={apiConfig.imageModelName}
                  onChange={(e) => setApiConfig(p => ({ ...p, imageModelName: e.target.value }))}
                  className={`w-full appearance-none rounded-md border py-2 pl-3 pr-8 text-sm ${apiConfig.useDefaultModel ? 'border-emerald-200 bg-emerald-50/50 text-stone-500' : 'border-stone-300'}`}
                  disabled={apiConfig.useDefaultModel}
                >
                  <option value="" disabled>{text.selectPlaceholder}</option>
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
                      {text.noApiKey}
                      <a href={currentImageOption.purchaseUrl} target="_blank" rel="noopener noreferrer" className="mx-1 font-medium text-[#33596a] underline hover:text-[#446f80]">{text.officialSite}</a>
                    </p>
                  )}
                </>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">{text.visionModelLabel}</label>
              <div className="relative mt-1">
                <select
                  value={apiConfig.visionModelName ?? ""}
                  onChange={(e) => setApiConfig(p => ({ ...p, visionModelName: e.target.value }))}
                  className={`w-full appearance-none rounded-md border py-2 pl-3 pr-8 text-sm ${apiConfig.useDefaultModel ? 'border-emerald-200 bg-emerald-50/50 text-stone-500' : 'border-stone-300'}`}
                  disabled={apiConfig.useDefaultModel}
                >
                  <option value="" disabled>{text.selectPlaceholder}</option>
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
                      {text.noApiKey}
                      <a href={currentVisionOption.purchaseUrl} target="_blank" rel="noopener noreferrer" className="mx-1 font-medium text-[#33596a] underline hover:text-[#446f80]">{text.officialSite}</a>
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="mt-6 rounded-md border border-stone-200 bg-stone-50 p-4">
            <label className="text-sm font-medium text-stone-800">
              {text.autoSaveInterval}
              <div className="mt-2 flex max-w-xs items-center gap-3">
                <input
                  type="number"
                  min={5}
                  max={600}
                  step={5}
                  value={apiConfig.autoSaveIntervalSeconds ?? DEFAULT_AUTO_SAVE_INTERVAL_SECONDS}
                  onChange={(e) => setApiConfig(p => ({ ...p, autoSaveIntervalSeconds: Number(e.target.value) }))}
                  className="w-28 rounded-md border border-stone-300 px-3 py-2 text-sm"
                />
                <span className="text-sm text-stone-500">{text.seconds}</span>
              </div>
              <p className="mt-2 text-xs leading-6 text-stone-500">{text.autoSaveHint}</p>
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={handleSaveApi} className="rounded-md bg-[#33596a] px-4 py-2 text-sm font-semibold text-white">{text.saveConfig}</button>
            {saved && <span className="text-sm text-emerald-600">✓ {text.savedLocal}</span>}
          </div>
        </section>

        {/* 历史作品 */}
        <section className="rounded-lg border border-stone-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{text.history}</h2>
              <p className="mt-1 text-sm text-stone-500">{text.historyDesc}</p>
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
                {batchMode ? text.exitMultiSelect : text.multiSelect}
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
            <div className="mt-6 grid place-items-center rounded-lg border border-dashed border-stone-300 py-16 text-sm text-stone-400">{text.noRecords}</div>
          ) : (
            <>
              {batchMode && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-stone-50 px-4 py-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-stone-700">
                    <input type="checkbox" checked={selectedIds.size === history.length} onChange={toggleSelectAll} className="h-4 w-4 rounded border-stone-300" />
                    {text.selectAll}
                  </label>
                  <span className="text-xs text-stone-400">{text.selectedCount} {selectedIds.size} / {history.length}</span>
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={batchExport} disabled={selectedIds.size === 0} className="rounded-md bg-[#33596a] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">📦 {text.batchExport}</button>
                    <button type="button" onClick={batchDelete} disabled={selectedIds.size === 0} className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 disabled:opacity-50">🗑️ {text.batchDelete}</button>
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
                    onDelete={() => { void deleteProjectRecord(record.id).then(refreshHistory); }}
                    text={text}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* 账号设置 */}
        <section className="rounded-lg border border-red-100 bg-white p-6">
          <h2 className="text-xl font-semibold text-stone-800">{text.account}</h2>
          {isLoggedIn ? (
            <>
              <p className="mt-1 text-sm text-stone-500">{text.logoutDesc}</p>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                className="mt-4 rounded-md border border-red-300 bg-red-50 px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                {text.logout}
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-stone-500">{text.loginDesc}</p>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(true)}
                  className="rounded-md bg-[#33596a] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#446f80]"
                >
                  {text.loginRegister}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-stone-950">{text.logoutTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              {text.logoutConfirmDesc}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={confirmLogout}
                className="rounded-md bg-[#33596a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#446f80]"
              >
                {text.confirmLogout}
              </button>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="rounded-md border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                {text.keepLoggedIn}
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

function ProjectCard({ record, selected, onToggleSelect, onRestore, onExport, onPublish, onDelete, text }: {
  record: ProjectRecord;
  selected?: boolean;
  onToggleSelect?: () => void;
  onRestore: () => void;
  onExport: (f: "png" | "preview" | "csv" | "pdf") => void;
  onPublish: () => void;
  onDelete: () => void;
  text: Record<string, string>;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const previewUrl = record.mockupUrl || record.patternUrl || record.cleanPatternUrl || record.extractedImageUrl || record.sourceImageUrl;
  return (
    <div className={`group relative rounded-lg border p-3 transition ${
      selected ? "border-[#33596a] ring-2 ring-[#33596a]/30 bg-[#33596a]/5" : "border-stone-200 bg-stone-50 hover:border-stone-400"
    }`}>
      {onToggleSelect && (
        <div
          className="absolute left-2 top-2 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 bg-white"
          style={{ borderColor: selected ? '#33596a' : '#d6d3d1' }}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        >
          {selected && <svg className="h-3 w-3 text-[#33596a]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
        </div>
      )}
      <div className="aspect-video overflow-hidden rounded-md border border-stone-200 bg-white" onClick={onToggleSelect || onRestore}>
        {previewUrl ? (
          <img src={previewUrl} alt={record.title} className="h-full w-full object-contain" />
        ) : (
          <ProjectFallbackPreview colors={record.forcedColors} theme={record.theme} element={record.element} />
        )}
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
                <MenuItem onClick={() => { onExport("png"); setShowMenu(false); }}>📄 {text.patternPng}</MenuItem>
                <MenuItem onClick={() => { onExport("preview"); setShowMenu(false); }}>🖼️ {text.previewPng}</MenuItem>
                <MenuItem onClick={() => { onExport("csv"); setShowMenu(false); }}>📊 CSV</MenuItem>
                <MenuItem onClick={() => { onExport("pdf"); setShowMenu(false); }}>📝 PDF</MenuItem>
                <hr className="my-1 border-stone-200" />
                <MenuItem onClick={() => { onRestore(); setShowMenu(false); }}>📂 {text.restoreProgress}</MenuItem>
                <MenuItem onClick={() => { onPublish(); setShowMenu(false); }}>🌐 {text.publishCommunity}</MenuItem>
                <MenuItem onClick={() => { if (confirm(text.deleteOneConfirm)) { onDelete(); setShowMenu(false); } }} className="text-red-600">🗑️ {text.deleteRecord}</MenuItem>
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
