/**
 * Stage1 `type: stage1_topology_map`：复用拓扑 SVG 视图与故障传播高亮。
 */
import { useMemo } from "react";
import { SreVizTopologyMap } from "./SreVizTopologyMap.jsx";
import {
  isStage1TopologyMapPayload,
  stage1TopologyMapToVizPayload,
} from "../../../lib/sreStage1TopologyMap.js";

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage1TopologyMapView({ data, variant = "embedded" }) {
  const panel = useMemo(
    () => ({ type: "topology_map", payload: stage1TopologyMapToVizPayload(data) }),
    [data],
  );

  if (!isStage1TopologyMapPayload(data)) return null;

  return <SreVizTopologyMap panel={panel} embedded={variant === "embedded"} />;
}
