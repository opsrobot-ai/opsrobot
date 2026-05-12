import {
  extractSreReportPaths,
  getSreReportStageConfig,
  getSreSessionId,
} from "./sreReportPathExtract.js";

export const SRE_TASK_PLAN_ID_RE = /SRE-(\d{13}-[A-Za-z0-9]{6})/;

export const SRE_TASK_PLAN_HEADING_RE =
  /^(?:#{1,6}\s*)?【任务规划】\s*[—–-]\s*(SRE-\d{13}-[A-Za-z0-9]{6})\b.*$/gim;

const SRE_ANY_TITLE_RE = /^(?:#{1,6}\s*)?【([^】]+)】\s*[—–-]\s*(SRE-\d{13}-[A-Za-z0-9]{6})\b.*$/gim;

const FIXED_SRE_TASKS = [
  { phase: "Stage 1", title: "环境感知", agentId: "sre-perception", details: "调用智能体：sre-perception" },
  { phase: "Stage 2", title: "异常分析", agentId: "sre-analysis", details: "调用智能体：sre-analysis" },
  { phase: "Stage 3", title: "根因推理", agentId: "sre-reasoning", details: "调用智能体：sre-reasoning" },
  { phase: "Stage 4", title: "行动建议", agentId: "sre-execution", details: "调用智能体：sre-execution" },
];

function stripMdInline(s) {
  return String(s ?? "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

function normalizeText(s) {
  return stripMdInline(s).replace(/\s+/g, "");
}

function titleMatches(a, b) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);
  if (!aa || !bb) return false;
  return aa.includes(bb) || bb.includes(aa);
}

function taskKey(planId, index) {
  return `sre-task-${planId}-${index + 1}`;
}

function buildFixedTasks(planId) {
  return FIXED_SRE_TASKS.map((task, index) => ({
    ...task,
    key: taskKey(planId, index),
    index,
  }));
}

function extractPlanId(fullId) {
  const m = String(fullId ?? "").match(SRE_TASK_PLAN_ID_RE);
  return m ? m[1] : null;
}

function parseJsonLike(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  const raw = String(value).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string" && parsed.trim() && parsed.trim() !== raw) {
      return parseJsonLike(parsed) ?? parsed;
    }
    return parsed;
  } catch {
    return null;
  }
}

