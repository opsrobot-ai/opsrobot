/**
 * 从 Agent 消息中提取 SRE 阶段报告 .md 文件路径。
 *
 * 支持 5 种阶段报告，文件命名规则：
 *   SRE-{13位时间戳}-{6位大写字母+数字}_{stage后缀}.md
 *
 * 同一个 SRE-{13d}-{6c} ID 对应同一次 SRE 分析会话。
 */

export const SRE_REPORT_CONFIGS = [
  { stage: "stage1", suffix: "_stage1_perception_report.md", label: "环境感知",  color: "blue"   },
  { stage: "stage2", suffix: "_stage2_analysis_report.md",   label: "异常分析",  color: "amber"  },
  { stage: "stage3", suffix: "_stage3_reasoning_report.md",  label: "根因推理",  color: "rose"   },
  { stage: "stage4", suffix: "_stage4_execution_report.md",  label: "行动建议",  color: "emerald"},
  { stage: "final",  suffix: "_final_report.md",             label: "SRE报告",   color: "violet" },
];

/** 提取 sessionId（SRE-{13d}-{6c}）的正则 */
export const SRE_SESSION_ID_RE = /SRE-(\d{13})-([A-Za-z0-9]{6})/;

/** 允许的报告文件后缀（小写） */
const ALLOWED_SUFFIXES = SRE_REPORT_CONFIGS.map((c) => c.suffix.toLowerCase());

function isAllowedSuffix(p) {
  const low = String(p || "").toLowerCase();
  return ALLOWED_SUFFIXES.some((s) => low.endsWith(s));
}

/**
 * 从单条消息文本中提取所有 SRE 阶段报告路径。
 * 同时支持反引号包裹（`path`）和裸路径两种写法。
 * @param {string} text
 * @returns {string[]}
 */
export function extractSreReportPaths(text) {
  const src = String(text ?? "");
  const found = [];
  const seen = new Set();

  // 反引号路径
  const tickRe = /`([~./][^`\n]+?\.md)`/gi;
  let m;
  while ((m = tickRe.exec(src)) !== null) {
    const p = m[1].trim();
    if (isAllowedSuffix(p) && !seen.has(p)) {
      seen.add(p);
      found.push(p);
    }
  }

  // 裸路径（不含空格、引号等）
  const bareRe = /([~./][^\s`\]"'<>\n]*?\.md)/gi;
  while ((m = bareRe.exec(src)) !== null) {
    const p = m[1].trim();
    if (isAllowedSuffix(p) && !seen.has(p)) {
      seen.add(p);
      found.push(p);
    }
  }

  return found;
}

/**
 * 从文件路径中提取 SRE sessionId（SRE-{13d}-{6c}）。
 * @param {string} filePath
 * @returns {string | null}
 */
export function getSreSessionId(filePath) {
  const m = String(filePath || "").match(SRE_SESSION_ID_RE);
  if (!m) return null;
  return `SRE-${m[1]}-${m[2]}`;
}

/**
 * 从文件路径中判断属于哪个 stage。
 * @param {string} filePath
 * @returns {{ stage: string; label: string; color: string } | null}
 */
export function getSreReportStageConfig(filePath) {
  const low = String(filePath || "").toLowerCase();
  return SRE_REPORT_CONFIGS.find((c) => low.endsWith(c.suffix)) ?? null;
}

/**
 * 从 SRE sessionId 提取时间戳（用于排序，选最新会话）。
 * @param {string} sessionId SRE-{13d}-{6c}
 * @returns {number}
 */
export function getSreSessionTimestamp(sessionId) {
  const m = String(sessionId || "").match(/SRE-(\d{13})-/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * 将助手消息按「SRE 阶段报告 .md 路径」拆成 Markdown 与可点击 Tab 段。
 * 同时匹配反引号包裹路径和裸路径，覆盖 stage1-4 + final 共 5 种。
 *
 * @param {string} text
 * @returns {{ parts: Array<{ type: "markdown"; text: string } | { type: "sre_report"; path: string; stage: string; label: string; color: string }> } | null}
 */
export function splitAssistantMessageOnSreReportPaths(text) {
  const src = String(text ?? "");
  const hits = [];
  const seen = new Set();

  const addHit = (p, start, end) => {
    const cfg = getSreReportStageConfig(p);
    if (!cfg || seen.has(p)) return;
    const overlaps = hits.some((h) => start < h.end && end > h.start);
    if (overlaps) return;
    seen.add(p);
    hits.push({ path: p, stage: cfg.stage, label: cfg.label, color: cfg.color, start, end });
  };

  // 1. 反引号包裹的路径（优先，避免裸路径重复匹配）
  const tickRe = /`([~./][^`\n]+?\.md)`/gi;
  let m;
  while ((m = tickRe.exec(src)) !== null) {
    addHit(m[1].trim(), m.index, m.index + m[0].length);
  }

  // 2. 裸路径
  const bareRe = /([~./][^\s`\]"'<>\n]*?\.md)/gi;
  while ((m = bareRe.exec(src)) !== null) {
    addHit(m[1].trim(), m.index, m.index + m[0].length);
  }

  if (hits.length === 0) return null;
  hits.sort((a, b) => a.start - b.start);

  const parts = [];
  let last = 0;
  for (const hit of hits) {
    if (hit.start > last) parts.push({ type: "markdown", text: src.slice(last, hit.start) });
    parts.push({ type: "sre_report", path: hit.path, stage: hit.stage, label: hit.label, color: hit.color });
    last = hit.end;
  }
  if (last < src.length) parts.push({ type: "markdown", text: src.slice(last) });
  return { parts };
}
