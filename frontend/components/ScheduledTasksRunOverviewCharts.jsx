import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import intl from "react-intl-universal";
import Icon from "./Icon.jsx";

/** @param {number | null | undefined} ms */
function formatAvgMsAxis(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** @param {number | null | undefined} ms */
function formatDurationMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

/** @param {number | null | undefined} n */
function formatPct(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n}%`;
}

/** 与趋势图一致：将接口 `day` 规范为 `YYYY-MM-DD` */
function normalizeTrendDayLabel(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO 或时间戳字符串 → 本地日历日 `YYYY-MM-DD` */
function isoToLocalDayStr(iso) {
  if (iso == null || String(iso).trim() === "") return null;
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {string} ymd */
function parseYmdParts(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m, d };
}

/** 本地自然日边界（与热力图 `YYYY-MM-DD` 键一致），供运行记录下钻筛选 */
function localDayStartEndIso(ymd) {
  const p = parseYmdParts(ymd);
  if (!p) return null;
  const start = new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0);
  const end = new Date(p.y, p.m - 1, p.d, 23, 59, 59, 999);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** 公历月天数，m 为 1–12 */
function daysInCalendarMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

/** 从 startYmd 到 endYmd 覆盖的每个自然月 `{ y, m }`（m 为 1–12） */
function monthsInRangeInclusive(startYmd, endYmd) {
  const a = parseYmdParts(startYmd);
  const b = parseYmdParts(endYmd);
  if (!a || !b) return [];
  const out = [];
  let y = a.y;
  let mo = a.m;
  const endKey = b.y * 12 + b.m;
  while (y * 12 + mo <= endKey) {
    out.push({ y, m: mo });
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  return out;
}

/** @param {number} y @param {number} m 1–12 @param {number} d */
function ymdFromYmdParts(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * 自然月按「周一打头」铺成 7 列周历；筛选用 startYmd/endYmd 截断。
 * @returns {({ kind: "empty" } | { kind: "day", date: string, dom: number, ok: number, fail: number, other: number, total: number })[][]}
 */
function buildMonthWeekRowsMonFirst(y, m, startYmd, endYmd, byDay) {
  const dim = daysInCalendarMonth(y, m);
  const first = new Date(y, m - 1, 1);
  const dow = first.getDay();
  const padMon = dow === 0 ? 6 : dow - 1;
  /** @type {({ kind: "empty" } | { kind: "day", date: string, dom: number, ok: number, fail: number, other: number, total: number })[]} */
  const flat = [];
  for (let i = 0; i < padMon; i += 1) flat.push({ kind: "empty" });
  for (let dom = 1; dom <= dim; dom += 1) {
    const date = ymdFromYmdParts(y, m, dom);
    if (date < startYmd || date > endYmd) flat.push({ kind: "empty" });
    else {
      const r = byDay.get(date) ?? { ok: 0, fail: 0, other: 0, total: 0 };
      flat.push({ kind: "day", date, dom, ...r });
    }
  }
  while (flat.length % 7 !== 0) flat.push({ kind: "empty" });
  const rows = [];
  for (let i = 0; i < flat.length; i += 7) rows.push(flat.slice(i, i + 7));
  return rows;
}

/**
 * 日历格底色：按当日执行结果语义着色（与右侧「执行总数/失败次数/成功率」图例无关）。
 * 灰=无执行；绿=全部成功；红=无成功；黄=部分成功。
 * @param {{ kind: string, total?: number, ok?: number }} cell
 */
function dayHeatmapOutcomeBgClass(cell) {
  if (!cell || cell.kind !== "day") return "bg-slate-50/90 dark:bg-slate-900/55";
  const total = Number(cell.total) || 0;
  const ok = Number(cell.ok) || 0;
  if (total <= 0) {
    return "bg-slate-200/95 text-slate-600 dark:bg-slate-700/90 dark:text-slate-300";
  }
  if (ok === total) {
    return "bg-emerald-500/90 dark:bg-emerald-600/85";
  }
  if (ok <= 0) {
    return "bg-rose-600/90 dark:bg-rose-700/85";
  }
  return "bg-amber-400/90 dark:bg-amber-500/80";
}

/** 热力图格子右上角日期数字：与底色对比可读 */
function dayHeatmapCornerDateClass(cell) {
  if (!cell || cell.kind !== "day") return "text-slate-500 dark:text-slate-400";
  const total = Number(cell.total) || 0;
  const ok = Number(cell.ok) || 0;
  if (total <= 0) return "text-slate-600 dark:text-slate-300";
  if (ok === total) return "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]";
  if (ok <= 0) return "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]";
  return "text-amber-950/95 drop-shadow-sm dark:text-amber-950/90";
}

/**
 * @param {{ dates: boolean, totalRuns: boolean, failures: boolean, successRate: boolean }} d
 * @returns {string}
 */
function heatmapCellPaddingClass(d) {
  const anyStat = d.totalRuns || d.failures || d.successRate;
  if (d.dates && anyStat) return "min-h-[48px] pt-5";
  if (d.dates && !anyStat) return "min-h-[40px] pt-5 pb-2";
  if (!d.dates && anyStat) return "min-h-[44px] pt-3";
  return "min-h-[44px] pt-3";
}

/** @param {string} ymd `YYYY-MM-DD` @returns {string} 月份-日期，如 `4-23` */
function heatmapCornerDateLabel(ymd) {
  const p = typeof ymd === "string" ? ymd.split("-") : [];
  if (p.length !== 3) return "";
  const m = Number(p[1]);
  const d = Number(p[2]);
  if (!Number.isFinite(m) || !Number.isFinite(d)) return "";
  return `${m}-${d}`;
}

/** @param {number} ok @param {number} total */
function formatDaySuccessRateLabel(ok, total) {
  if (total <= 0) return "—";
  const pct = (ok / total) * 100;
  if (Math.abs(pct - Math.round(pct)) < 1e-6) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1)}%`;
}

/** @param {number} ok @param {number} total @returns {number | null} 0–100 */
function daySuccessRatePct(ok, total) {
  if (total <= 0) return null;
  return (ok / total) * 100;
}

/**
 * 成功率模式下：区间外淡化（含无执行数据的格子）。
 * @param {number | null} pct
 * @param {number} minPct
 * @param {number} maxPct
 */
function successRateCellDimmed(pct, minPct, maxPct) {
  if (minPct === 0 && maxPct === 100) return false;
  if (pct == null) return true;
  return pct < minPct || pct > maxPct;
}

/**
 * 执行总数 / 失败次数 区间外淡化（与竖条刻度一致：0 … domainMax）。
 * @param {number} value
 * @param {number} minV
 * @param {number} maxV
 * @param {number} domainMax 至少为 1
 */
function countRangeCellDimmed(value, minV, maxV, domainMax) {
  const d = Math.max(1, Math.floor(domainMax));
  if (minV === 0 && maxV >= d) return false;
  return value < minV || value > maxV;
}

