"use client";

import type { CulturePromptOptions } from "./promptBuilder";
import { getAspectRatio } from "@/data/aspectRatios";
import {
  PixelationMode,
  calculatePixelGrid,
  colorDistance,
  findClosestPaletteColor,
  hexToRgb,
  type MappedPixel,
  type PaletteColor,
  type RgbColor,
  type ImageFilter,
} from "./pixelation";
import { getDisplayColorKey, getHeritageToHexMapping } from "./colorSystemUtils";

export type BeadPattern = {
  grid: MappedPixel[][];
  width: number;
  height: number;
  palette: string[];
  source: "sample" | "ai" | "upload";
};

const fullPalette: PaletteColor[] = Object.entries(getHeritageToHexMapping())
  .map(([key, hex]) => {
    const rgb = hexToRgb(hex);
    return rgb ? { key, hex: hex.toUpperCase(), rgb } : null;
  })
  .filter((item): item is PaletteColor => Boolean(item));

const whiteFallback: PaletteColor =
  fullPalette.find((color) => color.hex === "#FFFFFF") ?? fullPalette[0];

const samplePaletteHints = ["#FFFFFF", "#1557A8", "#3677D2", "#CDE8FF", "#1C334D", "#EDB045"];

/**
 * 智能颜色合并：通过迭代合并最相似颜色来减少颜色数量，而非直接丢弃低频颜色。
 * 每次迭代找到最相似的两个颜色，将其中一个合并到另一个，从而最小化颜色失真。
 */
export function clampColorCount(grid: MappedPixel[][], maxColors: number, forcedHexColors: string[] = []): MappedPixel[][] {
  // 统计每种颜色的使用次数
  const colorCounts = new Map<string, number>();
  const colorCells = new Map<string, { key: string; color: string }>();

  grid.flat().forEach((cell) => {
    if (!cell || cell.isExternal) return;
    const key = cell.color.toUpperCase();
    colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
    colorCells.set(key, { key: cell.key, color: cell.color.toUpperCase() });
  });

  // 如果已有颜色数量 <= 上限，无需合并
  if (colorCounts.size <= maxColors) return grid;

  const forcedSet = new Set(forcedHexColors.map(c => c.toUpperCase()));

  // 使用 Map: hex -> { count, key, color }
  const paletteMap = new Map<string, { count: number; key: string; color: string }>();
  colorCounts.forEach((count, hex) => {
    const cell = colorCells.get(hex);
    if (cell) {
      paletteMap.set(hex, { count, key: cell.key, color: cell.color });
    }
  });

  // 迭代合并：每次合并最相似的两个非强制颜色
  while (paletteMap.size > maxColors) {
    let minDistance = Infinity;
    let mergeTarget: string | null = null;   // 保留的颜色
    let mergeSource: string | null = null;   // 被合并的颜色（合并到 target）

    const entries = Array.from(paletteMap.entries());

    for (let i = 0; i < entries.length; i++) {
      const [hexA, dataA] = entries[i];
      if (forcedSet.has(hexA)) continue; // 强制颜色不可被合并

      for (let j = i + 1; j < entries.length; j++) {
        const [hexB, dataB] = entries[j];
        if (forcedSet.has(hexB)) continue; // 强制颜色不可被合并

        const rgbA = hexToRgb(hexA);
        const rgbB = hexToRgb(hexB);
        if (!rgbA || !rgbB) continue;

        const dist = colorDistance(rgbA, rgbB);
        if (dist < minDistance) {
          minDistance = dist;
          // 保留出现次数更多的颜色，合并出现次数更少的
          if (dataA.count >= dataB.count) {
            mergeTarget = hexA;
            mergeSource = hexB;
          } else {
            mergeTarget = hexB;
            mergeSource = hexA;
          }
        }
      }
    }

    // 如果没有可合并的，跳出循环
    if (!mergeSource || !mergeTarget) break;

    // 合并：将 source 的计数加到 target
    const targetData = paletteMap.get(mergeTarget);
    const sourceData = paletteMap.get(mergeSource);
    if (targetData && sourceData) {
      targetData.count += sourceData.count;
      paletteMap.delete(mergeSource);
    }
  }

  // 构建最终的调色板
  const dominantPalette: PaletteColor[] = [];
  paletteMap.forEach((data, hex) => {
    const rgb = hexToRgb(hex);
    if (rgb) {
      dominantPalette.push({ key: data.key, hex, rgb });
    }
  });

  if (dominantPalette.length === 0) return grid;

  // 将网格中每个像素映射到最近的最终调色板颜色
  return grid.map((row) =>
    row.map((cell) => {
      if (!cell || cell.isExternal) return cell;
      const cellHex = cell.color.toUpperCase();
      // 如果颜色已在调色板中，保持原样
      if (dominantPalette.some((c) => c.hex === cellHex)) return cell;
      // 否则映射到最近的调色板颜色
      const rgb = hexToRgb(cellHex);
      if (!rgb) return cell;
      const closest = findClosestPaletteColor(rgb, dominantPalette);
      return { key: closest.key, color: closest.hex };
    }),
  );
}

