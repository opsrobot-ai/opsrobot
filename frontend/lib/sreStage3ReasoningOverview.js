/**
 * Stage3 `overview_conclusion`：推理总览（summary + three_layer_rca[]）
 */

function isThreeLayerRcaRow(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const layer = x.layer ?? x.Layer;
  const name = x.name ?? x.Name;
  return layer != null || name != null;
}

/**
 * @param {unknown} val
 */
export function isStage3ThreeLayerRcaLayerArray(val) {
  if (!Array.isArray(val) || val.length === 0) return false;
  return val.every(isThreeLayerRcaRow);
}

/**
 * @param {unknown} val
 */
export function isStage3ReasoningOverviewPayload(val) {
  if (val == null) return false;
  if (typeof val === "string") return val.trim() !== "";
  if (typeof val === "number" && Number.isFinite(val)) return true;
  if (typeof val !== "object" || Array.isArray(val)) return false;
  const summary = val.summary ?? val.Summary ?? val.overview ?? val.Overview;
  if (typeof summary === "string" && summary.trim() !== "") return true;
  const layers = val.three_layer_rca ?? val.threeLayerRca;
  if (isStage3ThreeLayerRcaLayerArray(layers)) return true;
  return false;
}

/** 因果展示顺序：触发 → 直接原因 → 根因 */
function layerSortRank(layerRaw) {
  const s = String(layerRaw ?? "").toLowerCase();
  if (/trigger/i.test(s)) return 0;
  if (/direct/i.test(s)) return 1;
  if (/root/i.test(s)) return 2;
  return 50;
}

const LAYER_LABEL_ZH = [
  [/trigger/i, "触发因子"],
  [/direct\s*cause/i, "直接原因"],
  [/root\s*cause/i, "根因层"],
];

/**
 * @param {unknown} layerRaw
 */
export function formatThreeLayerLabelZh(layerRaw) {
  const s = String(layerRaw ?? "").trim();
  if (!s) return "—";
  for (const [re, zh] of LAYER_LABEL_ZH) {
    if (re.test(s)) return zh;
  }
  return s;
}

/**
 * @param {{ summary?: string; three_layer_rca?: unknown[] }} payload
 */
export function normalizeReasoningOverviewModel(payload) {
  const summaryRaw =
    typeof payload.summary === "string"
      ? payload.summary.trim()
      : typeof payload.Summary === "string"
        ? payload.Summary.trim()
        : "";

  const rawLayers = Array.isArray(payload.three_layer_rca)
    ? payload.three_layer_rca
    : Array.isArray(payload.threeLayerRca)
      ? payload.threeLayerRca
      : [];

  const layers = rawLayers.filter(isThreeLayerRcaRow).map((row, i) => {
    const layer = String(row.layer ?? row.Layer ?? "").trim();
    const name = String(row.name ?? row.Name ?? "").trim();
    const description = String(row.description ?? row.Description ?? "").trim();
    const confRaw = row.confidence ?? row.Confidence;
    const confidence =
      typeof confRaw === "number" && Number.isFinite(confRaw)
        ? Math.min(1, Math.max(0, confRaw))
        : null;
    return {
      id: `L-${i + 1}`,
      layer,
      layerZh: formatThreeLayerLabelZh(layer),
      name,
      description,
      confidence,
      sortRank: layerSortRank(layer),
    };
  });

  layers.sort((a, b) => a.sortRank - b.sortRank || a.layer.localeCompare(b.layer));

  return {
    summary: summaryRaw,
    layers,
  };
}
