import { memo, useMemo } from "react";
import { SRE_VIZ_TYPES } from "../../lib/sreMessageVizExtract.js";
import { shouldUseStage1ModularLayout } from "../../lib/sreStage1PerceptionModules.js";
import { shouldUseStage2ModularLayout } from "../../lib/sreStage2AnomalyModules.js";
import { shouldUseStage3ModularLayout } from "../../lib/sreStage3RcaModules.js";
import { shouldUseStage4ModularLayout } from "../../lib/sreStage4ActionModules.js";
import { shouldUseFinalReportModularLayout } from "../../lib/sreFinalReportModules.js";
import { isStage1LogsDistributionPayload } from "../../lib/sreStage1LogsDistribution.js";
import { isStage2LogAnomaliesPayload } from "../../lib/sreStage2LogAnomalies.js";
import { isStage2MetricAnomaliesList } from "../../lib/sreStage2MetricAnomalies.js";
import { isStage2AlertAnomaliesList } from "../../lib/sreStage2AlertAnomalies.js";
import { isStage2TraceAnomaliesPayload } from "../../lib/sreStage2TraceAnomalies.js";
import { isStage2TopologyCorrelationPayload } from "../../lib/sreStage2TopologyCorrelation.js";
import { isStage2CorrelationAnalysisPayload } from "../../lib/sreStage2CorrelationAnalysis.js";
import { isStage2AnomalyPatternsTopList } from "../../lib/sreStage2AnomalyPatternsTop.js";
import { isStage2TimelineList } from "../../lib/sreStage2Timeline.js";
import { isStage3RootCauseTimelinePayload } from "../../lib/sreStage3RootCauseTimeline.js";
import { isStage3PropagationTopologyPayload } from "../../lib/sreStage3PropagationTopology.js";
import { isStage3ImpactAnalysisPayload } from "../../lib/sreStage3ImpactAnalysis.js";
import {
  isStage3EvidenceDataPayload,
  isStage3EvidenceSignalsOnlyArray,
} from "../../lib/sreStage3EvidenceData.js";
import { isStage1MetricsTrendPayload } from "../../lib/sreStage1MetricsTrend.js";
import { isStage1TraceFlamegraphPayload } from "../../lib/sreStage1TraceFlamegraph.js";
import { isStage1AlertsDistributionPayload } from "../../lib/sreStage1AlertsDistribution.js";
import { isStage1TopologyMapPayload } from "../../lib/sreStage1TopologyMap.js";
import { isStage1AffectedNodesList } from "../../lib/sreStage1AffectedNodes.js";
import { SreStageJsonVizAttachments } from "./SreStageJsonVizAttachments.jsx";
import { SreStage1PerceptionModules } from "./SreStage1PerceptionModules.jsx";
import { SreStage2AnomalyModules } from "./SreStage2AnomalyModules.jsx";
import { SreStage3RcaModules } from "./SreStage3RcaModules.jsx";
import { SreStage4ActionModules } from "./SreStage4ActionModules.jsx";
import { SreFinalReportModules } from "./SreFinalReportModules.jsx";
import { SreStage2LogAnomaliesPanel } from "./sre-viz/SreStage2LogAnomaliesPanel.jsx";
import { SreStage2MetricAnomaliesPanel } from "./sre-viz/SreStage2MetricAnomaliesPanel.jsx";
import { SreStage2AlertAnomaliesPanel } from "./sre-viz/SreStage2AlertAnomaliesPanel.jsx";
import { SreStage2TraceAnomaliesPanel } from "./sre-viz/SreStage2TraceAnomaliesPanel.jsx";
import { SreStage2TopologyCorrelationPanel } from "./sre-viz/SreStage2TopologyCorrelationPanel.jsx";
import { SreStage2CorrelationAnalysisPanel } from "./sre-viz/SreStage2CorrelationAnalysisPanel.jsx";
import { SreStage2AnomalyPatternsTopPanel } from "./sre-viz/SreStage2AnomalyPatternsTopPanel.jsx";
import { SreStage2TimelinePanel } from "./sre-viz/SreStage2TimelinePanel.jsx";
import { SreStage3PropagationTopologyPanel } from "./sre-viz/SreStage3PropagationTopologyPanel.jsx";
import { SreStage3ImpactAnalysisPanel } from "./sre-viz/SreStage3ImpactAnalysisPanel.jsx";
import { SreStage3EvidenceDataPanel } from "./sre-viz/SreStage3EvidenceDataPanel.jsx";
import { SreStage1MetricsTrendCharts } from "./sre-viz/SreStage1MetricsTrendCharts.jsx";
import { SreStage1TraceFlamegraphView } from "./sre-viz/SreStage1TraceFlamegraphView.jsx";
import { SreStage1AlertsDistributionCharts } from "./sre-viz/SreStage1AlertsDistributionCharts.jsx";
import { SreStage1TopologyMapView } from "./sre-viz/SreStage1TopologyMapView.jsx";
import { SreStage1AffectedNodesPanel } from "./sre-viz/SreStage1AffectedNodesPanel.jsx";
import { SreVizMetricsTrend } from "./sre-viz/SreVizMetricsTrend.jsx";
import { SreVizLogsDistribution } from "./sre-viz/SreVizLogsDistribution.jsx";
import { SreVizTraceCallChain } from "./sre-viz/SreVizTraceCallChain.jsx";
import { SreVizTopologyMap } from "./sre-viz/SreVizTopologyMap.jsx";
import { SreVizAnomalyPattern } from "./sre-viz/SreVizAnomalyPattern.jsx";
import { Stage1DistributionBarChart } from "./sre-viz/SreStage1DistributionBarChart.jsx";

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

