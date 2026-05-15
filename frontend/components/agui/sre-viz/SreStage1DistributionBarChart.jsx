/**
 * Stage1 日志 / 告警分布等：横向条形图统一外观（与指标趋势图视觉对齐）
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { countLikeBarChartXDomain } from "../../../lib/sreCountBarChartDomain.js";

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
  padding: "10px 12px",
  backgroundColor: "rgba(255,255,255,0.96)",
};

/**
 * @param {{
 *   data: { name: string; value: number; fill?: string }[];
 *   fallbackPalette: string[];
 *   yAxisWidth?: number;
 *   tooltipUnit: string;
 *   ariaLabel?: string;
 *   maxHeight?: number;
 *   height?: number;
 *   allowDecimals?: boolean;
 *   tooltipLabelFormatter?: (label: unknown, payload?: unknown) => string;
 *   xDomain?: [number, number];
 *   tooltipContent?: import("react").ComponentType<{
 *     active?: boolean;
 *     payload?: Array<{ payload?: Record<string, unknown> }>;
 *   }>;
 * }} props
 */
export function Stage1DistributionBarChart({
  data,
  fallbackPalette,
  yAxisWidth = 112,
  tooltipUnit,
  ariaLabel,
  maxHeight = 340,
  height: fixedHeight,
  allowDecimals = false,
  tooltipLabelFormatter,
  xDomain,
  tooltipContent: TooltipContent,
}) {
  if (!data?.length) return null;

  const chartHeight = fixedHeight ?? Math.min(maxHeight, 52 + data.length * 42);

  return (
    <ResponsiveContainer width="100%" height={chartHeight} {...(ariaLabel ? { "aria-label": ariaLabel } : {})}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 10, right: 14, left: 2, bottom: 10 }}
        barCategoryGap="16%"
      >
        <CartesianGrid strokeDasharray="4 6" stroke="rgba(148,163,184,0.22)" horizontal={false} />
        <XAxis
          type="number"
          domain={xDomain ?? countLikeBarChartXDomain(data)}
          tick={{ fontSize: 10, fill: "rgba(71,85,105,0.82)" }}
          tickLine={false}
          axisLine={{ stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 }}
          tickMargin={8}
          allowDecimals={allowDecimals}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={yAxisWidth}
          tick={{ fontSize: 10, fill: "rgba(71,85,105,0.88)" }}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
        />
        {TooltipContent ? (
          <Tooltip
            cursor={{ fill: "rgba(241,245,249,0.72)" }}
            content={TooltipContent}
            contentStyle={{
              margin: 0,
              padding: 0,
              backgroundColor: "transparent",
              border: "none",
              borderRadius: 0,
              boxShadow: "none",
            }}
          />
        ) : (
          <Tooltip
            cursor={{ fill: "rgba(241,245,249,0.72)" }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => [typeof v === "number" ? v : String(v), tooltipUnit]}
            labelFormatter={
              tooltipLabelFormatter
                ? (label, payload) => tooltipLabelFormatter(label, payload)
                : (label) => String(label ?? "")
            }
          />
        )}
        <Bar
          dataKey="value"
          radius={[0, 6, 6, 0]}
          maxBarSize={28}
          stroke="rgba(255,255,255,0.75)"
          strokeWidth={1}
          isAnimationActive={data.length <= 48}
        >
          {data.map((row, i) => (
            <Cell key={`${row.name}-${i}`} fill={row.fill || fallbackPalette[i % fallbackPalette.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
