/**
 * Stage2 `timeline[]`：事件时间线（timestamp、source、content）
 */

/** @param {unknown} raw */
export function parseStage2TimelineTimestampMs(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 1e12) return raw;
    if (raw > 1e9) return raw * 1000;
    return raw;
  }
  const ms = Date.parse(String(raw).trim());
  return Number.isFinite(ms) ? ms : null;
}

/** @param {number} ms */
export function formatStage2TimelineClock(ms) {
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  const frac = String(d.getUTCMilliseconds()).padStart(3, "0");
  return `${y}-${mo}-${day} ${hh}:${mm}:${ss}.${frac}Z`;
}

/** @param {unknown} arr */
export function isStage2TimelineList(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  }
  return arr.some((x) => {
    const ts = parseStage2TimelineTimestampMs(x.timestamp ?? x.time ?? x.at ?? x.t);
    const content = String(x.content ?? x.message ?? x.text ?? x.detail ?? "").trim();
    const source = String(x.source ?? x.from ?? x.actor ?? "").trim();
    return (ts != null && (content || source)) || (content.length > 0 && source.length > 0) || content.length > 0;
  });
}

/**
 * @param {unknown} arr
 * @returns {Array<{
 *   timestampMs: number;
 *   timeLabel: string;
 *   source: string;
 *   content: string;
 * }>}
 */
export function normalizeStage2Timeline(arr) {
  if (!isStage2TimelineList(arr)) return [];
  const baseOrder = [];
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    let ts = parseStage2TimelineTimestampMs(x.timestamp ?? x.time ?? x.at ?? x.t);
    if (ts == null) ts = i * 1000;
    const source = String(x.source ?? x.from ?? x.actor ?? "").trim() || "—";
    const content = String(x.content ?? x.message ?? x.text ?? x.detail ?? "").trim() || "—";
    baseOrder.push({ timestampMs: ts, timeLabel: formatStage2TimelineClock(ts), source, content });
  }
  baseOrder.sort((a, b) => a.timestampMs - b.timestampMs);
  return baseOrder;
}
