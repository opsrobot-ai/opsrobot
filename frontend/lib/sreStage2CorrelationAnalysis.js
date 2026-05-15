/**
 * Stage2 `correlation_analysis`：强 / 弱关联信号列表
 */

/** @param {unknown} arr */
function normalizeSignalRows(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const signal = String(x.signal ?? x.title ?? "").trim() || `信号 ${i + 1}`;
    const evidence = String(x.evidence ?? x.detail ?? "").trim();
    if (!signal && !evidence) continue;
    out.push({
      signal: signal || `信号 ${i + 1}`,
      evidence,
    });
  }
  return out;
}

/** @param {unknown} o */
export function isStage2CorrelationAnalysisPayload(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const strong = normalizeSignalRows(o.strong_signals);
  const weak = normalizeSignalRows(o.weak_signals);
  return strong.length > 0 || weak.length > 0;
}

/**
 * @param {unknown} o
 * @returns {{ strong: ReturnType<typeof normalizeSignalRows>; weak: ReturnType<typeof normalizeSignalRows> }}
 */
export function normalizeStage2CorrelationAnalysis(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) {
    return { strong: [], weak: [] };
  }
  return {
    strong: normalizeSignalRows(o.strong_signals),
    weak: normalizeSignalRows(o.weak_signals),
  };
}
