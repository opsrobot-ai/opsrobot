/**
 * SRE Agent HTTP Handler
 *
 * - POST /api/sre-agent — AG-UI RunAgentInput (JSON)，SSE 流式响应，桥接 OpenClaw Chat API
 * - GET  /api/sre-agent/agents — 与 GET /api/openclaw/agents 等价，代理拉取 OpenClaw 已注册 Agent 列表（JSON）
 */
import { runSreAgent, getConfig, isOpenClawGatewayBaseUrl } from "./openclaw-client.mjs";
import { getGatewayWsClient } from "./openclaw-gateway-ws.mjs";

/**
 * 处理 POST /api/sre-agent 请求（原生 node:http req/res）
 */
export async function handleSreAgent(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
    return;
  }

  // Parse JSON body
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Abort controller for client disconnect
  const ac = new AbortController();
  req.on("close", () => ac.abort());

  const emit = (event) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await runSreAgent(body, emit, ac.signal);
  } catch (err) {
    if (err.name !== "AbortError") {
      emit({ type: "RUN_ERROR", message: err.message || String(err) });
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
}

/**
 * Vite dev middleware 适配器（req/res 为 connect-style）
 */
export function handleSreAgentMiddleware(req, res) {
  return handleSreAgent(req, res);
}

/**
 * POST /api/sre-agent/action — 前端操作按钮事件上报
 * 接收 A2UI userAction payload，转发给 Agent 或记录日志。
 */
export async function handleSreAgentAction(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  let body;
  try { body = await readBody(req); } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  console.log("[sre-agent] userAction:", JSON.stringify(body));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, received: body }));
}

export function handleSreAgentActionMiddleware(req, res) {
  return handleSreAgentAction(req, res);
}

// ─── GET /api/sre-agent/agents | GET /api/openclaw/agents（等价）───

let _agentsCache = null;
let _agentsCacheTs = 0;
const AGENTS_CACHE_TTL = 30_000;

function pickStr(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return s || "";
}

/**
 * 从 OpenClaw JSON 中取出 Agent 数组（不同版本 / 网关字段名不一致）
 */
/** Gateway 常把 agents 做成 `{ [agentId]: { ... } }` 映射 */
function objectMapToAgentRows(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return Object.entries(obj).map(([key, v]) => {
    if (!v || typeof v !== "object") return { slug: key, name: key };
    return { ...v, slug: pickStr(v.slug) || key, name: pickStr(v.name) || key };
  });
}

function extractAgentArray(json) {
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json)) return json;

  if (Array.isArray(json.agents)) return json.agents;
  if (json.agents && typeof json.agents === "object") {
    return objectMapToAgentRows(json.agents);
  }

  const nested = [
    json.data,
    json.items,
    json.results,
    json.status,
    json.gateway,
  ];
  for (const c of nested) {
    if (Array.isArray(c)) return c;
    if (c && typeof c === "object") {
      if (Array.isArray(c.agents)) return c.agents;
      if (c.agents && typeof c.agents === "object" && !Array.isArray(c.agents)) {
        return objectMapToAgentRows(c.agents);
      }
    }
  }
  return [];
}

/**
 * 对话时使用的 agent 标识：Gateway UI 多为 slug / name，Mission Control 多为 gateway_agent_id
 */
function resolveAgentId(a) {
  return (
    pickStr(a.gateway_agent_id) ||
    pickStr(a.slug) ||
    pickStr(a.agent_id) ||
    pickStr(a.agentId) ||
    pickStr(a.id) ||
    pickStr(a.name)
  );
}

function mapOpenClawAgent(a) {
  if (!a || typeof a !== "object") return null;
  const id = resolveAgentId(a);
  if (!id) return null;
  const label =
    pickStr(a.name) ||
    pickStr(a.displayName) ||
    pickStr(a.display_name) ||
    pickStr(a.title) ||
    pickStr(a.slug) ||
    id;
  let description;
  const ip = a.identity_profile ?? a.identityProfile;
  if (ip) {
    description = typeof ip === "string" ? ip : JSON.stringify(ip);
  }
  return {
    id,
    label,
    status: pickStr(a.status) || "unknown",
    description,
  };
}

