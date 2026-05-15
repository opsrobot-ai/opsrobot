/**
 * 环境感知 Tab 内嵌 viz 的浅色卡片壳（与日志分布块一致）
 */

/** @param {{ children: import("react").ReactNode; className?: string }} props */
export function EmbeddedSummaryPanel({ children, className = "" }) {
  return (
    <div
      className={`rounded-xl border border-gray-100/90 bg-gradient-to-b from-slate-50/90 to-gray-50/40 p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:from-gray-950/80 dark:to-gray-950/40 dark:ring-white/[0.04] ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/** @param {{ children: import("react").ReactNode }} props */
export function EmbeddedSectionTitle({ children }) {
  return (
    <p className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
      <span
        className="h-px flex-1 max-w-8 bg-gradient-to-r from-gray-300 to-transparent dark:from-gray-600"
        aria-hidden
      />
      {children}
    </p>
  );
}

/** @param {{ children: import("react").ReactNode; className?: string }} props */
export function EmbeddedChartSurface({ children, className = "" }) {
  return (
    <div
      className={`rounded-xl border border-gray-100 bg-white p-2 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-700 dark:bg-gray-950/40 dark:ring-white/[0.04] ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export const embeddedSummaryProseClass =
  "text-[13px] leading-relaxed text-gray-700 dark:text-gray-300";
