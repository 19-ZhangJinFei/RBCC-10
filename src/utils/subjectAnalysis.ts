"use client";

import type { RgbColor } from "./pixelation";

export type SubjectColor = {
  hex: string;
  ratio: number;
  count: number;
};

export type SubjectAnalysis = {
  subjectImageUrl: string;
  colors: SubjectColor[];
  colorSummary: string;
  bounds: { x: number; y: number; width: number; height: number };
};

type LabPoint = {
  l: number;
  a: number;
  b: number;
};

function rgbToHex(rgb: RgbColor): string {
  const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

function srgbToLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function rgbToLab(rgb: RgbColor): LabPoint {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  let x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  let y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 1.00000;
  let z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;

  const pivot = (value: number) => value > 0.008856 ? Math.cbrt(value) : (7.787 * value) + (16 / 116);
  x = pivot(x);
  y = pivot(y);
  z = pivot(z);

  return {
    l: (116 * y) - 16,
    a: 500 * (x - y),
    b: 200 * (y - z),
  };
}

function labDistance(a: LabPoint, b: LabPoint): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

function colorDistance(a: RgbColor, b: RgbColor): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function otsuThreshold(values: number[]): number {
  if (values.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (min === max) return min;

  const bins = 256;
  const histogram = Array.from({ length: bins }, () => 0);
  for (const value of values) {
    const index = Math.max(0, Math.min(bins - 1, Math.floor(((value - min) / (max - min)) * (bins - 1))));
    histogram[index] += 1;
  }

  const total = values.length;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * histogram[i];

  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = -1;
  let bestIndex = 0;

  for (let i = 0; i < bins; i++) {
    weightBackground += histogram[i];
    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += i * histogram[i];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestIndex = i;
    }
  }

  return min + ((bestIndex + 0.5) / bins) * (max - min);
}

function buildPalette(samples: RgbColor[], targetCount: number): RgbColor[] {
  if (samples.length === 0) return [];
  const unique = Array.from(new Map(samples.map((sample) => [rgbToHex(sample), sample])).values());
  const k = Math.min(targetCount, unique.length);
  const centers: RgbColor[] = [];

  centers.push(unique[0]);
  while (centers.length < k) {
    let farthest = unique[0];
    let farthestDistance = -1;
    for (const sample of unique) {
      const distance = Math.min(...centers.map((center) => colorDistance(sample, center)));
      if (distance > farthestDistance) {
        farthest = sample;
        farthestDistance = distance;
      }
    }
    centers.push(farthest);
  }

  for (let iteration = 0; iteration < 8; iteration++) {
    const groups = centers.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (const sample of samples) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      centers.forEach((center, index) => {
        const distance = colorDistance(sample, center);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      const group = groups[bestIndex];
      group.r += sample.r;
      group.g += sample.g;
      group.b += sample.b;
      group.count += 1;
    }

    groups.forEach((group, index) => {
      if (group.count > 0) {
        centers[index] = {
          r: group.r / group.count,
          g: group.g / group.count,
          b: group.b / group.count,
        };
      }
    });
  }

  return centers;
}

function getPixel(data: Uint8ClampedArray, width: number, x: number, y: number): RgbColor {
  const index = (y * width + x) * 4;
  return { r: data[index], g: data[index + 1], b: data[index + 2] };
}

function hasAlphaMask(data: Uint8ClampedArray): boolean {
  let transparentCount = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 245) transparentCount += 1;
  }
  return transparentCount > data.length / 4 * 0.005;
}

