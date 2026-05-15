/**
 * Stage2 `log_anomalies`：异常日志聚类（total_error_logs + anomaly_patterns[]）
 */

/** @param {unknown} o */
export function isStage2LogAnomaliesPayload(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  if (!Array.isArray(o.anomaly_patterns)) return false;
  return o.anomaly_patterns.every((row) => row == null || (typeof row === "object" && !Array.isArray(row)));
}

/** @param {unknown} o */
export function normalizeStage2LogAnomalyPatterns(o) {
  if (!isStage2LogAnomaliesPayload(o)) return [];
  const rows = o.anomaly_patterns;
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const pattern = String(row.pattern ?? "").trim() || `模式 ${i + 1}`;
    const countRaw = row.count;
    const count =
      typeof countRaw === "number" && Number.isFinite(countRaw)
        ? countRaw
        : typeof countRaw === "string" && Number.isFinite(Number(countRaw))
          ? Number(countRaw)
          : 0;
    const service = row.service != null ? String(row.service).trim() : "";
    const description = row.description != null ? String(row.description).trim() : "";
    out.push({ pattern, count, service, description, fullKey: `p${i}` });
  }
  return out;
}

/** @param {unknown} o */
export function stage2LogAnomaliesTotalCount(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const raw = o.total_error_logs;
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}
