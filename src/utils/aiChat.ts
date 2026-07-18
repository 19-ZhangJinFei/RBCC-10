import { loadApiConfig } from "./profileStorage";
import { loadAppLanguage, type AppLanguage } from "./language";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

export type ChatMode = "text" | "image";

export const AI_CHAT_HISTORY_KEY = "douyun_ai_chat_history";
export const AI_CHAT_MODE_KEY = "douyun_ai_chat_mode";
const AI_CHAT_DB_NAME = "douyun_ai_chat_db";
const AI_CHAT_DB_VERSION = 1;
const AI_CHAT_STORE_NAME = "chat";
const CHAT_CONTEXT_LIMIT = 10;
const HISTORY_LIMIT = 30;

let serverEnvConfigured: boolean | null = null;
let memoryChatHistory: ChatMessage[] | null = null;
let memoryChatMode: ChatMode | null = null;

function isStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage?.getItem === "function";
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

function openChatDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) return Promise.reject(new Error("indexeddb_unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AI_CHAT_DB_NAME, AI_CHAT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AI_CHAT_STORE_NAME)) {
        db.createObjectStore(AI_CHAT_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("indexeddb_open_blocked"));
  });
}

function getPersistableImageUrl(imageUrl: unknown): string | undefined {
  if (typeof imageUrl !== "string") return undefined;
  return imageUrl;
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-HISTORY_LIMIT).map((message) => ({
    role: message.role,
    content: message.content,
    imageUrl: getPersistableImageUrl(message.imageUrl),
  }));
}

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-HISTORY_LIMIT).map((message) => ({
    role: message.role,
    content: message.content,
    imageUrl: message.imageUrl,
  }));
}

export function getDefaultChatMessages(language: AppLanguage = loadAppLanguage()): ChatMessage[] {
  return [
    {
      role: "assistant",
      content: language === "en"
        ? "Hi, I am Doge AI. Switch between text chat and image generation as needed."
        : "你好，我是豆阁AI。可以切换到“文字对话”或“生图模式”分别使用。",
    },
  ];
}

export const DEFAULT_CHAT_MESSAGES: ChatMessage[] = getDefaultChatMessages("zh");

export function loadAiChatHistory(): ChatMessage[] {
  if (memoryChatHistory) return cloneMessages(memoryChatHistory);
  if (!isStorageAvailable()) return getDefaultChatMessages();
  try {
    const raw = localStorage.getItem(AI_CHAT_HISTORY_KEY);
    if (!raw) {
      memoryChatHistory = getDefaultChatMessages();
      return cloneMessages(memoryChatHistory);
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      memoryChatHistory = getDefaultChatMessages();
      return cloneMessages(memoryChatHistory);
    }
    const history = parsed
      .filter((item): item is ChatMessage =>
        (item?.role === "user" || item?.role === "assistant") && typeof item?.content === "string",
      )
      .map((item) => ({
        role: item.role,
        content: item.content,
        imageUrl: getPersistableImageUrl(item.imageUrl),
      }));
    memoryChatHistory = history.length > 0 ? cloneMessages(history) : cloneMessages(getDefaultChatMessages());
    return cloneMessages(memoryChatHistory);
  } catch {
    memoryChatHistory = cloneMessages(getDefaultChatMessages());
    return cloneMessages(memoryChatHistory);
  }
}

export async function loadAiChatHistoryAsync(): Promise<ChatMessage[]> {
  let db: IDBDatabase | null = null;
  try {
    db = await openChatDb();
    const transaction = db.transaction(AI_CHAT_STORE_NAME, "readonly");
    const raw = await requestToPromise<{ key: string; messages: ChatMessage[] } | undefined>(
      transaction.objectStore(AI_CHAT_STORE_NAME).get(AI_CHAT_HISTORY_KEY),
    );
    const messages = Array.isArray(raw?.messages) ? normalizeMessages(raw.messages) : loadAiChatHistory();
    memoryChatHistory = messages.length > 0 ? cloneMessages(messages) : cloneMessages(getDefaultChatMessages());
    return cloneMessages(memoryChatHistory);
  } catch {
    return loadAiChatHistory();
  } finally {
    db?.close();
  }
}

async function saveAiChatHistoryAsync(messages: ChatMessage[]): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openChatDb();
    const transaction = db.transaction(AI_CHAT_STORE_NAME, "readwrite");
    transaction.objectStore(AI_CHAT_STORE_NAME).put({
      key: AI_CHAT_HISTORY_KEY,
      messages: normalizeMessages(messages),
    });
    await transactionDone(transaction);
  } catch {
    // The memory copy remains available for the current session.
  } finally {
    db?.close();
  }
}

