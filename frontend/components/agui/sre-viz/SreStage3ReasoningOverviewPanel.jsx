/**
 * Stage3 推理总览：摘要 + 三层因果链路（无额外二级标题）
 */
import { useMemo } from "react";
import {
  isStage3ReasoningOverviewPayload,
  normalizeReasoningOverviewModel,
} from "../../../lib/sreStage3ReasoningOverview.js";

export const REASONING_OVERVIEW_THREE_LAYER_SURFACE =
  "rounded-xl border border-slate-200/80 bg-slate-50/35 p-3 shadow-inner ring-1 ring-black/[0.03] dark:border-slate-800/70 dark:bg-slate-950/30 dark:ring-white/[0.04]";

/**
 * 推理总览与终稿三层根因共用的三层因果链路布局（横向箭头 / 纵向降级）
 * @param {{ rows: Array<{ id: string; layerZh: string; name?: string; description?: string; confidence?: number | null }> }}
 */
export function ReasoningOverviewThreeLayerChain({ rows }) {
  const list = useMemo(() => {
    return (rows ?? []).filter((r) => {
      const d = String(r?.description ?? "").trim();
      const n = String(r?.name ?? "").trim();
      return d !== "" || n !== "";
    });
  }, [rows]);

  if (!list.length) return null;

  return (
    <div className={REASONING_OVERVIEW_THREE_LAYER_SURFACE}>
      <div
        className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-stretch lg:justify-center"
        role="list"
        aria-label="三层因果链路"
      >
        {list.map((row, idx) => (
          <div key={row.id} className="flex min-w-0 flex-1 items-stretch lg:max-w-[min(100%,340px)]">
            <div
              role="listitem"
              className="min-w-0 flex-1 rounded-lg border border-white/80 bg-white/90 px-3 py-3 shadow-sm ring-1 ring-slate-200/80 dark:border-slate-800/90 dark:bg-slate-950/55 dark:ring-slate-700/80"
              title={[row.name, row.description].filter(Boolean).join("\n")}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-indigo-100/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:bg-indigo-950/70 dark:text-indigo-100">
                  {row.layerZh}
                </span>
                {row.confidence != null && Number.isFinite(row.confidence) ? (
                  <span className="ml-auto font-mono text-[11px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {(Math.min(1, Math.max(0, row.confidence)) * 100).toFixed(1)}%
                  </span>
                ) : null}
              </div>
              {row.name ? (
                <p className="mt-2 text-[12px] font-semibold leading-snug text-slate-900 dark:text-slate-50">{row.name}</p>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                {String(row.description ?? "").trim()}
              </p>
            </div>
            {idx < list.length - 1 ? (
              <div
                className="flex shrink-0 items-center justify-center px-1 text-slate-400 lg:px-2 dark:text-slate-500"
                aria-hidden
              >
                <span className="hidden text-lg lg:inline">→</span>
                <span className="inline rotate-90 text-lg lg:hidden">↓</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * @param {{ data: unknown; variant?: "embedded" | "standalone" }}
 */
export function SreStage3ReasoningOverviewPanel({ data, variant = "embedded" }) {
  const model = useMemo(() => {
    if (data == null) return normalizeReasoningOverviewModel({});
    if (typeof data === "string" || typeof data === "number") {
      return normalizeReasoningOverviewModel({ summary: String(data) });
    }
    if (typeof data !== "object" || Array.isArray(data)) {
      return normalizeReasoningOverviewModel({});
    }
    return normalizeReasoningOverviewModel(data);
  }, [data]);

  if (!isStage3ReasoningOverviewPayload(data)) return null;

  const empty = <p className="text-xs text-gray-400 dark:text-gray-500">暂无推理总览</p>;
  const hasBody = model.summary || model.layers.length > 0;
  if (!hasBody) {
    return variant === "standalone" ? (
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        {empty}
      </div>
    ) : (
      empty
    );
  }

  const body = (
    <div className="space-y-5">
      {model.summary ? (
        <div className="max-w-[100ch] rounded-xl border border-indigo-100/85 bg-gradient-to-br from-indigo-50/65 via-white to-slate-50/45 p-4 shadow-sm ring-1 ring-indigo-500/[0.06] dark:border-indigo-900/40 dark:from-indigo-950/[0.22] dark:via-gray-950/65 dark:to-slate-950/80 dark:ring-indigo-400/10">
          <p className="text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">{model.summary}</p>
        </div>
      ) : null}

      {model.layers.length > 0 ? (
        <ReasoningOverviewThreeLayerChain rows={model.layers} />
      ) : null}
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
