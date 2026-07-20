import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/env-config
 * 返回服务器环境变量中配置的 AI 模型信息（不暴露密钥本身）
 * 供前端 ProfilePage 在"使用默认模型"模式下展示
 */
export async function GET() {
  const arkConfigured = Boolean(process.env.ARK_API_KEY);
  const deepSeekConfigured = Boolean(process.env.DEEPSEEK_API_KEY);
  const imageBaseUrl = process.env.ARK_BASE_URL ?? process.env.AI_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3";
  const textBaseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const imageModel = process.env.ARK_IMAGE_MODEL ?? process.env.AI_IMAGE_MODEL ?? "";
  const textModel = process.env.DEEPSEEK_TEXT_MODEL ?? "deepseek-v4-flash";
  const visionModel = process.env.ARK_VISION_MODEL ?? process.env.AI_VISION_MODEL ?? "";

  return NextResponse.json({
    configured: arkConfigured && deepSeekConfigured,
    arkConfigured,
    deepSeekConfigured,
    baseUrl: imageBaseUrl,
    imageBaseUrl,
    textBaseUrl,
    defaultImageModel: imageModel,
    defaultTextModel: textModel,
    defaultVisionModel: visionModel,
  });
}