export function saveAiChatHistory(messages: ChatMessage[]): void {
  memoryChatHistory = cloneMessages(messages);
  const normalizedMessages = normalizeMessages(messages);
  void saveAiChatHistoryAsync(normalizedMessages);
  if (!isStorageAvailable()) return;
  try {
    const textOnlyMessages = normalizedMessages.map(({ role, content }) => ({ role, content }));
    localStorage.setItem(AI_CHAT_HISTORY_KEY, JSON.stringify(textOnlyMessages));
  } catch {
    // Keep the session copy in memory even if persistent storage is full.
  }
}

export function clearAiChatHistory(): void {
  const defaultMessages = getDefaultChatMessages();
  memoryChatHistory = cloneMessages(defaultMessages);
  void saveAiChatHistoryAsync(defaultMessages);
  if (!isStorageAvailable()) return;
  localStorage.removeItem(AI_CHAT_HISTORY_KEY);
}

export function loadAiChatMode(): ChatMode {
  if (memoryChatMode) return memoryChatMode;
  if (!isStorageAvailable()) return "text";
  try {
    const raw = localStorage.getItem(AI_CHAT_MODE_KEY);
    memoryChatMode = raw === "image" ? "image" : "text";
    return memoryChatMode;
  } catch {
    memoryChatMode = "text";
    return "text";
  }
}

export function saveAiChatMode(mode: ChatMode): void {
  memoryChatMode = mode;
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(AI_CHAT_MODE_KEY, mode);
  } catch {
    // ignore storage failure and keep session state in memory
  }
}

export async function checkServerEnvConfig(): Promise<boolean> {
  try {
    const res = await fetch("/api/env-config");
    const data = await res.json();
    serverEnvConfigured = data.configured === true;
    return serverEnvConfigured;
  } catch {
    serverEnvConfigured = false;
    return false;
  }
}

export function isApiConfigured(): boolean {
  const config = loadApiConfig();
  if (!config) {
    return serverEnvConfigured === true;
  }
  if (config.textModelApiKey || config.imageModelApiKey) return true;
  if (config.useDefaultModel) return serverEnvConfigured === true;
  if (serverEnvConfigured === true) return true;
  return false;
}

function buildRequestConfig() {
  const config = loadApiConfig();
  if (!config || config.useDefaultModel) {
    return { useDefaultModel: true, language: loadAppLanguage() };
  }
  return {
    textModelApiKey: config.textModelApiKey ?? "",
    textModelName: config.textModelName ?? "",
    imageModelApiKey: config.imageModelApiKey ?? "",
    imageModelName: config.imageModelName ?? "",
    language: loadAppLanguage(),
    useDefaultModel: false,
  };
}

async function assertConfigured(mode: ChatMode): Promise<void> {
  const config = loadApiConfig();
  const serverConfigured = serverEnvConfigured === true || await checkServerEnvConfig();

  if (!config) {
    if (serverConfigured) return;
    throw new Error("请先在设置中配置 API 信息");
  }

  if (config.useDefaultModel) {
    if (serverConfigured) return;
    throw new Error("系统默认模型未配置，请先在个人主页完成 API 配置");
  }

  const userKey = mode === "image" ? config.imageModelApiKey : config.textModelApiKey;
  if (userKey?.trim()) return;
  if (serverConfigured) return;

  throw new Error(`请先在设置中配置${mode === "image" ? "生图模型" : "文本模型"} API 信息`);
}

export async function streamChatMessage(
  messages: ChatMessage[],
  mode: ChatMode,
  onDelta: (delta: string) => void,
  onImage?: (imageUrl: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  await assertConfigured(mode);

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      messages: messages
        .slice(-CHAT_CONTEXT_LIMIT)
        .map(({ role, content }) => ({ role, content })),
      config: buildRequestConfig(),
    }),
    signal,
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error ?? `豆阁AI${mode === "image" ? "生图" : "对话"}请求失败`);
  }

  if (mode === "image") {
    if (typeof result?.imageUrl !== "string" || result.imageUrl.length === 0) {
      throw new Error(result?.error ?? "豆阁AI 未返回图片");
    }
    onDelta("已生成图像：");
    onImage?.(result.imageUrl);
    return "已生成图像：";
  }

  if (typeof result?.content !== "string" || result.content.trim().length === 0) {
    throw new Error(result?.error ?? "豆阁AI 未返回文本内容");
  }

  onDelta(result.content);
  return result.content;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  mode: ChatMode,
  signal?: AbortSignal,
): Promise<string> {
  return streamChatMessage(messages, mode, () => undefined, undefined, signal);
}
