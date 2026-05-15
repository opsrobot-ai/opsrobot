/**
 * Stage3 `hypothesis_tree`：假设树（已通过 / 已排除 + 置信度）
 */

function isHypothesisLike(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  if (x.description != null && typeof x.description !== "string") return false;
  if (x.confidence != null && typeof x.confidence !== "number") return false;
  return true;
}

/**
 * @param {unknown} val
 */
export function isStage3HypothesisTreePayload(val) {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  const v = val.validated_hypotheses;
  const e = val.excluded_hypotheses;
  const hasV = Array.isArray(v) && v.length > 0;
  const hasE = Array.isArray(e) && e.length > 0;
  if (!hasV && !hasE) return false;
  if (hasV && !v.every(isHypothesisLike)) return false;
  if (hasE && !e.every(isHypothesisLike)) return false;
  return true;
}

/**
 * 合并 hypothesis_tree / three_layer_rca / 根上 validated|excluded 列表（兼容多种产物形态）
 * @param {Record<string, unknown> | null | undefined} root
 * @returns {object | null}
 */
export function coalesceHypothesisTree(root) {
  if (!root || typeof root !== "object" || Array.isArray(root)) return null;
  const ht = root.hypothesis_tree;
  const tlr = root.three_layer_rca;
  if (isStage3HypothesisTreePayload(ht)) return ht;
  if (isStage3HypothesisTreePayload(tlr)) return tlr;
  const v = root.validated_hypotheses;
  const e = root.excluded_hypotheses;
  const wrap = {
    description: "",
    validated_hypotheses: Array.isArray(v) ? v : [],
    excluded_hypotheses: Array.isArray(e) ? e : [],
  };
  return isStage3HypothesisTreePayload(wrap) ? wrap : null;
}

/**
 * @param {{ description?: string; validated_hypotheses?: unknown[]; excluded_hypotheses?: unknown[] }} payload
 */
export function normalizeHypothesisTreeChartModel(payload) {
  const intro =
    typeof payload.description === "string" ? payload.description.trim() : "";

  const validated = (Array.isArray(payload.validated_hypotheses) ? payload.validated_hypotheses : [])
    .filter(isHypothesisLike)
    .map((row, i) => ({
      status: "validated",
      id: String(row.id ?? `V-${i + 1}`),
      dimension: String(row.dimension ?? "—"),
      description: String(row.description ?? "").trim(),
      confidence:
        typeof row.confidence === "number" && Number.isFinite(row.confidence)
          ? Math.min(1, Math.max(0, row.confidence))
          : null,
      exclusion_reason: "",
    }));

  const excluded = (Array.isArray(payload.excluded_hypotheses) ? payload.excluded_hypotheses : [])
    .filter(isHypothesisLike)
    .map((row, i) => ({
      status: "excluded",
      id: String(row.id ?? `E-${i + 1}`),
      dimension: String(row.dimension ?? "—"),
      description: String(row.description ?? "").trim(),
      confidence:
        typeof row.confidence === "number" && Number.isFinite(row.confidence)
          ? Math.min(1, Math.max(0, row.confidence))
          : null,
      exclusion_reason: String(row.exclusion_reason ?? row.exclusionReason ?? "").trim(),
    }));

  return {
    intro,
    validated,
    excluded,
    counts: { validated: validated.length, excluded: excluded.length },
  };
}