/**
 * 竖直渐变条上的双柄区间（0% 在下、100% 在上），与日历热力格子筛选联动。
 * @param {{ min: number, max: number, setMin: (n: number) => void, setMax: (n: number) => void }} p
 */
function SuccessRateVerticalRangeSlider({ min, max, setMin, setMax }) {
  const trackRef = useRef(null);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  minRef.current = min;
  maxRef.current = max;

  const [dragKind, setDragKind] = useState(/** @type {"min" | "max" | null} */ (null));

  useEffect(() => {
    if (!dragKind) return undefined;
    const onMove = (e) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.height <= 0) return;
      const v = Math.round(Math.min(100, Math.max(0, ((r.bottom - e.clientY) / r.height) * 100)));
      if (dragKind === "min") setMin(Math.min(v, maxRef.current));
      else setMax(Math.max(v, minRef.current));
    };
    const onEnd = () => setDragKind(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [dragKind, setMin, setMax]);

  const onTrackPointerDown = (e) => {
    if (/** @type {HTMLElement} */ (e.target).closest?.("button")) return;
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    const v = Math.round(Math.min(100, Math.max(0, ((r.bottom - e.clientY) / r.height) * 100)));
    const dMin = Math.abs(v - minRef.current);
    const dMax = Math.abs(v - maxRef.current);
    if (dMin <= dMax) {
      setMin(Math.min(v, maxRef.current));
      setDragKind("min");
    } else {
      setMax(Math.max(v, minRef.current));
      setDragKind("max");
    }
  };

  const thumbClass =
    "absolute z-[2] min-h-[1.25rem] min-w-[2rem] max-w-[2.75rem] cursor-grab rounded-md border-2 border-white bg-slate-800 px-0.5 py-0.5 text-center text-[9px] font-semibold leading-tight text-white shadow-md outline-none hover:bg-slate-700 active:cursor-grabbing dark:border-slate-100 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white";

  return (
    <div className="flex shrink-0 flex-col items-center gap-1 self-center lg:self-center">
      <span className="text-[10px] font-medium tabular-nums text-slate-600 dark:text-slate-300">100%</span>
      <div
        ref={trackRef}
        role="group"
        aria-label={intl.get("scheduledTasks.runOverview.chartCalendarSrRangeGroup")}
        className="relative h-[8.05rem] w-6 shrink-0 cursor-ns-resize touch-none select-none sm:h-[10.35rem] lg:h-[12.65rem] lg:w-7"
        onPointerDown={onTrackPointerDown}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-emerald-600 via-amber-200 to-red-300 ring-1 ring-inset ring-slate-200/55 dark:from-emerald-700 dark:via-amber-800/60 dark:to-red-900/70 dark:ring-slate-600/55"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-full bg-slate-900/40 dark:bg-black/45"
          style={{ height: `${min}%` }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 rounded-t-full bg-slate-900/40 dark:bg-black/45"
          style={{ height: `${100 - max}%` }}
          aria-hidden
        />
        <button
          type="button"
          className={`${thumbClass} -translate-x-1/2 -translate-y-1/2`}
          style={{ left: "50%", top: `${100 - min}%` }}
          aria-label={`${intl.get("scheduledTasks.runOverview.chartCalendarSrMin")} ${min}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={min}
          role="slider"
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragKind("min");
          }}
        >
          {min}%
        </button>
        <button
          type="button"
          className={`${thumbClass} -translate-x-1/2 -translate-y-1/2`}
          style={{ left: "50%", top: `${100 - max}%` }}
          aria-label={`${intl.get("scheduledTasks.runOverview.chartCalendarSrMax")} ${max}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={max}
          role="slider"
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragKind("max");
          }}
        >
          {max}%
        </button>
      </div>
      <span className="text-[10px] font-medium tabular-nums text-slate-600 dark:text-slate-300">0%</span>
    </div>
  );
}

/** @param {number} n */
function formatCountThumb(n) {
  if (!Number.isFinite(n)) return "0";
  const v = Math.round(n);
  if (v > 999) return "999+";
  return String(Math.max(0, v));
}

/**
 * 竖直渐变条上的双柄区间（0 在下、domainMax 在上），与日历格子按执行总数或失败次数筛选联动。
 * @param {{
 *   kind: "total" | "failures",
 *   domainMax: number,
 *   min: number,
 *   max: number,
 *   setMin: (n: number) => void,
 *   setMax: (n: number) => void,
 * }} p
 */
function CountVerticalRangeSlider({ kind, domainMax, min, max, setMin, setMax }) {
  const d = Math.max(1, Math.floor(domainMax));
  const trackRef = useRef(null);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const dRef = useRef(d);
  minRef.current = min;
  maxRef.current = max;
  dRef.current = d;

  const [dragKind, setDragKind] = useState(/** @type {"min" | "max" | null} */ (null));

  useEffect(() => {
    if (!dragKind) return undefined;
    const onMove = (e) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.height <= 0) return;
      const dm = dRef.current;
      const raw = ((r.bottom - e.clientY) / r.height) * dm;
      const v = Math.round(Math.min(dm, Math.max(0, raw)));
      if (dragKind === "min") setMin(Math.min(v, maxRef.current));
      else setMax(Math.max(v, minRef.current));
    };
    const onEnd = () => setDragKind(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [dragKind, setMin, setMax]);

  const onTrackPointerDown = (e) => {
    if (/** @type {HTMLElement} */ (e.target).closest?.("button")) return;
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    const raw = ((r.bottom - e.clientY) / r.height) * d;
    const v = Math.round(Math.min(d, Math.max(0, raw)));
    const dMin = Math.abs(v - minRef.current);
    const dMax = Math.abs(v - maxRef.current);
    if (dMin <= dMax) {
      setMin(Math.min(v, maxRef.current));
      setDragKind("min");
    } else {
      setMax(Math.max(v, minRef.current));
      setDragKind("max");
    }
  };

  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const minPct = (lo / d) * 100;
  const maxPct = (hi / d) * 100;
  const topLabel = d > 999 ? "999+" : String(d);
  const gradientBar =
    kind === "total"
      ? "bg-gradient-to-b from-blue-800 via-blue-300 to-slate-100 dark:from-blue-950 dark:via-blue-700 dark:to-slate-800"
      : "bg-gradient-to-b from-rose-900 via-rose-300 to-slate-100 dark:from-rose-950 dark:via-rose-700 dark:to-slate-800";

  const thumbClass =
    "absolute z-[2] min-h-[1.25rem] min-w-[2rem] max-w-[2.75rem] cursor-grab rounded-md border-2 border-white bg-slate-800 px-0.5 py-0.5 text-center text-[9px] font-semibold leading-tight text-white shadow-md outline-none hover:bg-slate-700 active:cursor-grabbing dark:border-slate-100 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white";

  return (
    <div className="flex shrink-0 flex-col items-center gap-1 self-center lg:self-center">
      <span className="max-w-[4.5rem] truncate text-center text-[10px] font-medium tabular-nums text-slate-600 dark:text-slate-300">
        {topLabel}
      </span>
      <div
        ref={trackRef}
        role="group"
        aria-label={intl.get("scheduledTasks.runOverview.chartCalendarCountRangeGroup")}
        className="relative h-[8.05rem] w-6 shrink-0 cursor-ns-resize touch-none select-none sm:h-[10.35rem] lg:h-[12.65rem] lg:w-7"
        onPointerDown={onTrackPointerDown}
      >
        <div
          className={["pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-slate-200/55 dark:ring-slate-600/55", gradientBar].join(
            " ",
          )}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-full bg-slate-900/40 dark:bg-black/45"
          style={{ height: `${minPct}%` }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 rounded-t-full bg-slate-900/40 dark:bg-black/45"
          style={{ height: `${100 - maxPct}%` }}
          aria-hidden
        />
        <button
          type="button"
          className={`${thumbClass} -translate-x-1/2 -translate-y-1/2`}
          style={{ left: "50%", top: `${100 - minPct}%` }}
          aria-label={`${intl.get("scheduledTasks.runOverview.chartCalendarSrMin")} ${formatCountThumb(lo)}`}
          aria-valuemin={0}
          aria-valuemax={d}
          aria-valuenow={lo}
          role="slider"
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragKind("min");
          }}
        >
          {formatCountThumb(lo)}
        </button>
        <button
          type="button"
          className={`${thumbClass} -translate-x-1/2 -translate-y-1/2`}
          style={{ left: "50%", top: `${100 - maxPct}%` }}
          aria-label={`${intl.get("scheduledTasks.runOverview.chartCalendarSrMax")} ${formatCountThumb(hi)}`}
          aria-valuemin={0}
          aria-valuemax={d}
          aria-valuenow={hi}
          role="slider"
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragKind("max");
          }}
        >
          {formatCountThumb(hi)}
        </button>
      </div>
      <span className="text-[10px] font-medium tabular-nums text-slate-600 dark:text-slate-300">0</span>
    </div>
  );
}


