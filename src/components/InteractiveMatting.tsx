"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BrushMode = "foreground" | "background";

type Props = {
  imageUrl: string;
  onMattingResult: (resultImageUrl: string) => void;
  onClose: () => void;
};

const BRUSH_SIZES = [4, 8, 16, 24, 32];

export default function InteractiveMatting({ imageUrl, onMattingResult, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 });
  const [brushMode, setBrushMode] = useState<BrushMode>("foreground");
  const [brushSize, setBrushSize] = useState(16);
  const [isDrawing, setIsDrawing] = useState(false);
  const [processing, setProcessing] = useState(false);

  // 加载原始图片
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      baseImageRef.current = img;
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      setImageSize({ w, h });
      setLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // 绘制画布（原始图 + 笔触蒙版）
  const paintCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImageRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = imageSize;
    canvas.width = w;
    canvas.height = h;

    // 绘制原始图
    ctx.drawImage(baseImageRef.current, 0, 0, w, h);
  }, [imageSize]);

  // 初始绘制
  useEffect(() => {
    if (loaded) paintCanvas();
  }, [loaded, paintCanvas]);

  // 获取笔触坐标（相对于画布）
  const getDrawPos = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // 在画布上绘制笔触
  const drawStroke = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    ctx.fillStyle = brushMode === "foreground"
      ? "rgba(0, 255, 0, 0.5)"
      : "rgba(255, 0, 0, 0.5)";
    ctx.fill();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDrawing(true);
    const pos = getDrawPos(e.clientX, e.clientY);
    if (pos) drawStroke(pos.x, pos.y);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    const pos = getDrawPos(e.clientX, e.clientY);
    if (pos) drawStroke(pos.x, pos.y);
  };

  const handlePointerUp = () => setIsDrawing(false);

  // 应用蒙版到原图并返回结果
  const applyMaskAndReturn = useCallback((ctx: CanvasRenderingContext2D, mask: ImageData) => {
    const { w, h } = imageSize;

    // 创建一个新 canvas，将原图与蒙版结合
    const resultCanvas = document.createElement("canvas");
    resultCanvas.width = w;
    resultCanvas.height = h;
    const resultCtx = resultCanvas.getContext("2d");
    if (!resultCtx) return;

    // 绘制原始图
    resultCtx.drawImage(baseImageRef.current!, 0, 0, w, h);

    // 使用蒙版数据作为 alpha 通道
    const resultData = resultCtx.getImageData(0, 0, w, h);
    for (let i = 0; i < mask.data.length; i += 4) {
      resultData.data[i + 3] = mask.data[i + 3]; // 替换 alpha
    }
    resultCtx.putImageData(resultData, 0, 0);

    const resultUrl = resultCanvas.toDataURL("image/png");
    onMattingResult(resultUrl);
  }, [imageSize, onMattingResult]);

  // 生成蒙版（基于洪水填充）
  const generateMatting = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = imageSize;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // 分析笔触：收集前景种子和背景种子
    const fgSeeds: { x: number; y: number }[] = [];
    const bgSeeds: { x: number; y: number }[] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        // 前景绿色笔触：rgba(0,255,0,~128)
        if (g > 200 && r < 50 && b < 50 && a > 100) {
          fgSeeds.push({ x, y });
        }
        // 背景红色笔触：rgba(255,0,0,~128)
        if (r > 200 && g < 50 && b < 50 && a > 100) {
          bgSeeds.push({ x, y });
        }
      }
    }

    if (fgSeeds.length === 0 && bgSeeds.length === 0) {
      // 如果没有笔触，默认全部为前景
      const mask = ctx.createImageData(w, h);
      for (let i = 3; i < mask.data.length; i += 4) {
        mask.data[i] = 255; // 全透明 = 前景
      }
      ctx.putImageData(mask, 0, 0);
      applyMaskAndReturn(ctx, mask);
      return;
    }

    // 提取原始像素颜色值（忽略笔触）
    const originalPixel = (x: number, y: number): { r: number; g: number; b: number } | null => {
      const idx = (y * w + x) * 4;
      // 跳过笔触像素（高饱和绿或红）
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const isBrushFg = g > 200 && r < 50 && b < 50;
      const isBrushBg = r > 200 && g < 50 && b < 50;
      if (isBrushFg || isBrushBg) return null;
      return { r, g, b };
    };

    // 颜色距离
    const colorDist = (c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }) => {
      return Math.sqrt((c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2);
    };

    // 计算前景和背景的平均颜色
    const avgColor = (seeds: { x: number; y: number }[]): { r: number; g: number; b: number } | null => {
      if (seeds.length === 0) return null;
      const colors = seeds.map(s => originalPixel(s.x, s.y)).filter(Boolean) as { r: number; g: number; b: number }[];
      if (colors.length === 0) return null;
      const sum = colors.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 });
      return { r: Math.round(sum.r / colors.length), g: Math.round(sum.g / colors.length), b: Math.round(sum.b / colors.length) };
    };

    const fgAvg = avgColor(fgSeeds);
    const bgAvg = avgColor(bgSeeds);

    // 创建输出蒙版：使用欧氏距离 + 连通性进行洪水填充
    const mask = ctx.createImageData(w, h);
    const visited = new Uint8Array(w * h);
    const isForeground = new Uint8Array(w * h);

    // 阈值
    const threshold = 45;

    // 从前景种子做 BFS
    const bfs = (seeds: { x: number; y: number }[], markAs: 1 | 0) => {
      const queue: { x: number; y: number }[] = [...seeds];
      const targetAvg = markAs === 1 ? fgAvg : bgAvg;
      if (!targetAvg) {
        // 没有参考颜色时，直接标记种子点
        seeds.forEach(s => {
          if (s.y >= 0 && s.y < h && s.x >= 0 && s.x < w) {
            isForeground[s.y * w + s.x] = markAs;
            visited[s.y * w + s.x] = 1;
          }
        });
        return;
      }

      while (queue.length > 0) {
        const p = queue.shift()!;
        if (p.y < 0 || p.y >= h || p.x < 0 || p.x >= w) continue;
        const idx = p.y * w + p.x;
        if (visited[idx]) continue;
        visited[idx] = 1;

        const pixelColor = originalPixel(p.x, p.y);
        if (!pixelColor) continue;

        const dist = colorDist(pixelColor, targetAvg);
        if (dist < threshold) {
          isForeground[idx] = markAs;
          // 加入邻居
          queue.push({ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 });
        }
      }
    };

    // 先传播背景，再传播前景（背景优先避免前景溢出）
    if (bgSeeds.length > 0 && bgAvg) bfs(bgSeeds, 0);
    if (fgSeeds.length > 0 && fgAvg) bfs(fgSeeds, 1);

    // 处理未访问像素：距离最近的种子颜色
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const mi = idx * 4;
        if (!visited[idx]) {
          const pixelColor = originalPixel(x, y);
          if (!pixelColor) {
            mask.data[mi + 3] = 0;
            continue;
          }
          // 判断更接近前景还是背景
          const distToFg = fgAvg ? colorDist(pixelColor, fgAvg) : 0;
          const distToBg = bgAvg ? colorDist(pixelColor, bgAvg) : 999;
          if (fgAvg && (!bgAvg || distToFg < distToBg)) {
            isForeground[idx] = 1;
          } else {
            isForeground[idx] = 0;
          }
        }
        mask.data[mi + 3] = isForeground[idx] ? 255 : 0;
      }
    }

    ctx.putImageData(mask, 0, 0);
    applyMaskAndReturn(ctx, mask);
  }, [imageSize, applyMaskAndReturn]);

  // 一键清除所有笔触
  const clearStrokes = () => {
    paintCanvas();
  };

  // 重置所有
  const handleReset = () => {
    setProcessing(false);
    paintCanvas();
  };

  if (!loaded) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
        <p className="text-sm text-slate-500">加载图片中...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">交互式抠图</h3>
        <button
          onClick={onClose}
          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          收起
        </button>
      </div>

      <p className="mb-4 text-sm text-slate-500">
        用绿色画笔涂抹您想保留的区域（前景），用红色画笔涂抹要去掉的区域（背景）。点击&ldquo;生成蒙版&rdquo;自动计算，满意后点击&ldquo;应用结果&rdquo;。
      </p>

      {/* 画布 — 按原图比例显示，不强制尺寸 */}
      <div className="relative mx-auto flex max-w-full justify-center overflow-hidden rounded-lg border border-slate-300 bg-slate-100">
        <canvas
          ref={canvasRef}
          className="block max-w-full touch-none"
          style={{
            maxWidth: "100%",
            height: "auto",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      {/* 工具条 */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* 画笔模式 */}
        <div className="flex rounded-md border border-slate-300 overflow-hidden">
          <button
            onClick={() => setBrushMode("foreground")}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              brushMode === "foreground"
                ? "bg-green-500 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
              前景
            </span>
          </button>
          <button
            onClick={() => setBrushMode("background")}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              brushMode === "background"
                ? "bg-red-500 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
              背景
            </span>
          </button>
        </div>

        {/* 画笔大小 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">大小</span>
          <div className="flex rounded-md border border-slate-300 overflow-hidden">
            {BRUSH_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => setBrushSize(size)}
                className={`px-2 py-1.5 text-xs transition ${
                  brushSize === size
                    ? "bg-slate-950 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={clearStrokes}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            清除笔触
          </button>
          <button
            onClick={handleReset}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            重置
          </button>
          <button
            onClick={() => {
              setProcessing(true);
              generateMatting();
            }}
            disabled={processing}
            className="rounded-md bg-cyan-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-cyan-800 disabled:opacity-60"
          >
            {processing ? "处理中..." : "生成蒙版"}
          </button>
        </div>
      </div>
    </div>
  );
}
