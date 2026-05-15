/**
 * Stage2 `log_anomalies`：分页表格（anomaly_patterns）
 */
import { useEffect, useMemo, useState } from "react";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../../../components/TablePagination.jsx";
import { Shell } from "./SreVizShell.jsx";
import { EmbeddedChartSurface } from "./sreEmbeddedVizChrome.jsx";
import {
  isStage2LogAnomaliesPayload,
  normalizeStage2LogAnomalyPatterns,
  stage2LogAnomaliesTotalCount,
} from "../../../lib/sreStage2LogAnomalies.js";

const PAGE_SIZE = DEFAULT_TABLE_PAGE_SIZE;

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage2LogAnomaliesPanel({ data, variant = "embedded" }) {
  const patterns = useMemo(() => normalizeStage2LogAnomalyPatterns(data), [data]);
  const totalLogs = useMemo(() => stage2LogAnomaliesTotalCount(data), [data]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [data]);

  if (!isStage2LogAnomaliesPayload(data)) return null;

  if (patterns.length === 0) {
    const empty = <p className="text-xs text-gray-400 dark:text-gray-500">暂无日志异常条目</p>;
    return variant === "standalone" ? <Shell title="日志异常">{empty}</Shell> : empty;
  }

  const total = patterns.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = patterns.slice(start, start + PAGE_SIZE);

  const table = (
    <div className="space-y-3">
      {totalLogs != null ? (
        <p className="text-[12px] text-slate-600 dark:text-slate-400">
          错误日志合计：<span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">{totalLogs}</span>
        </p>
      ) : null}
      <EmbeddedChartSurface className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/95 dark:border-gray-800 dark:bg-gray-900/60">
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-12">
                  #
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 min-w-[180px]">
                  异常模式
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[140px]">
                  服务
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[88px]">
                  次数
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 min-w-[220px]">
                  说明
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {pageRows.map((row, i) => {
                const idx = start + i + 1;
                return (
                  <tr
                    key={`${row.fullKey}-${idx}`}
                    className="align-top transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/40"
                  >
                    <td className="px-3 py-3 tabular-nums text-xs text-gray-500 dark:text-gray-400">{idx}</td>
                    <td className="px-3 py-3 text-[13px] font-semibold leading-snug text-gray-900 dark:text-gray-50">
                      {row.pattern}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {row.service?.trim() ? row.service : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-[13px] font-medium text-rose-700 dark:text-rose-300">
                      {row.count}
                    </td>
                    <td className="px-3 py-3 text-[12px] leading-relaxed text-gray-700 dark:text-gray-300 break-words">
                      {row.description?.trim() ? row.description : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <div className="border-t border-gray-100 px-3 py-2.5 dark:border-gray-800">
            <TablePagination
              page={safePage}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
              className="gap-2"
            />
          </div>
        ) : null}
      </EmbeddedChartSurface>
    </div>
  );

  if (variant === "standalone") {
    return <Shell title="日志异常">{table}</Shell>;
  }

  return table;
}
