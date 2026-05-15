/**
 * Stage2 `topology_correlation`：故障节点、上游/下游影响列表
 */

/** @param {unknown} arr */
function normalizeImpactArray(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const service = x.service != null ? String(x.service).trim() : "";
    const impact_type = x.impact_type != null ? String(x.impact_type).trim() : "";
    const details = x.details != null ? String(x.details).trim() : "";
    if (!service && !impact_type && !details) continue;
    out.push({
      service: service || `条目 ${i + 1}`,
      impact_type,
      details,
    });
  }
  return out;
}

/** @param {unknown} o */
export function isStage2TopologyCorrelationPayload(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const fn = o.faulty_node;
  const hasFault = fn != null && String(fn).trim() !== "";
  const up = normalizeImpactArray(o.upstream_impact);
  const down = normalizeImpactArray(o.downstream_impact);
  return hasFault || up.length > 0 || down.length > 0;
}

/**
 * @param {unknown} o
 * @returns {{ faulty_node: string; upstream: ReturnType<typeof normalizeImpactArray>; downstream: ReturnType<typeof normalizeImpactArray> }}
 */
export function normalizeStage2TopologyCorrelation(o) {
  if (!isStage2TopologyCorrelationPayload(o)) {
    return { faulty_node: "", upstream: [], downstream: [] };
  }
  const faulty_node = o.faulty_node != null ? String(o.faulty_node).trim() : "";
  return {
    faulty_node,
    upstream: normalizeImpactArray(o.upstream_impact),
    downstream: normalizeImpactArray(o.downstream_impact),
  };
}

/** 影响类型展示名 */
export function formatImpactTypeLabel(raw) {
  const s = String(raw || "").trim();
  if (!s) return "（未分类）";
  return s.replace(/_/g, " ");
}

/**
 * @param {Array<{ impact_type: string }>} items
 * @returns {{ name: string; value: number; fill: string; fullKey: string }[]}
 */
export function aggregateTopologyImpactTypes(items) {
  const map = new Map();
  for (const row of items) {
    const key = String(row.impact_type || "").trim() || "（未分类）";
    map.set(key, (map.get(key) || 0) + 1);
  }
  const palette = ["#dc2626", "#ea580c", "#ca8a04", "#4f46e5", "#0891b2", "#059669", "#db2777"];
  const keys = [...map.keys()].sort(
    (a, b) => (map.get(b) || 0) - (map.get(a) || 0) || a.localeCompare(b),
  );
  return keys.map((fullKey, i) => {
    const label =
      fullKey.length > 40 ? `${formatImpactTypeLabel(fullKey).slice(0, 38)}…` : formatImpactTypeLabel(fullKey);
    return {
      name: label,
      value: map.get(fullKey) || 0,
      fill: palette[i % palette.length],
      fullKey,
    };
  });
}