/**
 * 判断一个颜色是否接近白色（RGB 每个通道都接近于 255）。
 * 只有当颜色是纯白或极接近白色时返回 true。
 */
function isNearWhite(hex: string, threshold = 30): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  return (255 - rgb.r) <= threshold && (255 - rgb.g) <= threshold && (255 - rgb.b) <= threshold;
}

/**
 * 标记图像轮廓外的白色/接近白色的区域为外部背景（isExternal = true）。
 * 从所有边界单元格出发，使用洪水填充（BFS），
 * 只将边界上白色或接近白色的连通区域标记为 isExternal。
 */
function markExternalBackground(
  grid: MappedPixel[][],
): MappedPixel[][] {
  const M = grid.length;
  if (M === 0) return grid;
  const N = grid[0].length;

  // 深拷贝 grid 并保留 isExternal 状态
  const result: MappedPixel[][] = grid.map((row) =>
    row.map((cell) => ({ ...cell, isExternal: cell.isExternal ?? false })),
  );

  const queue: { row: number; col: number }[] = [];

  // 从所有边界单元格开始检查
  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      const isBorder = row === 0 || row === M - 1 || col === 0 || col === N - 1;
      if (!isBorder) continue;

      const cell = result[row][col];
      if (!cell || cell.isExternal) continue;

      if (isNearWhite(cell.color)) {
        cell.isExternal = true;
        queue.push({ row, col });
      }
    }
  }

  // BFS 洪水填充：将所有与边界连通且为白色的连续区域标记为外部
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  let head = 0;
  while (head < queue.length) {
    const { row, col } = queue[head++];

    for (const [dr, dc] of directions) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= M || nc < 0 || nc >= N) continue;

      const neighbor = result[nr][nc];
      if (!neighbor || neighbor.isExternal) continue;

      if (isNearWhite(neighbor.color)) {
        neighbor.isExternal = true;
        queue.push({ row: nr, col: nc });
      }
    }
  }

  return result;
}

function fitForegroundToGrid(grid: MappedPixel[][]): MappedPixel[][] {
  const marked = markExternalBackground(grid);
  const height = marked.length;
  const width = marked[0]?.length ?? 0;
  if (!height || !width) return marked;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  marked.forEach((row, y) => row.forEach((cell, x) => {
    if (!cell.isExternal) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }));
  if (maxX < minX || maxY < minY) return marked;

  const sourceMinX = Math.max(0, minX - 1);
  const sourceMinY = Math.max(0, minY - 1);
  const sourceMaxX = Math.min(width - 1, maxX + 1);
  const sourceMaxY = Math.min(height - 1, maxY + 1);
  const sourceWidth = sourceMaxX - sourceMinX + 1;
  const sourceHeight = sourceMaxY - sourceMinY + 1;
  const scale = Math.min((width - 2) / sourceWidth, (height - 2) / sourceHeight);
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  const offsetX = Math.floor((width - targetWidth) / 2);
  const offsetY = Math.floor((height - targetHeight) / 2);
  const result: MappedPixel[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ ...whiteFallback, color: whiteFallback.hex, isExternal: true })),
  );

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = sourceMinX + Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / targetWidth));
      const sourceY = sourceMinY + Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / targetHeight));
      result[offsetY + y][offsetX + x] = { ...marked[sourceY][sourceX] };
    }
  }
  return markExternalBackground(result);
}

