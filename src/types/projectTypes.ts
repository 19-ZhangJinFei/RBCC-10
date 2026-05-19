/** API 配置 */
export interface ApiConfig {
  textModelApiKey: string;
  textModelName: string;
  imageModelApiKey: string;
  imageModelName: string;
}

/** 可选的文本模型 */
export const TEXT_MODEL_OPTIONS: { name: string; icon: string }[] = [
  { name: "GPT-4o", icon: "🤖" },
  { name: "GPT-4o-mini", icon: "🤖" },
  { name: "Claude 3.5 Sonnet", icon: "🧠" },
  { name: "Claude 3 Haiku", icon: "🧠" },
  { name: "Gemini 1.5 Pro", icon: "✨" },
  { name: "DeepSeek-V3", icon: "🦈" },
  { name: "Qwen2.5-72B", icon: "🐉" },
  { name: "GLM-4-Plus", icon: "📐" },
];

/** 可选的图片生成模型 */
export const IMAGE_MODEL_OPTIONS: { name: string; icon: string }[] = [
  { name: "DALL·E 3", icon: "🎨" },
  { name: "Stable Diffusion 3", icon: "🌟" },
  { name: "Midjourney", icon: "🌈" },
  { name: "FLUX.1 Pro", icon: "🔥" },
  { name: "CogView-4", icon: "🖌️" },
  { name: "Minimax", icon: "🎭" },
  { name: "Seedance", icon: "🌱" },
];

/** 项目历史记录 */
export interface ProjectRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  completed: boolean;
  theme: string;
  element: string;
  productId: string;
  gridSize: number;
  colorCount: number;
  aspectRatio: string;
  showGrid: boolean;
  antiAlias: boolean;
  sourceImageUrl: string | null;
  extractedImageUrl: string | null;
  patternData: string | null;
  patternUrl: string | null;
  cleanPatternUrl: string | null;
  mockupUrl: string | null;
  productSceneUrl: string | null;
}
