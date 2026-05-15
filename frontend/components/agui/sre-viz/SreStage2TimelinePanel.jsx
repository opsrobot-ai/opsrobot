/**
 * Stage2 `timeline[]`：时间轴卡片列表
 */
import { useMemo } from "react";
import { Shell } from "./SreVizShell.jsx";
import { isStage2TimelineList, normalizeStage2Timeline } from "../../../lib/sreStage2Timeline.js";

const AXIS_OFFSET = "0.625rem"; /* 10px：与 pl-5 中线对齐 */

function TimelineCard({ row }) {
  const hasSource = row.source && row.source !== "—";

  return (
    <div className="min-w-0 rounded-lg border border-gray-200/75 bg-white/90 px-3 py-2 shadow-sm dark:border-gray-800/90 dark:bg-gray-950/50">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <time
          dateTime={new Date(row.timestampMs).toISOString()}
          className="font-mono text-[12px] font-bold tabular-nums tracking-tight text-indigo-700 dark:text-indigo-300"
        >
          {row.timeLabel}
        </time>
        {hasSource ? (
          <span className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400">{row.source}</span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-800 dark:text-slate-200">{row.content}</p>
    </div>
  );
}

/**
 * @param {{ rows: object[]; variant?: "embedded" | "standalone" }}
 */
export function SreStage2TimelinePanel({ rows, variant = "embedded" }) {
  const normalized = useMemo(() => normalizeStage2Timeline(rows), [rows]);

  if (!isStage2TimelineList(rows)) return null;

  if (normalized.length === 0) {
    const empty = <p className="text-xs text-gray-400 dark:text-gray-500">暂无时间线数据</p>;
    return variant === "standalone" ? <Shell title="时间线">{empty}</Shell> : empty;
  }

  const body = (
    <div className="relative min-w-0 pl-5">
      <div
        className="pointer-events-none absolute top-2 bottom-2 w-px -translate-x-1/2 bg-gradient-to-b from-indigo-400 via-indigo-300 to-slate-200 dark:from-indigo-500 dark:via-indigo-600 dark:to-slate-600"
        style={{ left: AXIS_OFFSET }}
        aria-hidden
      />
      <ul className="relative z-[1] space-y-4" role="list" aria-label="时间线事件列表">
        {normalized.map((r, i) => (
          <li key={`${r.timestampMs}-${i}-${r.source}`} className="relative">
            <span
              className="absolute top-3 z-[2] h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-indigo-600 shadow-sm ring-2 ring-white dark:bg-indigo-500 dark:ring-gray-950"
              style={{ left: `calc(-1 * ${AXIS_OFFSET})` }}
              aria-hidden
            />
            <TimelineCard row={r} />
          </li>
        ))}
      </ul>
    </div>
  );

  if (variant === "standalone") {
    return <Shell title="时间线">{body}</Shell>;
  }

  return body;
}
