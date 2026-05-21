"use client";

import { useCallback, useEffect, useRef } from "react";

/** localStorage 中保存自动保存间隔的键名 */
const AUTO_SAVE_INTERVAL_KEY = "douyun_autosave_interval";

/** 默认自动保存间隔（毫秒） */
const DEFAULT_INTERVAL_MS = 30000;

/**
 * 加载用户设置的自动保存间隔（毫秒）
 */
export function loadAutoSaveInterval(): number {
  if (typeof window === "undefined") return DEFAULT_INTERVAL_MS;
  try {
    const raw = localStorage.getItem(AUTO_SAVE_INTERVAL_KEY);
    if (raw) {
      const val = parseInt(raw, 10);
      if (Number.isFinite(val) && val >= 5000 && val <= 600000) {
        return val;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_INTERVAL_MS;
}

/**
 * 保存自动保存间隔（毫秒）
 */
export function saveAutoSaveInterval(ms: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTO_SAVE_INTERVAL_KEY, String(ms));
  } catch {
    // ignore
  }
}

/**
 * 格式化间隔为可读文本
 */
export function formatAutoSaveInterval(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)} 秒`;
  return `${Math.round(ms / 60000)} 分钟`;
}

/**
 * 自动保存 Hook
 * @param onSave 保存回调函数
 * @param enabled 是否启用自动保存（仅在创作过程中启用）
 */
export function useAutoSave(
  onSave: () => void,
  enabled: boolean,
) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const getInterval = useCallback(() => loadAutoSaveInterval(), []);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const interval = getInterval();
    timerRef.current = setInterval(() => {
      onSaveRef.current();
    }, interval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, getInterval]);
}
