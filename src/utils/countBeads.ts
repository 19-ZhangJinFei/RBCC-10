import { getColorKeyByHex } from "./colorSystemUtils";
import type { MappedPixel } from "./pixelation";

export type BeadCount = {
  colorName: string;
  brandCode: string;
  rgb: string;
  count: number;
  ratio: number;
  usage: string;
};

function inferUsage(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  if (max < 55) return "轮廓";
  if (min > 225) return "留白";
  if (max - min < 28) return "过渡";
  if (b > r && b > g) return "主纹样";
  if (r > g && r > b) return "强调";
  if (g > r && g > b) return "装饰";
  return "填充";
}

export function countBeads(grid: MappedPixel[][]): BeadCount[] {
  const map = new Map<string, number>();
  let total = 0;

  grid.flat().forEach((cell) => {
    if (!cell || cell.isExternal || !cell.color || cell.color === "transparent") return;
    const key = cell.color.toUpperCase();
    map.set(key, (map.get(key) ?? 0) + 1);
    total += 1;
  });

  return Array.from(map.entries())
    .map(([hex, count]) => ({
      colorName: getColorKeyByHex(hex),
      brandCode: getColorKeyByHex(hex),
      rgb: hex,
      count,
      ratio: total === 0 ? 0 : count / total,
      usage: inferUsage(hex),
    }))
    .sort((a, b) => b.count - a.count);
}
