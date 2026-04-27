/**
 * 环境感知（stage1）报告：从正文提取 metrics_trend.json / logs_distribution.json 路径，
 * 请求 viz-json 后在 Tab 最前展示两块图表卡片。
 */
import { useEffect, useMemo, useState } from "react";
import { extractStage1VizAttachmentPaths } from "../../lib/sreMessageVizExtract.js";
import { SreVizMetricsTrend } from "./sre-viz/SreVizMetricsTrend.jsx";
import { SreVizLogsDistribution } from "./sre-viz/SreVizLogsDistribution.jsx";

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

export function Stage1AttachmentVizCards({ markdown }) {
  const paths = useMemo(() => extractStage1VizAttachmentPaths(markdown || ""), [markdown]);

  const [metrics, setMetrics] = useState({ status: "idle", payload: null, error: null });
  const [logs, setLogs] = useState({ status: "idle", payload: null, error: null });

  useEffect(() => {
    const mPath = paths.metricsTrend;
    const lPath = paths.logsDistribution;
    if (!mPath && !lPath) {
      setMetrics({ status: "idle", payload: null, error: null });
      setLogs({ status: "idle", payload: null, error: null });
      return;
    }

    const ac = new AbortController();

    if (mPath) setMetrics({ status: "loading", payload: null, error: null });
    else setMetrics({ status: "idle", payload: null, error: null });

    if (lPath) setLogs({ status: "loading", payload: null, error: null });
    else setLogs({ status: "idle", payload: null, error: null });

    const fetchOne = async (path, expectedType, setSlot) => {
      try {
        const r = await fetch(`/api/sre-agent/viz-json?path=${encodeURIComponent(path)}`, {
          signal: ac.signal,
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!validateVizType(data, expectedType)) throw new Error("返回 JSON 类型与文件不符");
        setSlot({ status: "ready", payload: data, error: null });
      } catch (e) {
        if (e?.name === "AbortError") return;
        setSlot({ status: "error", payload: null, error: e?.message || String(e) });
      }
    };

    if (mPath) void fetchOne(mPath, "metrics_trend", setMetrics);
    if (lPath) void fetchOne(lPath, "logs_distribution", setLogs);

    return () => ac.abort();
  }, [paths.metricsTrend, paths.logsDistribution]);

  if (!paths.metricsTrend && !paths.logsDistribution) return null;

  return (
    <div className="space-y-3">
      {paths.metricsTrend ? (
        metrics.status === "loading" ? (
          <AttachmentLoadingCard label="指标趋势（附件）" />
        ) : metrics.status === "error" ? (
          <AttachmentErrorCard label="指标趋势（附件）" message={metrics.error || "加载失败"} />
        ) : metrics.status === "ready" && metrics.payload ? (
          <SreVizMetricsTrend panel={{ type: "metrics_trend", payload: metrics.payload }} />
        ) : null
      ) : null}

      {paths.logsDistribution ? (
        logs.status === "loading" ? (
          <AttachmentLoadingCard label="日志分布（附件）" />
        ) : logs.status === "error" ? (
          <AttachmentErrorCard label="日志分布（附件）" message={logs.error || "加载失败"} />
        ) : logs.status === "ready" && logs.payload ? (
          <SreVizLogsDistribution panel={{ type: "logs_distribution", payload: logs.payload }} />
        ) : null
      ) : null}
    </div>
  );
}
