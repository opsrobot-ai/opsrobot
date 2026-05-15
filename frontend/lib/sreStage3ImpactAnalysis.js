/**
 * Stage3 impact_analysis：{ impacts: [{ category, description }] }
 */

export function isStage3ImpactAnalysisPayload(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  if (!Array.isArray(v.impacts)) return false;
  return v.impacts.every((row) => row && typeof row === "object" && !Array.isArray(row));
}

/** @returns {Array<{ category: string; description: string }>} */
export function normalizeStage3ImpactAnalysisRows(data) {
  if (!isStage3ImpactAnalysisPayload(data)) return [];
  return data.impacts
    .map((row) => ({
      category: typeof row.category === "string" ? row.category.trim() : "",
      description: typeof row.description === "string" ? row.description.trim() : "",
    }))
    .filter((r) => r.category || r.description);
}
