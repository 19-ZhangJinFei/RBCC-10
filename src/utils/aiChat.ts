import { loadApiConfig } from "./profileStorage";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

export type ChatMode = "text" | "image";

export const AI_CHAT_HISTORY_KEY = "douyun_ai_chat_history";
export const AI_CHAT_MODE_KEY = "douyun_ai_chat_mode";
const CHAT_CONTEXT_LIMIT = 10;
const HISTORY_LIMIT = 30;

let serverEnvConfigured: boolean | null = null;
let memoryChatHistory: ChatMessage[] | null = null;
let memoryChatMode: ChatMode | null = null;

function isStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage?.getItem === "function";
}

function getPersistableImageUrl(imageUrl: unknown): string | undefined {
  if (typeof imageUrl !== "string") return undefined;
  if (imageUrl.startsWith("data:")) return undefined;
  return imageUrl;
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-HISTORY_LIMIT).map((message) => ({
    role: message.role,
    content: message.content,
    imageUrl: getPersistableImageUrl(message.imageUrl),
  }));
}

export const DEFAULT_CHAT_MESSAGES: ChatMessage[] = [
  { role: "assistant", content: "你好，我是豆韵AI。可以切换到“文字对话”或“生图模式”分别使用。" },
];

export function loadAiChatHistory(): ChatMessage[] {
  if (memoryChatHistory) return normalizeMessages(memoryChatHistory);
  if (!isStorageAvailable()) return DEFAULT_CHAT_MESSAGES;
  try {
    const raw = localStorage.getItem(AI_CHAT_HISTORY_KEY);
    if (!raw) {
      memoryChatHistory = DEFAULT_CHAT_MESSAGES;
      return DEFAULT_CHAT_MESSAGES;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      memoryChatHistory = DEFAULT_CHAT_MESSAGES;
      return DEFAULT_CHAT_MESSAGES;
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
    memoryChatHistory = history.length > 0 ? history : DEFAULT_CHAT_MESSAGES;
    return memoryChatHistory;
  } catch {
    memoryChatHistory = DEFAULT_CHAT_MESSAGES;
    return DEFAULT_CHAT_MESSAGES;
  }
}

export function saveAiChatHistory(messages: ChatMessage[]): void {
  const normalizedMessages = normalizeMessages(messages);
  memoryChatHistory = normalizedMessages;
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(AI_CHAT_HISTORY_KEY, JSON.stringify(normalizedMessages));
  } catch {
    try {
      const textOnlyMessages = normalizedMessages.map(({ role, content }) => ({ role, content }));
      localStorage.setItem(AI_CHAT_HISTORY_KEY, JSON.stringify(textOnlyMessages));
    } catch {
      // Keep the session copy in memory even if persistent storage is full.
    }
  }
}

export function clearAiChatHistory(): void {
  memoryChatHistory = DEFAULT_CHAT_MESSAGES;
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
    return { useDefaultModel: true };
  }
  return {
    textModelApiKey: config.textModelApiKey ?? "",
    textModelName: config.textModelName ?? "",
    imageModelApiKey: config.imageModelApiKey ?? "",
    imageModelName: config.imageModelName ?? "",
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
    throw new Error(result?.error ?? `豆韵AI${mode === "image" ? "生图" : "对话"}请求失败`);
  }

  if (mode === "image") {
    if (typeof result?.imageUrl !== "string" || result.imageUrl.length === 0) {
      throw new Error(result?.error ?? "豆韵AI 未返回图片");
    }
    onDelta("已生成图像：");
    onImage?.(result.imageUrl);
    return "已生成图像：";
  }

  if (typeof result?.content !== "string" || result.content.trim().length === 0) {
    throw new Error(result?.error ?? "豆韵AI 未返回文本内容");
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
