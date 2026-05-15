/**
 * Stage2 `metric_anomalies[]`：指标异常明细卡片（与日志异常卡片视觉对齐）
 */
import { useMemo } from "react";
import { Shell } from "./SreVizShell.jsx";
import { embeddedSummaryProseClass } from "./sreEmbeddedVizChrome.jsx";
import {
  formatMetricAnomalyDelta,
  isStage2MetricAnomaliesList,
  normalizeStage2MetricAnomalies,
} from "../../../lib/sreStage2MetricAnomalies.js";

const ACCENT_COLORS = ["#dc2626", "#ea580c", "#d97706", "#4f46e5", "#0891b2", "#db2777"];

function MetricCard({ row, index }) {
  const accent = ACCENT_COLORS[index % ACCENT_COLORS.length];
  const delta = formatMetricAnomalyDelta(row.baseline, row.peak_value);
  const bStr =
    row.baseline != null && Number.isFinite(row.baseline) ? String(row.baseline) : "—";
  const pStr =
    row.peak_value != null && Number.isFinite(row.peak_value) ? String(row.peak_value) : "—";

  return (
    <article
      className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-950/50 dark:ring-white/[0.06]"
      style={{ borderLeftWidth: 4, borderLeftColor: accent }}
    >
      <div className="border-b border-gray-100/90 bg-gradient-to-r from-gray-50/95 via-white to-slate-50/30 px-3.5 py-3 dark:border-gray-800/80 dark:from-gray-950/55 dark:via-gray-950/35 dark:to-slate-950/25">
        <h4 className="break-words font-mono text-[12px] font-semibold leading-snug tracking-tight text-gray-900 dark:text-gray-50">
          {row.metric_name}
        </h4>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {row.service ? (
            <span className="inline-flex items-center rounded-md border border-slate-200/90 bg-white/90 px-2 py-0.5 font-mono text-[10.5px] font-medium text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-200">
              {row.service}
            </span>
          ) : null}
          <span className="inline-flex items-center rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[10.5px] font-medium tabular-nums text-slate-700 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200">
            基线 {bStr}
          </span>
          <span className="inline-flex items-center rounded-md border border-rose-200/70 bg-rose-50/95 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-rose-800 ring-1 ring-rose-500/10 dark:border-rose-900/45 dark:bg-rose-950/55 dark:text-rose-100 dark:ring-rose-500/15">
            峰值 {pStr}
          </span>
          {delta ? (
            <span className="inline-flex items-center rounded-md border border-amber-200/70 bg-amber-50/90 px-2 py-0.5 text-[10.5px] font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
              {delta}
            </span>
          ) : null}
        </div>
      </div>
      {row.description?.trim() ? (
        <div className="px-3.5 py-3">
          <p className={`${embeddedSummaryProseClass} text-[12px] leading-relaxed`}>
            {row.description.trim()}
          </p>
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
 * @param {{ rows: object[]; variant?: "embedded" | "standalone" }}
 */
export function SreStage2MetricAnomaliesPanel({ rows, variant = "embedded" }) {
  const normalized = useMemo(() => normalizeStage2MetricAnomalies(rows), [rows]);

  if (!isStage2MetricAnomaliesList(rows)) return null;

  if (normalized.length === 0) {
    const empty = <p className="text-xs text-gray-400 dark:text-gray-500">暂无指标异常条目</p>;
    return variant === "standalone" ? <Shell title="指标异常">{empty}</Shell> : empty;
  }

  const grid = (
    <div
      className="grid grid-cols-1 gap-3.5 md:grid-cols-2"
      role="list"
      aria-label="指标异常明细"
    >
      {normalized.map((r, i) => (
        <div key={`${r.metric_name}-${i}`} role="listitem">
          <MetricCard row={r} index={i} />
        </div>
      ))}
    </div>
  );

  if (variant === "standalone") {
    return <Shell title="指标异常">{grid}</Shell>;
  }

  return grid;
}
