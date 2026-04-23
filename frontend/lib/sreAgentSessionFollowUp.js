import { stripOpenClawHiddenBlocks } from "../pages/sre-agent/messageDisplayUtils.js";
import { parseAssistantConfirmSources } from "./aguiConfirmBlock.js";
import { uid } from "./agui.js";
import {
  computeGatewaySessionKeyForChat,
  fetchOpenClawSessionDetail,
  messageContentToString,
  messagesFromOpenClawSessionDetail,
} from "./sreOpenclawSessions.js";

/** 与气泡展示一致：数组 content、内部块、confirm 邀约等与远端对齐后再比较 */
function rawTextFromMessage(m) {
  if (!m || typeof m !== "object") return "";
  return messageContentToString(m.content).trim();
}

function canonicalUserText(m) {
  return rawTextFromMessage(m);
}

function canonicalAssistantText(m) {
  const raw = rawTextFromMessage(m);
  const stripped = stripOpenClawHiddenBlocks(raw);
  return parseAssistantConfirmSources(stripped, () => "").cleanText.trim();
}

function normalizeMsg(m) {
  if (!m || typeof m !== "object") return "";
  const role = m.role === "assistant" || m.role === "user" ? m.role : "";
  if (!role) return "";
  const content = role === "assistant" ? canonicalAssistantText(m) : canonicalUserText(m);
  return `${role}|${content}`;
}

/**
 * WS 仅推送「扁平化后的尾部新消息」时，直接追加；若与本地最后一条规范化一致则覆盖（防重复）。
 */
function mergeIncrementalTail(localMessages, tailMessages, replaceLastAssistant = false) {
  let loc = [...localMessages];
  for (const tm of tailMessages) {
    const content =
      typeof tm.content === "string" ? tm.content : messageContentToString(tm.content);
    const row = {
      ...tm,
      content,
      id: tm.id && String(tm.id).trim() ? tm.id : uid("sess"),
      streaming: false,
    };
    const last = loc[loc.length - 1];
    if (last && normalizeMsg(last) === normalizeMsg(row)) {
      // 精确匹配：更新为最终内容（清除 streaming 标志等）
      loc[loc.length - 1] = { ...last, ...row, content: row.content, streaming: false };
    } else if (replaceLastAssistant) {
      // 流刚结束后到来的提交版：优先按 streamKey 收敛覆盖，避免跨来源覆盖错误气泡
      const targetStreamKey = String(row.streamKey ?? "").trim();
      let replaceIdx = -1;
      if (targetStreamKey) {
        for (let i = loc.length - 1; i >= 0; i--) {
          const msg = loc[i];
          if (msg?.role !== "assistant" || msg.streaming) continue;
          if (String(msg.streamKey ?? "").trim() === targetStreamKey) {
            replaceIdx = i;
            break;
          }
        }
      }
      if (replaceIdx < 0 && last?.role === "assistant" && !last.streaming) {
        replaceIdx = loc.length - 1;
      }
      if (replaceIdx >= 0) {
        const base = loc[replaceIdx];
        loc[replaceIdx] = {
          ...base,
          content: row.content,
          streaming: false,
          streamKey: base.streamKey ?? row.streamKey ?? null,
        };
      } else {
        loc.push(row);
      }
    } else {
      loc.push(row);
    }
  }
  return loc;
}

/**
 * 将 Gateway 会话 transcript 与当前 UI 消息合并：用于 HTTP 流已结束（RUN_FINISHED）
 * 但 OpenClaw 仍异步写入子 Agent / 感知阶段后续回复的场景。
 *
 * @param {Array<{ id?: string, role: string, content: string, streaming?: boolean }>} localMessages
 * @param {object | { incremental?: boolean, tailMessages?: unknown[], detail?: object }} payload - 全量 `detail` 或 WS 增量 `{ incremental, tailMessages }`
 * @returns {typeof localMessages} 无变化时返回同一引用，避免多余渲染
 */
