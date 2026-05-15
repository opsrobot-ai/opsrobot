/**
 * 环境感知 `affected_nodes`：对象为带 name/id 的条目列表（区别于纯 string[]）
 */

/** @param {unknown} arr */
export function isStage1AffectedNodesList(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (!x || typeof x !== "object" || Array.isArray(x)) return false;
    const name = String(x.name ?? x.id ?? x.node_id ?? "").trim();
    if (!name) return false;
  }
  return true;
}

/** @param {string} raw */
export function normalizeAffectedNodeStatusKey(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (/^(critical|fatal|p0|down)$/.test(s)) return "critical";
  if (/^(degraded|major|severe|p1|warn|warning)$/.test(s)) return "degraded";
  if (/^(anomaly|error|fail|failed|abnormal)$/.test(s)) return "anomaly";
  if (/^(slow)$/.test(s)) return "slow";
  if (/^(normal|ok|healthy|up|running|resolved)$/.test(s)) return "normal";
  if (s) return s.replace(/\s+/g, "_");
  return "unknown";
}

const STATUS_HEX = Object.freeze({
  critical: "#dc2626",
  anomaly: "#e11d48",
  degraded: "#f97316",
  slow: "#eab308",
  normal: "#22c55e",
  unknown: "#64748b",
});

/** @param {object} row */
export function statusAccentHex(row) {
  const k = normalizeAffectedNodeStatusKey(row?.status);
  return STATUS_HEX[k] || STATUS_HEX.unknown;
}
