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
  language?: "zh" | "en";
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

function getLanguageInstruction(language: RequestConfig["language"]): string {
  return language === "en"
    ? "Always answer in natural English unless the user explicitly asks for another language."
    : "始终使用自然、准确的中文回答，除非用户明确要求使用其他语言。";
}

function localizedError(language: RequestConfig["language"], zh: string, en: string): string {
  return language === "en" ? en : zh;
}

async function handleTextChat(messages: unknown, config: RequestConfig | undefined) {
  const language = config?.language === "en" ? "en" : "zh";
  const apiKey = firstConfiguredValue(process.env.DEEPSEEK_API_KEY);
  const model = firstConfiguredValue(process.env.DEEPSEEK_TEXT_MODEL, "deepseek-v4-flash");
  const baseUrl = firstConfiguredValue(process.env.DEEPSEEK_BASE_URL, "https://api.deepseek.com");
  const normalizedMessages = buildTextMessages(messages);

  if (!apiKey) {
    return NextResponse.json(
      {
        error: localizedError(
          language,
          "服务端未配置 DEEPSEEK_API_KEY，无法使用文字对话。",
          "DEEPSEEK_API_KEY is not configured on the server, so text chat is unavailable.",
        ),
      },
      { status: 400 },
    );
  }

  if (normalizedMessages.length === 0) {
    return NextResponse.json({
      error: localizedError(language, "请输入对话内容。", "Please enter a message."),
    }, { status: 400 });
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "system",
          content: `你是豆阁AI助手。优先直接回答用户问题，保持简洁、准确；只有当用户明确要求生成图片时才建议切换到生图模式。${getLanguageInstruction(language)}`,
        },
        ...normalizedMessages,
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json(
      {
        error: formatUpstreamError(
          detail,
          localizedError(language, "豆阁AI 对话请求失败", "Doge AI chat request failed"),
        ),
        detail,
      },
      { status: response.status },
    );
  }

  const result = await response.json();
  const content = extractAssistantText(result?.choices?.[0]?.message?.content);
  if (!content) {
    return NextResponse.json({
      error: localizedError(language, "豆阁AI 对话接口未返回文本内容。", "Doge AI did not return text content."),
    }, { status: 502 });
  }

  return NextResponse.json({ content });
}

async function handleImageGeneration(messages: unknown, config: RequestConfig | undefined) {
  const language = config?.language === "en" ? "en" : "zh";
  const apiKey = firstConfiguredValue(process.env.ARK_API_KEY);
  const model = firstConfiguredValue(process.env.ARK_IMAGE_MODEL, process.env.AI_IMAGE_MODEL, "doubao-seedream-4-0-250828");
  const baseUrl = firstConfiguredValue(process.env.ARK_BASE_URL, process.env.AI_BASE_URL, "https://ark.cn-beijing.volces.com/api/v3");
  const prompt = getLatestUserPrompt(messages);

  if (!apiKey) {
    return NextResponse.json(
      {
        error: localizedError(
          language,
          "服务端未配置 ARK_API_KEY，无法使用图像生成功能。",
          "ARK_API_KEY is not configured on the server, so image generation is unavailable.",
        ),
      },
      { status: 400 },
    );
  }

  if (!prompt) {
    return NextResponse.json({
      error: localizedError(language, "请输入生图提示词。", "Please enter an image prompt."),
    }, { status: 400 });
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
      {
        error: formatUpstreamError(
          detail,
          localizedError(language, "豆阁AI 生图请求失败", "Doge AI image generation request failed"),
        ),
        detail,
      },
      { status: response.status },
    );
  }

  const result = await response.json();
  const base64 = result?.data?.[0]?.b64_json;
  const url = result?.data?.[0]?.url;
  if (!base64 && !url) {
    return NextResponse.json({
      error: localizedError(language, "豆阁AI 生图接口未返回图片数据。", "Doge AI did not return image data."),
    }, { status: 502 });
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
