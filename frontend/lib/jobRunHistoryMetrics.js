import { isRunFailureStatus, isRunSuccessStatus } from "./jobStabilityMetrics.js";

/** @param {number} ms */
function dayKeyFromMs(ms) {
  const d = new Date(Number(ms));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 基于 JSONL 运行事件构建「运行历史」指标与按日序列（用于堆叠柱 + 平均耗时折线）。
 * @param {object[]} events
 */
export function analyzeRunHistory(events) {
  const list = Array.isArray(events) ? events : [];
  let ok = 0;
  let fail = 0;
  let neutral = 0;
  /** @type {Map<string, { ok: number, fail: number, sumMs: number, nDur: number }>} */
  const dayMap = new Map();

  for (const ev of list) {
    const ms = Number(ev?.runAtMs ?? ev?.ts ?? 0);
    const day = Number.isFinite(ms) ? dayKeyFromMs(ms) : null;

    if (isRunSuccessStatus(ev?.status)) ok += 1;
    else if (isRunFailureStatus(ev?.status)) fail += 1;
    else neutral += 1;

    if (day) {
      if (!dayMap.has(day)) {
        dayMap.set(day, { ok: 0, fail: 0, sumMs: 0, nDur: 0 });
      }
      const b = dayMap.get(day);
      if (isRunSuccessStatus(ev?.status)) b.ok += 1;
      else if (isRunFailureStatus(ev?.status)) b.fail += 1;

      const dur = Number(ev?.durationMs);
      if (Number.isFinite(dur) && dur >= 0) {
        b.sumMs += dur;
        b.nDur += 1;
      }
    }
  }

  const dates = [...dayMap.keys()].sort();
  const daily = dates.map((date) => {
    const b = dayMap.get(date);
    const avgMs = b.nDur > 0 ? b.sumMs / b.nDur : null;
    return { date, ok: b.ok, fail: b.fail, avgDurationMs: avgMs };
  });

  const terminal = ok + fail;
  const successRatePct = terminal > 0 ? Math.round((ok / terminal) * 1000) / 10 : null;

  return {
    total: list.length,
    ok,
    fail,
    neutral,
    successRatePct,
    daily,
  };
}