function parseOpenClawJsonBody(text, pathForLog) {
  const t = String(text ?? "").replace(/^\uFEFF/, "").trim();
  if (t.startsWith("<") || /^<!doctype/i.test(t)) {
    throw new Error(`${pathForLog || "?"} 返回 HTML 而非 JSON`);
  }
  try {
    return JSON.parse(t || "{}");
  } catch (e) {
    throw new Error(`${pathForLog || "?"} 非合法 JSON：${e?.message || e}`);
  }
}

async function fetchOpenClawGetFirstJson(baseUrl, paths, apiKey) {
  let lastErr = null;
  for (const path of paths) {
    try {
      return await fetchJsonWithAuth(baseUrl, path, apiKey);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("OpenClaw status 探测失败");
}

/** 解开 tools/invoke 里 agents_list 的嵌套（details / content JSON / result） */
function unwrapToolsInvokeAgentListResult(result) {
  let cur = result;
  if (cur == null) return null;
  if (typeof cur === "string") {
    try {
      cur = JSON.parse(cur);
    } catch {
      return null;
    }
  }
  for (let i = 0; i < 8 && cur && typeof cur === "object"; i += 1) {
    const det = cur.details;
    if (det && typeof det === "object" && Array.isArray(det.agents) && det.agents.length > 0) {
      return det;
    }
    if (Array.isArray(cur.agents) && cur.agents.length > 0) {
      return cur;
    }
    if (det && typeof det === "object" && "agents" in det) {
      cur = det;
      continue;
    }
    const data = cur.data;
    if (data && typeof data === "object") {
      if (Array.isArray(data.agents) && data.agents.length > 0) {
        return data;
      }
      if ("agents" in data) {
        cur = data;
        continue;
      }
    }
    const c0 = Array.isArray(cur.content) ? cur.content[0] : null;
    if (c0 && typeof c0 === "object" && typeof c0.text === "string") {
      const t = c0.text.trim();
      if (t.startsWith("{") || t.startsWith("[")) {
        try {
          const parsed = JSON.parse(c0.text);
          if (parsed && typeof parsed === "object") {
            cur = parsed;
            continue;
          }
        } catch {
          /* ignore */
        }
      }
    }
    if (cur.result && typeof cur.result === "object") {
      cur = cur.result;
      continue;
    }
    break;
  }
  return cur && typeof cur === "object" && Array.isArray(cur.agents) && cur.agents.length > 0 ? cur : null;
}

/** 从 tools/invoke 的 result 中取出 Agent 行（数组或 `{ id: row }` 映射） */
function agentRowsFromToolInvoke(json) {
  if (!json || typeof json !== "object" || json.ok === false) return [];
  const inner = unwrapToolsInvokeAgentListResult(json.result) ?? json.result;
  if (!inner || typeof inner !== "object") return extractAgentArray(json);
  if (Array.isArray(inner.agents)) return inner.agents;
  if (inner.agents && typeof inner.agents === "object" && !Array.isArray(inner.agents)) {
    return objectMapToAgentRows(inner.agents);
  }
  return extractAgentArray(json);
}

async function postOpenClawToolsInvoke(baseUrl, apiKey, payload) {
  const root = String(baseUrl ?? "").replace(/\/+$/, "");
  const paths = ["/tools/invoke", "/api/tools/invoke"];
  let lastErr = null;
  for (const path of paths) {
    const url = `${root}${path}`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await resp.text().catch(() => "");
      if (!resp.ok) {
        let hint = String(text ?? "").trim().replace(/\s+/g, " ").slice(0, 240);
        if (hint.startsWith("{")) {
          try {
            const j = JSON.parse(text);
            if (j?.error && typeof j.error === "object" && j.error.message) {
              hint = String(j.error.message);
            } else if (typeof j?.error === "string") {
              hint = j.error;
            }
          } catch {
            /* keep hint */
          }
        }
        lastErr = new Error(`${path} → HTTP ${resp.status}${hint ? `: ${hint}` : ""}`);
        /** OpenClaw 对「工具不存在」返回 JSON 404；不应再请求 `/api/tools/invoke`（官方仅挂载 `/tools/invoke`，否则会多一条误导性 404） */
        if (
          resp.status === 404 &&
          /Tool not available/i.test(hint) &&
          path === "/tools/invoke"
        ) {
          break;
        }
        continue;
      }
      const json = parseOpenClawJsonBody(text, path);
      return json;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error("POST /tools/invoke 失败");
}

async function fetchAgentsListViaToolsInvoke(baseUrl, apiKey) {
  const cfgAid = pickStr(getConfig().agentId) || "sre";
  const byId = new Map();
  for (const sessionKey of [undefined, `agent:${cfgAid}:main`]) {
    try {
      const payload = { tool: "agents_list", action: "json", args: {} };
      if (sessionKey) payload.sessionKey = sessionKey;
      const json = await postOpenClawToolsInvoke(baseUrl, apiKey, payload);
      if (!json || typeof json !== "object" || json.ok === false) continue;
      const rows = agentRowsFromToolInvoke(json);
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const id = resolveAgentId(row);
        if (!id || byId.has(id)) continue;
        byId.set(id, row);
      }
    } catch {
      /* 试下一 sessionKey */
    }
  }
  return Array.from(byId.values());
}

async function fetchJsonWithAuth(baseUrl, path, apiKey) {
  const url = `${baseUrl}${path}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8_000),
  });
  const text = await resp.text().catch(() => "");
  if (!resp.ok) {
    throw new Error(`${path} ${resp.status}: ${text.slice(0, 200)}`);
  }
  // 勿用 resp.json()：Gateway 误配或路径落到 SPA 时常为 200+HTML，会抛出 Unexpected token '<'
  return parseOpenClawJsonBody(text, path);
}

async function fetchOpenClawAgents() {
  const now = Date.now();
  if (_agentsCache && now - _agentsCacheTs < AGENTS_CACHE_TTL) {
    return _agentsCache;
  }

  const { baseUrl, apiKey } = getConfig();

  /** @type {unknown[]} */
  let rawList = [];
  let lastErr = null;
  let hadHttpSuccess = false;
  const gateway = isOpenClawGatewayBaseUrl(baseUrl);

  // Gateway：GET /v1/agents、/v1/status 常返回 SPA HTML；优先走 tools/invoke（与 Chat 同源）
  if (gateway) {
    try {
      const fromTools = await fetchAgentsListViaToolsInvoke(baseUrl, apiKey);
      if (fromTools.length > 0) {
        rawList = fromTools;
        hadHttpSuccess = true;
        lastErr = null;
      }
    } catch (e) {
      lastErr = e;
    }
  }

  const tryPaths = [
    "/api/v1/agents?limit=100",
    "/api/v1/agents",
    "/v1/agents?limit=100",
    "/v1/agents",
  ];

  if (rawList.length === 0) {
    const settled = await Promise.allSettled(
      tryPaths.map((path) => fetchJsonWithAuth(baseUrl, path, apiKey)),
    );
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled") {
        hadHttpSuccess = true;
        const list = extractAgentArray(r.value);
        if (list.length > 0) {
          rawList = list;
          break;
        }
      } else {
        lastErr = r.reason;
      }
    }
  }

  if (rawList.length === 0) {
    try {
      const statusJson = await fetchOpenClawGetFirstJson(
        baseUrl,
        ["/api/v1/status", "/v1/status", "/api/v1/status?limit=200", "/v1/status?limit=200"],
        apiKey,
      );
      hadHttpSuccess = true;
      rawList = extractAgentArray(statusJson);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/\b404\b/.test(msg)) {
        lastErr = e;
      }
    }
  }

  if (rawList.length === 0 && !gateway) {
    try {
      const fromTools = await fetchAgentsListViaToolsInvoke(baseUrl, apiKey);
      if (fromTools.length > 0) {
        rawList = fromTools;
        hadHttpSuccess = true;
        lastErr = null;
      }
    } catch (e) {
      lastErr = lastErr ?? e;
    }
  }

  const seen = new Set();
  const agents = [];
  for (const row of rawList) {
    const m = mapOpenClawAgent(row);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    agents.push(m);
  }

  const out = { agents };
  if (agents.length === 0 && lastErr) {
    const base =
      lastErr instanceof Error ? lastErr.message : String(lastErr);
    out.error =
      `${base} 已尝试${gateway ? " POST /tools/invoke agents_list（优先）、" : ""}` +
      "GET /api/v1/agents、/v1/agents、status" +
      `${gateway ? "" : " 及 POST /tools/invoke agents_list"}。` +
      "若仍为空，请确认 OPENCLAW_API_URL 为 Gateway 根（如 :18789）、OPENCLAW_API_KEY 有效，且策略允许 agents_list。";
  }

  // 失败且无数据时不写入缓存，避免 30s 内一直返回空 + 旧错误
  if (agents.length > 0 || !out.error) {
    _agentsCache = out;
    _agentsCacheTs = now;
  }
  return out;
}

/** 响应体：`{ agents: { id, label, status?, description? }[], error?: string }` */
export async function handleListAgents(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  try {
    const data = await fetchOpenClawAgents();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error("[sre-agent] list agents error:", err.message || err);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ agents: [], error: String(err.message || err) }));
  }
}

export function handleListAgentsMiddleware(req, res) {
  return handleListAgents(req, res);
}

/** 供路由层判断是否为「拉取 OpenClaw Agent 列表」 */
export function isOpenClawAgentsListPath(pathname) {
  return pathname === "/api/sre-agent/agents" || pathname === "/api/openclaw/agents";
}

// ─── GET /api/openclaw/sessions | GET /api/openclaw/sessions/:key（代理 Gateway）───

function requestPathname(raw) {
  const u = raw || "";
  const q = u.indexOf("?");
  const p = q >= 0 ? u.slice(0, q) : u;
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

/** 供路由层判断是否为 OpenClaw 会话列表或单条详情 */
export function isOpenClawSessionsPath(pathname) {
  if (!pathname) return false;
  if (pathname === "/api/openclaw/sessions") return true;
  return pathname.startsWith("/api/openclaw/sessions/");
}

function extractSessionsFromStatusJson(json) {
  if (!json || typeof json !== "object") return [];
  const keys = ["sessions", "items", "results", "data"];
  for (const k of keys) {
    const v = json[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object" && Array.isArray(v.sessions)) return v.sessions;
  }
  const nested = [json.status, json.gateway, json.data];
  for (const c of nested) {
    if (c && typeof c === "object") {
      for (const k of keys) {
        const v = c[k];
        if (Array.isArray(v)) return v;
      }
    }
  }
  return [];
}

/** Gateway 常把 sessions 做成 `{ [sessionKey]: { ... } }` 映射 */
function objectMapToSessionRows(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return Object.entries(obj).map(([key, v]) => {
    if (!v || typeof v !== "object") {
      return { sessionKey: key, key, id: key };
    }
    const sk =
      pickStr(v.sessionKey) ||
      pickStr(v.key) ||
      pickStr(v.session_id) ||
      pickStr(v.id) ||
      key;
    return { ...v, sessionKey: sk, key: sk };
  });
}

function extractSessionsArrayFromJson(json) {
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.sessions)) return json.sessions;
  if (json.sessions && typeof json.sessions === "object" && !Array.isArray(json.sessions)) {
    return objectMapToSessionRows(json.sessions);
  }
  if (json.details && typeof json.details === "object") {
    const d = json.details;
    if (Array.isArray(d.sessions)) return d.sessions;
    if (d.sessions && typeof d.sessions === "object" && !Array.isArray(d.sessions)) {
      return objectMapToSessionRows(d.sessions);
    }
  }
  const nested = [json.data, json.items, json.results, json.status, json.gateway, json.payload];
  for (const c of nested) {
    if (!c || typeof c !== "object") continue;
    if (Array.isArray(c.sessions)) return c.sessions;
    if (c.sessions && typeof c.sessions === "object" && !Array.isArray(c.sessions)) {
      return objectMapToSessionRows(c.sessions);
    }
  }
  return [];
}

/** 解开 tools/invoke 里 sessions_list 的嵌套（details / content JSON / result） */
function unwrapToolsInvokeSessionListResult(result) {
  let cur = result;
  if (cur == null) return null;
  if (typeof cur === "string") {
    try {
      cur = JSON.parse(cur);
    } catch {
      return null;
    }
  }
  for (let i = 0; i < 8 && cur && typeof cur === "object"; i += 1) {
    const det = cur.details;
    if (det && typeof det === "object" && Array.isArray(det.sessions) && det.sessions.length > 0) {
      return det;
    }
    if (Array.isArray(cur.sessions) && cur.sessions.length > 0) {
      return cur;
    }
    if (det && typeof det === "object" && "sessions" in det) {
      cur = det;
      continue;
    }
    const data = cur.data;
    if (data && typeof data === "object") {
      if (Array.isArray(data.sessions) && data.sessions.length > 0) {
        return data;
      }
      if ("sessions" in data) {
        cur = data;
        continue;
      }
    }
    const c0 = Array.isArray(cur.content) ? cur.content[0] : null;
    if (c0 && typeof c0 === "object" && typeof c0.text === "string") {
      const t = c0.text.trim();
      if (t.startsWith("{") || t.startsWith("[")) {
        try {
          const parsed = JSON.parse(c0.text);
          if (parsed && typeof parsed === "object") {
            cur = parsed;
            continue;
          }
        } catch {
          /* ignore */
        }
      }
    }
    if (cur.payload && typeof cur.payload === "object" && ("sessions" in cur.payload || Array.isArray(cur.payload.sessions))) {
      cur = cur.payload;
      continue;
    }
    if (cur.result && typeof cur.result === "object") {
      cur = cur.result;
      continue;
    }
    break;
  }
  return cur && typeof cur === "object" ? cur : null;
}

function extractSessionsArrayFromDeepSearch(json) {
  const primary = extractSessionsArrayFromJson(json);
  let best = primary;
  const candidates = [];

  function walk(obj, depth) {
    if (depth > 16 || obj == null || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const el of obj) walk(el, depth + 1);
      return;
    }
    if ("sessions" in obj) {
      const v = obj.sessions;
      if (Array.isArray(v) && v.length) candidates.push(v);
      else if (v && typeof v === "object" && !Array.isArray(v)) {
        const rows = objectMapToSessionRows(v);
        if (rows.length) candidates.push(rows);
      }
    }
    for (const k of Object.keys(obj)) {
      walk(obj[k], depth + 1);
    }
  }

  walk(json, 0);
  for (const arr of candidates) {
    if (arr.length > best.length) best = arr;
  }
  return best;
}

function sessionsListArgsFromSearch(search) {
  const args = {};
  if (!search || search === "?") return args;
  try {
    const u = new URL(`http://placeholder${search}`);
    const limit = u.searchParams.get("limit");
    const activeMinutes = u.searchParams.get("activeMinutes");
    if (limit != null && String(limit).trim() !== "") {
      const n = Number(limit);
      args.limit = Number.isFinite(n) ? n : limit;
    }
    if (activeMinutes != null && String(activeMinutes).trim() !== "") {
      const n = Number(activeMinutes);
      args.activeMinutes = Number.isFinite(n) ? n : activeMinutes;
    }
  } catch {
    /* ignore */
  }
  return args;
}

function normalizeSessionsFromToolsInvokeBody(body) {
  if (!body || typeof body !== "object" || body.ok === false) return [];
  const root = unwrapToolsInvokeSessionListResult(body.result) ?? body.result;
  return extractSessionsArrayFromJson(root ?? {});
}

/** 与会话列表行上的 key 解析一致，供去重 / 推断 agent */
function pickSessionKeyFromRow(row) {
  if (!row || typeof row !== "object") return "";
  return (
    pickStr(row.key) ||
    pickStr(row.sessionKey) ||
    pickStr(row.session_key) ||
    pickStr(row.id) ||
    ""
  );
}

function inferAgentIdFromSessionRow(row) {
  if (!row || typeof row !== "object") return "";
  const tagged = pickStr(row._openclawListAgentId);
  if (tagged) return tagged;
  const k = pickSessionKeyFromRow(row);
  const m = /^agent:([^:]+):/.exec(k);
  return m && m[1] ? m[1] : "";
}

function sessionRowDedupeKey(row) {
  const k = pickSessionKeyFromRow(row);
  if (k) return `k:${k}`;
  const sid = pickStr(row.sessionId);
  if (sid) return `sid:${sid}`;
  const tp = pickStr(row.transcriptPath);
  if (tp) return `tp:${tp}`;
  const ch = pickStr(row.channel);
  const ua = row.updatedAt ?? row.updated_at ?? "";
  const mo = pickStr(row.model);
  return `misc:${ch}|${mo}|${ua}`;
}

function annotateSessionsListRowsWithAgent(rows, agentId) {
  if (!Array.isArray(rows) || !agentId) return rows;
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    if (inferAgentIdFromSessionRow(row)) return row;
    return { ...row, _openclawListAgentId: agentId };
  });
}

