/**
 * Stage2 `anomaly_patterns_top[]`：仅置信度条形图（详情在 tooltip）
 */
import { useMemo, useSyncExternalStore } from "react";
import { Shell } from "./SreVizShell.jsx";
import { Stage1DistributionBarChart } from "./SreStage1DistributionBarChart.jsx";
import { EmbeddedChartSurface, EmbeddedSectionTitle } from "./sreEmbeddedVizChrome.jsx";
import {
  anomalyPatternsTopConfidenceChartRows,
  isStage2AnomalyPatternsTopList,
  normalizeStage2AnomalyPatternsTop,
} from "../../../lib/sreStage2AnomalyPatternsTop.js";

const ACCENT_COLORS = ["#7c3aed", "#6366f1", "#2563eb", "#0891b2", "#0d9488", "#ca8a04", "#dc2626"];

function subscribeHtmlDarkClass(callback) {
  if (typeof document === "undefined") return () => {};
  const el = document.documentElement;
  const obs = new MutationObserver(callback);
  obs.observe(el, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

function snapshotHtmlHasDarkClass() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

function AnomalyPatternBarTooltip({ active, payload }) {
  const isDark = useSyncExternalStore(subscribeHtmlDarkClass, snapshotHtmlHasDarkClass, () => false);

  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const title = row._fullLabel != null ? String(row._fullLabel) : String(row.name ?? "");
  const patternKey = row._patternKey != null ? String(row._patternKey) : "";
  const entry = row._entryPoint != null ? String(row._entryPoint).trim() : "";
  const pctVal = row.value;
  const pctStr =
    typeof pctVal === "number" && Number.isFinite(pctVal)
      ? `${pctVal}%`
      : pctVal != null
        ? `${pctVal}%`
        : "—";

  const panel =
    "max-w-sm rounded-[10px] border px-3.5 py-3 text-xs shadow-lg ring-1 " +
    (isDark
      ? "border-slate-600 bg-slate-900 text-slate-100 ring-white/[0.08]"
      : "border-slate-200/90 bg-white text-slate-900 ring-black/[0.06]");

  return (
    <div
      className={panel}
      style={{
        boxShadow: isDark ? "0 10px 24px rgba(0,0,0,0.45)" : "0 10px 24px rgba(15,23,42,0.12)",
      }}
    >
      <p className={`text-[13px] font-semibold leading-snug ${isDark ? "text-slate-50" : "text-slate-900"}`}>
        {title}
      </p>
      <p
        className={`mt-1.5 text-[11px] tabular-nums ${isDark ? "text-violet-300" : "text-violet-700"}`}
      >
        置信度 <span className="font-semibold">{pctStr}</span>
      </p>
      {patternKey ? (
        <p className={`mt-2 break-all font-mono text-[10.5px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          {patternKey}
        </p>
      ) : null}
      {entry ? (
        <div className={`mt-2.5 border-t pt-2.5 ${isDark ? "border-slate-700" : "border-slate-100"}`}>
          <p
            className={`text-[10px] font-semibold uppercase tracking-wide ${isDark ? "text-slate-400" : "text-slate-500"}`}
          >
            入口 / 触发点
          </p>
          <p className={`mt-1 text-[12px] leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>
            {entry}
          </p>
        </div>
      ) : (
        <p className={`mt-2 text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>暂无入口说明</p>
      )}
    </div>
  );
}

/**
 * @param {{ rows: object[]; variant?: "embedded" | "standalone" }}
 */
export function SreStage2AnomalyPatternsTopPanel({ rows, variant = "embedded" }) {
  const normalized = useMemo(() => normalizeStage2AnomalyPatternsTop(rows), [rows]);
  const chartData = useMemo(() => anomalyPatternsTopConfidenceChartRows(normalized), [normalized]);

  if (!isStage2AnomalyPatternsTopList(rows)) return null;

  if (normalized.length === 0) {
    const empty = <p className="text-xs text-gray-400 dark:text-gray-500">暂无异常模式排行数据</p>;
    return variant === "standalone" ? <Shell title="异常模式排行">{empty}</Shell> : empty;
  }

  const chart =
    chartData.length > 0 ? (
      <div>
        <EmbeddedSectionTitle>模式置信度（%）</EmbeddedSectionTitle>
        <EmbeddedChartSurface>
          <Stage1DistributionBarChart
            data={chartData}
            fallbackPalette={ACCENT_COLORS}
            yAxisWidth={148}
            tooltipUnit="%"
            ariaLabel="异常模式置信度排行"
            maxHeight={360}
            allowDecimals
            xDomain={[0, 100]}
            tooltipContent={AnomalyPatternBarTooltip}
          />
        </EmbeddedChartSurface>
      </div>
    ) : null;

  if (variant === "standalone") {
    return <Shell title="异常模式排行">{chart}</Shell>;
  }

  return chart;
}
