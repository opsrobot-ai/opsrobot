/**
 * Stage2 `topology_correlation`：故障节点、影响类型图、上下游影响卡片
 */
import { useMemo } from "react";
import { Shell } from "./SreVizShell.jsx";
import { Stage1DistributionBarChart } from "./SreStage1DistributionBarChart.jsx";
import {
  EmbeddedChartSurface,
  EmbeddedSectionTitle,
  EmbeddedSummaryPanel,
  embeddedSummaryProseClass,
} from "./sreEmbeddedVizChrome.jsx";
import {
  aggregateTopologyImpactTypes,
  formatImpactTypeLabel,
  isStage2TopologyCorrelationPayload,
  normalizeStage2TopologyCorrelation,
} from "../../../lib/sreStage2TopologyCorrelation.js";

const UP_ACCENT = "#2563eb";
const DOWN_ACCENT = "#d97706";
const PALETTE_FALLBACK = ["#dc2626", "#ea580c", "#4f46e5", "#0891b2", "#059669"];

function FlowHint({ upstreamN, downstreamN, faulty }) {
  return (
    <EmbeddedSummaryPanel className="!bg-gradient-to-br from-slate-50/95 via-white to-slate-50/40 dark:!from-gray-950/55 dark:!via-gray-950 dark:!to-slate-950/35">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        影响方向概览
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] sm:justify-start">
        <span className="rounded-lg border border-blue-200/80 bg-blue-50/90 px-2.5 py-1.5 font-medium text-blue-900 dark:border-blue-900/45 dark:bg-blue-950/35 dark:text-blue-100">
          上游 {upstreamN}
        </span>
        <span className="text-slate-400 dark:text-slate-500" aria-hidden>
          →
        </span>
        <span className="max-w-[min(100%,18rem)] break-words rounded-lg border border-rose-200/80 bg-rose-50/95 px-2.5 py-1.5 font-semibold text-rose-950 dark:border-rose-900/45 dark:bg-rose-950/40 dark:text-rose-50">
          {faulty || "故障节点"}
        </span>
        <span className="text-slate-400 dark:text-slate-500" aria-hidden>
          →
        </span>
        <span className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-2.5 py-1.5 font-medium text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/35 dark:text-amber-100">
          下游 {downstreamN}
        </span>
      </div>
    </EmbeddedSummaryPanel>
  );
}

