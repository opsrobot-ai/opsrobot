/**
 * 根因推理（stage3）content JSON：模块分组、字段别名、是否有数据判定（供 SreStage3RcaModules 使用）
 */

import { stage1KeyHasPresentData, stage1ModuleHasData } from "./sreStage1PerceptionModules.js";
import { coalesceHypothesisTree } from "./sreStage3HypothesisTree.js";
import { isStage3ThreeLayerRcaLayerArray } from "./sreStage3ReasoningOverview.js";

/** 与产物 _key_aliases 对齐的默认中文映射（根上无 _key_aliases 时使用） */
export const SRE_STAGE3_DEFAULT_KEY_ALIASES = {
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
  overview_conclusion: "推理总览",
  three_layer_rca: "三层根因分析",
  hypothesis_tree: "假设树",
  validated_hypotheses: "通过的假设",
  excluded_hypotheses: "排除的假设",
  root_cause_timeline: "根因时间线",
  propagation_topology: "传播拓扑",
  impact_analysis: "影响分析",
  impacts: "影响条目",
  evidence_data: "证据数据",
  strong_signals: "强信号",
  weak_signals: "弱信号",
  _generation_rules: "生成规则",
  _key_aliases: "字段中文映射",
};

/**
 * 分模块顺序与 Tab 文案一致；无数据的模块不渲染卡片。
 * @type {Array<{ id: string; title: string; keys: string[] }>}
 */
export const SRE_STAGE3_MODULES = [
  { id: "overview", title: "推理总览", keys: ["overview_conclusion"] },
  {
    id: "hypothesis",
    title: "假设树",
    keys: ["hypothesis_tree", "three_layer_rca"],
  },
  { id: "timeline", title: "根因时间线", keys: ["root_cause_timeline"] },
  { id: "propagation", title: "传播拓扑", keys: ["propagation_topology"] },
  { id: "impact", title: "影响分析", keys: ["impact_analysis"] },
  {
    id: "evidence",
    title: "证据数据",
    keys: ["evidence_data", "strong_signals", "weak_signals"],
  },
];

export function mergeStage3KeyAliases(root) {
  const fromRoot =
    root &&
    typeof root === "object" &&
    !Array.isArray(root) &&
    root._key_aliases &&
    typeof root._key_aliases === "object" &&
    !Array.isArray(root._key_aliases)
      ? root._key_aliases
      : {};
  return { ...SRE_STAGE3_DEFAULT_KEY_ALIASES, ...fromRoot };
}

export const stage3KeyHasPresentData = stage1KeyHasPresentData;

export function stage3ModuleHasData(module, root, nested) {
  if (module.id === "hypothesis") {
    if (coalesceHypothesisTree(root)) return true;
    const ht = stage3KeyHasPresentData("hypothesis_tree", root.hypothesis_tree, nested?.hypothesis_tree);
    if (ht) return true;
    const tlr = root.three_layer_rca;
    const nestSlot = nested?.three_layer_rca;
    if (!stage3KeyHasPresentData("three_layer_rca", tlr, nestSlot)) return false;
    if (isStage3ThreeLayerRcaLayerArray(tlr)) return false;
    return true;
  }
  return stage1ModuleHasData(module, root, nested);
}

export function shouldUseStage3ModularLayout(root, nested = {}) {
  if (!root || typeof root !== "object" || Array.isArray(root)) return false;
  const ty = String(root.type || "").toLowerCase();
  if (/根因推理/.test(ty)) return true;
  if (/stage[-_]?3[-_]?(?:rca|reasoning|inference)|rca[-_]?content|root[-_]?cause[-_]?infer/i.test(ty)) return true;
  return SRE_STAGE3_MODULES.some((m) => stage3ModuleHasData(m, root, nested));
}
