/**
 * Stage2 `alert_anomalies[]`：告警名称、严重度、触发/解除时间、状态、备注
 */

/** @param {unknown} arr */
export function isStage2AlertAnomaliesList(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  }
  return arr.some((x) => {
    if (String(x.alert_name ?? "").trim()) return true;
    if (String(x.severity ?? "").trim()) return true;
    if (String(x.status ?? "").trim()) return true;
    if (String(x.fired_at ?? "").trim()) return true;
    return false;
  });
}

/** @param {unknown} v */
function normStr(v) {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * @param {unknown} arr
 * @returns {Array<{ alert_name: string; severity: string; fired_at: string; resolved_at: string; status: string; note: string; firedMs: number }>}
 */
export function normalizeStage2AlertAnomalies(arr) {
  if (!isStage2AlertAnomaliesList(arr)) return [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    const alert_name = normStr(x.alert_name) || `告警 ${i + 1}`;
    const severity = normStr(x.severity);
    const fired_at = normStr(x.fired_at);
    const resolved_at = normStr(x.resolved_at);
    const status = normStr(x.status);
    const note = normStr(x.note);
    const firedMs = fired_at ? Date.parse(fired_at) : NaN;
    out.push({
      alert_name,
      severity,
      fired_at,
      resolved_at,
      status,
      note,
      firedMs: Number.isFinite(firedMs) ? firedMs : 0,
    });
  }
  out.sort((a, b) => {
    if (b.firedMs !== a.firedMs) return b.firedMs - a.firedMs;
    return a.alert_name.localeCompare(b.alert_name);
  });
  return out;
}

/** @param {string} sev */
export function severityRankKey(sev) {
  const s = String(sev || "")
    .trim()
    .toUpperCase();
  if (/^P0|CRITICAL|SEV0|SEVERITY[-_]?0$/i.test(s)) return "P0";
  if (/^P1|MAJOR|HIGH|SEV1$/i.test(s)) return "P1";
  if (/^P2|MED|WARNING|WARN|SEV2$/i.test(s)) return "P2";
  if (/^P[3-9]/i.test(s)) return s.slice(0, 2).toUpperCase();
  if (s) return s.slice(0, 8);
  return "其他";
}

const SEV_PALETTE = {
  P0: "#dc2626",
  P1: "#ea580c",
  P2: "#ca8a04",
  P3: "#84cc16",
  P4: "#64748b",
};

/** @param {string} key */
export function severityBarColor(key) {
  const k = String(key).toUpperCase();
  if (k.startsWith("P0")) return SEV_PALETTE.P0;
  if (k.startsWith("P1")) return SEV_PALETTE.P1;
  if (k.startsWith("P2")) return SEV_PALETTE.P2;
  if (k.startsWith("P3")) return SEV_PALETTE.P3;
  if (/^P\d/.test(k)) return SEV_PALETTE.P4;
  return "#64748b";
}

/**
 * @param {Array<{ severity: string }>} rows
 * @returns {{ name: string; value: number; fill: string }[]}
 */
export function aggregateAlertAnomaliesBySeverity(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = severityRankKey(r.severity);
    map.set(k, (map.get(k) || 0) + 1);
  }
  const order = ["P0", "P1", "P2", "P3", "P4", "P5", "其他"];
  const keys = [...map.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return keys.map((name) => ({
    name,
    value: map.get(name) || 0,
    fill: severityBarColor(name),
  }));
}

/**
 * @param {Array<{ status: string }>} rows
 * @returns {{ name: string; value: number; fill: string }[]}
 */
export function aggregateAlertAnomaliesByStatus(rows) {
  const map = new Map();
  for (const r of rows) {
    const raw = String(r.status || "").trim() || "未知";
    const k = /^firing|fir/i.test(raw) ? "Firing" : /^resolved|ok|closed/i.test(raw) ? "Resolved" : raw;
    map.set(k, (map.get(k) || 0) + 1);
  }
  const palette = {
    Firing: "#dc2626",
    Resolved: "#059669",
    未知: "#64748b",
  };
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      name,
      value,
      fill: palette[name] || "#6366f1",
    }));
}
