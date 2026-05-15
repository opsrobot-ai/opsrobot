import { memo, useMemo } from "react";
import { SRE_VIZ_TYPES } from "../../lib/sreMessageVizExtract.js";
import {
  mergeStage3KeyAliases,
  SRE_STAGE3_MODULES,
  stage3KeyHasPresentData,
  stage3ModuleHasData,
} from "../../lib/sreStage3RcaModules.js";
import {
  coalesceHypothesisTree,
  isStage3HypothesisTreePayload,
} from "../../lib/sreStage3HypothesisTree.js";
import {
  isStage3ReasoningOverviewPayload,
  isStage3ThreeLayerRcaLayerArray,
} from "../../lib/sreStage3ReasoningOverview.js";
import { stage2ConclusionSummaryText } from "../../lib/sreStage2AnomalyModules.js";
import { isStage1LogsDistributionPayload } from "../../lib/sreStage1LogsDistribution.js";
import { isStage1MetricsTrendPayload } from "../../lib/sreStage1MetricsTrend.js";
import { isStage1TraceFlamegraphPayload } from "../../lib/sreStage1TraceFlamegraph.js";
import { isStage1AlertsDistributionPayload } from "../../lib/sreStage1AlertsDistribution.js";
import { isStage1TopologyMapPayload } from "../../lib/sreStage1TopologyMap.js";
import { isStage1AffectedNodesList } from "../../lib/sreStage1AffectedNodes.js";
import { isStage2TimelineList } from "../../lib/sreStage2Timeline.js";
import { isStage3RootCauseTimelinePayload } from "../../lib/sreStage3RootCauseTimeline.js";
import { isStage3PropagationTopologyPayload } from "../../lib/sreStage3PropagationTopology.js";
import { isStage3ImpactAnalysisPayload } from "../../lib/sreStage3ImpactAnalysis.js";
import {
  isStage3EvidenceDataPayload,
  isStage3EvidenceSignalsOnlyArray,
} from "../../lib/sreStage3EvidenceData.js";
import { SreStage1LogsDistributionCharts } from "./sre-viz/SreStage1LogsDistributionCharts.jsx";
import { SreStage1MetricsTrendCharts } from "./sre-viz/SreStage1MetricsTrendCharts.jsx";
import { SreStage1TraceFlamegraphView } from "./sre-viz/SreStage1TraceFlamegraphView.jsx";
import { SreStage1AlertsDistributionCharts } from "./sre-viz/SreStage1AlertsDistributionCharts.jsx";
import { SreStage1TopologyMapView } from "./sre-viz/SreStage1TopologyMapView.jsx";
import { SreStage1AffectedNodesPanel } from "./sre-viz/SreStage1AffectedNodesPanel.jsx";
import { SreStage2TimelinePanel } from "./sre-viz/SreStage2TimelinePanel.jsx";
import { SreStage3RootCauseTimelinePanel } from "./sre-viz/SreStage3RootCauseTimelinePanel.jsx";
import { SreVizMetricsTrend } from "./sre-viz/SreVizMetricsTrend.jsx";
import { SreVizLogsDistribution } from "./sre-viz/SreVizLogsDistribution.jsx";
import { SreVizTraceCallChain } from "./sre-viz/SreVizTraceCallChain.jsx";
import { SreVizTopologyMap } from "./sre-viz/SreVizTopologyMap.jsx";
import { SreVizAnomalyPattern } from "./sre-viz/SreVizAnomalyPattern.jsx";
import { SreStage3HypothesisTreePanel } from "./sre-viz/SreStage3HypothesisTreePanel.jsx";
import { SreStage3ReasoningOverviewPanel } from "./sre-viz/SreStage3ReasoningOverviewPanel.jsx";
import { SreStage3PropagationTopologyPanel } from "./sre-viz/SreStage3PropagationTopologyPanel.jsx";
import { SreStage3ImpactAnalysisPanel } from "./sre-viz/SreStage3ImpactAnalysisPanel.jsx";
import { SreStage3EvidenceDataPanel } from "./sre-viz/SreStage3EvidenceDataPanel.jsx";

function hypothesisPayloadsDeepEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function OverviewModuleBody({ root, nested }) {
  const nest = nested ?? {};
  const raw = root?.overview_conclusion;
  const slot = nest?.overview_conclusion;

  if (slot?.status === "loading") {
    return (
      <div className="p-4 sm:p-5">
        <p className="text-xs text-gray-400">加载引用文件…</p>
      </div>
    );
  }
  if (slot?.status === "error") {
    return (
      <div className="p-4 sm:p-5">
        <p className="text-xs text-rose-600 dark:text-rose-400">{slot.error || "加载失败"}</p>
      </div>
    );
  }

  const data =
    slot?.status === "ready" && slot?.kind === "json"
      ? slot.data
      : slot?.status === "ready" && slot?.kind === "text"
        ? slot.text
        : raw;

  if (!isStage3ReasoningOverviewPayload(data)) {
    return (
      <div className="p-4 sm:p-5">{renderScalarOrObjectBody("overview_conclusion", raw, slot)}</div>
    );
  }

  return (
    <div className="p-4 sm:p-5">
      <SreStage3ReasoningOverviewPanel data={data} variant="embedded" />
    </div>
  );
}

function HypothesisModuleBody({ root, nested }) {
  const nest = nested ?? {};
  const treePayload = coalesceHypothesisTree(root);
  const htRaw = root?.hypothesis_tree;
  const tlrRaw = root?.three_layer_rca;

  const pieces = [];

  if (treePayload) {
    pieces.push(<SreStage3HypothesisTreePanel key="tree-coalesced" data={treePayload} variant="embedded" />);
  }

  if (
    stage3KeyHasPresentData("three_layer_rca", tlrRaw, nest.three_layer_rca) &&
    !(treePayload && isStage3HypothesisTreePayload(tlrRaw) && hypothesisPayloadsDeepEqual(treePayload, tlrRaw)) &&
    !isStage3ThreeLayerRcaLayerArray(tlrRaw)
  ) {
    pieces.push(
      <div key="tlr-extra" className="min-w-0">
        {renderScalarOrObjectBody("three_layer_rca", tlrRaw, nest.three_layer_rca)}
      </div>,
    );
  }

  if (
    stage3KeyHasPresentData("hypothesis_tree", htRaw, nest.hypothesis_tree) &&
    !(treePayload && isStage3HypothesisTreePayload(htRaw) && hypothesisPayloadsDeepEqual(treePayload, htRaw))
  ) {
    pieces.push(
      <div key="ht-extra" className="min-w-0">
        {isStage3HypothesisTreePayload(htRaw) ? (
          <SreStage3HypothesisTreePanel data={htRaw} variant="embedded" />
        ) : (
          renderScalarOrObjectBody("hypothesis_tree", htRaw, nest.hypothesis_tree)
        )}
      </div>,
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-5">
      {pieces.map((node, i) => (
        <div key={i} className="min-w-0">
          {node}
        </div>
      ))}
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
          key === "overview_conclusion" && isStage3ReasoningOverviewPayload(slot.data) ? (
            <SreStage3ReasoningOverviewPanel data={slot.data} variant="embedded" />
          ) : key === "hypothesis_tree" && slot.data && isStage3HypothesisTreePayload(slot.data) ? (
            <SreStage3HypothesisTreePanel data={slot.data} variant="embedded" />
          ) : key === "three_layer_rca" && slot.data && isStage3HypothesisTreePayload(slot.data) ? (
            <SreStage3HypothesisTreePanel data={slot.data} variant="embedded" />
          ) : key === "root_cause_timeline" &&
          slot.data &&
          typeof slot.data === "object" &&
          !Array.isArray(slot.data) &&
          isStage3RootCauseTimelinePayload(slot.data) ? (
            <SreStage3RootCauseTimelinePanel data={slot.data} variant="embedded" />
          ) : key === "root_cause_timeline" &&
          Array.isArray(slot.data) &&
          isStage2TimelineList(slot.data) ? (
            <SreStage2TimelinePanel rows={slot.data} variant="embedded" />
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
          ) : key === "propagation_topology" &&
          slot.data &&
          typeof slot.data === "object" &&
          !Array.isArray(slot.data) &&
          isStage3PropagationTopologyPayload(slot.data) ? (
            <SreStage3PropagationTopologyPanel data={slot.data} variant="embedded" />
          ) : key === "impact_analysis" &&
          slot.data &&
          typeof slot.data === "object" &&
          !Array.isArray(slot.data) &&
          isStage3ImpactAnalysisPayload(slot.data) ? (
            <SreStage3ImpactAnalysisPanel data={slot.data} variant="embedded" />
          ) : key === "evidence_data" &&
          slot.data &&
          typeof slot.data === "object" &&
          !Array.isArray(slot.data) &&
          isStage3EvidenceDataPayload(slot.data) ? (
            <SreStage3EvidenceDataPanel data={slot.data} variant="embedded" />
          ) : (key === "strong_signals" || key === "weak_signals") &&
          Array.isArray(slot.data) &&
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
        ) : key === "overview_conclusion" ? (
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
      if (key === "root_cause_timeline" && isStage2TimelineList(rawVal)) {
        return <SreStage2TimelinePanel rows={rawVal} variant="embedded" />;
      }
      if (isStage1AffectedNodesList(rawVal)) {
        return <SreStage1AffectedNodesPanel nodes={rawVal} variant="embedded" />;
      }
      if (
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
    if (key === "overview_conclusion" && isStage3ReasoningOverviewPayload(rawVal)) {
      return <SreStage3ReasoningOverviewPanel data={rawVal} variant="embedded" />;
    }
    if (
      (key === "hypothesis_tree" || key === "three_layer_rca") &&
      isStage3HypothesisTreePayload(rawVal)
    ) {
      return <SreStage3HypothesisTreePanel data={rawVal} variant="embedded" />;
    }
    if (key === "root_cause_timeline" && isStage3RootCauseTimelinePayload(rawVal)) {
      return <SreStage3RootCauseTimelinePanel data={rawVal} variant="embedded" />;
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
    if (key === "propagation_topology" && isStage3PropagationTopologyPayload(rawVal)) {
      return <SreStage3PropagationTopologyPanel data={rawVal} variant="embedded" />;
    }
    if (key === "impact_analysis" && isStage3ImpactAnalysisPayload(rawVal)) {
      return <SreStage3ImpactAnalysisPanel data={rawVal} variant="embedded" />;
    }
    if (key === "evidence_data" && isStage3EvidenceDataPayload(rawVal)) {
      return <SreStage3EvidenceDataPanel data={rawVal} variant="embedded" />;
    }
    if (isStage1TopologyMapPayload(rawVal)) {
      return <SreStage1TopologyMapView data={rawVal} variant="embedded" />;
    }
    if (SRE_VIZ_TYPES.has(String(rawVal.type || "").toLowerCase())) {
      return <KnownVizFromJson data={rawVal} />;
    }
    return <JsonBlock value={rawVal} />;
  }

  if (key === "overview_conclusion") {
    const t = stage2ConclusionSummaryText(rawVal);
    return (
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
        {t ?? (rawVal === undefined || rawVal === null ? "" : String(rawVal))}
      </p>
    );
  }

  return <TextBlock text={rawVal === undefined || rawVal === null ? "" : String(rawVal)} />;
}

function EvidenceModuleBody({ root, nested }) {
  const nest = nested ?? {};
  const aliases = useMemo(() => mergeStage3KeyAliases(root), [root]);
  const slot = nest.evidence_data;
  const raw = root?.evidence_data;

  if (slot?.status === "loading") {
    return (
      <div className="p-4 sm:p-5">
        <p className="text-xs text-gray-400">加载引用文件…</p>
      </div>
    );
  }
  if (slot?.status === "error") {
    return (
      <div className="p-4 sm:p-5">
        <p className="text-xs text-rose-600 dark:text-rose-400">{slot.error || "加载失败"}</p>
      </div>
    );
  }

  const data =
    slot?.status === "ready" && slot?.kind === "json"
      ? slot.data
      : slot?.status === "ready" && slot?.kind === "text"
        ? null
        : raw;

  if (isStage3EvidenceDataPayload(data)) {
    return (
      <div className="p-4 sm:p-5">
        <SreStage3EvidenceDataPanel data={data} variant="embedded" />
      </div>
    );
  }

  const keysOrder = ["strong_signals", "weak_signals", "evidence_data"];

  return (
    <div className="space-y-6 p-4 sm:p-5">
      {keysOrder.map((key) => {
        if (!stage3KeyHasPresentData(key, root[key], nest[key])) return null;
        const body = renderScalarOrObjectBody(key, root[key], nest[key]);
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
}

export const SreStage3RcaModules = memo(function SreStage3RcaModules({ root, nested }) {
  const nest = nested ?? {};
  const aliases = useMemo(() => mergeStage3KeyAliases(root), [root]);

  return (
    <div className="space-y-5">
      {SRE_STAGE3_MODULES.map((module) => {
        if (!stage3ModuleHasData(module, root, nest)) return null;

        const moduleBody =
          module.id === "overview" ? (
            <OverviewModuleBody root={root} nested={nest} />
          ) : module.id === "hypothesis" ? (
            <HypothesisModuleBody root={root} nested={nest} />
          ) : module.id === "evidence" ? (
            <EvidenceModuleBody root={root} nested={nest} />
          ) : (
            <div className="space-y-6 p-4 sm:p-5">
              {module.keys.map((key) => {
                if (!stage3KeyHasPresentData(key, root[key], nest[key])) return null;
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
