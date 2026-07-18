"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  checkServerEnvConfig,
  getDefaultChatMessages,
  isApiConfigured,
  loadAiChatHistory,
  loadAiChatHistoryAsync,
  loadAiChatMode,
  saveAiChatHistory,
  saveAiChatMode,
  streamChatMessage,
  type ChatMessage,
  type ChatMode,
} from "@/utils/aiChat";
import type { AppLanguage } from "@/utils/language";

type Props = {
  isOpen?: boolean;
  onClose?: () => void;
  resetToken?: number;
  embedded?: boolean;
  language?: AppLanguage;
};

function renderInlineMarkdown(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded bg-stone-200 px-1 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    return <span key={index}>{part}</span>;
  });
}

function renderMarkdown(content: string): ReactNode {
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    nodes.push(
      <ul key={`list-${nodes.length}`} className="my-2 list-disc space-y-1 pl-5">
        {listItems.map((item, index) => <li key={index}>{renderInlineMarkdown(item)}</li>)}
      </ul>,
    );
    listItems = [];
  };

  content.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      return;
    }
    flushList();
    if (!trimmed) {
      nodes.push(<div key={`space-${index}`} className="h-2" />);
      return;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      nodes.push(
        <p key={index} className={heading[1].length === 1 ? "mt-2 text-base font-semibold" : "mt-2 text-sm font-semibold"}>
          {renderInlineMarkdown(heading[2])}
        </p>,
      );
      return;
    }
    nodes.push(<p key={index} className="my-1">{renderInlineMarkdown(trimmed)}</p>);
  });
  flushList();

  return nodes;
}

let pendingAbortController: AbortController | null = null;

