import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMode = "text" | "image";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestConfig = {
  useDefaultModel?: boolean;
  textModelApiKey?: string;
  textModelName?: string;
  imageModelApiKey?: string;
  imageModelName?: string;
};

function formatUpstreamError(detail: string, fallback: string): string {
  try {
    const parsed = JSON.parse(detail);
    const code = parsed?.error?.code;
    const message = parsed?.error?.message;
    if (code === "ModelNotOpen") {
      return `${fallback}：${message}`;
    }
    return message ? `${fallback}：${message}` : fallback;
  } catch {
    return fallback;
  }
}

function firstConfiguredValue(...values: Array<string | undefined>): string {
  return values.map((value) => value?.trim()).find(Boolean) ?? "";
}

function normalizeMode(mode: unknown): ChatMode {
  return mode === "image" ? "image" : "text";
}

function getLatestUserPrompt(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as Partial<ChatMessage> | undefined;
    if (message?.role === "user" && typeof message.content === "string") {
      return message.content.trim();
    }
  }
  return "";
}

function buildTextMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message): message is ChatMessage =>
      (message as ChatMessage)?.role !== undefined
      && ((message as ChatMessage).role === "user" || (message as ChatMessage).role === "assistant")
      && typeof (message as ChatMessage).content === "string"
      && (message as ChatMessage).content.trim().length > 0,
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

function extractAssistantText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item?.text === "string") return item.text;
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

async function handleTextChat(messages: unknown, config: RequestConfig | undefined) {
  const envApiKey = firstConfiguredValue(process.env.ARK_API_KEY);
  const userApiKey = firstConfiguredValue(config?.textModelApiKey);
  const apiKey = config?.useDefaultModel === true ? envApiKey : firstConfiguredValue(userApiKey, envApiKey);
  const model = config?.useDefaultModel === true
    ? firstConfiguredValue(process.env.ARK_TEXT_MODEL, process.env.AI_TEXT_MODEL, "doubao-seed-1-6-250615")
    : firstConfiguredValue(config?.textModelName, process.env.ARK_TEXT_MODEL, process.env.AI_TEXT_MODEL, "doubao-seed-1-6-250615");
  const baseUrl = firstConfiguredValue(process.env.ARK_BASE_URL, "https://ark.cn-beijing.volces.com/api/v3");
  const normalizedMessages = buildTextMessages(messages);

  if (!apiKey) {
    return NextResponse.json(
      { error: "未配置文本模型 API Key。请在个人主页填写文本模型 Key，或开启“使用系统默认模型”。" },
      { status: 400 },
    );
  }

  if (normalizedMessages.length === 0) {
    return NextResponse.json({ error: "请输入对话内容。" }, { status: 400 });
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "你是豆韵AI助手。优先直接回答用户问题，保持简洁、准确、中文输出；只有当用户明确要求生成图片时才建议切换到生图模式。",
        },
        ...normalizedMessages,
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json(
      { error: formatUpstreamError(detail, "豆韵AI 对话请求失败"), detail },
      { status: response.status },
    );
  }

  const result = await response.json();
  const content = extractAssistantText(result?.choices?.[0]?.message?.content);
  if (!content) {
    return NextResponse.json({ error: "豆韵AI 对话接口未返回文本内容。" }, { status: 502 });
  }

  return NextResponse.json({ content });
}

async function handleImageGeneration(messages: unknown, config: RequestConfig | undefined) {
  const envApiKey = firstConfiguredValue(process.env.ARK_API_KEY);
  const userApiKey = firstConfiguredValue(config?.imageModelApiKey);
  const apiKey = config?.useDefaultModel === true ? envApiKey : firstConfiguredValue(userApiKey, envApiKey);
  const model = config?.useDefaultModel === true
    ? firstConfiguredValue(process.env.ARK_IMAGE_MODEL, process.env.AI_IMAGE_MODEL, "doubao-seedream-4-0-250828")
    : firstConfiguredValue(config?.imageModelName, process.env.ARK_IMAGE_MODEL, process.env.AI_IMAGE_MODEL, "doubao-seedream-4-0-250828");
  const baseUrl = firstConfiguredValue(process.env.ARK_BASE_URL, "https://ark.cn-beijing.volces.com/api/v3");
  const prompt = getLatestUserPrompt(messages);

  if (!apiKey) {
    return NextResponse.json(
      { error: "未配置生图模型 API Key。请在个人主页填写生图模型 Key，或开启“使用系统默认模型”。" },
      { status: 400 },
    );
  }

  if (!prompt) {
    return NextResponse.json({ error: "请输入生图提示词。" }, { status: 400 });
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
      watermark: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json(
      { error: formatUpstreamError(detail, "豆韵AI 生图请求失败"), detail },
      { status: response.status },
    );
  }

  const result = await response.json();
  const base64 = result?.data?.[0]?.b64_json;
  const url = result?.data?.[0]?.url;
  if (!base64 && !url) {
    return NextResponse.json({ error: "豆韵AI 生图接口未返回图片数据。" }, { status: 502 });
  }

  return NextResponse.json({
    imageUrl: base64 ? `data:image/png;base64,${base64}` : url,
    prompt,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const mode = normalizeMode(body?.mode);

  if (mode === "image") {
    return handleImageGeneration(body?.messages, body?.config);
  }

  return handleTextChat(body?.messages, body?.config);
}
