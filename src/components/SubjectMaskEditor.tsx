"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeSubjectMask,
  createSubjectMask,
  type SubjectAnalysis,
  type SubjectMask,
} from "@/utils/subjectAnalysis";

export type MaskMode = "select" | "add" | "subtract" | "box";
type MaskPoint = { x: number; y: number };
type SelectionBox = { start: MaskPoint; end: MaskPoint };

type Props = {
  imageUrl: string | null;
  loading?: boolean;
  autoDetect?: boolean;
  showHeader?: boolean;
  mode?: MaskMode;
  savedMask?: SubjectMask | null;
  onSubjectChange: (analysis: SubjectAnalysis) => void;
  onModeChange?: (mode: MaskMode) => void;
  onMaskSnapshotChange?: (mask: SubjectMask | null) => void;
};

const BRUSH_SIZES = [8, 16, 24, 36, 48];
const MIN_BOX_SIZE = 4;

function rgbDistance(data: Uint8ClampedArray, a: number, b: number): number {
  const ai = a * 4;
  const bi = b * 4;
  return Math.hypot(
    data[ai] - data[bi],
    data[ai + 1] - data[bi + 1],
    data[ai + 2] - data[bi + 2],
  );
}

function cloneSubjectMask(mask: SubjectMask): SubjectMask {
  return {
    imageData: mask.imageData,
    mask: new Uint8Array(mask.mask),
    width: mask.width,
    height: mask.height,
  };
}

function otsu(values: number[]): number {
  if (values.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (min === max) return min;
  const bins = 128;
  const histogram = Array.from({ length: bins }, () => 0);
  for (const value of values) {
    const index = Math.max(0, Math.min(bins - 1, Math.floor(((value - min) / (max - min)) * (bins - 1))));
    histogram[index] += 1;
  }
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * histogram[i];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let bestIndex = 0;
  for (let i = 0; i < bins; i++) {
    backgroundWeight += histogram[i];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = total - backgroundWeight;
    if (foregroundWeight === 0) break;
    backgroundSum += i * histogram[i];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestIndex = i;
    }
  }
  return min + ((bestIndex + 0.5) / bins) * (max - min);
}

function buildPaletteFromIndices(data: Uint8ClampedArray, indices: number[], targetCount: number): number[] {
  if (indices.length === 0) return [];
  const stride = Math.max(1, Math.floor(indices.length / 512));
  const samples: number[] = [];
  for (let i = 0; i < indices.length; i += stride) samples.push(indices[i]);
  const centers = [samples[0]];
  while (centers.length < Math.min(targetCount, samples.length)) {
    let farthest = samples[0];
    let farthestDistance = -1;
    for (const sample of samples) {
      const distance = Math.min(...centers.map((center) => rgbDistance(data, sample, center)));
      if (distance > farthestDistance) {
        farthest = sample;
        farthestDistance = distance;
      }
    }
    centers.push(farthest);
  }
  return centers;
}

