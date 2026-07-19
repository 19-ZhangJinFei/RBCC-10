"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isApiConfigured, checkServerEnvConfig } from "@/utils/aiChat";

type Props = {
  onClick: () => void;
};

export default function FloatingAiButton({ onClick }: Props) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, offsetX: 0, offsetY: 0, dragging: false });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hasMoved, setHasMoved] = useState(false);
  const [showUnconfiguredHint, setShowUnconfiguredHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始化位置：右下角，留出边距
  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    setPosition({ x: w - 80, y: h - 100 });
    setVisible(true);
    // 启动时检测服务端是否已配置API
    checkServerEnvConfig();
  }, []);

  // 清理提示定时器
  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setHasMoved(false);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: position.x,
      offsetY: position.y,
      dragging: false,
    };
    setIsDragging(true);
  }, [position]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setHasMoved(false);
    dragRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      offsetX: position.x,
      offsetY: position.y,
      dragging: false,
    };
    setIsDragging(true);
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragRef.current.dragging = true;
        setHasMoved(true);
      }
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 56, dragRef.current.offsetX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 56, dragRef.current.offsetY + dy)),
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - dragRef.current.startX;
      const dy = e.touches[0].clientY - dragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragRef.current.dragging = true;
        setHasMoved(true);
      }
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 56, dragRef.current.offsetX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 56, dragRef.current.offsetY + dy)),
      });
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging]);

  const handleClick = useCallback(async () => {
    if (hasMoved) return;
    // 如果当前未检测到API，立即检查服务端环境变量
    if (!isApiConfigured()) {
      const configured = await checkServerEnvConfig();
      if (configured) {
        onClick();
        return;
      }
      // 未配置 API，显示提示
      setShowUnconfiguredHint(true);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      hintTimerRef.current = setTimeout(() => setShowUnconfiguredHint(false), 3000);
    } else {
      onClick();
    }
  }, [onClick, hasMoved]);

  if (!visible) return null;

  return (
    <>
      {showUnconfiguredHint && (
        <div
          className="fixed z-[160] animate-bounce rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 shadow-lg"
          style={{
            left: Math.max(8, position.x - 120),
            top: position.y - 56,
          }}
        >
          ⚠️ 未配置API，暂时无法使用豆阁助手
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="fixed z-[150] flex h-14 w-14 cursor-grab items-center justify-center rounded-full bg-[#8f1d21] text-2xl text-white shadow-lg transition hover:bg-[#a52327] hover:shadow-xl active:cursor-grabbing active:scale-95"
        style={{
          left: position.x,
          top: position.y,
          touchAction: "none",
        }}
        title="豆阁助手 - 问答传统文化与拼豆知识"
      >
        🤖
      </button>
    </>
  );
}
