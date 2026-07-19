"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AIGeneratePanel from "@/components/AIGeneratePanel";
import BeadMaterialList from "@/components/BeadMaterialList";
import CultureExplanation from "@/components/CultureExplanation";
import CultureThemeSelector from "@/components/CultureThemeSelector";
import ExportPanel from "@/components/ExportPanel";
import ImagePreviewPanel from "@/components/ImagePreviewPanel";
import PixelControlPanel from "@/components/PixelControlPanel";
import PixelatedPreviewCanvas from "@/components/PixelatedPreviewCanvas";
import ProductMockup from "@/components/ProductMockup";
import { type AspectRatioId } from "@/data/aspectRatios";
import { getProductTemplate } from "@/data/productTemplates";
import { countBeads, type BeadCount } from "@/utils/countBeads";
import type { CultureCopy } from "@/utils/cultureTextGenerator";
import {
  generateSamplePattern,
  imageDataUrlToPattern,
  renderPatternToCanvas,
  renderPatternToCanvasClean,
  renderSampleDesignOriginal,
  type BeadPattern,
} from "@/utils/culturePattern";
import { getDisplayColorKey, getAllHexValues, sortColorsByHue } from "@/utils/colorSystemUtils";

type TabId = "config" | "extract" | "pattern" | "preview";

const TABS: { id: TabId; label: string }[] = [
  { id: "config", label: "配置" },
  { id: "extract", label: "主体提取与再创作" },
  { id: "pattern", label: "拼豆图纸" },
  { id: "preview", label: "场景预览" },
];

