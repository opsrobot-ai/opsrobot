/**
 * Stage3 影响分析：按维度分类的条目列表
 */
import { useMemo } from "react";
import {
  isStage3ImpactAnalysisPayload,
  normalizeStage3ImpactAnalysisRows,
} from "../../../lib/sreStage3ImpactAnalysis.js";

/** 与推理总览等区域一致的嵌入式衬底 */
const LIST_SHELL =
  "overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50/40 via-white to-indigo-50/[0.35] shadow-inner ring-1 ring-black/[0.03] dark:border-slate-800/75 dark:from-slate-950/55 dark:via-slate-950/35 dark:to-indigo-950/25 dark:ring-white/[0.04]";

function ImpactRow({ index, category, description }) {
  return (
    <li className="relative flex gap-0 border-b border-slate-200/55 transition-colors last:border-b-0 hover:bg-white/70 dark:border-slate-800/70 dark:hover:bg-slate-950/55">
      <div
        className="w-[3px] shrink-0 bg-gradient-to-b from-indigo-500 via-violet-500 to-fuchsia-500 opacity-[0.92] dark:opacity-100"
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3.5 sm:px-4 sm:py-4">
        <div
          className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/12 to-violet-500/10 ring-1 ring-indigo-500/15 dark:from-indigo-400/14 dark:to-violet-400/10 dark:ring-indigo-400/20"
          aria-hidden
        >
          <span className="text-[11px] font-bold tabular-nums leading-none text-indigo-700 dark:text-indigo-200">
            {index}
          </span>
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          {category ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex max-w-full rounded-lg border border-indigo-200/70 bg-indigo-50/90 px-2.5 py-1 text-[11px] font-semibold leading-snug text-indigo-950 shadow-sm dark:border-indigo-800/55 dark:bg-indigo-950/45 dark:text-indigo-100">
                {category}
              </span>
            </div>
          ) : null}
          {description ? (
            <p
              className={`text-[13px] leading-[1.65] text-slate-700 dark:text-slate-300 ${category ? "mt-2.5" : ""}`}
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage3ImpactAnalysisPanel({ data, variant = "embedded" }) {
  const rows = useMemo(() => normalizeStage3ImpactAnalysisRows(data), [data]);

  if (!isStage3ImpactAnalysisPayload(data)) return null;

  const empty = (
    <p className="rounded-lg border border-dashed border-slate-200/90 bg-slate-50/50 px-4 py-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-400">
      暂无影响分析数据
    </p>
  );
  if (rows.length === 0) {
    return variant === "standalone" ? (
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        {empty}
      </div>
    ) : (
      empty
    );
  }

  const list = (
    <div className={LIST_SHELL}>
      <ul className="m-0 list-none p-0">
        {rows.map((row, i) => (
          <ImpactRow key={i} index={i + 1} category={row.category} description={row.description} />
        ))}
      </ul>
    </div>
  );

  if (variant === "standalone") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {list}
      </div>
    );
  }

  return list;
}
