import { memo, useMemo } from "react";
import { SRE_VIZ_TYPES } from "../../lib/sreMessageVizExtract.js";
import {
  mergeStage2KeyAliases,
  SRE_STAGE2_MODULES,
  stage2ConclusionSummaryText,
  stage2KeyHasPresentData,
  stage2ModuleHasData,
} from "../../lib/sreStage2AnomalyModules.js";
import { isStage1LogsDistributionPayload } from "../../lib/sreStage1LogsDistribution.js";
import { isStage2LogAnomaliesPayload } from "../../lib/sreStage2LogAnomalies.js";
import { isStage2MetricAnomaliesList } from "../../lib/sreStage2MetricAnomalies.js";
import { isStage2AlertAnomaliesList } from "../../lib/sreStage2AlertAnomalies.js";
import { isStage2TraceAnomaliesPayload } from "../../lib/sreStage2TraceAnomalies.js";
import { isStage2TopologyCorrelationPayload } from "../../lib/sreStage2TopologyCorrelation.js";
import { isStage2CorrelationAnalysisPayload } from "../../lib/sreStage2CorrelationAnalysis.js";
import { isStage2AnomalyPatternsTopList } from "../../lib/sreStage2AnomalyPatternsTop.js";
import { isStage2TimelineList } from "../../lib/sreStage2Timeline.js";
import { isStage1MetricsTrendPayload } from "../../lib/sreStage1MetricsTrend.js";
import { isStage1TraceFlamegraphPayload } from "../../lib/sreStage1TraceFlamegraph.js";
import { isStage1AlertsDistributionPayload } from "../../lib/sreStage1AlertsDistribution.js";
import { isStage1TopologyMapPayload } from "../../lib/sreStage1TopologyMap.js";
import { isStage1AffectedNodesList } from "../../lib/sreStage1AffectedNodes.js";
import { SreStage2LogAnomaliesPanel } from "./sre-viz/SreStage2LogAnomaliesPanel.jsx";
import { SreStage2MetricAnomaliesPanel } from "./sre-viz/SreStage2MetricAnomaliesPanel.jsx";
import { SreStage2AlertAnomaliesPanel } from "./sre-viz/SreStage2AlertAnomaliesPanel.jsx";
import { SreStage2TraceAnomaliesPanel } from "./sre-viz/SreStage2TraceAnomaliesPanel.jsx";
import { SreStage2TopologyCorrelationPanel } from "./sre-viz/SreStage2TopologyCorrelationPanel.jsx";
import { SreStage2CorrelationAnalysisPanel } from "./sre-viz/SreStage2CorrelationAnalysisPanel.jsx";
import { SreStage2AnomalyPatternsTopPanel } from "./sre-viz/SreStage2AnomalyPatternsTopPanel.jsx";
import { SreStage2TimelinePanel } from "./sre-viz/SreStage2TimelinePanel.jsx";
import { SreStage1LogsDistributionCharts } from "./sre-viz/SreStage1LogsDistributionCharts.jsx";
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

