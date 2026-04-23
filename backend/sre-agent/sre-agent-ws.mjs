/**
 * SRE Agent WebSocket：浏览器 WS → 同一套 AG-UI JSON 文本帧；连接可长驻。
 * 主流程结束即由 runSreAgent 下发 RUN_FINISHED。
 * 会话增量：客户端 `op: "poll_session"`，服务端通过 Gateway WS sessions.messages.subscribe 订阅推送，
 * 有新消息到达时以 `CUSTOM openclaw_session_detail` 格式转发给浏览器。
 */
import { WebSocketServer } from "ws";
import { messagesFromOpenClawSessionDetail } from "../../frontend/lib/sreOpenclawSessions.js";
import {
  runSreAgent,
  resolveGatewaySessionKeyForChat,
  getConfig,
  isOpenClawGatewayBaseUrl,
} from "./openclaw-client.mjs";
import { getGatewayWsClient } from "./openclaw-gateway-ws.mjs";

const WS_PATH = "/api/sre-agent/ws";
const STREAM_DEBUG = String(process.env.SRE_STREAM_OBSERVABILITY || "") === "1";
const FALLBACK_COMPLETE_THEN_STREAM = String(process.env.SRE_STREAM_COMPLETE_THEN_STREAM || "") === "1";
const STREAM_AUTO_FALLBACK = String(process.env.SRE_STREAM_AUTO_FALLBACK || "1") === "1";

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
  if (!ws._sreSubHandlers) ws._sreSubHandlers = [];

  const subKeyLower = subKey.toLowerCase();

  // ── 1. 流式：监听子 session 的 agent 事件（逐 token 推送）──────────────────
  let streamMsgId = null;
  let subStreamState = null;
  /**
   * lifecycle: end 后置为 true，表示「刚完成一次流式输出」。
   * 下一条 session.message（OpenClaw 最终提交版）到来时，用 replaceLastAssistant
   * 替换已有的流式结果而非追加，避免细微差异导致内容重复。
   */
  let streamJustEnded = false;

  const agentStreamHandler = (payload) => {
    // agent 事件用 sessionKey 过滤（大小写不敏感）
    if (payload?.sessionKey?.toLowerCase() !== subKeyLower) return;
    if (ws.readyState !== 1) return;

    const stream = payload?.stream;
    const data = payload?.data ?? {};

    if (stream === "lifecycle" && data.phase === "start") {
      streamMsgId = `sub_${subKey.slice(-8)}_${Date.now()}`;
      subStreamState = { fullText: "", sentLen: 0, lastSeq: null, anomalyCount: 0, fallback: false };
      streamJustEnded = false;
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
      safeSend(ws, { type: "TEXT_MESSAGE_END", messageId: streamMsgId, streamKey: subKey });
      streamMsgId = null;
      subStreamState = null;
      streamJustEnded = true; // 下一条 session.message 是提交版，应替换而非追加
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
    if (!text) return;
    if (
      text.includes("<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>") ||
      text.includes("<<<END_OPENCLAW_INTERNAL_CONTEXT>>>") ||
      /^Sender \(untrusted metadata\)/m.test(text)
    ) return;

    // 刚完成流式输出后到来的 session.message 是「最终提交版」，
    // 用 replaceLastAssistant 替换已有的流式结果，防止细微差异导致内容追加重复。
    const replacing = streamJustEnded;
    streamJustEnded = false;

    safeSend(ws, {
      type: "CUSTOM",
      name: "openclaw_session_detail",
      value: {
        incremental: true,
        replaceLastAssistant: replacing,
        streamKey: subKey,
        tailMessages: [{ role: msg.role, content: text, streamKey: subKey }],
      },
    });
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

    for (const session of payload.sessions) {
      const key = session.key || session.sessionKey;
      if (!key || key === mainSessionKey) continue;
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

  // 若已订阅同一主 session：仅主 session 推送，不再订阅子 session
  if (ws._sreSubscribedKey === sk) {
    return;
  }

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
  }

  // 拉取初始历史（首次订阅时下发完整 detail）
  try {
    const gwWs = getGatewayWsClient();

    // 先拿一次历史，供前端初始化渲染
    const histPayload = await gwWs.request("chat.history", { sessionKey: sk }).catch(() => null);
    if (histPayload) {
      const msgs = Array.isArray(histPayload.messages) ? histPayload.messages : [];
      const detail = { messages: msgs, sessionKey: sk };
      const cur = messagesFromOpenClawSessionDetail(detail);
      ws._srePollLastFlatLen = cur.length;
      ws._srePollLastSig = serializeMsgsForCompare(cur);
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

    /**
     * Gateway WS session.message 事件处理器：将新消息增量推送给浏览器。
     * payload: { sessionKey, message: { role, content, timestamp }, messageSeq, session }
     */
    ws._sreSessionMsgHandler = (payload) => {
      if (payload?.sessionKey !== sk) return;
      if (ws.readyState !== 1) return;
      // 有活跃 run 时，流式通道（TEXT_MESSAGE_*）已在实时输出同一内容；
      // session.message 推来的是相同消息的完整版，此时跳过以防重复。
      if (ws._sreActiveRun) return;

      const msg = payload?.message;
      if (!msg || !msg.role) return;

      // 忽略系统消息
      if (msg.role === "system") return;

      // 提取纯文本内容（content 可能是字符串或 content block 数组）
      const text = extractSessionMessageText(msg.content);

      // 过滤 OpenClaw 内部注入消息：
      //   - 包含内部 context 标记（<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>）
      //   - 包含发送者元数据注入（Sender (untrusted metadata)）
      //   - 空内容
      if (!text) return;
      if (
        text.includes("<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>") ||
        text.includes("<<<END_OPENCLAW_INTERNAL_CONTEXT>>>") ||
        /^Sender \(untrusted metadata\)/m.test(text)
      ) {
        return;
      }

      const prev = ws._srePollLastFlatLen ?? 0;
      ws._srePollLastFlatLen = prev + 1;

      // 刚完成 run 后到来的 session.message 是「最终提交版」，
      // 用 replaceLastAssistant 替换已有的流式结果，防止细微差异导致内容追加重复。
      const replacing = ws._sreRunJustEnded === true;
      ws._sreRunJustEnded = false;

      safeSend(ws, {
        type: "CUSTOM",
        name: "openclaw_session_detail",
        value: {
          incremental: true,
          replaceLastAssistant: replacing,
          streamKey: sk,
          tailMessages: [{ role: msg.role, content: text, streamKey: sk }],
        },
      });
    };

    getGatewayWsClient().addEventHandler("session.message", ws._sreSessionMsgHandler);

    // ── 主 session agent 流式 handler ──────────────────────────────────
    // 当浏览器订阅了某个会话但未主动发起 run（ws._sreActiveRun === false）时，
    // 通过监听 agent 事件实现流式推送，避免与 runSreAgentViaWs 的流式重复。
    const skLower = sk.toLowerCase();
    let mainStreamMsgId = null;
    let mainStreamState = null;

    const mainAgentStreamHandler = (payload) => {
      // 当前连接有活跃 run，由 runSreAgentViaWs 负责流式，此处跳过
      if (ws._sreActiveRun) return;
      if (payload?.sessionKey?.toLowerCase() !== skLower) return;
      if (ws.readyState !== 1) return;

      const stream = payload?.stream;
      const data = payload?.data ?? {};

      if (stream === "lifecycle" && data.phase === "start") {
        mainStreamMsgId = `main_${Date.now()}`;
        mainStreamState = { fullText: "", sentLen: 0, lastSeq: null, anomalyCount: 0, fallback: false };
        safeSend(ws, { type: "TEXT_MESSAGE_START", messageId: mainStreamMsgId, role: "assistant", streamKey: sk });
        return;
      }
      if (stream === "assistant" && data.delta && mainStreamMsgId) {
        if (!mainStreamState) mainStreamState = { fullText: "", sentLen: 0, lastSeq: null, anomalyCount: 0, fallback: false };
        const next = extractAppendDelta(mainStreamState, data.delta);
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
        safeSend(ws, { type: "TEXT_MESSAGE_END", messageId: mainStreamMsgId, streamKey: sk });
        mainStreamMsgId = null;
        mainStreamState = null;
      }
    };

    getGatewayWsClient().addEventHandler("agent", mainAgentStreamHandler);
    ws._sreMainAgentStreamHandler = mainAgentStreamHandler;

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
    const ac = new AbortController();
    currentRunAbort = ac;
    const onClose = () => ac.abort();
    ws.once("close", onClose);

    const emit = (event) => {
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
