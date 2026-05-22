export type CulturePromptOptions = {
  theme: string;
  element: string;
  meaning?: string;
  product: string;
  productPrompt?: string;
  aspectRatio?: string;
  gridSize: number;
  gridWidth?: number;
  gridHeight?: number;
  colorCount: number;
  skillLevel?: "beginner" | "skilled" | "expert";
};

export function buildCulturePrompt(options: CulturePromptOptions): string {
  const productLine = options.productPrompt
    ? `作品载体：${options.product}（${options.productPrompt}）`
    : `作品载体：${options.product}`;
  const skillLevel = options.skillLevel ?? "beginner";
  const skillLabel = {
    beginner: "新手",
    skilled: "熟练",
    expert: "精通",
  }[skillLevel];
  const difficultyInstruction = {
    beginner: "新手难度：图案应轮廓大、结构清楚、色块较大，减少细碎纹样和过密装饰；保留传统文化识别度，但不要让后续拼豆制作过难。",
    skilled: "熟练难度：允许加入较丰富的传统纹样、边框和辅助色，细节密度中等，适合有一定经验的拼豆制作。",
    expert: "精通难度：可以使用更复杂的传统纹样组合、层次更丰富的装饰细节和更精细的色彩变化，但仍要保持色块边界清晰，避免不可制作的碎片化噪点。",
  }[skillLevel];
  return [
    "【任务：生成传统文化主题图案 · 第二步】",
    "请根据以下文化主题、核心意象和作品载体，创作一幅中华传统文化风格的平面装饰图案。",
    `文化主题：${options.theme}`,
    `核心意象：${options.element}`,
    options.meaning ? `文化说明：${options.meaning}` : "",
    productLine,
    options.aspectRatio ? `画面比例：${options.aspectRatio}` : "",
    options.gridWidth && options.gridHeight ? `后续拼豆网格参考：${options.gridWidth} × ${options.gridHeight}` : `后续拼豆网格参考：${options.gridSize} 格`,
    `目标色彩数量：约 ${options.colorCount} 种主色与辅色`,
    `用户制作熟练度：${skillLabel}`,
    "",
    "设计要求：",
    "• 将“核心意象”作为画面主体，并让它与文化主题中的纹样、器物、建筑、神话或民俗符号自然结合，不要只画一个孤立图标",
    "• 使用传统文化语境中的装饰语言：对称构图、团花、卷草、云纹、水纹、边框纹样、壁画线条、瓷器釉色或宫廷配色等，可按主题取舍",
    "• 色彩不要过于简单；请使用层次丰富但清晰可分的配色，至少包含主色、辅色、点缀色和明暗层次，避免整图只由两三种颜色构成",
    `• ${difficultyInstruction}`,
    "• 色块边缘明确，高对比度，主体居中，轮廓完整，便于后续像素化和拼豆颜色映射",
    "• 可以有细节和装饰层次，但必须保持平面化、图案化，不要使用摄影质感、复杂光影、复杂渐变或模糊过渡",
    "• 背景建议为纯白、浅纯色或简洁装饰底，不要有杂乱背景元素",
    "• 这是第二步「图案设计」，后续第三步会对本结果进行像素化处理变成拼豆图纸",
    "• 不要把图案像素化，不要绘制拼豆网格，不要添加色号",
    "• 输出干净的平面装饰图，不要文字、不要水印、不要复杂背景",
  ].filter(Boolean).join("\n");
}
