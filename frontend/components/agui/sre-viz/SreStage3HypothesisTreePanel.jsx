/**
 * Stage3 假设树：摘要 + 已通过 / 已排除两个列表（无图表）
 */
import { useMemo } from "react";
import {
  isStage3HypothesisTreePayload,
  normalizeHypothesisTreeChartModel,
} from "../../../lib/sreStage3HypothesisTree.js";

function formatConfidence(confidence) {
  if (confidence == null || typeof confidence !== "number") return null;
  return `${Math.round(confidence * 1000) / 10}%`;
}

function HypothesisListItem({ row, variant }) {
  const isVal = variant === "validated";
  const pct = formatConfidence(row.confidence);
  const ring = isVal
    ? "border-emerald-200/85 bg-emerald-50/40 dark:border-emerald-900/45 dark:bg-emerald-950/25"
    : "border-slate-200/85 bg-slate-50/55 dark:border-slate-700/80 dark:bg-slate-900/40";

  return (
    <li className={`rounded-lg border px-3 py-2.5 ${ring}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-[11px] font-bold text-slate-900 dark:text-slate-100">{row.id}</span>
        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{row.dimension}</span>
        {pct ? (
          <span
            className={`ml-auto tabular-nums text-[11px] font-semibold ${
              isVal ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {pct}
          </span>
        ) : null}
      </div>
      {row.description ? (
        <p className="mt-2 text-[12px] leading-relaxed text-slate-800 dark:text-slate-200">{row.description}</p>
      ) : null}
      {!isVal && row.exclusion_reason ? (
        <p className="mt-2 border-t border-slate-200/80 pt-2 text-[11px] leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {row.exclusion_reason}
        </p>
      ) : null}
    </li>
  );
}

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage3HypothesisTreePanel({ data, variant = "embedded" }) {
  const model = useMemo(() => normalizeHypothesisTreeChartModel(data), [data]);

  if (!isStage3HypothesisTreePayload(data)) return null;

  const total = model.counts.validated + model.counts.excluded;
  const empty = <p className="text-xs text-gray-400 dark:text-gray-500">暂无假设树数据</p>;
  if (total === 0) {
    return variant === "standalone" ? (
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        {empty}
      </div>
    ) : (
      empty
    );
  }

  const body = (
    <div className="space-y-6">
      {model.intro ? (
        <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">{model.intro}</p>
      ) : null}

      <div className="space-y-6">
        {model.validated.length > 0 ? (
          <div>
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
              已通过（{model.counts.validated}）
            </p>
            <ul className="list-none space-y-2.5 pl-0" aria-label="已通过的假设">
              {model.validated.map((row) => (
                <HypothesisListItem key={`v-${row.id}`} row={row} variant="validated" />
              ))}
            </ul>
          </div>
        ) : null}

        {model.excluded.length > 0 ? (
          <div>
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              已排除（{model.counts.excluded}）
            </p>
            <ul className="list-none space-y-2.5 pl-0" aria-label="已排除的假设">
              {model.excluded.map((row) => (
                <HypothesisListItem key={`e-${row.id}`} row={row} variant="excluded" />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (variant === "standalone") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {body}
      </div>
    );
  }

  return body;
}