function buildForegroundMask(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  if (hasAlphaMask(data)) {
    const mask = new Uint8Array(width * height);
    for (let index = 0; index < width * height; index++) {
      mask[index] = data[index * 4 + 3] >= 32 ? 1 : 0;
    }
    return mask;
  }

  const borderSamples: RgbColor[] = [];
  for (let x = 0; x < width; x++) {
    borderSamples.push(getPixel(data, width, x, 0), getPixel(data, width, x, height - 1));
  }
  for (let y = 1; y < height - 1; y++) {
    borderSamples.push(getPixel(data, width, 0, y), getPixel(data, width, width - 1, y));
  }

  const backgroundPalette = buildPalette(borderSamples, 5);
  const backgroundLabs = backgroundPalette.map(rgbToLab);
  const distances = new Float32Array(width * height);
  const values: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const lab = rgbToLab(getPixel(data, width, x, y));
      const distance = Math.min(...backgroundLabs.map((background) => labDistance(lab, background)));
      distances[index] = distance;
      values.push(distance);
    }
  }

  const threshold = otsuThreshold(values);
  const external = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (x: number, y: number) => {
    const index = y * width + x;
    if (external[index] || distances[index] > threshold) return;
    external[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  let head = 0;
  while (head < queue.length) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }

  const foreground = new Uint8Array(width * height);
  for (let index = 0; index < foreground.length; index++) {
    foreground[index] = external[index] ? 0 : 1;
  }
  return foreground;
}

function largestComponent(mask: Uint8Array, width: number, height: number): Uint8Array {
  const visited = new Uint8Array(width * height);
  let best: number[] = [];

  for (let index = 0; index < width * height; index++) {
    if (!mask[index] || visited[index]) continue;
    const queue = [index];
    const component: number[] = [];
    visited[index] = 1;
    let head = 0;

    while (head < queue.length) {
      const current = queue[head++];
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1,
      ];
      for (const next of neighbors) {
        if (next >= 0 && mask[next] && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }

    if (component.length > best.length) best = component;
  }

  const result = new Uint8Array(width * height);
  for (const index of best) result[index] = 1;
  return result;
}

function calculateBounds(mask: Uint8Array, width: number, height: number): SubjectAnalysis["bounds"] {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width, height };
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function summarizeColors(data: Uint8ClampedArray, mask: Uint8Array, width: number): SubjectColor[] {
  const samples: RgbColor[] = [];
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    const dataIndex = index * 4;
    const alpha = data[dataIndex + 3] / 255;
    if (alpha <= 0) continue;
    samples.push({
      r: data[dataIndex],
      g: data[dataIndex + 1],
      b: data[dataIndex + 2],
    });
  }

  const centers = buildPalette(samples, 6);
  const counts = centers.map((center) => ({ center, count: 0 }));
  for (const sample of samples) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    centers.forEach((center, index) => {
      const distance = colorDistance(sample, center);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    counts[bestIndex].count += 1;
  }

  const total = samples.length || width;
  return counts
    .filter((item) => item.count > 0)
    .map((item) => ({
      hex: rgbToHex(item.center),
      ratio: item.count / total,
      count: item.count,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function analyzeSubjectImage(imageUrl: string): Promise<SubjectAnalysis> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("图片加载失败，无法分析主体颜色。"));
    image.src = imageUrl;
  });

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, 1024 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(image, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const mask = largestComponent(buildForegroundMask(imageData.data, width, height), width, height);
  const bounds = calculateBounds(mask, width, height);
  const colors = summarizeColors(imageData.data, mask, width);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = bounds.width;
  outputCanvas.height = bounds.height;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) throw new Error("Canvas is not available");
  const output = outputCtx.createImageData(bounds.width, bounds.height);

  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      const sourceX = bounds.x + x;
      const sourceY = bounds.y + y;
      const sourceIndex = sourceY * width + sourceX;
      const sourceDataIndex = sourceIndex * 4;
      const targetDataIndex = (y * bounds.width + x) * 4;
      output.data[targetDataIndex] = imageData.data[sourceDataIndex];
      output.data[targetDataIndex + 1] = imageData.data[sourceDataIndex + 1];
      output.data[targetDataIndex + 2] = imageData.data[sourceDataIndex + 2];
      output.data[targetDataIndex + 3] = mask[sourceIndex] ? imageData.data[sourceDataIndex + 3] : 0;
    }
  }
  outputCtx.putImageData(output, 0, 0);

  const colorSummary = colors
    .map((color, index) => `${index + 1}. ${color.hex} ${(color.ratio * 100).toFixed(1)}%`)
    .join("\n");

  return {
    subjectImageUrl: outputCanvas.toDataURL("image/png"),
    colors,
    colorSummary,
    bounds,
  };
}
