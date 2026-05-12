import {
  messageContentToString,
  pickSessionKey,
  sessionListPrimaryLabel,
  assistantContentHasToolInvocationBlocks,
} from "./sreOpenclawSessions.js";

function pickStr(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return s || "";
}

/**
 * 与 messagesFromOpenClawSessionDetail 相同的 candidates 选择，返回第一条非空 messages 数组（原始项）。
 */
export function extractRawMessagesFromSessionDetail(detail) {
  if (!detail || typeof detail !== "object") return [];
  const candidates = [
    detail.messages,
    detail.history,
    detail.turns,
    detail.chat?.messages,
    detail.data?.messages,
    detail.session?.messages,
  ];
  if (Array.isArray(detail.previews)) {
    for (const p of detail.previews) {
      if (p && Array.isArray(p.items)) candidates.push(p.items);
    }
  }
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return c;
  }
  return [];
}

function normalizedRole(m) {
  if (!m || typeof m !== "object") return null;
  if (m.role === "assistant" || m.role === "user" || m.role === "toolResult") return m.role;
  if (m.text != null || m.body != null) return "assistant";
  return null;
}

function toolInvocationsFromAssistantContent(content) {
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const b of content) {
    if (!b || typeof b !== "object") continue;
    if (b.type !== "toolCall" && b.type !== "tool_use") continue;
    const id = pickStr(b.id ?? b.toolCallId);
    const name =
      typeof b.name === "string"
        ? b.name
        : typeof b.function?.name === "string"
          ? b.function.name
          : "";
    if (id) out.push({ id, name });
  }
  return out;
}

function toolCallIdsWithResultsAfter(messages, afterIdx) {
  const satisfied = new Set();
  for (let j = afterIdx + 1; j < messages.length; j++) {
    const m = messages[j];
    if (normalizedRole(m) !== "toolResult") continue;
    const tid = pickStr(m.toolCallId ?? m.tool_call_id ?? m.callId ?? m.id);
    if (tid) satisfied.add(tid);
  }
  return satisfied;
}