function mergeSessionRowsByKey(groups) {
  const map = new Map();
  for (const arr of groups) {
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      if (!row || typeof row !== "object") continue;
      const dk = sessionRowDedupeKey(row);
      if (!map.has(dk)) map.set(dk, row);
    }
  }
  return [...map.values()];
}

/**
 * 无 sessionKey 的 sessions_list 在 Gateway 上常只返回默认 main 域；对已注册但未出现在列表中的 agent
 * 再带 `sessionKey: agent:<id>:main` 拉取并合并（与单会话详情的 scope 约定一致）。
 */
async function mergeGatewaySessionsAllAgents(baseUrl, apiKey, baseArgs, sessionsSoFar) {
  if (!isOpenClawGatewayBaseUrl(baseUrl)) return sessionsSoFar;
  let merged = Array.isArray(sessionsSoFar) ? [...sessionsSoFar] : [];
  try {
    const { agents: agentRows = [] } = await fetchOpenClawAgents();
    const agentIds = [...new Set(agentRows.map((a) => pickStr(a?.id)).filter(Boolean))];
    if (agentIds.length === 0) return merged;

    const present = new Set();
    for (const row of merged) {
      const id = inferAgentIdFromSessionRow(row);
      if (id) present.add(id);
    }
    const missing = agentIds.filter((aid) => !present.has(aid));
    if (missing.length === 0) return merged;

    const extras = await Promise.all(
      missing.map(async (aid) => {
        try {
          const sk = `agent:${aid}:main`;
          const body = await invokeSessionsListLikeControlUi(baseUrl, apiKey, baseArgs, sk);
          const rows = normalizeSessionsFromToolsInvokeBody(body);
          return annotateSessionsListRowsWithAgent(rows, aid);
        } catch {
          return [];
        }
      }),
    );
    merged = mergeSessionRowsByKey([merged, ...extras]);
  } catch {
    /* 保持原列表 */
  }
  return merged;
}

