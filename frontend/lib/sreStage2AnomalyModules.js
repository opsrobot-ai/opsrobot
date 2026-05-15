/**
 * 异常分析（stage2）content JSON：模块分组、字段别名、是否有数据判定（供 SreStage2AnomalyModules 使用）
 */

import { stage1KeyHasPresentData, stage1ModuleHasData } from "./sreStage1PerceptionModules.js";

/** 与产物 _key_aliases 对齐的默认中文映射（根上无 _key_aliases 时使用） */
export const SRE_STAGE2_DEFAULT_KEY_ALIASES = {
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
  analysis_overview: "分析概览",
  log_anomalies: "日志异常",
  metric_anomalies: "指标异常",
  trace_anomalies: "链路异常",
  alert_anomalies: "告警异常",
  topology_correlation: "拓扑关联",
  correlation_analysis: "关联分析",
  anomaly_patterns_top: "异常模式排行",
  timeline: "时间线",
  core_conclusion: "核心结论",
  _generation_rules: "生成规则",
  _key_aliases: "字段中文映射",
};

/**
 * 分模块顺序与 Tab 文案一致；无数据的模块不渲染卡片。
 * @type {Array<{ id: string; title: string; keys: string[] }>}
 */
export const SRE_STAGE2_MODULES = [
  { id: "conclusion", title: "核心结论", keys: ["core_conclusion", "analysis_overview"] },
  { id: "log", title: "日志异常", keys: ["log_anomalies"] },
  { id: "metric", title: "指标异常", keys: ["metric_anomalies"] },
  { id: "trace", title: "链路异常", keys: ["trace_anomalies"] },
  { id: "alert", title: "告警异常", keys: ["alert_anomalies"] },
  { id: "topology", title: "拓扑关系", keys: ["topology_correlation"] },
  { id: "correlation", title: "关联分析", keys: ["correlation_analysis"] },
  { id: "patterns", title: "异常模式排行", keys: ["anomaly_patterns_top"] },
  { id: "timeline", title: "时间线", keys: ["timeline"] },
];

/**
 * 核心结论 / 分析概览：单行展示时优先取对象中的 `summary`（及常见别名）
 * @param {unknown} val
 * @returns {string | null} 可展示的文案；需要退回 JSON 块时为 null
 */
export function stage2ConclusionSummaryText(val) {
  if (val == null) return null;
  if (typeof val === "string") {
    const t = val.trim();
    return t ? t : null;
  }
  if (typeof val === "number" && Number.isFinite(val)) return String(val);
  if (typeof val === "boolean") return String(val);
  if (typeof val === "object" && !Array.isArray(val)) {
    const s = val.summary ?? val.Summary ?? val.overview ?? val.Overview;
    if (typeof s === "string" && s.trim()) return s.trim();
  }
  return null;
}

export function mergeStage2KeyAliases(root) {
  const fromRoot =
    root &&
    typeof root === "object" &&
    !Array.isArray(root) &&
    root._key_aliases &&
    typeof root._key_aliases === "object" &&
    !Array.isArray(root._key_aliases)
      ? root._key_aliases
      : {};
  return { ...SRE_STAGE2_DEFAULT_KEY_ALIASES, ...fromRoot };
}

export const stage2KeyHasPresentData = stage1KeyHasPresentData;

export function stage2ModuleHasData(module, root, nested) {
  return stage1ModuleHasData(module, root, nested);
}

export function shouldUseStage2ModularLayout(root, nested = {}) {
  if (!root || typeof root !== "object" || Array.isArray(root)) return false;
  const ty = String(root.type || "").toLowerCase();
  if (/异常分析/.test(ty)) return true;
  if (/stage[-_]?2[-_]?anomal|anomal(y)?[-_]?analysis|sre[-_]?stage[-_]?2/i.test(ty)) return true;
  return SRE_STAGE2_MODULES.some((m) => stage2ModuleHasData(m, root, nested));
}
