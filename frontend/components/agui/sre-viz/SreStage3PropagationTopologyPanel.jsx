/**
 * Stage3 传播拓扑：复用 SreVizTopologyMap（静态拓扑 + 传播路径高亮）
 */
import { useMemo } from "react";
import {
  isStage3PropagationTopologyPayload,
  propagationTopologyToVizPayload,
} from "../../../lib/sreStage3PropagationTopology.js";
import { SreVizTopologyMap } from "./SreVizTopologyMap.jsx";

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage3PropagationTopologyPanel({ data, variant = "embedded" }) {
  const panel = useMemo(
    () => ({ type: "topology_map", payload: propagationTopologyToVizPayload(data) }),
    [data],
  );

  if (!isStage3PropagationTopologyPayload(data)) return null;

  return <SreVizTopologyMap panel={panel} embedded={variant === "embedded"} />;
}
