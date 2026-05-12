import { uid } from "./agui.js";

async function readJsonOrExplain(url, r) {
  const text = await r.text().catch(() => "");
  const t = text.trim();
  if (t.startsWith("<") || /^<!doctype/i.test(t)) {
    throw new Error(
      `「${url}」返回了 HTML 而非 JSON（多为前端未命中 /api 代理、或 Nginx 把请求交给了 SPA）。请确认开发环境已启用带 OpenClaw 代理的 Vite 插件，或生产环境将 /api/ 转发到 backend:8787。`,
    );
  }
  try {
    return JSON.parse(t || "{}");
  } catch {
    throw new Error(`「${url}」响应不是合法 JSON（HTTP ${r.status}）：${t.slice(0, 160)}`);
  }
}

/**
 * GET /api/openclaw/sessions — 由后端代理；Gateway v2026.x 侧优先使用官方 POST /tools/invoke（sessions_list）。
 */
export async function fetchOpenClawSessionList(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && String(v) !== "") q.set(k, String(v));
  }
  const qs = q.toString();
  const url = `/api/openclaw/sessions${qs ? `?${qs}` : ""}`;
  const r = await fetch(url);
  const data = await readJsonOrExplain(url, r);
  if (!r.ok) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  if (data?.error && !extractSessionsArray(data).length) {
    throw new Error(data.error);
  }
  return data;
}

export async function fetchOpenClawSessionDetail(sessionKey) {
  const enc = encodeURIComponent(sessionKey);
  /** 后端代理为 GET /sessions/:key/history（聊天 transcript），非 /v1/sessions */
  const url = `/api/openclaw/sessions/${enc}`;
  const r = await fetch(url);
  const data = await readJsonOrExplain(url, r);
  if (!r.ok) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

function pickStr(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return s || "";
}

export function extractSessionsArray(json) {
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json)) return json;
  const keys = ["sessions", "items", "results", "data"];
  for (const k of keys) {
    const v = json[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object" && Array.isArray(v.sessions)) return v.sessions;
  }
  return [];
}

/**
 * 与后端 `openclaw-client.mjs` 中 `isEphemeralAppThreadId` 对齐：
 * 应用内临时 threadId（新建对话）在发往 Gateway 时会映射为 `agent:<id>:<thread>`。
 */
export function isEphemeralAppThreadId(threadId) {
  const s = String(threadId ?? "").trim();
  return /^thread_\d+_/i.test(s) || /^opsRobot_thread_\d+_/i.test(s);
}

/**
 * 计算拉取 OpenClaw 会话历史用的 session key（与 Chat 请求头 `X-OpenClaw-Session-Key` 规则一致）。
 */
export function computeGatewaySessionKeyForChat(threadId, agentId) {
  const sk = String(threadId ?? "").trim();
  const aid = String(agentId ?? "").trim();
  if (!sk) return "";
  if (!aid || !isEphemeralAppThreadId(sk)) return sk;
  return `agent:${aid}:${sk}`;
}

export function pickSessionKey(row) {
  if (!row || typeof row !== "object") return "";
  return (
    pickStr(row.key) ||
    pickStr(row.sessionKey) ||
    pickStr(row.session_key) ||
    pickStr(row.id) ||
    ""
  );
}

/** 后端合并列表时打的 agent 域；否则从 `agent:<id>:…` key 解析 */
export function inferSessionAgentId(row) {
  if (!row || typeof row !== "object") return "";
  const tagged = pickStr(row._openclawListAgentId);
  if (tagged) return tagged;
  const k = pickSessionKey(row);
  const m = /^agent:([^:]+):/.exec(k);
  if (m && m[1]) return m[1];
  return "";
}

/** 侧栏分组用 id：有 agent 前缀用 agentId，否则归入语义桶 */
export function sessionListAgentGroupId(row) {
  const id = inferSessionAgentId(row);
  if (id) return id;
  const k = pickSessionKey(row);
  if (pickStr(k).startsWith("user:")) return "__user__";
  if (pickStr(k).startsWith("webchat:")) return "__webchat__";
  if (pickStr(k).startsWith("cron:") || pickStr(k).startsWith("hook:")) return "__system__";
  return "__other__";
}

export function sessionListAgentGroupLabel(groupId) {
  const fixed = {
    __user__: "用户会话",
    __webchat__: "Webchat",
    __system__: "Cron / Hook",
    __other__: "其他",
  };
  if (fixed[groupId]) return fixed[groupId];
  if (groupId === "main") return "Agent · main";
  return `Agent · ${groupId}`;
}

