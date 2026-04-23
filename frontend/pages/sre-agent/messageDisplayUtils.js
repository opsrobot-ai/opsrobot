/**
 * 成对出现的 OpenClaw / 网关内部块：`<<<BEGIN_NAME>>>...<<<END_NAME>>>`
 *（如 OPENCLAW_INTERNAL_CONTEXT、UNTRUSTED_CHILD_RESULT 等），不应展示在聊天 UI。
 */
const PAIRED_INTERNAL_BLOCK =
  /<<<BEGIN_([A-Z0-9_]+)>>>\s*([\s\S]*?)\s*<<<END_\1>>>/g;

/**
 * 去掉所有已闭合的内部块后，若仍存在未闭合的 `<<<BEGIN_...>>>`（流式或异常），
 * 则从第一个 BEGIN 起截断到文末，避免把内部元数据闪给用户。
 */
const ANY_BEGIN_MARKER = /<<<BEGIN_[A-Z0-9_]+>>>/;

/**
 * 移除 OpenClaw / 子 Agent 注入的内部标记块，避免在聊天 UI 中展示。
 */
export function stripOpenClawHiddenBlocks(text) {
  if (text == null || typeof text !== "string") return "";
  let out = text;
  let prev;
  do {
    prev = out;
    out = out.replace(PAIRED_INTERNAL_BLOCK, "");
  } while (out !== prev);

  const openMatch = out.search(ANY_BEGIN_MARKER);
  if (openMatch !== -1) {
    out = out.slice(0, openMatch);
  }
  return out.replace(/\n{3,}/g, "\n\n").trimEnd();
}

/**
 * 在 `##` 大标题后，若下一节写成 `1. 小节名` 而**没有** `###`（常见模型输出），marked 会当成有序列表，
 * 正文会与「1. 小节名」落在同一 `<li>` 里，整段会像列表/标题一样粗、大。
 * 在「`##` + 空行 + `N. 标题行`」且后面跟着正文时，补上 `###`，使其成为 ATX 三级标题。
 */
function promoteNumberedSectionLinesAfterH2(text) {
  let s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const block = /(?:^|\n\n)(##[^\n]+)\n+(\d+\.\s+[^\n]+)/g;
  s = s.replace(block, (match, h2, numLine, offset, str) => {
    const rest = str.slice(offset + match.length);
    const lm = rest.match(/^\n*([^\n]*)/);
    const firstBodyLine = lm?.[1] ?? "";
    if (!firstBodyLine.trim()) return match;
    const t = firstBodyLine.trimStart();
    if (/^#{1,6}\s/.test(t)) return match;
    if (/^\d+\.\s/.test(t)) return match;
    if (t.startsWith("|")) return match;
    const prefix = match.startsWith("\n\n") ? "\n\n" : "";
    return `${prefix}${h2}\n\n### ${numLine}`;
  });
  return s;
}

/** 渲染前对助手 Markdown 的完整规范化：`##` 下误用有序列表 → `###`、换行与 ATX 块边界。 */
export function normalizeMarkdownForDisplay(text) {
  return promoteNumberedSectionLinesAfterH2(text);
}

/** 合法 GFM 表格分隔行（含对齐冒号） */
function isGfmSeparatorRow(trimmedLine) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmedLine);
}

/**
 * 分隔行或「正在输入的分隔行」：只含 | - : 与空白，不含单元格正文。
 * 用于区分「下一行是数据（常含时间戳里的 -）」与「分隔行未完成」。
 */
function isSeparatorTypingLine(trimmedLine) {
  if (!trimmedLine || !trimmedLine.includes("|")) return false;
  return /^[\s|\-:]+$/.test(trimmedLine) && /-{2,}/.test(trimmedLine);
}

/** 上一非空行（跳过仅空白的行），用于判断当前行是否在「表体」而非表头 */
function prevNonEmptyTrimmed(lines, index) {
  for (let j = index - 1; j >= 0; j--) {
    const t = lines[j].trim();
    if (t !== "") return t;
  }
  return "";
}

/** 下一非空行（跳过空行）。表头与 |---| 之间常有 \\n\\n，只看 lines[i+1] 会得到 "" 而误判卡住 */
function nextNonEmptyTrimmed(lines, index) {
  for (let j = index + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t !== "") return t;
  }
  return null;
}

/**
 * GFM 表「表头候选」：整行形如 | 列1 | 列2 | … |（首尾竖线 + 至少两列）。
 * 排除：(1) 正文末尾单个 |；(2) 仅 | x | 一列；(3) 流式半行尚未以 | 收尾。
 * 数据行同样是该形态，靠 prevNe「已在表体」分支区分，不由本函数区分。
 */
function looksLikeGfmTableHeaderRow(trimmedLine) {
  const t = trimmedLine;
  if (!t.startsWith("|") || !t.endsWith("|")) return false;
  const pipes = (t.match(/\|/g) || []).length;
  // 至少两列 → 至少 3 个 '|'：| A | B |
  return pipes >= 3;
}

/**
 * 计算适合稳定渲染的 Markdown 前缀长度（启发式）：
 * - 代码块 fence 未闭合 → 截到未闭合 fence 之前
 * - GFM 表格：仅在「疑似表头」且下一行尚未到达或分隔行尚在输入时暂停；不把分隔行、数据行误认为表头
 */
export function getStableMarkdownPrefixLength(text) {
  const src = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!src) return 0;

  let safe = src.length;

  const fenceMatches = [...src.matchAll(/```/g)];
  if (fenceMatches.length % 2 === 1) {
    const last = fenceMatches[fenceMatches.length - 1];
    const idx = Number(last?.index ?? -1);
    if (idx >= 0) safe = Math.min(safe, idx);
  }

  const lines = src.slice(0, safe).split("\n");
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = pos;
    pos += line.length + 1;

    const tline = line.trim();
    // 分隔行：已由专用判断排除，勿与表头混淆
    if (isGfmSeparatorRow(tline) || isSeparatorTypingLine(tline)) continue;

    if (!looksLikeGfmTableHeaderRow(tline)) continue;

    const nextNe = nextNonEmptyTrimmed(lines, i);

    if (nextNe == null) {
      // 缓冲区内再无非空行：要么是流式末尾的数据行，要么是「表头还在等分隔行」
      const prevNe = prevNonEmptyTrimmed(lines, i);
      const prevAfterSep =
        isGfmSeparatorRow(prevNe) ||
        isSeparatorTypingLine(prevNe);
      const prevPipeBody =
        prevNe.startsWith("|") &&
        (prevNe.match(/\|/g) || []).length >= 2 &&
        !isGfmSeparatorRow(prevNe) &&
        !isSeparatorTypingLine(prevNe);
      if (prevAfterSep || prevPipeBody) {
        continue;
      }
      safe = Math.min(safe, lineStart);
      break;
    }

    if (isGfmSeparatorRow(nextNe)) continue;

    // 下一非空行正在打出分隔符（半截），暂不展示表头
    if (isSeparatorTypingLine(nextNe) && !isGfmSeparatorRow(nextNe)) {
      safe = Math.min(safe, lineStart);
      break;
    }
  }

  return Math.max(0, safe);
}

/** @deprecated 与 stripOpenClawHiddenBlocks 相同，保留别名以免外部引用断裂 */
export const stripOpenClawInternalContext = stripOpenClawHiddenBlocks;
