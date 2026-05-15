/**
 * Stage2 `anomaly_patterns_top[]`：异常模式排行（rank、pattern_name、confidence、entry_point）
 */

/** @param {unknown} arr */
export function isStage2AnomalyPatternsTopList(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  }
  return arr.some((x) => {
    const pn = String(x.pattern_name ?? x.pattern ?? "").trim();
    return Boolean(pn);
  });
}

/** @param {string} raw */
export function formatStage2PatternDisplayName(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/_/g, " ");
}

/**
 * 置信度统一为 0–1；允许上游给 0.98 或 98。
 * @param {unknown} raw
 * @returns {number | null}
 */
export function normalizeConfidence01(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n > 1 && n <= 100) return Math.min(n, 100) / 100;
  if (n >= 0 && n <= 1) return n;
  return null;
}

/**
 * @param {unknown} arr
 * @returns {Array<{ rank: number; pattern_name: string; displayName: string; confidence01: number | null; entry_point: string }>}
 */
export function normalizeStage2AnomalyPatternsTop(arr) {
  if (!isStage2AnomalyPatternsTopList(arr)) return [];
  const mapped = arr.map((x, i) => {
    const pattern_name =
      String(x.pattern_name ?? x.pattern ?? "").trim() || `pattern_${i + 1}`;
    const displayName = formatStage2PatternDisplayName(pattern_name);
    const rankRaw = x.rank;
    const rank =
      rankRaw != null && Number.isFinite(Number(rankRaw)) ? Number(rankRaw) : i + 1;
    const confidence01 = normalizeConfidence01(x.confidence ?? x.score);
    const entry_point = x.entry_point != null ? String(x.entry_point).trim() : "";
    return { rank, pattern_name, displayName, confidence01, entry_point };
  });
  mapped.sort((a, b) => a.rank - b.rank);
  return mapped;
}

/**
 * 横向条形图：value = 置信度 × 100；数据按 rank 升序，使第 1 名在 Y 轴最上方。
 * @param {ReturnType<typeof normalizeStage2AnomalyPatternsTop>} rows
 */
export function anomalyPatternsTopConfidenceChartRows(rows) {
  if (!rows?.length) return [];
  const ordered = [...rows].sort((a, b) => a.rank - b.rank);
  const palette = ["#7c3aed", "#6366f1", "#2563eb", "#0891b2", "#0d9488", "#ca8a04", "#dc2626"];
  return ordered.map((r, i) => {
    const short = r.displayName.length > 28 ? `${r.displayName.slice(0, 27)}…` : r.displayName;
    const name = `#${r.rank} ${short}`;
    const pct = r.confidence01 != null ? Math.round(r.confidence01 * 1000) / 10 : 0;
    return {
      name,
      value: pct,
      fill: palette[i % palette.length],
      _fullLabel: `#${r.rank} ${r.displayName}`,
      _patternKey: r.pattern_name,
      _entryPoint: r.entry_point,
    };
  });
}