function compareSessionGroupIds(a, b) {
  const pri = (g) => {
    if (g === "main") return 0;
    if (g.startsWith("__")) return 2;
    return 1;
  };
  const pa = pri(a);
  const pb = pri(b);
  if (pa !== pb) return pa - pb;
  return String(a).localeCompare(String(b), "en");
}

/**
 * 将扁平会话列表按 agent（或 key 前缀语义）分组，供侧栏展示。
 * @returns {{ groupId: string, label: string, rows: unknown[] }[]}
 */
export function groupSessionsByAgent(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const map = new Map();
  for (const row of rows) {
    const gid = sessionListAgentGroupId(row);
    if (!map.has(gid)) map.set(gid, []);
    map.get(gid).push(row);
  }
  const order = [...map.keys()].sort(compareSessionGroupIds);
  return order.map((groupId) => ({
    groupId,
    label: sessionListAgentGroupLabel(groupId),
    rows: map.get(groupId) || [],
  }));
}

/** 列表项 React key / 打开中状态：避免多条会话展示 key 同为 main 时撞车 */
export function sessionListRowStableKey(row) {
  if (!row || typeof row !== "object") return "";
  const sid = pickStr(row.sessionId);
  if (sid) return `sid:${sid}`;
  const tp = pickStr(row.transcriptPath);
  if (tp) return `tp:${tp}`;
  const k = pickSessionKey(row);
  const ch = pickStr(row.channel);
  const ua = row.updatedAt ?? row.updated_at ?? "";
  const mo = pickStr(row.model);
  if (k) return `k:${k}|${ch}|${mo}|${ua}`;
  return "";
}

/** 侧栏主标题：优先 label/displayName，避免只显示 agent:… 技术 key */
export function sessionListPrimaryLabel(row) {
  if (!row || typeof row !== "object") return "（无标题）";
  const t = pickStr(row.label) || pickStr(row.displayName);
  if (t) return t;
  const k = pickSessionKey(row);
  if (!k) return "（无标题）";
  if (/^thread_/i.test(k) || /^opsRobot_thread_/i.test(k)) return "对话线程";
  if (/^openai:/i.test(k)) return "OpenAI 会话";
  if (/webchat:/i.test(k)) return "Gateway 会话";
  if (/^user:/i.test(k)) return "用户会话";
  if (/^agent:[^:]+:main$/i.test(k)) return "主会话";
  if (/^agent:/i.test(k)) return "Agent 会话";
  return k.length > 40 ? `${k.slice(0, 20)}…${k.slice(-14)}` : k;
}

export function messageContentToString(content) {
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          // 只提取 type=text 的块；thinking/toolCall 等内部块跳过
          if (part.type === "text" && typeof part.text === "string") return part.text;
          if (part.type == null && typeof part.text === "string") return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  if (typeof content === "string") {
    // 安全兜底：后端可能把 content block 数组 JSON.stringify 后发来
    const trimmed = content.trimStart();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) || typeof parsed === "object") {
          return messageContentToString(parsed);
        }
      } catch {
        // 不是合法 JSON，当普通字符串处理
      }
    }
    return content;
  }
  if (typeof content === "object" && typeof content.text === "string") return content.text;
  try {
    return JSON.stringify(content);
  } catch {
    return "";
  }
}

/** assistant content 块数组中是否含需保留的工具调用块（纯工具气泡无 text 时也不能丢，否则 SRE spawn 解析失败） */
export function assistantContentHasToolInvocationBlocks(content) {
  if (!Array.isArray(content)) return false;
  return content.some((b) => {
    const t = b?.type;
    return t === "toolCall" || t === "tool_use";
  });
}

/**
 * 从 OpenClaw 单会话详情 JSON 中尽量提取 user/assistant 消息，供左侧气泡展示
 */
export function messagesFromOpenClawSessionDetail(detail) {
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
      if (p && Array.isArray(p.items)) {
        candidates.push(p.items);
      }
    }
  }
  let raw = [];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) {
      raw = c;
      break;
    }
  }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i];
    if (!m || typeof m !== "object") continue;
    let role = m.role === "assistant" || m.role === "user" || m.role === "toolResult" ? m.role : null;
    if (!role && (m.text != null || m.body != null)) role = "assistant";
    if (!role) continue;
    const text = messageContentToString(m.content);
    const keepAssistantTools =
      role === "assistant" && assistantContentHasToolInvocationBlocks(m.content);
    if (!text.trim() && role !== "toolResult" && !keepAssistantTools) continue;
    out.push({
      id: pickStr(m.id) || uid("hist"),
      role,
      content: text,
      rawContent: m.content,
      rawMessage: m,
      streaming: false,
    });
  }
  return out;
}