function previewTextFromAssistant(m, maxLen = 100) {
  const t = messageContentToString(m?.content).trim();
  if (!t) return "";
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

/**
 * @typedef {"tool_call" | "generating_reply"} ChildSessionProgressPhase
 */

/**
 * @param {unknown[]} rawMessages
 * @returns {{
 *   phase: ChildSessionProgressPhase;
 *   summaryLine: string;
 *   toolName: string;
 *   toolCallId: string;
 *   replyPreview: string;
 * }}
 */
export function inferChildSessionProgressFromRawMessages(rawMessages) {
  const messages = Array.isArray(rawMessages) ? rawMessages : [];
  if (!messages.length) {
    return {
      phase: "generating_reply",
      summaryLine: "等待子会话活动…",
      toolName: "",
      toolCallId: "",
      replyPreview: "",
    };
  }

  const lastIdx = messages.length - 1;
  const last = messages[lastIdx];
  const lr = normalizedRole(last);

  if (lr === "user") {
    return {
      phase: "generating_reply",
      summaryLine: "等待模型响应…",
      toolName: "",
      toolCallId: "",
      replyPreview: "",
    };
  }

  if (lr === "toolResult") {
    return {
      phase: "generating_reply",
      summaryLine: "生成回复…",
      toolName: "",
      toolCallId: "",
      replyPreview: "",
    };
  }

  if (lr === "assistant") {
    const inv = toolInvocationsFromAssistantContent(last.content);
    const textPreview = previewTextFromAssistant(last, 120);
    const hasToolsOnly =
      inv.length > 0 && !textPreview && assistantContentHasToolInvocationBlocks(last.content);

    if (inv.length) {
      const satisfied = toolCallIdsWithResultsAfter(messages, lastIdx);
      const pending = inv.filter((x) => !satisfied.has(x.id));
      if (pending.length) {
        const p = pending[pending.length - 1];
        const label = p.name || "工具";
        const idShort = p.id.length > 24 ? `${p.id.slice(0, 12)}…` : p.id;
        return {
          phase: "tool_call",
          summaryLine: `${label} · ${idShort}`,
          toolName: p.name,
          toolCallId: p.id,
          replyPreview: "",
        };
      }
    }

    if (textPreview) {
      return {
        phase: "generating_reply",
        summaryLine: textPreview,
        toolName: "",
        toolCallId: "",
        replyPreview: textPreview,
      };
    }

    if (hasToolsOnly && inv.length) {
      return {
        phase: "generating_reply",
        summaryLine: "生成回复…",
        toolName: "",
        toolCallId: "",
        replyPreview: "",
      };
    }

    return {
      phase: "generating_reply",
      summaryLine: "生成回复…",
      toolName: "",
      toolCallId: "",
      replyPreview: "",
    };
  }

  return {
    phase: "generating_reply",
    summaryLine: "等待子会话活动…",
    toolName: "",
    toolCallId: "",
    replyPreview: "",
  };
}

/**
 * @param {object|null|undefined} detail — fetchOpenClawSessionDetail 返回值
 */
export function inferChildSessionProgressFromDetail(detail) {
  const raw = extractRawMessagesFromSessionDetail(detail);
  return inferChildSessionProgressFromRawMessages(raw);
}

function messageTimestampMs(m) {
  if (!m || typeof m !== "object") return null;
  const cands = [
    m.timestamp,
    m.createdAt,
    m.updatedAt,
    m.ts,
    m.time,
    m.created_at,
    m.metadata?.timestamp,
  ];
  for (const c of cands) {
    if (c == null) continue;
    if (typeof c === "number" && Number.isFinite(c)) {
      return c < 1_000_000_000_000 ? Math.round(c * 1000) : Math.round(c);
    }
    const p = Date.parse(String(c));
    if (Number.isFinite(p)) return p;
  }
  return null;
}

function roleLabelZh(role) {
  if (role === "user") return "用户";
  if (role === "assistant") return "助手";
  if (role === "toolResult") return "工具结果";
  return pickStr(role) || "—";
}

function collapseWs(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function singleLinePreview(s, max = 140) {
  const t = collapseWs(s);
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 与子会话详情中单条原始消息对应的完整可读文本（用于 tooltip） */
export function rawMessageFullTextForHistory(m) {
  if (!m || typeof m !== "object") return "";
  const role = normalizedRole(m);
  if (!role) return "";

  if (role === "assistant" && Array.isArray(m.content)) {
    const chunks = [];
    for (const b of m.content) {
      if (!b || typeof b !== "object") continue;
      if (b.type === "toolCall" || b.type === "tool_use") {
        const name =
          typeof b.name === "string"
            ? b.name
            : typeof b.function?.name === "string"
              ? b.function.name
              : "";
        const id = pickStr(b.id ?? b.toolCallId);
        const args = b.arguments ?? b.args ?? b.function?.arguments;
        let argsStr = "";
        if (args != null) {
          argsStr = typeof args === "string" ? args : JSON.stringify(args);
          if (argsStr.length > 4000) argsStr = `${argsStr.slice(0, 4000)}…`;
        }
        chunks.push(`[工具调用] ${name || "tool"}${id ? ` (${id})` : ""}${argsStr ? `\n${argsStr}` : ""}`);
      } else if ((b.type === "text" || b.type == null) && typeof b.text === "string") {
        chunks.push(b.text);
      }
    }
    const joined = chunks.join("\n\n").trim();
    if (joined) return joined;
  }

  if (role === "toolResult") {
    const name = pickStr(m.toolName ?? m.name);
    const tid = pickStr(m.toolCallId ?? m.tool_call_id ?? m.callId);
    const body = collapseWs(messageContentToString(m.content));
    const head = `[工具结果]${name ? ` ${name}` : ""}${tid ? ` · ${tid}` : ""}`;
    return body ? `${head}\n${body}` : head;
  }

  const plain = collapseWs(messageContentToString(m.content));
  return plain || "";
}

/**
 * 子会话历史：按时间升序；用于单行展示 + tooltip 全文。
 * @param {object|null|undefined} detail
 * @returns {{ id: string; tsMs: number|null; index: number; role: string; oneLine: string; fullTooltip: string }[]}
 */
export function buildSortedChildSessionHistoryFromDetail(detail) {
  const raw = extractRawMessagesFromSessionDetail(detail);
  if (!raw.length) return [];

  const items = [];
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i];
    const role = normalizedRole(m);
    if (!role) continue;

    const tsMs = messageTimestampMs(m);
    const full = rawMessageFullTextForHistory(m);
    const rl = roleLabelZh(role);
    const timePart =
      tsMs != null
        ? new Date(tsMs).toLocaleString(undefined, {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "";
    const prefix = timePart ? `${timePart} · ${rl}` : rl;
    let fullTooltip = full ? `${prefix}\n${full}` : prefix;
    if (!full) {
      try {
        const fallback = collapseWs(JSON.stringify(m.content ?? m.text ?? m.body ?? ""));
        if (fallback) fullTooltip = `${prefix}\n${fallback.slice(0, 8000)}`;
      } catch {
        /* ignore */
      }
    }
    const tail = full || (fullTooltip.length > prefix.length ? fullTooltip.slice(prefix.length).replace(/^\n+/, "") : "");
    const oneLine = singleLinePreview(`${prefix} · ${tail || "—"}`, 160);

    items.push({
      id: pickStr(m.id) || `hist-${i}`,
      tsMs,
      index: i,
      role: rl,
      oneLine,
      fullTooltip: fullTooltip.length > 32000 ? `${fullTooltip.slice(0, 32000)}…` : fullTooltip,
    });
  }

  items.sort((a, b) => {
    if (a.tsMs != null && b.tsMs != null && a.tsMs !== b.tsMs) return a.tsMs - b.tsMs;
    if (a.tsMs != null && b.tsMs == null) return -1;
    if (a.tsMs == null && b.tsMs != null) return 1;
    return a.index - b.index;
  });
  return items;
}

/**
 * @param {unknown[]} sessionRows
 * @param {string} sessionKey
 */
export function findSessionListRowByKey(sessionRows, sessionKey) {
  const sk = pickStr(sessionKey);
  if (!sk || !Array.isArray(sessionRows)) return null;
  return sessionRows.find((row) => pickSessionKey(row) === sk) ?? null;
}

export function formatSessionListRowMeta(row) {
  if (!row || typeof row !== "object") return { label: "", updatedAt: "" };
  const label = sessionListPrimaryLabel(row);
  const ua = row.updatedAt ?? row.updated_at ?? row.ts ?? "";
  const updatedAt = ua != null && ua !== "" ? String(ua) : "";
  return { label, updatedAt };
}

function rowUpdatedSortKey(row) {
  if (!row || typeof row !== "object") return 0;
  const ua = row.updatedAt ?? row.updated_at ?? row.ts ?? row.lastActivity ?? 0;
  if (typeof ua === "number" && Number.isFinite(ua)) return ua;
  const n = Date.parse(String(ua));
  return Number.isFinite(n) ? n : 0;
}

/**
 * 流式期间 toolResult 尚未写入主对话时，`childSessionKey` 可能为空；
 * 从侧栏同一批会话列表里匹配当前子智能体会话：`agent:<id>:…`，优先含 `:subagent:` 的行（与 reasoning/analysis 一致），
 * 若无则仍采纳同前缀下的会话（如部分网关下 `sre-execution` 无 subagent 段）。
 *
 * @param {{ agentId?: string; key?: string; spawnToolCallId?: string; status?: string }} task
 * @param {{ tasks?: unknown[] } | null} plan
 * @param {unknown[]} sessionRows
 */
export function pickChildSessionKeyFromSessionList(task, plan, sessionRows) {
  const agentId = pickStr(task?.agentId);
  if (!agentId || !Array.isArray(sessionRows) || sessionRows.length === 0) return "";
  if (pickStr(task?.status) !== "running") return "";
  if (!pickStr(task?.spawnToolCallId)) return "";

  const used = new Set();
  if (plan && Array.isArray(plan.tasks)) {
    for (const t of plan.tasks) {
      if (t?.key === task?.key) continue;
      const ck = pickStr(t?.childSessionKey);
      if (ck) used.add(ck);
    }
  }

  const prefix = `agent:${agentId}:`;
  const candidates = [];
  for (let idx = 0; idx < sessionRows.length; idx++) {
    const row = sessionRows[idx];
    const k = pickSessionKey(row);
    if (!k || used.has(k)) continue;
    if (!k.startsWith(prefix)) continue;
    candidates.push({ key: k, ts: rowUpdatedSortKey(row), idx, hasSub: k.includes(":subagent:") });
  }
  if (!candidates.length) return "";
  const preferSub = candidates.filter((c) => c.hasSub);
  const pool = preferSub.length ? preferSub : candidates;
  pool.sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    return b.idx - a.idx;
  });
  return pool[0].key;
}

/**
 * 将 `pickChildSessionKeyFromSessionList` 推断出的 key 写入任务规划（左侧列表与子会话展示对齐）。
 *
 * @param {{ plans: unknown[]; byMessageId?: unknown; latestPlan?: unknown | null }} planState
 * @param {unknown[]} sessionRows
 */
export function applyChildSessionKeyListFallback(planState, sessionRows) {
  if (!planState?.plans?.length || !Array.isArray(sessionRows) || sessionRows.length === 0) {
    return planState;
  }

  let anyChanged = false;
  const newPlans = planState.plans.map((plan) => {
    let planChanged = false;
    const tasks = plan.tasks.map((task) => {
      if (pickStr(task?.childSessionKey)) return task;
      if (pickStr(task?.status) !== "running") return task;
      if (!pickStr(task?.spawnToolCallId)) return task;
      const inferred = pickChildSessionKeyFromSessionList(task, plan, sessionRows);
      if (!inferred) return task;
      planChanged = true;
      return { ...task, childSessionKey: inferred };
    });
    if (!planChanged) return plan;
    anyChanged = true;
    const doneCount = tasks.filter((t) => t.status === "done").length;
    const totalCount = tasks.length;
    return {
      ...plan,
      tasks,
      doneCount,
      totalCount,
      progress: totalCount ? Math.round((doneCount / totalCount) * 100) : 0,
    };
  });

  if (!anyChanged) return planState;

  const byMessageId = {};
  for (const plan of newPlans) {
    if (!byMessageId[plan.messageId]) byMessageId[plan.messageId] = [];
    byMessageId[plan.messageId].push(plan);
  }
  return {
    plans: newPlans,
    byMessageId,
    latestPlan: newPlans[newPlans.length - 1] ?? null,
  };
}
