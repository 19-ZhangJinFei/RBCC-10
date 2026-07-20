"use client";

import { useCallback, useRef, useState } from "react";
import {
  loginUser,
  registerUser,
  loadCurrentUserProfile,
  generateRandomNickname,
  SYSTEM_AVATARS,
  type StoredUser,
} from "@/utils/profileStorage";
import AvatarCropper from "@/components/AvatarCropper";
import type { AppLanguage } from "@/utils/language";

type ModalStep = "login" | "register";

type Props = {
  onClose: () => void;
  onLoggedIn: (user: StoredUser) => void;
  initialStep?: ModalStep;
  language?: AppLanguage;
  onRegisterSuccess?: (username: string) => void;
};

export default function LoginModal({ onClose, onLoggedIn, initialStep, language = "zh", onRegisterSuccess }: Props) {
  const [step, setStep] = useState<ModalStep>(initialStep ?? "login");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState(generateRandomNickname());
  const [avatarEmoji, setAvatarEmoji] = useState(SYSTEM_AVATARS[Math.floor(Math.random() * SYSTEM_AVATARS.length)]);
  const [uploadedAvatar, setUploadedAvatar] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const [cropperFile, setCropperFile] = useState<File | null>(null);

  const avatarUrl = uploadedAvatar || `emoji:${avatarEmoji}`;
  const L = useCallback((zh: string, en: string) => (language === "en" ? en : zh), [language]);

  const handleLogin = useCallback(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setError(L("请输入用户名", "Please enter a username"));
      return;
    }
    setLoading(true);
    setError("");

    const user = loginUser(trimmed);
    if (user) {
      onLoggedIn(user);
      onClose();
    } else {
      // 用户不存在，进入注册步骤，昵称预填用户名
      setNickname(trimmed);
      setStep("register");
      setLoading(false);
    }
  }, [username, L, onLoggedIn, onClose]);

  const handleRegister = useCallback(() => {
    const effectiveUsername = username.trim();
    if (!effectiveUsername) {
      setError(L("请输入用户名", "Please enter a username"));
      return;
    }
    if (!nickname.trim()) {
      setError(L("请输入昵称", "Please enter a nickname"));
      return;
    }
    setLoading(true);
    setError("");

    registerUser(effectiveUsername, { nickname: nickname.trim(), avatarUrl });
    const user = loadCurrentUserProfile();
    if (user) {
      onRegisterSuccess?.(effectiveUsername);
      onLoggedIn(user);
      onClose();
    } else {
      setError(L("注册失败，请重试", "Registration failed. Please try again."));
      setLoading(false);
    }
  }, [username, nickname, avatarUrl, L, onLoggedIn, onClose, onRegisterSuccess]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (step === "login") handleLogin();
        else handleRegister();
      }
      if (e.key === "Escape") onClose();
    },
    [step, handleLogin, handleRegister, onClose],
  );

  const randomizeNickname = useCallback(() => {
    const name = generateRandomNickname();
    setNickname(name);
    if (!username.trim()) {
      setUsername(name);
    }
  }, [username]);

  const handleAvatarUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropperFile(file);
    e.target.value = "";
  }, []);

  const handleCropperSave = useCallback((dataUrl: string) => {
    setUploadedAvatar(dataUrl);
    setCropperFile(null);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 步骤指示 */}
        <div className="mb-5 flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${step === "login" ? "bg-[#33596a]" : "bg-stone-300"}`}
          />
          <div className="h-px flex-1 bg-stone-200" />
          <div
            className={`h-2 w-2 rounded-full ${step === "register" ? "bg-[#33596a]" : "bg-stone-300"}`}
          />
        </div>

        {/* 登录步骤 */}
        {step === "login" && (
          <>
            <h2 className="text-xl font-semibold">{L("登录", "Log in")}</h2>
            <p className="mt-1 text-sm text-stone-500">{L("输入用户名登录，新用户将自动进入注册流程。", "Enter a username to log in. New users will continue to registration automatically.")}</p>

            <div className="mt-5">
              <label className="text-sm font-medium">{L("用户名", "Username")}</label>
              <input
                ref={usernameInputRef}
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                placeholder={L("输入用户名", "Enter username")}
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2.5 text-sm focus:border-[#33596a] focus:outline-none focus:ring-1 focus:ring-[#33596a]"
                autoFocus
              />
            </div>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-stone-300 py-2.5 text-sm font-medium text-stone-700"
              >
                {L("取消", "Cancel")}
              </button>
              <button
                type="button"
                onClick={handleLogin}
                disabled={loading}
                className="flex-1 rounded-md bg-[#33596a] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? L("验证中...", "Checking...") : L("下一步", "Next")}
              </button>
            </div>

            <p className="mt-4 text-center text-sm text-stone-500">
              {L("还没有账号？", "No account yet?")}
              <button type="button" onClick={() => { const randomName = generateRandomNickname(); setUsername(username.trim() || randomName); setNickname(username.trim() || randomName); setStep("register"); setError(""); }} className="ml-1 font-medium text-[#33596a] hover:underline">
                {L("立即注册", "Register now")}
              </button>
            </p>
          </>
        )}

        {/* 注册步骤 */}
        {step === "register" && (
          <>
            <h2 className="text-xl font-semibold">{L("注册新用户", "Register New User")}</h2>
            <p className="mt-1 text-sm text-stone-500">{L("请设置用户名并完善以下信息。", "Choose a username and complete the details below.")}</p>

            {/* 用户名 */}
            <div className="mt-5">
              <label className="text-sm font-medium">{L("用户名", "Username")}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                placeholder={L("输入用户名", "Enter username")}
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2.5 text-sm focus:border-[#33596a] focus:outline-none focus:ring-1 focus:ring-[#33596a]"
                autoFocus
              />
            </div>

            {/* 头像选择 */}
            <div className="mt-4">
              <label className="text-sm font-medium">{L("头像", "Avatar")}</label>
              <div className="mt-2 flex items-center gap-4">
                {/* 当前头像预览 */}
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-stone-200 bg-stone-100 text-3xl">
                  {uploadedAvatar ? (
                    <img src={uploadedAvatar} alt={L("头像", "Avatar")} className="h-full w-full object-cover" />
                  ) : (
                    <span>{avatarEmoji}</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
                  >
                    {L("上传照片", "Upload Photo")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedAvatar(null);
                      const others = SYSTEM_AVATARS.filter((a) => a !== avatarEmoji);
                      setAvatarEmoji(others[Math.floor(Math.random() * others.length)]);
                    }}
                    className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
                  >
                    {L("换一个", "Another")}
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>

              {/* 系统头像列表 */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SYSTEM_AVATARS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => { setAvatarEmoji(emoji); setUploadedAvatar(null); }}
                    className={`grid h-8 w-8 place-items-center rounded-full text-lg transition ${
                      !uploadedAvatar && avatarEmoji === emoji
                        ? "ring-2 ring-[#33596a] ring-offset-2"
                        : "hover:bg-stone-100"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* 昵称 */}
            <div className="mt-4">
              <label className="text-sm font-medium">{L("昵称", "Nickname")}</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => { setNickname(e.target.value); setError(""); }}
                  placeholder={L("输入昵称", "Enter nickname")}
                  className="flex-1 rounded-md border border-stone-300 px-3 py-2.5 text-sm focus:border-[#33596a] focus:outline-none focus:ring-1 focus:ring-[#33596a]"
                />
                <button
                  type="button"
                  onClick={randomizeNickname}
                  className="shrink-0 rounded-md border border-stone-300 px-3 py-2.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
                  title={L("随机生成昵称", "Generate random nickname")}
                >
                  🎲 {L("随机", "Random")}
                </button>
              </div>
            </div>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => { setStep("login"); setError(""); }}
                className="flex-1 rounded-md border border-stone-300 py-2.5 text-sm font-medium text-stone-700"
              >
                {L("返回", "Back")}
              </button>
              <button
                type="button"
                onClick={handleRegister}
                disabled={loading}
                className="flex-1 rounded-md bg-[#33596a] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? L("注册中...", "Registering...") : L("完成注册", "Finish")}
              </button>
            </div>
          </>
        )}
      </div>

      {/* 头像裁剪弹窗 */}
      {cropperFile && (
        <AvatarCropper
          file={cropperFile}
          onSave={handleCropperSave}
          onCancel={() => setCropperFile(null)}
        />
      )}
    </div>
  );
}
