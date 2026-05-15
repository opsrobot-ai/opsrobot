/**
 * GET /api/sre-agent/viz-json?path=...
 * 读取本机 OpenClaw 报告目录下的可视化 JSON（供前端右侧工作区渲染）。
 * GET /api/sre-agent/report-md?path=...
 * 读取同上根目录下、文件名以 final_report.md 结尾的 Markdown（供右侧报告预览）。
 * 仅允许路径落在 ~/.openclaw 或 OPENCLAW_VIZ_ALLOWED_ROOT 之下。
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export function isSreVizJsonPath(pathname) {
  return pathname === "/api/sre-agent/viz-json";
}

export function isSreReportMdPath(pathname) {
  return pathname === "/api/sre-agent/report-md";
}

export function isSreOpenclawFilePath(pathname) {
  return pathname === "/api/sre-agent/openclaw-file";
}

/** 嵌套解析：允许读小的文本/json 产物（须在 .openclaw 或 OPENCLAW_VIZ_ALLOWED_ROOT 下） */
const MAX_ARTIFACT_BYTES = 12 * 1024 * 1024;
const ARTIFACT_EXT_RE = /\.(json|md|txt|ya?ml|log|csv|xml)$/i;

function isAllowedArtifactFile(realPath) {
  if (!ARTIFACT_EXT_RE.test(realPath)) return false;
  try {
    const st = fs.statSync(realPath);
    if (!st.isFile() || st.size > MAX_ARTIFACT_BYTES) return false;
  } catch {
    return false;
  }
  return true;
}

function resolveAllowedOpenclawArtifactFile(inputPath) {
  const expanded = expandUserPath(inputPath);
  if (!expanded) return null;
  const resolved = path.resolve(expanded);
  return resolveUnderOpenclawRoots(resolved, isAllowedArtifactFile);
}

function expandUserPath(p) {
  const s = String(p ?? "").trim();
  if (!s || s.includes("\0")) return "";
  if (s.startsWith("~/")) return path.join(os.homedir(), s.slice(2));
  if (s === "~") return os.homedir();
  return s;
}

function collectAllowedRoots() {
  const roots = [path.resolve(os.homedir(), ".openclaw")];
  const extra = process.env.OPENCLAW_VIZ_ALLOWED_ROOT;
  if (extra && String(extra).trim()) {
    roots.push(path.resolve(String(extra).trim()));
  }
  return roots;
}

function isPathUnderRoot(fileAbs, rootAbs) {
  const rel = path.relative(rootAbs, fileAbs);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function resolveUnderOpenclawRoots(resolvedAbs, filePredicate) {
  let realPath = resolvedAbs;
  try {
    realPath = fs.realpathSync(resolvedAbs);
  } catch {
    return null;
  }
  if (!filePredicate(realPath)) return null;
  const roots = collectAllowedRoots();
  for (const root of roots) {
    let rootReal = root;
    try {
      rootReal = fs.realpathSync(root);
    } catch {
      continue;
    }
    if (isPathUnderRoot(realPath, rootReal)) return realPath;
  }
  return null;
}

function resolveAllowedJsonFile(inputPath) {
  const expanded = expandUserPath(inputPath);
  if (!expanded) return null;
  const resolved = path.resolve(expanded);
  return resolveUnderOpenclawRoots(resolved, (realPath) => realPath.toLowerCase().endsWith(".json"));
}

const SRE_ALLOWED_MD_SUFFIXES = [
  "_stage1_perception_report.md",
  "_stage2_analysis_report.md",
  "_stage3_reasoning_report.md",
  "_stage4_execution_report.md",
  "_final_report.md",
];

function isSreReportMdSuffix(p) {
  const low = p.toLowerCase();
  return SRE_ALLOWED_MD_SUFFIXES.some((s) => low.endsWith(s));
}

function resolveAllowedSreReportMdFile(inputPath) {
  const expanded = expandUserPath(inputPath);
  if (!expanded) return null;
  const resolved = path.resolve(expanded);
  return resolveUnderOpenclawRoots(resolved, isSreReportMdSuffix);
}

function sendJson(res, status, body) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  if (!res.headersSent) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  }
  res.end(payload);
}

