/**
 * OpenClaw Gateway WebSocket 客户端（单例）
 *
 * 负责与 OpenClaw Gateway /ws 端点保持持久连接，提供：
 *   - Promise 化的 request(method, params) API
 *   - 事件订阅 addEventHandler / removeEventHandler
 *   - 自动重连（指数退避）
 *
 * 认证要点：
 *   - WS Upgrade 请求需携带 Origin: http://<openclaw-host> 头
 *   - connect 握手时使用 client id "openclaw-control-ui" + OPENCLAW_API_KEY
 */

import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
let WebSocket;
try {
  ({ WebSocket } = require("ws"));
} catch {
  // Node 22+ 内置 WebSocket
  WebSocket = globalThis.WebSocket;
}

// ─── 配置 ─────────────────────────────────────────────────────────────────────

function getGatewayConfig() {
  const raw = process.env.OPENCLAW_API_URL || "http://localhost:18789";
  const base = raw.replace(/\/+$/, "");
  const apiKey = process.env.OPENCLAW_API_KEY || "";

  // http(s):// → ws(s)://
  const wsUrl = base.replace(/^http(s)?:\/\//, (_, s) => `ws${s || ""}://`) + "/ws";

  // Origin 头需与 Gateway 的 controlUi.allowedOrigins 匹配（allowInsecureAuth 下本机 http 均可）
  const originUrl = base.replace(/^ws(s)?:\/\//, (_, s) => `http${s || ""}://`);

  return { wsUrl, originUrl, apiKey };
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const CONNECT_CLIENT = {
  id: "openclaw-control-ui",
  mode: "webchat",
  platform: "node",
  version: "1.0",
};
const CONNECT_SCOPES = ["operator.admin", "operator.read", "operator.write"];

// ─── GatewayWsClient ──────────────────────────────────────────────────────────

class GatewayWsClient {
  constructor() {
    /** @type {import("ws").WebSocket | null} */
    this._ws = null;
    this._instanceId = randomUUID();
    this._reqId = 0;
    /** @type {Map<string, { resolve: Function; reject: Function; timer: NodeJS.Timeout }>} */
    this._pending = new Map();
    /** @type {Map<string, Set<Function>>} 事件名 → 处理函数集合 */
    this._eventHandlers = new Map();
    this._reconnectTimer = null;
    this._reconnectAttempt = 0;
    this._destroyed = false;
    this._connectReady = false; // challenge/connect 握手完成
    this._connectResolvers = []; // 等待握手完成的 resolve 队列
    this._connecting = false;
  }

  // ─── 公共 API ──────────────────────────────────────────────────────────────

  /**
   * 发送一次请求并等待对应响应。
   * @param {string} method
   * @param {object} params
   * @returns {Promise<any>} payload
   */
  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      this._ensureConnected()
        .then(() => {
          if (!this._ws || this._ws.readyState !== 1 /* OPEN */) {
            reject(new Error("Gateway WS not connected"));
            return;
          }
          const id = String(++this._reqId);
          const timer = setTimeout(() => {
            this._pending.delete(id);
            reject(new Error(`Gateway WS request timed out: ${method}`));
          }, REQUEST_TIMEOUT_MS);

          this._pending.set(id, { resolve, reject, timer });
          this._wsSend({ type: "req", id, method, params });
        })
        .catch(reject);
    });
  }

  /**
   * 注册 OpenClaw Gateway 事件处理器。
   * @param {string} eventName  如 "session.message"、"agent"
   * @param {Function} handler  接收 payload 的函数
   */
  addEventHandler(eventName, handler) {
    if (!this._eventHandlers.has(eventName)) {
      this._eventHandlers.set(eventName, new Set());
    }
    this._eventHandlers.get(eventName).add(handler);
    this._ensureConnected().catch(() => {});
  }

  /**
   * 移除事件处理器。
   * @param {string} eventName
   * @param {Function} handler
   */
  removeEventHandler(eventName, handler) {
    this._eventHandlers.get(eventName)?.delete(handler);
  }

  /** 关闭连接并停止重连。 */
  destroy() {
    this._destroyed = true;
    clearTimeout(this._reconnectTimer);
    this._ws?.close();
    this._rejectAllPending(new Error("GatewayWsClient destroyed"));
  }

  // ─── 内部：连接管理 ────────────────────────────────────────────────────────

  /**
   * 确保已连接（包括握手完成），返回 Promise。
   * 多次并发调用安全。
   */
  _ensureConnected() {
    if (this._connectReady && this._ws?.readyState === 1) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this._connectResolvers.push({ resolve, reject });
      if (!this._connecting) {
        this._connect();
      }
    });
  }

  _connect() {
    if (this._destroyed) return;
    this._connecting = true;
    this._connectReady = false;

    const { wsUrl, originUrl, apiKey } = getGatewayConfig();
    console.log(`[gateway-ws] connecting to ${wsUrl}`);

    let ws;
    try {
      ws = new WebSocket(wsUrl, { headers: { Origin: originUrl } });
    } catch (e) {
      console.error("[gateway-ws] WebSocket init error:", e?.message);
      this._scheduleReconnect();
      return;
    }

    this._ws = ws;

    ws.on("open", () => {
      console.log("[gateway-ws] connected");
      // 等待 connect.challenge 事件，不在此处直接握手
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      this._onMessage(msg, apiKey);
    });

    ws.on("close", (code, reason) => {
      const r = reason?.toString?.() || "";
      console.warn(`[gateway-ws] closed code=${code} ${r}`);
      this._connectReady = false;
      this._connecting = false;
      this._rejectAllPending(new Error(`Gateway WS closed: ${code} ${r}`));
      this._rejectConnectResolvers(new Error(`Gateway WS closed: ${code} ${r}`));
      if (!this._destroyed) {
        this._scheduleReconnect();
      }
    });

    ws.on("error", (err) => {
      console.error("[gateway-ws] error:", err?.message);
      // close event will follow
    });
  }

  _onMessage(msg, apiKey) {
    if (msg.type === "event") {
      const ev = msg.event;

      // 处理 connect.challenge
      if (ev === "connect.challenge") {
        this._sendConnectHandshake(apiKey, msg.payload?.nonce);
        return;
      }

      // 分发到业务事件处理器
      const handlers = this._eventHandlers.get(ev);
      if (handlers?.size) {
        for (const h of handlers) {
          try {
            h(msg.payload, msg);
          } catch (e) {
            console.error("[gateway-ws] event handler error:", e?.message);
          }
        }
      }
      return;
    }

    if (msg.type === "res") {
      const entry = this._pending.get(msg.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this._pending.delete(msg.id);

      if (msg.ok) {
        entry.resolve(msg.payload);
      } else {
        const err = new Error(msg.error?.message || "Gateway WS request failed");
        err.code = msg.error?.code;
        err.details = msg.error?.details;
        entry.reject(err);
      }
    }
  }

  _sendConnectHandshake(apiKey, _nonce) {
    const id = "__connect__";
    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: { ...CONNECT_CLIENT, instanceId: this._instanceId },
      role: "operator",
      scopes: CONNECT_SCOPES,
      caps: ["tool-events"],
      auth: { token: apiKey },
      userAgent: "Node.js/openclaw-observability-platform",
      locale: "zh-CN",
    };

    this._wsSend({ type: "req", id, method: "connect", params });

    // 为握手包注册一次性响应监听（重写 message handler 不方便，改用 pending map 特殊处理）
    const timer = setTimeout(() => {
      this._pending.delete(id);
      const err = new Error("Gateway WS connect handshake timed out");
      this._rejectConnectResolvers(err);
      this._scheduleReconnect();
    }, 15_000);

    this._pending.set(id, {
      resolve: (payload) => {
        clearTimeout(timer);
        this._pending.delete(id);
        this._connectReady = true;
        this._reconnectAttempt = 0;
        console.log(
          `[gateway-ws] authenticated. server=${payload?.server?.version ?? "?"}`
        );
        this._resolveConnectResolvers();
      },
      reject: (err) => {
        clearTimeout(timer);
        this._pending.delete(id);
        console.error("[gateway-ws] connect handshake failed:", err?.message);
        this._rejectConnectResolvers(err);
        this._ws?.close();
      },
      timer,
    });
  }

  _wsSend(obj) {
    if (this._ws?.readyState === 1) {
      try {
        this._ws.send(JSON.stringify(obj));
      } catch (e) {
        console.error("[gateway-ws] send error:", e?.message);
      }
    }
  }

  _scheduleReconnect() {
    if (this._destroyed) return;
    this._connecting = false;
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this._reconnectAttempt,
      RECONNECT_MAX_MS
    );
    this._reconnectAttempt++;
    console.log(`[gateway-ws] reconnecting in ${delay}ms (attempt ${this._reconnectAttempt})`);
    this._reconnectTimer = setTimeout(() => {
      if (!this._destroyed) this._connect();
    }, delay);
  }

  _resolveConnectResolvers() {
    const q = this._connectResolvers.splice(0);
    for (const { resolve } of q) resolve();
  }

  _rejectConnectResolvers(err) {
    const q = this._connectResolvers.splice(0);
    for (const { reject } of q) reject(err);
  }

  _rejectAllPending(err) {
    for (const [id, entry] of this._pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this._pending.clear();
  }
}

// ─── 单例 ─────────────────────────────────────────────────────────────────────

/** @type {GatewayWsClient} */
let _client = null;

/**
 * 获取全局单例 Gateway WS 客户端。
 * 首次调用时自动建立连接。
 * @returns {GatewayWsClient}
 */
export function getGatewayWsClient() {
  if (!_client || _client._destroyed) {
    _client = new GatewayWsClient();
    // 启动时主动触发连接，不等待第一次 request
    _client._ensureConnected().catch((e) => {
      console.warn("[gateway-ws] initial connect failed:", e?.message);
    });
  }
  return _client;
}

/**
 * 销毁单例（测试或热重载时使用）。
 */
export function destroyGatewayWsClient() {
  _client?.destroy();
  _client = null;
}
