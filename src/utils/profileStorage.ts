import type { ApiConfig, ProjectRecord } from "@/types/projectTypes";

const API_CONFIG_KEY = "douyun_api_config";
const USER_SKILL_LEVEL_KEY = "douyun_user_skill_level";
const PROJECT_HISTORY_KEY = "douyun_project_history";
const ACTIVE_PROJECT_KEY = "douyun_active_project";
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
  skillLevel?: UserSkillLevel;
}

export type UserSkillLevel = "beginner" | "skilled" | "expert";
export const DEFAULT_USER_SKILL_LEVEL: UserSkillLevel = "beginner";

function normalizeUserSkillLevel(value: unknown): UserSkillLevel {
  return value === "skilled" || value === "expert" || value === "beginner"
    ? value
    : DEFAULT_USER_SKILL_LEVEL;
}

export function loadUserSkillLevel(): UserSkillLevel {
  if (!isAvailable()) return DEFAULT_USER_SKILL_LEVEL;
  try {
    return normalizeUserSkillLevel(localStorage.getItem(USER_SKILL_LEVEL_KEY));
  } catch {
    return DEFAULT_USER_SKILL_LEVEL;
  }
}

export function saveUserSkillLevel(skillLevel: UserSkillLevel): void {
  if (!isAvailable()) return;
  try {
    localStorage.setItem(USER_SKILL_LEVEL_KEY, skillLevel);
  } catch {
    // ignore small preference write failures
  }
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
  const profile = getUserProfile(username);
  return profile ? { ...profile, skillLevel: normalizeUserSkillLevel(profile.skillLevel) } : null;
}

/** 更新当前登录用户资料 */
export function updateCurrentUserProfile(profile: Partial<Pick<StoredUser, "nickname" | "avatarUrl" | "skillLevel">>): void {
  const username = loadCurrentUser();
  if (!username) return;
  const users = loadUsers();
  if (!users[username]) return;
  users[username] = { ...users[username], ...profile, createdAt: users[username].createdAt };
  saveUsers(users);
  if (profile.skillLevel) saveUserSkillLevel(profile.skillLevel);
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
const PROJECT_DB_NAME = "douyun_project_history_db";
const PROJECT_DB_VERSION = 1;
const PROJECT_STORE_NAME = "projects";
const PROJECT_OWNER_INDEX = "by_owner";
const MAX_PROJECT_HISTORY = 100;

interface StoredProjectEntry {
  storageId: string;
  ownerKey: string;
  record: ProjectRecord;
  updatedAt: number;
}

function getProjectHistoryKey(): string {
  const username = loadCurrentUser();
  return username ? `${PROJECT_HISTORY_KEY}:${username}` : ANONYMOUS_PROJECT_KEY;
}

function getActiveProjectKey(): string {
  return `${ACTIVE_PROJECT_KEY}:${getProjectHistoryKey()}`;
}

export function loadActiveProjectId(): string | null {
  if (!isAvailable()) return null;
  try {
    return localStorage.getItem(getActiveProjectKey());
  } catch {
    return null;
  }
}

export function saveActiveProjectId(id: string): void {
  if (!isAvailable()) return;
  try {
    localStorage.setItem(getActiveProjectKey(), id);
  } catch {
    // ignore small pointer write failures
  }
}

export function clearActiveProjectId(id?: string): void {
  if (!isAvailable()) return;
  try {
    const key = getActiveProjectKey();
    if (!id || localStorage.getItem(key) === id) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore small pointer write failures
  }
}

function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openProjectDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) return Promise.reject(new Error("indexeddb_unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(PROJECT_STORE_NAME)
        ? request.transaction!.objectStore(PROJECT_STORE_NAME)
        : db.createObjectStore(PROJECT_STORE_NAME, { keyPath: "storageId" });
      if (!store.indexNames.contains(PROJECT_OWNER_INDEX)) {
        store.createIndex(PROJECT_OWNER_INDEX, "ownerKey", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("indexeddb_open_blocked"));
  });
}

