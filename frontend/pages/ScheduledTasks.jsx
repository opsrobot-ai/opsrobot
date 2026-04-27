import { useCallback, useEffect, useMemo, useState } from "react";
import intl from "react-intl-universal";

const TABS = [
  { key: "overview", labelKey: "scheduledTasks.tabOverview" },
  { key: "detail", labelKey: "scheduledTasks.tabDetail" },
];

/** 与 .env 中 VITE_API_URL 对齐：空则用当前站点下的 /api/... */
function cronApiPath(path) {
  const raw = typeof import.meta.env.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL.trim() : "";
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!raw) return p;
  const base = raw.replace(/\/$/, "");
  if (base.startsWith("http://") || base.startsWith("https://")) {
    if (p.startsWith("/api/") && /\/api$/i.test(base)) return `${base}${p.slice(4)}`;
    return `${base}${p}`;
  }
  if (base === "/api" && p.startsWith("/api/")) return p;
  return `${base}${p}`;
}

/**
 * GET 列表接口：必须是 application/json 且 body 为 JSON 数组，避免把 index.html 当成「空数据」。
 * @param {string} path 如 /api/cron-runs?limit=200
 */
async function fetchJsonArray(path) {
  const res = await fetch(cronApiPath(path));
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const err = text ? JSON.parse(text) : {};
      if (err && typeof err.error === "string") msg = err.error;
    } catch {
      if (text && text.length < 200) msg = text;
    }
    throw new Error(msg);
  }
  if (!ct.includes("application/json")) {
    throw new Error(
      "接口未返回 JSON（可能 /api 未代理到后端，或请求到了前端静态页）。请使用 npm run dev，或 npm run preview 时先启动 API 并配置代理。",
    );
  }
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("响应不是合法 JSON");
  }
  if (!Array.isArray(data)) {
    throw new Error(typeof data === "object" && data && "error" in data ? String(data.error) : "接口应返回 JSON 数组");
  }
  return data;
}

function formatTs(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return "—";
  try {
    return new Date(Number(ms)).toLocaleString();
  } catch {
    return String(ms);
  }
}

function pickDuration(row) {
  const la = row?.log_attributes;
  if (la && typeof la === "object" && la.durationMs != null) return `${la.durationMs} ms`;
  return "—";
}

function pickSummary(row) {
  const la = row?.log_attributes;
  if (la && typeof la === "object" && typeof la.summary === "string") {
    const s = la.summary.replace(/\s+/g, " ").trim();
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  }
  return "—";
}

function statusClass(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "ok" || s === "success") {
    return "bg-emerald-50 text-emerald-800 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  if (s === "error" || s === "failed") {
    return "bg-rose-50 text-rose-800 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-200";
  }
  return "bg-gray-100 text-gray-700 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-300";
}

