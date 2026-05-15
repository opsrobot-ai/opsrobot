/**
 * 终稿综合报告（stage5 / SRE报告 Tab）content JSON：模块分组、字段别名、是否有数据判定
 */

function isEmptyStringish(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

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
 * 递归判断 JSON 是否有可展示内容（用于终稿大对象；忽略以 _ 开头的键）
 * @param {unknown} v
 * @returns {boolean}
 */
export function finalReportValueHasPresentData(v) {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) {
    return v.length > 0 && v.some((x) => finalReportValueHasPresentData(x));
  }
  if (typeof v === "object") {
    const keys = Object.keys(v).filter((k) => !String(k).startsWith("_"));
    if (keys.length === 0) return false;
    return keys.some((k) => finalReportValueHasPresentData(v[k]));
  }
  return false;
}

/** 与产物 _key_aliases 对齐的默认中文映射（根上无 _key_aliases 时使用） */
export const SRE_FINAL_REPORT_DEFAULT_KEY_ALIASES = {
  _template_version: "模板版本",
  timestamp: "记录生成时间",
  _purpose: "报告用途说明",
  type: "数据类型",
  incident_id: "事件唯一标识",
  title: "报告标题",
  pipeline_status: "Pipeline运行状态",
  analysis_confidence: "分析置信度",
  time_window: "事件时间窗口",
  start: "开始时间",
  end: "结束时间",
  duration_seconds: "持续时长",
  core_summary: "核心摘要",
  basic_info: "基本信息",
  environment: "环境",
  impact_scope: "影响范围",
  affected_services: "受影响服务",
  fault_type_classification: "故障类型分类",
  rca_summary: "根因摘要",
  confidence: "置信度",
  confidence_rationale: "置信度依据",
  core_root_cause: "核心根因",
  current_status: "当前状态",
  icon: "图标",
  fault_timeline: "故障时间线",
  key_nodes: "关键节点",
  time: "时间",
  event: "事件",
  source: "来源",
  remediation_actions: "处置动作",
  root_cause_and_impact_analysis: "根因与影响分析",
  three_layer_structure: "三层根因结构",
  root_cause: "根本原因",
  direct_cause: "直接原因",
  trigger_event: "触发事件",
  description: "描述",
  note: "备注",
  rca_ruling: "根因判定",
  dominant_hypothesis: "主导假设",
  ruling_reason: "判定依据",
  excluded_hypotheses: "排除的假设",
  hypothesis: "假设",
  rejection_reason: "排除原因",
  data_gaps: "数据缺口",
  problems_and_deficiencies: "问题与不足",
  process_level: "流程层面",
  technical_level: "技术层面",
  monitoring_level: "监控层面",
  improvement_plan: "改进计划",
  short_term_0_2_weeks: "短期(0-2周)",
  medium_term_1_3_months: "中期(1-3月)",
  long_term_over_3_months: "长期(3月以上)",
  priority: "优先级",
  action: "动作",
  owner: "负责人",
  deadline: "截止时间",
  conclusion_and_risks: "结论与风险",
  conclusion: "结论",
  residual_risks: "残余风险",
  _generation_rules: "生成规则",
  _key_aliases: "字段中文映射",
};

/**
 * 顺序与 Tab 文案一致；无数据的模块不渲染卡片。
 * @type {Array<{ id: string; title: string; keys: string[] }>}
 */
export const SRE_FINAL_REPORT_MODULES = [
  { id: "core_summary", title: "核心摘要", keys: ["core_summary"] },
  { id: "fault_timeline", title: "故障时间线", keys: ["fault_timeline"] },
  { id: "root_cause_and_impact", title: "根因与影响分析", keys: ["root_cause_and_impact_analysis"] },
  { id: "problems", title: "问题与不足", keys: ["problems_and_deficiencies"] },
  { id: "improvement_plan", title: "改进计划", keys: ["improvement_plan"] },
  { id: "conclusion", title: "结论与风险", keys: ["conclusion_and_risks"] },
];

export function mergeFinalReportKeyAliases(root) {
  const fromRoot =
    root &&
    typeof root === "object" &&
    !Array.isArray(root) &&
    root._key_aliases &&
    typeof root._key_aliases === "object" &&
    !Array.isArray(root._key_aliases)
      ? root._key_aliases
      : {};
  return { ...SRE_FINAL_REPORT_DEFAULT_KEY_ALIASES, ...fromRoot };
}

export function finalReportKeyHasPresentData(_key, rawVal, slot) {
  if (slotHasPresence(slot)) return true;
  return finalReportValueHasPresentData(rawVal);
}

export function finalReportModuleHasData(module, root, nested) {
  if (!root || typeof root !== "object" || Array.isArray(root)) return false;
  return module.keys.some((key) => finalReportKeyHasPresentData(key, root[key], nested?.[key]));
}

export function shouldUseFinalReportModularLayout(root, nested = {}) {
  if (!root || typeof root !== "object" || Array.isArray(root)) return false;
  const ty = String(root.type || "").toLowerCase();
  if (/stage5[-_]?final|stage[-_]?5[-_]?final|final_report/.test(ty)) return true;
  return SRE_FINAL_REPORT_MODULES.some((m) => finalReportModuleHasData(m, root, nested));
}
