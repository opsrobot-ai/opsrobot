/**
 * 将 stage1_trace_flamegraph 的树形 payload 转为按「服务泳道索引」分行的时间轴布局模型。
 * 左侧泳道名称可由视图选择性绘制；连线与服务配色仍依赖 lanes。
 */

import { traceTreeScaleMs } from "./sreStage1TraceFlamegraph.js";

const SERVICE_PALETTE = ["#3b82f6", "#f97316", "#ef4444", "#22c55e", "#8b5cf6", "#06b6d4", "#64748b"];

/** @param {string} service @param {number} index */
function stripeColorForService(service, index) {
  const s = String(service || "").trim();
  let h = index;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SERVICE_PALETTE[h % SERVICE_PALETTE.length];
}

/** @param {unknown} node */
function finiteDur(node) {
  const d = Number(node?.duration_ms);
  return Number.isFinite(d) ? Math.max(0, d) : 0;
}

/**
 * @param {unknown[]} children
 * @param {number} windowStart
 * @param {number} windowEnd
 */
function packChildrenWindows(children, windowStart, windowEnd) {
  const windowLen = Math.max(windowEnd - windowStart, 1);
  const durs = children.map((c) => Math.max(finiteDur(c), 1));
  const sum = durs.reduce((a, b) => a + b, 0);
  const scale = sum > windowLen ? windowLen / sum : 1;
  let cursor = windowStart;
  /** @type {{ start: number; end: number }[]} */
  const out = [];
  for (let i = 0; i < children.length; i++) {
    const segLen = durs[i] * scale;
    const start = cursor;
    const end = cursor + segLen;
    out.push({ start, end });
    cursor = end;
  }
  return out;
}

/** @param {unknown} node */
function isAsyncSpan(node) {
  if (!node || typeof node !== "object") return false;
  if (node.async === true) return true;
  const k = String(node.span_kind || node.kind || "").toLowerCase();
  if (k === "async" || k === "async_outline") return true;
  const op = String(node.operation || "").toLowerCase();
  return /_async\b|\basync\b/.test(op);
}

/** @param {unknown} node */
function statusBucket(node) {
  const s = String(node?.status || "").toUpperCase();
  if (s === "ERROR" || s === "FAILED") return "error";
  if (s === "TIMEOUT" || s === "DEADLINE") return "timeout";
  return "ok";
}

/** @param {unknown} node @param {string} serviceFallbackHex */
function barFillForNode(node, serviceFallbackHex) {
  const c = typeof node?.color === "string" ? node.color.trim() : "";
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
  const st = statusBucket(node);
  if (st === "error") return "#ef4444";
  if (st === "timeout") return "#f97316";
  return serviceFallbackHex;
}

/**
 * @param {object} traceRoot
 */