/**
 * @param {{
 *   charts: object | null,
 *   loading?: boolean,
 *   error?: string | null,
 * }} props
 * error 由父级统一展示横幅，此处仅接收 loading / charts。
 */
export default function ScheduledTasksRunOverviewCharts({ charts, loading, heatmapOnly = false }) {
  const [heatmapMetric, setHeatmapMetric] = useState(/** @type {"total" | "failures" | "successRate"} */ ("total"));
  /** 热力图格子内展示项：日期、执行次数、失败次数、成功率 */
  const [heatmapDisplay, setHeatmapDisplay] = useState(() => ({
    dates: true,
    totalRuns: true,
    failures: true,
    successRate: true,
  }));
  /** 成功率视图：仅显示成功率 ∈ [min,max] 的日期（0–100）；其它指标下不使用 */
  const [srFilterMin, setSrFilterMin] = useState(0);
  const [srFilterMax, setSrFilterMax] = useState(100);
  /** 执行总数视图：格子 total ∈ [min,max]（刻度 0…maxTotal） */
  const [totalFilterMin, setTotalFilterMin] = useState(0);
  const [totalFilterMax, setTotalFilterMax] = useState(1);
  /** 失败次数视图：格子 fail ∈ [min,max]（刻度 0…maxFail） */
  const [failFilterMin, setFailFilterMin] = useState(0);
  const [failFilterMax, setFailFilterMax] = useState(1);
  const trend = Array.isArray(charts?.trend) ? charts.trend : [];

  const slowTop10 = Array.isArray(charts?.slowTop10) ? charts.slowTop10 : [];
  const tokenTop10 = Array.isArray(charts?.tokenTop10) ? charts.tokenTop10 : [];
  const jt = charts?.jobTop10Analysis && typeof charts.jobTop10Analysis === "object" ? charts.jobTop10Analysis : {};
  const byRunCount = Array.isArray(jt.byRunCount) ? jt.byRunCount : [];
  const byFailCount = Array.isArray(jt.byFailCount) ? jt.byFailCount : [];
  const byMaxDurationMs = Array.isArray(jt.byMaxDurationMs) ? jt.byMaxDurationMs : slowTop10;
  const byAvgDurationMs = Array.isArray(jt.byAvgDurationMs) ? jt.byAvgDurationMs : [];
  const bySuccessRate = Array.isArray(jt.bySuccessRate) ? jt.bySuccessRate : [];
  const byTokenTotal = Array.isArray(jt.byTokenTotal) ? jt.byTokenTotal : tokenTop10;
  const distribution = charts?.distribution && typeof charts.distribution === "object" ? charts.distribution : {};
  const failureReasonDistribution = Array.isArray(charts?.failureReasonDistribution)
    ? charts.failureReasonDistribution
    : [];
  const chartRange = charts?.range && typeof charts.range === "object" ? charts.range : {};

  /** @type {"runCount" | "failCount" | "maxDur" | "avgDur" | "successRate" | "tokenTotal"} */
  const [jobTop10Tab, setJobTop10Tab] = useState("runCount");

  const trendOption = useMemo(() => {
    if (!trend.length) return null;
    const days = trend.map((t) => normalizeTrendDayLabel(t.day));
    const ok = trend.map((t) => Number(t.successCount) || 0);
    const fail = trend.map((t) => Number(t.failureCount) || 0);
    const other = trend.map((t) => {
      const tot =
        t.totalCount != null && Number.isFinite(Number(t.totalCount))
          ? Math.max(0, Math.floor(Number(t.totalCount)))
          : Number(t.successCount) + Number(t.failureCount);
      const o = Number(t.successCount) || 0;
      const f = Number(t.failureCount) || 0;
      return Math.max(0, tot - o - f);
    });
    const hasOther = other.some((v) => v > 0);
    const avgRaw = trend.map((t) => (t.avgDurationMs != null && Number.isFinite(Number(t.avgDurationMs)) ? Number(t.avgDurationMs) : null));
    const hasAvgLine = avgRaw.some((v) => v != null && Number.isFinite(v));
    const avgForEcharts = hasAvgLine
      ? avgRaw.map((v) => (v != null && Number.isFinite(v) ? v : "-"))
      : null;
    const okLabel = intl.get("scheduledTasks.runOverview.chartTrendSeriesSuccess") || "OK";
    const failLabel = intl.get("scheduledTasks.runOverview.chartTrendSeriesFailure") || "Fail";
    const otherLabel = intl.get("scheduledTasks.runOverview.chartTrendSeriesOther") || "Other";
    const avgLabel = intl.get("scheduledTasks.runOverview.chartTrendSeriesAvgDur") || "Avg";
    const barLegend = hasOther ? [okLabel, failLabel, otherLabel] : [okLabel, failLabel];
    const legendData = hasAvgLine ? [...barLegend, avgLabel] : barLegend;
    const gridRight = hasAvgLine ? 56 : 20;
    const series = [
      {
        name: okLabel,
        type: "bar",
        stack: "runs",
        barMaxWidth: 28,
        itemStyle: { color: "#22c55e" },
        data: ok,
      },
      {
        name: failLabel,
        type: "bar",
        stack: "runs",
        barMaxWidth: 28,
        itemStyle: { color: "#f43f5e" },
        data: fail,
      },
    ];
    if (hasOther) {
      series.push({
        name: otherLabel,
        type: "bar",
        stack: "runs",
        barMaxWidth: 28,
        itemStyle: { color: "#94a3b8" },
        data: other,
      });
    }
    if (hasAvgLine && avgForEcharts) {
      series.push({
        name: avgLabel,
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        connectNulls: false,
        symbol: "circle",
        symbolSize: 6,
        itemStyle: { color: "#6366f1" },
        lineStyle: { width: 2 },
        data: avgForEcharts,
      });
    }
    return {
      tooltip: {
        trigger: "axis",
        textStyle: { fontSize: 12 },
        formatter(params) {
          if (!Array.isArray(params) || !params.length) return "";
          const day = params[0]?.axisValue ?? "";
          const lines = [day];
          for (const p of params) {
            const val = p.data;
            if (p.seriesName === avgLabel && val != null && val !== "-" && Number.isFinite(Number(val))) {
              lines.push(`${p.marker}${p.seriesName}: ${formatDurationMs(Number(val))}`);
            } else if (val != null && val !== "-") {
              lines.push(`${p.marker}${p.seriesName}: ${val}`);
            }
          }
          return lines.join("<br/>");
        },
      },
      legend: { data: legendData, bottom: 0, textStyle: { fontSize: 11, color: "#64748b" } },
      grid: { left: 52, right: gridRight, top: 28, bottom: 52 },
      xAxis: {
        type: "category",
        data: days,
        axisLabel: { fontSize: 10, color: "#64748b", rotate: days.length > 10 ? 32 : 0 },
      },
      yAxis: hasAvgLine
        ? [
            {
              type: "value",
              name: intl.get("scheduledTasks.runOverview.chartTrendAxisRuns") || "",
              min: 0,
              minInterval: 1,
              axisLabel: { fontSize: 10, color: "#64748b" },
              splitLine: { lineStyle: { color: "#f1f5f9" } },
            },
            {
              type: "value",
              name: intl.get("scheduledTasks.runOverview.chartTrendAxisAvgDur") || "",
              min: 0,
              scale: false,
              axisLabel: {
                fontSize: 10,
                color: "#94a3b8",
                formatter: (v) => formatAvgMsAxis(Number(v)),
              },
              splitLine: { show: false },
            },
          ]
        : [
            {
              type: "value",
              name: intl.get("scheduledTasks.runOverview.chartTrendAxisRuns") || "",
              min: 0,
              minInterval: 1,
              axisLabel: { fontSize: 10, color: "#64748b" },
              splitLine: { lineStyle: { color: "#f1f5f9" } },
            },
          ],
      series,
    };
  }, [trend]);

  const pieOption = useMemo(() => {
    const data = [
      { key: "success", labelKey: "scheduledTasks.runOverview.dist.runSuccess" },
      { key: "failure", labelKey: "scheduledTasks.runOverview.dist.runFailure" },
    ]
      .map(({ key, labelKey }) => ({
        name: intl.get(labelKey),
        value: Number(distribution[key]) || 0,
      }))
      .filter((d) => d.value > 0);
    if (!data.length) return null;
    return {
      tooltip: { trigger: "item", textStyle: { fontSize: 12 } },
      legend: { bottom: 0, textStyle: { fontSize: 11, color: "#64748b" } },
      series: [
        {
          type: "pie",
          radius: ["36%", "62%"],
          center: ["50%", "44%"],
          data,
          label: { fontSize: 10 },
        },
      ],
    };
  }, [distribution]);

  const failureReasonPieOption = useMemo(() => {
    const rows = failureReasonDistribution.filter((r) => r && (Number(r.count) || 0) > 0);
    if (!rows.length) return null;
    const emptyLbl = intl.get("scheduledTasks.runOverview.failureReason.empty");
    const data = rows.map((r) => {
      const key = String(r.reasonKey ?? "");
      const label = key === "__EMPTY__" ? emptyLbl : key.length > 40 ? `${key.slice(0, 39)}…` : key;
      return {
        value: Number(r.count) || 0,
        name: label,
        /** 完整原因，供 tooltip */
        fullName: key === "__EMPTY__" ? emptyLbl : key,
      };
    });
    return {
      tooltip: {
        trigger: "item",
        textStyle: { fontSize: 12 },
        formatter: (p) => {
          const raw = p?.data;
          const fullName =
            raw && typeof raw === "object" && raw.fullName != null ? String(raw.fullName) : String(p?.name ?? "");
          const v = p?.value ?? "";
          const pct = p?.percent != null ? Number(p.percent).toFixed(1) : "";
          return `${fullName}<br/>${intl.get("scheduledTasks.runOverview.failureReason.tooltipCount")}: ${v}${pct !== "" ? ` (${pct}%)` : ""}`;
        },
      },
      legend: {
        type: "scroll",
        orient: "vertical",
        left: 0,
        top: "middle",
        icon: "roundRect",
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 10,
        textStyle: { fontSize: 11, color: "#64748b" },
      },
      series: [
        {
          type: "pie",
          radius: ["34%", "58%"],
          center: ["58%", "50%"],
          data,
          label: { fontSize: 9 },
        },
      ],
    };
  }, [failureReasonDistribution]);

  const jobTop10BarOption = useMemo(() => {
    let rows =
      jobTop10Tab === "runCount"
        ? [...byRunCount].filter((r) => r?.jobId)
        : jobTop10Tab === "failCount"
          ? [...byFailCount].filter((r) => r?.jobId)
          : jobTop10Tab === "maxDur"
            ? [...byMaxDurationMs].filter((r) => r?.jobId)
            : jobTop10Tab === "avgDur"
              ? [...byAvgDurationMs].filter((r) => r?.jobId)
              : jobTop10Tab === "successRate"
                ? [...bySuccessRate].filter((r) => r?.jobId)
                : [...byTokenTotal].filter((r) => r?.jobId);
    rows = rows.reverse();
    if (!rows.length) return null;
    const names = rows.map((r) => (r.jobName ? String(r.jobName) : String(r.jobId)));
    const runsLbl = intl.get("scheduledTasks.runOverview.analysisColRuns");
    const failLbl = intl.get("scheduledTasks.runOverview.analysisColFailRuns");
    const okLbl = intl.get("scheduledTasks.runOverview.analysisColOk");
    const srLbl = intl.get("scheduledTasks.runOverview.analysisColSuccessRate");
    const tokLbl = intl.get("scheduledTasks.runOverview.analysisColTokens");
    if (jobTop10Tab === "runCount") {
      const vals = rows.map((r) => Number(r.runCount) || 0);
      return {
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          textStyle: { fontSize: 12 },
          formatter: (p) => {
            const x = Array.isArray(p) ? p[0] : p;
            const idx = x?.dataIndex;
            const row = typeof idx === "number" ? rows[idx] : null;
            if (!row) return "";
            return `${row.jobName ?? row.jobId}<br/>${runsLbl}: ${row.runCount ?? 0}`;
          },
        },
        grid: { left: 120, right: 44, top: 8, bottom: 8 },
        xAxis: { type: "value", min: 0, minInterval: 1, axisLabel: { fontSize: 10, color: "#64748b" } },
        yAxis: { type: "category", data: names, axisLabel: { fontSize: 10, color: "#64748b", width: 110, overflow: "truncate" } },
        series: [
          {
            type: "bar",
            data: vals,
            barMaxWidth: 18,
            itemStyle: { color: "#3b82f6" },
            label: {
              show: true,
              position: "right",
              distance: 6,
              fontSize: 10,
              color: "#64748b",
              formatter: (p) => String(Math.round(Number(p.value) || 0)),
            },
          },
        ],
      };
    }
    if (jobTop10Tab === "failCount") {
      const vals = rows.map((r) => Number(r.failureCount) || 0);
      return {
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          textStyle: { fontSize: 12 },
          formatter: (p) => {
            const x = Array.isArray(p) ? p[0] : p;
            const idx = x?.dataIndex;
            const row = typeof idx === "number" ? rows[idx] : null;
            if (!row) return "";
            return `${row.jobName ?? row.jobId}<br/>${failLbl}: ${row.failureCount ?? 0}<br/>${runsLbl}: ${row.runCount ?? 0}`;
          },
        },
        grid: { left: 120, right: 44, top: 8, bottom: 8 },
        xAxis: { type: "value", min: 0, minInterval: 1, axisLabel: { fontSize: 10, color: "#64748b" } },
        yAxis: { type: "category", data: names, axisLabel: { fontSize: 10, color: "#64748b", width: 110, overflow: "truncate" } },
        series: [
          {
            type: "bar",
            data: vals,
            barMaxWidth: 18,
            itemStyle: { color: "#f43f5e" },
            label: {
              show: true,
              position: "right",
              distance: 6,
              fontSize: 10,
              color: "#64748b",
              formatter: (p) => String(Math.round(Number(p.value) || 0)),
            },
          },
        ],
      };
    }
    if (jobTop10Tab === "maxDur") {
      const vals = rows.map((r) => (r.maxDurationMs != null && Number.isFinite(Number(r.maxDurationMs)) ? Number(r.maxDurationMs) : 0));
      return {
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          textStyle: { fontSize: 12 },
          formatter: (p) => {
            const x = Array.isArray(p) ? p[0] : p;
            const ms = x?.value;
            return `${x?.name ?? ""}<br/>${formatDurationMs(Number(ms))}`;
          },
        },
        grid: { left: 120, right: 72, top: 8, bottom: 8 },
        xAxis: { type: "value", axisLabel: { fontSize: 10, color: "#64748b", formatter: (v) => formatAvgMsAxis(Number(v)) } },
        yAxis: { type: "category", data: names, axisLabel: { fontSize: 10, color: "#64748b", width: 110, overflow: "truncate" } },
        series: [
          {
            type: "bar",
            data: vals,
            barMaxWidth: 18,
            itemStyle: { color: "#f97316" },
            label: {
              show: true,
              position: "right",
              distance: 6,
              fontSize: 10,
              color: "#64748b",
              formatter: (p) => formatDurationMs(Number(p.value)),
            },
          },
        ],
      };
    }
    if (jobTop10Tab === "avgDur") {
      const vals = rows.map((r) =>
        r.avgDurationMs != null && Number.isFinite(Number(r.avgDurationMs)) ? Number(r.avgDurationMs) : 0,
      );
      return {
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          textStyle: { fontSize: 12 },
          formatter: (p) => {
            const x = Array.isArray(p) ? p[0] : p;
            const idx = x?.dataIndex;
            const row = typeof idx === "number" ? rows[idx] : null;
            if (!row) return "";
            return `${row.jobName ?? row.jobId}<br/>${formatDurationMs(Number(row.avgDurationMs))}`;
          },
        },
        grid: { left: 120, right: 72, top: 8, bottom: 8 },
        xAxis: { type: "value", axisLabel: { fontSize: 10, color: "#64748b", formatter: (v) => formatAvgMsAxis(Number(v)) } },
        yAxis: { type: "category", data: names, axisLabel: { fontSize: 10, color: "#64748b", width: 110, overflow: "truncate" } },
        series: [
          {
            type: "bar",
            data: vals,
            barMaxWidth: 18,
            itemStyle: { color: "#6366f1" },
            label: {
              show: true,
              position: "right",
              distance: 6,
              fontSize: 10,
              color: "#64748b",
              formatter: (p) => formatDurationMs(Number(p.value)),
            },
          },
        ],
      };
    }
    if (jobTop10Tab === "successRate") {
      const vals = rows.map((r) =>
        r.successRatePct != null && Number.isFinite(Number(r.successRatePct)) ? Number(r.successRatePct) : 0,
      );
      return {
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          textStyle: { fontSize: 12 },
          formatter: (p) => {
            const x = Array.isArray(p) ? p[0] : p;
            const idx = x?.dataIndex;
            const row = typeof idx === "number" ? rows[idx] : null;
            if (!row) return "";
            return `${row.jobName ?? row.jobId}<br/>${srLbl}: ${formatPct(row.successRatePct)}<br/>${runsLbl}: ${row.runCount ?? 0}<br/>${okLbl}: ${row.successCount ?? 0}<br/>${failLbl}: ${row.failureCount ?? 0}`;
          },
        },
        grid: { left: 120, right: 52, top: 8, bottom: 8 },
        xAxis: {
          type: "value",
          min: 0,
          max: 100,
          axisLabel: { fontSize: 10, color: "#64748b", formatter: (v) => `${v}%` },
        },
        yAxis: { type: "category", data: names, axisLabel: { fontSize: 10, color: "#64748b", width: 110, overflow: "truncate" } },
        series: [
          {
            type: "bar",
            data: vals,
            barMaxWidth: 18,
            itemStyle: { color: "#22c55e" },
            label: {
              show: true,
              position: "right",
              distance: 6,
              fontSize: 10,
              color: "#64748b",
              formatter: (p) => formatPct(Number(p.value)),
            },
          },
        ],
      };
    }
    const vals = rows.map((r) => Number(r.totalTokens) || 0);
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        textStyle: { fontSize: 12 },
        formatter: (p) => {
          const x = Array.isArray(p) ? p[0] : p;
          const idx = x?.dataIndex;
          const row = typeof idx === "number" ? rows[idx] : null;
          if (!row) return "";
          return `${row.jobName ?? row.jobId}<br/>${tokLbl}: ${row.totalTokens ?? 0}`;
        },
      },
      grid: { left: 120, right: 52, top: 8, bottom: 8 },
      xAxis: {
        type: "value",
        name: intl.get("scheduledTasks.runOverview.chartTokenAxis"),
        axisLabel: { fontSize: 10, color: "#64748b" },
      },
      yAxis: { type: "category", data: names, axisLabel: { fontSize: 10, color: "#64748b", width: 110, overflow: "truncate" } },
      series: [
        {
          type: "bar",
          data: vals,
          barMaxWidth: 18,
          itemStyle: { color: "#8b5cf6" },
          label: {
            show: true,
            position: "right",
            distance: 6,
            fontSize: 10,
            color: "#64748b",
            formatter: (p) => String(Math.round(Number(p.value) || 0)),
          },
        },
      ],
    };
  }, [
    jobTop10Tab,
    byRunCount,
    byFailCount,
    byMaxDurationMs,
    byAvgDurationMs,
    bySuccessRate,
    byTokenTotal,
  ]);

  /**
   * 日历热力图：与 `trend` 同源；左侧月份、上侧星期、每月按周历排布；格内以「执行次数 / 失败次数 / 成功率」单行展示；格底色按当日成败语义（灰/绿/黄/红）。
   */
  const dailyHeatmap = useMemo(() => {
    /** @type {Map<string, { ok: number, fail: number, other: number, total: number }>} */
    const byDay = new Map();
    for (const t of trend) {
      const d = normalizeTrendDayLabel(t.day);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const ok = Number(t.successCount) || 0;
      const fail = Number(t.failureCount) || 0;
      const totFromRow =
        t.totalCount != null && Number.isFinite(Number(t.totalCount))
          ? Math.max(0, Math.floor(Number(t.totalCount)))
          : null;
      const other = totFromRow != null ? Math.max(0, totFromRow - ok - fail) : 0;
      const total = totFromRow != null ? totFromRow : ok + fail + other;
      const prev = byDay.get(d);
      if (prev) {
        byDay.set(d, {
          ok: prev.ok + ok,
          fail: prev.fail + fail,
          other: prev.other + other,
          total: prev.total + total,
        });
      } else {
        byDay.set(d, { ok, fail, other, total });
      }
    }

    let startYmd = isoToLocalDayStr(chartRange.startIso);
    let endYmd = isoToLocalDayStr(chartRange.endIso);
    const sortedFromData = [...byDay.keys()].sort();
    if (!startYmd || !endYmd) {
      if (sortedFromData.length) {
        startYmd = startYmd ?? sortedFromData[0];
        endYmd = endYmd ?? sortedFromData[sortedFromData.length - 1];
      }
    }
    if (!startYmd || !endYmd) return null;
    if (startYmd > endYmd) {
      const x = startYmd;
      startYmd = endYmd;
      endYmd = x;
    }

    let maxTotal = 0;
    let maxFail = 0;
    for (const [k, v] of byDay) {
      if (k >= startYmd && k <= endYmd) {
        maxTotal = Math.max(maxTotal, v.total);
        maxFail = Math.max(maxFail, v.fail);
      }
    }

    const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
    const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
    const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const weekdayShort = [];
    for (let i = 0; i < 7; i += 1) {
      const dt = new Date(2024, 0, 1 + i);
      weekdayShort.push(weekdayFmt.format(dt));
    }

    const monthWeekBlocks = monthsInRangeInclusive(startYmd, endYmd).map(({ y, m }) => ({
      key: `${y}-${String(m).padStart(2, "0")}`,
      label: monthFmt.format(new Date(y, m - 1, 1)),
      weekRows: buildMonthWeekRowsMonFirst(y, m, startYmd, endYmd, byDay),
    }));

    if (!monthWeekBlocks.length) return null;

    return { monthWeekBlocks, weekdayShort, maxTotal, maxFail, startYmd, endYmd };
  }, [trend, chartRange.startIso, chartRange.endIso]);

  useLayoutEffect(() => {
    if (!dailyHeatmap) return;
    if (heatmapMetric === "successRate") {
      setSrFilterMin(0);
      setSrFilterMax(100);
    } else if (heatmapMetric === "total") {
      setTotalFilterMin(0);
      setTotalFilterMax(Math.max(1, dailyHeatmap.maxTotal));
    } else {
      setFailFilterMin(0);
      setFailFilterMax(Math.max(1, dailyHeatmap.maxFail));
    }
  }, [heatmapMetric, dailyHeatmap?.startYmd, dailyHeatmap?.endYmd]);

  /** 数据上限缩小后钳制区间，避免滑块越界；不依赖此 effect 做「默认全量」初始化（由上方 useLayoutEffect 负责） */
  useEffect(() => {
    if (!dailyHeatmap) return;
    const mt = Math.max(1, dailyHeatmap.maxTotal);
    const mf = Math.max(1, dailyHeatmap.maxFail);
    setTotalFilterMin((lo) => Math.max(0, Math.min(lo, mt)));
    setTotalFilterMax((hi) => Math.min(hi, mt));
    setFailFilterMin((lo) => Math.max(0, Math.min(lo, mf)));
    setFailFilterMax((hi) => Math.min(hi, mf));
  }, [dailyHeatmap?.maxTotal, dailyHeatmap?.maxFail]);

  if (loading && !charts) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("common.loadingList")}</p>;
  }

  const hasJobTop10Any =
    byRunCount.length > 0 ||
    byFailCount.length > 0 ||
    byMaxDurationMs.length > 0 ||
    byAvgDurationMs.length > 0 ||
    bySuccessRate.length > 0 ||
    byTokenTotal.length > 0;
  const hasAnyChart =
    trendOption ||
    pieOption ||
    failureReasonPieOption ||
    jobTop10BarOption ||
    hasJobTop10Any ||
    dailyHeatmap;

  const heatmapCard = (
      <div className="w-full min-w-0 rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div
          className={[
            "flex min-w-0 gap-2",
            dailyHeatmap ? "flex-wrap items-center justify-between gap-x-3 gap-y-1.5" : "",
          ].join(" ")}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 shrink-0 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {intl.get("scheduledTasks.runOverview.chartCalendarTitle")}
            </h3>
            {dailyHeatmap ? (
              <details className="relative shrink-0 [&_summary::-webkit-details-marker]:hidden">
                <summary
                  className="flex h-[28px] list-none cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-800 sm:h-[30px] sm:text-xs"
                  aria-label={intl.get("scheduledTasks.runOverview.chartCalendarDisplayMenuAria")}
                >
                  <Icon name="chevron" className="h-3.5 w-3.5 text-slate-500 opacity-90 dark:text-slate-400" />
                  <span>{intl.get("scheduledTasks.runOverview.chartCalendarDisplayMenu")}</span>
                </summary>
                <div
                  className="absolute left-0 top-[calc(100%+4px)] z-40 min-w-[13rem] rounded-lg border border-slate-200 bg-white py-2 shadow-lg dark:border-slate-600 dark:bg-gray-900"
                  role="group"
                  aria-label={intl.get("scheduledTasks.runOverview.chartCalendarDisplayMenuAria")}
                  onClick={(e) => e.stopPropagation()}
                >
                  {(
                    [
                      ["dates", "scheduledTasks.runOverview.chartCalendarShowDates"],
                      ["totalRuns", "scheduledTasks.runOverview.chartCalendarDisplayOptTotalRuns"],
                      ["failures", "scheduledTasks.runOverview.chartCalendarDisplayOptFailures"],
                      ["successRate", "scheduledTasks.runOverview.chartCalendarDisplayOptSuccessRate"],
                    ]
                  ).map(([key, labelKey]) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800 sm:text-xs"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-primary accent-primary focus:ring-primary/40 dark:border-slate-500 dark:bg-slate-900"
                        checked={Boolean(heatmapDisplay[/** @type {"dates"|"totalRuns"|"failures"|"successRate"} */ (key)])}
                        onChange={(e) =>
                          setHeatmapDisplay((prev) => ({
                            ...prev,
                            [key]: e.target.checked,
                          }))
                        }
                      />
                      <span>{intl.get(labelKey)}</span>
                    </label>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
          {dailyHeatmap ? (
            <div
              className="flex shrink-0 flex-wrap items-center justify-end gap-1"
              role="group"
              aria-label={intl.get("scheduledTasks.runOverview.chartCalendarMetricPickerAria")}
            >
              {[
                ["total", "scheduledTasks.runOverview.chartCalendarMetricTotal"],
                ["failures", "scheduledTasks.runOverview.chartCalendarMetricFailures"],
                ["successRate", "scheduledTasks.runOverview.chartCalendarMetricSuccessRate"],
              ].map(([key, labelKey]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setHeatmapMetric(/** @type {"total" | "failures" | "successRate"} */ (key))}
                  className={[
                    "h-[26px] shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none transition sm:h-[28px] sm:px-2.5 sm:text-xs",
                    heatmapMetric === key
                      ? "border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/25 dark:bg-primary/15 dark:text-primary-200"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800/80",
                  ].join(" ")}
                >
                  {intl.get(labelKey)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {dailyHeatmap ? (
          <div className="mt-1.5 w-full min-w-0 space-y-3">
            <p className="text-left text-[10px] tabular-nums text-slate-500 dark:text-slate-400 sm:text-[11px]">
              {dailyHeatmap.startYmd} — {dailyHeatmap.endYmd}
            </p>
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex gap-2">
                  <div className="w-[4.75rem] shrink-0" aria-hidden />
                  <div className="grid min-w-0 flex-1 grid-cols-7 gap-0.5">
                    {dailyHeatmap.weekdayShort.map((w, wi) => (
                      <div
                        key={`wd-${wi}`}
                        className="py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                      >
                        {w}
                      </div>
                    ))}
                  </div>
                </div>

                {dailyHeatmap.monthWeekBlocks.map((block) => (
                  <div key={block.key} className="flex gap-2">
                    <div className="sticky left-0 z-[1] flex w-[4.75rem] shrink-0 items-start bg-white py-1 pr-1 text-left text-[11px] font-semibold leading-snug text-slate-700 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.12)] dark:bg-gray-900 dark:text-slate-200 dark:shadow-[4px_0_14px_-4px_rgba(0,0,0,0.5)]">
                      {block.label}
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {block.weekRows.map((row, wi) => (
                        <div key={`${block.key}-r${wi}`} className="grid grid-cols-7 gap-0.5">
                          {row.map((c, ci) =>
                            c.kind === "empty" ? (
                              <div
                                key={`e-${block.key}-${wi}-${ci}`}
                                className="min-h-[44px] rounded-sm bg-slate-50/70 dark:bg-slate-900/45"
                                aria-hidden
                              />
                            ) : (
                              <div
                                key={c.date}
                                title={[
                                  c.date,
                                  `${intl.get("scheduledTasks.runOverview.chartCalendarTooltipTotal")}: ${c.total}`,
                                  `${intl.get("scheduledTasks.runOverview.chartTrendSeriesSuccess")}: ${c.ok}`,
                                  `${intl.get("scheduledTasks.runOverview.chartTrendSeriesFailure")}: ${c.fail}`,
                                  `${intl.get("scheduledTasks.runOverview.chartTrendSeriesOther")}: ${c.other}`,
                                  `${intl.get("scheduledTasks.runOverview.chartCalendarTooltipSuccessRate")}: ${
                                    c.total > 0 ? `${((c.ok / c.total) * 100).toFixed(1)}%` : "—"
                                  }`,
                                  heatmapMetric === "successRate" && (srFilterMin > 0 || srFilterMax < 100)
                                    ? `\n${intl.get("scheduledTasks.runOverview.chartCalendarSrFilterActive")}: ${srFilterMin}%–${srFilterMax}%`
                                    : "",
                                  heatmapMetric === "total" &&
                                  (totalFilterMin > 0 || totalFilterMax < Math.max(1, dailyHeatmap.maxTotal))
                                    ? `\n${intl.get("scheduledTasks.runOverview.chartCalendarCountFilterActive")}: ${totalFilterMin}–${totalFilterMax}`
                                    : "",
                                  heatmapMetric === "failures" &&
                                  (failFilterMin > 0 || failFilterMax < Math.max(1, dailyHeatmap.maxFail))
                                    ? `\n${intl.get("scheduledTasks.runOverview.chartCalendarCountFilterActive")}: ${failFilterMin}–${failFilterMax}`
                                    : "",
                                ]
                                  .filter(Boolean)
                                  .join("\n")}
                                className={[
                                  "relative flex flex-col items-center justify-center rounded-sm px-0.5 pb-0.5 ring-1 ring-inset ring-slate-200/55 transition hover:z-[2] hover:ring-2 hover:ring-primary/35 dark:ring-slate-600/65",
                                  heatmapCellPaddingClass(heatmapDisplay),
                                  dayHeatmapOutcomeBgClass(c),
                                  heatmapMetric === "successRate" &&
                                    successRateCellDimmed(daySuccessRatePct(c.ok, c.total), srFilterMin, srFilterMax)
                                    ? "opacity-[0.28] saturate-[0.45] contrast-[0.92] grayscale-[0.35]"
                                    : "",
                                  heatmapMetric === "total" &&
                                    countRangeCellDimmed(c.total, totalFilterMin, totalFilterMax, dailyHeatmap.maxTotal)
                                    ? "opacity-[0.28] saturate-[0.45] contrast-[0.92] grayscale-[0.35]"
                                    : "",
                                  heatmapMetric === "failures" &&
                                    countRangeCellDimmed(c.fail, failFilterMin, failFilterMax, dailyHeatmap.maxFail)
                                    ? "opacity-[0.28] saturate-[0.45] contrast-[0.92] grayscale-[0.35]"
                                    : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                {heatmapDisplay.dates ? (
                                  <span
                                    className={[
                                      "pointer-events-none absolute right-0.5 top-0.5 z-[1] text-sm font-bold tabular-nums leading-none sm:text-base",
                                      dayHeatmapCornerDateClass(c),
                                    ].join(" ")}
                                    aria-hidden
                                  >
                                    {heatmapCornerDateLabel(c.date)}
                                  </span>
                                ) : null}
                                {heatmapDisplay.totalRuns ||
                                heatmapDisplay.failures ||
                                heatmapDisplay.successRate ? (
                                  <p className="w-full min-w-0 truncate text-center text-xs font-bold leading-snug tabular-nums tracking-tight sm:text-[13px]">
                                    {(() => {
                                      const rows = [];
                                      const hd = heatmapDisplay;
                                      if (hd.totalRuns) {
                                        rows.push({
                                          key: "t",
                                          node: (
                                            <span className="text-blue-700 drop-shadow-sm dark:text-blue-200">
                                              {c.total > 999 ? "999+" : c.total}
                                            </span>
                                          ),
                                        });
                                      }
                                      if (hd.failures) {
                                        rows.push({
                                          key: "f",
                                          node: (
                                            <span className="text-rose-700 drop-shadow-sm dark:text-rose-100">
                                              {c.fail > 999 ? "999+" : c.fail}
                                            </span>
                                          ),
                                        });
                                      }
                                      if (hd.successRate) {
                                        rows.push({
                                          key: "sr",
                                          node: (
                                            <span className="text-slate-900 drop-shadow-sm dark:text-white">
                                              {formatDaySuccessRateLabel(c.ok, c.total)}
                                            </span>
                                          ),
                                        });
                                      }
                                      return rows.map((row, idx) => (
                                        <Fragment key={row.key}>
                                          {idx > 0 ? (
                                            <span className="mx-0.5 font-normal text-slate-500 dark:text-slate-400">
                                              /
                                            </span>
                                          ) : null}
                                          {row.node}
                                        </Fragment>
                                      ));
                                    })()}
                                  </p>
                                ) : null}
                              </div>
                            ),
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <aside
                className={[
                  "flex shrink-0 flex-col items-center justify-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-700",
                  "lg:w-[5.5rem] lg:border-l lg:border-t-0 lg:pl-3 lg:pt-1",
                ].join(" ")}
                aria-label={`${intl.get("scheduledTasks.runOverview.chartCalendarVisualLow")}–${intl.get("scheduledTasks.runOverview.chartCalendarVisualHigh")}`}
              >
                {heatmapMetric === "successRate" ? (
                  <SuccessRateVerticalRangeSlider
                    min={srFilterMin}
                    max={srFilterMax}
                    setMin={setSrFilterMin}
                    setMax={setSrFilterMax}
                  />
                ) : heatmapMetric === "total" ? (
                  <CountVerticalRangeSlider
                    kind="total"
                    domainMax={Math.max(1, dailyHeatmap.maxTotal)}
                    min={totalFilterMin}
                    max={totalFilterMax}
                    setMin={setTotalFilterMin}
                    setMax={setTotalFilterMax}
                  />
                ) : (
                  <CountVerticalRangeSlider
                    kind="failures"
                    domainMax={Math.max(1, dailyHeatmap.maxFail)}
                    min={failFilterMin}
                    max={failFilterMax}
                    setMin={setFailFilterMin}
                    setMax={setFailFilterMax}
                  />
                )}
              </aside>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{intl.get("scheduledTasks.runOverview.chartEmpty")}</p>
        )}
      </div>
  );

  if (heatmapOnly) {
    return <div className={`w-full min-w-0 ${loading ? "opacity-70" : ""}`}>{heatmapCard}</div>;
  }

  return (
    <div className={`space-y-4 ${loading ? "opacity-70" : ""}`}>
      {heatmapCard}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:items-stretch">
        <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:col-span-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.runOverview.chartTrendTitle")}</h3>
          {trendOption ? (
            <div className="mt-2 w-full min-w-0">
              <ReactECharts
                option={trendOption}
                style={{ height: 300, width: "100%", minHeight: 300 }}
                opts={{ renderer: "canvas" }}
                notMerge
                lazyUpdate
              />
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{intl.get("scheduledTasks.runOverview.chartEmpty")}</p>
          )}
        </div>
        <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:col-span-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.runOverview.chartStatusPieTitle")}</h3>
          {pieOption ? (
            <ReactECharts option={pieOption} style={{ height: 300, width: "100%", minHeight: 280 }} notMerge lazyUpdate opts={{ renderer: "canvas" }} />
          ) : (
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{intl.get("scheduledTasks.runOverview.chartEmpty")}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {intl.get("scheduledTasks.runOverview.jobTop10AnalysisTitle")}
        </h3>
        <div
          className="mt-2 flex w-full min-w-0 flex-nowrap items-stretch gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:thin]"
          role="tablist"
          aria-label={intl.get("scheduledTasks.runOverview.jobTop10AnalysisTitle")}
        >
          {[
            ["runCount", "scheduledTasks.runOverview.jobTop10Tab.runCount"],
            ["failCount", "scheduledTasks.runOverview.jobTop10Tab.failCount"],
            ["maxDur", "scheduledTasks.runOverview.jobTop10Tab.maxDur"],
            ["avgDur", "scheduledTasks.runOverview.jobTop10Tab.avgDur"],
            ["successRate", "scheduledTasks.runOverview.jobTop10Tab.successRate"],
            ["tokenTotal", "scheduledTasks.runOverview.jobTop10Tab.tokenTotal"],
          ].map(([key, labelKey]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={jobTop10Tab === key}
              className={[
                "shrink-0 whitespace-nowrap rounded-lg border px-2 py-1.5 text-center text-xs font-medium transition",
                jobTop10Tab === key
                  ? "border-primary bg-primary/10 text-primary dark:border-primary/80 dark:bg-primary/15"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500",
              ].join(" ")}
              onClick={() => setJobTop10Tab(key)}
            >
              {intl.get(labelKey)}
            </button>
          ))}
        </div>
        {jobTop10BarOption ? (
          <div className="mt-3 w-full min-w-0">
            <ReactECharts
              option={jobTop10BarOption}
              style={{
                height: Math.max(
                  220,
                  (jobTop10Tab === "runCount"
                    ? byRunCount
                    : jobTop10Tab === "failCount"
                      ? byFailCount
                      : jobTop10Tab === "maxDur"
                        ? byMaxDurationMs
                        : jobTop10Tab === "avgDur"
                          ? byAvgDurationMs
                          : jobTop10Tab === "successRate"
                            ? bySuccessRate
                            : byTokenTotal
                  ).length * 36,
                ),
                width: "100%",
              }}
              notMerge
              lazyUpdate
              opts={{ renderer: "canvas" }}
            />
          </div>
        ) : (
          <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">{intl.get("scheduledTasks.runOverview.chartEmpty")}</p>
        )}
        </div>

        <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.runOverview.chartFailureReasonPieTitle")}</h3>
          {failureReasonPieOption ? (
            <div className="mt-2 min-h-0 flex-1">
              <ReactECharts
                option={failureReasonPieOption}
                style={{ height: 300, width: "100%", minHeight: 260 }}
                notMerge
                lazyUpdate
                opts={{ renderer: "canvas" }}
              />
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{intl.get("scheduledTasks.runOverview.chartEmpty")}</p>
          )}
        </div>
      </div>

      {!hasAnyChart ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">{intl.get("scheduledTasks.runOverview.chartEmpty")}</p>
      ) : null}
    </div>
  );
}