const ORTHOGONAL_DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
const ALL_DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
] as const;

function cloneGrid(grid: MappedPixel[][]): MappedPixel[][] {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

function findNearestForegroundCell(
  grid: MappedPixel[][],
  row: number,
  col: number,
): MappedPixel | null {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const visited = new Set<string>([`${row},${col}`]);
  const queue: { row: number; col: number }[] = [{ row, col }];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    for (const [dr, dc] of ALL_DIRECTIONS) {
      const nr = current.row + dr;
      const nc = current.col + dc;
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const cell = grid[nr][nc];
      if (cell && !cell.isExternal) return cell;
      queue.push({ row: nr, col: nc });
    }
  }

  return null;
}

function closeNarrowForegroundGaps(grid: MappedPixel[][]): MappedPixel[][] {
  const height = grid.length;
  if (height === 0) return grid;
  const width = grid[0].length;
  const foreground = grid.map((row) => row.map((cell) => Boolean(cell && !cell.isExternal)));

  const dilated: boolean[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!foreground[row][col]) continue;
      dilated[row][col] = true;
      for (const [dr, dc] of ALL_DIRECTIONS) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
          dilated[nr][nc] = true;
        }
      }
    }
  }

  const closed: boolean[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (foreground[row][col]) {
        closed[row][col] = true;
        continue;
      }

      let keep = true;
      for (const [dr, dc] of ALL_DIRECTIONS) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= height || nc < 0 || nc >= width || !dilated[nr][nc]) {
          keep = false;
          break;
        }
      }
      closed[row][col] = keep;
    }
  }

  const result = cloneGrid(grid);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (foreground[row][col] || !closed[row][col]) continue;
      const nearest = findNearestForegroundCell(grid, row, col);
      if (nearest) {
        result[row][col] = { ...nearest, isExternal: false };
      }
    }
  }

  return result;
}

/**
 * 连接孤立色块到主体。
 * 找出所有非外部背景的连通区域，将面积小于 `minArea` 的孤立区域
 * 通过填充其边缘轮廓颜色连接到最近的主体区域。
 * @param grid 像素网格
 * @param minArea 最小面积阈值，小于此面积的区域被视为"孤立"（默认 8）
 */
