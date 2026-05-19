"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { IMAGE_FILTER_OPTIONS, type ImageFilter } from "@/utils/colorSystemUtils";

type Props = {
  value: ImageFilter;
  onChange: (value: ImageFilter) => void;
};

export default function FilterDropdown({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 智能定位：如果下方空间不足，则向上展开
  const updateDropDirection = useCallback(() => {
    if (!ref.current || !menuRef.current) return;
    const btnRect = ref.current.getBoundingClientRect();
    const menuHeight = menuRef.current.scrollHeight;
    const spaceBelow = window.innerHeight - btnRect.bottom;
    const spaceAbove = btnRect.top;
    setDropUp(spaceBelow < menuHeight && spaceAbove > spaceBelow);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleResize = () => {
      if (open) updateDropDirection();
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleResize);
    };
  }, [open, updateDropDirection]);

  // 打开时计算定位方向
  const handleToggle = useCallback(() => {
    setOpen(prev => {
      if (!prev) {
        // 将在 useEffect 中计算方向
        requestAnimationFrame(() => updateDropDirection());
      }
      return !prev;
    });
  }, [updateDropDirection]);

  const selected = IMAGE_FILTER_OPTIONS.find((f) => f.key === value) ?? IMAGE_FILTER_OPTIONS[0];

  return (
    <div ref={ref} className="relative" title={selected.name}>
      {/* 按钮显示名称 */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm hover:bg-stone-50 transition whitespace-nowrap"
      >
        <span className="text-stone-700">{selected.name}</span>
      </button>

      {/* 自定义下拉菜单 */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={menuRef}
            className={`absolute z-50 mt-1 w-44 rounded-md border border-stone-200 bg-white py-1 shadow-lg ${
              dropUp ? 'bottom-full mb-1' : 'top-full'
            }`}
            style={dropUp ? { bottom: '100%', marginBottom: '4px' } : { top: '100%', marginTop: '4px' }}
          >
            {IMAGE_FILTER_OPTIONS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  onChange(f.key);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                  f.key === value
                    ? "bg-stone-100 font-semibold text-stone-900"
                    : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                }`}
              >
                <span className="flex-1">{f.name}</span>
                {f.key === value && <span className="text-xs text-[#8f1d21]">已选</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
