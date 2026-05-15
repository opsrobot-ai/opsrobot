/**
 * 阶段 content JSON Tab：从文本人造线索（序列化 JSON + 嵌套文件 path）中提取五种 viz 附件路径，
 * 与 Markdown 报告的 Stage1–3 AttachmentVizCards 行为一致。
 */
import { useEffect, useMemo, useState } from "react";
import {
  extractStage1VizAttachmentPaths,
  extractStage2VizAttachmentPaths,
  extractStage3VizAttachmentPaths,
} from "../../lib/sreMessageVizExtract.js";
import { SreVizMetricsTrend } from "./sre-viz/SreVizMetricsTrend.jsx";
import { SreVizLogsDistribution } from "./sre-viz/SreVizLogsDistribution.jsx";
import { SreVizTraceCallChain } from "./sre-viz/SreVizTraceCallChain.jsx";
import { SreVizTopologyMap } from "./sre-viz/SreVizTopologyMap.jsx";
import { SreVizAnomalyPattern } from "./sre-viz/SreVizAnomalyPattern.jsx";

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

function buildStageJsonScanText(root, nested) {
  const chunks = [];
  try {
    chunks.push(JSON.stringify(root ?? ""));
  } catch {
    chunks.push("");
  }
  if (nested && typeof nested === "object") {
    for (const v of Object.values(nested)) {
      const p = v && typeof v === "object" ? String(v.path || "").trim() : "";
      if (p) chunks.push(p);
    }
  }
  return chunks.join("\n");
}

