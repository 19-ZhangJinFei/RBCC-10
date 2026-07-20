import { NextResponse } from "next/server";
import sharp from "sharp";
import type { SubjectIdentification } from "@/types/subjectIdentification";

export const runtime = "nodejs";

function formatUpstreamError(detail: string, fallback: string): string {
  try {
    const parsed = JSON.parse(detail);
    const code = parsed?.error?.code;
    const message = parsed?.error?.message;
    if (code === "ModelNotOpen") {
      return `当前 Ark 账号未开通所选文案模型：${message}`;
    }
    return message ? `${fallback}：${message}` : fallback;
  } catch {
    return fallback;
  }
}

async function compactDataUrl(imageUrl: string): Promise<string> {
  const match = imageUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (!match) return imageUrl;

  const input = Buffer.from(match[1], "base64");
  const output = await sharp(input)
    .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();

  return `data:image/jpeg;base64,${output.toString("base64")}`;
}

function formatSubjectIdentification(identification: SubjectIdentification | undefined): string {
  if (!identification) return "未提供主体识别结果。";

  return [
    `主体名称：${identification.subject}`,
    `主体类别：${identification.category}`,
    `识别置信度：${identification.confidence}`,
    `视觉证据：${identification.evidence.join("；")}`,
    `备选识别：${identification.alternatives.join("；")}`,
    `视觉摘要：${identification.visualSummary}`,
  ].join("\n");
}

