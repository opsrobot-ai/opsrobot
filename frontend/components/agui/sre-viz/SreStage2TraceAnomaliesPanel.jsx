/**
 * Stage2 `trace_anomalies`：受影响 Trace 数、根因 Span 卡、传播路径流、耗时条
 */
import { useMemo } from "react";
import { Shell } from "./SreVizShell.jsx";
import {
  EmbeddedSectionTitle,
  EmbeddedSummaryPanel,
} from "./sreEmbeddedVizChrome.jsx";
import {
  isStage2TraceAnomaliesPayload,
  normalizeStage2TraceAnomalies,
} from "../../../lib/sreStage2TraceAnomalies.js";

const DURATION_CAP_MS = 8000;

function StatCountCard({ label, value }) {
  return (
    <div
      className="relative min-h-[4rem] min-w-[7.5rem] flex-1 overflow-hidden rounded-xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/95 via-white to-white px-4 py-3 shadow-sm ring-1 ring-indigo-500/10 dark:border-indigo-900/45 dark:from-indigo-950/45 dark:via-gray-950 dark:to-gray-950 dark:ring-indigo-500/15"
      role="status"
    >
      <span
        className="absolute left-0 top-0 h-full w-[3px] rounded-l-xl bg-indigo-500 dark:bg-indigo-400"
        aria-hidden
      />
      <div className="relative flex flex-col gap-1 pl-1">
        <p className="text-[11px] font-medium leading-tight text-indigo-700/95 dark:text-indigo-300">
          {label}
        </p>
        <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-indigo-900 dark:text-indigo-50">
          {value}
        </p>
      </div>
    </div>
  );
}

function ArrowGlyph() {
  return (
    <span
      className="mx-0.5 shrink-0 text-[11px] font-medium text-slate-400 dark:text-slate-500"
      aria-hidden
    >
      →
    </span>
  );
}

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage2TraceAnomaliesPanel({ data, variant = "embedded" }) {
  const model = useMemo(() => normalizeStage2TraceAnomalies(data), [data]);
  const { affected_trace_count, root_cause: rc, steps } = model;

  if (!isStage2TraceAnomaliesPayload(data)) return null;

  const hasSummary = affected_trace_count != null;
  const hasRoot =
    rc.operation ||
    rc.service ||
    rc.span_id ||
    (rc.duration_ms != null && Number.isFinite(rc.duration_ms));
  const hasPath = steps.length > 0;

  if (!hasSummary && !hasRoot && !hasPath) {
    const empty = <p className="text-xs text-gray-400 dark:text-gray-500">暂无链路异常数据</p>;
    return variant === "standalone" ? <Shell title="链路异常">{empty}</Shell> : empty;
  }

  const rootCard = hasRoot ? (
    <article
      className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/[0.04] dark:border-gray-800 dark:bg-gray-950/50 dark:ring-white/[0.06]"
      style={{ borderLeftWidth: 4, borderLeftColor: "#7c3aed" }}
    >
      <div className="border-b border-gray-100/90 bg-gradient-to-r from-violet-50/90 via-white to-slate-50/30 px-3.5 py-3 dark:border-gray-800/80 dark:from-violet-950/35 dark:via-gray-950/40 dark:to-slate-950/25">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600/90 dark:text-violet-400">
          根因 Span
        </p>
        <h4 className="mt-1.5 text-[13px] font-semibold leading-snug tracking-tight text-gray-900 dark:text-gray-50">
          {rc.operation || "（未命名操作）"}
        </h4>
        <div className="mt-2 flex flex-wrap gap-2">
          {rc.service ? (
            <span className="inline-flex items-center rounded-md border border-slate-200/90 bg-white/90 px-2 py-0.5 font-mono text-[10.5px] font-medium text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-200">
              {rc.service}
            </span>
          ) : null}
          {rc.span_id ? (
            <span className="inline-flex items-center rounded-md border border-violet-200/80 bg-violet-50/90 px-2 py-0.5 font-mono text-[10px] text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-100">
              {rc.span_id}
            </span>
          ) : null}
          {rc.duration_ms != null && Number.isFinite(rc.duration_ms) ? (
            <span className="inline-flex items-center rounded-md border border-amber-200/70 bg-amber-50/90 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100">
              {rc.duration_ms} ms
            </span>
          ) : null}
        </div>
      </div>
      {rc.duration_ms != null && Number.isFinite(rc.duration_ms) && rc.duration_ms >= 0 ? (
        <div className="px-3.5 py-3">
          <p className="mb-2 text-[10px] font-medium text-slate-500 dark:text-slate-400">
            耗时占比（相对 {DURATION_CAP_MS} ms 标尺）
          </p>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-black/[0.06] dark:bg-slate-800 dark:ring-white/[0.08]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 dark:from-violet-500 dark:to-indigo-400"
              style={{
                width: `${Math.min(100, (rc.duration_ms / DURATION_CAP_MS) * 100)}%`,
              }}
              role="meter"
              aria-valuenow={rc.duration_ms}
              aria-valuemin={0}
              aria-valuemax={DURATION_CAP_MS}
            />
          </div>
        </div>
      ) : null}
    </article>
  ) : null;

  const pathFlow = hasPath ? (
    <div>
      <EmbeddedSectionTitle>传播路径</EmbeddedSectionTitle>
      <EmbeddedSummaryPanel>
        <div className="flex flex-wrap items-center gap-y-2" role="list" aria-label="链路传播路径">
          {steps.map((step, i) => (
            <span key={`${i}-${step.slice(0, 24)}`} className="flex flex-wrap items-center">
              {i > 0 ? <ArrowGlyph /> : null}
              <span
                role="listitem"
                className="inline-flex max-w-full items-center rounded-lg border border-slate-200/90 bg-white px-2.5 py-1.5 text-[11px] font-medium leading-snug text-slate-800 shadow-sm ring-1 ring-black/[0.04] dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:ring-white/[0.06]"
              >
                <span className="break-words">{step}</span>
              </span>
            </span>
          ))}
        </div>
      </EmbeddedSummaryPanel>
    </div>
  ) : null;

  const body = (
    <div className="space-y-4">
      {hasSummary ? (
        <div className="flex flex-wrap gap-3">
          <StatCountCard label="受影响 Trace 数" value={affected_trace_count} />
        </div>
      ) : null}
      {rootCard ? <div>{rootCard}</div> : null}
      {pathFlow ? <div className={hasSummary || rootCard ? "mt-1" : ""}>{pathFlow}</div> : null}
    </div>
  );

  if (variant === "standalone") {
    return <Shell title="链路异常">{body}</Shell>;
  }

  return body;
}