export function connectIslands(
  grid: MappedPixel[][],
  minArea = 8,
): MappedPixel[][] {
  const result = closeNarrowForegroundGaps(grid);
  const M = result.length;
  if (M === 0) return result;
  const N = result[0].length;

  // 1. 找出所有非外部单元格的连通区域
  const visited: boolean[][] = Array.from({ length: M }, () =>
    Array.from({ length: N }, () => false),
  );

  const components: {
    cells: { row: number; col: number }[];
    edgeCells: { row: number; col: number }[];
    dominantCell?: MappedPixel;
  }[] = [];

  for (let r = 0; r < M; r++) {
    for (let c = 0; c < N; c++) {
      const cell = result[r][c];
      if (!cell || cell.isExternal || visited[r][c]) continue;

      // BFS 找连通区域
      const componentCells: { row: number; col: number }[] = [];
      const edgeCells: { row: number; col: number }[] = [];
      const colorCount = new Map<string, { count: number; cell: MappedPixel }>();
      const queue: { row: number; col: number }[] = [{ row: r, col: c }];
      visited[r][c] = true;
      let head = 0;

      while (head < queue.length) {
        const curr = queue[head++];
        componentCells.push(curr);
        const currCell = result[curr.row][curr.col];
        const currentCount = colorCount.get(currCell.color);
        colorCount.set(currCell.color, {
          count: (currentCount?.count ?? 0) + 1,
          cell: currCell,
        });

        // 检查是否有外部背景相邻（边缘像素）
        let isEdge = false;
        for (const [dr, dc] of ORTHOGONAL_DIRECTIONS) {
          const nr = curr.row + dr;
          const nc = curr.col + dc;
          if (nr < 0 || nr >= M || nc < 0 || nc >= N) {
            isEdge = true;
            continue;
          }
          const neighbor = result[nr][nc];
          if (neighbor && neighbor.isExternal) {
            isEdge = true;
          }
          if (neighbor && !neighbor.isExternal && !visited[nr][nc]) {
            visited[nr][nc] = true;
            queue.push({ row: nr, col: nc });
          }
        }
        if (isEdge) {
          edgeCells.push(curr);
        }
      }

      const dominantCell = Array.from(colorCount.values()).sort((a, b) => b.count - a.count)[0]?.cell;
      components.push({ cells: componentCells, edgeCells, dominantCell });
    }
  }

  // 如果没有组件或只有 1 个组件，无需连接
  if (components.length <= 1) return result;

  // 2. 按面积排序，面积足够的区域都可以作为连接目标。
  components.sort((a, b) => b.cells.length - a.cells.length);
  const stableComponents = components.filter((component) => component.cells.length >= minArea);
  if (stableComponents.length === 0) return result;

  // 3. 将小孤岛连接到最近的稳定组件，保持局部轮廓而不是全部拉向最大组件。
  for (let i = 0; i < components.length; i++) {
    const island = components[i];
    if (island.cells.length >= minArea) continue; // 大区域不处理

    let nearestPair: {
      from: { row: number; col: number };
      to: { row: number; col: number };
      distance: number;
    } | null = null;

    for (const target of stableComponents) {
      if (target === island) continue;
      for (const from of island.edgeCells.length ? island.edgeCells : island.cells) {
        for (const to of target.edgeCells.length ? target.edgeCells : target.cells) {
          const distance = Math.abs(from.row - to.row) + Math.abs(from.col - to.col);
          if (!nearestPair || distance < nearestPair.distance) {
            nearestPair = { from, to, distance };
          }
        }
      }
    }

    if (!nearestPair || nearestPair.distance <= 1) continue;
    const fillColor = island.dominantCell ?? result[nearestPair.from.row][nearestPair.from.col];
    const path: { row: number; col: number }[] = [];
    let row = nearestPair.from.row;
    let col = nearestPair.from.col;

    while (col !== nearestPair.to.col) {
      col += col < nearestPair.to.col ? 1 : -1;
      path.push({ row, col });
    }
    while (row !== nearestPair.to.row) {
      row += row < nearestPair.to.row ? 1 : -1;
      path.push({ row, col });
    }

    for (const p of path.slice(0, -1)) {
      if (result[p.row][p.col]?.isExternal) {
        result[p.row][p.col] = { ...fillColor, isExternal: false };
      }
    }
  }

  return result;
}

function removeSingleCellNoise(grid: MappedPixel[][]): MappedPixel[][] {
  return grid.map((row, y) =>
    row.map((cell, x) => {
      if (!cell || cell.isExternal) return cell;
      const neighbors: MappedPixel[] = [];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const next = grid[y + dy]?.[x + dx];
          if (next && !next.isExternal) neighbors.push(next);
        }
      }
      const same = neighbors.filter((next) => next.color === cell.color).length;
      if (same >= 2 || neighbors.length < 3) return cell;

      const neighborCounts = new Map<string, { count: number; cell: MappedPixel }>();
      neighbors.forEach((next) => {
        const current = neighborCounts.get(next.color);
        neighborCounts.set(next.color, { count: (current?.count ?? 0) + 1, cell: next });
      });
      const replacement = Array.from(neighborCounts.values()).sort((a, b) => b.count - a.count)[0];
      return replacement?.count >= 3 ? { ...replacement.cell } : cell;
    }),
  );
}