export default function ScheduledTasks() {
  const [activeTab, setActiveTab] = useState("overview");
  const [jobs, setJobs] = useState([]);
  const [runs, setRuns] = useState([]);
  const [jobFilter, setJobFilter] = useState("");
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [errorJobs, setErrorJobs] = useState("");
  const [errorRuns, setErrorRuns] = useState("");

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    setErrorJobs("");
    try {
      const data = await fetchJsonArray("/api/cron-jobs");
      setJobs(data);
    } catch (e) {
      setErrorJobs(e instanceof Error ? e.message : String(e));
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const loadRuns = useCallback(async (jobId) => {
    setLoadingRuns(true);
    setErrorRuns("");
    try {
      const q = new URLSearchParams();
      if (jobId) q.set("jobId", jobId);
      q.set("limit", "200");
      const data = await fetchJsonArray(`/api/cron-runs?${q.toString()}`);
      setRuns(data);
    } catch (e) {
      setErrorRuns(e instanceof Error ? e.message : String(e));
      setRuns([]);
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  // 进入「定时任务」页即拉取 Doris（不依赖是否点了「任务详情」子 Tab，避免停留在概览时运行记录一直为空）
  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    loadRuns(jobFilter);
  }, [jobFilter, loadRuns]);

  const jobOptions = useMemo(() => {
    return jobs.map((j) => ({
      id: j.id,
      label: j.name ? `${j.name} (${j.id})` : j.id,
    }));
  }, [jobs]);

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-100 dark:border-gray-700/60">
        <nav className="flex gap-1" aria-label={intl.get("page.scheduledTasks.title")}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
              ].join(" ")}
            >
              {intl.get(tab.labelKey)}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "overview" ? (
        <section className="app-card p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {intl.get("scheduledTasks.overview.title")}
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {intl.get("scheduledTasks.overview.placeholder")}
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          <section className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {intl.get("scheduledTasks.detail.title")}
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {intl.get("scheduledTasks.detail.placeholder")}
            </p>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {intl.get("scheduledTasks.filterJob")}
                </span>
                <select
                  value={jobFilter}
                  onChange={(e) => setJobFilter(e.target.value)}
                  className="app-input min-w-[240px] px-3 py-2"
                  disabled={loadingJobs}
                >
                  <option value="">{intl.get("scheduledTasks.filterAllJobs")}</option>
                  {jobOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  loadJobs();
                  loadRuns(jobFilter);
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {intl.get("scheduledTasks.refresh")}
              </button>
            </div>
            {errorJobs ? (
              <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{errorJobs}</p>
            ) : null}
          </section>

          <section className="app-card overflow-hidden p-0">
            <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {intl.get("scheduledTasks.runsTitle")}
              </h4>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {intl.get("scheduledTasks.runsHint")}
              </p>
            </div>
            {errorRuns ? (
              <p className="px-5 py-4 text-sm text-rose-600 dark:text-rose-400">{errorRuns}</p>
            ) : null}
            {loadingRuns ? (
              <p className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {intl.get("common.loadingList")}
              </p>
            ) : runs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {intl.get("common.noData")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-800/80">
                      <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        {intl.get("scheduledTasks.col.runId")}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        {intl.get("scheduledTasks.col.ts")}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        {intl.get("scheduledTasks.col.jobId")}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        {intl.get("scheduledTasks.col.agentId")}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        {intl.get("scheduledTasks.col.agentName")}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        {intl.get("scheduledTasks.col.jobName")}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        {intl.get("scheduledTasks.col.action")}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        {intl.get("scheduledTasks.col.status")}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        {intl.get("scheduledTasks.col.delivery")}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        {intl.get("scheduledTasks.col.model")}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        {intl.get("scheduledTasks.col.duration")}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        {intl.get("scheduledTasks.col.summary")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {runs.map((row, i) => (
                      <tr
                        key={`${row.id}-${row.ts}-${i}`}
                        className={i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/40" : "bg-white dark:bg-transparent"}
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-gray-800 dark:text-gray-200">
                          {row.id}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-600 dark:text-gray-400">
                          {formatTs(row.ts)}
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-2.5 font-mono text-xs text-gray-800 dark:text-gray-200" title={row.job_id}>
                          {row.job_id}
                        </td>
                        <td className="max-w-[120px] truncate px-4 py-2.5 font-mono text-xs text-gray-800 dark:text-gray-200" title={row.agent_id}>
                          {row.agent_id || "—"}
                        </td>
                        <td className="max-w-[140px] truncate px-4 py-2.5 text-gray-800 dark:text-gray-200" title={row.agent_name}>
                          {row.agent_name || "—"}
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-2.5 text-gray-800 dark:text-gray-200" title={row.job_name}>
                          {row.job_name || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-700 dark:text-gray-300">{row.action}</td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span
                            className={[
                              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                              statusClass(row.status),
                            ].join(" ")}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-600 dark:text-gray-400">{row.delivery_status}</td>
                        <td className="max-w-[140px] truncate px-4 py-2.5 text-gray-700 dark:text-gray-300" title={row.model}>
                          {row.model}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-600 dark:text-gray-400">{pickDuration(row)}</td>
                        <td className="max-w-[280px] px-4 py-2.5 text-gray-600 dark:text-gray-400" title={pickSummary(row)}>
                          {pickSummary(row)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
