/**
 * Stage3 证据数据：强信号 / 弱信号 分组列表
 */
import { useMemo } from "react";
import {
  isStage3EvidenceDataPayload,
  normalizeStage3EvidenceDataModel,
} from "../../../lib/sreStage3EvidenceData.js";

const LIST_SHELL =
  "overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50/40 via-white to-slate-50/30 shadow-inner ring-1 ring-black/[0.03] dark:border-slate-800/75 dark:from-slate-950/55 dark:via-slate-950/35 dark:to-slate-950/20 dark:ring-white/[0.04]";

function formatConfidence(confidence) {
  if (confidence == null || typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
  const ratio = confidence > 1 ? confidence / 100 : confidence;
  if (!Number.isFinite(ratio)) return null;
  return `${Math.round(ratio * 1000) / 10}%`;
}

function EvidenceSignalRow({ row, tone }) {
  const pct = formatConfidence(row.confidence);
  const bar =
    tone === "strong"
      ? "bg-gradient-to-b from-emerald-500 to-teal-500"
      : "bg-gradient-to-b from-amber-500 to-orange-500";

  return (
    <li className="relative flex gap-0 border-b border-slate-200/55 transition-colors last:border-b-0 hover:bg-white/70 dark:border-slate-800/70 dark:hover:bg-slate-950/55">
      <div className={`w-[3px] shrink-0 opacity-[0.92] dark:opacity-100 ${bar}`} aria-hidden />
      <div className="min-w-0 flex-1 px-3 py-3 sm:px-4 sm:py-3.5">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-50">
            {row.name}
          </p>
          {pct ? (
            <span
              className={`shrink-0 tabular-nums text-[11px] font-semibold ${
                tone === "strong"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-amber-800 dark:text-amber-300"
              }`}
            >
              置信度 {pct}
            </span>
          ) : null}
        </div>
        {row.detail ? (
          <p className="mt-2 text-[12px] leading-[1.65] text-slate-700 dark:text-slate-300">{row.detail}</p>
        ) : null}
      </div>
    </li>
  );
}

function SignalSection({ title, tone, rows, accentClass }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className={`mb-2.5 text-[11px] font-semibold uppercase tracking-wide ${accentClass}`}>
        {title}（{rows.length}）
      </p>
      <div className={LIST_SHELL}>
        <ul className="m-0 list-none p-0">
          {rows.map((row, i) => (
            <EvidenceSignalRow key={`${tone}-${i}`} row={row} tone={tone} />
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage3EvidenceDataPanel({ data, variant = "embedded" }) {
  const model = useMemo(() => normalizeStage3EvidenceDataModel(data), [data]);

  if (!isStage3EvidenceDataPayload(data)) return null;

  const total = model.strong.length + model.weak.length;
  const empty = (
    <p className="rounded-lg border border-dashed border-slate-200/90 bg-slate-50/50 px-4 py-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-400">
      暂无证据数据
    </p>
  );
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
      <SignalSection
        title="强信号"
        tone="strong"
        rows={model.strong}
        accentClass="text-emerald-800 dark:text-emerald-300"
      />
      <SignalSection
        title="弱信号"
        tone="weak"
        rows={model.weak}
        accentClass="text-amber-900 dark:text-amber-300"
      />
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
