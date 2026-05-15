/**
 * Stage2 `metric_anomalies[]`：指标项（metric_name、baseline、peak_value 等）
 */

/** @param {unknown} arr */
export function isStage2MetricAnomaliesList(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  }
  return arr.some((x) => {
    const mn = String(x.metric_name ?? x.metric ?? "").trim();
    const b = x.baseline;
    const p = x.peak_value ?? x.peak;
    const bOk = b != null && Number.isFinite(Number(b));
    const pOk = p != null && Number.isFinite(Number(p));
    return Boolean(mn) || (bOk && pOk);
  });
}

/**
 * @param {unknown} arr
 * @returns {Array<{ metric_name: string; service: string; description: string; baseline: number | null; peak_value: number | null }>}
 */
export function normalizeStage2MetricAnomalies(arr) {
  if (!isStage2MetricAnomaliesList(arr)) return [];
  return arr.map((x, i) => {
    const metric_name =
      String(x.metric_name ?? x.metric ?? "").trim() || `指标 ${i + 1}`;
    const service = x.service != null ? String(x.service).trim() : "";
    const description = x.description != null ? String(x.description).trim() : "";
    const bRaw = x.baseline;
    const pRaw = x.peak_value ?? x.peak;
    const baseline =
      bRaw != null && Number.isFinite(Number(bRaw)) ? Number(bRaw) : null;
    const peak_value =
      pRaw != null && Number.isFinite(Number(pRaw)) ? Number(pRaw) : null;
    return { metric_name, service, description, baseline, peak_value };
  });
}

/** baseline → peak 相对变化文案（百分数或兜底） */
export function formatMetricAnomalyDelta(baseline, peak) {
  if (baseline == null || peak == null) return null;
  if (!Number.isFinite(baseline) || !Number.isFinite(peak)) return null;
  if (baseline === 0) {
    if (peak === 0) return null;
    return "基线为 0，峰值出现跃升";
  }
  const pct = ((peak - baseline) / baseline) * 100;
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `相对基线 ${sign}${rounded}%`;
}
