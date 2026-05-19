"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AIGeneratePanel from "@/components/AIGeneratePanel";
import BeadMaterialList from "@/components/BeadMaterialList";
import CultureExplanation from "@/components/CultureExplanation";
import CultureThemeSelector from "@/components/CultureThemeSelector";
import ExportPanel from "@/components/ExportPanel";
import ImagePreviewPanel from "@/components/ImagePreviewPanel";
import PixelControlPanel from "@/components/PixelControlPanel";
import ProductMockup from "@/components/ProductMockup";
import { type AspectRatioId } from "@/data/aspectRatios";
import { getProductTemplate } from "@/data/productTemplates";
import { countBeads, type BeadCount } from "@/utils/countBeads";
import { generateCultureCopy, type CultureCopy } from "@/utils/cultureTextGenerator";
import {
  generateSamplePattern,
  imageDataUrlToPattern,
  renderPatternToCanvas,
  renderSampleDesignOriginal,
  type BeadPattern,
} from "@/utils/culturePattern";


export default function CultureGeneratorPage() {
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

  /** 中止正在进行的场景生成请求 */
  const abortSceneRequest = useCallback(() => {
    if (sceneAbortRef.current) {
      sceneAbortRef.current.abort();
      sceneAbortRef.current = null;
    }
  }, []);

  const regenerateFromSample = useCallback(() => {
    // 中止仍在进行的场景生成请求
    abortSceneRequest();

    // 第1张：设计原图
    const designUrl = renderSampleDesignOriginal(options);
    setSourceImageUrl(designUrl);

    // 第2张：主题元素提取图（内置样例的设计图已直接是主题元素，无需二次提取）
    setExtractedImageUrl(designUrl);

    // 第3张：拼豆网格图纸
    const next = generateSamplePattern({ ...options, antiAlias });
    setPattern(next);

    // 第4张：清空之前的场景预览，由 effect 重新触发生成
    setAiCopy(null);
    setProductSceneUrl(null);
    setError(null);
  }, [antiAlias, options, abortSceneRequest]);


  useEffect(() => {
    if (!pattern || !canvasRef.current) return;
    renderPatternToCanvas(canvasRef.current, pattern, showGrid);
    setPatternUrl(canvasRef.current.toDataURL("image/png"));
  }, [pattern, showGrid]);

  useEffect(() => {
    regenerateFromSample();
  }, [regenerateFromSample]);

  useEffect(() => {

    if (!patternUrl || !pattern) return;

    const sceneKey = `${pattern.source}:${productId}:${aspectRatio}:${pattern.width}x${pattern.height}:${extractedImageKey}`;
    if (sceneRequestKeyRef.current === sceneKey) return;
    sceneRequestKeyRef.current = sceneKey;

    // 立即中止上一次请求
    abortSceneRequest();

    const abortController = new AbortController();
    sceneAbortRef.current = abortController;
    setSceneLoading(true);
    setProductSceneUrl(null);

    fetch("/api/generate-product-scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patternUrl,
        productId,
        aspectRatio,
      }),
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
        if (err.name === "AbortError") return; // 被中止，忽略
        setError(err instanceof Error ? err.message : "文创产品场景预览生成失败");
      })
      .finally(() => {
        setSceneLoading(false);
      });

    return () => {
      abortController.abort();
      if (sceneAbortRef.current === abortController) {
        sceneAbortRef.current = null;
      }
    };
  }, [aspectRatio, extractedImageKey, pattern, patternUrl, productId, abortSceneRequest]);


  const beadCounts = useMemo(() => (pattern ? countBeads(pattern.grid) : []), [pattern]);
  const copy = useMemo(
    () => {
      if (aiCopy) return aiCopy;
      return (
      generateCultureCopy({
        ...options,
        meaning,
        beadCounts,
      })
      );
    },
    [aiCopy, beadCounts, meaning, options],
  );

  const requestAiCopy = async (imageUrl?: string, counts: BeadCount[] = beadCounts): Promise<CultureCopy> => {
    const response = await fetch("/api/generate-culture-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...options,
        meaning,
        beadCounts: counts,
        imageUrl,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error ?? "AI 作品信息生成失败");
    }
    return result.copy as CultureCopy;
  };

  const handleGenerateAI = async () => {
    // 中止仍在进行的场景生成请求
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
      if (!response.ok) {
        throw new Error(result?.error ?? "AI 生图请求失败");
      }
      const next = await imageDataUrlToPattern(result.imageUrl, {
        ...options,
        antiAlias,
        source: "ai",
        preserveSourceRatio: false,
      });
      setSourceImageUrl(result.imageUrl);
      setExtractedImageUrl(result.imageUrl);
      setProductSceneUrl(null);
      setPattern(next);
      const nextCopy = await requestAiCopy(result.imageUrl, countBeads(next.grid));
      setAiCopy(nextCopy);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 生成请求失败");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = (file: File) => {
    // 中止仍在进行的场景生成请求
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
          body: JSON.stringify({
            ...options,
            imageUrl: url,
          }),
        });
        const extractResult = await extractResponse.json();
        if (!extractResponse.ok) {
          throw new Error(extractResult?.error ?? "主题元素提取失败");
        }
        setExtractedImageUrl(extractResult.imageUrl);
        setProductSceneUrl(null);
        const next = await imageDataUrlToPattern(extractResult.imageUrl, {
          ...options,
          antiAlias,
          source: "upload",
          preserveSourceRatio: false,
        });
        setPattern(next);
        const nextCopy = await requestAiCopy(extractResult.imageUrl, countBeads(next.grid));
        setAiCopy(nextCopy);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "上传图片处理失败");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleMockupRendered = useCallback((url: string) => setMockupUrl(url), []);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">
              AI 驱动的中华文创拼豆设计系统
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">豆韵</h1>
            <h2 className="mt-1 text-xl font-semibold text-slate-700 dark:text-slate-200">
              主题元素提取 · 拼豆底稿生成 · 文创产品场景预览
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              豆韵：输入文化主题或上传图片，生成主题元素、拼豆底稿、材料清单、真实文创场景预览和作品说明。
            </p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
          <aside className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
          </aside>

          <section className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <AIGeneratePanel
                options={options}
                loading={loading}
                error={error}
                onGenerate={handleGenerateAI}
                onSample={regenerateFromSample}
                onUpload={handleUpload}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ImagePreviewPanel
                title="原图"
                imageUrl={sourceImageUrl}
                caption="AI 生成时显示 AI 原图；用户上传时显示上传原图。"
              />
              <ImagePreviewPanel
                title="主题元素提取"
                imageUrl={extractedImageUrl}
                caption={pattern?.source === "upload" ? "已去除杂乱背景后的主体元素。" : "AI 生成图已按主题和文创形式生成，无需二次提取。"}
              />
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold">拼豆网格图纸</h2>
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

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-3 text-lg font-bold">导出作品</h2>
              <ExportPanel
                title={copy.title}
                patternUrl={patternUrl}
                mockupUrl={mockupUrl}
                copy={copy}
                beadCounts={beadCounts}
              />
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-3 text-lg font-bold">材料清单</h2>
              <BeadMaterialList items={beadCounts} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <CultureExplanation copy={copy} />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
