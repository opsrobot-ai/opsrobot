/**
 * Stage1 `type: stage1_alerts_distribution`：按严重级别 / 告警类型的横向条形图
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
  isStage1AlertsDistributionPayload,
} from "../../../lib/sreStage1AlertsDistribution.js";
import { normalizeStage1LogCountRows } from "../../../lib/sreStage1LogsDistribution.js";

const FALLBACK_PALETTE = ["#dc2626", "#f97316", "#eab308", "#3b82f6", "#64748b", "#10b981"];

function BarsBlock({ title, data, ariaLabel, yAxisWidth = 120 }) {
  if (!data?.length) return null;
  return (
    <div className="mt-5 first:mt-0">
      <EmbeddedSectionTitle>{title}</EmbeddedSectionTitle>
      <EmbeddedChartSurface>
        <Stage1DistributionBarChart
          data={data}
          fallbackPalette={FALLBACK_PALETTE}
          yAxisWidth={yAxisWidth}
          tooltipUnit="条"
          ariaLabel={ariaLabel}
          maxHeight={340}
        />
      </EmbeddedChartSurface>
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <div
      className="relative min-h-[4.5rem] flex-1 min-w-[7.5rem] overflow-hidden rounded-xl border border-violet-100/90 bg-gradient-to-br from-violet-50/95 via-white to-white px-4 py-3 shadow-[0_1px_3px_rgba(109,40,217,0.08)] ring-1 ring-violet-500/10 dark:border-violet-900/45 dark:from-violet-950/45 dark:via-gray-950 dark:to-gray-950 dark:shadow-none dark:ring-violet-500/15"
    >
      <span className="absolute left-0 top-0 h-full w-[3px] rounded-l-xl bg-violet-600 dark:bg-violet-400" aria-hidden />
      <div className="relative flex flex-col gap-1 pl-1">
        <p className="text-[11px] font-medium leading-tight text-violet-800/95 dark:text-violet-300">{label}</p>
        <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-violet-900 dark:text-violet-50">
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage1AlertsDistributionCharts({ data, variant = "embedded" }) {
  const severityChart = useMemo(() => normalizeStage1LogCountRows(data.count_by_severity), [data]);
  const typeChart = useMemo(() => normalizeStage1LogCountRows(data.count_by_type), [data]);

  if (!isStage1AlertsDistributionPayload(data)) return null;

  const summary = String(data.summary || "").trim();
  const total =
    data.total_alerts != null && Number.isFinite(Number(data.total_alerts))
      ? Number(data.total_alerts)
      : null;

  const hasSummaryPanel = Boolean(summary) || total != null;

  const body = (
    <>
      {hasSummaryPanel ? (
        <EmbeddedSummaryPanel>
          {summary ? <p className={embeddedSummaryProseClass}>{summary}</p> : null}
          {total != null ? (
            <div className={`flex flex-wrap gap-3 ${summary ? "mt-4" : ""}`} role="group" aria-label="告警条数统计">
              <StatChip label="告警总数" value={total} />
            </div>
          ) : null}
        </EmbeddedSummaryPanel>
      ) : null}
      <BarsBlock title="按严重级别" data={severityChart} ariaLabel="告警条数按严重级别分布" yAxisWidth={128} />
      <BarsBlock title="按告警类型" data={typeChart} ariaLabel="告警条数按类型分布" yAxisWidth={140} />
    </>
  );

  if (variant === "standalone") {
    const title =
      typeof data.title === "string" && data.title.trim() ? data.title.trim() : "告警分布图";
    return <Shell title={title}>{body}</Shell>;
  }

  return body;
}