export function mergeChatWithSessionHistory(localMessages, payload) {
  if (!Array.isArray(localMessages)) return localMessages;

  if (
    payload &&
    typeof payload === "object" &&
    payload.incremental === true &&
    Array.isArray(payload.tailMessages)
  ) {
    if (!payload.tailMessages.length) return localMessages;
    return mergeIncrementalTail(localMessages, payload.tailMessages, payload.replaceLastAssistant === true);
  }

  const detail = payload && typeof payload === "object" && payload.detail != null ? payload.detail : payload;
  const remote = messagesFromOpenClawSessionDetail(detail);
  if (!remote.length) return localMessages;

  let prefix = 0;
  const max = Math.min(localMessages.length, remote.length);
  for (let i = 0; i < max; i++) {
    if (normalizeMsg(localMessages[i]) !== normalizeMsg(remote[i])) break;
    prefix++;
  }

  if (prefix === localMessages.length && remote.length > localMessages.length) {
    const tail = remote.slice(localMessages.length).map((m) => ({
      ...m,
      id: m.id && String(m.id).trim() ? m.id : uid("sess"),
      streaming: false,
    }));
    return [...localMessages, ...tail];
  }

  if (
    prefix === localMessages.length &&
    remote.length === localMessages.length &&
    localMessages.length > 0
  ) {
    const i = localMessages.length - 1;
    const L = localMessages[i];
    const R = remote[i];
    if (L?.role === "assistant" && R?.role === "assistant") {
      const sl = canonicalAssistantText(L);
      const sr = canonicalAssistantText(R);
      if (sr.length > sl.length && sr.startsWith(sl)) {
        const next = [...localMessages.slice(0, i), { ...L, content: R.content, streaming: false }];
        return next;
      }
      // Gateway 可能改写同一条 assistant（非前缀扩展），以远端为准
      if (normalizeMsg(L) !== normalizeMsg(R)) {
        return [...localMessages.slice(0, i), { ...L, content: R.content, streaming: false }];
      }
    }
    return localMessages;
  }

  if (prefix === localMessages.length - 1 && localMessages.length > 0) {
    const i = prefix;
    const L = localMessages[i];
    const R = remote[i];
    if (L?.role === "assistant" && R?.role === "assistant") {
      const sl = canonicalAssistantText(L);
      const sr = canonicalAssistantText(R);
      if (sr.length >= sl.length && sr.startsWith(sl)) {
        const head = [...localMessages.slice(0, i), { ...L, content: R.content, streaming: false }];
        if (remote.length > localMessages.length) {
          const tail = remote.slice(localMessages.length).map((m) => ({
            ...m,
            id: m.id && String(m.id).trim() ? m.id : uid("sess"),
            streaming: false,
          }));
          return [...head, ...tail];
        }
        return head;
      }
    }
  }

  // 前若干条严格一致，仅最后一条与远端不一致（规范化或 Gateway 改写），且远端可能多出尾部消息。
  // 原先仅当 assistant 前缀扩展时才合并，否则会落到 return localMessages，导致 WS 推送已到但 UI 不更新。
  if (
    remote.length >= localMessages.length &&
    localMessages.length > 0 &&
    prefix === localMessages.length - 1
  ) {
    const i = prefix;
    const L = localMessages[i];
    const R = remote[i];
    if (L && R && (L.role === "user" || L.role === "assistant") && L.role === R.role) {
      const head = [...localMessages.slice(0, i), { ...L, content: R.content, streaming: false }];
      if (remote.length > localMessages.length) {
        const tail = remote.slice(localMessages.length).map((m) => ({
          ...m,
          id: m.id && String(m.id).trim() ? m.id : uid("sess"),
          streaming: false,
        }));
        return [...head, ...tail];
      }
      if (normalizeMsg(L) !== normalizeMsg(R)) {
        return head;
      }
    }
  }

  // 本地列表与远端「尾部」对齐（例如远端在开头多出若干条），整表以 Gateway 为准替换
  if (remote.length > localMessages.length && localMessages.length > 0) {
    const offset = remote.length - localMessages.length;
    let suffixOk = true;
    for (let i = 0; i < localMessages.length; i++) {
      if (normalizeMsg(localMessages[i]) !== normalizeMsg(remote[offset + i])) {
        suffixOk = false;
        break;
      }
    }
    if (suffixOk) {
      return remote.map((m) => ({
        ...m,
        id: m.id && String(m.id).trim() ? m.id : uid("sess"),
        streaming: false,
      }));
    }
  }

  return localMessages;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * HTTP/SSE 会话结束后轮询 OpenClaw 会话历史，合并异步推送的助手消息。
 * 策略：首次立即拉取，之后约每 3s 一次，直至超时或稳定条件满足。
 *
 * @param {{ persistent?: boolean }} opts - `persistent: true`（WebSocket 长连接会话空闲期）时仅随 `signal` 中止，不按「稳定即停」退出。
 */
export async function runOpenClawSessionFollowUpPoll({
  threadId,
  agentId,
  getMessages,
  setMessages,
  signal,
  persistent = false,
}) {
  const key = computeGatewaySessionKeyForChat(threadId, agentId);
  if (!key) return;

  const maxMs = persistent ? Number.POSITIVE_INFINITY : 300_000;
  /** 会话（SSE）结束后：首次立即拉取，之后约每 3s 一次 */
  const intervalMs = 3000;
  const maxConsecErrors = 6;
  /** 约 10 × 3s：历史曾增长后若连续无新变化则停止 */
  const stablePollsBeforeStop = 10;
  const start = Date.now();
  let consecErr = 0;
  let sawRemoteGrowth = false;
  let stableAfterGrowth = 0;

  while (!signal.aborted && Date.now() - start < maxMs) {
    let detail;
    try {
      detail = await fetchOpenClawSessionDetail(key);
      consecErr = 0;
    } catch {
      consecErr++;
      if (consecErr >= maxConsecErrors) break;
      await sleep(intervalMs);
      continue;
    }

    const prev = getMessages();
    const merged = mergeChatWithSessionHistory(prev, detail);
    const changed = merged !== prev;
    if (changed) {
      setMessages(merged);
      sawRemoteGrowth = true;
      stableAfterGrowth = 0;
    } else if (!persistent && sawRemoteGrowth) {
      stableAfterGrowth++;
      if (stableAfterGrowth >= stablePollsBeforeStop) break;
    }

    if (!persistent && !sawRemoteGrowth && Date.now() - start > 180_000) break;

    await sleep(intervalMs);
  }
}
