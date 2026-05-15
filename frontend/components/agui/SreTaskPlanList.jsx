import { useEffect, useMemo, useState } from "react";

const STATUS_META = {
  done: {
    label: "已完成",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800",
  },
  running: {
    label: "进行中",
    dot: "bg-blue-500 animate-pulse",
    badge: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800",
  },
  pending: {
    label: "等待中",
    dot: "bg-gray-300 dark:bg-gray-600",
    badge: "bg-gray-50 text-gray-500 ring-gray-200 dark:bg-gray-900/60 dark:text-gray-400 dark:ring-gray-700",
  },
};

function Chevron({ open }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function StatusIcon({ status }) {
  if (status === "done") {
    return (
      <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.86-9.84a.75.75 0 00-1.22-.88l-3.236 4.53-1.58-1.58a.75.75 0 10-1.06 1.06l2.2 2.2a.75.75 0 001.14-.094l3.756-5.236z" clipRule="evenodd" />
      </svg>
    );
  }
  return <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[status]?.dot ?? STATUS_META.pending.dot}`} />;
}

function normalizeDetails(details) {
  return String(details ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 去掉连续重复行（规划正文或模型输出可能带重复换行） */
function dedupeConsecutiveLines(lines) {
  return lines.filter((line, i) => i === 0 || line !== lines[i - 1]);
}

function taskDetailLines(task) {
  const lines = dedupeConsecutiveLines(normalizeDetails(task?.details));
  if (task?.spawnToolCallId) lines.push(`工具调用：${task.spawnToolCallId}`);
  if (task?.childSessionKey) lines.push(`子会话：${task.childSessionKey}`);
  return lines;
}

function taskDetailsSummaryLine(details) {
  return String(details ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean);
}

export default function SreTaskPlanList({ plan, variant = "chat", className = "" }) {
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const isWorkspace = variant === "workspace";
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const runningTask = tasks.filter((t) => t.status === "running").at(-1);

  useEffect(() => {
    if (!runningTask?.key) return;
    setOpenKeys((prev) => {
      if (prev.has(runningTask.key)) return prev;
      const next = new Set(prev);
      next.add(runningTask.key);
      return next;
    });
  }, [runningTask?.key]);

  const progressText = useMemo(() => {
    const done = Number(plan?.doneCount ?? 0);
    const total = Number(plan?.totalCount ?? tasks.length);
    return `${done}/${total}`;
  }, [plan?.doneCount, plan?.totalCount, tasks.length]);

  if (!plan || tasks.length === 0) return null;

  const toggle = (key) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section
      className={[
        "min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100",
        isWorkspace ? "w-full" : "mt-1",
        className,
      ].join(" ")}
    >
      <div className="border-b border-gray-100 px-3 py-2.5 dark:border-gray-800">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path d="M3.5 4.75A1.75 1.75 0 015.25 3h9.5a1.75 1.75 0 011.75 1.75v10.5A1.75 1.75 0 0114.75 17h-9.5a1.75 1.75 0 01-1.75-1.75V4.75zm3.25 2a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" />
                </svg>
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-[12px] font-semibold">SRE 任务列表</h3>
                <p className="truncate text-[11px] text-gray-500 dark:text-gray-400" title={plan.fullId}>
                  {plan.fullId}
                </p>
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{progressText}</p>
            <p className="text-[10px] text-gray-400">任务进度</p>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(100, plan.progress ?? 0))}%` }}
          />
        </div>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {tasks.map((task) => {
          const open = openKeys.has(task.key);
          const meta = STATUS_META[task.status] ?? STATUS_META.pending;
          const details = taskDetailLines(task);
          const summary = taskDetailsSummaryLine(task.details);
          return (
            <div key={task.key} className={task.status === "running" ? "bg-blue-50/45 dark:bg-blue-950/20" : ""}>
              <button
                type="button"
                onClick={() => toggle(task.key)}
                aria-expanded={open}
                className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800/70"
              >
                <StatusIcon status={task.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[11px] font-medium text-gray-500 dark:text-gray-400">{task.phase}</span>
                    <span className="truncate text-[12px] font-semibold text-gray-800 dark:text-gray-100">{task.title}</span>
                  </div>
                  {summary && !open ? (
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-gray-500 dark:text-gray-400" title={summary}>
                      {summary}
                    </p>
                  ) : null}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${meta.badge}`}>
                  {meta.label}
                </span>
                <Chevron open={open} />
              </button>
              {open && (
                <div className="px-9 pb-3 pr-3">
                  {details.length ? (
                    <ul className="space-y-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                      {details.map((line, i) => (
                        <li key={i} className="break-words">{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400">暂无任务详情</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