export default function FourPageApp() {
  const [activeTab, setActiveTab] = useState<TabId>("config");
  const [theme, setTheme] = useState("青花瓷");
  const [element, setElement] = useState("莲花");
  const [meaning, setMeaning] = useState("青花瓷以蓝白配色和清雅纹样体现中国陶瓷审美，适合杯垫、冰箱贴和挂饰类文创。");
  const [productId, setProductId] = useState("coaster");
  const [gridSize, setGridSize] = useState(32);
  const [colorCount, setColorCount] = useState(8);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioId>("1:1");
  const [showGrid, setShowGrid] = useState(true);
  const [antiAlias, setAntiAlias] = useState(true);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [extractedImageUrl, setExtractedImageUrl] = useState<string | null>(null);
  const [pattern, setPattern] = useState<BeadPattern | null>(null);
  const [patternUrl, setPatternUrl] = useState<string | null>(null);
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  const [productSceneUrl, setProductSceneUrl] = useState<string | null>(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [aiCopy, setAiCopy] = useState<CultureCopy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [forcedColors, setForcedColors] = useState<string[]>([]);

  // 加载所有色板颜色，按色相排序（用于颜色选择器）
  const paletteColors = useMemo(() => {
    const allHexValues = getAllHexValues();
    const colors = allHexValues.map(hex => ({
      color: hex,
      key: getDisplayColorKey(hex),
    }));
    return sortColorsByHue(colors);
  }, []);

  // 强制颜色警告：如果指定颜色数超过 colorCount
  const forcedColorWarning = useMemo(() => {
    if (forcedColors.length === 0) return null;
    if (forcedColors.length > colorCount) {
      return `你指定了 ${forcedColors.length} 种颜色，但当前颜色数量上限为 ${colorCount} 种。超出的 ${forcedColors.length - colorCount} 种颜色将被忽略。请减少指定颜色或增加颜色数量上限。`;
    }
    return null;
  }, [forcedColors, colorCount]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRequestKeyRef = useRef<string | null>(null);
  const sceneAbortRef = useRef<AbortController | null>(null);

  const product = getProductTemplate(productId);
  const extractedImageKey = extractedImageUrl?.length ?? 0;
  const options = useMemo(
    () => ({
      theme,
      element,
      meaning,
      product: product.name,
      productPrompt: product.aiPrompt,
      aspectRatio,
      gridSize,
      colorCount,
    }),
    [theme, element, meaning, product.name, product.aiPrompt, aspectRatio, gridSize, colorCount],
  );

  const abortSceneRequest = useCallback(() => {
    if (sceneAbortRef.current) {
      sceneAbortRef.current.abort();
      sceneAbortRef.current = null;
    }
  }, []);

  const regenerateFromSample = useCallback(() => {
    abortSceneRequest();
    const designUrl = renderSampleDesignOriginal(options);
    setSourceImageUrl(designUrl);
    setExtractedImageUrl(designUrl);
    const next = generateSamplePattern({ ...options, antiAlias }, forcedColors);
    setPattern(next);
    setAiCopy(null);
    setProductSceneUrl(null);
    setError(null);
  }, [antiAlias, options, abortSceneRequest, forcedColors]);

  useEffect(() => {
    if (!pattern || !canvasRef.current) return;
    // 可见 canvas：带行列号（用户查看图纸用）
    renderPatternToCanvas(canvasRef.current, pattern, showGrid);
    // 隐藏 canvas：不带行列号（场景预览参考图用）
    const cleanCanvas = document.createElement("canvas");
    renderPatternToCanvasClean(cleanCanvas, pattern, showGrid);
    setPatternUrl(cleanCanvas.toDataURL("image/png"));
  }, [pattern, showGrid]);

  useEffect(() => {
    regenerateFromSample();
  }, [regenerateFromSample]);

  useEffect(() => {
    if (!patternUrl || !pattern) return;

    const sceneKey = `${pattern.source}:${productId}:${aspectRatio}:${pattern.width}x${pattern.height}:${extractedImageKey}`;
    if (sceneRequestKeyRef.current === sceneKey) return;
    sceneRequestKeyRef.current = sceneKey;

    abortSceneRequest();
    const abortController = new AbortController();
    sceneAbortRef.current = abortController;
    setSceneLoading(true);
    setProductSceneUrl(null);

    fetch("/api/generate-product-scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patternUrl, productId, aspectRatio }),
      signal: abortController.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error ?? "文创产品场景预览生成失败");
        return result.imageUrl as string;
      })
      .then((url) => {
        setProductSceneUrl(url);
        setMockupUrl(url);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "文创产品场景预览生成失败");
      })
      .finally(() => setSceneLoading(false));

    return () => {
      abortController.abort();
      if (sceneAbortRef.current === abortController) {
        sceneAbortRef.current = null;
      }
    };
  }, [aspectRatio, extractedImageKey, pattern, patternUrl, productId, abortSceneRequest]);

  const beadCounts = useMemo(() => (pattern ? countBeads(pattern.grid) : []), [pattern]);

  const workTitle = aiCopy?.title?.trim() || `${element}${product.name}`;

  const requestAiCopy = async (imageUrl?: string, counts: BeadCount[] = beadCounts): Promise<CultureCopy> => {
    const response = await fetch("/api/generate-culture-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: product.name,
        gridSize,
        colorCount,
        beadCounts: counts,
        imageUrl,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error ?? "AI 作品信息生成失败");
    return result.copy as CultureCopy;
  };

  const handleGenerateAI = async () => {
    abortSceneRequest();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/generate-culture-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? "AI 生图请求失败");
      const next = await imageDataUrlToPattern(result.imageUrl, {
        ...options,
        antiAlias,
        source: "ai",
        preserveSourceRatio: false,
      }, forcedColors);
      setSourceImageUrl(result.imageUrl);
      setExtractedImageUrl(result.imageUrl);
      setProductSceneUrl(null);
      setPattern(next);
      const nextCopy = await requestAiCopy(result.imageUrl, countBeads(next.grid));
      setAiCopy(nextCopy);
      setActiveTab("pattern");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 生成请求失败");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = (file: File) => {
    abortSceneRequest();
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const url = String(reader.result);
        setLoading(true);
        setSourceImageUrl(url);
        const extractResponse = await fetch("/api/extract-theme-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...options, imageUrl: url }),
        });
        const extractResult = await extractResponse.json();
        if (!extractResponse.ok) throw new Error(extractResult?.error ?? "主题元素提取失败");
        setExtractedImageUrl(extractResult.imageUrl);
        setProductSceneUrl(null);
        const next = await imageDataUrlToPattern(extractResult.imageUrl, {
          ...options,
          antiAlias,
          source: "upload",
          preserveSourceRatio: false,
        }, forcedColors);
        setPattern(next);
        const nextCopy = await requestAiCopy(extractResult.imageUrl, countBeads(next.grid));
        setAiCopy(nextCopy);
        setError(null);
        setActiveTab("extract");
      } catch (err) {
        setError(err instanceof Error ? err.message : "上传图片处理失败");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleMockupRendered = useCallback((url: string) => setMockupUrl(url), []);

  // --- Right Sidebar Content ---
  const sidebarContent = (
    <div className="space-y-4">
      {/* 颜色系统显示 - 当前仅支持传统色号 */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">色号系统</label>
        <div className="mt-1 w-full rounded-md border border-slate-300 bg-gray-100 px-2 py-1.5 text-sm text-gray-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
          传统色号 (唯一)
        </div>
      </div>

      {/* 显示网格 */}
      <label className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
        <span>显示网格</span>
        <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
      </label>

      {/* 去抗锯齿 */}
      <label className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
        <span>去抗锯齿</span>
        <input type="checkbox" checked={antiAlias} onChange={(e) => setAntiAlias(e.target.checked)} />
      </label>

      {/* 网格尺寸快捷控制 */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">网格尺寸</label>
        <div className="mt-1 grid grid-cols-4 gap-1">
          {[16, 24, 32, 48, 64, 96, 128, 192].map((size) => (
            <button
              key={size}
              onClick={() => setGridSize(size)}
              className={`rounded px-1 py-1 text-xs ${
                gridSize === size
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* 颜色数量快捷控制 */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">颜色数量</label>
        <div className="mt-1 grid grid-cols-4 gap-1">
          {[4, 8, 16, 32, 64, 128, 256, 512].map((count) => (
            <button
              key={count}
              onClick={() => setColorCount(count)}
              className={`rounded px-1 py-1 text-xs ${
                colorCount === count
                  ? "bg-amber-500 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
              }`}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      {/* 快速示例 */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">快速切换主题</label>
        <div className="mt-1 space-y-1">
          {["青花瓷", "敦煌文化", "京剧脸谱", "山海经", "二十四节气", "甲骨文"].map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`block w-full rounded px-2 py-1 text-left text-xs ${
                theme === t ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200" : "hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <hr className="border-slate-200 dark:border-slate-700" />

      {/* 指定拼豆颜色 - 用户可手动选择颜色 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">指定拼豆颜色</label>
          <span className="text-[10px] text-slate-400">{forcedColors.length} 色 / {colorCount}</span>
        </div>
        {forcedColorWarning && (
          <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {forcedColorWarning}
          </div>
        )}
        <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 p-1.5 dark:border-slate-700">
          {/* 已选颜色 */}
          {forcedColors.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1">
              {forcedColors.map((hex, idx) => (
                <button
                  key={hex}
                  onClick={() => setForcedColors(prev => prev.filter(h => h !== hex))}
                  className="group relative inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 border-blue-500 shadow-sm hover:border-red-400"
                  style={{ backgroundColor: hex }}
                  title={`移除 ${getDisplayColorKey(hex)}`}
                >
                  {/* 选择序号标注 */}
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-white/90 px-0.5 text-[8px] font-bold text-slate-700 shadow ring-1 ring-slate-300">
                    {idx + 1}
                  </span>
                  <span className="hidden rounded bg-white/90 px-1 text-[8px] font-semibold text-red-600 group-hover:block">移除</span>
                </button>
              ))}
              <hr className="w-full border-slate-100" />
            </div>
          )}
          <div className="text-[10px] text-slate-400 mb-1">点击颜色添加到指定列表（默认自动映射）</div>
          <div className="flex flex-wrap gap-1">
            {paletteColors.map((c) => {
              const forcedIdx = forcedColors.indexOf(c.color);
              const isForced = forcedIdx !== -1;
              return (
                <button
                  key={c.color}
                  onClick={() => {
                    if (!isForced) {
                      setForcedColors(prev => [...prev, c.color]);
                    }
                  }}
                  className="relative h-5 w-5 rounded border transition-all hover:scale-125"
                  style={{
                    backgroundColor: c.color,
                    borderColor: isForced ? "#3b82f6" : undefined,
                    boxShadow: isForced ? "0 0 0 2px rgba(59,130,246,0.5)" : undefined,
                  }}
                  title={`${isForced ? "已添加" : "添加"} ${c.key} (${c.color})`}
                >
                  {isForced && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3 min-w-[10px] items-center justify-center rounded-full bg-white/90 px-[2px] text-[6px] font-bold text-slate-700 shadow ring-1 ring-slate-300">
                      {forcedIdx + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {forcedColors.length > 0 && (
          <button
            onClick={() => setForcedColors([])}
            className="mt-1 text-[10px] text-slate-400 hover:text-red-500"
          >
            清空选择（改用自动映射）
          </button>
        )}
      </div>

      <hr className="border-slate-200 dark:border-slate-700" />

      {/* 材料清单（精简版） */}
      {beadCounts.length > 0 && (
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">材料统计</label>
          <div className="mt-1 space-y-1">
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>总颗数</span>
              <span className="font-bold">{beadCounts.reduce((s, i) => s + i.count, 0)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>颜色数</span>
              <span className="font-bold">{beadCounts.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // --- Tab Content ---
  const renderTabContent = () => {
    switch (activeTab) {
      case "config":
        return (
          <div className="space-y-6">
              {/* 顶部操作区 */}
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <AIGeneratePanel
                  options={options}
                  loading={loading}
                  error={error}
                  onGenerate={handleGenerateAI}
                  onSample={regenerateFromSample}
                  onUpload={handleUpload}
                />
              </div>

              {/* 配置面板 */}
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <CultureThemeSelector
                    theme={theme}
                    element={element}
                    meaning={meaning}
                    productId={productId}
                    onThemeChange={setTheme}
                    onElementChange={setElement}
                    onMeaningChange={setMeaning}
                    onProductChange={setProductId}
                  />
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <PixelControlPanel
                    gridSize={gridSize}
                    colorCount={colorCount}
                    aspectRatio={aspectRatio}
                    showGrid={showGrid}
                    antiAlias={antiAlias}
                    onGridSizeChange={setGridSize}
                    onColorCountChange={setColorCount}
                    onAspectRatioChange={setAspectRatio}
                    onShowGridChange={setShowGrid}
                    onAntiAliasChange={setAntiAlias}
                  />
                </div>
              </div>

              {/* 原图预览和文字说明 */}
              <div className="grid gap-6 xl:grid-cols-2">
                <ImagePreviewPanel
                  title="原图"
                  imageUrl={sourceImageUrl}
                  caption="AI 生成时显示 AI 原图；用户上传时显示上传原图。"
                />
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <h2 className="mb-3 text-lg font-bold">作品说明</h2>
                  {aiCopy ? (
                    <CultureExplanation copy={aiCopy} />
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                      文化说明将由 AI 读取再创作图像后生成，并自动填入作品名称、文化来源、图案寓意和设计说明。
                    </div>
                  )}
                </div>
              </div>
          </div>
        );

      case "extract":
        return (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3">
                <h2 className="text-lg font-bold">主题元素提取</h2>
                <p className="text-sm text-slate-500">
                  下方显示从原图中提取的主体元素。支持手动编辑和精细调整。
                  {pattern?.source === "upload"
                    ? "已去除杂乱背景后的主体元素。"
                    : "AI 生成图已按主题生成，无需二次提取。"}
                </p>
              </div>
              <ImagePreviewPanel
                title="提取预览"
                imageUrl={extractedImageUrl}
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 text-lg font-bold">交互式抠图工具</h2>
              <p className="mb-4 text-sm text-slate-500">
                手动编辑模式下，您可以点击像素进行上色、使用橡皮擦或区域擦除工具进行精细调整。
              </p>
              {pattern && (
                <div className="aspect-square max-w-lg">
                  <PixelatedPreviewCanvas
                    mappedPixelData={pattern.grid}
                    gridDimensions={{ N: pattern.width, M: pattern.height }}
                    isManualColoringMode={false}
                    canvasRef={canvasRef as React.RefObject<HTMLCanvasElement | null>}
                    onInteraction={() => {}}
                  />
                </div>
              )}
            </div>
          </div>
        );

      case "pattern":
        return (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">拼豆网格图纸</h2>
                  <p className="text-sm text-slate-500">
                    每个色块代表一颗拼豆，按网格排列即可完成制作。
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  {pattern?.source === "ai" ? "AI 图案" : pattern?.source === "upload" ? "上传图" : "内置样例"}
                  {pattern ? ` · ${pattern.width}x${pattern.height}` : ""}
                </span>
              </div>
              <canvas
                ref={canvasRef}
                className="w-full rounded-md border border-slate-200 bg-white dark:border-slate-700"
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 text-lg font-bold">材料清单</h2>
              <BeadMaterialList items={beadCounts} />
            </div>
          </div>
        );

      case "preview":
        return (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3">
                <h2 className="text-lg font-bold">文创产品预览</h2>
                <p className="text-sm text-slate-500">
                  展示拼豆成果在{product.name}真实生活场景中的应用预览。
                </p>
              </div>
              <ProductMockup
                pattern={pattern}
                product={product}
                sceneUrl={productSceneUrl}
                loading={sceneLoading}
                onRendered={handleMockupRendered}
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 text-lg font-bold">导出作品</h2>
              <ExportPanel
                title={workTitle}
                patternUrl={patternUrl}
                mockupUrl={mockupUrl}
                copy={aiCopy}
                beadCounts={beadCounts}
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 text-lg font-bold">作品文化说明</h2>
              {aiCopy ? (
                <CultureExplanation copy={aiCopy} />
              ) : (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                  文化说明将由 AI 读取再创作图像后生成，并自动填入作品名称、文化来源、图案寓意和设计说明。
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  // --- Navigation dots indicator ---
  const tabProgress = TABS.map((tab) => tab.id);
  const currentIndex = tabProgress.indexOf(activeTab);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="border-b border-slate-200 pb-3 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                AI 驱动的中华文创拼豆设计系统
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">豆阁</h1>
            </div>
            {/* Progress dots */}
            <div className="flex items-center gap-2">
              {TABS.map((tab, idx) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                    activeTab === tab.id
                      ? "bg-cyan-600 text-white shadow-md"
                      : idx < currentIndex
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Main content area with right sidebar */}
        <div className="mt-4 flex gap-4">
          {/* Main content */}
          <div className="min-w-0 flex-1">
            {renderTabContent()}
          </div>

          {/* Right Sidebar - like perlerbeads.zippland.com */}
          <aside
            className={`shrink-0 transition-all duration-300 ${
              sidebarCollapsed ? "w-0 overflow-hidden" : "w-64"
            }`}
          >
            <div className="sticky top-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              {/* Sidebar toggle */}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="absolute -left-8 top-4 flex h-6 min-w-12 items-center justify-center rounded-full border border-slate-200 bg-white px-2 text-xs text-slate-500 shadow-sm hover:text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
              >
                {sidebarCollapsed ? "展开" : "收起"}
              </button>

              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">工具栏</h3>
              </div>
              {sidebarContent}
            </div>
          </aside>
        </div>

        {/* Bottom navigation for mobile */}
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 lg:hidden">
          <div className="flex">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 flex-col items-center py-2 text-xs ${
                  activeTab === tab.id
                    ? "text-cyan-600"
                    : "text-slate-500"
                }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom padding for mobile nav */}
        <div className="h-16 lg:hidden" />
      </div>
    </main>
  );
}
