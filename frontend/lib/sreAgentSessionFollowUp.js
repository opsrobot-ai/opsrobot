import { stripOpenClawHiddenBlocks } from "../pages/sre-agent/messageDisplayUtils.js";
import { parseAssistantConfirmSources } from "./aguiConfirmBlock.js";
import { uid } from "./agui.js";
import {
  assistantContentHasToolInvocationBlocks,
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
  if (m.role === "toolResult") {
    const tid = String(m.toolCallId ?? m.rawMessage?.toolCallId ?? "").trim();
    const tx = rawTextFromMessage(m);
    return `toolResult|${tid}|${tx}`;
  }
  const role = m.role === "assistant" || m.role === "user" ? m.role : "";
  if (!role) return "";
  const content = role === "assistant" ? canonicalAssistantText(m) : canonicalUserText(m);
  return `${role}|${content}`;
}

function normalizeAssistantFingerprint(m) {
  if (!m || m.role !== "assistant") return "";
  return canonicalAssistantText(m)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u200b-\u200d\ufeff\u2060]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 折叠相邻且正文实质相同的 assistant，修复 Gateway 多次推送同一环境感知/总结造成的双气泡。
 */
export function dedupeConsecutiveDuplicateAssistants(messages) {
  if (!Array.isArray(messages) || messages.length < 2) return messages;
  const out = [messages[0]];
  let changed = false;
  for (let i = 1; i < messages.length; i++) {
    const m = messages[i];
    const last = out[out.length - 1];
    if (m?.role === "assistant" && last?.role === "assistant") {
      const pa = normalizeAssistantFingerprint(last);
      const pb = normalizeAssistantFingerprint(m);
      if (pa && pb) {
        if (pa === pb) {
          out[out.length - 1] = {
            ...last,
            ...m,
            content: m.content,
            rawContent: m.rawContent ?? last.rawContent,
            rawMessage: m.rawMessage ?? last.rawMessage,
            streaming: false,
            id: last.id || m.id,
            streamKey: last.streamKey ?? m.streamKey ?? null,
          };
          changed = true;
          continue;
        }
        if (pb.startsWith(pa) && pb.length > pa.length) {
          out[out.length - 1] = {
            ...last,
            ...m,
            content: m.content,
            rawContent: m.rawContent ?? last.rawContent,
            rawMessage: m.rawMessage ?? last.rawMessage,
            streaming: false,
            id: last.id || m.id,
            streamKey: last.streamKey ?? m.streamKey ?? null,
          };
          changed = true;
          continue;
        }
        if (pa.startsWith(pb) && pa.length >= pb.length) {
          changed = true;
          continue;
        }
      }
    }
    out.push(m);
  }
  return changed ? out : messages;
}

/**
 * 将已有 assistant 与 tail 中「正文实质相同」的条目合并，避免流式结束前后多次 session.message 推送重复气泡。
 */
function mergeAssistantDuplicateInPlace(loc, row) {
  const inc = normalizeAssistantFingerprint(row);
  if (!inc) return false;
  for (let i = loc.length - 1; i >= 0; i--) {
    const m = loc[i];
    if (m?.role !== "assistant") continue;
    const prev = normalizeAssistantFingerprint(m);
    if (!prev) continue;
    if (prev === inc) {
      loc[i] = {
        ...m,
        ...row,
        content: row.content,
        rawContent: row.rawContent ?? m.rawContent,
        rawMessage: row.rawMessage ?? m.rawMessage,
        streaming: false,
        id: m.id || row.id,
        streamKey: m.streamKey ?? row.streamKey ?? null,
      };
      return true;
    }
    if (inc.startsWith(prev) && inc.length > prev.length) {
      loc[i] = {
        ...m,
        ...row,
        content: row.content,
        rawContent: row.rawContent ?? m.rawContent,
        rawMessage: row.rawMessage ?? m.rawMessage,
        streaming: false,
        id: m.id || row.id,
        streamKey: m.streamKey ?? row.streamKey ?? null,
      };
      return true;
    }
    if (prev.startsWith(inc) && prev.length >= inc.length) {
      return true;
    }
  }
  return false;
}