async function invokeSessionsListLikeControlUi(baseUrl, apiKey, args, sessionKey) {
  const withGlobal = { ...args, includeGlobal: true, includeUnknown: true };
  try {
    const payload = {
      tool: "sessions_list",
      action: "json",
      args: withGlobal,
    };
    if (sessionKey) payload.sessionKey = sessionKey;
    const body = await postOpenClawToolsInvoke(baseUrl, apiKey, payload);
    if (body && typeof body === "object" && body.ok !== false) return body;
  } catch {
    /* schema 可能拒参 */
  }
  const payload = {
    tool: "sessions_list",
    action: "json",
    args,
  };
  if (sessionKey) payload.sessionKey = sessionKey;
  return postOpenClawToolsInvoke(baseUrl, apiKey, payload);
}

async function proxyOpenClawSessionsList(req, res) {
  const ru = new URL(req.url || "/", "http://127.0.0.1");
  const search = ru.search || "";
  const extraArgs = sessionsListArgsFromSearch(search);
  const limit = extraArgs.limit ?? 500;

  const sendResult = (sessions, _meta, error) => {
    const out = { sessions, _meta };
    if (error) out.error = error;
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(out));
  };

  try {
    const gwWs = getGatewayWsClient();
    const payload = await gwWs.request("sessions.list", { limit, ...extraArgs });
    // WS sessions.list 返回 { sessions, count, ts, defaults }
    const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
    sendResult(sessions, { source: "ws:sessions.list", count: payload?.count });
  } catch (err) {
    console.error("[sessions-list] WS request failed:", err?.message);
    sendResult([], { source: "ws:sessions.list:error" }, err?.message || String(err));
  }
}

