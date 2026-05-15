/**
 * stage1_metrics_trend 产物（与 AG viz `metrics_trend` schema 独立）
 */

const TYPE = "stage1_metrics_trend";

/** @param {unknown} o */
export function isStage1MetricsTrendPayload(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  if (String(o.type || "").toLowerCase() !== TYPE) return false;
  return Array.isArray(o.metrics_series);
}

/**
 * 单序列 → 折线图用行数据，按时间升序
 * @param {unknown} series
 */
export function normalizeStage1MetricSeries(series) {
  if (!series || typeof series !== "object" || Array.isArray(series)) return null;

  const name = String(series.metric_name ?? "metric").trim() || "metric";
  const unit = String(series.unit ?? "").trim();
  const rawColor = typeof series.color === "string" ? series.color.trim() : "";
  const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(rawColor) ? rawColor : "#3b82f6";

  const points = Array.isArray(series.data_points) ? series.data_points : [];
  const rows = [];
  for (const p of points) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const tRaw = p[0];
    let ms =
      typeof tRaw === "number" && Number.isFinite(tRaw)
        ? (tRaw < 1e12 ? tRaw * 1000 : tRaw)
        : Date.parse(String(tRaw ?? ""));
    if (!Number.isFinite(ms)) continue;
    const v = Number(p[1]);
    if (!Number.isFinite(v)) continue;
    rows.push({ ms, value: v });
  }
  rows.sort((a, b) => a.ms - b.ms);

  return {
    metric_name: name,
    unit,
    color,
    rows,
  };
}