function dedupeAssistantTailAgainstLocal(localMessages, tail) {
  if (!Array.isArray(tail) || !tail.length) return tail;
  const seen = new Set();
  for (const m of localMessages) {
    const f = normalizeAssistantFingerprint(m);
    if (f) seen.add(f);
  }
  const out = [];
  for (const m of tail) {
    if (m?.role !== "assistant") {
      out.push(m);
      continue;
    }
    const f = normalizeAssistantFingerprint(m);
    if (f && seen.has(f)) continue;
    if (f) seen.add(f);
    out.push(m);
  }
  return out;
}

/**
 * WS 仅推送「扁平化后的尾部新消息」时，直接追加；若与本地最后一条规范化一致则覆盖（防重复）。
 */
function mergeIncrementalTail(localMessages, tailMessages, replaceLastAssistant = false) {
  let loc = [...localMessages];
  tailLoop: for (const tm of tailMessages) {
    const content =
      typeof tm.content === "string" ? tm.content : messageContentToString(tm.content);
    const row = {
      ...tm,
      content,
      rawContent: tm.rawContent ?? tm.content,
      rawMessage: tm.rawMessage ?? tm,
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
          rawContent: row.rawContent ?? base.rawContent,
          rawMessage: row.rawMessage ?? base.rawMessage,
          streaming: false,
          streamKey: base.streamKey ?? row.streamKey ?? null,
        };
      } else {
        if (row.role === "assistant" && mergeAssistantDuplicateInPlace(loc, row)) continue tailLoop;
        loc.push(row);
      }
    } else {
      if (row.role === "assistant" && mergeAssistantDuplicateInPlace(loc, row)) continue tailLoop;
      loc.push(row);
    }
  }
  return dedupeConsecutiveDuplicateAssistants(loc);
}

function appendAssistantToolBlocks(prevMsg, tailMsg) {
  const incoming = tailMsg.rawContent ?? tailMsg.content;
  if (!Array.isArray(incoming)) return prevMsg;
  const additions = incoming.filter(
    (b) =>
      b &&
      typeof b === "object" &&
      (b.type === "toolCall" || b.type === "tool_use"),
  );
  if (!additions.length) return prevMsg;

  const base = Array.isArray(prevMsg.rawContent)
    ? [...prevMsg.rawContent]
    : prevMsg.rawContent != null
      ? [prevMsg.rawContent]
      : [];
  const seen = new Set(
    base
      .filter((b) => b?.type === "toolCall" || b?.type === "tool_use")
      .map((b) => String(b.id ?? b.toolCallId ?? ""))
      .filter(Boolean),
  );
  for (const b of additions) {
    const id = String(b.id ?? b.toolCallId ?? "");
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    base.push(b);
  }
  return {
    ...prevMsg,
    rawContent: base,
    rawMessage: tailMsg.rawMessage ?? prevMsg.rawMessage,
  };
}

/**
 * 流式输出进行中时 Gateway 仍会推送含 toolCall 块的 assistant tail（扁平正文为空）。
 * 把它们并入当前 streaming 的 assistant，供 extractSreSpawnEventsFromMessages 使用。
 */
function mergeIncrementalToolTailsIntoStreamingAssistants(localMessages, tailMessages) {
  if (!Array.isArray(tailMessages) || !tailMessages.length) return localMessages;
  let next = localMessages;
  let changed = false;
  for (const tm of tailMessages) {
    const rc = tm.rawContent ?? tm.content;
    if (!assistantContentHasToolInvocationBlocks(Array.isArray(rc) ? rc : [])) continue;

    const skTail = String(tm.streamKey ?? "").trim();
    let idx = -1;
    if (skTail) {
      for (let i = next.length - 1; i >= 0; i--) {
        const m = next[i];
        if (m?.role !== "assistant" || !m.streaming) continue;
        if (String(m.streamKey ?? "").trim() === skTail) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0) {
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i]?.role === "assistant" && next[i]?.streaming) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0) continue;

    const merged = appendAssistantToolBlocks(next[idx], tm);
    if (merged !== next[idx]) {
      next = [...next.slice(0, idx), merged, ...next.slice(idx + 1)];
      changed = true;
    }
  }
  return changed ? next : localMessages;
}

