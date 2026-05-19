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

type ModalStep = "login" | "register";

type Props = {
  onClose: () => void;
  onLoggedIn: (user: StoredUser) => void;
};

export default function LoginModal({ onClose, onLoggedIn }: Props) {
  const [step, setStep] = useState<ModalStep>("login");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState(generateRandomNickname());
  const [avatarEmoji, setAvatarEmoji] = useState(SYSTEM_AVATARS[Math.floor(Math.random() * SYSTEM_AVATARS.length)]);
  const [uploadedAvatar, setUploadedAvatar] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  const avatarUrl = uploadedAvatar || `emoji:${avatarEmoji}`;

  const handleLogin = useCallback(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setError("请输入用户名");
      return;
    }
    setLoading(true);
    setError("");

    const user = loginUser(trimmed);
    if (user) {
      onLoggedIn(user);
      onClose();
    } else {
      // 用户不存在，进入注册步骤
      setStep("register");
      setLoading(false);
    }
  }, [username, onLoggedIn, onClose]);

  const handleRegister = useCallback(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setError("请输入用户名");
      return;
    }
    if (!nickname.trim()) {
      setError("请输入昵称");
      return;
    }
    setLoading(true);
    setError("");

    registerUser(trimmed, { nickname: nickname.trim(), avatarUrl });
    const user = loadCurrentUserProfile();
    if (user) {
      onLoggedIn(user);
      onClose();
    } else {
      setError("注册失败，请重试");
      setLoading(false);
    }
  }, [username, nickname, avatarUrl, onLoggedIn, onClose]);

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
    setNickname(generateRandomNickname());
  }, []);

  const handleAvatarUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUploadedAvatar(String(reader.result));
    reader.readAsDataURL(file);
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
            className={`h-2 w-2 rounded-full ${step === "login" ? "bg-[#8f1d21]" : "bg-stone-300"}`}
          />
          <div className="h-px flex-1 bg-stone-200" />
          <div
            className={`h-2 w-2 rounded-full ${step === "register" ? "bg-[#8f1d21]" : "bg-stone-300"}`}
          />
        </div>

        {/* 登录步骤 */}
        {step === "login" && (
          <>
            <h2 className="text-xl font-semibold">登录</h2>
            <p className="mt-1 text-sm text-stone-500">输入用户名登录，新用户将自动进入注册流程。</p>

            <div className="mt-5">
              <label className="text-sm font-medium">用户名</label>
              <input
                ref={usernameInputRef}
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                placeholder="输入用户名"
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2.5 text-sm focus:border-[#8f1d21] focus:outline-none focus:ring-1 focus:ring-[#8f1d21]"
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
                取消
              </button>
              <button
                type="button"
                onClick={handleLogin}
                disabled={loading}
                className="flex-1 rounded-md bg-[#8f1d21] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? "验证中..." : "下一步"}
              </button>
            </div>
          </>
        )}

        {/* 注册步骤 */}
        {step === "register" && (
          <>
            <h2 className="text-xl font-semibold">注册新用户</h2>
            <p className="mt-1 text-sm text-stone-500">用户名 <strong>{username}</strong> 尚未注册，请完善以下信息。</p>

            {/* 头像选择 */}
            <div className="mt-5">
              <label className="text-sm font-medium">头像</label>
              <div className="mt-2 flex items-center gap-4">
                {/* 当前头像预览 */}
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-stone-200 bg-stone-100 text-3xl">
                  {uploadedAvatar ? (
                    <img src={uploadedAvatar} alt="头像" className="h-full w-full object-cover" />
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
                    上传照片
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
                    换一个
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
                        ? "ring-2 ring-[#8f1d21] ring-offset-2"
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
              <label className="text-sm font-medium">昵称</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => { setNickname(e.target.value); setError(""); }}
                  placeholder="输入昵称"
                  className="flex-1 rounded-md border border-stone-300 px-3 py-2.5 text-sm focus:border-[#8f1d21] focus:outline-none focus:ring-1 focus:ring-[#8f1d21]"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={randomizeNickname}
                  className="shrink-0 rounded-md border border-stone-300 px-3 py-2.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
                  title="随机生成昵称"
                >
                  🎲 随机
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
                返回
              </button>
              <button
                type="button"
                onClick={handleRegister}
                disabled={loading}
                className="flex-1 rounded-md bg-[#8f1d21] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? "注册中..." : "完成注册"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
