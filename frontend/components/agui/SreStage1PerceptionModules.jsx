import { memo, useMemo } from "react";
import { SRE_VIZ_TYPES } from "../../lib/sreMessageVizExtract.js";
import {
  mergeStage1KeyAliases,
  SRE_STAGE1_MODULES,
  stage1KeyHasPresentData,
  stage1ModuleHasData,
} from "../../lib/sreStage1PerceptionModules.js";
import { stage2ConclusionSummaryText } from "../../lib/sreStage2AnomalyModules.js";
import { isStage1LogsDistributionPayload } from "../../lib/sreStage1LogsDistribution.js";
import { isStage1MetricsTrendPayload } from "../../lib/sreStage1MetricsTrend.js";
import { isStage1TraceFlamegraphPayload } from "../../lib/sreStage1TraceFlamegraph.js";
import { isStage1AlertsDistributionPayload } from "../../lib/sreStage1AlertsDistribution.js";
import { isStage1TopologyMapPayload } from "../../lib/sreStage1TopologyMap.js";
import { isStage1AffectedNodesList } from "../../lib/sreStage1AffectedNodes.js";
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

function FieldShell({ label, children }) {
  return (
    <div>
      <h4 className="mb-3 flex items-start gap-2.5 text-[13px] font-semibold leading-snug text-gray-800 dark:text-gray-200">
        <span
          className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500/75 ring-2 ring-blue-500/15 dark:bg-blue-400/80 dark:ring-blue-400/20"
          aria-hidden
        />
        <span>{label}</span>
      </h4>
      <div className="pl-1">{children}</div>
    </div>
  );
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
          key === "core_conclusion" &&
          slot.data != null &&
          (typeof slot.data === "string" || typeof slot.data === "number") ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
              {String(slot.data)}
            </p>
          ) : key === "core_conclusion" &&
            slot.data &&
            typeof slot.data === "object" &&
            !Array.isArray(slot.data) ? (
            (() => {
              const t = stage2ConclusionSummaryText(slot.data);
              return t != null ? (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
                  {t}
                </p>
              ) : (
                <JsonBlock value={slot.data} />
              );
            })()
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
        ) : key === "core_conclusion" ? (
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
    if (key === "core_conclusion") {
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

  if (key === "core_conclusion") {
    const t = stage2ConclusionSummaryText(rawVal);
    return (
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
        {t ?? ""}
      </p>
    );
  }

  return <TextBlock text={rawVal === undefined || rawVal === null ? "" : String(rawVal)} />;
}

export const SreStage1PerceptionModules = memo(function SreStage1PerceptionModules({ root, nested }) {
  const aliases = useMemo(() => mergeStage1KeyAliases(root), [root]);
  const nest = nested ?? {};

  return (
    <div className="space-y-5">
      {SRE_STAGE1_MODULES.map((module) => {
        if (!stage1ModuleHasData(module, root, nest)) return null;

        const moduleBody =
          module.id === "conclusion" ? (
            <div className="max-w-[100ch] rounded-xl border border-indigo-100/85 bg-gradient-to-br from-indigo-50/60 via-white to-slate-50/40 p-4 shadow-sm ring-1 ring-indigo-500/[0.06] dark:border-indigo-900/40 dark:from-indigo-950/[0.2] dark:via-gray-950/65 dark:to-slate-950/80 dark:ring-indigo-400/10 [&_p]:m-0 [&_p]:text-[13px] [&_p]:leading-relaxed">
              {module.keys.map((key) => {
                if (!stage1KeyHasPresentData(key, root[key], nest[key])) return null;
                return (
                  <div key={key}>{renderScalarOrObjectBody(key, root[key], nest[key])}</div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-6 p-4 sm:p-5">
              {module.keys.map((key) => {
                if (!stage1KeyHasPresentData(key, root[key], nest[key])) return null;
                const label = aliases[key] || key;
                const body = renderScalarOrObjectBody(key, root[key], nest[key]);
                return (
                  <FieldShell key={key} label={label}>
                    {body}
                  </FieldShell>
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
