/**
 * Stage2 `alert_anomalies[]`：状态分布与级别分布（同排）+ 明细分页表格
 */
import { useEffect, useMemo, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../../../components/TablePagination.jsx";
import { Shell } from "./SreVizShell.jsx";
import { Stage1DistributionBarChart } from "./SreStage1DistributionBarChart.jsx";
import {
  EmbeddedChartSurface,
  EmbeddedSectionTitle,
} from "./sreEmbeddedVizChrome.jsx";
import {
  aggregateAlertAnomaliesBySeverity,
  aggregateAlertAnomaliesByStatus,
  isStage2AlertAnomaliesList,
  normalizeStage2AlertAnomalies,
} from "../../../lib/sreStage2AlertAnomalies.js";

const PAGE_SIZE = DEFAULT_TABLE_PAGE_SIZE;

const SEVERITY_BAR_FALLBACK = ["#dc2626", "#f97316", "#eab308", "#3b82f6", "#64748b", "#10b981"];

/** 分布图卡片固定高度，两列对齐（EmbeddedChartSurface 默认 p-2） */
const DISTRIBUTION_SURFACE_H_CLASS = "h-[304px]";
/** 304 − 上下 padding(8+8) */
const DISTRIBUTION_CHART_INNER_PX = 288;

const PIE_TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
  padding: "10px 12px",
  backgroundColor: "rgba(255,255,255,0.96)",
};

function formatTs(iso) {
  if (!iso || String(iso).trim() === "") return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return String(iso);
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return String(iso);
  }
}

function statusTone(status) {
  const s = String(status || "").trim();
  if (/^firing|fir/i.test(s)) {
    return {
      badge:
        "border-rose-200/80 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/45 dark:text-rose-100",
    };
  }
  if (/^resolved|ok|closed/i.test(s)) {
    return {
      badge:
        "border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100",
    };
  }
  return {
    badge:
      "border-slate-200/80 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200",
  };
}

/**
 * @param {{ rows: object[]; variant?: "embedded" | "standalone" }}
 */
export function SreStage2AlertAnomaliesPanel({ rows, variant = "embedded" }) {
  const normalized = useMemo(() => normalizeStage2AlertAnomalies(rows), [rows]);
  const byStatus = useMemo(() => aggregateAlertAnomaliesByStatus(normalized), [normalized]);
  const bySeverity = useMemo(() => aggregateAlertAnomaliesBySeverity(normalized), [normalized]);
  const sevBarData = useMemo(() => bySeverity.filter((d) => d.value > 0), [bySeverity]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  if (!isStage2AlertAnomaliesList(rows)) return null;

  if (normalized.length === 0) {
    const empty = <p className="text-xs text-gray-400 dark:text-gray-500">暂无告警异常条目</p>;
    return variant === "standalone" ? <Shell title="告警异常">{empty}</Shell> : empty;
  }

  const total = normalized.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = normalized.slice(start, start + PAGE_SIZE);

  const pieData = byStatus.filter((d) => d.value > 0);

  const chartsRow =
    pieData.length > 0 || sevBarData.length > 0 ? (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        {sevBarData.length > 0 ? (
          <div className="min-w-0 flex flex-col">
            <EmbeddedSectionTitle>按严重级别</EmbeddedSectionTitle>
            <EmbeddedChartSurface className={DISTRIBUTION_SURFACE_H_CLASS}>
              <div className="w-full" style={{ height: DISTRIBUTION_CHART_INNER_PX }}>
                <Stage1DistributionBarChart
                  data={sevBarData}
                  fallbackPalette={SEVERITY_BAR_FALLBACK}
                  yAxisWidth={100}
                  tooltipUnit="条"
                  ariaLabel="告警按严重级别分布"
                  height={DISTRIBUTION_CHART_INNER_PX}
                />
              </div>
            </EmbeddedChartSurface>
          </div>
        ) : null}
        {pieData.length > 0 ? (
          <div className="min-w-0 flex flex-col">
            <EmbeddedSectionTitle>按状态分布</EmbeddedSectionTitle>
            <EmbeddedChartSurface className={DISTRIBUTION_SURFACE_H_CLASS}>
              <div className="w-full" style={{ height: DISTRIBUTION_CHART_INNER_PX }}>
                <ResponsiveContainer width="100%" height="100%" aria-label="告警按状态分布">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      outerRadius={78}
                      innerRadius={60}
                      paddingAngle={1}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${entry.name}-${index}`} fill={entry.fill} stroke="rgba(255,255,255,0.85)" strokeWidth={1} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={PIE_TOOLTIP_STYLE}
                      formatter={(v) => [typeof v === "number" ? `${v} 条` : String(v), "数量"]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value) => <span className="text-[11px] text-slate-600 dark:text-slate-400">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </EmbeddedChartSurface>
          </div>
        ) : null}
      </div>
    ) : null;

  const table = (
    <div className={chartsRow ? "mt-5" : ""}>
      <EmbeddedSectionTitle>告警明细</EmbeddedSectionTitle>
      <EmbeddedChartSurface className="mt-3 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/95 dark:border-gray-800 dark:bg-gray-900/60">
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-11">
                  #
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 min-w-[160px]">
                  告警名称
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[100px]">
                  严重度
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[100px]">
                  状态
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[130px]">
                  触发
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[130px]">
                  解除
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 min-w-[180px]">
                  备注
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {pageRows.map((row, i) => {
                const idx = start + i + 1;
                const st = statusTone(row.status);
                return (
                  <tr
                    key={`${row.alert_name}-${idx}-${row.fired_at}`}
                    className="align-top transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/40"
                  >
                    <td className="px-3 py-3 tabular-nums text-xs text-gray-500 dark:text-gray-400">{idx}</td>
                    <td className="px-3 py-3 text-[13px] font-semibold leading-snug text-gray-900 dark:text-gray-50">
                      {row.alert_name}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-800 dark:text-gray-200">
                      {row.severity?.trim() ? row.severity : "—"}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] font-semibold ${st.badge}`}
                      >
                        {row.status?.trim() ? row.status : "未知"}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs tabular-nums text-gray-700 dark:text-gray-300">
                      {formatTs(row.fired_at)}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs tabular-nums text-gray-700 dark:text-gray-300">
                      {row.resolved_at?.trim() ? formatTs(row.resolved_at) : "—"}
                    </td>
                    <td className="px-3 py-3 text-[12px] leading-relaxed text-gray-700 dark:text-gray-300 break-words">
                      {row.note?.trim() ? row.note : "—"}
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

  const body = (
    <>
      {chartsRow}
      {table}
    </>
  );

  if (variant === "standalone") {
    return <Shell title="告警异常">{body}</Shell>;
  }

  return body;
}