function renderScalarOrObjectBody(key, rawVal, slot) {
  if (slot) {
    return (
      <div className="space-y-2">
        {slot.status === "loading" ? (
          <p className="text-xs text-gray-400">加载引用文件…</p>
        ) : slot.status === "error" ? (
          <p className="text-xs text-rose-600 dark:text-rose-400">{slot.error || "加载失败"}</p>
        ) : slot.kind === "json" ? (
          (key === "core_conclusion" || key === "analysis_overview") &&
          slot.data != null &&
          (typeof slot.data === "string" || typeof slot.data === "number") ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
              {String(slot.data)}
            </p>
          ) : Array.isArray(slot.data) &&
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
          ) : (key === "core_conclusion" || key === "analysis_overview") &&
            slot.data &&
            typeof slot.data === "object" &&
            !Array.isArray(slot.data)
            ? (() => {
                const t = stage2ConclusionSummaryText(slot.data);
                return t != null ? (
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
                    {t}
                  </p>
                ) : (
                  <JsonBlock value={slot.data} />
                );
              })()
            : (
              <JsonBlock value={slot.data} />
            )
        ) : key === "core_conclusion" || key === "analysis_overview" ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
            {slot.text ?? ""}
          </p>
        ) : (
          <TextBlock text={slot.text ?? ""} />
        )}
      </div>
    );
  }

  if (rawVal !== null && typeof rawVal === "object") {
    if (Array.isArray(rawVal)) {
      if (key === "alert_anomalies" && isStage2AlertAnomaliesList(rawVal)) {
        return <SreStage2AlertAnomaliesPanel rows={rawVal} variant="embedded" />;
      }
      if (key === "metric_anomalies" && isStage2MetricAnomaliesList(rawVal)) {
        return <SreStage2MetricAnomaliesPanel rows={rawVal} variant="embedded" />;
      }
      if (key === "anomaly_patterns_top" && isStage2AnomalyPatternsTopList(rawVal)) {
        return <SreStage2AnomalyPatternsTopPanel rows={rawVal} variant="embedded" />;
      }
      if (key === "timeline" && isStage2TimelineList(rawVal)) {
        return <SreStage2TimelinePanel rows={rawVal} variant="embedded" />;
      }
      if (isStage1AffectedNodesList(rawVal)) {
        return <SreStage1AffectedNodesPanel nodes={rawVal} variant="embedded" />;
      }
      if (rawVal.length > 0 && rawVal.every((x) => typeof x === "string" || typeof x === "number")) {
        return (
          <ul className="list-inside list-disc space-y-1.5 text-[13px] text-slate-700 dark:text-slate-300 pl-1">
            {rawVal.map((x, i) => (
              <li key={i}>{String(x)}</li>
            ))}
          </ul>
        );
      }
      return <JsonBlock value={rawVal} />;
    }
    if (key === "correlation_analysis" && isStage2CorrelationAnalysisPayload(rawVal)) {
      return <SreStage2CorrelationAnalysisPanel data={rawVal} variant="embedded" />;
    }
    if (key === "topology_correlation" && isStage2TopologyCorrelationPayload(rawVal)) {
      return <SreStage2TopologyCorrelationPanel data={rawVal} variant="embedded" />;
    }
    if (key === "trace_anomalies" && isStage2TraceAnomaliesPayload(rawVal)) {
      return <SreStage2TraceAnomaliesPanel data={rawVal} variant="embedded" />;
    }
    if (key === "log_anomalies" && isStage2LogAnomaliesPayload(rawVal)) {
      return <SreStage2LogAnomaliesPanel data={rawVal} variant="embedded" />;
    }
    if (isStage1LogsDistributionPayload(rawVal)) {
      return <SreStage1LogsDistributionCharts data={rawVal} variant="embedded" />;
    }
    if (isStage1MetricsTrendPayload(rawVal)) {
      return <SreStage1MetricsTrendCharts data={rawVal} variant="embedded" />;
    }
    if (isStage1TraceFlamegraphPayload(rawVal)) {
      return <SreStage1TraceFlamegraphView data={rawVal} variant="embedded" />;
    }
    if (isStage1AlertsDistributionPayload(rawVal)) {
      return <SreStage1AlertsDistributionCharts data={rawVal} variant="embedded" />;
    }
    if (isStage1TopologyMapPayload(rawVal)) {
      return <SreStage1TopologyMapView data={rawVal} variant="embedded" />;
    }
    if (SRE_VIZ_TYPES.has(String(rawVal.type || "").toLowerCase())) {
      return <KnownVizFromJson data={rawVal} />;
    }
    if (key === "core_conclusion" || key === "analysis_overview") {
      const t = stage2ConclusionSummaryText(rawVal);
      if (t != null) {
        return (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
            {t}
          </p>
        );
      }
    }
    return <JsonBlock value={rawVal} />;
  }

  if (key === "core_conclusion" || key === "analysis_overview") {
    const t = stage2ConclusionSummaryText(rawVal);
    return (
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
        {t ?? ""}
      </p>
    );
  }

  return <TextBlock text={rawVal === undefined || rawVal === null ? "" : String(rawVal)} />;
}

export const SreStage2AnomalyModules = memo(function SreStage2AnomalyModules({ root, nested }) {
  const nest = nested ?? {};
  const aliases = useMemo(() => mergeStage2KeyAliases(root), [root]);

  return (
    <div className="space-y-5">
      {SRE_STAGE2_MODULES.map((module) => {
        if (!stage2ModuleHasData(module, root, nest)) return null;

        const moduleBody =
          module.id === "conclusion" ? (
            <div
              className="max-w-[100ch] rounded-xl border border-indigo-100/85 bg-gradient-to-br from-indigo-50/60 via-white to-slate-50/40 p-4 shadow-sm ring-1 ring-indigo-500/[0.06] dark:border-indigo-900/40 dark:from-indigo-950/[0.2] dark:via-gray-950/65 dark:to-slate-950/80 dark:ring-indigo-400/10 [&_p]:m-0 [&_p]:text-[13px] [&_p]:leading-relaxed"
            >
              {(() => {
                const pickKey = ["core_conclusion", "analysis_overview"].find((k) =>
                  stage2KeyHasPresentData(k, root[k], nest[k]),
                );
                if (!pickKey) return null;
                return (
                  <div key={pickKey}>
                    {renderScalarOrObjectBody(pickKey, root[pickKey], nest[pickKey])}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="space-y-6 p-4 sm:p-5">
              {module.keys.map((key) => {
                if (!stage2KeyHasPresentData(key, root[key], nest[key])) return null;
                const body = renderScalarOrObjectBody(key, root[key], nest[key]);
                if (module.keys.length === 1) {
                  return <div key={key}>{body}</div>;
                }
                const label = aliases[key] || key;
                return (
                  <div key={key}>
                    <h4 className="mb-3 flex items-start gap-2.5 text-[13px] font-semibold leading-snug text-gray-800 dark:text-gray-200">
                      <span
                        className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500/75 ring-2 ring-blue-500/15 dark:bg-blue-400/80 dark:ring-blue-400/20"
                        aria-hidden
                      />
                      <span>{label}</span>
                    </h4>
                    <div className="pl-1">{body}</div>
                  </div>
                );
              })}
            </div>
          );

        if (module.id === "conclusion") {
          return (
            <header key={module.id}>
              <h2 className="mb-2 text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                {module.title}
              </h2>
              {moduleBody}
            </header>
          );
        }

        return (
          <section
            key={module.id}
            className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:ring-white/[0.06]"
          >
            <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50/95 via-white to-slate-50/40 px-4 py-3.5 dark:border-gray-800/50 dark:from-gray-950/50 dark:via-gray-950/30 dark:to-slate-950/25">
              <h3 className="text-sm font-semibold tracking-tight text-gray-800 dark:text-gray-100">
                {module.title}
              </h3>
            </div>
            {moduleBody}
          </section>
        );
      })}
    </div>
  );
});