const PIPELINE_FLOW = [
  { key: "s1", label: "环境感知", match: /PERCEPTION|STAGE_?1|感知|S1|PRECEPTION/i },
  { key: "s2", label: "异常分析", match: /ANOMAL|ABNORMAL|STAGE_?2|S2/i },
  { key: "s3", label: "根因推理", match: /ROOT|RCA|CAUSE|INFERENCE|STAGE_?3|S3/i },
  { key: "s4", label: "行动建议", match: /ACTION|REMED|SUGGEST|STAGE_?4|MITIGATION|S4/i },
];

function parseFiniteNumber(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)/);
    if (m && Number.isFinite(Number(m[1]))) return Number(m[1]);
  }
  return null;
}

function isSkippedMetadataKey(k) {
  const key = String(k);
  if (key.startsWith("_")) return true;
  return new Set([
    "type",
    "title",
    "timestamp",
    "purpose",
    "incidentId",
    "incident_id",
    "pipeline_status",
    "pipelineStatus",
  ]).has(key);
}

/** 浅层对象的数值字段 → 柱状图（跳过明显元数据键） */
function shallowNumericPairsForBars(obj, maxPairs = 20) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  const pairs = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k);
    if (isSkippedMetadataKey(key)) continue;
    const n = parseFiniteNumber(v);
    if (n == null || Math.abs(n) > 1e15) continue;
    pairs.push({ name: key.length > 28 ? `${key.slice(0, 26)}…` : key, value: n, fullKey: key });
    if (pairs.length >= maxPairs) break;
  }
  return pairs.length >= 2 ? pairs : null;
}

function pipelineHighlightIndex(statusRaw) {
  const s = String(statusRaw ?? "").trim();
  if (!s) return -1;
  if (/COMPLETE|DONE|CLOSED|ARCHIV|SUCCESS|已完成|归档|FINAL/i.test(s)) return PIPELINE_FLOW.length;

  let best = -1;
  let bestLen = -1;
  for (let i = 0; i < PIPELINE_FLOW.length; i++) {
    if (PIPELINE_FLOW[i].match.test(s)) {
      const hit = PIPELINE_FLOW[i].match.exec(s)?.[0]?.length ?? 1;
      if (hit >= bestLen) {
        best = i;
        bestLen = hit;
      }
    }
  }
  return best;
}

