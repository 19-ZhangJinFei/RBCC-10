// 难度分级：把一张图纸「智能简化」成 L1–L5 五个难度版本。
// 不是简单调滑杆——而是：感知减色 + 结构保持的区域合并 + 可拼性净化。
// 复用：clampColorCount（Oklab 感知减色）、floodFill 连通域、colorDistance（Oklab 距离）。

import { colorDistance, hexToRgb, type MappedPixel } from "./pixelation";
import { clampColorCount } from "./culturePattern";
import { getAllConnectedRegions } from "./floodFillUtils";

export type LevelSpec = {
  level: number;
  label: string;
  targetGrid: number; // 目标网格边长：越小 = 豆越少 = 越好拼（用于降采样）
  maxColors: number; // 色号上限（天花板，不是必用）
  minRegionSize: number; // 小于该格数的连通块会被并入邻近色块（0/1 = 不合并）
};

// 难度越低：网格越小、色号越少、碎块合并越狠（好拼）；越高：保留更多细节。
export const LEVEL_SPECS: LevelSpec[] = [
  { level: 1, label: "入门", targetGrid: 12, maxColors: 5, minRegionSize: 3 },
  { level: 2, label: "简单", targetGrid: 18, maxColors: 10, minRegionSize: 2 },
  { level: 3, label: "标准", targetGrid: 28, maxColors: 18, minRegionSize: 2 },
  { level: 4, label: "进阶", targetGrid: 44, maxColors: 40, minRegionSize: 1 },
  { level: 5, label: "挑战", targetGrid: 9999, maxColors: 128, minRegionSize: 0 },
];

export type DifficultyStats = {
  beadCount: number; // 总豆数
  colorKinds: number; // 色号种类数
  isolatedCount: number; // 碎块数（<3 格的连通块），越少越好拼
};

// 只有实心色格（#开头、非外部背景）才算数
function isSolid(cell: MappedPixel | null | undefined): cell is MappedPixel {
  return Boolean(cell && !cell.isExternal && typeof cell.color === "string" && cell.color.startsWith("#"));
}

function normalize(grid: MappedPixel[][]): MappedPixel[][] {
  return grid.map((row) => row.map((cell) => (cell && cell.color ? { ...cell, color: cell.color.toUpperCase() } : cell)));
}

function distinctColors(grid: MappedPixel[][]): string[] {
  const set = new Set<string>();
  grid.flat().forEach((cell) => {
    if (isSolid(cell)) set.add(cell.color.toUpperCase());
  });
  return Array.from(set);
}

/** 度量一张图纸的难度指标（都是算出来的，不是预设）。 */
export function computeDifficultyStats(grid: MappedPixel[][]): DifficultyStats {
  const norm = normalize(grid);
  const colors = distinctColors(norm);
  let beadCount = 0;
  norm.flat().forEach((cell) => {
    if (isSolid(cell)) beadCount += 1;
  });
  let isolatedCount = 0;
  for (const color of colors) {
    for (const region of getAllConnectedRegions(norm, color)) {
      if (region.length < 3) isolatedCount += 1;
    }
  }
  return { beadCount, colorKinds: colors.length, isolatedCount };
}

/**
 * 结构保持的区域合并（核心新增算法）：
 * 找出小于 minRegionSize 的连通块，把它并入「颜色最接近的相邻色块」，
 * 从而去掉零碎小点、放大色块，但主体大色块（≥阈值）保持不动 → 简化而不毁图。
 */