function collectStrings(value, out = []) {
  if (value == null) return out;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

function pickNestedString(obj, keys) {
  if (!obj || typeof obj !== "object") return "";
  const stack = [obj];
  const keySet = new Set(keys);
  while (stack.length) {
    const cur = stack.shift();
    if (!cur || typeof cur !== "object") continue;
    for (const [k, v] of Object.entries(cur)) {
      if (keySet.has(k) && v != null && String(v).trim()) return String(v).trim();
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return "";
}

function isSessionsSpawnToolName(name) {
  const raw = String(name ?? "").trim().toLowerCase();
  if (!raw) return false;
  const normalized = raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized === "sessions_spawn" || normalized.endsWith("_sessions_spawn");
}

function textFromContentBlocks(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        if (typeof part.text === "string") return part.text;
        if (typeof part.content === "string") return part.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (typeof content.content === "string") return content.content;
    try {
      return JSON.stringify(content);
    } catch {
      return "";
    }
  }
  return String(content);
}

function extractChildSessionKeyFromValue(value) {
  const parsed = parseJsonLike(value);
  const direct = pickNestedString(parsed, [
    "childSessionKey",
    "child_session_key",
    "sessionKey",
    "session_key",
  ]);
  if (direct) return direct;

  const raw = String(value ?? "");
  const unescaped = raw.replace(/\\"/g, "\"").replace(/\\'/g, "'");
  const keyed = unescaped.match(/(?:childSessionKey|child_session_key|sessionKey|session_key)["'\s:=]+([^"',\s}]+)/i);
  if (keyed) return keyed[1].trim();
  const sessionKey = unescaped.match(/\bagent:sre-[a-z0-9-]+:[^"',\s}]+/i);
  return sessionKey ? sessionKey[0].trim() : "";
}

function extractPlanIdFromValue(value) {
  const source = [value, ...collectStrings(parseJsonLike(value))].join(" ");
  const m = source.match(SRE_TASK_PLAN_ID_RE);
  return m ? m[1] : null;
}

function agentIdFromArguments(args) {
  const parsed = args && typeof args === "object" ? args : parseJsonLike(args);
  const direct = pickNestedString(parsed, [
    "agentId",
    "agent_id",
    "agent",
    "targetAgent",
    "target_agent",
    "name",
  ]);
  if (FIXED_SRE_TASKS.some((task) => task.agentId === direct)) return direct;
  const source = [direct, ...collectStrings(parsed), args].join(" ");
  return FIXED_SRE_TASKS.find((task) => source.includes(task.agentId))?.agentId ?? "";
}

function rawContentCandidates(msg) {
  const out = [];
  if (msg?.rawContent != null) out.push(msg.rawContent);
  if (msg?.rawMessage?.content != null) out.push(msg.rawMessage.content);
  if (Array.isArray(msg?.content)) out.push(msg.content);
  return out;
}

function extractToolCallBlocksFromMessage(msg, messageIndex) {
  const events = [];
  for (const content of rawContentCandidates(msg)) {
    if (!Array.isArray(content)) continue;
    for (let blockIndex = 0; blockIndex < content.length; blockIndex++) {
      const block = content[blockIndex];
      if (!block || typeof block !== "object") continue;
      if (block.type !== "toolCall" && block.type !== "tool_use") continue;
      const toolName =
        typeof block.name === "string"
          ? block.name
          : typeof block.function?.name === "string"
            ? block.function.name
            : "";
      if (!isSessionsSpawnToolName(toolName)) continue;
      const toolCallId = String(block.id ?? block.toolCallId ?? "").trim();
      const argsRaw =
        block.arguments ??
        block.args ??
        block.function?.arguments;
      const agentId = agentIdFromArguments(argsRaw);
      if (!toolCallId || !agentId) continue;
      events.push({
        toolCallId,
        agentId,
        childSessionKey: null,
        planId: extractPlanIdFromValue(argsRaw),
        status: "running",
        startedAt: msg?.rawMessage?.timestamp ?? msg?.timestamp ?? messageIndex,
        resultAt: 0,
        messageIndex,
        blockIndex,
        source: "message_tool_call",
      });
    }
  }
  return events;
}

function extractToolResultBlockFromMessage(msg) {
  const raw = msg?.rawMessage ?? msg;
  const role = String(raw?.role ?? msg?.role ?? "");
  const toolCallId = String(raw?.toolCallId ?? msg?.toolCallId ?? "").trim();
  const toolName = raw?.toolName ?? raw?.name ?? msg?.toolName ?? msg?.name;
  if (role !== "toolResult" || !toolCallId || !isSessionsSpawnToolName(toolName)) return null;

  const text = textFromContentBlocks(raw?.content ?? msg?.rawContent ?? msg?.content);
  const childSessionKey = extractChildSessionKeyFromValue(text);
  if (!childSessionKey) return null;
  return {
    toolCallId,
    childSessionKey,
    resultAt: raw?.timestamp ?? msg?.timestamp ?? 0,
  };
}

export function extractSreSpawnEventsFromMessages(messages) {
  const byToolCallId = new Map();
  const resultByToolCallId = new Map();

  for (let messageIndex = 0; messageIndex < (messages || []).length; messageIndex++) {
    const msg = messages[messageIndex];
    for (const event of extractToolCallBlocksFromMessage(msg, messageIndex)) {
      byToolCallId.set(event.toolCallId, event);
    }
    const result = extractToolResultBlockFromMessage(msg);
    if (result) resultByToolCallId.set(result.toolCallId, result);
  }

  for (const [toolCallId, result] of resultByToolCallId.entries()) {
    const event = byToolCallId.get(toolCallId);
    if (!event) continue;
    event.childSessionKey = result.childSessionKey;
    event.resultAt = result.resultAt;
  }

  return [...byToolCallId.values()].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
}

function extractAgentIdFromToolCall(tc) {
  return agentIdFromArguments(tc?.args) || agentIdFromArguments(tc?.result);
}

function extractChildSessionKeyFromToolCall(tc) {
  return extractChildSessionKeyFromValue(tc?.result);
}

function extractPlanIdFromToolCall(tc) {
  const source = [
    tc?.args,
    tc?.result,
    ...collectStrings(parseJsonLike(tc?.args)),
    ...collectStrings(parseJsonLike(tc?.result)),
  ].join(" ");
  const m = source.match(SRE_TASK_PLAN_ID_RE);
  return m ? m[1] : null;
}

export function extractSreSpawnEventsFromToolCalls(toolCalls) {
  const list = Array.isArray(toolCalls)
    ? toolCalls
    : Object.values(toolCalls || {});

  return list
    .filter((tc) => isSessionsSpawnToolName(tc?.name))
    .map((tc) => {
      const agentId = extractAgentIdFromToolCall(tc);
      if (!agentId) return null;
      return {
        toolCallId: tc.id,
        agentId,
        childSessionKey: extractChildSessionKeyFromToolCall(tc) || null,
        planId: extractPlanIdFromToolCall(tc),
        status: tc.status,
        startedAt: tc.startedAt ?? 0,
        resultAt: tc.resultAt ?? 0,
        source: "agui_tool_call",
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
}

export function extractSreSpawnEvents(messagesOrToolCalls, maybeToolCalls) {
  if (maybeToolCalls !== undefined) {
    const messageEvents = extractSreSpawnEventsFromMessages(messagesOrToolCalls || []);
    const toolCallEvents = extractSreSpawnEventsFromToolCalls(maybeToolCalls);
    const byToolCallId = new Map();
    for (const event of toolCallEvents) {
      if (event.toolCallId) byToolCallId.set(event.toolCallId, event);
    }
    for (const event of messageEvents) {
      if (event.toolCallId) {
        const prev = byToolCallId.get(event.toolCallId);
        byToolCallId.set(event.toolCallId, {
          ...prev,
          ...event,
          childSessionKey: event.childSessionKey ?? prev?.childSessionKey ?? null,
          resultAt: event.resultAt || prev?.resultAt || 0,
        });
      }
    }
    return [...byToolCallId.values()].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  }
  return extractSreSpawnEventsFromToolCalls(messagesOrToolCalls);
}

function findNextSreHeading(src, from) {
  SRE_ANY_TITLE_RE.lastIndex = from;
  const m = SRE_ANY_TITLE_RE.exec(src);
  return m ? m.index : src.length;
}

export function extractSreTaskPlans(text) {
  const src = String(text ?? "");
  const plans = [];
  SRE_TASK_PLAN_HEADING_RE.lastIndex = 0;
  let m;
  while ((m = SRE_TASK_PLAN_HEADING_RE.exec(src)) !== null) {
    const fullId = m[1];
    const id = extractPlanId(fullId);
    if (!id) continue;

    const lineEnd = src.indexOf("\n", m.index);
    const bodyStart = lineEnd >= 0 ? lineEnd + 1 : m.index + m[0].length;
    const bodyEnd = findNextSreHeading(src, bodyStart);
    plans.push({
      id,
      fullId,
      title: "任务规划",
      heading: m[0].replace(/^#+\s*/, "").trim(),
      body: src.slice(bodyStart, bodyEnd).trim(),
      start: m.index,
      end: bodyEnd,
      tasks: buildFixedTasks(id),
    });
  }
  return plans;
}

export function splitAssistantMessageOnSreTaskPlans(text) {
  const src = String(text ?? "");
  const plans = extractSreTaskPlans(src);
  if (!plans.length) return null;

  const parts = [];
  let last = 0;
  for (const plan of plans) {
    if (plan.start > last) parts.push({ type: "markdown", text: src.slice(last, plan.start) });
    parts.push({ type: "sre_task_plan", planId: plan.id });
    last = plan.end;
  }
  if (last < src.length) parts.push({ type: "markdown", text: src.slice(last) });
  return { parts };
}

function extractSreHeadings(text) {
  const src = String(text ?? "");
  const found = [];
  SRE_ANY_TITLE_RE.lastIndex = 0;
  let m;
  while ((m = SRE_ANY_TITLE_RE.exec(src)) !== null) {
    const id = extractPlanId(m[2]);
    if (!id) continue;
    found.push({
      title: stripMdInline(m[1]),
      id,
      fullId: m[2],
      index: m.index,
    });
  }
  return found;
}

function messageCompletesTask(message, plan, task) {
  const content = String(message?.content ?? "");
  const headings = extractSreHeadings(content).filter(
    (h) => h.id === plan.id && h.title !== "任务规划" && titleMatches(h.title, task.title),
  );
  if (!headings.length) return false;

  const reportPaths = extractSreReportPaths(content).filter((p) => getSreSessionId(p) === plan.fullId);
  if (!reportPaths.length) return false;

  return reportPaths.some((p) => {
    const cfg = getSreReportStageConfig(p);
    return cfg ? titleMatches(cfg.label, task.title) : false;
  });
}

export function buildSreTaskPlanState(messages, toolCalls = {}) {
  const planDefs = [];
  for (let msgIndex = 0; msgIndex < (messages || []).length; msgIndex++) {
    const msg = messages[msgIndex];
    if (msg?.role !== "assistant") continue;
    const plans = extractSreTaskPlans(msg.content || "");
    for (const plan of plans) {
      planDefs.push({
        ...plan,
        messageId: msg.id,
        messageIndex: msgIndex,
      });
    }
  }

  const spawnEvents = extractSreSpawnEvents(messages, toolCalls);
  const latestPlanDef = planDefs[planDefs.length - 1] ?? null;

  const plans = planDefs.map((plan) => {
    const completed = new Set();
    for (let i = plan.messageIndex + 1; i < (messages || []).length; i++) {
      const msg = messages[i];
      if (msg?.role !== "assistant") continue;
      for (const task of plan.tasks) {
        if (!completed.has(task.key) && messageCompletesTask(msg, plan, task)) {
          completed.add(task.key);
        }
      }
    }

    const tasks = plan.tasks.map((task) => {
      const spawn = spawnEvents
        .filter((event) =>
          event.agentId === task.agentId &&
          (event.planId ? event.planId === plan.id : plan === latestPlanDef),
        )
        .at(-1);
      let status = "pending";
      if (completed.has(task.key)) {
        status = "done";
      } else if (spawn) {
        status = "running";
      }
      return {
        ...task,
        status,
        started: Boolean(spawn) || completed.has(task.key),
        childSessionKey: spawn?.childSessionKey ?? null,
        spawnToolCallId: spawn?.toolCallId ?? null,
      };
    });
    const doneCount = tasks.filter((t) => t.status === "done").length;
    return {
      ...plan,
      tasks,
      doneCount,
      totalCount: tasks.length,
      progress: tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0,
    };
  });

  const byMessageId = {};
  for (const plan of plans) {
    if (!byMessageId[plan.messageId]) byMessageId[plan.messageId] = [];
    byMessageId[plan.messageId].push(plan);
  }

  return {
    plans,
    byMessageId,
    latestPlan: plans[plans.length - 1] ?? null,
  };
}

/**
 * AG-UI CUSTOM `sre_task_plan_update` 中单条 spawn（网关推送）。
 * @typedef {{
 *   toolCallId: string;
 *   agentId: string;
 *   planId?: string | null;
 *   childSessionKey?: string | null;
 *   phase?: "start" | "result";
 *   startedAt?: number;
 *   resultAt?: number;
 * }} SreTaskPlanPushSpawn
 */

/**
 * useAgui 聚合：`Record<messageId, Record<toolCallId, SreTaskPlanPushSpawn>>`
 */

function pushSpawnMatchesPlanAndTask(push, task, plan, latestPlan) {
  if (!push || !task.agentId || push.agentId !== task.agentId) return false;
  if (push.planId) return push.planId === plan.id;
  if (!latestPlan) return false;
  return plan.id === latestPlan.id;
}

function pickBestPushSpawn(pushList, task, plan, latestPlan) {
  const candidates = pushList.filter((p) => pushSpawnMatchesPlanAndTask(p, task, plan, latestPlan));
  if (!candidates.length) return null;
  return candidates.reduce((best, cur) => {
    const tb = Math.max(best.startedAt ?? 0, best.resultAt ?? 0);
    const tc = Math.max(cur.startedAt ?? 0, cur.resultAt ?? 0);
    return tc >= tb ? cur : best;
  });
}

/** 合并所有 messageId 桶内的 spawn，按 toolCallId 去重，保留时间戳较新的一条 */
function mergedSpawnListFromAllPushBuckets(pushByMessageId) {
  const pushMap = new Map();
  for (const bucket of Object.values(pushByMessageId || {})) {
    if (!bucket || typeof bucket !== "object") continue;
    for (const sp of Object.values(bucket)) {
      if (!sp?.toolCallId) continue;
      const tc = String(sp.toolCallId).trim();
      if (!tc) continue;
      const t = Math.max(Number(sp.startedAt ?? 0), Number(sp.resultAt ?? 0));
      const prev = pushMap.get(tc);
      const pt = prev ? Math.max(Number(prev.startedAt ?? 0), Number(prev.resultAt ?? 0)) : -1;
      if (!prev || t >= pt) pushMap.set(tc, { ...sp, toolCallId: tc });
    }
  }
  return [...pushMap.values()];
}

/**
 * 将网关下发的 spawn 增量并入 buildSreTaskPlanState 结果（补缺实时流中缺失的 toolCall/toolCalls）。
 *
 * @param {ReturnType<typeof buildSreTaskPlanState>} baseState
 * @param {Record<string, Record<string, SreTaskPlanPushSpawn>>} pushByMessageId
 */
export function mergeSreTaskPlanPushIntoState(baseState, pushByMessageId) {
  if (
    !baseState?.plans?.length ||
    !pushByMessageId ||
    typeof pushByMessageId !== "object" ||
    Object.keys(pushByMessageId).length === 0
  ) {
    return baseState;
  }

  const latestPlan = baseState.plans[baseState.plans.length - 1] ?? null;
  const mergedPushList = mergedSpawnListFromAllPushBuckets(pushByMessageId);

  const plans = baseState.plans.map((plan) => {
    const tasks = plan.tasks.map((task) => {
      const bestPush = pickBestPushSpawn(mergedPushList, task, plan, latestPlan);
      const spawnToolCallId = task.spawnToolCallId || bestPush?.toolCallId || null;
      const childSessionKey = task.childSessionKey || bestPush?.childSessionKey || null;

      let status = task.status;
      if (status !== "done" && spawnToolCallId) {
        status = "running";
      }

      const started = Boolean(task.started || spawnToolCallId || bestPush);

      return {
        ...task,
        status,
        started,
        childSessionKey,
        spawnToolCallId,
      };
    });

    const doneCount = tasks.filter((t) => t.status === "done").length;
    return {
      ...plan,
      tasks,
      doneCount,
      totalCount: tasks.length,
      progress: tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0,
    };
  });

  const byMessageId = {};
  for (const plan of plans) {
    if (!byMessageId[plan.messageId]) byMessageId[plan.messageId] = [];
    byMessageId[plan.messageId].push(plan);
  }

  return {
    ...baseState,
    plans,
    byMessageId,
    latestPlan: plans[plans.length - 1] ?? null,
  };
}
