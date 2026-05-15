/**
 * Stage2 `correlation_analysis`：列表形式（强/弱关联合并）+ 分页
 * 列表外观与根因推理「证据数据」一致（LIST_SHELL + 左侧色条 + 标题/说明排版）
 */
import { useEffect, useMemo, useState } from "react";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../../../components/TablePagination.jsx";
import { Shell } from "./SreVizShell.jsx";
import {
  isStage2CorrelationAnalysisPayload,
  normalizeStage2CorrelationAnalysis,
} from "../../../lib/sreStage2CorrelationAnalysis.js";

const PAGE_SIZE = DEFAULT_TABLE_PAGE_SIZE;

/** 与 SreStage3EvidenceDataPanel 的 SignalSection 容器一致 */
const LIST_SHELL =
  "overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50/40 via-white to-slate-50/30 shadow-inner ring-1 ring-black/[0.03] dark:border-slate-800/75 dark:from-slate-950/55 dark:via-slate-950/35 dark:to-slate-950/20 dark:ring-white/[0.04]";

/**
 * @param {{ row: { kind: string; signal: string; evidence: string }; tone: "strong" | "weak" }}
 */
function CorrelationSignalRow({ row, tone }) {
  const bar =
    tone === "strong"
      ? "bg-gradient-to-b from-emerald-500 to-teal-500"
      : "bg-gradient-to-b from-amber-500 to-orange-500";

  return (
    <li className="relative flex gap-0 border-b border-slate-200/55 transition-colors last:border-b-0 hover:bg-white/70 dark:border-slate-800/70 dark:hover:bg-slate-950/55">
      <div className={`w-[3px] shrink-0 opacity-[0.92] dark:opacity-100 ${bar}`} aria-hidden />
      <div className="min-w-0 flex-1 px-3 py-3 sm:px-4 sm:py-3.5">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-50">
            {row.signal}
          </p>
          <span
            className={`shrink-0 text-[11px] font-semibold ${
              tone === "strong"
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-amber-800 dark:text-amber-300"
            }`}
          >
            {tone === "strong" ? "强关联" : "弱关联"}
          </span>
        </div>
        {row.evidence?.trim() ? (
          <p className="mt-2 text-[12px] leading-[1.65] text-slate-700 dark:text-slate-300">{row.evidence}</p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage2CorrelationAnalysisPanel({ data, variant = "embedded" }) {
  const { strong, weak } = useMemo(() => normalizeStage2CorrelationAnalysis(data), [data]);
  const [page, setPage] = useState(1);

  const flatRows = useMemo(() => {
    const out = [];
    for (let i = 0; i < strong.length; i++) {
      out.push({ kind: "strong", ...strong[i] });
    }
    for (let i = 0; i < weak.length; i++) {
      out.push({ kind: "weak", ...weak[i] });
    }
    return out;
  }, [strong, weak]);

  const total = flatRows.length;

  useEffect(() => {
    setPage(1);
  }, [data]);

  if (!isStage2CorrelationAnalysisPayload(data)) return null;

  if (total === 0) {
    const empty = (
      <p className="rounded-lg border border-dashed border-slate-200/90 bg-slate-50/50 px-4 py-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-400">
        暂无关联分析数据
      </p>
    );
    return variant === "standalone" ? <Shell title="关联分析">{empty}</Shell> : empty;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = flatRows.slice(start, start + PAGE_SIZE);

  const list = (
    <div className={LIST_SHELL}>
      <ul className="m-0 list-none p-0" role="list">
        {pageRows.map((row, i) => {
          const tone = row.kind === "strong" ? "strong" : "weak";
          return (
            <CorrelationSignalRow
              key={`${row.kind}-${start + i}-${row.signal.slice(0, 40)}`}
              row={row}
              tone={tone}
            />
          );
        })}
      </ul>
      {totalPages > 1 ? (
        <div className="border-t border-slate-200/55 px-3 py-2.5 dark:border-slate-800/70">
          <TablePagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
            className="gap-2"
          />
        </div>
      ) : null}
    </div>
  );

  if (variant === "standalone") {
    return <Shell title="关联分析">{list}</Shell>;
  }

  return list;
}
