/**
 * SRE Agent WebSocket：浏览器 WS → 同一套 AG-UI JSON 文本帧；连接可长驻。
 * 主流程结束即由 runSreAgent 下发 RUN_FINISHED。
 * 会话增量：客户端 `op: "poll_session"`，服务端通过 Gateway WS sessions.messages.subscribe 订阅推送，
 * 有新消息到达时以 `CUSTOM openclaw_session_detail` 格式转发给浏览器。
 *
 * 排查主/子会话 agent 与工具转发：设置环境变量 SRE_WS_POLL_TRACE=1，查看 [sre-ws][poll-trace] 日志。
 */
import crypto from "node:crypto";
import { WebSocketServer } from "ws";
import {
  assistantContentHasToolInvocationBlocks,
  messagesFromOpenClawSessionDetail,
  messageContentToString,
} from "../../frontend/lib/sreOpenclawSessions.js";
import {
  runSreAgent,
  resolveGatewaySessionKeyForChat,
  getConfig,
  isOpenClawGatewayBaseUrl,
  normalizeGatewayAgentPayload,
} from "./openclaw-client.mjs";
import { getGatewayWsClient } from "./openclaw-gateway-ws.mjs";
import { SRE_TASK_PLAN_HEADING_RE } from "../../frontend/lib/sreTaskPlanExtract.js";

const WS_PATH = "/api/sre-agent/ws";
const STREAM_DEBUG = String(process.env.SRE_STREAM_OBSERVABILITY || "") === "1";
const FALLBACK_COMPLETE_THEN_STREAM = String(process.env.SRE_STREAM_COMPLETE_THEN_STREAM || "") === "1";
const STREAM_AUTO_FALLBACK = String(process.env.SRE_STREAM_AUTO_FALLBACK || "1") === "1";
/** poll_session 主/子会话：打印 Gateway agent 帧与 TOOL 转发（第二步缺帧时对照） */
const SRE_WS_POLL_TRACE = String(process.env.SRE_WS_POLL_TRACE || "").trim() === "1";

function pollTrace(tag, info) {
  if (!SRE_WS_POLL_TRACE) return;
  try {
    const extra =
      info != null && typeof info === "object" ? JSON.stringify(info) : String(info ?? "");
    console.log(`[sre-ws][poll-trace] ${tag}${extra ? ` ${extra}` : ""}`);
  } catch {
    /* ignore */
  }
}

function requestPathname(raw) {
  const u = raw || "";
  const q = u.indexOf("?");
  const p = q >= 0 ? u.slice(0, q) : u;
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

function safeSend(ws, obj) {
  if (ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

function debugStreamLog(tag, payload) {
  if (!STREAM_DEBUG) return;
  try {
    console.log(`[sre-ws][stream] ${tag}`, payload);
  } catch {
    /* ignore */
  }
}

function serializeMsgsForCompare(aguiMsgs) {
  if (!Array.isArray(aguiMsgs)) return "";
  return JSON.stringify(
    aguiMsgs.map((x) => ({
      role: x.role,
      content: String(x.content ?? ""),
    })),
  );
}

/**
 * 从 OpenClaw session.message 的 content 字段提取纯文本。
 * content 可能是：
 *   - 字符串
 *   - OpenAI content block 数组：[{ type: "text", text: "..." }, { type: "thinking", ... }, ...]
 * 只取 type==="text" 的块，忽略 thinking/tool_use 等内部块。
 */
function extractSessionMessageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b?.type === "text")
    .map((b) => String(b.text ?? ""))
    .join("");
}

/** 与前端 normalizeAssistantFingerprint 对齐，用于过滤连续重复的 session.message assistant */
function normalizeAssistantDedupeSig(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u200b-\u200d\ufeff\u2060]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** OpenClaw session.message / history 上可能出现的消息 id 字段 */
function pickOpenClawStableMessageId(msg, payload) {
  const candidates = [
    msg?.id,
    msg?.messageId,
    msg?.uuid,
    msg?.message_id,
    payload?.messageId,
    payload?.message?.id,
  ];
  for (const c of candidates) {
    const s = c != null && c !== undefined ? String(c).trim() : "";
    if (s) return s;
  }
  return "";
}

function assistantPlainTextContainsSreTaskPlanHeading(text) {
  const t = String(text ?? "");
  SRE_TASK_PLAN_HEADING_RE.lastIndex = 0;
  return SRE_TASK_PLAN_HEADING_RE.test(t);
}

/** 与前端 buildSreTaskPlanState 对齐：取含「任务规划」的最后一条 assistant 的 id */
function scanLastTaskPlanMessageIdFromAguiMessages(aguiMsgs) {
  if (!Array.isArray(aguiMsgs)) return "";
  let last = "";
  for (const m of aguiMsgs) {
    if (m?.role !== "assistant") continue;
    if (!assistantPlainTextContainsSreTaskPlanHeading(m.content)) continue;
    const id = String(m.id ?? "").trim();
    if (id) last = id;
  }
  return last;
}

function syntheticSubSessionToolCallId(subKey) {
  const h = crypto.createHash("sha256").update(String(subKey)).digest("hex").slice(0, 16);
  return `subdisc_${h}`;
}

function agentIdFromSessionKey(subKey) {
  const m = /^agent:([^:]+):/i.exec(String(subKey ?? ""));
  return m?.[1] ? m[1] : "";
}

/** 子 session 订阅成功时补一条 spawn.result，避免网关 tool meta 不含 sessionKey 时卡片无子会话 id */
function emitSubSessionDiscoveredTaskPlanPush(ws, subKey) {
  const agentId = agentIdFromSessionKey(subKey);
  if (!agentId) return;
  const mid =
    String(ws._sreTaskPlanMessageId ?? "").trim() ||
    (ws._sreSubscribedKey ? `main_${ws._sreSubscribedKey}` : `main_${subKey}`);
  safeSend(ws, {
    type: "CUSTOM",
    name: "sre_task_plan_update",
    value: {
      messageId: mid,
      spawn: {
        toolCallId: syntheticSubSessionToolCallId(subKey),
        agentId,
        planId: null,
        childSessionKey: subKey,
        phase: "result",
        resultAt: Date.now(),
      },
    },
  });
}

/**
 * 流式通道已下发过同一正文时，跳过后续 session.message 的 CUSTOM 推送，从源上避免双气泡。
 * @param {boolean} replacing
 * @param {string} sessionPlainText
 * @param {string} streamedNorm
 * @param {unknown} rawContent
 */
function shouldSkipStreamDuplicateAssistantFinalize(replacing, sessionPlainText, streamedNorm, rawContent) {
  if (!replacing || !streamedNorm) return false;
  if (assistantContentHasToolInvocationBlocks(rawContent)) return false;
  const inc = normalizeAssistantDedupeSig(sessionPlainText);
  return Boolean(inc) && inc === streamedNorm;
}

/**
 * 将上游 assistant 文本标准化为“仅新增 append”：
 * - 若 incoming 是累计全文且以 fullText 为前缀 -> 只取新增后缀
 * - 否则按增量处理 -> 直接拼接
 *
 * @param {{ fullText: string, sentLen: number }} state
 * @param {unknown} incomingDeltaOrText
 * @returns {string} 仅新增 append（为空表示无需发送）
 */
function extractAppendDelta(state, incomingDeltaOrText) {
  const incoming = String(incomingDeltaOrText ?? "");
  if (!incoming) {
    return { append: "", sourceType: "empty", overlap: 0, seq: state.lastSeq ?? 0, incomingLen: 0 };
  }

  const full = String(state.fullText ?? "");
  let append = "";
  let sourceType = "delta";
  let overlap = 0;

  if (incoming.startsWith(full)) {
    // 上游可能发送累计全文：仅发送相对 fullText 的新增部分
    append = incoming.slice(full.length);
    state.fullText = incoming;
    sourceType = "full_like";
  } else {
    // 优先处理“尾部重叠 + 新增”场景：只拼接非重叠后缀
    const maxOverlap = Math.min(full.length, incoming.length);
    for (let n = maxOverlap; n > 0; n--) {
      if (full.slice(-n) === incoming.slice(0, n)) {
        overlap = n;
        break;
      }
    }
    append = incoming.slice(overlap);
    state.fullText = full + append;
  }

  if (append) {
    state.sentLen = Number(state.sentLen ?? 0) + append.length;
  }
  state.lastSeq = Number(state.lastSeq ?? 0) + 1;
  return { append, sourceType, overlap, seq: state.lastSeq, incomingLen: incoming.length };
}

function splitForPseudoStream(text) {
  const src = String(text ?? "");
  if (!src) return [];
  const chunks = [];
  let start = 0;
  const hardMax = 220;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const hitBoundary = ch === "\n" || ch === "。" || ch === "." || ch === "！" || ch === "?" || ch === "；";
    const hitHardMax = i - start + 1 >= hardMax;
    if (!hitBoundary && !hitHardMax) continue;
    const part = src.slice(start, i + 1);
    if (part) chunks.push(part);
    start = i + 1;
  }
  if (start < src.length) chunks.push(src.slice(start));
  return chunks.filter(Boolean);
}