export async function POST(req: Request) {
  const body = await req.json();
  const language = body.language === "en" ? "en" : "zh";
  const subjectIdentification = body.subjectIdentification as SubjectIdentification | undefined;
  const promptOverride = typeof body.prompt === "string" ? body.prompt.trim() : "";

  const generatedPrompt = language === "en" ? `Generate a work introduction for a Chinese cultural bead-art product based only on the visible subject, colors, composition, style, and the editable subject identification below.

Return strict JSON only:
{
  "title": "An English work title that includes the product type",
  "source": "Cultural source in English, based only on visible patterns, objects, symbols, colors, aesthetic traits, and subject identification, 80 to 140 words",
  "meaning": "Pattern meaning in English, explaining symbolism from the subject, colors, composition, and visual evidence, 80 to 140 words",
  "design": "Design notes in English, describing bead conversion, product carrier, color control, and use scenario, 100 to 180 words"
}

Only output strict JSON with fields title, source, meaning, design.

Product: ${body.product}
Grid: ${body.gridWidth && body.gridHeight ? `${body.gridWidth}x${body.gridHeight}` : `${body.gridSize}x${body.gridSize}`}
Color count: ${body.colorCount}
Material colors: ${JSON.stringify(body.beadCounts ?? [])}
Subject identification:
${formatSubjectIdentification(subjectIdentification)}
Requirements:
1. Use only the reference image and subject identification. Do not extend, assume, or reuse the theme, element, or cultural note from the configuration page.
2. If subject identification conflicts with visible image evidence, prioritize visible image evidence and the identification evidence.
3. The title must include the product type "${body.product}" and must not replace it with another product category.
4. The design note must explain how the bead result works as "${body.product}".
5. Self-check before output: title, source, meaning, and design must all be supported by the image or subject identification.
6. Use English only.` : `请根据参考图像中可见的主体、色彩、构图和风格，以及下方人工可编辑的主体识别结果，为一个中华文创拼豆作品生成“作品介绍”。

参考生成模板：
{
  "title": "8到14个中文字符的作品名称，基于图像可见主体和文创形式",
  "source": "文化来源：只依据图像可见纹样、器物、符号、色彩、审美特征和主体识别结果推断文化出处或审美传统，80到140字",
  "meaning": "图案寓意：结合图像中的主体、色彩、构图和主体识别证据解释象征意义，80到140字",
  "design": "设计说明：结合参考图像描述拼豆化设计、产品载体、色彩控制和使用场景，100到180字"
}

只输出严格 JSON，字段只能是 title, source, meaning, design。

产品：${body.product}
网格：${body.gridWidth && body.gridHeight ? `${body.gridWidth}x${body.gridHeight}` : `${body.gridSize}x${body.gridSize}`}
颜色数：${body.colorCount}
材料颜色：${JSON.stringify(body.beadCounts ?? [])}
主体识别结果：
${formatSubjectIdentification(subjectIdentification)}
要求：
1. 只能依据参考图像和主体识别结果进行文化说明，不得结合、延续或猜测用户在配置页选择的主题、核心元素、文化说明。
2. 主体识别结果来自独立识别模块，若它与图像可见信息冲突，应以图像可见内容和识别证据为准，不要套用配置主题。
3. 作品名称必须包含“${body.product}”这几个字；禁止把产品写成挂饰、钥匙扣、冰箱贴、胸针、摆件等其他形式，除非产品本身就是这些形式。
4. 设计说明必须说明该拼豆成果如何作为“${body.product}”落地使用。
5. 输出前自检：title、source、meaning、design 四项都必须能被参考图像或主体识别结果支撑。`;

  const prompt = promptOverride || generatedPrompt;
  const rawImageUrl = Array.isArray(body.imageUrl) ? body.imageUrl[0] : body.imageUrl;
  const compactImageUrl =
    typeof rawImageUrl === "string" && rawImageUrl.length > 0
      ? await compactDataUrl(rawImageUrl)
      : null;
  const usesVision = Boolean(compactImageUrl);
  const apiKey = usesVision ? process.env.ARK_API_KEY : process.env.DEEPSEEK_API_KEY;
  const baseUrl = usesVision
    ? process.env.ARK_BASE_URL ?? process.env.AI_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3"
    : process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = usesVision
    ? process.env.ARK_VISION_MODEL ?? process.env.AI_VISION_MODEL ?? "doubao-vision-lite-32k-241015"
    : process.env.DEEPSEEK_TEXT_MODEL ?? "deepseek-v4-flash";

  if (!apiKey) {
    return NextResponse.json(
      {
        error: usesVision
          ? "服务端未配置 ARK_API_KEY，无法分析参考图像。"
          : "服务端未配置 DEEPSEEK_API_KEY，无法生成纯文本文案。",
      },
      { status: 500 },
    );
  }
  const finalTextConstraint = language === "en"
    ? `Final check: the product must be "${body.product}". The title must directly include "${body.product}" and use English only.`
    : `最终检查：产品必须是“${body.product}”。title 必须直接包含“${body.product}”，不得使用“拼豆画”或其他产品词替代“${body.product}”。`;
  const userContent = compactImageUrl
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: compactImageUrl } },
        { type: "text", text: finalTextConstraint },
      ]
    : `${prompt}\n${finalTextConstraint}`;

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      ...(!usesVision ? { thinking: { type: "disabled" } } : {}),
      messages: [
        {
          role: "system",
          content:
            language === "en"
              ? "You are a cultural product planner and visual analyst. Cultural judgments must rely on the reference image and independent subject identification only. Output strict JSON only, no Markdown, in English."
              : "你是文创产品策划师和视觉分析师。文化判断必须以参考图像的可见内容和独立主体识别结果为依据，不得使用配置页主题、核心元素或用户文化说明来补全。只输出严格 JSON，不要 Markdown。",
        },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json(
      { error: formatUpstreamError(detail, "AI 文案请求失败。"), detail },
      { status: response.status },
    );
  }

  const result = await response.json();
  const text = result?.choices?.[0]?.message?.content;

  try {
    const parsed = JSON.parse(text);
    const copy = {
      title: String(parsed.title ?? ""),
      source: String(parsed.source ?? ""),
      meaning: String(parsed.meaning ?? ""),
      design: String(parsed.design ?? ""),
    };
    return NextResponse.json({ copy, prompt });
  } catch {
    return NextResponse.json(
      { error: "AI 文案接口返回内容不是可解析的 JSON。", text },
      { status: 502 },
    );
  }
}