async function getProjectEntries(db: IDBDatabase, ownerKey: string): Promise<StoredProjectEntry[]> {
  const transaction = db.transaction(PROJECT_STORE_NAME, "readonly");
  const index = transaction.objectStore(PROJECT_STORE_NAME).index(PROJECT_OWNER_INDEX);
  const entries = await requestToPromise(index.getAll(ownerKey) as IDBRequest<StoredProjectEntry[]>);
  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function migrateLegacyProjectHistory(db: IDBDatabase, ownerKey: string): Promise<void> {
  if (!isAvailable()) return;
  const raw = localStorage.getItem(ownerKey) ?? localStorage.getItem(PROJECT_HISTORY_KEY);
  if (!raw) return;

  const existingEntries = await getProjectEntries(db, ownerKey);
  if (existingEntries.length > 0) return;

  const records = JSON.parse(raw) as ProjectRecord[];
  if (!Array.isArray(records) || records.length === 0) return;

  const transaction = db.transaction(PROJECT_STORE_NAME, "readwrite");
  const store = transaction.objectStore(PROJECT_STORE_NAME);
  records.slice(0, MAX_PROJECT_HISTORY).forEach((record) => {
    const updatedAt = record.updatedAt || Date.now();
    const entry: StoredProjectEntry = {
      storageId: `${ownerKey}:${record.id}`,
      ownerKey,
      record: { ...record, updatedAt },
      updatedAt,
    };
    store.put(entry);
  });
  await transactionDone(transaction);
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

export async function loadProjectHistoryAsync(): Promise<ProjectRecord[]> {
  const key = getProjectHistoryKey();
  if (!key) return [];
  let db: IDBDatabase | null = null;
  try {
    db = await openProjectDb();
    await migrateLegacyProjectHistory(db, key);
    const entries = await getProjectEntries(db, key);
    return entries.map((entry) => entry.record);
  } catch (e) {
    console.error("加载项目记录失败:", e);
    return loadProjectHistory();
  } finally {
    db?.close();
  }
}

export async function saveProjectRecord(record: ProjectRecord): Promise<boolean> {
  const key = getProjectHistoryKey();
  if (!key) return false;
  let db: IDBDatabase | null = null;
  try {
    db = await openProjectDb();
    await migrateLegacyProjectHistory(db, key);
    const updatedAt = Date.now();
    const nextRecord = { ...record, updatedAt };

    const transaction = db.transaction(PROJECT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PROJECT_STORE_NAME);
    store.put({
      storageId: `${key}:${record.id}`,
      ownerKey: key,
      record: nextRecord,
      updatedAt,
    } satisfies StoredProjectEntry);
    await transactionDone(transaction);

    const entries = await getProjectEntries(db, key);
    if (entries.length > MAX_PROJECT_HISTORY) {
      const trimTransaction = db.transaction(PROJECT_STORE_NAME, "readwrite");
      const trimStore = trimTransaction.objectStore(PROJECT_STORE_NAME);
      entries.slice(MAX_PROJECT_HISTORY).forEach((entry) => trimStore.delete(entry.storageId));
      await transactionDone(trimTransaction);
    }
    saveActiveProjectId(record.id);
    return true;
  } catch (e) {
    console.error("保存项目记录失败:", e);
    return false;
  } finally {
    db?.close();
  }
}

export async function deleteProjectRecord(id: string): Promise<void> {
  const key = getProjectHistoryKey();
  if (!key) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openProjectDb();
    const transaction = db.transaction(PROJECT_STORE_NAME, "readwrite");
    transaction.objectStore(PROJECT_STORE_NAME).delete(`${key}:${id}`);
    await transactionDone(transaction);
    clearActiveProjectId(id);
  } catch { /* ignore */ }
  finally {
    db?.close();
  }
}

/** 批量删除项目记录 */
export async function deleteProjectRecords(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const key = getProjectHistoryKey();
  if (!key) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openProjectDb();
    const transaction = db.transaction(PROJECT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PROJECT_STORE_NAME);
    ids.forEach((id) => store.delete(`${key}:${id}`));
    await transactionDone(transaction);
    const activeId = loadActiveProjectId();
    if (activeId && ids.includes(activeId)) {
      clearActiveProjectId(activeId);
    }
  } catch { /* ignore */ }
  finally {
    db?.close();
  }
}