let _pollToolSeq = 0;
function pollSessionToolCallId(prefix = "tc") {
  return `poll_${prefix}_${Date.now()}_${++_pollToolSeq}`;
}

/** 子 Agent 的 runId 格式：announce:v1:agent:sre-XXX:subagent:... */
function isSubAgentRunId(runId) {
  if (!runId) return false;
  return /^announce:v1:agent:sre-[a-z]+-?[a-z]*:subagent:/i.test(String(runId));
}

const FIXED_SRE_SPAWN_AGENT_IDS_POLL = ["sre-perception", "sre-analysis", "sre-reasoning", "sre-execution"];
const SRE_PLAN_ID_CAPTURE_POLL = /SRE-(\d{13}-[A-Za-z0-9]{6})/;

function toolNameIsSessionsSpawnPoll(name) {
  const raw = String(name ?? "").trim().toLowerCase();
  const normalized = raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized === "sessions_spawn" || normalized.endsWith("_sessions_spawn");
}

function agentIdFromSessionsSpawnArgsPoll(args) {
  const keys = ["agentId", "agent_id", "agent", "targetAgent", "target_agent", "name"];
  let obj = args;
  if (typeof args === "string") {
    try {
      obj = JSON.parse(args);
    } catch {
      obj = null;
    }
  }
  if (obj && typeof obj === "object") {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && FIXED_SRE_SPAWN_AGENT_IDS_POLL.includes(v)) return v;
    }
    try {
      const s = JSON.stringify(obj);
      const hit = FIXED_SRE_SPAWN_AGENT_IDS_POLL.find((id) => s.includes(id));
      if (hit) return hit;
    } catch {
      /* ignore */
    }
  }
  const flat = typeof args === "string" ? args : "";
  return FIXED_SRE_SPAWN_AGENT_IDS_POLL.find((id) => flat.includes(id)) ?? "";
}

function planIdFromSessionsSpawnArgsPoll(args) {
  const raw =
    typeof args === "string"
      ? args
      : args && typeof args === "object"
        ? JSON.stringify(args)
        : "";
  const m = raw.match(SRE_PLAN_ID_CAPTURE_POLL);
  return m ? m[1] : null;
}