function largestComponentWithin(mask: Uint8Array, width: number, height: number): number[] {
  const visited = new Uint8Array(width * height);
  let best: number[] = [];
  for (let index = 0; index < mask.length; index++) {
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
  return best;
}

export default function SubjectMaskEditor({
  imageUrl,
  loading,
  autoDetect = true,
  showHeader = true,
  mode,
  savedMask,
  onSubjectChange,
  onModeChange,
  onMaskSnapshotChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<SubjectMask | null>(null);
  const savedMaskRef = useRef<SubjectMask | null>(savedMask ?? null);
  const isDrawingRef = useRef(false);
  const selectionBoxRef = useRef<SelectionBox | null>(null);
  const [internalMode, setInternalMode] = useState<MaskMode>("select");
  const [brushSize, setBrushSize] = useState(16);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [analysis, setAnalysis] = useState<SubjectAnalysis | null>(null);
  const activeMode = mode ?? internalMode;
  const setActiveMode = onModeChange ?? setInternalMode;

  useEffect(() => {
    savedMaskRef.current = savedMask ?? null;
  }, [savedMask]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const subject = maskRef.current;
    if (!canvas || !subject) return;

    canvas.width = subject.width;
    canvas.height = subject.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.putImageData(subject.imageData, 0, 0);
    const overlay = ctx.createImageData(subject.width, subject.height);
    for (let index = 0; index < subject.mask.length; index++) {
      if (!subject.mask[index]) continue;
      const dataIndex = index * 4;
      overlay.data[dataIndex] = 22;
      overlay.data[dataIndex + 1] = 163;
      overlay.data[dataIndex + 2] = 74;
      overlay.data[dataIndex + 3] = 105;
    }

    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = subject.width;
    overlayCanvas.height = subject.height;
    const overlayCtx = overlayCanvas.getContext("2d");
    if (!overlayCtx) return;
    overlayCtx.putImageData(overlay, 0, 0);
    ctx.drawImage(overlayCanvas, 0, 0);

    const selectionBox = selectionBoxRef.current;
    if (selectionBox) {
      const minX = Math.min(selectionBox.start.x, selectionBox.end.x);
      const maxX = Math.max(selectionBox.start.x, selectionBox.end.x);
      const minY = Math.min(selectionBox.start.y, selectionBox.end.y);
      const maxY = Math.max(selectionBox.start.y, selectionBox.end.y);
      ctx.save();
      ctx.fillStyle = "rgba(143, 29, 33, 0.08)";
      ctx.strokeStyle = "#8f1d21";
      ctx.lineWidth = Math.max(2, Math.round(subject.width / 320));
      ctx.setLineDash([8, 5]);
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.restore();
    }
  }, []);

  const publish = useCallback(() => {
    const subject = maskRef.current;
    if (!subject) return;
    const next = analyzeSubjectMask(subject);
    setAnalysis(next);
    onSubjectChange(next);
  }, [onSubjectChange]);

  const saveSnapshot = useCallback(() => {
    onMaskSnapshotChange?.(maskRef.current ? cloneSubjectMask(maskRef.current) : null);
  }, [onMaskSnapshotChange]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setAnalysis(null);
    maskRef.current = null;
    if (!imageUrl) return;

    const initialSavedMask = savedMaskRef.current;
    if (initialSavedMask) {
      maskRef.current = cloneSubjectMask(initialSavedMask);
      setReady(true);
      draw();
      setAnalysis(analyzeSubjectMask(initialSavedMask));
      return;
    }

    createSubjectMask(imageUrl, { autoDetect })
      .then((subject) => {
        if (cancelled) return;
        maskRef.current = subject;
        saveSnapshot();
        setReady(true);
        draw();
        if (autoDetect) {
          const next = analyzeSubjectMask(subject);
          setAnalysis(next);
          onSubjectChange(next);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [autoDetect, draw, imageUrl, onSubjectChange, saveSnapshot]);

  const getCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const subject = maskRef.current;
    if (!canvas || !subject) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * subject.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * subject.height);
    if (x < 0 || x >= subject.width || y < 0 || y >= subject.height) return null;
    return { x, y };
  }, []);

  const applyBrush = useCallback((x: number, y: number, nextValue: 0 | 1) => {
    const subject = maskRef.current;
    if (!subject) return;
    const radiusSquared = brushSize * brushSize;

    for (let yy = Math.max(0, y - brushSize); yy <= Math.min(subject.height - 1, y + brushSize); yy++) {
      for (let xx = Math.max(0, x - brushSize); xx <= Math.min(subject.width - 1, x + brushSize); xx++) {
        const dx = xx - x;
        const dy = yy - y;
        if (dx * dx + dy * dy <= radiusSquared) {
          subject.mask[yy * subject.width + xx] = nextValue;
        }
      }
    }

    draw();
    saveSnapshot();
  }, [brushSize, draw, saveSnapshot]);

  const selectConnectedSubject = useCallback((x: number, y: number) => {
    const subject = maskRef.current;
    if (!subject) return;
    const seedIndex = y * subject.width + x;
    const visited = new Uint8Array(subject.width * subject.height);
    const queue = [seedIndex];
    const selected: number[] = [];
    visited[seedIndex] = 1;
    let head = 0;
    const threshold = 44;
    const removingMask = subject.mask[seedIndex] === 1;

    while (head < queue.length) {
      const current = queue[head++];
      selected.push(current);
      const cx = current % subject.width;
      const cy = Math.floor(current / subject.width);
      const neighbors = [
        cx > 0 ? current - 1 : -1,
        cx + 1 < subject.width ? current + 1 : -1,
        cy > 0 ? current - subject.width : -1,
        cy + 1 < subject.height ? current + subject.width : -1,
      ];

      for (const next of neighbors) {
        if (next < 0 || visited[next]) continue;
        if (removingMask) {
          if (!subject.mask[next]) continue;
        } else if (rgbDistance(subject.imageData.data, seedIndex, next) > threshold) {
          continue;
        }
        visited[next] = 1;
        queue.push(next);
      }
    }

    for (const index of selected) {
      subject.mask[index] = removingMask ? 0 : 1;
    }
    draw();
    saveSnapshot();
    publish();
  }, [draw, publish, saveSnapshot]);

  const recognizeSubjectInsideBox = useCallback(() => {
    const subject = maskRef.current;
    const selectionBox = selectionBoxRef.current;
    if (!subject || !selectionBox) return;

    const minX = Math.max(0, Math.floor(Math.min(selectionBox.start.x, selectionBox.end.x)));
    const maxX = Math.min(subject.width - 1, Math.ceil(Math.max(selectionBox.start.x, selectionBox.end.x)));
    const minY = Math.max(0, Math.floor(Math.min(selectionBox.start.y, selectionBox.end.y)));
    const maxY = Math.min(subject.height - 1, Math.ceil(Math.max(selectionBox.start.y, selectionBox.end.y)));
    if (maxX - minX < MIN_BOX_SIZE || maxY - minY < MIN_BOX_SIZE) return;

    const inside = new Uint8Array(subject.width * subject.height);
    const insideIndices: number[] = [];
    const boundaryIndices: number[] = [];

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const index = y * subject.width + x;
        inside[index] = 1;
        insideIndices.push(index);
      }
    }
    if (insideIndices.length === 0) return;

    for (const index of insideIndices) {
      const x = index % subject.width;
      const y = Math.floor(index / subject.width);
      const touchesOutside = x === minX || x === maxX || y === minY || y === maxY
        || !inside[index - 1]
        || !inside[index + 1]
        || !inside[index - subject.width]
        || !inside[index + subject.width];
      if (touchesOutside) boundaryIndices.push(index);
    }
    const backgroundPalette = buildPaletteFromIndices(subject.imageData.data, boundaryIndices.length ? boundaryIndices : insideIndices, 5);
    if (backgroundPalette.length === 0) return;

    const distances = new Float32Array(subject.width * subject.height);
    const values: number[] = [];
    for (const index of insideIndices) {
      const distance = Math.min(...backgroundPalette.map((background) => rgbDistance(subject.imageData.data, index, background)));
      distances[index] = distance;
      values.push(distance);
    }
    const threshold = otsu(values);
    const candidate = new Uint8Array(subject.width * subject.height);
    for (const index of insideIndices) {
      if (distances[index] > threshold) candidate[index] = 1;
    }

    const component = largestComponentWithin(candidate, subject.width, subject.height);
    for (const index of component) subject.mask[index] = 1;
    draw();
    saveSnapshot();
    publish();
  }, [draw, publish, saveSnapshot]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point || !maskRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (activeMode === "select") {
      selectConnectedSubject(point.x, point.y);
      return;
    }

    if (activeMode === "box") {
      isDrawingRef.current = true;
      selectionBoxRef.current = { start: point, end: point };
      draw();
      return;
    }

    isDrawingRef.current = true;
    applyBrush(point.x, point.y, activeMode === "add" ? 1 : 0);
  }, [activeMode, applyBrush, draw, getCanvasPoint, selectConnectedSubject]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || activeMode === "select") return;
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point) return;
    if (activeMode === "box") {
      const selectionBox = selectionBoxRef.current;
      if (selectionBox) selectionBoxRef.current = { ...selectionBox, end: point };
      draw();
      return;
    }
    applyBrush(point.x, point.y, activeMode === "add" ? 1 : 0);
  }, [activeMode, applyBrush, draw, getCanvasPoint]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (activeMode === "box") {
      recognizeSubjectInsideBox();
      selectionBoxRef.current = null;
      draw();
      return;
    }
    publish();
  }, [activeMode, draw, publish, recognizeSubjectInsideBox]);

  const resetMask = useCallback(() => {
    if (!imageUrl) return;
    selectionBoxRef.current = null;
    createSubjectMask(imageUrl, { autoDetect }).then((subject) => {
      maskRef.current = cloneSubjectMask(subject);
      saveSnapshot();
      draw();
      if (autoDetect) {
        publish();
      } else {
        setAnalysis(null);
      }
    });
  }, [autoDetect, draw, imageUrl, publish, saveSnapshot]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {showHeader ? (
          <div>
            <h2 className="text-xl font-semibold">交互式主体识别</h2>
            <p className="mt-1 text-sm text-stone-500">
              请点击图像中的主体。绿色蒙版表示将进入拼豆化的主体范围；识别不准时，可切换增加或减少并用画笔修正。
            </p>
          </div>
        ) : <div />}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-stone-300">
            {[
              { id: "select", label: "鼠标" },
              { id: "add", label: "增加" },
              { id: "subtract", label: "减少" },
              { id: "box", label: "框选" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveMode(item.id as MaskMode)}
                className={`px-3 py-1.5 text-xs font-semibold transition ${
                  activeMode === item.id ? "bg-[#8f1d21] text-white" : "bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="flex min-w-40 items-center gap-2 text-xs text-stone-500">
            <span>画笔</span>
            <input
              type="range"
              min={BRUSH_SIZES[0]}
              max={BRUSH_SIZES[BRUSH_SIZES.length - 1]}
              step={1}
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              disabled={activeMode === "select" || activeMode === "box"}
              className="w-24 accent-[#8f1d21] disabled:opacity-50"
            />
            <span className="w-9 tabular-nums">{brushSize}px</span>
          </label>
          <button type="button" onClick={resetMask} disabled={!imageUrl || loading} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 disabled:opacity-50">
            重置识别
          </button>
        </div>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
        {imageUrl ? (
          <>
            <canvas
              ref={canvasRef}
              className={`block max-h-[520px] w-full object-contain ${activeMode === "select" || activeMode === "box" ? "cursor-crosshair" : "cursor-none"}`}
              style={{ touchAction: "none" }}
              onPointerDown={handlePointerDown}
              onPointerMove={(event) => {
                const point = getCanvasPoint(event.clientX, event.clientY);
                setCursor(point);
                handlePointerMove(event);
              }}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                setCursor(null);
                handlePointerUp();
              }}
              onPointerLeave={() => {
                setCursor(null);
                handlePointerUp();
              }}
            />
            {activeMode !== "select" && activeMode !== "box" && cursor && maskRef.current && canvasRef.current && (
              <div
                className={`pointer-events-none absolute rounded-full border-2 ${
                  activeMode === "add" ? "border-emerald-500 bg-emerald-400/15" : "border-red-500 bg-red-400/15"
                } shadow-[0_0_0_1px_rgba(255,255,255,0.9)]`}
                style={{
                  left: `${(cursor.x / maskRef.current.width) * canvasRef.current.getBoundingClientRect().width}px`,
                  top: `${(cursor.y / maskRef.current.height) * canvasRef.current.getBoundingClientRect().height}px`,
                  width: `${(brushSize * 2 / maskRef.current.width) * canvasRef.current.getBoundingClientRect().width}px`,
                  height: `${(brushSize * 2 / maskRef.current.height) * canvasRef.current.getBoundingClientRect().height}px`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            )}
          </>
        ) : (
          <div className="grid min-h-[320px] place-items-center text-sm text-stone-400">暂无图片</div>
        )}
        {imageUrl && !ready && (
          <div className="grid min-h-[120px] place-items-center text-sm text-stone-400">{autoDetect ? "正在识别主体..." : "正在加载图像..."}</div>
        )}
      </div>

      {analysis && analysis.colors.length > 0 && (
        <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3">
          <p className="text-xs font-semibold text-stone-600">主体颜色占比</p>
          <div className="mt-3 space-y-2">
            {analysis.colors.map((color) => {
              const percent = color.ratio * 100;
              return (
                <div key={color.hex} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-xs">
                  <span className="font-mono font-semibold text-stone-700">{color.hex}:</span>
                  <div className="h-4 overflow-hidden rounded-full bg-white ring-1 ring-stone-200">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(2, percent)}%`, backgroundColor: color.hex }}
                    />
                  </div>
                  <span className="text-right font-mono text-stone-600">{percent.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
