/**
 * stage1_trace_flamegraph：链路树 + 时长条（与 AG viz trace_call_chain 独立 schema）
 */

const TYPE = "stage1_trace_flamegraph";

/** @param {unknown} o */
export function isStage1TraceFlamegraphPayload(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  if (String(o.type || "").toLowerCase() !== TYPE) return false;
  const tr = o.trace_root;
  if (!tr || typeof tr !== "object" || Array.isArray(tr)) return false;
  return typeof tr.span_id === "string" || typeof tr.service === "string" || Number.isFinite(Number(tr.duration_ms));
}

/** @param {unknown} node */
export function maxDurationInTraceTree(node, acc = 0) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return acc;
  const d = Number(node.duration_ms);
  const v = Number.isFinite(d) ? d : 0;
  let m = Math.max(acc, v);
  const kids = node.children;
  if (Array.isArray(kids)) {
    for (const c of kids) {
      m = maxDurationInTraceTree(c, m);
    }
  }
  return m;
}

/** @param {unknown} node */
export function traceTreeScaleMs(traceRoot) {
  if (!traceRoot || typeof traceRoot !== "object") return 1;
  const rootDur = Number(traceRoot.duration_ms);
  const fromRoot = Number.isFinite(rootDur) && rootDur > 0 ? rootDur : 0;
  const fromTree = maxDurationInTraceTree(traceRoot, 0);
  const s = Math.max(fromRoot, fromTree, 1);
  return s;
}
