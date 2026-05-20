"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeSubjectMask,
  createSubjectMask,
  type SubjectAnalysis,
  type SubjectMask,
} from "@/utils/subjectAnalysis";

type MaskMode = "select" | "add" | "subtract";

type Props = {
  imageUrl: string | null;
  loading?: boolean;
  autoDetect?: boolean;
  onSubjectChange: (analysis: SubjectAnalysis) => void;
};

const BRUSH_SIZES = [8, 16, 24, 36, 48];

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

export default function SubjectMaskEditor({ imageUrl, loading, autoDetect = true, onSubjectChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<SubjectMask | null>(null);
  const isDrawingRef = useRef(false);
  const [mode, setMode] = useState<MaskMode>("select");
  const [brushSize, setBrushSize] = useState(16);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [analysis, setAnalysis] = useState<SubjectAnalysis | null>(null);

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
  }, []);

  const publish = useCallback(() => {
    const subject = maskRef.current;
    if (!subject) return;
    const next = analyzeSubjectMask(subject);
    setAnalysis(next);
    onSubjectChange(next);
  }, [onSubjectChange]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setAnalysis(null);
    maskRef.current = null;
    if (!imageUrl) return;

    createSubjectMask(imageUrl, { autoDetect })
      .then((subject) => {
        if (cancelled) return;
        maskRef.current = subject;
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
  }, [autoDetect, draw, imageUrl, onSubjectChange]);

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
  }, [brushSize, draw]);

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
    publish();
  }, [draw, publish]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point || !maskRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (mode === "select") {
      selectConnectedSubject(point.x, point.y);
      return;
    }

    isDrawingRef.current = true;
    applyBrush(point.x, point.y, mode === "add" ? 1 : 0);
  }, [applyBrush, getCanvasPoint, mode, selectConnectedSubject]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || mode === "select") return;
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point) return;
    applyBrush(point.x, point.y, mode === "add" ? 1 : 0);
  }, [applyBrush, getCanvasPoint, mode]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    publish();
  }, [publish]);

  const resetMask = useCallback(() => {
    if (!imageUrl) return;
    createSubjectMask(imageUrl, { autoDetect }).then((subject) => {
      maskRef.current = cloneSubjectMask(subject);
      draw();
      if (autoDetect) {
        publish();
      } else {
        setAnalysis(null);
      }
    });
  }, [autoDetect, draw, imageUrl, publish]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">交互式主体识别</h2>
          <p className="mt-1 text-sm text-stone-500">
            {autoDetect
              ? "绿色蒙版为当前识别主体。可点选主体自动扩展边缘，或用画笔增减主体区域。"
              : "当前图像不自动生成主体蒙版。请用增加画笔添加主体区域，也可用鼠标点选扩展同色连通区域。"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-stone-300">
            {[
              { id: "select", label: "鼠标" },
              { id: "add", label: "增加" },
              { id: "subtract", label: "减少" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id as MaskMode)}
                className={`px-3 py-1.5 text-xs font-semibold transition ${
                  mode === item.id ? "bg-[#8f1d21] text-white" : "bg-white text-stone-600 hover:bg-stone-50"
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
              disabled={mode === "select"}
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
              className={`block max-h-[520px] w-full object-contain ${mode === "select" ? "cursor-crosshair" : "cursor-none"}`}
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
            {mode !== "select" && cursor && maskRef.current && canvasRef.current && (
              <div
                className={`pointer-events-none absolute rounded-full border-2 ${
                  mode === "add" ? "border-emerald-500 bg-emerald-400/15" : "border-red-500 bg-red-400/15"
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