/** tools/invoke 的 result 可能是 `{ details: { messages, … } }`（jsonResult/textResult） */
function unwrapToolsInvokeResultPayload(result) {
  if (result == null) return null;
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }
  if (typeof result !== "object") return null;
  if (result.details != null && typeof result.details === "object") {
    return result.details;
  }
  return result;
}

/** 把 sessions_history 的结果压成前端 `messagesFromOpenClawSessionDetail` 能吃的 `{ messages, … }` */
function sendJsonIfSessionHistoryPayload(sendJson, result) {
  const payload = unwrapToolsInvokeResultPayload(result);
  if (!payload || typeof payload !== "object") return false;
  if (payload.error && !Array.isArray(payload.messages)) return false;
  if (!Array.isArray(payload.messages)) return false;
  sendJson(200, {
    sessionKey: payload.sessionKey,
    messages: payload.messages,
    truncated: payload.truncated,
    droppedMessages: payload.droppedMessages,
    contentTruncated: payload.contentTruncated,
    contentRedacted: payload.contentRedacted,
    bytes: payload.bytes,
  });
  return true;
}

async function proxyOpenClawSessionDetail(req, res, sessionKeyUrlSegment) {
  const key = decodeURIComponent(String(sessionKeyUrlSegment ?? "").trim());

  const sendJson = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };

  if (!key) {
    sendJson(400, { error: "缺少 session key" });
    return;
  }

  try {
    const gwWs = getGatewayWsClient();
    // WS chat.history 返回 { messages: [...] }（与前端 messagesFromOpenClawSessionDetail 兼容）
    const payload = await gwWs.request("chat.history", { sessionKey: key });
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    sendJson(200, { messages, sessionKey: key });
  } catch (err) {
    console.error("[session-detail] WS chat.history failed:", err?.message);
    sendJson(200, {
      messages: [],
      error: err?.message || "未能通过 WS 加载会话详情（chat.history 失败）。",
    });
  }
}

/**
 * GET /api/openclaw/sessions — 列表（tools/invoke sessions_list + status 兜底）
 * GET /api/openclaw/sessions/:key — 详情（GET /sessions/:key/history → sessions_history；解析 result.details.messages）
 */
export async function handleOpenClawSessions(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Method not allowed. Use GET." }));
    return;
  }

  const path = requestPathname(req.url || "");
  if (path === "/api/openclaw/sessions") {
    await proxyOpenClawSessionsList(req, res);
    return;
  }
  const prefix = "/api/openclaw/sessions/";
  if (path.startsWith(prefix)) {
    await proxyOpenClawSessionDetail(req, res, path.slice(prefix.length));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "Not found" }));
}

export function handleOpenClawSessionsMiddleware(req, res) {
  return handleOpenClawSessions(req, res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
