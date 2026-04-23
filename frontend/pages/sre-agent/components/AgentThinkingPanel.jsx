import { memo, useCallback, useEffect, useMemo, useState } from "react";

/**
 * Agent 思考过程：步骤列表 + 点击展开查看详情（detail、时间）
 */
const AgentThinkingPanel = memo(function AgentThinkingPanel({ steps, isRunning }) {
  const [expanded, setExpanded] = useState({});
  const [collapsed, setCollapsed] = useState(true);

  const doneStepCount = useMemo(
    () => steps.filter((s) => s.status === "done").length,
    [steps],
  );
  const latestStep = useMemo(
    () => [...steps].reverse().find((s) => s.status === "running") ?? steps[steps.length - 1] ?? null,
    [steps],
  );

  useEffect(() => {
    if (steps.length === 0) {
      setExpanded({});
      setCollapsed(true);
    }
  }, [steps.length]);

  useEffect(() => {
    const running = steps.filter((s) => s.status === "running").pop();
    if (running?.id) {
      setExpanded((e) => ({ ...e, [running.id]: true }));
    }
  }, [steps]);

  const toggle = useCallback((id) => {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => !v);
  }, []);

  const formatTime = useCallback((ts) => {
    if (ts == null) return "";
    try {
      return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "";
    }
  }, []);

  return (
    <div className="rounded-lg border border-gray-200/80 bg-white/90 shadow-sm dark:border-gray-600/60 dark:bg-gray-900/80">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="flex w-full items-center justify-between border-b border-gray-100 px-2.5 py-1.5 text-left transition hover:bg-gray-50/70 dark:border-gray-700/80 dark:hover:bg-gray-800/40"
        aria-expanded={!collapsed}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Agent 思考过程
          </p>
          <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
            {latestStep ? `最新任务：${latestStep.name}` : "暂无任务"}
            {latestStep?.status === "running" ? <span className="ml-1 text-primary">· 进行中</span> : null}
          </p>
        </div>
        <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
          {doneStepCount}/{steps.length} 步 {collapsed ? "▼" : "▲"}
        </span>
      </button>
      {!collapsed && (
        <div className="max-h-44 space-y-0.5 overflow-y-auto px-1 py-1">
        {steps.map((step) => {
          const id = step.id ?? step.name;
          const open = !!expanded[id];
          const hasDetail = Boolean(step.detail && String(step.detail).trim());
          return (
            <div key={id} className="rounded-md border border-transparent hover:border-gray-200/90 dark:hover:border-gray-600/80">
              <button
                type="button"
                onClick={() => toggle(id)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800/60"
                aria-expanded={open}
              >
                {step.status === "running" ? (
                  <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium ${step.status === "running" ? "text-primary" : "text-gray-700 dark:text-gray-200"}`}>
                      {step.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                      {open ? "▲" : "▼"}
                    </span>
                    {!hasDetail && !open && (
                      <span className="text-[10px] text-gray-400">点击展开</span>
                    )}
                  </div>
                  {!open && hasDetail && (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-400 dark:text-gray-500">{step.detail}</p>
                  )}
                </div>
              </button>
              {open && (
                <div className="border-t border-gray-100 px-2 pb-2 pt-1 dark:border-gray-700/80">
                  <div className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                    <span>开始 {formatTime(step.ts)}</span>
                    {step.status === "done" && step.finishedAt != null && (
                      <span>结束 {formatTime(step.finishedAt)}</span>
                    )}
                    {step.status === "done" && step.finishedAt != null && step.ts != null && (
                      <span className="tabular-nums">
                        耗时 {Math.max(0, step.finishedAt - step.ts)} ms
                      </span>
                    )}
                  </div>
                  {hasDetail ? (
                    <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">
                      {step.detail}
                    </p>
                  ) : (
                    <p className="text-[11px] italic text-gray-400 dark:text-gray-500">本步骤暂无详细说明</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
});

export default AgentThinkingPanel;
