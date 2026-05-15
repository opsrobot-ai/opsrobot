/**
 * stage1_alerts_distribution：三元组 `count_by_*` 与 logs 分布同形（见 sreStage1LogsDistribution.normalizeStage1LogCountRows）
 */

const TYPE = "stage1_alerts_distribution";

/** @param {unknown} o */
export function isStage1AlertsDistributionPayload(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  if (String(o.type || "").toLowerCase() !== TYPE) return false;
  return Array.isArray(o.count_by_severity);
}
