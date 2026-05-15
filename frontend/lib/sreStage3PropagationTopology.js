/**
 * Stage3 `propagation_topology`：传播拓扑（描述 + nodes[] + edges[]）
 */

/** @param {unknown} n */
function isPropagationNode(n) {
  if (!n || typeof n !== "object" || Array.isArray(n)) return false;
  const id = String(n.id ?? "").trim();
  return Boolean(id);
}

/** @param {unknown} e */
function isPropagationEdge(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return false;
  const source = String(e.source ?? e.from ?? "").trim();
  const target = String(e.target ?? e.to ?? "").trim();
  return Boolean(source && target);
}

/**
 * @param {unknown} val
 */
export function isStage3PropagationTopologyPayload(val) {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  const nodes = val.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return false;
  if (!nodes.every(isPropagationNode)) return false;
  const edges = val.edges;
  if (edges != null && !Array.isArray(edges)) return false;
  if (Array.isArray(edges) && !edges.every(isPropagationEdge)) return false;
  return true;
}

/** @param {string} st */
export function mapPropagationNodeStatus(st) {
  const s = String(st ?? "").trim().toLowerCase();
  if (s === "fired") return "anomaly";
  if (s === "critical") return "critical";
  if (s === "degraded") return "degraded";
  if (s === "warning") return "slow";
  if (s === "normal" || s === "healthy") return "normal";
  return s || "normal";
}

/**
 * DAG 上最长主路径（用于 fault_propagation 边高亮）；并列时字典序更小者优先。
 * @param {{ id: string }[]} nodes
 * @param {{ source: string; target: string }[]} edges
 * @returns {string[]}
 */
export function computePropagationHighlightPathIds(nodes, edges) {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const edgeList = Array.isArray(edges) ? edges : [];
  const idSet = new Set(nodeList.map((n) => String(n.id).trim()).filter(Boolean));
  const adj = new Map();
  for (const id of idSet) adj.set(id, []);

  for (const e of edgeList) {
    const s = String(e.source ?? "").trim();
    const t = String(e.target ?? "").trim();
    if (!idSet.has(s) || !idSet.has(t)) continue;
    adj.get(s).push(t);
  }
  for (const [, outs] of adj) outs.sort((a, b) => a.localeCompare(b));

  /** @type {Map<string, string[]>} */
  const memo = new Map();

  /** @param {string} u */
  function bestFrom(u) {
    if (memo.has(u)) return memo.get(u);
    const outs = adj.get(u) || [];
    if (!outs.length) {
      const p = [u];
      memo.set(u, p);
      return p;
    }
    let best = [u];
    for (const v of outs) {
      const sub = bestFrom(v);
      const cand = [u, ...sub.slice(1)];
      if (
        cand.length > best.length ||
        (cand.length === best.length && cand.join("\t") < best.join("\t"))
      ) {
        best = cand;
      }
    }
    memo.set(u, best);
    return best;
  }

  const roots = [...idSet].filter((id) => !edgeList.some((e) => String(e.target ?? "").trim() === id)).sort();
  const starters = roots.length ? roots : [...idSet].sort();

  let bestPath = [];
  for (const r of starters) {
    const p = bestFrom(r);
    if (
      p.length > bestPath.length ||
      (p.length === bestPath.length && p.join("\t") < bestPath.join("\t"))
    ) {
      bestPath = p;
    }
  }
  return bestPath;
}

/**
 * 转为 SreVizTopologyMap / normalizeTopologyMapModel 可读 payload
 * @param {{ description?: string; nodes?: unknown[]; edges?: unknown[] }} raw
 */
export function propagationTopologyToVizPayload(raw) {
  const description =
    typeof raw.description === "string" ? raw.description.trim() : "";

  const nodesIn = Array.isArray(raw.nodes) ? raw.nodes : [];
  const edgesIn = Array.isArray(raw.edges) ? raw.edges : [];

  const nodes = nodesIn.filter(isPropagationNode).map((n) => {
    const id = String(n.id).trim();
    const label = String(n.label ?? n.name ?? id).trim() || id;
    const sub = String(n.sub_label ?? n.subLabel ?? "").trim();
    const ty = String(n.type ?? "").trim();
    const status = mapPropagationNodeStatus(n.status ?? n.health_status);
    const out = {
      id,
      name: label,
      label,
      type: ty || undefined,
      status,
    };
    if (sub) {
      out.metadata = { 说明: sub };
    }
    return out;
  });

  const edges = edgesIn.filter(isPropagationEdge).map((e) => ({
    source: String(e.source).trim(),
    target: String(e.target).trim(),
    label: e.label != null ? String(e.label) : "",
    type: e.type != null ? String(e.type) : "",
  }));

  const pathIds = computePropagationHighlightPathIds(nodes, edges);
  const pathStr = pathIds.length ? pathIds.join(" → ") : "";

  return {
    title: "传播拓扑",
    description,
    fault_propagation: pathStr ? { path: pathStr } : undefined,
    chart_config: {
      direction: "LR",
      layout: "directed",
    },
    nodes,
    edges,
  };
}
