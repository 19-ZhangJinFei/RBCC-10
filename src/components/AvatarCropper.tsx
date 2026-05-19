"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  file: File;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
};

const CONTAINER_SIZE = 300;
const CROP_SIZE = 260;

export default function AvatarCropper({ file, onSave, onCancel }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, ox: 0, oy: 0 });
  const baseScaleRef = useRef(1);

  useEffect(() => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const bs = Math.max(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight);
      baseScaleRef.current = bs;
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setImage(img);
    };
    img.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const displayScale = baseScaleRef.current * zoom;
  const displayW = image ? image.naturalWidth * displayScale : 0;
  const displayH = image ? image.naturalHeight * displayScale : 0;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => {
      const next = z - e.deltaY * 0.003;
      return Math.max(0.5, Math.min(5, next));
    });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y });
    },
    [offset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setOffset({
        x: dragStart.ox + (e.clientX - dragStart.x),
        y: dragStart.oy + (e.clientY - dragStart.y),
      });
    },
    [isDragging, dragStart]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        ox: offset.x,
        oy: offset.y,
      });
    },
    [offset]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      setOffset({
        x: dragStart.ox + (e.touches[0].clientX - dragStart.x),
        y: dragStart.oy + (e.touches[0].clientY - dragStart.y),
      });
    },
    [isDragging, dragStart]
  );

  const stopDragging = useCallback(() => setIsDragging(false), []);

  const handleSave = useCallback(() => {
    if (!image) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;

    const imgLeft = (CONTAINER_SIZE - displayW) / 2 + offset.x;
    const imgTop = (CONTAINER_SIZE - displayH) / 2 + offset.y;
    const cropLeft = (CONTAINER_SIZE - CROP_SIZE) / 2;
    const cropTop = (CONTAINER_SIZE - CROP_SIZE) / 2;

    const sx = ((cropLeft - imgLeft) / displayW) * image.naturalWidth;
    const sy = ((cropTop - imgTop) / displayH) * image.naturalHeight;
    const sw = (CROP_SIZE / displayW) * image.naturalWidth;
    const sh = (CROP_SIZE / displayH) * image.naturalHeight;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, CROP_SIZE, CROP_SIZE);

    onSave(canvas.toDataURL("image/png"));
  }, [image, displayW, displayH, offset, onSave]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseUp={stopDragging}
      onMouseLeave={stopDragging}
      onTouchEnd={stopDragging}
    >
      <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <h3 className="text-center text-lg font-semibold">裁剪头像</h3>
        <p className="mt-1 text-center text-xs text-stone-500">
          拖动调整位置，滚轮或滑块缩放
        </p>

        <div
          className={`relative mx-auto mt-4 h-[300px] w-[300px] select-none overflow-hidden rounded-lg bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)_0_0_/_20px_20px] ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
        >
          {image && (
            <img
              src={image.src}
              alt="裁剪预览"
              draggable={false}
              className="pointer-events-none absolute select-none"
              style={{
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                width: displayW,
                height: displayH,
                maxWidth: "none",
                maxHeight: "none",
              }}
            />
          )}

          <div
            className="pointer-events-none absolute inset-0"
            style={{
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
              clipPath: `circle(${CROP_SIZE / 2}px at 50% 50%)`,
            }}
          />

          <div
            className="pointer-events-none absolute rounded-full border-[3px] border-white"
            style={{
              width: CROP_SIZE,
              height: CROP_SIZE,
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs font-medium text-stone-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </span>
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[#8f1d21]"
          />
          <span className="text-xs font-medium text-stone-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m-3-3h6" />
            </svg>
          </span>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-stone-300 bg-white py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 active:scale-[0.98]"
          >
            放弃
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-lg bg-[#8f1d21] py-2.5 text-sm font-medium text-white transition hover:bg-[#a52327] active:scale-[0.98]"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
