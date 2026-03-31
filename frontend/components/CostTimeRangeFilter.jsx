import { useMemo } from "react";
import Icon from "./Icon.jsx";

export function pad2(n) {
  return String(n).padStart(2, "0");
}

/** 用于 datetime-local 的 value */
export function toDatetimeLocalValue(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function parseLocalMs(s) {
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t.getTime();
}

/**
 * datetime-local 区间 → Doris 按日 YYYY-MM-DD（本地日历日，含首尾整日）
 * @returns {{ startDay: string, endDay: string } | null}
 */
export function rangeToDayBounds(rangeStart, rangeEnd) {
  const s = parseLocalMs(rangeStart);
  const e = parseLocalMs(rangeEnd);
  if (s == null || e == null || s > e) return null;
  const p = (n) => String(n).padStart(2, "0");
  const sd = new Date(s);
  const ed = new Date(e);
  return {
    startDay: `${sd.getFullYear()}-${p(sd.getMonth() + 1)}-${p(sd.getDate())}`,
    endDay: `${ed.getFullYear()}-${p(ed.getMonth() + 1)}-${p(ed.getDate())}`,
  };
}

export function defaultRangeLastDays(days) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  return { start: toDatetimeLocalValue(start), end: toDatetimeLocalValue(end) };
}

const TIME_PRESETS = [
  { label: "近 7 日", days: 7 },
  { label: "近 30 日", days: 30 },
  { label: "近 90 日", days: 90 },
];

/**
 * 统计时间筛选组件
 *
 * 统一风格：左侧 "统计时间 + 快捷预设"，右侧 "开始时间 + 结束时间" 只读展示。
 *
 * Props:
 * - activeDays: number  当前选中的天数 (7 | 30 | 90)
 * - onPreset: (days: number) => void  预设按钮回调
 * - rangeStart / rangeEnd: string (ISO date or datetime-local)
 *     如果没传，则自动根据 activeDays 计算
 * - className?: string
 */
export default function CostTimeRangeFilter({
  activeDays,
  onPreset,
  rangeStart,
  rangeEnd,
  className = "",
}) {
  // 如果调用者没传 rangeStart/rangeEnd 则根据 activeDays 自动计算
  const computed = useMemo(() => {
    const now = new Date();
    const end = now;
    const start = new Date(now.getTime() - (activeDays ?? 7) * 86400000);
    return { start, end };
  }, [activeDays]);

  const fmtDate = (d) => {
    const dt = typeof d === "string" ? new Date(d) : d;
    if (!dt || Number.isNaN(dt.getTime())) return "";
    return `${dt.getFullYear()}/${pad2(dt.getMonth() + 1)}/${pad2(dt.getDate())} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  };

  const startDisplay = rangeStart ? fmtDate(rangeStart) : fmtDate(computed.start);
  const endDisplay = rangeEnd ? fmtDate(rangeEnd) : fmtDate(computed.end);

  return (
    <div
      className={[
        "app-card flex flex-col gap-4 px-4 py-3 sm:flex-row sm:items-center",
        className,
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">统计时间</span>
        <div className="flex gap-1.5">
          {TIME_PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => onPreset(p.days)}
              className={[
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                activeDays === p.days
                  ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                  : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700",
              ].join(" ")}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">开始时间</span>
          <div className="relative">
            <input
              type="text"
              readOnly
              value={startDisplay}
              className="w-44 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
              <Icon name="clock" className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">结束时间</span>
          <div className="relative">
            <input
              type="text"
              readOnly
              value={endDisplay}
              className="w-44 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
              <Icon name="clock" className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 判断统计归属日（YYYY-MM-DD）是否与 [startMs, endMs] 有交集 */
export function rowInTimeRange(statDateStr, startMs, endMs) {
  const parts = statDateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return false;
  const [y, mo, dd] = parts;
  const dayStart = new Date(y, mo - 1, dd, 0, 0, 0, 0).getTime();
  const dayEnd = new Date(y, mo - 1, dd, 23, 59, 59, 999).getTime();
  return dayEnd >= startMs && dayStart <= endMs;
}