export default function AiChatPanel({ isOpen = true, onClose, resetToken = 0, embedded = false, language = "zh" }: Props) {
  const ui = useMemo(() => ({
    title: "豆阁AI",
    apiWarning: language === "en" ? "API is not configured. Doge AI is unavailable." : "未配置 API，暂时无法使用豆阁AI。",
    gotIt: language === "en" ? "Got it" : "知道了",
    close: language === "en" ? "Close" : "关闭",
    imageAlt: language === "en" ? "Doge AI generated image" : "豆阁AI生成图像",
    textMode: language === "en" ? "Text Chat" : "文字对话",
    imageMode: language === "en" ? "Image Mode" : "生图模式",
    configureApi: language === "en" ? "Configure an API key in settings first..." : "请先在设置中配置 API Key...",
    imagePlaceholder: language === "en" ? "Enter an image prompt..." : "输入生图提示词...",
    textPlaceholder: language === "en" ? "Ask a question..." : "输入想聊的问题...",
    interruptImage: language === "en" ? "Stop image generation" : "中断生图",
    interruptText: language === "en" ? "Stop response" : "中断回复",
    send: language === "en" ? "Send" : "发送",
    generating: language === "en" ? "Generating image..." : "正在生成图像...",
    thinking: language === "en" ? "Thinking..." : "正在思考...",
    imageStopped: language === "en" ? "Image generation stopped." : "已中断生图。",
    textStopped: language === "en" ? "Response stopped." : "已中断回复。",
    sendFailed: language === "en" ? "Failed to send. Please try again." : "发送失败，请重试",
    errorPrefix: language === "en" ? "Error: " : "出错了：",
  }), [language]);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadAiChatHistory());
  const [mode, setMode] = useState<ChatMode>(() => loadAiChatMode());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(
    () => pendingAbortController !== null && !pendingAbortController.signal.aborted,
  );
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApiWarning, setShowApiWarning] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const resetTokenRef = useRef(resetToken);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    loadAiChatHistoryAsync().then((history) => {
      if (!alive) return;
      setMessages(history);
      setHistoryLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (pendingAbortController && !pendingAbortController.signal.aborted) {
      abortControllerRef.current = pendingAbortController;
    }
  }, []);

  useEffect(() => {
    checkServerEnvConfig().then(() => {
      if (!isApiConfigured()) setShowApiWarning(true);
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!historyLoaded) return;
    saveAiChatHistory(messages);
  }, [historyLoaded, messages]);

  useEffect(() => {
    saveAiChatMode(mode);
  }, [mode]);

  useEffect(() => {
    if (resetTokenRef.current === resetToken) return;
    resetTokenRef.current = resetToken;
    pendingAbortController?.abort();
    pendingAbortController = null;
    abortControllerRef.current = null;
    setMessages(getDefaultChatMessages(language));
    setError(null);
    setInput("");
    setLoading(false);
    setMode("text");
  }, [language, resetToken]);

  function persistMessages(updater: (prev: ChatMessage[]) => ChatMessage[]) {
    setMessages((prev) => {
      const next = updater(prev);
      saveAiChatHistory(next);
      return next;
    });
  }

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;

    setInput("");
    setError(null);

    const userMsg: ChatMessage = { role: "user", content: prompt };
    const nextMessages = [...messages, userMsg];
    const assistantIndex = nextMessages.length;

    const abortController = new AbortController();
    pendingAbortController = abortController;
    abortControllerRef.current = abortController;

    persistMessages(() => [
      ...nextMessages,
      { role: "assistant", content: mode === "image" ? ui.generating : ui.thinking },
    ]);
    setLoading(true);

    try {
      await streamChatMessage(
        nextMessages,
        mode,
        (content) => {
          persistMessages((prev) =>
            prev.map((item, index) => (
              index === assistantIndex ? { ...item, content } : item
            )),
          );
        },
        (imageUrl) => {
          persistMessages((prev) =>
            prev.map((item, index) => (
              index === assistantIndex ? { ...item, imageUrl } : item
            )),
          );
        },
        abortController.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        persistMessages((prev) =>
          prev.map((item, index) => (
            index === assistantIndex
              ? { role: "assistant", content: mode === "image" ? ui.imageStopped : ui.textStopped }
              : item
          )),
        );
        return;
      }

      const message = err instanceof Error ? err.message : ui.sendFailed;
      setError(message);
      persistMessages((prev) =>
        prev.map((item, index) => (
          index === assistantIndex ? { role: "assistant", content: `${ui.errorPrefix}${message}` } : item
        )),
      );
    } finally {
      setLoading(false);
      pendingAbortController = null;
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }, [input, loading, messages, mode, ui]);

  const handleInterrupt = useCallback(() => {
    pendingAbortController?.abort();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape") onClose?.();
    },
    [handleSend, onClose],
  );

  if (!isOpen) return null;

  const chat = (
    <div
      className={embedded ? "flex h-[calc(100vh-10rem)] min-h-[620px] w-full flex-col rounded-lg border border-stone-200 bg-white shadow-sm" : "mx-4 flex h-[600px] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl"}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between rounded-t-lg bg-[#2b2118] px-5 py-3 text-white">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{ui.title}</span>
        </div>
        {!embedded && (
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label={ui.close}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {showApiWarning && (
        <div className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {ui.apiWarning}
          <button
            type="button"
            onClick={() => setShowApiWarning(false)}
            className="ml-2 font-medium text-amber-900 underline hover:no-underline"
          >
            {ui.gotIt}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.map((msg, index) => (
          <div key={index} className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "rounded-br-md bg-[#8f1d21] text-white"
                  : "rounded-bl-md bg-stone-100 text-stone-800"
              }`}
            >
              {msg.content ? renderMarkdown(msg.content) : (
                <span className="inline-flex gap-1 text-stone-500">
                  <span className="animate-bounce">.</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.4s" }}>.</span>
                </span>
              )}
              {msg.imageUrl && (
                <img
                  src={msg.imageUrl}
                  alt={ui.imageAlt}
                  className="mt-3 max-h-[520px] w-full rounded-lg border border-stone-200 bg-white object-contain"
                />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-stone-200 px-4 py-3">
        {error && !loading && (
          <p className="mb-2 text-xs text-red-500">{error}</p>
        )}
        <div className="mb-3 inline-flex rounded-lg border border-[#8f1d21]/25 bg-[#8f1d21]/8 p-1">
          <button
            type="button"
            onClick={() => setMode("text")}
            disabled={loading}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === "text" ? "bg-[#8f1d21] text-white shadow-sm" : "text-[#8f1d21]/72 hover:text-[#8f1d21]"
            } disabled:opacity-50`}
          >
            {ui.textMode}
          </button>
          <button
            type="button"
            onClick={() => setMode("image")}
            disabled={loading}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === "image" ? "bg-[#8f1d21] text-white shadow-sm" : "text-[#8f1d21]/72 hover:text-[#8f1d21]"
            } disabled:opacity-50`}
          >
            {ui.imageMode}
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={showApiWarning ? ui.configureApi : mode === "image" ? ui.imagePlaceholder : ui.textPlaceholder}
            disabled={showApiWarning || loading}
            className="flex-1 rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-[#8f1d21] focus:outline-none focus:ring-1 focus:ring-[#8f1d21] disabled:opacity-50"
            autoFocus
          />
          <button
            type="button"
            onClick={loading ? handleInterrupt : handleSend}
            disabled={showApiWarning || (!loading && !input.trim())}
            aria-label={loading ? (mode === "image" ? ui.interruptImage : ui.interruptText) : ui.send}
            title={loading ? (mode === "image" ? ui.interruptImage : ui.interruptText) : ui.send}
            className={loading
              ? "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#8f1d21] text-white shadow-sm transition hover:bg-[#a82428] disabled:opacity-50"
              : "rounded-lg bg-[#8f1d21] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            }
          >
            {loading ? <span className="h-3.5 w-3.5 rounded-[2px] bg-white" /> : ui.send}
          </button>
        </div>
      </div>
    </div>
  );

  if (embedded) return chat;

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-black/40" onClick={onClose}>
      {chat}
    </div>
  );
}