function PipelineProgressStrip({ pipelineStatus }) {
  const highlight = pipelineHighlightIndex(pipelineStatus);
  if (pipelineStatus == null || String(pipelineStatus).trim() === "") return null;

  const allDone = highlight >= PIPELINE_FLOW.length;

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-700 dark:bg-gray-900 dark:ring-white/[0.04]">
      <p className="mb-3 text-[11px] font-medium text-gray-500 dark:text-gray-400">
        流水线状态
      </p>
      <div className="relative flex flex-wrap items-center gap-1 pb-8 sm:flex-nowrap sm:gap-0">
        {PIPELINE_FLOW.map((step, i) => {
          const done = allDone || highlight > i;
          const active = allDone ? false : highlight === i;
          const ring = active
            ? "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-400"
            : done
              ? "border-emerald-400/70 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-100 dark:border-emerald-600/60"
              : "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400";

          return (
            <div key={step.key} className="relative flex min-w-0 flex-1 items-center">
              <div className={`z-10 flex w-full flex-col items-center px-1`}>
                <div
                  className={`flex h-8 w-full max-w-[6.5rem] items-center justify-center rounded-lg border text-[10px] font-semibold shadow-sm transition ${ring}`}
                  title={step.label}
                >
                  <span className="truncate px-1 text-center">{step.label}</span>
                </div>
              </div>
              {i < PIPELINE_FLOW.length - 1 ? (
                <div
                  className="pointer-events-none absolute left-[calc(50%+2.75rem)] right-[-6px] top-[15px] hidden h-0.5 sm:block md:left-[calc(50%+3.25rem)]"
                  aria-hidden
                >
                  <div
                    className={`h-full rounded bg-gradient-to-r ${
                      highlight > i || allDone
                        ? "from-emerald-400 to-emerald-300 opacity-95 dark:from-emerald-700 dark:to-emerald-700/70"
                        : highlight === i
                          ? "from-blue-400 to-gray-200 dark:from-blue-600 dark:to-gray-700"
                          : "from-gray-200 to-gray-100 dark:from-gray-700 dark:to-gray-800"
                    }`}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-[-1.75rem] break-words rounded-lg border border-gray-100/80 bg-gray-50/90 px-2.5 py-1.5 font-mono text-[11px] text-gray-700 shadow-inner ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-950/55 dark:text-gray-200 dark:ring-white/[0.05]">
        {String(pipelineStatus)}
      </p>
    </div>
  );
}

function JsonBlock({ value }) {
  const text = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-[12px] leading-relaxed text-slate-700 shadow-inner dark:border-slate-800/80 dark:bg-slate-900/50 dark:text-slate-300">
      {text}
    </pre>
  );
}

function TextBlock({ text }) {
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-[12px] leading-relaxed text-slate-700 shadow-inner dark:border-slate-800/80 dark:bg-slate-900/50 dark:text-slate-300">
      {text}
    </pre>
  );
}

function NumericShallowBars({ pairs }) {
  if (!pairs?.length) return null;
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-700 dark:bg-gray-900 dark:ring-white/[0.04]">
      <p className="mb-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">数值字段预览</p>
      <Stage1DistributionBarChart
        data={pairs}
        fallbackPalette={CHART_COLORS}
        yAxisWidth={104}
        tooltipUnit="数值"
        maxHeight={280}
        allowDecimals
        tooltipLabelFormatter={(label, p) => {
          const row = Array.isArray(p) ? p[0]?.payload : p?.payload;
          const fk = row?.fullKey;
          if (fk != null && String(fk).trim() !== "") return String(fk);
          return String(label ?? "");
        }}
      />
    </div>
  );
}

/** 已为 SRE 约定的 type 时使用既有大屏组件 */
function KnownVizFromJson({ data }) {
  const ty = String(data?.type || "").toLowerCase();
  if (!SRE_VIZ_TYPES.has(ty)) return null;
  const panel = { type: ty, payload: data };
  switch (ty) {
    case "metrics_trend":
      return <SreVizMetricsTrend panel={panel} />;
    case "logs_distribution":
      return <SreVizLogsDistribution panel={panel} />;
    case "trace_call_chain":
      return <SreVizTraceCallChain panel={panel} />;
    case "topology_map":
      return <SreVizTopologyMap panel={panel} />;
    case "anomaly_pattern":
      return <SreVizAnomalyPattern panel={panel} />;
    default:
      return null;
  }
}

const SreStageContentJsonPanel = memo(function SreStageContentJsonPanel({ sourcePath, stageJson, stage = "stage1" }) {
  const root = stageJson?.root;
  const nested = stageJson?.nested ?? {};

  const topKeys = useMemo(() => {
    if (root && typeof root === "object" && !Array.isArray(root)) return Object.keys(root);
    return [];
  }, [root]);

  const pipelineStatus = useMemo(() => {
    if (root && typeof root === "object" && !Array.isArray(root)) {
      const v = root.pipeline_status ?? root.pipelineStatus;
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
    }
    return null;
  }, [root]);

  const shallowBars = useMemo(() => shallowNumericPairsForBars(root), [root]);

  const useStage1Modular = stage === "stage1" && shouldUseStage1ModularLayout(root, nested);
  const useStage2Modular = stage === "stage2" && shouldUseStage2ModularLayout(root, nested);
  const useStage3Modular = stage === "stage3" && shouldUseStage3ModularLayout(root, nested);
  const useStage4Modular = stage === "stage4" && shouldUseStage4ModularLayout(root, nested);
  const useFinalModular = stage === "final" && shouldUseFinalReportModularLayout(root, nested);
  const useModularLayout =
    useStage1Modular ||
    useStage2Modular ||
    useStage3Modular ||
    useStage4Modular ||
    useFinalModular;

  if (root != null && isStage1LogsDistributionPayload(root)) {
    return (
      <div className="space-y-4">
        {!useModularLayout ? (
          <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-700 dark:bg-gray-900 dark:ring-white/[0.04]">
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">阶段数据文件</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-gray-800 dark:text-gray-200">{sourcePath}</p>
          </div>
        ) : null}
        {!useModularLayout ? <SreStageJsonVizAttachments stage={stage} root={root} nested={nested} /> : null}
        {!useModularLayout && pipelineStatus ? (
          <PipelineProgressStrip pipelineStatus={pipelineStatus} />
        ) : null}
        {!useModularLayout && shallowBars?.length ? <NumericShallowBars pairs={shallowBars} /> : null}
        <SreStage1LogsDistributionCharts data={root} variant="standalone" />
      </div>
    );
  }

  if (root != null && isStage1MetricsTrendPayload(root)) {
    return (
      <div className="space-y-4">
        {!useModularLayout ? (
          <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-700 dark:bg-gray-900 dark:ring-white/[0.04]">
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">阶段数据文件</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-gray-800 dark:text-gray-200">{sourcePath}</p>
          </div>
        ) : null}
        {!useModularLayout ? <SreStageJsonVizAttachments stage={stage} root={root} nested={nested} /> : null}
        {!useModularLayout && pipelineStatus ? (
          <PipelineProgressStrip pipelineStatus={pipelineStatus} />
        ) : null}
        {!useModularLayout && shallowBars?.length ? <NumericShallowBars pairs={shallowBars} /> : null}
        <SreStage1MetricsTrendCharts data={root} variant="standalone" />
      </div>
    );
  }

  if (root != null && isStage1TraceFlamegraphPayload(root)) {
    return (
      <div className="space-y-4">
        {!useModularLayout ? (
          <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-700 dark:bg-gray-900 dark:ring-white/[0.04]">
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">阶段数据文件</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-gray-800 dark:text-gray-200">{sourcePath}</p>
          </div>
        ) : null}
        {!useModularLayout ? <SreStageJsonVizAttachments stage={stage} root={root} nested={nested} /> : null}
        {!useModularLayout && pipelineStatus ? (
          <PipelineProgressStrip pipelineStatus={pipelineStatus} />
        ) : null}
        {!useModularLayout && shallowBars?.length ? <NumericShallowBars pairs={shallowBars} /> : null}
        <SreStage1TraceFlamegraphView data={root} variant="standalone" />
      </div>
    );
  }

  if (root != null && isStage1AlertsDistributionPayload(root)) {
    return (
      <div className="space-y-4">
        {!useModularLayout ? (
          <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-700 dark:bg-gray-900 dark:ring-white/[0.04]">
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">阶段数据文件</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-gray-800 dark:text-gray-200">{sourcePath}</p>
          </div>
        ) : null}
        {!useModularLayout ? <SreStageJsonVizAttachments stage={stage} root={root} nested={nested} /> : null}
        {!useModularLayout && pipelineStatus ? (
          <PipelineProgressStrip pipelineStatus={pipelineStatus} />
        ) : null}
        {!useModularLayout && shallowBars?.length ? <NumericShallowBars pairs={shallowBars} /> : null}
        <SreStage1AlertsDistributionCharts data={root} variant="standalone" />
      </div>
    );
  }

  if (root != null && isStage1TopologyMapPayload(root)) {
    return (
      <div className="space-y-4">
        {!useModularLayout ? (
          <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-700 dark:bg-gray-900 dark:ring-white/[0.04]">
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">阶段数据文件</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-gray-800 dark:text-gray-200">{sourcePath}</p>
          </div>
        ) : null}
        {!useModularLayout ? <SreStageJsonVizAttachments stage={stage} root={root} nested={nested} /> : null}
        {!useModularLayout && pipelineStatus ? (
          <PipelineProgressStrip pipelineStatus={pipelineStatus} />
        ) : null}
        {!useModularLayout && shallowBars?.length ? <NumericShallowBars pairs={shallowBars} /> : null}
        <SreStage1TopologyMapView data={root} variant="standalone" />
      </div>
    );
  }

  if (root != null && Array.isArray(root) && isStage1AffectedNodesList(root)) {
    return (
      <div className="space-y-4">
        {!useModularLayout ? (
          <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-700 dark:bg-gray-900 dark:ring-white/[0.04]">
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">阶段数据文件</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-gray-800 dark:text-gray-200">{sourcePath}</p>
          </div>
        ) : null}
        {!useModularLayout ? <SreStageJsonVizAttachments stage={stage} root={root} nested={nested} /> : null}
        {!useModularLayout && pipelineStatus ? (
          <PipelineProgressStrip pipelineStatus={pipelineStatus} />
        ) : null}
        {!useModularLayout && shallowBars?.length ? <NumericShallowBars pairs={shallowBars} /> : null}
        <SreStage1AffectedNodesPanel nodes={root} variant="standalone" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!useModularLayout ? (
        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">阶段数据文件</p>
          <p className="mt-0.5 break-all font-mono text-[11px] text-gray-800 dark:text-gray-200">{sourcePath}</p>
        </div>
      ) : null}

      {useModularLayout ? null : <SreStageJsonVizAttachments stage={stage} root={root} nested={nested} />}

      {!useModularLayout && pipelineStatus ? (
        <PipelineProgressStrip pipelineStatus={pipelineStatus} />
      ) : null}

      {!useModularLayout && shallowBars?.length ? <NumericShallowBars pairs={shallowBars} /> : null}

      {root == null ? (
        <p className="text-xs text-gray-400">暂无数据</p>
      ) : useStage1Modular ? (
        <SreStage1PerceptionModules root={root} nested={nested} />
      ) : useStage2Modular ? (
        <SreStage2AnomalyModules root={root} nested={nested} />
      ) : useStage3Modular ? (
        <SreStage3RcaModules root={root} nested={nested} />
      ) : useStage4Modular ? (
        <SreStage4ActionModules root={root} nested={nested} />
      ) : useFinalModular ? (
        <SreFinalReportModules root={root} nested={nested} />
      ) : topKeys.length === 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">根数据</p>
          {Array.isArray(root) && isStage1AffectedNodesList(root) ? (
              <SreStage1AffectedNodesPanel nodes={root} variant="standalone" />
            ) : root && typeof root === "object" && !Array.isArray(root) && isStage1LogsDistributionPayload(root) ? (
              <SreStage1LogsDistributionCharts data={root} variant="standalone" />
            ) : root && typeof root === "object" && !Array.isArray(root) && isStage1MetricsTrendPayload(root) ? (
              <SreStage1MetricsTrendCharts data={root} variant="standalone" />
            ) : root && typeof root === "object" && !Array.isArray(root) && isStage1TraceFlamegraphPayload(root) ? (
              <SreStage1TraceFlamegraphView data={root} variant="standalone" />
            ) : root && typeof root === "object" && !Array.isArray(root) && isStage1AlertsDistributionPayload(root) ? (
              <SreStage1AlertsDistributionCharts data={root} variant="standalone" />
            ) : root && typeof root === "object" && !Array.isArray(root) && isStage1TopologyMapPayload(root) ? (
              <SreStage1TopologyMapView data={root} variant="standalone" />
            ) : root && typeof root === "object" && !Array.isArray(root) &&
            SRE_VIZ_TYPES.has(String(root.type || "").toLowerCase()) ? (
              <KnownVizFromJson data={root} />
            ) : (
              <JsonBlock value={root} />
            )}
        </div>
      ) : (
        topKeys.map((key) => {
          const rawVal = root[key];
          const slot = nested[key];

          const renderBody = () => {
            if (
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              key === "correlation_analysis" &&
              isStage2CorrelationAnalysisPayload(rawVal)
            ) {
              return <SreStage2CorrelationAnalysisPanel data={rawVal} variant="embedded" />;
            }
            if (
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              key === "topology_correlation" &&
              isStage2TopologyCorrelationPayload(rawVal)
            ) {
              return <SreStage2TopologyCorrelationPanel data={rawVal} variant="embedded" />;
            }
            if (
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              key === "trace_anomalies" &&
              isStage2TraceAnomaliesPayload(rawVal)
            ) {
              return <SreStage2TraceAnomaliesPanel data={rawVal} variant="embedded" />;
            }
            if (
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              key === "log_anomalies" &&
              isStage2LogAnomaliesPayload(rawVal)
            ) {
              return <SreStage2LogAnomaliesPanel data={rawVal} variant="embedded" />;
            }
            if (
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              key === "root_cause_timeline" &&
              isStage3RootCauseTimelinePayload(rawVal)
            ) {
              return <SreStage3RootCauseTimelinePanel data={rawVal} variant="embedded" />;
            }
            if (
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              key === "propagation_topology" &&
              isStage3PropagationTopologyPayload(rawVal)
            ) {
              return <SreStage3PropagationTopologyPanel data={rawVal} variant="embedded" />;
            }
            if (
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              key === "impact_analysis" &&
              isStage3ImpactAnalysisPayload(rawVal)
            ) {
              return <SreStage3ImpactAnalysisPanel data={rawVal} variant="embedded" />;
            }
            if (
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              key === "evidence_data" &&
              isStage3EvidenceDataPayload(rawVal)
            ) {
              return <SreStage3EvidenceDataPanel data={rawVal} variant="embedded" />;
            }
            if (
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              isStage1LogsDistributionPayload(rawVal)
            ) {
              return <SreStage1LogsDistributionCharts data={rawVal} variant="embedded" />;
            }
            if (
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              isStage1MetricsTrendPayload(rawVal)
            ) {
              return <SreStage1MetricsTrendCharts data={rawVal} variant="embedded" />;
            }
            if (
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              isStage1TraceFlamegraphPayload(rawVal)
            ) {
              return <SreStage1TraceFlamegraphView data={rawVal} variant="embedded" />;
            }
            if (
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              isStage1AlertsDistributionPayload(rawVal)
            ) {
              return <SreStage1AlertsDistributionCharts data={rawVal} variant="embedded" />;
            }
            if (
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              isStage1TopologyMapPayload(rawVal)
            ) {
              return <SreStage1TopologyMapView data={rawVal} variant="embedded" />;
            }
            if (Array.isArray(rawVal) && key === "alert_anomalies" && isStage2AlertAnomaliesList(rawVal)) {
              return <SreStage2AlertAnomaliesPanel rows={rawVal} variant="embedded" />;
            }
            if (Array.isArray(rawVal) && key === "metric_anomalies" && isStage2MetricAnomaliesList(rawVal)) {
              return <SreStage2MetricAnomaliesPanel rows={rawVal} variant="embedded" />;
            }
            if (
              Array.isArray(rawVal) &&
              key === "anomaly_patterns_top" &&
              isStage2AnomalyPatternsTopList(rawVal)
            ) {
              return <SreStage2AnomalyPatternsTopPanel rows={rawVal} variant="embedded" />;
            }
            if (Array.isArray(rawVal) && key === "timeline" && isStage2TimelineList(rawVal)) {
              return <SreStage2TimelinePanel rows={rawVal} variant="embedded" />;
            }
            if (Array.isArray(rawVal) && key === "root_cause_timeline" && isStage2TimelineList(rawVal)) {
              return <SreStage2TimelinePanel rows={rawVal} variant="embedded" />;
            }
            if (Array.isArray(rawVal) && isStage1AffectedNodesList(rawVal)) {
              return <SreStage1AffectedNodesPanel nodes={rawVal} variant="embedded" />;
            }
            if (
              Array.isArray(rawVal) &&
              (key === "strong_signals" || key === "weak_signals") &&
              isStage3EvidenceSignalsOnlyArray(rawVal)
            ) {
              return (
                <SreStage3EvidenceDataPanel
                  data={
                    key === "strong_signals"
                      ? { strong_signals: rawVal, weak_signals: [] }
                      : { strong_signals: [], weak_signals: rawVal }
                  }
                  variant="embedded"
                />
              );
            }
            const knownObj =
              rawVal &&
              typeof rawVal === "object" &&
              !Array.isArray(rawVal) &&
              SRE_VIZ_TYPES.has(String(rawVal.type || "").toLowerCase()) ? (
                <KnownVizFromJson data={rawVal} />
              ) : null;
            if (knownObj) return knownObj;

            if (slot) {
              return (
                <div className="space-y-2">
                  {slot.status === "loading" ? (
                    <p className="text-xs text-gray-400">加载引用文件…</p>
                  ) : slot.status === "error" ? (
                    <p className="text-xs text-rose-600 dark:text-rose-400">{slot.error || "加载失败"}</p>
                  ) : slot.kind === "json" ? (
                    Array.isArray(slot.data) &&
                    key === "alert_anomalies" &&
                    isStage2AlertAnomaliesList(slot.data) ? (
                      <SreStage2AlertAnomaliesPanel rows={slot.data} variant="embedded" />
                    ) : Array.isArray(slot.data) &&
                    key === "metric_anomalies" &&
                    isStage2MetricAnomaliesList(slot.data) ? (
                      <SreStage2MetricAnomaliesPanel rows={slot.data} variant="embedded" />
                    ) : Array.isArray(slot.data) &&
                    key === "anomaly_patterns_top" &&
                    isStage2AnomalyPatternsTopList(slot.data) ? (
                      <SreStage2AnomalyPatternsTopPanel rows={slot.data} variant="embedded" />
                    ) : Array.isArray(slot.data) &&
                    key === "timeline" &&
                    isStage2TimelineList(slot.data) ? (
                      <SreStage2TimelinePanel rows={slot.data} variant="embedded" />
                    ) : Array.isArray(slot.data) &&
                    key === "root_cause_timeline" &&
                    isStage2TimelineList(slot.data) ? (
                      <SreStage2TimelinePanel rows={slot.data} variant="embedded" />
                    ) : slot.data &&
                    typeof slot.data === "object" &&
                    !Array.isArray(slot.data) &&
                    key === "correlation_analysis" &&
                    isStage2CorrelationAnalysisPayload(slot.data) ? (
                      <SreStage2CorrelationAnalysisPanel data={slot.data} variant="embedded" />
                    ) : slot.data &&
                    typeof slot.data === "object" &&
                    !Array.isArray(slot.data) &&
                    key === "topology_correlation" &&
                    isStage2TopologyCorrelationPayload(slot.data) ? (
                      <SreStage2TopologyCorrelationPanel data={slot.data} variant="embedded" />
                    ) : slot.data &&
                    typeof slot.data === "object" &&
                    !Array.isArray(slot.data) &&
                    key === "trace_anomalies" &&
                    isStage2TraceAnomaliesPayload(slot.data) ? (
                      <SreStage2TraceAnomaliesPanel data={slot.data} variant="embedded" />
                    ) : slot.data &&
                    typeof slot.data === "object" &&
                    !Array.isArray(slot.data) &&
                    key === "log_anomalies" &&
                    isStage2LogAnomaliesPayload(slot.data) ? (
                      <SreStage2LogAnomaliesPanel data={slot.data} variant="embedded" />
                    ) : slot.data &&
                      typeof slot.data === "object" &&
                      !Array.isArray(slot.data) &&
                      key === "root_cause_timeline" &&
                      isStage3RootCauseTimelinePayload(slot.data) ? (
                      <SreStage3RootCauseTimelinePanel data={slot.data} variant="embedded" />
                    ) : slot.data &&
                      typeof slot.data === "object" &&
                      !Array.isArray(slot.data) &&
                      key === "propagation_topology" &&
                      isStage3PropagationTopologyPayload(slot.data) ? (
                      <SreStage3PropagationTopologyPanel data={slot.data} variant="embedded" />
                    ) : slot.data &&
                      typeof slot.data === "object" &&
                      !Array.isArray(slot.data) &&
                      key === "impact_analysis" &&
                      isStage3ImpactAnalysisPayload(slot.data) ? (
                      <SreStage3ImpactAnalysisPanel data={slot.data} variant="embedded" />
                    ) : slot.data &&
                      typeof slot.data === "object" &&
                      !Array.isArray(slot.data) &&
                      key === "evidence_data" &&
                      isStage3EvidenceDataPayload(slot.data) ? (
                      <SreStage3EvidenceDataPanel data={slot.data} variant="embedded" />
                    ) : Array.isArray(slot.data) &&
                      (key === "strong_signals" || key === "weak_signals") &&
                      isStage3EvidenceSignalsOnlyArray(slot.data) ? (
                      <SreStage3EvidenceDataPanel
                        data={
                          key === "strong_signals"
                            ? { strong_signals: slot.data, weak_signals: [] }
                            : { strong_signals: [], weak_signals: slot.data }
                        }
                        variant="embedded"
                      />
                    ) : slot.data &&
                      typeof slot.data === "object" &&
                      !Array.isArray(slot.data) &&
                      isStage1LogsDistributionPayload(slot.data) ? (
                      <SreStage1LogsDistributionCharts data={slot.data} variant="embedded" />
                    ) : slot.data &&
                      typeof slot.data === "object" &&
                      !Array.isArray(slot.data) &&
                      isStage1MetricsTrendPayload(slot.data) ? (
                      <SreStage1MetricsTrendCharts data={slot.data} variant="embedded" />
                    ) : slot.data &&
                      typeof slot.data === "object" &&
                      !Array.isArray(slot.data) &&
                      isStage1TraceFlamegraphPayload(slot.data) ? (
                      <SreStage1TraceFlamegraphView data={slot.data} variant="embedded" />
                    ) : slot.data &&
                      typeof slot.data === "object" &&
                      !Array.isArray(slot.data) &&
                      isStage1AlertsDistributionPayload(slot.data) ? (
                      <SreStage1AlertsDistributionCharts data={slot.data} variant="embedded" />
                    ) : Array.isArray(slot.data) && isStage1AffectedNodesList(slot.data) ? (
                      <SreStage1AffectedNodesPanel nodes={slot.data} variant="embedded" />
                    ) : slot.data &&
                      typeof slot.data === "object" &&
                      !Array.isArray(slot.data) &&
                      isStage1TopologyMapPayload(slot.data) ? (
                      <SreStage1TopologyMapView data={slot.data} variant="embedded" />
                    ) : slot.data &&
                      typeof slot.data === "object" &&
                      !Array.isArray(slot.data) &&
                      SRE_VIZ_TYPES.has(String(slot.data.type || "").toLowerCase()) ? (
                      <KnownVizFromJson data={slot.data} />
                    ) : (
                      <JsonBlock value={slot.data} />
                    )
                  ) : (
                    <TextBlock text={slot.text ?? ""} />
                  )}
                </div>
              );
            }

            if (Array.isArray(rawVal)) {
              return <JsonBlock value={rawVal} />;
            }

            if (rawVal != null && typeof rawVal === "object") {
              const nestedBars = shallowNumericPairsForBars(rawVal);
              return (
                <div className="space-y-2">
                  {nestedBars?.length ? <NumericShallowBars pairs={nestedBars} /> : null}
                  <JsonBlock value={rawVal} />
                </div>
              );
            }

            return <TextBlock text={rawVal === undefined || rawVal === null ? "" : String(rawVal)} />;
          };

          return (
            <section
              key={key}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="border-b border-gray-100 bg-gray-50/50 px-4 py-3 dark:border-gray-800/50 dark:bg-gray-950/30">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{key}</h3>
              </div>
              <div className="p-4">
                {renderBody()}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
});

export default SreStageContentJsonPanel;