function useFetchedViz(path, expectedType, enabled) {
  const [slot, setSlot] = useState({ status: enabled && path ? "loading" : "idle", payload: null, error: null });

  useEffect(() => {
    if (!enabled || !path) {
      setSlot({ status: "idle", payload: null, error: null });
      return;
    }
    const ac = new AbortController();
    setSlot({ status: "loading", payload: null, error: null });
    void (async () => {
      try {
        const r = await fetch(`/api/sre-agent/viz-json?path=${encodeURIComponent(path)}`, { signal: ac.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!validateVizType(data, expectedType)) throw new Error("返回 JSON 类型与预期不符");
        setSlot({ status: "ready", payload: data, error: null });
      } catch (e) {
        if (e?.name === "AbortError") return;
        setSlot({ status: "error", payload: null, error: e?.message || String(e) });
      }
    })();
    return () => ac.abort();
  }, [path, expectedType, enabled]);

  return slot;
}

/**
 * @param {{ stage: string; root: unknown; nested?: Record<string, unknown> }}
 */
export function SreStageJsonVizAttachments({ stage, root, nested }) {
  const nestedPathsExclusive = useMemo(() => {
    const set = new Set();
    if (nested && typeof nested === "object") {
      for (const v of Object.values(nested)) {
        const p = v && typeof v === "object" ? String(v.path || "").trim() : "";
        if (p) set.add(p);
      }
    }
    return set;
  }, [nested]);

  const scanText = useMemo(() => buildStageJsonScanText(root, nested), [root, nested]);

  const stage1Paths = useMemo(() => {
    if (stage !== "stage1") return { metricsTrend: null, logsDistribution: null };
    const raw = extractStage1VizAttachmentPaths(scanText);
    return {
      metricsTrend: raw.metricsTrend && !nestedPathsExclusive.has(raw.metricsTrend.trim()) ? raw.metricsTrend : null,
      logsDistribution:
        raw.logsDistribution && !nestedPathsExclusive.has(raw.logsDistribution.trim()) ? raw.logsDistribution : null,
    };
  }, [stage, scanText, nestedPathsExclusive]);

  const stage2Paths = useMemo(() => {
    if (stage !== "stage2") return { traceCallChain: null };
    const raw = extractStage2VizAttachmentPaths(scanText);
    return {
      traceCallChain:
        raw.traceCallChain && !nestedPathsExclusive.has(raw.traceCallChain.trim()) ? raw.traceCallChain : null,
    };
  }, [stage, scanText, nestedPathsExclusive]);

  const stage3Paths = useMemo(() => {
    if (stage !== "stage3") return { topologyMap: null, anomalyPattern: null };
    const raw = extractStage3VizAttachmentPaths(scanText);
    return {
      topologyMap: raw.topologyMap && !nestedPathsExclusive.has(raw.topologyMap.trim()) ? raw.topologyMap : null,
      anomalyPattern:
        raw.anomalyPattern && !nestedPathsExclusive.has(raw.anomalyPattern.trim()) ? raw.anomalyPattern : null,
    };
  }, [stage, scanText, nestedPathsExclusive]);

  const mPath = stage === "stage1" ? stage1Paths.metricsTrend : null;
  const lPath = stage === "stage1" ? stage1Paths.logsDistribution : null;
  const tPath = stage === "stage2" ? stage2Paths.traceCallChain : null;
  const topoPath = stage === "stage3" ? stage3Paths.topologyMap : null;
  const anomalyPath = stage === "stage3" ? stage3Paths.anomalyPattern : null;

  const metrics = useFetchedViz(mPath, "metrics_trend", stage === "stage1" && Boolean(mPath));
  const logs = useFetchedViz(lPath, "logs_distribution", stage === "stage1" && Boolean(lPath));
  const trace = useFetchedViz(tPath, "trace_call_chain", stage === "stage2" && Boolean(tPath));
  const topology = useFetchedViz(topoPath, "topology_map", stage === "stage3" && Boolean(topoPath));
  const anomaly = useFetchedViz(anomalyPath, "anomaly_pattern", stage === "stage3" && Boolean(anomalyPath));

  if (stage === "stage4" || stage === "final") return null;

  const showStage1 = stage === "stage1" && (mPath || lPath);
  const showStage2 = stage === "stage2" && tPath;
  const showStage3 = stage === "stage3" && (topoPath || anomalyPath);
  if (!showStage1 && !showStage2 && !showStage3) return null;

  return (
    <div className="space-y-3">
      {mPath ? (
        metrics.status === "loading" ? (
          <AttachmentLoadingCard label="指标趋势图（JSON 引用）" />
        ) : metrics.status === "error" ? (
          <AttachmentErrorCard label="指标趋势图" message={metrics.error || "加载失败"} />
        ) : metrics.payload ? (
          <SreVizMetricsTrend panel={{ type: "metrics_trend", payload: metrics.payload }} />
        ) : null
      ) : null}

      {lPath ? (
        logs.status === "loading" ? (
          <AttachmentLoadingCard label="日志分布（JSON 引用）" />
        ) : logs.status === "error" ? (
          <AttachmentErrorCard label="日志分布" message={logs.error || "加载失败"} />
        ) : logs.payload ? (
          <SreVizLogsDistribution panel={{ type: "logs_distribution", payload: logs.payload }} />
        ) : null
      ) : null}

      {tPath ? (
        trace.status === "loading" ? (
          <AttachmentLoadingCard label="调用链（JSON 引用）" />
        ) : trace.status === "error" ? (
          <AttachmentErrorCard label="调用链" message={trace.error || "加载失败"} />
        ) : trace.payload ? (
          <SreVizTraceCallChain panel={{ type: "trace_call_chain", payload: trace.payload }} />
        ) : null
      ) : null}

      {topoPath ? (
        topology.status === "loading" ? (
          <AttachmentLoadingCard label="拓扑图（JSON 引用）" />
        ) : topology.status === "error" ? (
          <AttachmentErrorCard label="拓扑图" message={topology.error || "加载失败"} />
        ) : topology.payload ? (
          <SreVizTopologyMap panel={{ type: "topology_map", payload: topology.payload }} />
        ) : null
      ) : null}

      {anomalyPath ? (
        anomaly.status === "loading" ? (
          <AttachmentLoadingCard label="异常模式（JSON 引用）" />
        ) : anomaly.status === "error" ? (
          <AttachmentErrorCard label="异常模式" message={anomaly.error || "加载失败"} />
        ) : anomaly.payload ? (
          <SreVizAnomalyPattern panel={{ type: "anomaly_pattern", payload: anomaly.payload }} />
        ) : null
      ) : null}
    </div>
  );
}