function childSessionKeyFromToolMetaPoll(meta) {
  const s = String(meta ?? "");
  const m = s.match(/\bagent:sre-[a-z0-9-]+:[^\s"',}\]]+/i);
  return m ? m[0] : null;
}

function parseJsonLenient(s) {
  try {
    return JSON.parse(String(s));
  } catch {
    return null;
  }
}

function serializeToolArgsForAgui(args) {
  if (args == null) return "{}";
  if (typeof args === "string") {
    try {
      return JSON.stringify(JSON.parse(args));
    } catch {
      return JSON.stringify({ raw: args });
    }
  }
  try {
    return JSON.stringify(args);
  } catch {
    return "{}";
  }
}

/** 从 OpenClaw session.message 的 assistant content 块提取 toolCall / tool_use */
function extractToolInvocationBlocksFromContent(content) {
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const b of content) {
    if (!b || typeof b !== "object") continue;
    const t = b.type;
    if (t !== "toolCall" && t !== "tool_use") continue;
    const id = String(b.id ?? b.toolCallId ?? b.tool_use_id ?? "").trim();
    if (!id) continue;
    const name =
      String(b.name ?? b.function?.name ?? b.toolName ?? "tool").trim() || "tool";
    let args = b.arguments ?? b.args ?? b.input ?? {};
    if (b.function && typeof b.function === "object" && b.function.arguments != null) {
      const fa = b.function.arguments;
      if (typeof fa === "string") {
        const parsed = parseJsonLenient(fa);
        args = parsed ?? { _raw: fa };
      } else {
        args = fa;
      }
    }
    out.push({ id, name, args });
  }
  return out;
}

/**
 * 多阶段编排时网关可能只把工具写在 session.message 的 content 里，不发 agent stream:"tool"。
 * 补齐 TOOL_CALL_* 与 sessions_spawn 的 CUSTOM；与 forwardPollSessionGatewayTool 共用去重集合。
 */
function emitSyntheticAguiFromSessionMessage(ws, msg, payload, ctx) {
  if (!ws || ws.readyState !== 1 || !msg) return;
  const streamKey = ctx.streamKey ?? "";
  const planMid = String(ctx.planMsgId ?? "").trim();
  const stableParent = pickOpenClawStableMessageId(msg, payload);
  const parentId =
    stableParent || planMid || (streamKey ? `sess_${streamKey.slice(-24)}` : pollSessionToolCallId("msg"));
  const customMid = planMid || parentId;

  if (!ws._sreSyntheticToolEmitted) ws._sreSyntheticToolEmitted = new Set();
  if (!ws._sreSyntheticToolResultEmitted) ws._sreSyntheticToolResultEmitted = new Set();
  if (!ws._sreSyntheticToolNames) ws._sreSyntheticToolNames = new Map();
  if (!ws._sreSyntheticSpawnArgsStr) ws._sreSyntheticSpawnArgsStr = new Map();

  if (msg.role === "assistant" && assistantContentHasToolInvocationBlocks(msg.content)) {
    const blocks = extractToolInvocationBlocksFromContent(msg.content);
    if (!blocks.length) return;
    for (const { id: tcId, name, args } of blocks) {
      if (ws._sreSyntheticToolEmitted.has(tcId)) continue;
      ws._sreSyntheticToolEmitted.add(tcId);
      ws._sreSyntheticToolNames.set(tcId, name);
      const argsStr = serializeToolArgsForAgui(args);
      if (toolNameIsSessionsSpawnPoll(name)) {
        ws._sreSyntheticSpawnArgsStr.set(tcId, argsStr);
      }
      if (SRE_WS_POLL_TRACE) {
        pollTrace("synthetic-tool-from-session-assistant", { streamKey, tcId, name, parentId });
      }
      safeSend(ws, {
        type: "TOOL_CALL_START",
        toolCallId: tcId,
        toolCallName: name,
        parentMessageId: parentId,
        ...(streamKey ? { streamKey } : {}),
      });
      safeSend(ws, { type: "TOOL_CALL_ARGS", toolCallId: tcId, delta: argsStr });
      safeSend(ws, {
        type: "STEP_STARTED",
        toolCallId: tcId,
        stepName: `调用 ${name}`,
        detail: `执行工具: ${name}`,
      });
      if (toolNameIsSessionsSpawnPoll(name)) {
        const agentId = agentIdFromSessionsSpawnArgsPoll(args);
        const planId = planIdFromSessionsSpawnArgsPoll(args);
        if (agentId) {
          safeSend(ws, {
            type: "CUSTOM",
            name: "sre_task_plan_update",
            value: {
              messageId: customMid,
              spawn: {
                toolCallId: tcId,
                agentId,
                planId,
                childSessionKey: null,
                phase: "start",
                startedAt: Date.now(),
              },
            },
          });
        }
      }
    }
    return;
  }

  if (msg.role === "tool") {
    const toolCallIdRaw =
      msg.toolCallId ?? msg.tool_call_id ?? msg.toolUseId ?? msg.tool_use_id ?? "";
    const tcId = String(toolCallIdRaw ?? "").trim();
    if (!tcId || !ws._sreSyntheticToolEmitted.has(tcId)) return;
    if (ws._sreSyntheticToolResultEmitted.has(tcId)) return;
    ws._sreSyntheticToolResultEmitted.add(tcId);
    const toolName = ws._sreSyntheticToolNames.get(tcId) || "tool";
    const resultText =
      typeof msg.content === "string" ? msg.content : messageContentToString(msg.content);
    if (SRE_WS_POLL_TRACE) {
      pollTrace("synthetic-tool-result-from-session", { streamKey, tcId, toolName });
    }
    safeSend(ws, { type: "TOOL_CALL_END", toolCallId: tcId });
    safeSend(ws, {
      type: "TOOL_CALL_RESULT",
      toolCallId: tcId,
      messageId: pollSessionToolCallId("tool"),
      content: resultText.trim() !== "" ? resultText : "completed",
    });
    safeSend(ws, {
      type: "STEP_FINISHED",
      toolCallId: tcId,
      stepName: `调用 ${toolName}`,
    });
    if (toolNameIsSessionsSpawnPoll(toolName)) {
      const spawnArgsStr = ws._sreSyntheticSpawnArgsStr.get(tcId) ?? "{}";
      const agentId =
        agentIdFromSessionsSpawnArgsPoll(spawnArgsStr) ||
        agentIdFromSessionsSpawnArgsPoll(String(resultText ?? ""));
      const planId = planIdFromSessionsSpawnArgsPoll(spawnArgsStr);
      const childSessionKey = childSessionKeyFromToolMetaPoll(resultText);
      if (agentId || childSessionKey) {
        safeSend(ws, {
          type: "CUSTOM",
          name: "sre_task_plan_update",
          value: {
            messageId: customMid,
            spawn: {
              toolCallId: tcId,
              agentId,
              planId,
              childSessionKey,
              phase: "result",
              resultAt: Date.now(),
            },
          },
        });
      }
    }
    ws._sreSyntheticSpawnArgsStr.delete(tcId);
    ws._sreSyntheticToolNames.delete(tcId);
  }
}

/**
 * 此处把 Gateway 工具事件译成与 openclaw-client.runSreAgentViaWs 一致的 AG-UI 帧，驱动前端 toolCalls + 任务列表。
 *
 * `taskPlanMessageId`：含【任务规划】的 assistant 消息 id，用于 CUSTOM `sre_task_plan_update` 与前端 plan.messageId 对齐；
 * `parentMessageId`：仍绑定当前流式气泡，供 TOOL_CALL_* 使用。
 * `toolCallOrderStack`：LIFO，在网关省略 result.toolCallId 时与 start 顺序对齐。
 *
 * @param {import("ws").WebSocket} ws
 * @param {{
 *   activeTools: Record<string, { name: string; args: string }>;
 *   parentMessageId: string;
 *   taskPlanMessageId?: string;
 *   toolCallOrderStack?: string[];
 *   streamKey?: string;
 * }} ctx
 * @param {object} payload Gateway agent 事件
 */
function forwardPollSessionGatewayTool(ws, ctx, payload) {
  const norm = normalizeGatewayAgentPayload(payload);
  const stream = norm.stream;
  const data = norm.data;
  if (stream !== "tool") return;

  const { activeTools, parentMessageId, streamKey, taskPlanMessageId, toolCallOrderStack } = ctx;
  const pid = parentMessageId || pollSessionToolCallId("msg");
  const customMid = String(taskPlanMessageId ?? "").trim() || pid;
  const stack = toolCallOrderStack;

  pollTrace("forward-tool-to-browser", {
    streamKey: streamKey ?? "",
    phase: data?.phase,
    tool: data?.name,
    toolCallId: data?.toolCallId,
    parentMessageId: pid,
    taskPlanMessageId: customMid,
    runId: norm.runId,
  });

  const popMatchingFromStack = (id) => {
    if (!stack?.length || !id) return;
    const ix = stack.lastIndexOf(id);
    if (ix >= 0) stack.splice(ix, 1);
  };

  if (data.phase === "start") {
    const tcId = data.toolCallId || pollSessionToolCallId("call");
    if (!ws._sreSyntheticToolEmitted) ws._sreSyntheticToolEmitted = new Set();
    const dupStart = ws._sreSyntheticToolEmitted.has(tcId);
    if (!dupStart) {
      ws._sreSyntheticToolEmitted.add(tcId);
      if (!ws._sreSyntheticToolNames) ws._sreSyntheticToolNames = new Map();
      ws._sreSyntheticToolNames.set(tcId, data.name || "tool");
    } else if (SRE_WS_POLL_TRACE) {
      pollTrace("forward-tool-skip-dup-start", { tcId, tool: data.name });
    }
    activeTools[tcId] = {
      name: data.name || "tool",
      args: JSON.stringify(data.args ?? {}),
    };
    if (Array.isArray(stack) && !dupStart) stack.push(tcId);
    if (dupStart) return;

    safeSend(ws, {
      type: "TOOL_CALL_START",
      toolCallId: tcId,
      toolCallName: data.name || "tool",
      parentMessageId: pid,
      ...(streamKey ? { streamKey } : {}),
    });
    safeSend(ws, {
      type: "TOOL_CALL_ARGS",
      toolCallId: tcId,
      delta: JSON.stringify(data.args ?? {}),
    });
    safeSend(ws, {
      type: "STEP_STARTED",
      toolCallId: tcId,
      stepName: `调用 ${data.name || "tool"}`,
      detail: `执行工具: ${data.name || "tool"}`,
    });
    if (toolNameIsSessionsSpawnPoll(data.name)) {
      const agentId = agentIdFromSessionsSpawnArgsPoll(data.args ?? {});
      const planId = planIdFromSessionsSpawnArgsPoll(data.args ?? {});
      if (agentId) {
        safeSend(ws, {
          type: "CUSTOM",
          name: "sre_task_plan_update",
          value: {
            messageId: customMid,
            spawn: {
              toolCallId: tcId,
              agentId,
              planId,
              childSessionKey: null,
              phase: "start",
              startedAt: Date.now(),
            },
          },
        });
      } else {
        pollTrace("spawn-start-skipped-no-agentId", {
          tool: data.name,
          customMid,
          argsSample: String(JSON.stringify(data.args ?? {})).slice(0, 220),
        });
      }
    }
    return;
  }

  if (data.phase === "result") {
    let tcId = data.toolCallId != null ? String(data.toolCallId).trim() : "";
    if (tcId) {
      popMatchingFromStack(tcId);
    } else if (Array.isArray(stack) && stack.length) {
      tcId = stack.pop() || "";
    }
    if (!tcId) tcId = pollSessionToolCallId("call");
    if (!ws._sreSyntheticToolResultEmitted) ws._sreSyntheticToolResultEmitted = new Set();
    if (ws._sreSyntheticToolResultEmitted.has(tcId)) {
      delete activeTools[tcId];
      if (SRE_WS_POLL_TRACE) pollTrace("forward-tool-skip-dup-result", { tcId });
      return;
    }
    ws._sreSyntheticToolResultEmitted.add(tcId);
    const toolName = activeTools[tcId]?.name || data.name || "tool";
    const spawnArgsStr =
      activeTools[tcId]?.args ?? ws._sreSyntheticSpawnArgsStr?.get(tcId) ?? "{}";
    delete activeTools[tcId];
    safeSend(ws, { type: "TOOL_CALL_END", toolCallId: tcId });
    safeSend(ws, {
      type: "TOOL_CALL_RESULT",
      toolCallId: tcId,
      messageId: pollSessionToolCallId("tool"),
      content: data.isError ? `[ERROR] ${data.meta || ""}` : (data.meta || "completed"),
    });
    safeSend(ws, {
      type: "STEP_FINISHED",
      toolCallId: tcId,
      stepName: `调用 ${toolName}`,
    });
    if (toolNameIsSessionsSpawnPoll(toolName)) {
      const agentId =
        agentIdFromSessionsSpawnArgsPoll(spawnArgsStr ?? "{}") ||
        agentIdFromSessionsSpawnArgsPoll(String(data.meta ?? ""));
      const planId = planIdFromSessionsSpawnArgsPoll(spawnArgsStr ?? "{}");
      const childSessionKey = childSessionKeyFromToolMetaPoll(data.meta);
      if (agentId || childSessionKey) {
        safeSend(ws, {
          type: "CUSTOM",
          name: "sre_task_plan_update",
          value: {
            messageId: customMid,
            spawn: {
              toolCallId: tcId,
              agentId,
              planId,
              childSessionKey,
              phase: "result",
              resultAt: Date.now(),
            },
          },
        });
      } else {
        pollTrace("spawn-result-skipped-no-agent-no-sessionKey", {
          tool: toolName,
          tcId,
          customMid,
          metaSample: String(data.meta ?? "").slice(0, 220),
        });
      }
    }
  }
}

/**
 * 为单个子 session 建立消息订阅，并将消息转发给浏览器。
 * 若该 session 已订阅则跳过。
 *
 * @param {import("ws").WebSocket} ws
 * @param {string} subKey  子 session key，如 "agent:sre-analysis:opsrobot_thread_xxx"
 * @param {import("./openclaw-gateway-ws.mjs").GatewayWsClient} gwWs
 */
async function subscribeToSubSession(ws, subKey, gwWs) {
  if (!ws._sreSubSessionKeys) ws._sreSubSessionKeys = new Set();
  if (ws._sreSubSessionKeys.has(subKey)) return;
  ws._sreSubSessionKeys.add(subKey);
  emitSubSessionDiscoveredTaskPlanPush(ws, subKey);
  if (!ws._sreSubHandlers) ws._sreSubHandlers = [];

  const subKeyLower = subKey.toLowerCase();

  // ── 1. 流式：监听子 session 的 agent 事件（逐 token 推送）──────────────────
  let streamMsgId = null;
  /** lifecycle end 后清空 streamMsgId，但工具帧可能稍后才到；保留上一轮 id 供 TOOL_CALL / CUSTOM 对齐 parentMessageId */
  let lastSubStreamMsgId = null;
  let subStreamState = null;
  /**
   * lifecycle: end 后置为 true，表示「刚完成一次流式输出」。
   * 下一条 session.message（OpenClaw 最终提交版）到来时，用 replaceLastAssistant
   * 替换已有的流式结果而非追加，避免细微差异导致内容重复。
   */
  let streamJustEnded = false;
  /** lifecycle end 前从 subStreamState 捕获，用于与提交版 session.message 比对 */
  let lastSubStreamCompletedNorm = "";
  /** 避免同一子 session 连续两次推送正文相同的 assistant（如环境感知重复 session.message） */
  let lastSubForwardedAssistantSig = "";

  const subPollActiveTools = {};
  const subPollToolOrderStack = [];

  const agentStreamHandler = (payload) => {
    // agent 事件用 sessionKey 过滤（大小写不敏感）
    const normSub = normalizeGatewayAgentPayload(payload);
    if (payload?.sessionKey?.toLowerCase() !== subKeyLower) {
      if (SRE_WS_POLL_TRACE && normSub.stream === "tool") {
        pollTrace("sub-handler-skip-sessionKey", {
          subKey,
          paySk: String(payload?.sessionKey ?? ""),
          tool: normSub.data?.name,
          phase: normSub.data?.phase,
        });
      }
      return;
    }
    if (ws.readyState !== 1) return;

    if (SRE_WS_POLL_TRACE && normSub.stream === "tool") {
      pollTrace("sub-agent-tool", {
        subKey,
        phase: normSub.data?.phase,
        tool: normSub.data?.name,
        toolCallId: normSub.data?.toolCallId,
      });
    }

    forwardPollSessionGatewayTool(ws, {
      activeTools: subPollActiveTools,
      toolCallOrderStack: subPollToolOrderStack,
      parentMessageId: streamMsgId || lastSubStreamMsgId || `sub_${subKey}`,
      taskPlanMessageId: String(ws._sreTaskPlanMessageId ?? "").trim(),
      streamKey: subKey,
    }, payload);

    const norm = normSub;
    const stream = norm.stream;
    const data = norm.data;

    if (stream === "lifecycle" && data.phase === "start") {
      streamMsgId = `sub_${subKey.slice(-8)}_${Date.now()}`;
      lastSubStreamMsgId = streamMsgId;
      subStreamState = { fullText: "", sentLen: 0, lastSeq: null, anomalyCount: 0, fallback: false };
      streamJustEnded = false;
      lastSubStreamCompletedNorm = "";
      lastSubForwardedAssistantSig = "";
      safeSend(ws, { type: "TEXT_MESSAGE_START", messageId: streamMsgId, role: "assistant", streamKey: subKey });
      return;
    }

    if (stream === "assistant" && data.delta && streamMsgId) {
      if (!subStreamState) subStreamState = { fullText: "", sentLen: 0, lastSeq: null, anomalyCount: 0, fallback: false };
      const next = extractAppendDelta(subStreamState, data.delta);
      if (STREAM_AUTO_FALLBACK) {
        const noisy = next.sourceType === "delta" && next.overlap > 0 && (next.incomingLen - next.overlap) <= 8;
        if (noisy) subStreamState.anomalyCount = Number(subStreamState.anomalyCount ?? 0) + 1;
        if (Number(subStreamState.anomalyCount ?? 0) >= 3) subStreamState.fallback = true;
      }
      debugStreamLog("sub-delta", { sessionKey: subKey, streamId: streamMsgId, ...next, sentLen: subStreamState.sentLen });
      if (FALLBACK_COMPLETE_THEN_STREAM || subStreamState.fallback) return;
      if (!next.append) return;
      safeSend(ws, {
        type: "TEXT_MESSAGE_CONTENT",
        messageId: streamMsgId,
        delta: next.append,
        seq: next.seq,
        sourceType: next.sourceType,
        overlap: next.overlap,
        streamKey: subKey,
      });
      return;
    }

    if (stream === "lifecycle" && data.phase === "end" && streamMsgId) {
      if ((FALLBACK_COMPLETE_THEN_STREAM || subStreamState?.fallback) && subStreamState?.fullText) {
        const chunks = splitForPseudoStream(subStreamState.fullText);
        for (const ch of chunks) {
          safeSend(ws, { type: "TEXT_MESSAGE_CONTENT", messageId: streamMsgId, delta: ch, sourceType: "fallback_chunk", streamKey: subKey });
        }
      }
      lastSubStreamCompletedNorm = subStreamState?.fullText
        ? normalizeAssistantDedupeSig(subStreamState.fullText)
        : "";
      safeSend(ws, { type: "TEXT_MESSAGE_END", messageId: streamMsgId, streamKey: subKey });
      streamMsgId = null;
      subStreamState = null;
      streamJustEnded = true; // 下一条 assistant session.message 是提交版
    }
  };

  gwWs.addEventHandler("agent", agentStreamHandler);
  ws._sreSubHandlers.push({ eventName: "agent", key: subKey, handler: agentStreamHandler });

  // ── 2. 兜底：session.message 用于捕获流式未覆盖的消息（如工具调用完成时的汇总）──
  try {
    await gwWs.request("sessions.messages.subscribe", { key: subKey });
  } catch {
    /* 忽略订阅失败 */
  }

  const sessionMsgHandler = (payload) => {
    if (payload?.sessionKey !== subKey) return;
    if (ws.readyState !== 1) return;
    // agent 流式 handler 正在输出本条消息时（streamMsgId 非空），
    // session.message 推来的是同一消息的完整版，跳过防重复。
    if (streamMsgId !== null) return;

    const msg = payload?.message;
    if (!msg || !msg.role || msg.role === "system") return;

    const text = extractSessionMessageText(msg.content);
    const toolCallIdRaw =
      msg.toolCallId ??
      msg.tool_call_id ??
      msg.toolUseId ??
      msg.tool_use_id ??
      "";
    const toolCallId = String(toolCallIdRaw ?? "").trim();
    const keepToolOnlyAssistant =
      msg.role === "assistant" && assistantContentHasToolInvocationBlocks(msg.content);
    const keepToolRole =
      msg.role === "tool" &&
      (toolCallId !== "" ||
        (typeof msg.content === "string" && msg.content.trim() !== "") ||
        msg.content != null);
    if (!text && !keepToolOnlyAssistant && !keepToolRole) return;
    if (
      text &&
      (text.includes("<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>") ||
        text.includes("<<<END_OPENCLAW_INTERNAL_CONTEXT>>>") ||
        /^Sender \(untrusted metadata\)/m.test(text))
    )
      return;

    const assistantMsg = msg.role === "assistant";
    const replacing = assistantMsg && streamJustEnded;
    if (assistantMsg) {
      streamJustEnded = false;
    }

    if (assistantMsg && text.trim() && !keepToolOnlyAssistant) {
      const inc = normalizeAssistantDedupeSig(text);
      if (
        shouldSkipStreamDuplicateAssistantFinalize(
          replacing,
          text,
          lastSubStreamCompletedNorm,
          msg.content,
        )
      ) {
        lastSubStreamCompletedNorm = "";
        lastSubForwardedAssistantSig = inc;
        return;
      }
      if (inc.length >= 64 && inc === lastSubForwardedAssistantSig && !replacing) {
        return;
      }
    }

    if (assistantMsg && replacing) {
      lastSubStreamCompletedNorm = "";
    }

    const stableSubMsgId = pickOpenClawStableMessageId(msg, payload);

    emitSyntheticAguiFromSessionMessage(ws, msg, payload, {
      streamKey: subKey,
      planMsgId: String(ws._sreTaskPlanMessageId ?? "").trim(),
    });

    const tailRole = msg.role === "tool" ? "toolResult" : msg.role;
    const tailContent =
      text.trim() !== ""
        ? text
        : typeof msg.content === "string"
          ? msg.content
          : messageContentToString(msg.content);

    safeSend(ws, {
      type: "CUSTOM",
      name: "openclaw_session_detail",
      value: {
        incremental: true,
        replaceLastAssistant: replacing,
        streamKey: subKey,
        tailMessages: [
          {
            role: tailRole,
            ...(toolCallId ? { toolCallId } : {}),
            ...(stableSubMsgId ? { id: stableSubMsgId } : {}),
            content: tailContent,
            rawContent: msg.content,
            rawMessage: msg,
            streamKey: subKey,
          },
        ],
      },
    });

    if (assistantMsg && text.trim() && !keepToolOnlyAssistant) {
      lastSubForwardedAssistantSig = normalizeAssistantDedupeSig(text);
    }
  };

  gwWs.addEventHandler("session.message", sessionMsgHandler);
  ws._sreSubHandlers.push({ eventName: "session.message", key: subKey, handler: sessionMsgHandler });

  console.log(`[sre-ws] subscribed sub-session (streaming): ${subKey}`);
}

/**
 * 扫描与主 session 同 thread 的子 session，自动订阅尚未订阅的。
 * 每次 poll_session 都会调用，以捕获运行过程中新生成的子 session。
 *
 * @param {import("ws").WebSocket} ws
 * @param {string} mainSessionKey  主 session key，如 "agent:sre:opsrobot_thread_xxx"
 */
async function refreshSubSessionSubscriptions(ws, mainSessionKey) {
  const cfg = getConfig();
  if (!isOpenClawGatewayBaseUrl(cfg.baseUrl)) return;

  // 从主 session key 中提取 thread 部分（第三个冒号之后）
  const colonIdx = mainSessionKey.indexOf(":", mainSessionKey.indexOf(":") + 1);
  const threadPart = colonIdx >= 0 ? mainSessionKey.slice(colonIdx + 1).toLowerCase() : "";
  if (!threadPart) return;

  const gwWs = getGatewayWsClient();
  try {
    const payload = await gwWs.request("sessions.list", { limit: 50 }).catch(() => null);
    if (!Array.isArray(payload?.sessions)) return;

    const mainKeyLower = mainSessionKey.toLowerCase();
    for (const session of payload.sessions) {
      const key = session.key || session.sessionKey;
      if (!key || key.toLowerCase() === mainKeyLower) continue;
      // 同 thread 下的其他 session（子 Agent）
      if (!key.toLowerCase().includes(threadPart)) continue;
      await subscribeToSubSession(ws, key, gwWs);
    }
  } catch (e) {
    console.warn("[sre-ws] refreshSubSessions error:", e?.message);
  }
}

/**
 * 当浏览器发送 `op: "poll_session"` 时，通过 Gateway WS 订阅该 session 的消息事件，
 * 并在有新消息到达时实时推送给浏览器（替代原来的 HTTP 定时轮询）。
 *
 * 每个浏览器 WS 连接维护一个当前订阅 key；切换 threadId 时自动取消旧订阅、建立新订阅。
 *
 * @param {import("ws").WebSocket} ws
 * @param {object} body
 */
async function handlePollSession(ws, body) {
  const cfg = getConfig();
  if (!isOpenClawGatewayBaseUrl(cfg.baseUrl)) return;

  const threadId = body.threadId != null ? String(body.threadId) : "";
  const reqAgent =
    body?.agentId != null && String(body.agentId).trim() !== ""
      ? String(body.agentId).trim()
      : "";
  const agentId = reqAgent || cfg.agentId || "";
  const sk = resolveGatewaySessionKeyForChat(threadId, agentId);
  if (!sk) return;

  // 已订阅同一主 session：跳过重建 handler，但仍尝试扫描并挂上本轮新建的子 session。
  if (ws._sreSubscribedKey === sk) {
    await refreshSubSessionSubscriptions(ws, sk);
    return;
  }

  // 防并发：同一 session key 的 setup 正在进行中时，跳过重复执行。
  // （前端 React StrictMode 或网络重连可能在 setup 完成前连发两条 poll_session）
  if (ws._sreSubscribingKey === sk) return;
  ws._sreSubscribingKey = sk;

  // 取消旧订阅（主 session + 子 session）
  if (ws._sreSessionMsgHandler) {
    try {
      const gwWs = getGatewayWsClient();
      if (ws._sreSubscribedKey) {
        await gwWs.request("sessions.messages.unsubscribe", { key: ws._sreSubscribedKey }).catch(() => {});
      }
      gwWs.removeEventHandler("session.message", ws._sreSessionMsgHandler);
      // 清理主 session agent 流式 handler
      if (ws._sreMainAgentStreamHandler) {
        gwWs.removeEventHandler("agent", ws._sreMainAgentStreamHandler);
        ws._sreMainAgentStreamHandler = null;
      }
      // 清理旧的子 session（agent 流式 handler + session.message handler）
      if (ws._sreSubHandlers?.length) {
        const unsubscribedKeys = new Set();
        for (const { eventName = "session.message", handler, key } of ws._sreSubHandlers) {
          gwWs.removeEventHandler(eventName, handler);
          // session.message 订阅每个 key 只取消一次
          if (eventName === "session.message" && key && !unsubscribedKeys.has(key)) {
            unsubscribedKeys.add(key);
            gwWs.request("sessions.messages.unsubscribe", { key }).catch(() => {});
          }
        }
        ws._sreSubHandlers = [];
        ws._sreSubSessionKeys = new Set();
      }
    } catch {
      /* ignore */
    }
    ws._sreSessionMsgHandler = null;
    ws._sreSubscribedKey = null;
    ws._srePollLastSig = "";
    ws._srePollLastFlatLen = 0;
    ws._sreLastForwardedAssistantSig = "";
    ws._srePollStreamJustEnded = false;
    ws._sreMainSessionStreamCompletedNorm = "";
    ws._sreTaskPlanMessageId = "";
    ws._sreSyntheticToolEmitted = new Set();
    ws._sreSyntheticToolResultEmitted = new Set();
    ws._sreSyntheticToolNames = new Map();
    ws._sreSyntheticSpawnArgsStr = new Map();
    ws._sreSubscribingKey = null;
  }

  // 拉取初始历史（首次订阅时下发完整 detail）
  try {
    const gwWs = getGatewayWsClient();

    ws._sreTaskPlanMessageId = "";
    ws._sreSyntheticToolEmitted = new Set();
    ws._sreSyntheticToolResultEmitted = new Set();
    ws._sreSyntheticToolNames = new Map();
    ws._sreSyntheticSpawnArgsStr = new Map();

    // 先拿一次历史，供前端初始化渲染
    const histPayload = await gwWs.request("chat.history", { sessionKey: sk }).catch(() => null);
    if (histPayload) {
      const msgs = Array.isArray(histPayload.messages) ? histPayload.messages : [];
      const detail = { messages: msgs, sessionKey: sk };
      const cur = messagesFromOpenClawSessionDetail(detail);
      ws._srePollLastFlatLen = cur.length;
      ws._srePollLastSig = serializeMsgsForCompare(cur);
      ws._sreTaskPlanMessageId = scanLastTaskPlanMessageIdFromAguiMessages(cur);
      if (cur.length > 0) {
        safeSend(ws, {
          type: "CUSTOM",
          name: "openclaw_session_detail",
          value: { detail, incremental: false },
        });
      }
    }

    // 订阅后续消息实时推送
    await gwWs.request("sessions.messages.subscribe", { key: sk });
    ws._sreSubscribedKey = sk;
    pollTrace("poll_session-subscribed", {
      sk,
      taskPlanMessageId: String(ws._sreTaskPlanMessageId ?? "").trim() || null,
    });

    /**
     * Gateway WS session.message 事件处理器：将新消息增量推送给浏览器。
     * payload: { sessionKey, message: { role, content, timestamp }, messageSeq, session }
     */
    ws._sreSessionMsgHandler = (payload) => {
      if (payload?.sessionKey !== sk) return;
      if (ws.readyState !== 1) return;

      const msg = payload?.message;
      if (!msg || !msg.role) return;

      const _dbgRole = msg.role;
      const _dbgContentTypes = Array.isArray(msg.content)
        ? msg.content.slice(0, 6).map((b) => b?.type ?? typeof b).join(",")
        : typeof msg.content;
      const _dbgHasTool = assistantContentHasToolInvocationBlocks(msg.content);
      console.log(
        `[sre-ws][session-msg] sk=${sk.slice(-16)} role=${_dbgRole} activeRun=${!!ws._sreActiveRun} hasTool=${_dbgHasTool} contentTypes=[${_dbgContentTypes}]`
      );

      // 有活跃 run 时，流式通道（TEXT_MESSAGE_*）已在实时输出同一内容；
      // session.message 推来的是相同消息的完整版，此时跳过以防重复。
      // 例外：带工具调用块的 assistant 消息和 tool 结果消息仍需处理（synthetic 补齐）。
      if (ws._sreActiveRun) {
        const keepForSynthetic =
          (_dbgRole === "assistant" && _dbgHasTool) ||
          (_dbgRole === "tool");
        if (!keepForSynthetic) return;
      }

      // 忽略系统消息
      if (msg.role === "system") return;

      // 提取纯文本内容（content 可能是字符串或 content block 数组）
      const text = extractSessionMessageText(msg.content);
      const toolCallIdRaw =
        msg.toolCallId ??
        msg.tool_call_id ??
        msg.toolUseId ??
        msg.tool_use_id ??
        "";
      const toolCallId = String(toolCallIdRaw ?? "").trim();
      const keepToolOnlyAssistant =
        msg.role === "assistant" && assistantContentHasToolInvocationBlocks(msg.content);
      const keepToolRole =
        msg.role === "tool" &&
        (toolCallId !== "" ||
          (typeof msg.content === "string" && msg.content.trim() !== "") ||
          msg.content != null);

      // 过滤 OpenClaw 内部注入消息：
      //   - 包含内部 context 标记（<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>）
      //   - 包含发送者元数据注入（Sender (untrusted metadata)）
      //   - 空内容（assistant 仅 toolCall 块时仍须推送，保留 rawContent）
      if (!text && !keepToolOnlyAssistant && !keepToolRole) return;
      if (
        text &&
        (text.includes("<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>") ||
          text.includes("<<<END_OPENCLAW_INTERNAL_CONTEXT>>>") ||
          /^Sender \(untrusted metadata\)/m.test(text))
      ) {
        return;
      }

      // 有活跃 run 且当前消息仅用于 synthetic 补齐（toolCall/tool）：只发合成帧，不发正文。
      const activeRunSyntheticOnly = ws._sreActiveRun === true;

      // 仅当本条为 assistant 时，才消费「流式刚结束」标记，避免 tool 等先到达时抢走 replacing。
      const assistantMsg = msg.role === "assistant";
      const runJustEndedFlag = ws._sreRunJustEnded === true;
      const pollStreamJustEndedFlag = ws._srePollStreamJustEnded === true;
      const replacing = !activeRunSyntheticOnly && assistantMsg && (runJustEndedFlag || pollStreamJustEndedFlag);
      if (!activeRunSyntheticOnly && assistantMsg) {
        ws._sreRunJustEnded = false;
        ws._srePollStreamJustEnded = false;
      }

      if (!activeRunSyntheticOnly && assistantMsg && text.trim() && !keepToolOnlyAssistant) {
        const inc = normalizeAssistantDedupeSig(text);
        const streamedNorm = ws._sreMainSessionStreamCompletedNorm || "";
        if (
          shouldSkipStreamDuplicateAssistantFinalize(replacing, text, streamedNorm, msg.content)
        ) {
          ws._sreMainSessionStreamCompletedNorm = "";
          ws._sreLastForwardedAssistantSig = inc;
          // 即使正文 dedup，仍需合成 toolCall 帧（message 里同时有 text + toolCall 块的情况）
          emitSyntheticAguiFromSessionMessage(ws, msg, payload, {
            streamKey: sk,
            planMsgId: String(ws._sreTaskPlanMessageId ?? "").trim(),
          });
          return;
        }
        if (inc.length >= 64 && inc === ws._sreLastForwardedAssistantSig && !replacing) {
          emitSyntheticAguiFromSessionMessage(ws, msg, payload, {
            streamKey: sk,
            planMsgId: String(ws._sreTaskPlanMessageId ?? "").trim(),
          });
          return;
        }
      }

      if (!activeRunSyntheticOnly && assistantMsg && replacing) {
        ws._sreMainSessionStreamCompletedNorm = "";
      }

      const stableMsgId = pickOpenClawStableMessageId(msg, payload);
      if (assistantMsg && assistantPlainTextContainsSreTaskPlanHeading(text) && stableMsgId) {
        ws._sreTaskPlanMessageId = stableMsgId;
      }

      // 合成 TOOL_CALL_* 帧（run 路径也需要，防止 runSreAgentViaWs 的 runId 过滤漏掉步骤 2+）
      emitSyntheticAguiFromSessionMessage(ws, msg, payload, {
        streamKey: sk,
        planMsgId: String(ws._sreTaskPlanMessageId ?? "").trim(),
      });

      // 有活跃 run 时不重复推送正文（正文已由 runSreAgentViaWs 的 emit 路径发出）
      if (activeRunSyntheticOnly) return;

      const prev = ws._srePollLastFlatLen ?? 0;
      ws._srePollLastFlatLen = prev + 1;

      const tailRole = msg.role === "tool" ? "toolResult" : msg.role;
      const tailContent =
        text.trim() !== ""
          ? text
          : typeof msg.content === "string"
            ? msg.content
            : messageContentToString(msg.content);

      safeSend(ws, {
        type: "CUSTOM",
        name: "openclaw_session_detail",
        value: {
          incremental: true,
          replaceLastAssistant: replacing,
          streamKey: sk,
          tailMessages: [
            {
              role: tailRole,
              ...(toolCallId ? { toolCallId } : {}),
              ...(stableMsgId ? { id: stableMsgId } : {}),
              content: tailContent,
              rawContent: msg.content,
              rawMessage: msg,
              streamKey: sk,
            },
          ],
        },
      });

      if (assistantMsg && text.trim() && !keepToolOnlyAssistant) {
        ws._sreLastForwardedAssistantSig = normalizeAssistantDedupeSig(text);
      }
    };

    getGatewayWsClient().addEventHandler("session.message", ws._sreSessionMsgHandler);

    // ── 主 session agent 流式 handler ──────────────────────────────────
    // 当浏览器订阅了某个会话但未主动发起 run（ws._sreActiveRun === false）时，
    // 通过监听 agent 事件实现流式推送，避免与 runSreAgentViaWs 的流式重复。
    const skLower = sk.toLowerCase();
    let mainStreamMsgId = null;
    let lastMainAssistantMsgId = null;
    let mainStreamState = null;
    const mainPollActiveTools = {};
    const mainPollToolOrderStack = [];

    const mainAgentStreamHandler = (payload) => {
      const paySk = payload?.sessionKey != null ? String(payload.sessionKey) : "";
      const normMain = normalizeGatewayAgentPayload(payload);

      if (ws._sreActiveRun) {
        // 子 Agent 工具（runId=announce:v1:agent:sre-*:subagent:*）不被 runSreAgentViaWs 处理
        // （它们的 runId 与主 serverRunId 不同），需在此放行交由 forwardPollSessionGatewayTool。
        const isSubTool = normMain.stream === "tool" && isSubAgentRunId(normMain.runId);
        if (!isSubTool) {
          if (SRE_WS_POLL_TRACE && (normMain.stream === "tool" || normMain.stream === "lifecycle")) {
            pollTrace("main-handler-skip-activeRun", {
              mainSk: sk,
              paySk,
              stream: normMain.stream,
              phase: normMain.data?.phase,
              tool: normMain.data?.name,
              note: "TOOL/生命周期应由 openclaw-client run 路径发出",
            });
          }
          return;
        }
      }
      if (paySk.toLowerCase() !== skLower) {
        if (SRE_WS_POLL_TRACE && normMain.stream === "tool") {
          pollTrace("main-handler-skip-sessionKey", {
            expectedMainSk: sk,
            paySk,
            tool: normMain.data?.name,
            phase: normMain.data?.phase,
            note: "工具帧挂在子会话时可观察 sub-agent-tool",
          });
        }
        return;
      }
      if (ws.readyState !== 1) return;

      if (SRE_WS_POLL_TRACE) {
        if (normMain.stream === "tool") {
          pollTrace("main-agent-tool-received", {
            paySk,
            phase: normMain.data?.phase,
            tool: normMain.data?.name,
            toolCallId: normMain.data?.toolCallId,
            runId: normMain.runId,
          });
        } else if (normMain.stream === "lifecycle") {
          pollTrace("main-agent-lifecycle", { phase: normMain.data?.phase, paySk });
        } else if (normMain.stream !== "assistant" && normMain.stream != null) {
          pollTrace("main-agent-other-stream", {
            stream: normMain.stream,
            paySk,
            keys: Object.keys(payload || {}).slice(0, 18),
          });
        } else if (normMain.stream == null && payload && typeof payload === "object") {
          pollTrace("main-agent-missing-stream-field", {
            paySk,
            topKeys: Object.keys(payload).slice(0, 20),
          });
        }
      }

      forwardPollSessionGatewayTool(ws, {
        activeTools: mainPollActiveTools,
        toolCallOrderStack: mainPollToolOrderStack,
        parentMessageId: mainStreamMsgId || lastMainAssistantMsgId || `main_${sk}`,
        taskPlanMessageId: String(ws._sreTaskPlanMessageId ?? "").trim(),
        streamKey: sk,
      }, payload);

      const norm = normMain;
      const stream = norm.stream;
      const data = norm.data;

      if (stream === "lifecycle" && data.phase === "start") {
        ws._sreMainSessionStreamCompletedNorm = "";
        mainStreamMsgId = `main_${Date.now()}`;
        lastMainAssistantMsgId = mainStreamMsgId;
        mainStreamState = { fullText: "", sentLen: 0, lastSeq: null, anomalyCount: 0, fallback: false };
        safeSend(ws, { type: "TEXT_MESSAGE_START", messageId: mainStreamMsgId, role: "assistant", streamKey: sk });
        return;
      }
      if (stream === "assistant" && data.delta && mainStreamMsgId) {
        if (!mainStreamState) mainStreamState = { fullText: "", sentLen: 0, lastSeq: null, anomalyCount: 0, fallback: false };
        const next = extractAppendDelta(mainStreamState, data.delta);
        if (assistantPlainTextContainsSreTaskPlanHeading(mainStreamState.fullText)) {
          ws._sreTaskPlanMessageId = mainStreamMsgId;
        }
        if (STREAM_AUTO_FALLBACK) {
          const noisy = next.sourceType === "delta" && next.overlap > 0 && (next.incomingLen - next.overlap) <= 8;
          if (noisy) mainStreamState.anomalyCount = Number(mainStreamState.anomalyCount ?? 0) + 1;
          if (Number(mainStreamState.anomalyCount ?? 0) >= 3) mainStreamState.fallback = true;
        }
        debugStreamLog("main-delta", { sessionKey: sk, streamId: mainStreamMsgId, ...next, sentLen: mainStreamState.sentLen });
        if (FALLBACK_COMPLETE_THEN_STREAM || mainStreamState.fallback) return;
        if (!next.append) return;
        safeSend(ws, {
          type: "TEXT_MESSAGE_CONTENT",
          messageId: mainStreamMsgId,
          delta: next.append,
          seq: next.seq,
          sourceType: next.sourceType,
          overlap: next.overlap,
          streamKey: sk,
        });
        return;
      }
      if (stream === "lifecycle" && data.phase === "end" && mainStreamMsgId) {
        if ((FALLBACK_COMPLETE_THEN_STREAM || mainStreamState?.fallback) && mainStreamState?.fullText) {
          const chunks = splitForPseudoStream(mainStreamState.fullText);
          for (const ch of chunks) {
            safeSend(ws, { type: "TEXT_MESSAGE_CONTENT", messageId: mainStreamMsgId, delta: ch, sourceType: "fallback_chunk", streamKey: sk });
          }
        }
        ws._sreMainSessionStreamCompletedNorm = mainStreamState?.fullText
          ? normalizeAssistantDedupeSig(mainStreamState.fullText)
          : "";
        ws._srePollStreamJustEnded = true;
        safeSend(ws, { type: "TEXT_MESSAGE_END", messageId: mainStreamMsgId, streamKey: sk });
        mainStreamMsgId = null;
        mainStreamState = null;
      }
    };

    getGatewayWsClient().addEventHandler("agent", mainAgentStreamHandler);
    ws._sreMainAgentStreamHandler = mainAgentStreamHandler;

    ws._sreSubscribingKey = null; // setup 完成，释放并发锁

    void refreshSubSessionSubscriptions(ws, sk);

    // 浏览器断线时清理所有订阅（主 session + 子 session）
    ws.once("close", () => {
      const gwWs = getGatewayWsClient();
      // 清理主 session
      if (ws._sreSessionMsgHandler) {
        gwWs.removeEventHandler("session.message", ws._sreSessionMsgHandler);
        if (ws._sreSubscribedKey) {
          gwWs.request("sessions.messages.unsubscribe", { key: ws._sreSubscribedKey }).catch(() => {});
        }
        ws._sreSessionMsgHandler = null;
        ws._sreSubscribedKey = null;
      }
      if (ws._sreMainAgentStreamHandler) {
        gwWs.removeEventHandler("agent", ws._sreMainAgentStreamHandler);
        ws._sreMainAgentStreamHandler = null;
      }
      // 清理子 session（agent 流式 handler + session.message handler）
      if (ws._sreSubHandlers?.length) {
        const unsubscribedKeys = new Set();
        for (const { eventName = "session.message", handler, key } of ws._sreSubHandlers) {
          gwWs.removeEventHandler(eventName, handler);
          if (eventName === "session.message" && key && !unsubscribedKeys.has(key)) {
            unsubscribedKeys.add(key);
            gwWs.request("sessions.messages.unsubscribe", { key }).catch(() => {});
          }
        }
        ws._sreSubHandlers = [];
        ws._sreSubSessionKeys = new Set();
      }
    });
  } catch (e) {
    ws._sreSubscribingKey = null; // 异常时也释放锁，允许下次重试
    console.warn("[sre-ws] poll_session WS subscribe failed:", e?.message || e);
  }
}

/**
 * @param {import("ws").WebSocket} ws
 */
async function handleSreAgentWebSocketConnection(ws) {
  let busy = false;
  /** @type {AbortController | null} */
  let currentRunAbort = null;

  ws.on("message", async (raw) => {
    let body;
    try {
      body = JSON.parse(String(raw ?? ""));
    } catch {
      safeSend(ws, { type: "RUN_ERROR", message: "无效的 JSON 消息" });
      return;
    }

    if (body?.op === "abort") {
      currentRunAbort?.abort();
      return;
    }

    if (body?.op === "poll_session") {
      void handlePollSession(ws, body);
      return;
    }

    if (body?.op && body.op !== "run") {
      safeSend(ws, { type: "RUN_ERROR", message: `未知 op: ${body.op}` });
      return;
    }

    if (busy) {
      safeSend(ws, { type: "RUN_ERROR", message: "上一段运行尚未结束" });
      return;
    }

    busy = true;
    ws._sreActiveRun = true; // 通知 poll_session 的 agent 流式 handler 不要重复推送
    ws._sreLastForwardedAssistantSig = "";
    ws._sreMainSessionStreamCompletedNorm = "";
    ws._sreRunJustEnded = false;
    ws._srePollStreamJustEnded = false;
    const ac = new AbortController();
    currentRunAbort = ac;
    const onClose = () => ac.abort();
    ws.once("close", onClose);

    let runAssistantBuf = "";
    const emit = (event) => {
      const t = event?.type;
      if (t === "TEXT_MESSAGE_START" && event.role === "assistant") {
        runAssistantBuf = "";
        ws._sreMainSessionStreamCompletedNorm = "";
      }
      if (t === "TEXT_MESSAGE_CONTENT" && event.delta) {
        runAssistantBuf += String(event.delta);
      }
      if (t === "TEXT_MESSAGE_END") {
        ws._sreMainSessionStreamCompletedNorm = normalizeAssistantDedupeSig(runAssistantBuf);
        runAssistantBuf = "";
      }
      safeSend(ws, event);
    };

    try {
      await runSreAgent(body, emit, ac.signal);
    } catch (e) {
      if (e?.name !== "AbortError") {
        safeSend(ws, { type: "RUN_ERROR", message: e?.message || String(e) });
      }
    } finally {
      ws.off("close", onClose);
      currentRunAbort = null;
      busy = false;
      ws._sreActiveRun = false;
      // 下一条主 session 的 session.message 是「最终提交版」，应替换而非追加
      ws._sreRunJustEnded = true;
    }
  });
}

/**
 * 将 WebSocket 升级挂到已有 http.Server（与 Vite / 独立 API 共用）
 * @param {import("http").Server} httpServer
 */
export function attachSreAgentWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const path = requestPathname(req.url || "");
    if (path !== WS_PATH) {
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    handleSreAgentWebSocketConnection(ws);
  });

  return wss;
}

export { WS_PATH };
