/**
 * Stage1 `affected_nodes[]`：节点卡片明细
 */
import { Shell } from "./SreVizShell.jsx";
import {
  isStage1AffectedNodesList,
  normalizeAffectedNodeStatusKey,
  statusAccentHex,
} from "../../../lib/sreStage1AffectedNodes.js";

function NodeCard({ row, index }) {
  const name = String(row.name ?? row.id ?? `节点 ${index + 1}`).trim();
  const ty = String(row.type ?? "").trim();
  const st = String(row.status ?? "").trim();
  const details = String(row.details ?? row.description ?? "").trim();
  const accent = statusAccentHex(row);
  const stKey = normalizeAffectedNodeStatusKey(st);

  return (
    <article
      className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm ring-1 ring-black/[0.03] dark:border-gray-700 dark:bg-gray-950/40 dark:ring-white/[0.04]"
      style={{ borderLeftWidth: 4, borderLeftColor: accent }}
    >
      <div className="flex flex-wrap items-baseline gap-2 border-b border-gray-100/90 bg-gray-50/60 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/35">
        <h5 className="font-mono text-[12px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">{name}</h5>
        {ty ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {ty}
          </span>
        ) : null}
        {st ? (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: accent }}
            title={stKey}
          >
            {st}
          </span>
        ) : null}
      </div>
      {details ? (
        <p className="px-3 py-2.5 text-[12px] leading-relaxed text-gray-600 dark:text-gray-300">{details}</p>
      ) : (
        <p className="px-3 py-2.5 text-[11px] text-gray-400">暂无说明</p>
      )}
    </article>
  );
}

/**
 * @param {{ nodes: object[]; variant?: "embedded" | "standalone" }}
 */
export function SreStage1AffectedNodesPanel({ nodes, variant = "embedded" }) {
  if (!isStage1AffectedNodesList(nodes)) return null;

  const grid = (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {nodes.map((row, i) => (
        <NodeCard key={`${String(row.name ?? row.id ?? i)}-${i}`} row={row} index={i} />
      ))}
    </div>
  );

  if (variant === "standalone") {
    return <Shell title="受影响对象">{grid}</Shell>;
  }

  return grid;
}
