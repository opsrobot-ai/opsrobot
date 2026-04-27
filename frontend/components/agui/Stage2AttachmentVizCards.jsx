/**
 * 异常分析（stage2）报告：从正文提取 trace_call_chain.json 路径，
 * 请求 viz-json 后在 Tab 最前展示调用链图表卡片。
 */
import { useEffect, useMemo, useState } from "react";
import { extractStage2VizAttachmentPaths } from "../../lib/sreMessageVizExtract.js";
import { SreVizTraceCallChain } from "./sre-viz/SreVizTraceCallChain.jsx";

function validateVizType(data, expected) {
  return (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    String(data.type || "").toLowerCase() === expected
  );
}

function AttachmentLoadingCard({ label }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <div className="flex h-24 items-center justify-center rounded-lg bg-gray-50 text-xs text-gray-400 dark:bg-gray-800/80 dark:text-gray-500">
        加载图表数据…
      </div>
    </div>
  );
}

function AttachmentErrorCard({ label, message }) {
  return (
    <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
      <span className="font-medium">{label}</span>
      <span className="mt-1 block text-rose-600/90 dark:text-rose-400/90">{message}</span>
    </div>
  );
}

export function Stage2AttachmentVizCards({ markdown }) {
  const paths = useMemo(() => extractStage2VizAttachmentPaths(markdown || ""), [markdown]);
  const [trace, setTrace] = useState({ status: "idle", payload: null, error: null });

  useEffect(() => {
    const path = paths.traceCallChain;
    if (!path) {
      setTrace({ status: "idle", payload: null, error: null });
      return;
    }

    const ac = new AbortController();
    setTrace({ status: "loading", payload: null, error: null });

    (async () => {
      try {
        const r = await fetch(`/api/sre-agent/viz-json?path=${encodeURIComponent(path)}`, {
          signal: ac.signal,
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!validateVizType(data, "trace_call_chain")) throw new Error("返回 JSON 类型与文件不符");
        setTrace({ status: "ready", payload: data, error: null });
      } catch (e) {
        if (e?.name === "AbortError") return;
        setTrace({ status: "error", payload: null, error: e?.message || String(e) });
      }
    })();

    return () => ac.abort();
  }, [paths.traceCallChain]);

  if (!paths.traceCallChain) return null;

  return (
    <div className="space-y-3">
      {trace.status === "loading" ? (
        <AttachmentLoadingCard label="调用链（附件）" />
      ) : trace.status === "error" ? (
        <AttachmentErrorCard label="调用链（附件）" message={trace.error || "加载失败"} />
      ) : trace.status === "ready" && trace.payload ? (
        <SreVizTraceCallChain panel={{ type: "trace_call_chain", payload: trace.payload }} />
      ) : null}
    </div>
  );
}
