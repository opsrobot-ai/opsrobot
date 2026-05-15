/**
 * Stage1 `type: stage1_logs_distribution`：按级别 / 服务的条形图展示（内嵌于环境感知 Tab）。
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
  isStage1LogsDistributionPayload,
  normalizeStage1LogCountRows,
} from "../../../lib/sreStage1LogsDistribution.js";

const FALLBACK_PALETTE = ["#3b82f6", "#eab308", "#f97316", "#dc2626", "#5470c6", "#64748b", "#10b981"];

function BarsBlock({ title, data, ariaLabel }) {
  if (!data?.length) return null;
  return (
    <div className="mt-5 first:mt-0">
      <EmbeddedSectionTitle>{title}</EmbeddedSectionTitle>
      <EmbeddedChartSurface>
        <Stage1DistributionBarChart
          data={data}
          fallbackPalette={FALLBACK_PALETTE}
          yAxisWidth={112}
          tooltipUnit="条数"
          ariaLabel={ariaLabel}
          maxHeight={320}
        />
      </EmbeddedChartSurface>
    </div>
  );
}

function StatChip({ label, value, tone }) {
  const palette =
    tone === "error"
      ? {
          wrap: "border-rose-100/90 bg-gradient-to-br from-rose-50/95 via-white to-white shadow-[0_1px_3px_rgba(225,29,72,0.08)] ring-rose-500/10 dark:border-rose-900/40 dark:from-rose-950/50 dark:via-gray-950 dark:to-gray-950 dark:shadow-none dark:ring-rose-500/15",
          accent: "bg-rose-500 dark:bg-rose-400",
          label: "text-rose-600/95 dark:text-rose-300",
          value: "text-rose-700 dark:text-rose-100",
        }
      : tone === "ok"
        ? {
            wrap: "border-emerald-100/90 bg-gradient-to-br from-emerald-50/95 via-white to-white shadow-[0_1px_3px_rgba(5,150,105,0.07)] ring-emerald-500/10 dark:border-emerald-900/40 dark:from-emerald-950/45 dark:via-gray-950 dark:to-gray-950 dark:shadow-none dark:ring-emerald-500/15",
            accent: "bg-emerald-500 dark:bg-emerald-400",
            label: "text-emerald-700/90 dark:text-emerald-300",
            value: "text-emerald-800 dark:text-emerald-50",
          }
        : {
            wrap: "border-gray-200/90 bg-gradient-to-br from-gray-50 to-white shadow-sm ring-black/[0.03] dark:border-gray-700 dark:from-gray-900 dark:to-gray-950 dark:ring-white/[0.05]",
            accent: "bg-gray-400 dark:bg-gray-500",
            label: "text-gray-600 dark:text-gray-400",
            value: "text-gray-900 dark:text-gray-100",
          };

  return (
    <div
      className={`relative min-h-[4.5rem] flex-1 min-w-[7.5rem] overflow-hidden rounded-xl border px-4 py-3 ring-1 ${palette.wrap}`}
    >
      <span
        className={`absolute left-0 top-0 h-full w-[3px] rounded-l-xl ${palette.accent}`}
        aria-hidden
      />
      <div className="relative flex flex-col gap-1 pl-1">
        <p className={`text-[11px] font-medium leading-tight ${palette.label}`}>{label}</p>
        <p className={`font-mono text-2xl font-bold tabular-nums tracking-tight ${palette.value}`}>{value}</p>
      </div>
    </div>
  );
}

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage1LogsDistributionCharts({ data, variant = "embedded" }) {
  const levelChart = useMemo(() => normalizeStage1LogCountRows(data.count_by_level), [data]);
  const serviceChart = useMemo(() => normalizeStage1LogCountRows(data.count_by_service), [data]);

  if (!isStage1LogsDistributionPayload(data)) return null;

  const summary = String(data.summary || "").trim();
  const err =
    data.total_error_logs != null && Number.isFinite(Number(data.total_error_logs))
      ? Number(data.total_error_logs)
      : null;
  const norm =
    data.total_normal_logs != null && Number.isFinite(Number(data.total_normal_logs))
      ? Number(data.total_normal_logs)
      : null;

  const hasSummaryPanel = Boolean(summary) || err != null || norm != null;

  const body = (
    <>
      {hasSummaryPanel ? (
        <EmbeddedSummaryPanel>
          {summary ? <p className={embeddedSummaryProseClass}>{summary}</p> : null}
          {(err != null || norm != null) && (
            <div
              className={`flex flex-wrap gap-3 ${summary ? "mt-4" : ""}`}
              role="group"
              aria-label="日志条数统计"
            >
              {err != null ? <StatChip label="异常日志（统计）" value={err} tone="error" /> : null}
              {norm != null ? <StatChip label="非异常日志" value={norm} tone="ok" /> : null}
            </div>
          )}
        </EmbeddedSummaryPanel>
      ) : null}
      <BarsBlock title="按日志级别" data={levelChart} ariaLabel="日志条数按级别分布" />
      <BarsBlock title="按服务" data={serviceChart} ariaLabel="日志条数按服务分布" />
    </>
  );

  if (variant === "standalone") {
    const title =
      typeof data.title === "string" && data.title.trim() ? data.title.trim() : "日志分布图";
    return <Shell title={title}>{body}</Shell>;
  }

  return body;
}
