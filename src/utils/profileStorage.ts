import type { ApiConfig, ProjectRecord } from "@/types/projectTypes";

const API_CONFIG_KEY = "douyun_api_config";
const PROJECT_HISTORY_KEY = "douyun_project_history";
const USERS_KEY = "douyun_users";
const CURRENT_USER_KEY = "douyun_current_user";
export const DEFAULT_AUTO_SAVE_INTERVAL_SECONDS = 30;

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

export function normalizeAutoSaveIntervalSeconds(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_AUTO_SAVE_INTERVAL_SECONDS;
  return Math.max(5, Math.min(600, Math.round(parsed)));
}

export function loadApiConfig(): ApiConfig | null {
  if (!isAvailable()) return null;
  try {
    const raw = localStorage.getItem(API_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ApiConfig;
    return {
      ...parsed,
      autoSaveIntervalSeconds: normalizeAutoSaveIntervalSeconds(parsed.autoSaveIntervalSeconds),
    };
  } catch {
    return null;
  }
}

export function saveApiConfig(config: ApiConfig): void {
  if (!isAvailable()) return;
  try {
    localStorage.setItem(API_CONFIG_KEY, JSON.stringify({
      ...config,
      autoSaveIntervalSeconds: normalizeAutoSaveIntervalSeconds(config.autoSaveIntervalSeconds),
    }));
  } catch (e) {
    console.error("保存 API 配置失败:", e);
  }
}

/* ──────── 项目历史 ──────── */

const ANONYMOUS_PROJECT_KEY = `${PROJECT_HISTORY_KEY}:__anonymous__`;
const MAX_INLINE_IMAGE_BYTES = 900_000;
const MAX_PATTERN_DATA_BYTES = 1_200_000;

function getProjectHistoryKey(): string {
  const username = loadCurrentUser();
  return username ? `${PROJECT_HISTORY_KEY}:${username}` : ANONYMOUS_PROJECT_KEY;
}

function keepSmallDataUrl(value: string | null | undefined, maxBytes = MAX_INLINE_IMAGE_BYTES): string | null {
  if (!value) return null;
  return value.length <= maxBytes ? value : null;
}

function compactProjectRecord(record: ProjectRecord): ProjectRecord {
  const compactPatternUrl = keepSmallDataUrl(record.patternUrl)
    ?? keepSmallDataUrl(record.cleanPatternUrl)
    ?? keepSmallDataUrl(record.mockupUrl)
    ?? keepSmallDataUrl(record.extractedImageUrl)
    ?? keepSmallDataUrl(record.sourceImageUrl);

  return {
    ...record,
    sourceImageUrl: keepSmallDataUrl(record.sourceImageUrl),
    extractedImageUrl: keepSmallDataUrl(record.extractedImageUrl),
    patternData: record.patternData && record.patternData.length <= MAX_PATTERN_DATA_BYTES ? record.patternData : null,
    patternUrl: compactPatternUrl,
    cleanPatternUrl: keepSmallDataUrl(record.cleanPatternUrl),
    mockupUrl: keepSmallDataUrl(record.mockupUrl),
    productSceneUrl: keepSmallDataUrl(record.productSceneUrl),
  };
}

export function loadProjectHistory(): ProjectRecord[] {
  if (!isAvailable()) return [];
  const key = getProjectHistoryKey();
  if (!key) return [];
  try {
    let raw = localStorage.getItem(key);
    const legacyRaw = localStorage.getItem(PROJECT_HISTORY_KEY);
    if (legacyRaw) {
      const currentList = raw ? JSON.parse(raw) as ProjectRecord[] : [];
      const legacyList = JSON.parse(legacyRaw) as ProjectRecord[];
      if (currentList.length === 0 && legacyList.length > 0) {
        raw = legacyRaw;
        localStorage.setItem(key, legacyRaw);
      }
    }
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProjectRecord(record: ProjectRecord): boolean {
  if (!isAvailable()) return false;
  const key = getProjectHistoryKey();
  if (!key) return false;
  try {
    const list = loadProjectHistory();
    const idx = list.findIndex((p) => p.id === record.id);
    if (idx >= 0) {
      list[idx] = { ...record, updatedAt: Date.now() };
    } else {
      list.unshift(record);
    }
    const nextList = list.slice(0, 100);
    try {
      localStorage.setItem(key, JSON.stringify(nextList));
      return true;
    } catch {
      const compactedList = nextList.map(compactProjectRecord);
      for (let count = compactedList.length; count >= 1; count -= 1) {
        try {
          const trimmedList = compactedList.slice(0, count);
          localStorage.setItem(key, JSON.stringify(trimmedList));
          return trimmedList.some((item) => item.id === record.id);
        } catch {
          // keep shrinking until the list fits into storage
        }
      }
      throw new Error("project_history_quota_exceeded");
    }
  } catch (e) {
    console.error("保存项目记录失败:", e);
    return false;
  }
}

export function deleteProjectRecord(id: string): void {
  if (!isAvailable()) return;
  const key = getProjectHistoryKey();
  if (!key) return;
  try {
    const list = loadProjectHistory().filter((p) => p.id !== id);
    localStorage.setItem(key, JSON.stringify(list));
  } catch { /* ignore */ }
}

/** 批量删除项目记录 */
export function deleteProjectRecords(ids: string[]): void {
  if (!isAvailable() || ids.length === 0) return;
  const key = getProjectHistoryKey();
  if (!key) return;
  try {
    const idSet = new Set(ids);
    const list = loadProjectHistory().filter((p) => !idSet.has(p.id));
    localStorage.setItem(key, JSON.stringify(list));
  } catch { /* ignore */ }
}