export async function handleSreReportMdRead(req, res, rawUrl) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed. Use GET." });
    return;
  }

  let filePath = "";
  try {
    const u = new URL(rawUrl || "", "http://127.0.0.1");
    filePath = u.searchParams.get("path") || u.searchParams.get("p") || "";
  } catch {
    sendJson(res, 400, { error: "Invalid URL" });
    return;
  }

  if (!filePath.trim()) {
    sendJson(res, 400, { error: "Missing query parameter: path" });
    return;
  }

  const safe = resolveAllowedSreReportMdFile(filePath);
  if (!safe) {
    sendJson(res, 403, { error: "Path not allowed or file not found" });
    return;
  }

  try {
    const markdown = await fsp.readFile(safe, "utf8");
    const base = path.basename(safe).replace(/\.md$/i, "") || "最终报告";
    sendJson(res, 200, { markdown, title: base });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendJson(res, 500, { error: msg });
  }
}

/**
 * GET /api/sre-agent/openclaw-file?path=...
 * 返回 { ok, kind: 'json'|'text', data?, text? } 或 { ok:false, error }
 */
export async function handleSreOpenclawFileRead(req, res, rawUrl) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed. Use GET." });
    return;
  }

  let filePath = "";
  try {
    const u = new URL(rawUrl || "", "http://127.0.0.1");
    filePath = u.searchParams.get("path") || u.searchParams.get("p") || "";
  } catch {
    sendJson(res, 400, { ok: false, error: "Invalid URL" });
    return;
  }

  if (!filePath.trim()) {
    sendJson(res, 400, { ok: false, error: "Missing query parameter: path" });
    return;
  }

  const safe = resolveAllowedOpenclawArtifactFile(filePath);
  if (!safe) {
    sendJson(res, 403, { ok: false, error: "Path not allowed or file not found" });
    return;
  }

  try {
    const text = await fsp.readFile(safe, "utf8");
    const low = safe.toLowerCase();
    if (low.endsWith(".json")) {
      try {
        const data = JSON.parse(text);
        sendJson(res, 200, { ok: true, kind: "json", path: safe, data });
      } catch {
        sendJson(res, 200, { ok: true, kind: "text", path: safe, text });
      }
    } else {
      sendJson(res, 200, { ok: true, kind: "text", path: safe, text });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendJson(res, 500, { ok: false, error: msg });
  }
}

export function handleSreOpenclawFileMiddleware(req, res) {
  const rawUrl = req.url || "";
  return handleSreOpenclawFileRead(req, res, rawUrl);
}

export async function handleSreVizFileRead(req, res, rawUrl) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed. Use GET." });
    return;
  }

  let filePath = "";
  try {
    const u = new URL(rawUrl || "", "http://127.0.0.1");
    filePath = u.searchParams.get("path") || u.searchParams.get("p") || "";
  } catch {
    sendJson(res, 400, { error: "Invalid URL" });
    return;
  }

  if (!filePath.trim()) {
    sendJson(res, 400, { error: "Missing query parameter: path" });
    return;
  }

  const safe = resolveAllowedJsonFile(filePath);
  if (!safe) {
    sendJson(res, 403, { error: "Path not allowed or file not found" });
    return;
  }

  try {
    const text = await fsp.readFile(safe, "utf8");
    const json = JSON.parse(text);
    sendJson(res, 200, json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendJson(res, 500, { error: msg });
  }
}

export function handleSreVizFileMiddleware(req, res) {
  const rawUrl = req.url || "";
  return handleSreVizFileRead(req, res, rawUrl);
}

export function handleSreReportMdMiddleware(req, res) {
  const rawUrl = req.url || "";
  return handleSreReportMdRead(req, res, rawUrl);
}