export function mergeSmallRegions(grid: MappedPixel[][], minRegionSize: number): MappedPixel[][] {
  if (minRegionSize <= 1) return grid; // 不需要合并
  let work = normalize(grid).map((row) => row.map((cell) => (cell ? { ...cell } : cell)));
  const M = work.length;
  const N = work[0]?.length ?? 0;

  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    const colors = distinctColors(work);
    for (const color of colors) {
      const regions = getAllConnectedRegions(work, color);
      for (const region of regions) {
        if (region.length >= minRegionSize) continue; // 大色块保留，只并小碎块
        // 统计相邻的其它颜色
        const neighbors = new Map<string, { count: number; key: string }>();
        for (const { row, col } of region) {
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr < 0 || nr >= M || nc < 0 || nc >= N) continue;
            const nb = work[nr][nc];
            if (!isSolid(nb)) continue;
            const nColor = nb.color.toUpperCase();
            if (nColor === color) continue;
            const e = neighbors.get(nColor) ?? { count: 0, key: nb.key };
            e.count += 1;
            neighbors.set(nColor, e);
          }
        }
        if (neighbors.size === 0) continue;
        // 选并入目标：颜色最接近优先（保观感），相邻越多略加分
        const regionRgb = hexToRgb(color);
        let best: { color: string; key: string } | null = null;
        let bestScore = Infinity;
        neighbors.forEach((e, nColor) => {
          const nRgb = hexToRgb(nColor);
          const dist = regionRgb && nRgb ? colorDistance(regionRgb, nRgb) : Infinity;
          const score = dist - e.count * 0.001; // 主要看颜色接近度，相邻多的略优先
          if (score < bestScore) {
            bestScore = score;
            best = { color: nColor, key: e.key };
          }
        });
        if (!best) continue;
        const target = best as { color: string; key: string };
        for (const { row, col } of region) {
          work[row][col] = { ...work[row][col], color: target.color, key: target.key };
        }
        changed = true;
      }
    }
    if (!changed) break;
  }
  return work;
}

/** 按整数倍降采样网格（取每块中心格）：网格变小 → 豆数变少 → 更好拼。 */
export function downsampleGrid(grid: MappedPixel[][], factor: number): MappedPixel[][] {
  if (factor <= 1) return grid;
  const M = grid.length;
  const N = grid[0]?.length ?? 0;
  const outM = Math.max(1, Math.ceil(M / factor));
  const outN = Math.max(1, Math.ceil(N / factor));
  const half = Math.floor(factor / 2);
  const out: MappedPixel[][] = [];
  for (let oi = 0; oi < outM; oi++) {
    const row: MappedPixel[] = [];
    for (let oj = 0; oj < outN; oj++) {
      const si = Math.min(oi * factor + half, M - 1);
      const sj = Math.min(oj * factor + half, N - 1);
      const cell = grid[si]?.[sj];
      row.push(cell ? { ...cell } : { key: "", color: "#FFFFFF", isExternal: true });
    }
    out.push(row);
  }
  return out;
}

export type SimplifyResult = {
  grid: MappedPixel[][];
  width: number;
  height: number;
  palette: string[];
  stats: DifficultyStats;
  spec: LevelSpec;
};

/**
 * 把一张图纸简化到指定难度档：先降采样（缩网格/减豆），再感知减色，再结构保持地合并碎块。
 * 同一张原图传不同 level，即可得到 L1–L5 一整条难度阶梯（任何图都能拉开差距）。
 */
export function simplifyToLevel(grid: MappedPixel[][], level: number): SimplifyResult {
  const spec = LEVEL_SPECS.find((s) => s.level === level) ?? LEVEL_SPECS[2];
  const curMax = Math.max(grid.length, grid[0]?.length ?? 0);
  const factor = Math.max(1, Math.round(curMax / spec.targetGrid));
  let g = downsampleGrid(grid, factor); // ① 降采样：网格变小、豆变少
  g = clampColorCount(g, spec.maxColors); // ② 感知减色（合并最相似色）
  g = mergeSmallRegions(g, spec.minRegionSize); // ③ 结构保持的区域合并（去碎块）
  return {
    grid: g,
    width: g[0]?.length ?? 0,
    height: g.length,
    palette: distinctColors(g),
    stats: computeDifficultyStats(g),
    spec,
  };
}
