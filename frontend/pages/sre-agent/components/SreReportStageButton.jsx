import { memo } from "react";

/** 阶段 → Tailwind 色彩类（需在 build 中静态出现，不可动态拼接） */
const COLOR_STYLES = {
  blue: {
    wrap: "border-blue-200/90 bg-blue-50/80 hover:border-blue-400/50 hover:bg-blue-100/90 dark:border-blue-800/80 dark:bg-blue-950/40 dark:hover:border-blue-500/50 dark:hover:bg-blue-950/70",
    label: "text-blue-950 dark:text-blue-100",
    hint:  "text-blue-700/90 dark:text-blue-300/90",
    dot:   "bg-blue-400 dark:bg-blue-500",
  },
  amber: {
    wrap: "border-amber-200/90 bg-amber-50/80 hover:border-amber-400/50 hover:bg-amber-100/90 dark:border-amber-800/80 dark:bg-amber-950/40 dark:hover:border-amber-500/50 dark:hover:bg-amber-950/70",
    label: "text-amber-950 dark:text-amber-100",
    hint:  "text-amber-700/90 dark:text-amber-300/90",
    dot:   "bg-amber-400 dark:bg-amber-500",
  },
  rose: {
    wrap: "border-rose-200/90 bg-rose-50/80 hover:border-rose-400/50 hover:bg-rose-100/90 dark:border-rose-800/80 dark:bg-rose-950/40 dark:hover:border-rose-500/50 dark:hover:bg-rose-950/70",
    label: "text-rose-950 dark:text-rose-100",
    hint:  "text-rose-700/90 dark:text-rose-300/90",
    dot:   "bg-rose-400 dark:bg-rose-500",
  },
  emerald: {
    wrap: "border-emerald-200/90 bg-emerald-50/80 hover:border-emerald-400/50 hover:bg-emerald-100/90 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-950/70",
    label: "text-emerald-950 dark:text-emerald-100",
    hint:  "text-emerald-700/90 dark:text-emerald-300/90",
    dot:   "bg-emerald-400 dark:bg-emerald-500",
  },
  violet: {
    wrap: "border-violet-200/90 bg-violet-50/80 hover:border-violet-400/50 hover:bg-violet-100/90 dark:border-violet-800/80 dark:bg-violet-950/40 dark:hover:border-violet-500/50 dark:hover:bg-violet-950/70",
    label: "text-violet-950 dark:text-violet-100",
    hint:  "text-violet-700/90 dark:text-violet-300/90",
    dot:   "bg-violet-400 dark:bg-violet-500",
  },
};

const SreReportStageButton = memo(function SreReportStageButton({ path, stage, label, color, onOpen }) {
  const styles = COLOR_STYLES[color] ?? COLOR_STYLES.violet;
  const hint = String(path || "");

  const handleClick = () => {
    onOpen?.({ kind: "sre_tab", stage, path });
  };

  return (
    <button
      type="button"
      title={hint}
      onClick={handleClick}
      className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left shadow-sm transition ${styles.wrap}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} />
        <span className={`text-[13px] font-medium ${styles.label}`}>{label}</span>
      </div>
      <span className={`shrink-0 text-[12px] ${styles.hint}`}>在右侧打开</span>
    </button>
  );
});

export default SreReportStageButton;
