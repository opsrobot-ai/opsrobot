/**
 * 根因推理（stage3）报告：从正文提取 topology_map.json / anomaly_pattern.json 路径，
 * 请求 viz-json 后在 Tab 最前展示拓扑图与异常模式两块图表卡片。
 */
import { useEffect, useMemo, useState } from "react";
import { extractStage3VizAttachmentPaths } from "../../lib/sreMessageVizExtract.js";
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

export function Stage3AttachmentVizCards({ markdown }) {
  const paths = useMemo(() => extractStage3VizAttachmentPaths(markdown || ""), [markdown]);

  const [topology, setTopology] = useState({ status: "idle", payload: null, error: null });
  const [anomaly, setAnomaly] = useState({ status: "idle", payload: null, error: null });

  useEffect(() => {
    const tPath = paths.topologyMap;
    const aPath = paths.anomalyPattern;
    if (!tPath && !aPath) {
      setTopology({ status: "idle", payload: null, error: null });
      setAnomaly({ status: "idle", payload: null, error: null });
      return;
    }

    const ac = new AbortController();

    if (tPath) setTopology({ status: "loading", payload: null, error: null });
    else setTopology({ status: "idle", payload: null, error: null });

    if (aPath) setAnomaly({ status: "loading", payload: null, error: null });
    else setAnomaly({ status: "idle", payload: null, error: null });

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

    if (tPath) void fetchOne(tPath, "topology_map", setTopology);
    if (aPath) void fetchOne(aPath, "anomaly_pattern", setAnomaly);

    return () => ac.abort();
  }, [paths.topologyMap, paths.anomalyPattern]);

  if (!paths.topologyMap && !paths.anomalyPattern) return null;

  return (
    <div className="space-y-3">
      {paths.topologyMap ? (
        topology.status === "loading" ? (
          <AttachmentLoadingCard label="拓扑图（附件）" />
        ) : topology.status === "error" ? (
          <AttachmentErrorCard label="拓扑图（附件）" message={topology.error || "加载失败"} />
        ) : topology.status === "ready" && topology.payload ? (
          <SreVizTopologyMap panel={{ type: "topology_map", payload: topology.payload }} />
        ) : null
      ) : null}

      {paths.anomalyPattern ? (
        anomaly.status === "loading" ? (
          <AttachmentLoadingCard label="异常模式（附件）" />
        ) : anomaly.status === "error" ? (
          <AttachmentErrorCard label="异常模式（附件）" message={anomaly.error || "加载失败"} />
        ) : anomaly.status === "ready" && anomaly.payload ? (
          <SreVizAnomalyPattern panel={{ type: "anomaly_pattern", payload: anomaly.payload }} />
        ) : null
      ) : null}
    </div>
  );
}
