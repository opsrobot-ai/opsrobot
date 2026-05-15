/**
 * stage1_logs_distribution 产物：与标准 SRE viz `logs_distribution` 不同的嵌入式 schema。
 */

const TYPE = "stage1_logs_distribution";

/** @param {unknown} o */
export function isStage1LogsDistributionPayload(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  if (String(o.type || "").toLowerCase() !== TYPE) return false;
  return Array.isArray(o.count_by_level);
}

/**
 * `[name, count, colorHex?][]` → `{ name, value, fill }[]`
 * @param {unknown} rows
 */
export function normalizeStage1LogCountRows(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 2) continue;
    const name = String(row[0] ?? "").trim() || `项 ${i + 1}`;
    const value = Number(row[1]);
    const n = Number.isFinite(value) ? value : 0;
    const c = row[2];
    const fill =
      typeof c === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim())
        ? c.trim()
        : undefined;
    out.push({ name, value: n, fill });
  }
  return out;
}