export function buildTraceWaterfallLayout(traceRoot) {
  const rootDur = Math.max(finiteDur(traceRoot), 1);
  const timelineEnd = Math.max(traceTreeScaleMs(traceRoot), rootDur);

  const anchorRaw = traceRoot?.start_time;
  const anchorMs =
    anchorRaw != null
      ? typeof anchorRaw === "number"
        ? anchorRaw
        : Date.parse(String(anchorRaw))
      : NaN;
  const rootAnchor = Number.isFinite(anchorMs) ? anchorMs : null;

  /** @type {Map<string, number>} */
  const laneIndex = new Map();
  /** @type {{ label: string; stripe_color: string }[]} */
  const lanes = [];

  function laneFor(service) {
    const lab = String(service ?? "—").trim() || "—";
    if (!laneIndex.has(lab)) {
      const idx = lanes.length;
      laneIndex.set(lab, idx);
      lanes.push({ label: lab, stripe_color: stripeColorForService(lab, idx) });
    }
    return /** @type {number} */ (laneIndex.get(lab));
  }

  /** @type {Array<{ id: string; parentId: string | null; node: object; start_ms: number; end_ms: number; lane_index: number }>} */
  const flat = [];

  /**
   * @param {object} node
   * @param {string | null} parentId
   * @param {number} segStart
   * @param {number} segEnd
   */
  function walk(node, parentId, segStart, segEnd) {
    if (!node || typeof node !== "object") return;
    const id = String(node.span_id ?? `span-${flat.length}`);
    const lane_index = laneFor(node.service);
    flat.push({
      id,
      parentId,
      node,
      start_ms: segStart,
      end_ms: segEnd,
      lane_index,
    });

    const kids = Array.isArray(node.children) ? node.children : [];
    if (!kids.length) return;

    const placements = packChildrenWindows(kids, segStart, segEnd);
    kids.forEach((ch, i) => {
      const slot = placements[i] ?? { start: segStart, end: segEnd };
      walk(ch, id, slot.start, slot.end);
    });
  }

  walk(traceRoot, null, 0, rootDur);

  const labelColumnWidth = 0;
  const laneStripeWidth = 0;
  const plotMarginLeft = 12;
  const plotLeft = plotMarginLeft;
  /** 原左侧泳道宽度让给时间轴绘图区 */
  const plotWidth = 632;
  const plotRight = plotLeft + plotWidth;
  const rulerY = 16;
  const firstLaneYTop = 30;
  const laneBandHeight = 42;
  const barHeight = 26;
  const axisBottom = firstLaneYTop + lanes.length * laneBandHeight;

  const spans = flat.map((s) => {
    const node = s.node;
    const stripe = lanes[s.lane_index]?.stripe_color ?? "#64748b";
    const asyncSpan = isAsyncSpan(node);
    const fill = barFillForNode(node, stripe);
    const st = statusBucket(node);
    const alert =
      st === "error" || st === "timeout" ? { at_ms: s.end_ms, char: "!" } : null;
    const op = String(node.operation || "").trim();
    const svc = String(node.service || "").trim();
    const bar_label = op || svc || "—";
    const title_lines = [
      svc && op ? `${svc} · ${op}` : bar_label,
      `duration: ${finiteDur(node)}ms`,
      node.span_id ? `span_id: ${node.span_id}` : "",
      node.status ? `status: ${node.status}` : "",
    ].filter(Boolean);

    return {
      id: s.id,
      parentId: s.parentId,
      lane_index: s.lane_index,
      start_ms: s.start_ms,
      end_ms: s.end_ms,
      bar_label,
      fill,
      stroke: stripe,
      kind: asyncSpan ? /** @type {"async_outline"} */ ("async_outline") : /** @type {"solid"} */ ("solid"),
      alert_mark: alert,
      title_lines,
    };
  });

  /** @type {Map<string, (typeof spans)[0]>} */
  const spanById = new Map(spans.map((x) => [x.id, x]));

  /** 同一父 span 的多条出边：沿父条时间宽度分散锚点，避免重叠与「横穿整张图」的水平段叠在一起 */
  const edges = [];
  /** @type {Map<string, typeof spans>} */
  const childrenByParent = new Map();
  for (const s of spans) {
    if (!s.parentId) continue;
    if (!childrenByParent.has(s.parentId)) childrenByParent.set(s.parentId, []);
    childrenByParent.get(s.parentId)?.push(s);
  }
  for (const [parentId, kids] of childrenByParent) {
    const parentSpan = spanById.get(parentId);
    if (!parentSpan || !kids?.length) continue;
    kids.sort((a, b) => a.start_ms - b.start_ms);
    const n = kids.length;
    const pw = Math.max(parentSpan.end_ms - parentSpan.start_ms, 1);
    const margin = 0.08;
    kids.forEach((child, i) => {
      let t;
      if (n === 1) {
        t = 0.12;
      } else {
        t = margin + (i / Math.max(n - 1, 1)) * (1 - 2 * margin);
      }
      const spreadPos = parentSpan.start_ms + t * pw;
      /** 与时间对齐：锚点向子 span 起点在父条上的投影靠拢，减少横跨画面的弧线 */
      const ideal = Math.min(
        Math.max(child.start_ms, parentSpan.start_ms),
        parentSpan.end_ms - Math.min(1, pw * 0.02),
      );
      const blended = spreadPos * 0.38 + ideal * 0.62;
      const from_ms = Math.min(
        Math.max(blended, parentSpan.start_ms),
        parentSpan.end_ms - Math.min(1, pw * 0.02),
      );
      edges.push({
        from_ms,
        from_lane_index: parentSpan.lane_index,
        to_ms: child.start_ms,
        to_lane_index: child.lane_index,
        dashed: child.kind === "async_outline",
      });
    });
  }

  const tickCount = 5;
  const time_axis_ticks = [];
  for (let i = 0; i < tickCount; i++) {
    const t_frac = tickCount === 1 ? 0 : i / (tickCount - 1);
    let label;
    if (rootAnchor != null) {
      const ms = rootAnchor + t_frac * timelineEnd;
      const d = new Date(ms);
      label = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
    } else {
      label = `${Math.round(t_frac * timelineEnd)}ms`;
    }
    time_axis_ticks.push({ t_frac, label });
  }

  const viewbox_width = plotRight + 16;
  /** 底部留白：同泳道正交走线经过泳道间隙时可能略低于最后一根 span */
  const viewbox_height = axisBottom + 20;

  return {
    timeMinMs: 0,
    timeMaxMs: timelineEnd,
    rootAnchorMs: rootAnchor,
    lanes,
    spans,
    edges,
    layout: {
      viewbox_width,
      viewbox_height,
      plot_left: plotLeft,
      plot_right: plotRight,
      ruler_y: rulerY,
      axis_bottom: axisBottom,
      first_lane_y_top: firstLaneYTop,
      lane_band_height: laneBandHeight,
      bar_height: barHeight,
      label_column_width: labelColumnWidth,
      lane_stripe_width: laneStripeWidth,
    },
    time_axis_ticks,
  };
}
