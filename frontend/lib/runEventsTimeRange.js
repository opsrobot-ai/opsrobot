/** 任务详情运行事件：统计时间快捷（24h / 7 / 30 / 日），与 `TaskDetailRunEventsTimeRangeFilter` 默认一致 */
export const RUN_EVENTS_TIME_RANGE_PRESETS = [
  { labelKey: "timeFilter.last24Hours", hours: 24 },
  { labelKey: "timeFilter.last7Days", days: 7 },
  { labelKey: "timeFilter.last30Days", days: 30 },
  { labelKey: "timeFilter.last90Days", days: 90 },
];

/** @param {string | null | undefined} s datetime-local 值 `YYYY-MM-DDTHH:mm` */
export function parseDateTimeLocalInput(s) {
  if (s == null || String(s).trim() === "") return null;
  const t = Date.parse(String(s));
  return Number.isFinite(t) ? t : null;
}

/**
 * 按 `runAtMs` / `ts` 落在 [fromMs, toMs] 内过滤（与任务详情 Token/结果/性能 Tab 一致）。
 * @param {object[]} events
 * @param {string} rangeStartLocal
 * @param {string} rangeEndLocal
 */
export function filterRunEventsByTimeRange(events, rangeStartLocal, rangeEndLocal) {
  const list = Array.isArray(events) ? events : [];
  const fromMs = parseDateTimeLocalInput(rangeStartLocal);
  const toMs = parseDateTimeLocalInput(rangeEndLocal);
  if (fromMs == null && toMs == null) return list;
  return list.filter((ev) => {
    const anchor = Number(ev?.runAtMs ?? ev?.ts ?? NaN);
    if (fromMs != null && (!Number.isFinite(anchor) || anchor < fromMs)) return false;
    if (toMs != null && (!Number.isFinite(anchor) || anchor > toMs)) return false;
    return true;
  });
}
