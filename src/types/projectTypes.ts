/** API 配置 */
export interface ApiConfig {
  textModelApiKey: string;
  textModelName: string;
  imageModelApiKey: string;
  imageModelName: string;
  visionModelApiKey?: string;
  visionModelName?: string;
  autoSaveIntervalSeconds?: number;
  /** 是否使用系统环境变量中的默认模型，为 true 时隐藏 apikey 输入 */
  useDefaultModel?: boolean;
}

/** 文本模型选项，附带购买链接 */
export const TEXT_MODEL_OPTIONS: { name: string; icon: string; purchaseUrl: string }[] = [
  { name: "GPT-4o", icon: "🤖", purchaseUrl: "https://platform.openai.com/api-keys" },
  { name: "GPT-4o-mini", icon: "🤖", purchaseUrl: "https://platform.openai.com/api-keys" },
  { name: "Claude 3.5 Sonnet", icon: "🧠", purchaseUrl: "https://console.anthropic.com/" },
  { name: "Claude 3 Haiku", icon: "🧠", purchaseUrl: "https://console.anthropic.com/" },
  { name: "Gemini 1.5 Pro", icon: "✨", purchaseUrl: "https://aistudio.google.com/apikey" },
  { name: "DeepSeek-V3", icon: "🦈", purchaseUrl: "https://platform.deepseek.com/api_keys" },
  { name: "Qwen2.5-72B", icon: "🐉", purchaseUrl: "https://help.aliyun.com/document_detail/2712195.html" },
  { name: "GLM-4-Plus", icon: "📐", purchaseUrl: "https://open.bigmodel.cn/" },
];

/** 图片生成模型选项，附带购买链接 */
export const IMAGE_MODEL_OPTIONS: { name: string; icon: string; purchaseUrl: string }[] = [
  { name: "DALL·E 3", icon: "🎨", purchaseUrl: "https://platform.openai.com/api-keys" },
  { name: "Stable Diffusion 3", icon: "🌟", purchaseUrl: "https://platform.stability.ai/api-keys" },
  { name: "Midjourney", icon: "🌈", purchaseUrl: "https://www.midjourney.com/account" },
  { name: "FLUX.1 Pro", icon: "🔥", purchaseUrl: "https://bfl.ml/" },
  { name: "CogView-4", icon: "🖌️", purchaseUrl: "https://platform.volces.com/" },
  { name: "Minimax", icon: "🎭", purchaseUrl: "https://www.minimaxi.com/" },
  { name: "Seedance", icon: "🌱", purchaseUrl: "https://console.volcengine.com/" },
];

/** 项目历史记录 */
/** 图像理解/主体识别模型选项 */
export const VISION_MODEL_OPTIONS: { name: string; icon: string; purchaseUrl: string }[] = [
  { name: "GPT-4o", icon: "👁️", purchaseUrl: "https://platform.openai.com/api-keys" },
  { name: "GPT-4o-mini", icon: "👁️", purchaseUrl: "https://platform.openai.com/api-keys" },
  { name: "Qwen2.5-VL", icon: "🔍", purchaseUrl: "https://help.aliyun.com/document_detail/2712195.html" },
  { name: "doubao-seed-1-6-vision", icon: "🔍", purchaseUrl: "https://console.volcengine.com/" },
  { name: "Gemini 1.5 Pro", icon: "✦", purchaseUrl: "https://aistudio.google.com/apikey" },
];

export interface ProjectRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  completed: boolean;
  theme: string;
  element: string;
  meaning?: string;
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
