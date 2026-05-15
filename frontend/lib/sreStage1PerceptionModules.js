/**
 * 环境感知（stage1）content JSON：模块分组、字段别名、是否有数据判定（供 SreStage1PerceptionModules 使用）
 */

/** 与产物 _key_aliases 对齐的默认中文映射（根上无 _key_aliases 时使用） */
export const SRE_STAGE1_DEFAULT_KEY_ALIASES = {
  _template_version: "模板版本",
  timestamp: "记录生成时间",
  _purpose: "阶段目的说明",
  type: "数据类型",
  incident_id: "事件唯一标识",
  title: "报告标题",
  pipeline_status: "Pipeline运行状态",
  analysis_confidence: "分析置信度",
  time_window: "事件时间窗口",
  start: "事件开始时间",
  end: "事件结束时间",
  duration_seconds: "持续时长",
  core_conclusion: "核心结论",
  affected_nodes: "受影响对象",
  logs_distribution: "日志分布图",
  logs_summary: "日志分布摘要",
  metrics_trend: "指标趋势图",
  metrics_summary: "指标趋势摘要",
  trace_flamegraph: "链路火焰图",
  trace_summary: "链路火焰摘要",
  alerts_distribution: "告警分布图",
  alerts_summary: "告警摘要",
  topology_map: "拓扑图路径",
  topology_summary: "拓扑摘要",
  _generation_rules: "生成规则",
  _key_aliases: "字段中文映射",
};

/**
 * seven modules + keys (order = render order)
 * @type {Array<{ id: string; title: string; keys: string[] }>}
 */
export const SRE_STAGE1_MODULES = [
  { id: "conclusion", title: "核心结论", keys: ["core_conclusion"] },
  {
    id: "objects",
    title: "对象",
    keys: ["affected_nodes"],
  },
  { id: "logs", title: "日志", keys: ["logs_distribution", "logs_summary"] },
  { id: "metrics", title: "指标", keys: ["metrics_trend", "metrics_summary"] },
  { id: "trace", title: "链路", keys: ["trace_flamegraph", "trace_summary"] },
  { id: "alerts", title: "告警", keys: ["alerts_distribution", "alerts_summary"] },
  { id: "topology", title: "拓扑图", keys: ["topology_map", "topology_summary"] },
];

export function mergeStage1KeyAliases(root) {
  const fromRoot =
    root &&
    typeof root === "object" &&
    !Array.isArray(root) &&
    root._key_aliases &&
    typeof root._key_aliases === "object" &&
    !Array.isArray(root._key_aliases)
      ? root._key_aliases
      : {};
  return { ...SRE_STAGE1_DEFAULT_KEY_ALIASES, ...fromRoot };
}

function isEmptyStringish(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/** 槽位是否代表「有内容可展示」（含加载中/错误，避免闪一下消失） */
function slotHasPresence(slot) {
  if (!slot || typeof slot !== "object") return false;
  if (slot.status === "loading" || slot.status === "error") return true;
  if (slot.status === "ready") {
    if (slot.kind === "text") return !isEmptyStringish(slot.text);
    if (slot.kind === "json") return slot.data !== undefined && slot.data !== null;
  }
  return false;
}

/**
 * 根上该 key 是否有可展示数据（含路径字符串待拉取、已内嵌对象等）
 */
export function stage1KeyHasPresentData(key, rawVal, slot) {
  if (slotHasPresence(slot)) return true;
  if (rawVal === undefined || rawVal === null) return false;
  if (typeof rawVal === "string") {
    return rawVal.trim() !== "";
  }
  if (typeof rawVal === "number") {
    return Number.isFinite(rawVal);
  }
  if (typeof rawVal === "boolean") {
    return true;
  }
  if (Array.isArray(rawVal)) {
    return rawVal.length > 0;
  }
  if (typeof rawVal === "object") {
    return Object.keys(rawVal).length > 0;
  }
  return false;
}

export function stage1ModuleHasData(module, root, nested) {
  if (!root || typeof root !== "object" || Array.isArray(root)) return false;
  return module.keys.some((key) => stage1KeyHasPresentData(key, root[key], nested[key]));
}

export function shouldUseStage1ModularLayout(root, nested = {}) {
  if (!root || typeof root !== "object" || Array.isArray(root)) return false;
  const ty = String(root.type || "").toLowerCase();
  /** 「环境感知聚合」content；不包含 stage1_logs_distribution 等子图类型 */
  if (/环境感知/.test(ty)) return true;
  if (/stage[-_]?1[-_]?perception|perception[-_]?content/.test(ty)) return true;
  return SRE_STAGE1_MODULES.some((m) => stage1ModuleHasData(m, root, nested));
}
