/**
 * 行动建议（stage4）content JSON：模块分组、字段别名、是否有数据判定（供 SreStage4ActionModules 使用）
 */

import { stage1KeyHasPresentData, stage1ModuleHasData } from "./sreStage1PerceptionModules.js";

export const stage4KeyHasPresentData = stage1KeyHasPresentData;

export const stage4ModuleHasData = stage1ModuleHasData;

/** 与产物 _key_aliases 对齐的默认中文映射（根上无 _key_aliases 时使用） */
export const SRE_STAGE4_DEFAULT_KEY_ALIASES = {
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
  root_cause_summary: "根因摘要",
  solution_comparison: "方案对比",
  recommended_solution_detail: "推荐方案详情",
  rollback_plan: "回滚计划",
  post_execution_checklist: "执行后检查清单",
  residual_risks: "残余风险",
  approval_request: "审批请求",
  _generation_rules: "生成规则",
  _key_aliases: "字段中文映射",
};

/**
 * 分模块顺序；无数据的模块不渲染卡片。
 * @type {Array<{ id: string; title: string; keys: string[] }>}
 */
export const SRE_STAGE4_MODULES = [
  { id: "conclusion", title: "核心结论", keys: ["core_conclusion"] },
  { id: "root_cause", title: "根因摘要", keys: ["root_cause_summary"] },
  { id: "comparison", title: "方案对比", keys: ["solution_comparison"] },
  { id: "recommended", title: "推荐方案详情", keys: ["recommended_solution_detail"] },
  { id: "rollback", title: "回滚计划", keys: ["rollback_plan"] },
  { id: "checklist", title: "执行后检查清单", keys: ["post_execution_checklist"] },
  { id: "risks", title: "残余风险", keys: ["residual_risks"] },
  { id: "approval", title: "审批请求", keys: ["approval_request"] },
];

export function mergeStage4KeyAliases(root) {
  const fromRoot =
    root &&
    typeof root === "object" &&
    !Array.isArray(root) &&
    root._key_aliases &&
    typeof root._key_aliases === "object" &&
    !Array.isArray(root._key_aliases)
      ? root._key_aliases
      : {};
  return { ...SRE_STAGE4_DEFAULT_KEY_ALIASES, ...fromRoot };
}

export function shouldUseStage4ModularLayout(root, nested = {}) {
  if (!root || typeof root !== "object" || Array.isArray(root)) return false;
  const ty = String(root.type || "").toLowerCase();
  if (/行动建议|处置建议|执行建议/.test(ty)) return true;
  if (
    /stage[-_]?4[-_]?(?:execution|action|mitigation|remed)|execution[-_]?content|action[-_]?(?:plan|content)|mitigation[-_]?content|remediation[-_]?content/i.test(
      ty,
    )
  )
    return true;
  return SRE_STAGE4_MODULES.some((m) => stage4ModuleHasData(m, root, nested));
}
