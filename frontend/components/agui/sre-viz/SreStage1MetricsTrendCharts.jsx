/**
 * Stage1 `type: stage1_metrics_trend`：多序列折线图（序列单位可能不同，分块展示）
 */
import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Shell } from "./SreVizShell.jsx";
import {
  EmbeddedChartSurface,
  EmbeddedSectionTitle,
  EmbeddedSummaryPanel,
  embeddedSummaryProseClass,
} from "./sreEmbeddedVizChrome.jsx";
import {
  isStage1MetricsTrendPayload,
  normalizeStage1MetricSeries,
} from "../../../lib/sreStage1MetricsTrend.js";

function formatY(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(1);
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
}

/** Y 轴上下留白，避免曲线贴边 */
function paddedYDomain(rows) {
  const vals = rows.map((r) => r.value).filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!vals.length) return undefined;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (min === max) {
    const bump = Math.abs(min) * 0.06 || 1;
    return [min - bump, max + bump];
  }
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

/** X 轴（时间）两端微留白 */
function paddedXDomain(rows) {
  if (!rows.length) return undefined;
  const t0 = rows[0].ms;
  const t1 = rows[rows.length - 1].ms;
  const span = Math.max(t1 - t0, 60_000);
  const pad = span * 0.03;
  return [t0 - pad, t1 + pad];
}

function chartHeightPx(pointCount) {
  if (pointCount <= 8) return 200;
  if (pointCount <= 24) return 220;
  return 248;
}

function MetricLineBlock({ normalized }) {
  const gradId = useId().replace(/:/g, "");
  const rows = Array.isArray(normalized?.rows) && normalized.rows.length ? normalized.rows : [];
  const title = String(normalized?.metric_name ?? "metric").trim() || "metric";
  const unit = String(normalized?.unit ?? "").trim();
  const color = typeof normalized?.color === "string" && normalized.color.trim() ? normalized.color.trim() : "#3b82f6";

  const yDom = useMemo(() => paddedYDomain(rows), [rows]);
  const xDom = useMemo(() => paddedXDomain(rows), [rows]);

  if (!rows.length) return null;

  const dense = rows.length > 36;
  const showDots = rows.length <= 20;

  const tooltipStyles = {
    fontSize: 12,
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.35)",
    boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
    padding: "10px 12px",
    backgroundColor: "rgba(255,255,255,0.96)",
  };

  return (
    <div className="space-y-0">
      <EmbeddedSectionTitle>
        <span className="normal-case tracking-normal">{title}</span>
        {unit ? (
          <span className="ml-1 font-mono text-[10px] font-normal normal-case tracking-normal text-gray-400">
            ({unit})
          </span>
        ) : null}
      </EmbeddedSectionTitle>
      <EmbeddedChartSurface>
        <ResponsiveContainer width="100%" height={chartHeightPx(rows.length)}>
          <AreaChart data={rows} margin={{ top: 12, right: 8, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="55%" stopColor={color} stopOpacity={0.06} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 6" stroke="rgba(148,163,184,0.22)" vertical={false} />
            <XAxis
              dataKey="ms"
              type="number"
              domain={xDom ?? ["dataMin", "dataMax"]}
              tickFormatter={(ms) =>
                typeof ms === "number" && Number.isFinite(ms)
                  ? new Date(ms).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: rows.length > 48 ? undefined : "2-digit",
                      hour12: false,
                    })
                  : ""
              }
              tick={{ fontSize: 10, fill: "rgba(71,85,105,0.82)" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 }}
              tickMargin={8}
              minTickGap={28}
            />
            <YAxis
              domain={yDom ?? ["auto", "auto"]}
              tick={{ fontSize: 10, fill: "rgba(71,85,105,0.82)" }}
              tickFormatter={(v) => formatY(Number(v))}
              tickLine={false}
              axisLine={false}
              width={56}
              tickMargin={6}
            />
            <Tooltip
              cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.7 }}
              contentStyle={tooltipStyles}
              labelFormatter={(ms) =>
                typeof ms === "number" && Number.isFinite(ms)
                  ? new Date(ms).toLocaleString(undefined, {
                      hour12: false,
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: rows.length > 72 ? undefined : "2-digit",
                    })
                  : String(ms)}
              formatter={(value) => [formatY(Number(value)), unit || "数值"]}
              separator=" · "
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={dense ? 1.75 : 2.25}
              fill={`url(#${gradId})`}
              fillOpacity={1}
              activeDot={{
                r: 6,
                strokeWidth: 2,
                stroke: "#fff",
                fill: color,
                style: { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.12))" },
              }}
              dot={
                showDots
                  ? { r: 3.5, strokeWidth: 2, stroke: "#fff", fill: color }
                  : false
              }
              connectNulls
              name={title}
              isAnimationActive={rows.length <= 64}
            />
          </AreaChart>
        </ResponsiveContainer>
      </EmbeddedChartSurface>
    </div>
  );
}

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage1MetricsTrendCharts({ data, variant = "embedded" }) {
  const normalizedList = useMemo(() => {
    if (!data?.metrics_series || !Array.isArray(data.metrics_series)) return [];
    return data.metrics_series.map((s) => normalizeStage1MetricSeries(s)).filter(Boolean);
  }, [data]);

  if (!isStage1MetricsTrendPayload(data)) return null;

  const summary = String(data.summary || "").trim();

  const body = (
    <>
      {summary ? (
        <EmbeddedSummaryPanel>
          <p className={embeddedSummaryProseClass}>{summary}</p>
        </EmbeddedSummaryPanel>
      ) : null}
      {normalizedList.length === 0 ? (
        <p
          className={`text-xs text-gray-500 dark:text-gray-400 ${summary ? "mt-4" : ""}`}
        >
          暂无 metrics_series 数据点
        </p>
      ) : (
        <div className={summary ? "mt-5 space-y-5" : "space-y-5"}>
          {normalizedList.map((n, idx) => (
            <MetricLineBlock key={`${n.metric_name}-${n.unit}-${idx}`} normalized={n} />
          ))}
        </div>
      )}
    </>
  );

  if (variant === "standalone") {
    const title =
      typeof data.title === "string" && data.title.trim() ? data.title.trim() : "指标趋势图";
    return <Shell title={title}>{body}</Shell>;
  }

  return body;
}
