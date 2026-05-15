/**
 * Stage3 根因时间线：进程折线（累计事件）+ 节点分布条 + 纵向时间轴
 */
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  isStage3RootCauseTimelinePayload,
  normalizeStage3RootCauseTimeline,
} from "../../../lib/sreStage3RootCauseTimeline.js";
import { Stage1DistributionBarChart } from "./SreStage1DistributionBarChart.jsx";

const CHART_SURFACE =
  "rounded-xl border border-slate-200/80 bg-slate-50/35 p-3 shadow-inner ring-1 ring-black/[0.03] dark:border-slate-800/70 dark:bg-slate-950/30 dark:ring-white/[0.04]";

const LINE_TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
  padding: "10px 12px",
  backgroundColor: "rgba(255,255,255,0.96)",
};

const AXIS_OFFSET = "0.625rem";

const NODE_BAR_COLORS = ["#6366f1", "#0ea5e9", "#059669", "#d97706", "#64748b", "#8b5cf6"];

function TimelineCard({ row }) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-200/75 bg-white/90 px-3 py-2 shadow-sm dark:border-gray-800/90 dark:bg-gray-950/50">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <time className="font-mono text-[12px] font-bold tabular-nums tracking-tight text-indigo-700 dark:text-indigo-300">
          {row.timeLabel}
        </time>
        <span className="rounded-md bg-slate-100/95 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200/90 dark:bg-slate-900/70 dark:text-slate-200 dark:ring-slate-700">
          {row.node}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-800 dark:text-slate-200">{row.content}</p>
    </div>
  );
}

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage3RootCauseTimelinePanel({ data, variant = "embedded" }) {
  const model = useMemo(() => normalizeStage3RootCauseTimeline(data), [data]);

  if (!isStage3RootCauseTimelinePayload(data)) return null;

  const empty = <p className="text-xs text-gray-400 dark:text-gray-500">暂无根因时间线</p>;
  if (model.normalized.length === 0) {
    return variant === "standalone" ? (
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        {empty}
      </div>
    ) : (
      empty
    );
  }

  const lineH = Math.min(320, 140 + Math.min(model.progressSeries.length, 12) * 6);

  const body = (
    <div className="space-y-5">
      <div
        className="flex flex-wrap gap-2 text-[11px]"
        role="status"
        aria-label="时间线摘要"
      >
        <span className="rounded-full bg-indigo-100/90 px-2.5 py-1 font-semibold text-indigo-950 dark:bg-indigo-950/50 dark:text-indigo-100">
          事件 {model.eventCount}
        </span>
        <span className="rounded-full bg-slate-200/90 px-2.5 py-1 font-semibold text-slate-800 dark:bg-slate-800/90 dark:text-slate-100">
          跨度 T+{Math.ceil(model.spanSec)}s
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <div className={CHART_SURFACE}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            累计事件推进（相对首条时刻）
          </p>
          <div style={{ height: lineH }}>
            <ResponsiveContainer width="100%" height="100%" aria-label="根因时间线累计事件折线">
              <LineChart data={model.progressSeries} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="4 6" stroke="rgba(148,163,184,0.22)" />
                <XAxis
                  type="number"
                  dataKey="elapsedSec"
                  domain={[0, "dataMax"]}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 }}
                  tickFormatter={(v) => `+${v}s`}
                />
                <YAxis
                  allowDecimals={false}
                  width={36}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, "dataMax"]}
                />
                <Tooltip
                  contentStyle={LINE_TOOLTIP_STYLE}
                  formatter={(v) => [typeof v === "number" ? v : String(v), "累计事件"]}
                  labelFormatter={(_, payload) => {
                    const p = Array.isArray(payload) ? payload[0]?.payload : payload?.payload;
                    return p?.timeLabel ? `时刻 ${p.timeLabel}` : "";
                  }}
                />
                <Line
                  type="stepAfter"
                  dataKey="cumulative"
                  name="累计事件数"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#4f46e5", strokeWidth: 1, stroke: "#fff" }}
                  isAnimationActive={model.progressSeries.length <= 40}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {model.nodeBarData.length > 0 ? (
          <div className={CHART_SURFACE}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              涉及节点（事件条数）
            </p>
            <Stage1DistributionBarChart
              data={model.nodeBarData.map((d, i) => ({
                ...d,
                fill: NODE_BAR_COLORS[i % NODE_BAR_COLORS.length],
              }))}
              fallbackPalette={NODE_BAR_COLORS}
              yAxisWidth={148}
              tooltipUnit="次"
              ariaLabel="根因时间线节点事件分布"
              height={Math.min(300, 52 + model.nodeBarData.length * 36)}
              tooltipLabelFormatter={(_, payload) => {
                const row = Array.isArray(payload) ? payload[0]?.payload : payload?.payload;
                return row?.fullName ? String(row.fullName) : "";
              }}
            />
          </div>
        ) : null}
      </div>

      <div className={CHART_SURFACE}>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          事件序列
        </p>
        <div className="relative min-w-0 pl-5">
          <div
            className="pointer-events-none absolute top-2 bottom-2 w-px -translate-x-1/2 bg-gradient-to-b from-indigo-400 via-indigo-300 to-slate-200 dark:from-indigo-500 dark:via-indigo-600 dark:to-slate-600"
            style={{ left: AXIS_OFFSET }}
            aria-hidden
          />
          <ul className="relative z-[1] space-y-3.5" role="list">
            {model.normalized.map((row) => (
              <li key={row.id} className="relative">
                <span
                  className="absolute top-3 z-[2] h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-indigo-600 shadow-sm ring-2 ring-white dark:bg-indigo-500 dark:ring-gray-950"
                  style={{ left: `calc(-1 * ${AXIS_OFFSET})` }}
                  aria-hidden
                />
                <TimelineCard row={row} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  if (variant === "standalone") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {body}
      </div>
    );
  }

  return body;
}
