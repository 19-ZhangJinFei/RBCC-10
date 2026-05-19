import { PaletteColor } from "./pixelation";
import colorSystemMapping from "../app/colorSystemMapping.json";

// 统一使用传统色号（heritage），删除多色号系统
export type ColorSystem = "heritage";

export const DEFAULT_COLOR_SYSTEM: ColorSystem = "heritage";

/** 图像滤镜选项 */
export type ImageFilter = "none" | "contrast" | "vibrant" | "pastel" | "warm" | "cool" | "grayscale" | "sepia";

export const IMAGE_FILTER_OPTIONS: { key: ImageFilter; name: string; desc: string }[] = [
  { key: "none", name: "无滤镜", desc: "保持原始色彩" },
  { key: "contrast", name: "高对比", desc: "增强色块边界，适合轮廓清晰的设计" },
  { key: "vibrant", name: "鲜艳", desc: "提高色彩饱和度，成品更艳丽" },
  { key: "pastel", name: "柔和", desc: "降低饱和度并提亮，效果更温柔" },
  { key: "warm", name: "暖色调", desc: "增强红橙色调，画面更温暖" },
  { key: "cool", name: "冷色调", desc: "增强蓝紫色调，画面更清冷" },
  { key: "grayscale", name: "灰度", desc: "去色后映射，灰度深浅决定拼豆颜色" },
  { key: "sepia", name: "怀旧", desc: "复古棕色调，适合古风主题" },
];

// 保持向后兼容
export const FILTER_OPTIONS = IMAGE_FILTER_OPTIONS;

/** 色系分类 */
export type ColorFamily =
  | "全部"
  | "红色系"
  | "橙色系"
  | "黄色系"
  | "绿色系"
  | "青色系"
  | "蓝色系"
  | "紫色系"
  | "粉色系"
  | "灰色系"
  | "白色系"
  | "黑色系";

export const COLOR_FAMILIES: { key: ColorFamily; icon: string }[] = [
  { key: "全部", icon: "🌈" },
  { key: "红色系", icon: "🔴" },
  { key: "橙色系", icon: "🟠" },
  { key: "黄色系", icon: "🟡" },
  { key: "绿色系", icon: "🟢" },
  { key: "青色系", icon: "🩵" },
  { key: "蓝色系", icon: "🔵" },
  { key: "紫色系", icon: "🟣" },
  { key: "粉色系", icon: "🩷" },
  { key: "灰色系", icon: "⚪" },
  { key: "白色系", icon: "⬜" },
  { key: "黑色系", icon: "⬛" },
];

type ColorMapping = Record<string, { heritage: string }>;
const typedColorSystemMapping = colorSystemMapping as unknown as ColorMapping;

export function getAllHexValues(): string[] {
  return Object.keys(typedColorSystemMapping);
}

export function getHeritageToHexMapping(): Record<string, string> {
  const mapping: Record<string, string> = {};
  Object.entries(typedColorSystemMapping).forEach(([hex, colorData]) => {
    const key = colorData.heritage;
    if (key) mapping[key] = hex;
  });
  return mapping;
}

export function getDisplayColorKey(hexValue: string): string {
  if (hexValue === "ERASE" || hexValue.length === 0 || hexValue === "?") {
    return hexValue;
  }
  const normalizedHex = hexValue.toUpperCase();
  return typedColorSystemMapping[normalizedHex]?.heritage ?? "?";
}

export function convertColorKeyToHex(displayKey: string): string {
  if (displayKey.startsWith("#") && displayKey.length === 7) {
    return displayKey.toUpperCase();
  }
  for (const [hex, mapping] of Object.entries(typedColorSystemMapping)) {
    if (mapping.heritage === displayKey) return hex;
  }
  return displayKey;
}

export function getColorKeyByHex(hexValue: string): string {
  return getDisplayColorKey(hexValue);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    if (max === r) h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
    if (max === g) h = ((b - r) / diff + 2) / 6;
    if (max === b) h = ((r - g) / diff + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function sortColorsByHue<T extends { color: string }>(colors: T[]): T[] {
  return colors.slice().sort((a, b) => {
    const hslA = hexToHsl(a.color);
    const hslB = hexToHsl(b.color);
    if (Math.abs(hslA.h - hslB.h) > 5) return hslA.h - hslB.h;
    if (Math.abs(hslA.l - hslB.l) > 3) return hslB.l - hslA.l;
    return hslB.s - hslA.s;
  });
}

export function getColorFamily(hex: string): ColorFamily {
  const hsl = hexToHsl(hex);
  const { h, s, l } = hsl;
  if (l < 15) return "黑色系";
  if (l > 85 && s < 20) return "白色系";
  if (s < 12 && l > 20) return "灰色系";
  if (h >= 0 && h < 15) return "红色系";
  if (h >= 15 && h < 40) return "橙色系";
  if (h >= 40 && h < 70) return "黄色系";
  if (h >= 70 && h < 165) return "绿色系";
  if (h >= 165 && h < 195) return "青色系";
  if (h >= 195 && h < 270) return "蓝色系";
  if (h >= 270 && h < 315) return "紫色系";
  if (h >= 315 && h < 345) return "粉色系";
  if (h >= 345 && h < 360) return "红色系";
  return "灰色系";
}

export function filterColorsByFamily<T extends { color: string }>(
  colors: T[],
  family: ColorFamily,
): T[] {
  if (family === "全部") return colors;
  return colors.filter((c) => getColorFamily(c.color) === family);
}

// 保留向后兼容的空函数签名
export function convertPaletteToColorSystem(palette: PaletteColor[]): PaletteColor[] {
  return palette.map((color) => ({
    ...color,
    key: getDisplayColorKey(color.hex),
  }));
}