function ImpactCard({ row, direction }) {
  const isUp = direction === "upstream";
  const accent = isUp ? UP_ACCENT : DOWN_ACCENT;
  const label = isUp ? "上游" : "下游";

  return (
    <article
      className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-950/50 dark:ring-white/[0.06]"
      style={{ borderLeftWidth: 4, borderLeftColor: accent }}
    >
      <div
        className={`border-b px-3.5 py-3 dark:border-gray-800/80 ${
          isUp
            ? "border-blue-100/90 bg-gradient-to-r from-blue-50/90 via-white to-white dark:from-blue-950/30 dark:via-gray-950/40"
            : "border-amber-100/90 bg-gradient-to-r from-amber-50/85 via-white to-white dark:from-amber-950/25 dark:via-gray-950/40"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white ${
              isUp ? "bg-blue-600 dark:bg-blue-500" : "bg-amber-600 dark:bg-amber-500"
            }`}
          >
            {label}
          </span>
          <h4 className="font-mono text-[12px] font-semibold leading-snug text-gray-900 dark:text-gray-50">
            {row.service}
          </h4>
        </div>
        {row.impact_type ? (
          <p className="mt-2 inline-flex rounded-md border border-slate-200/80 bg-white/80 px-2 py-0.5 text-[10.5px] font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200">
            {formatImpactTypeLabel(row.impact_type)}
          </p>
        ) : null}
      </div>
      {row.details ? (
        <div className="px-3.5 py-3">
          <p className={`${embeddedSummaryProseClass} text-[12px] leading-relaxed`}>{row.details}</p>
        </div>
      ) : (
        <div className="px-3.5 py-2.5">
          <p className="text-[11px] text-gray-400 dark:text-gray-500">暂无说明</p>
        </div>
      )}
    </article>
  );
}

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage2TopologyCorrelationPanel({ data, variant = "embedded" }) {
  const { faulty_node, upstream, downstream } = useMemo(
    () => normalizeStage2TopologyCorrelation(data),
    [data],
  );

  const allImpacts = useMemo(() => [...upstream, ...downstream], [upstream, downstream]);
  const chartData = useMemo(() => aggregateTopologyImpactTypes(allImpacts), [allImpacts]);

  if (!isStage2TopologyCorrelationPayload(data)) return null;

  if (!faulty_node && upstream.length === 0 && downstream.length === 0) {
    const empty = <p className="text-xs text-gray-400 dark:text-gray-500">暂无拓扑关联数据</p>;
    return variant === "standalone" ? <Shell title="拓扑关系">{empty}</Shell> : empty;
  }

  const faultyCard = faulty_node ? (
    <article
      className="overflow-hidden rounded-xl border border-rose-200/90 bg-white shadow-md ring-1 ring-rose-500/15 dark:border-rose-900/40 dark:bg-gray-950/55 dark:ring-rose-500/20"
      style={{ borderLeftWidth: 5, borderLeftColor: "#e11d48" }}
    >
      <div className="border-b border-rose-100/80 bg-gradient-to-r from-rose-50/95 via-white to-slate-50/30 px-4 py-3.5 dark:border-rose-900/30 dark:from-rose-950/40 dark:via-gray-950/35 dark:to-slate-950/25">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
          故障节点
        </p>
        <p className="mt-1.5 break-words text-[14px] font-semibold leading-snug text-gray-900 dark:text-gray-50">
          {faulty_node}
        </p>
      </div>
    </article>
  ) : null;

  const flow = (
    <FlowHint upstreamN={upstream.length} downstreamN={downstream.length} faulty={faulty_node} />
  );

  const chart =
    chartData.length > 0 ? (
      <div className="mt-4">
        <EmbeddedSectionTitle>影响类型分布</EmbeddedSectionTitle>
        <EmbeddedChartSurface>
          <Stage1DistributionBarChart
            data={chartData}
            fallbackPalette={PALETTE_FALLBACK}
            yAxisWidth={168}
            tooltipUnit="条"
            ariaLabel="拓扑影响类型条数"
            maxHeight={Math.min(320, 52 + chartData.length * 40)}
            allowDecimals={false}
            tooltipLabelFormatter={(label, payload) => {
              const row = Array.isArray(payload) ? payload[0]?.payload : payload?.payload;
              const fk = row?.fullKey;
              if (fk != null && String(fk).trim() !== "") return formatImpactTypeLabel(String(fk));
              return String(label ?? "");
            }}
          />
        </EmbeddedChartSurface>
      </div>
    ) : null;

  const upstreamSection =
    upstream.length > 0 ? (
      <div className="mt-5">
        <EmbeddedSectionTitle>上游影响</EmbeddedSectionTitle>
        <div className="mt-3 grid grid-cols-1 gap-3.5 md:grid-cols-2" role="list">
          {upstream.map((row, i) => (
            <div key={`up-${row.service}-${i}`} role="listitem">
              <ImpactCard row={row} direction="upstream" />
            </div>
          ))}
        </div>
      </div>
    ) : null;

  const downstreamSection =
    downstream.length > 0 ? (
      <div className="mt-5">
        <EmbeddedSectionTitle>下游影响</EmbeddedSectionTitle>
        <div className="mt-3 grid grid-cols-1 gap-3.5 md:grid-cols-2" role="list">
          {downstream.map((row, i) => (
            <div key={`down-${row.service}-${i}`} role="listitem">
              <ImpactCard row={row} direction="downstream" />
            </div>
          ))}
        </div>
      </div>
    ) : null;

  const body = (
    <div className="space-y-4">
      {faultyCard}
      {upstream.length > 0 || downstream.length > 0 || faulty_node ? flow : null}
      {chart}
      {upstreamSection}
      {downstreamSection}
    </div>
  );

  if (variant === "standalone") {
    return <Shell title="拓扑关系">{body}</Shell>;
  }

  return body;
}