function drawThemeSample(
  ctx: CanvasRenderingContext2D,
  options: CulturePromptOptions,
): void {
  const size = options.gridSize;
  const center = (size - 1) / 2;
  const colors = samplePaletteHints;

  ctx.fillStyle = colors[0] ?? "#FFFFFF";
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const radius = Math.sqrt(dx * dx + dy * dy) / (size / 2);
      const angle = Math.atan2(dy, dx);
      let color = colors[0];

      if (radius > 0.72 && radius < 0.92) color = colors[1];
      if (Math.sin(angle * 5 + radius * 8) > 0.46 && radius < 0.78) color = colors[2];
      if (Math.cos(angle * 3) > 0.62 && radius < 0.56) color = colors[3];
      if (ax < size * 0.04 || ay < size * 0.04) color = colors[4];
      if (radius < 0.14) color = colors[5];

      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/**
 * 渲染内置样例的设计原图（前色板映射的原始主题设计），返回 data URL。
 * 用于展示第 1 张"设计原图"。
 */
export function renderSampleDesignOriginal(options: CulturePromptOptions): string {
  const gridSize = options.gridSize;
  const cell = Math.max(8, Math.floor(640 / gridSize));
  const canvas = document.createElement("canvas");
  canvas.width = gridSize * cell;
  canvas.height = gridSize * cell;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  // Temp canvas at grid resolution
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = gridSize;
  tempCanvas.height = gridSize;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) throw new Error("Canvas is not available");
  drawThemeSample(tempCtx, options);
  // Scale up with crisp pixel rendering
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

type PatternOptions = {
  antiAlias: boolean;
  connectIslands?: boolean;
};

export function generateSamplePattern(
  options: CulturePromptOptions & PatternOptions,
  forcedHexColors: string[] = [],
  filter?: ImageFilter,
): BeadPattern {
  const canvas = document.createElement("canvas");
  canvas.width = options.gridSize;
  canvas.height = options.gridSize;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Canvas is not available");

  drawThemeSample(ctx, options);
  const palette = fullPalette;
  const grid = calculatePixelGrid(
    ctx,
    canvas.width,
    canvas.height,
    options.gridSize,
    options.gridSize,
    palette,
    PixelationMode.Dominant,
    whiteFallback,
    filter,
  );

  const limited = clampColorCount(grid, options.colorCount, forcedHexColors);
  const denoised = options.antiAlias ? removeSingleCellNoise(limited) : limited;
  const cleaned = markExternalBackground(denoised);
  const connected = options.connectIslands ? connectIslands(cleaned) : cleaned;

  return {
    grid: connected,
    width: options.gridSize,
    height: options.gridSize,
    palette: Array.from(new Set(connected.flat().map((cell) => cell.color))).sort(),
    source: "sample",
  };
}

export async function imageDataUrlToPattern(
  imageUrl: string,
  options: CulturePromptOptions & { antiAlias: boolean; source: "ai" | "upload"; preserveSourceRatio?: boolean; connectIslands?: boolean; preserveAllDetails?: boolean; fitForeground?: boolean },
  forcedHexColors: string[] = [],
  filter?: ImageFilter,
): Promise<BeadPattern> {
  const image = new Image();
  image.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = imageUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const ratio = getAspectRatio(options.aspectRatio ?? "1:1");
  const gridWidth = options.gridWidth ?? options.gridSize;
  const gridHeight =
    options.preserveSourceRatio
      ? Math.max(1, Math.round(gridWidth * (canvas.height / canvas.width)))
      : options.gridHeight ?? Math.max(1, Math.round(gridWidth * (ratio.height / ratio.width)));

  const palette = fullPalette;
  const grid = calculatePixelGrid(
    ctx,
    canvas.width,
    canvas.height,
    gridWidth,
    gridHeight,
    palette,
    PixelationMode.Dominant,
    whiteFallback,
    filter,
  );
  const fitted = options.fitForeground ? fitForegroundToGrid(grid) : grid;
  const limited = options.preserveAllDetails ? fitted : clampColorCount(fitted, options.colorCount, forcedHexColors);
  const denoised = options.preserveAllDetails ? limited : options.antiAlias ? removeSingleCellNoise(limited) : limited;
  const cleaned = options.preserveAllDetails ? denoised : markExternalBackground(denoised);
  const connected = options.preserveAllDetails ? cleaned : options.connectIslands ? connectIslands(cleaned) : cleaned;

  return {
    grid: connected,
    width: gridWidth,
    height: gridHeight,
    palette: Array.from(new Set(connected.flat().map((cell) => cell.color))).sort((a: string, b: string) => {
      const rgbA = hexToRgb(a) as RgbColor;
      const rgbB = hexToRgb(b) as RgbColor;
      return colorDistance(rgbA, { r: 255, g: 255, b: 255 }) - colorDistance(rgbB, { r: 255, g: 255, b: 255 });
    }),
    source: options.source,
  };
}

/** 获取与背景色形成对比的文本颜色 */
function getContrastColor(hexColor: string): string {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return '#000000';
  const luma = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  return luma > 140 ? '#000000' : '#FFFFFF';
}

/** 在 canvas 上绘制拼豆网格（带行列号和色号），用于前端展示 */
export function renderPatternToCanvas(
  canvas: HTMLCanvasElement,
  pattern: BeadPattern,
  showGrid: boolean,
  highlightedColor?: string | null,
): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 提高分辨率：从 640 提升到 2000，确保拼豆图纸清晰显示
    const cell = Math.max(12, Math.floor(2000 / Math.max(pattern.width, pattern.height)));

    // 行列号相关尺寸
    const labelWidth = 32;
    const labelHeight = 20;
    const fontSize = Math.max(9, Math.min(13, Math.floor(cell * 0.26)));

    // 总画布尺寸 = 标签边距 + 网格区域
    const gridPixelWidth = pattern.width * cell;
    const gridPixelHeight = pattern.height * cell;
    canvas.width = labelWidth + gridPixelWidth;
    canvas.height = labelHeight + gridPixelHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 色号文字的大小：根据格子大小自适应，最小 7px，最大 14px
    const keyFontSize = Math.max(7, Math.min(14, Math.floor(cell * 0.3)));

    // 绘制网格区域（每个格子包含颜色填充、边框和色号文字）
    pattern.grid.forEach((row, y) => {
      row.forEach((pixel, x) => {
        const px = labelWidth + x * cell;
        const py = labelHeight + y * cell;
        ctx.fillStyle = pixel.isExternal ? "#ffffff" : pixel.color;
        ctx.fillRect(px, py, cell, cell);

        if (!pixel.isExternal && highlightedColor && pixel.color.toUpperCase() !== highlightedColor.toUpperCase()) {
          ctx.fillStyle = "rgba(255, 251, 245, 0.68)";
          ctx.fillRect(px, py, cell, cell);
        }
        
        // 在非外部背景的格子里显示色号
        if (!pixel.isExternal && cell >= 10) {
          ctx.fillStyle = getContrastColor(pixel.color);
          ctx.font = `bold ${keyFontSize}px monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(getDisplayColorKey(pixel.color), px + cell / 2, py + cell / 2);
        }

        if (showGrid) {
          ctx.strokeStyle = "rgba(17, 24, 39, 0.18)";
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, cell, cell);
        }
      });
    });

    // 绘制顶部列号（1 ~ width）
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, 0, canvas.width, labelHeight);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, canvas.width, labelHeight);

    ctx.fillStyle = "#475569";
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let x = 0; x < pattern.width; x++) {
      const cx = labelWidth + x * cell + cell / 2;
      ctx.fillText(String(x + 1), cx, labelHeight / 2);
    }

    // 绘制左侧行号（1 ~ height）
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, labelHeight, labelWidth, gridPixelHeight);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(labelWidth, labelHeight);
    ctx.lineTo(labelWidth, canvas.height);
    ctx.stroke();

    ctx.fillStyle = "#475569";
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let y = 0; y < pattern.height; y++) {
      const cy = labelHeight + y * cell + cell / 2;
      ctx.fillText(String(y + 1), labelWidth / 2, cy);
    }
  }

/** 在 canvas 上绘制拼豆网格（不带行列号），用于导出或场景预览参考图 */
export function renderPatternToCanvasClean(
  canvas: HTMLCanvasElement,
  pattern: BeadPattern,
  showGrid: boolean,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // 同样提高分辨率以确保场景预览参考图清晰
  const cell = Math.max(12, Math.floor(2000 / Math.max(pattern.width, pattern.height)));
  canvas.width = pattern.width * cell;
  canvas.height = pattern.height * cell;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  pattern.grid.forEach((row, y) => {
    row.forEach((pixel, x) => {
      ctx.fillStyle = pixel.isExternal ? "#ffffff" : pixel.color;
      ctx.fillRect(x * cell, y * cell, cell, cell);
      if (showGrid) {
        ctx.strokeStyle = "rgba(17, 24, 39, 0.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x * cell + 0.5, y * cell + 0.5, cell, cell);
      }
    });
  });
}
