import { loadApiConfig } from "./profileStorage";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

export const AI_CHAT_HISTORY_KEY = "douyun_ai_chat_history";
const CHAT_CONTEXT_LIMIT = 10;
const HISTORY_LIMIT = 30;

function getPersistableImageUrl(imageUrl: unknown): string | undefined {
  if (typeof imageUrl !== "string") return undefined;
  // data: URLs (base64 images) will be stored in localStorage.
  // The save function handles localStorage quota errors gracefully.
  return imageUrl;
}

export const DEFAULT_CHAT_MESSAGES: ChatMessage[] = [
  { role: "assistant", content: "你好，我是豆韵AI。输入你想生成的图像提示词，我会调用生图模型输出图片。" },
];

let serverEnvConfigured: boolean | null = null;

function isStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage?.getItem === "function";
}

export function loadAiChatHistory(): ChatMessage[] {
  if (!isStorageAvailable()) return DEFAULT_CHAT_MESSAGES;
  try {
    const raw = localStorage.getItem(AI_CHAT_HISTORY_KEY);
    if (!raw) return DEFAULT_CHAT_MESSAGES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_CHAT_MESSAGES;
    return parsed
      .filter((item): item is ChatMessage =>
        (item?.role === "user" || item?.role === "assistant") && typeof item?.content === "string",
      )
      .map((item) => ({
        role: item.role,
        content: item.content,
        imageUrl: getPersistableImageUrl(item.imageUrl),
      }));
  } catch {
    return DEFAULT_CHAT_MESSAGES;
  }
}

export function saveAiChatHistory(messages: ChatMessage[]): void {
  if (!isStorageAvailable()) return;
  const persistableMessages = messages.slice(-HISTORY_LIMIT).map((message) => ({
    role: message.role,
    content: message.content,
    imageUrl: getPersistableImageUrl(message.imageUrl),
  }));
  try {
    localStorage.setItem(AI_CHAT_HISTORY_KEY, JSON.stringify(persistableMessages));
  } catch {
    localStorage.removeItem(AI_CHAT_HISTORY_KEY);
  }
}

export function clearAiChatHistory(): void {
  if (!isStorageAvailable()) return;
  localStorage.removeItem(AI_CHAT_HISTORY_KEY);
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
    // No saved config -> default to server default mode
    return serverEnvConfigured === true;
  }
  if (config?.textModelApiKey || config?.imageModelApiKey) return true;
  if (config?.useDefaultModel) return serverEnvConfigured === true;
  if (serverEnvConfigured === true) return true;
  return false;
}

function buildRequestConfig() {
  const config = loadApiConfig();
  // No saved config or explicitly using default model -> use server env vars
  if (!config || config?.useDefaultModel) {
    return { useDefaultModel: true };
  }
  return {
    textModelApiKey: config?.textModelApiKey ?? "",
    imageModelApiKey: config?.imageModelApiKey ?? "",
    textModelName: config?.textModelName ?? "",
    imageModelName: config?.imageModelName ?? "",
  };
}

async function assertConfigured(): Promise<void> {
  const config = loadApiConfig();
  const canUseServerDefault =
    config?.useDefaultModel === true || !config || serverEnvConfigured === true || await checkServerEnvConfig();

  if (!canUseServerDefault) {
    throw new Error("请先在设置中配置 API 信息");
  }
}

export async function streamChatMessage(
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  onImage?: (imageUrl: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  await assertConfigured();

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages
        .slice(-CHAT_CONTEXT_LIMIT)
        .map(({ role, content }) => ({ role, content })),
      config: buildRequestConfig(),
    }),
    signal,
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error ?? "豆韵AI 生图请求失败");
  }

  if (typeof result?.imageUrl !== "string" || result.imageUrl.length === 0) {
    throw new Error(result?.error ?? "豆韵AI 未返回图片");
  }

  onDelta("已生成图像：");
  onImage?.(result.imageUrl);
  return "已生成图像：";
}

export async function sendChatMessage(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  return streamChatMessage(messages, () => undefined, undefined, signal);
}
