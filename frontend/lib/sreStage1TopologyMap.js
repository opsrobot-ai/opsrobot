/**
 * Stage1 独立拓扑 JSON：`type: stage1_topology_map`，结构与标准 topology_map 的 static_topology 不同，节点挂在 `topology` 下。
 */

const TYPE = "stage1_topology_map";

/** @param {unknown} o */
export function isStage1TopologyMapPayload(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  if (String(o.type || "").toLowerCase() !== TYPE) return false;
  const t = o.topology;
  if (!t || typeof t !== "object" || Array.isArray(t)) return false;
  return Array.isArray(t.nodes) && t.nodes.length > 0;
}

/**
 * 转为 normalizeTopologyMapModel 可读：故障链从 `summary` 映射到 fault_propagation.path（与拓扑边高亮共用逻辑）。
 *
 * @param {object} data
 */
export function stage1TopologyMapToVizPayload(data) {
  const summary = String(data.summary || "").trim();
  return {
    title: data.title != null ? String(data.title).trim() : "",
    description: data.description != null ? String(data.description).trim() : "",
    incident_id: data.incident_id,
    fault_propagation: summary ? { path: summary } : undefined,
    topology: data.topology,
  };
}