/**
 * 存在 streaming 气泡时仍合并：含结构化工具块的 assistant tail + toolResult（不全量合并以防正文重复）。
 */
export function mergeStreamingIncrementalSessionTails(
  localMessages,
  tailMessages,
  replaceLastAssistant = false,
) {
  if (!Array.isArray(localMessages) || !tailMessages?.length) return localMessages;

  const assistantToolTails = tailMessages.filter((tm) => {
    if (tm?.role !== "assistant") return false;
    const rc = tm.rawContent ?? tm.content;
    return assistantContentHasToolInvocationBlocks(Array.isArray(rc) ? rc : []);
  });

  let loc = assistantToolTails.length
    ? mergeIncrementalToolTailsIntoStreamingAssistants(localMessages, assistantToolTails)
    : localMessages;

  const toolResultTails = tailMessages.filter((tm) => tm?.role === "toolResult");
  if (toolResultTails.length) {
    loc = mergeIncrementalTail(loc, toolResultTails, replaceLastAssistant);
  }

  return dedupeConsecutiveDuplicateAssistants(loc);
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
    let tail = remote.slice(localMessages.length).map((m) => ({
      ...m,
      id: m.id && String(m.id).trim() ? m.id : uid("sess"),
      streaming: false,
    }));
    tail = dedupeAssistantTailAgainstLocal(localMessages, tail);
    return dedupeConsecutiveDuplicateAssistants([...localMessages, ...tail]);
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
        return dedupeConsecutiveDuplicateAssistants([
          ...localMessages.slice(0, i),
          { ...L, ...R, content: R.content, streaming: false },
        ]);
      }
      // Gateway 可能改写同一条 assistant（非前缀扩展），以远端为准
      if (normalizeMsg(L) !== normalizeMsg(R)) {
        return dedupeConsecutiveDuplicateAssistants([
          ...localMessages.slice(0, i),
          { ...L, ...R, content: R.content, streaming: false },
        ]);
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
        const head = [...localMessages.slice(0, i), { ...L, ...R, content: R.content, streaming: false }];
        if (remote.length > localMessages.length) {
          let tail = remote.slice(localMessages.length).map((m) => ({
            ...m,
            id: m.id && String(m.id).trim() ? m.id : uid("sess"),
            streaming: false,
          }));
          tail = dedupeAssistantTailAgainstLocal(head, tail);
          return dedupeConsecutiveDuplicateAssistants([...head, ...tail]);
        }
        return dedupeConsecutiveDuplicateAssistants(head);
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
      const head = [...localMessages.slice(0, i), { ...L, ...R, content: R.content, streaming: false }];
      if (remote.length > localMessages.length) {
        let tail = remote.slice(localMessages.length).map((m) => ({
          ...m,
          id: m.id && String(m.id).trim() ? m.id : uid("sess"),
          streaming: false,
        }));
        tail = dedupeAssistantTailAgainstLocal(head, tail);
        return dedupeConsecutiveDuplicateAssistants([...head, ...tail]);
      }
      if (normalizeMsg(L) !== normalizeMsg(R)) {
        return dedupeConsecutiveDuplicateAssistants(head);
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
      return dedupeConsecutiveDuplicateAssistants(
        remote.map((m) => ({
          ...m,
          id: m.id && String(m.id).trim() ? m.id : uid("sess"),
          streaming: false,
        })),
      );
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
    const merged = dedupeConsecutiveDuplicateAssistants(mergeChatWithSessionHistory(prev, detail));
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
