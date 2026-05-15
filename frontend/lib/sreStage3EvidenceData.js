/**
 * Stage3 evidence_data：{ strong_signals?: [], weak_signals?: [] }
 * 每项：name | title | signal，detail | evidence，可选 confidence（0–1 或 百分数）
 */

/** @param {unknown} x @param {number} i */
function normalizeEvidenceSignalRow(x, i) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const name = String(x.name ?? x.title ?? x.signal ?? "").trim();
  const detail = String(x.detail ?? x.evidence ?? "").trim();
  let confidence = null;
  if (x.confidence != null) {
    const n = typeof x.confidence === "number" ? x.confidence : Number(x.confidence);
    if (Number.isFinite(n)) confidence = n;
  }
  if (!name && !detail) return null;
  return {
    name: name || `证据 ${i + 1}`,
    detail,
    confidence,
  };
}

/** @param {unknown} arr */
export function normalizeStage3EvidenceSignalsArray(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const row = normalizeEvidenceSignalRow(arr[i], i);
    if (row) out.push(row);
  }
  return out;
}

/**
 * @param {unknown} v
 * @returns {{ strong: ReturnType<typeof normalizeStage3EvidenceSignalsArray>; weak: ReturnType<typeof normalizeStage3EvidenceSignalsArray> }}
 */
export function normalizeStage3EvidenceDataModel(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return { strong: [], weak: [] };
  }
  return {
    strong: normalizeStage3EvidenceSignalsArray(v.strong_signals),
    weak: normalizeStage3EvidenceSignalsArray(v.weak_signals),
  };
}

export function isStage3EvidenceDataPayload(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  if (!("strong_signals" in v) && !("weak_signals" in v)) return false;
  const ok = (a) => {
    if (a === undefined || a === null) return true;
    return Array.isArray(a) && a.every((x) => x != null && typeof x === "object" && !Array.isArray(x));
  };
  return ok(v.strong_signals) && ok(v.weak_signals);
}

/** 顶层 strong_signals / weak_signals 数组渲染用 */
export function isStage3EvidenceSignalsOnlyArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.every((x) => x != null && typeof x === "object" && !Array.isArray(x));
}
