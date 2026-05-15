/**
 * Stage3 `root_cause_timeline`：{ events: [{ time, event, node }] }
 */

/** @param {unknown} clockRaw */
export function parseRootCauseTimelineClockSec(clockRaw) {
  const s = String(clockRaw ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mi = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  const se = Math.min(59, Math.max(0, parseInt(m[3], 10)));
  return h * 3600 + mi * 60 + se;
}

function formatElapsedMmSs(totalSec) {
  if (!Number.isFinite(totalSec) || totalSec < 0) return "0:00";
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * @param {unknown} val
 */
export function isStage3RootCauseTimelinePayload(val) {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  const ev = val.events;
  if (!Array.isArray(ev) || ev.length === 0) return false;
  let ok = 0;
  for (const x of ev) {
    if (!x || typeof x !== "object" || Array.isArray(x)) return false;
    const msg = String(x.event ?? x.Event ?? x.message ?? "").trim();
    const t = String(x.time ?? x.Time ?? "").trim();
    if (msg || t) ok += 1;
  }
  return ok > 0;
}

/**
 * @param {{ events?: unknown[] }} payload
 */
export function normalizeStage3RootCauseTimeline(payload) {
  const raw = Array.isArray(payload.events) ? payload.events : [];
  const rows = [];
  let fallbackSec = 0;

  for (let i = 0; i < raw.length; i++) {
    const x = raw[i];
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const timeRaw = String(x.time ?? x.Time ?? "").trim();
    const content = String(x.event ?? x.Event ?? x.message ?? x.content ?? "").trim() || "—";
    const node = String(x.node ?? x.Node ?? x.source ?? "").trim() || "—";

    let absSec = parseRootCauseTimelineClockSec(timeRaw);
    if (absSec == null) {
      absSec = fallbackSec;
      fallbackSec += 1;
    }

    rows.push({
      id: `rca-t-${i}`,
      timeLabel: timeRaw || formatElapsedMmSs(absSec),
      absSec,
      node,
      content,
    });
  }

  rows.sort((a, b) => a.absSec - b.absSec || a.id.localeCompare(b.id));

  const baseSec = rows.length ? rows[0].absSec : 0;
  const normalized = rows.map((r, idx) => ({
    ...r,
    elapsedSec: Math.max(0, r.absSec - baseSec),
    idx,
  }));

  const spanSec =
    normalized.length >= 2
      ? Math.max(0, normalized[normalized.length - 1].elapsedSec)
      : 0;

  const progressSeries = normalized.map((r, i) => ({
    elapsedSec: r.elapsedSec,
    cumulative: i + 1,
    timeLabel: r.timeLabel,
  }));

  /** @type {Record<string, number>} */
  const nodeCounts = {};
  for (const r of normalized) {
    const k = r.node || "—";
    nodeCounts[k] = (nodeCounts[k] || 0) + 1;
  }

  const nodeBarData = Object.entries(nodeCounts)
    .map(([name, value]) => ({
      name: name.length > 24 ? `${name.slice(0, 22)}…` : name,
      fullName: name,
      value,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    normalized,
    spanSec,
    eventCount: normalized.length,
    progressSeries,
    nodeBarData,
  };
}
