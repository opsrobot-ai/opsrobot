import { useEffect, useRef, useState } from "react";
import { getStableMarkdownPrefixLength } from "../messageDisplayUtils.js";

/** 目标展示速率：字符/秒（滞后可提高，避免整段突跳） */
const CPS_BASE = 32;
const CPS_MAX = 480;
/** 首屏快速露字，减少只有三跳点的时间 */
const FIRST_BURST = 64;

/**
 * 流式时对 text 做展示层追赶，减轻高频增量导致的顿挫；结束时与全文对齐。
 * @param {string} text
 * @param {boolean} streaming
 * @param {string} streamKey  同一条流式消息的稳定 id（如 message id）
 */
export function useSmoothDisplayedText(text, streaming, streamKey) {
  const targetRef = useRef(text);
  const displayedLenRef = useRef(streaming ? 0 : (text ?? "").length);
  const [displayedText, setDisplayedText] = useState(() => (streaming ? "" : text ?? ""));
  const lastFrameTimeRef = useRef(0);

  targetRef.current = text;

  useEffect(() => {
    if (streaming) return;
    displayedLenRef.current = text.length;
    setDisplayedText(text);
  }, [streaming, text]);

  useEffect(() => {
    if (!streaming) return;

    displayedLenRef.current = 0;
    setDisplayedText("");
    lastFrameTimeRef.current = 0;

    let rafId = 0;
    const loop = (now) => {
      const t = targetRef.current;
      const safeCap = streaming ? getStableMarkdownPrefixLength(t) : t.length;
      /** 可同时展示的最大下标（exclusive）：不超过稿本、不超过结构安全前缀 */
      const ceiling = Math.min(t.length, safeCap);

      let len = Math.min(displayedLenRef.current, ceiling);

      if (len >= ceiling && ceiling >= t.length) {
        displayedLenRef.current = ceiling;
        setDisplayedText(t.slice(0, ceiling));
        rafId = requestAnimationFrame(loop);
        return;
      }

      const lag = ceiling - len;
      if (lag <= 0) {
        displayedLenRef.current = len;
        setDisplayedText(t.slice(0, len));
        rafId = requestAnimationFrame(loop);
        return;
      }

      const prev = lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      const dt = prev ? Math.min((now - prev) / 1000, 0.2) : 1 / 60;

      let cps = CPS_BASE + (CPS_MAX - CPS_BASE) * Math.min(Math.max(lag - 120, 0) / 800, 1);
      let step = Math.max(1, Math.round(cps * dt));

      if (len === 0 && ceiling > 0) {
        step = Math.min(Math.max(step, Math.min(FIRST_BURST, ceiling)), lag);
      } else {
        step = Math.min(step, lag);
      }

      len = Math.min(len + step, ceiling);
      displayedLenRef.current = len;
      setDisplayedText(t.slice(0, len));

      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [streaming, streamKey]);

  return displayedText;
}
