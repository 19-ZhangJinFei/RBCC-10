import type { ApiConfig, ProjectRecord } from "@/types/projectTypes";

const API_CONFIG_KEY = "douyun_api_config";
const PROJECT_HISTORY_KEY = "douyun_project_history";
const USERS_KEY = "douyun_users";
const CURRENT_USER_KEY = "douyun_current_user";

function isAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof localStorage?.getItem !== "function") return false;
  try {
    localStorage.getItem("__test__");
    return true;
  } catch {
    return false;
  }
}

/* ──────── 用户系统（多用户）──────── */

export interface StoredUser {
  nickname: string;
  avatarUrl: string;
  createdAt: number;
}

function loadUsers(): Record<string, StoredUser> {
  if (!isAvailable()) return {};
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUsers(users: Record<string, StoredUser>): void {
  if (!isAvailable()) return;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/** 检查用户名是否已存在 */
export function userExists(username: string): boolean {
  return username.trim().toLowerCase() in loadUsers();
}

/** 获取指定用户的资料 */
export function getUserProfile(username: string): StoredUser | null {
  const users = loadUsers();
  return users[username.trim().toLowerCase()] ?? null;
}

/** 注册新用户，自动登录 */
export function registerUser(username: string, profile: { nickname: string; avatarUrl: string }): StoredUser {
  const key = username.trim().toLowerCase();
  const users = loadUsers();
  const user: StoredUser = { ...profile, createdAt: Date.now() };
  users[key] = user;
  saveUsers(users);
  setCurrentUser(key);
  return user;
}

/** 用户登录，返回用户信息；用户不存在返回 null */
export function loginUser(username: string): StoredUser | null {
  const key = username.trim().toLowerCase();
  const users = loadUsers();
  const user = users[key];
  if (user) {
    setCurrentUser(key);
    return user;
  }
  return null;
}

/** 获取当前登录的用户名 */
export function loadCurrentUser(): string | null {
  if (!isAvailable()) return null;
  try {
    return localStorage.getItem(CURRENT_USER_KEY);
  } catch {
    return null;
  }
}

function setCurrentUser(username: string): void {
  if (!isAvailable()) return;
  localStorage.setItem(CURRENT_USER_KEY, username);
}

/** 登出 */
export function logoutUser(): void {
  if (!isAvailable()) return;
  localStorage.removeItem(CURRENT_USER_KEY);
}

/** 获取当前登录用户的完整资料 */
export function loadCurrentUserProfile(): StoredUser | null {
  const username = loadCurrentUser();
  if (!username) return null;
  return getUserProfile(username);
}

/** 更新当前登录用户的昵称和头像 */
export function updateCurrentUserProfile(profile: { nickname: string; avatarUrl: string }): void {
  const username = loadCurrentUser();
  if (!username) return;
  const users = loadUsers();
  if (!users[username]) return;
  users[username] = { ...users[username], ...profile, createdAt: users[username].createdAt };
  saveUsers(users);
}

/* ──────── 随机昵称 ──────── */

const ADJECTIVES = [
  "快乐", "活泼", "可爱", "安静", "温柔", "热情", "勇敢", "聪明",
  "调皮", "乖巧", "酷酷", "甜甜", "萌萌", "暖暖", "闪闪", "阳光",
  "清新", "飘逸", "自由", "灵动", "恬淡", "悠然", "自然", "灿烂",
];

const NOUNS = [
  "小豆子", "拼豆师", "手作人", "艺术家", "设计师",
  "小精灵", "梦想家", "向日葵", "小星星", "彩虹糖",
  "棉花糖", "小太阳", "小确幸", "幸运草", "千纸鹤",
  "小蜜蜂", "小画家", "小工匠", "小达人", "乐享家",
];

export function generateRandomNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}${noun}`;
}

/* ──────── 预设系统头像 ──────── */

export const SYSTEM_AVATARS = [
  "🎨", "🌸", "🌟", "🦋", "🍀", "🌈", "🎭", "🌺",
  "🐼", "🦊", "🐱", "🦄", "🌻", "🍄", "🎪", "🎯",
];

export function getSystemAvatarEmoji(index: number): string {
  return SYSTEM_AVATARS[index % SYSTEM_AVATARS.length];
}

/* ──────── API 配置 ──────── */

export function loadApiConfig(): ApiConfig | null {
  if (!isAvailable()) return null;
  try {
    const raw = localStorage.getItem(API_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveApiConfig(config: ApiConfig): void {
  if (!isAvailable()) return;
  try {
    localStorage.setItem(API_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error("保存 API 配置失败:", e);
  }
}

/* ──────── 项目历史 ──────── */

export function loadProjectHistory(): ProjectRecord[] {
  if (!isAvailable()) return [];
  try {
    const raw = localStorage.getItem(PROJECT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProjectRecord(record: ProjectRecord): void {
  if (!isAvailable()) return;
  try {
    const list = loadProjectHistory();
    const idx = list.findIndex((p) => p.id === record.id);
    if (idx >= 0) {
      list[idx] = { ...record, updatedAt: Date.now() };
    } else {
      list.unshift(record);
    }
    localStorage.setItem(PROJECT_HISTORY_KEY, JSON.stringify(list.slice(0, 100)));
  } catch (e) {
    console.error("保存项目记录失败:", e);
  }
}

export function deleteProjectRecord(id: string): void {
  if (!isAvailable()) return;
  try {
    const list = loadProjectHistory().filter((p) => p.id !== id);
    localStorage.setItem(PROJECT_HISTORY_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}
