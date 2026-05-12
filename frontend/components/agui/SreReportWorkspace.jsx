/**
 * SreReportWorkspace — SRE 阶段报告工作区（Tab 容器）
 *
 * 展示 5 个固定 Tab（环境感知 / 异常分析 / 根因推理 / 行动建议 / SRE报告），
 * 只显示已在对话中出现报告路径的阶段 Tab，实时解锁并自动切换至最新阶段。
 */
import { useEffect, useMemo, useState } from "react";
import { SreReportTabContent } from "./SreReportTabContent.jsx";
import { useSreChildSessionProgress } from "../../pages/sre-agent/hooks/useSreChildSessionProgress.js";
import { pickChildSessionKeyFromSessionList } from "../../lib/sreChildSessionProgress.js";

const STAGE_STYLES = {
  stage1: {
    active:   "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400",
    badge:    "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
    dot:      "bg-blue-500",
  },
  stage2: {
    active:   "border-b-2 border-amber-500 text-amber-600 dark:text-amber-400",
    badge:    "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
    dot:      "bg-amber-500",
  },
  stage3: {
    active:   "border-b-2 border-rose-500 text-rose-600 dark:text-rose-400",
    badge:    "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400",
    dot:      "bg-rose-500",
  },
  stage4: {
    active:   "border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400",
    badge:    "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
    dot:      "bg-emerald-500",
  },
  final: {
    active:   "border-b-2 border-violet-500 text-violet-600 dark:text-violet-400",
    badge:    "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
    dot:      "bg-violet-500",
  },
};

const STAGE_ICONS = {
  stage1: (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  stage2: (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  stage3: (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803M10.5 7.5v6m3-3h-6" />
    </svg>
  ),
  stage4: (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  final: (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
};

const TASK_STAGE_TO_REPORT_STAGE = {
  1: "stage1",
  2: "stage2",
  3: "stage3",
  4: "stage4",
};

function getTaskReportStage(task) {
  const m = String(task?.phase ?? "").match(/(?:stage|阶段)\s*(\d+)/i);
  if (!m) return `task-${task?.index ?? 0}`;
  return TASK_STAGE_TO_REPORT_STAGE[Number(m[1])] ?? `task-${task?.index ?? 0}`;
}

function getRunningTaskTab(task) {
  if (!task) return null;
  return {
    kind: "running_task",
    stage: getTaskReportStage(task),
    label: task.title || task.phase || "运行中",
    status: "running",
    task,
  };
}

function sessionProgressTimelineDotClass(role) {
  if (role === "用户") return "bg-blue-500 ring-blue-100 dark:ring-blue-950/60";
  if (role === "助手") return "bg-violet-500 ring-violet-100 dark:ring-violet-950/60";
  if (role === "工具结果") return "bg-amber-500 ring-amber-100 dark:ring-amber-950/60";
  return "bg-gray-400 ring-gray-100 dark:bg-gray-500 dark:ring-gray-800";
}

/** 子会话详情展开区：会话进度时间线 */
function SubagentSessionProgressTimeline({ rows, childSessionError, effectiveChildKey }) {
  if (!rows.length) {
    return (
      <p className="mt-1.5 text-[11px] text-gray-400">
        {childSessionError
          ? "无法加载进度（见上方错误）"
          : effectiveChildKey
            ? "暂无进度记录"
            : "尚无会话，无法拉取进度"}
      </p>
    );
  }

  return (
    <ol className="mt-1.5 max-h-64 list-none space-y-0 overflow-y-auto rounded-md border border-gray-100 bg-gray-50/40 py-1 pr-2 dark:border-gray-800 dark:bg-gray-950/40">
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1;
        const dotRing = sessionProgressTimelineDotClass(row.role);
        return (
          <li key={row.id} className="relative flex gap-2.5 pb-3 last:pb-1">
            <div className="relative flex w-5 shrink-0 justify-center pt-1">
              <span
                className={`relative z-10 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-gray-900 ${dotRing}`}
                aria-hidden
              />
              {!isLast ? (
                <span
                  className="absolute left-1/2 top-[18px] bottom-0 z-0 w-px -translate-x-1/2 bg-gray-200 dark:bg-gray-700"
                  aria-hidden
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div
                className="cursor-default truncate font-mono text-[11px] leading-5 text-gray-700 dark:text-gray-300"
                title={row.fullTooltip}
              >
                {row.oneLine}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TabSpinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function RunningTaskContent({ tab, taskPlan, sessionRows, reloadSessions }) {
  const [expanded, setExpanded] = useState(false);
  const task = tab.task;
  const childKeyDirect = String(task?.childSessionKey ?? "").trim();
  const listFallbackKey = useMemo(
    () =>
      childKeyDirect
        ? ""
        : pickChildSessionKeyFromSessionList(task, taskPlan, sessionRows),
    [childKeyDirect, task, taskPlan, sessionRows],
  );
  const effectiveChildKey = childKeyDirect || listFallbackKey;
  const keyInferredFromList = Boolean(!childKeyDirect && listFallbackKey);

  const {
    phase,
    summaryLine,
    error: childSessionError,
    refreshedAt,
    reload,
    toolName,
    toolCallId,
    replyPreview,
    sessionHistory,
  } = useSreChildSessionProgress(effectiveChildKey, { enabled: Boolean(effectiveChildKey) });

  const done = Number(taskPlan?.doneCount ?? 0);
  const total = Number(taskPlan?.totalCount ?? taskPlan?.tasks?.length ?? 0);
  const current = Math.min(total || 1, done + 1);
  const hasSpawnOnly = Boolean(String(task?.spawnToolCallId ?? "").trim());

  useEffect(() => {
    setExpanded(false);
  }, [task?.key, effectiveChildKey]);

  useEffect(() => {
    if (typeof reloadSessions !== "function") return;
    if (effectiveChildKey) return;
    if (!hasSpawnOnly) return;
    const t = setInterval(() => void reloadSessions(true), 5000);
    return () => clearInterval(t);
  }, [reloadSessions, effectiveChildKey, hasSpawnOnly]);

  const activityLine = (() => {
    if (!effectiveChildKey) {
      return hasSpawnOnly
        ? "等待 tool 返回子会话 key（流式）… 同时已加快刷新会话列表以便匹配"
        : "等待子智能体会话建立…";
    }
    if (childSessionError) return `子会话拉取失败：${childSessionError}`;
    if (phase === "tool_call") return `工具调用：${summaryLine}`;
    return `生成回复：${summaryLine}`;
  })();

  const refreshedLabel =
    typeof refreshedAt === "number"
      ? new Date(refreshedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : "";

  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="w-full max-w-2xl rounded-lg border border-blue-200 bg-white shadow-sm dark:border-blue-900/60 dark:bg-gray-900">
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <TabSpinner />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800">
                进行中
              </span>
              <span className="text-[12px] text-gray-500 dark:text-gray-400">
                {task?.phase || "当前阶段"} · {current}/{total || 1}
              </span>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="ml-auto inline-flex shrink-0 items-center rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                title={expanded ? "收起详情" : "展开详情"}
              >
                <svg
                  className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {task?.title || "SRE 任务执行中"}
            </h3>

            {!expanded ? (
              <div className="mt-2 space-y-1.5 text-[12px] leading-snug">
                 <p className="text-gray-700 dark:text-gray-300">
                  <span className="font-medium text-gray-800 dark:text-gray-200">调用智能体 · </span>
                  <span className="font-mono text-[11px]">{task?.agentId || "—"}</span>
                </p>
                <p
                  className="truncate text-gray-700 dark:text-gray-300"
                  title={effectiveChildKey || undefined}
                >
                  <span className="font-medium text-gray-800 dark:text-gray-200">子会话 · </span>
                  <span className="font-mono text-[11px] text-gray-600 dark:text-gray-400">
                    {effectiveChildKey || "—"}
                  </span>
                  {keyInferredFromList ? (
                    <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-500">（列表推断）</span>
                  ) : null}
                </p>
                <p
                  className={
                    childSessionError ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"
                  }
                >
                  <span className="font-medium text-gray-800 dark:text-gray-200">最新进度 · </span>
                  {activityLine}
                </p>
              </div>
            ) : null}

            {expanded ? (
              <div className="mt-3 space-y-3 border-t border-gray-100 pt-3 text-[12px] dark:border-gray-800">
                <div className="space-y-1.5">
                <p className="text-gray-700 dark:text-gray-300">
                    <span className="font-medium text-gray-800 dark:text-gray-200">调用智能体 · </span>
                    <span className="font-mono text-[11px]">{task?.agentId || "—"}</span>
                  </p>
                  <p className="break-all text-gray-700 dark:text-gray-300">
                    <span className="font-medium text-gray-800 dark:text-gray-200">会话 · </span>
                    <span className="font-mono text-[11px]">{effectiveChildKey || "—"}</span>
                    {keyInferredFromList ? (
                      <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-500">（列表推断）</span>
                    ) : null}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
                    会话进度 · 按时间升序（悬浮节点查看全文）
                  </p>
                  <SubagentSessionProgressTimeline
                    rows={sessionHistory}
                    childSessionError={childSessionError}
                    effectiveChildKey={effectiveChildKey}
                  />
                </div>

                {phase === "tool_call" && (toolName || toolCallId) ? (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-600 dark:text-gray-300">当前工具 · </span>
                    <span className="font-mono">{[toolName, toolCallId].filter(Boolean).join(" · ")}</span>
                  </p>
                ) : null}
                {phase === "generating_reply" && replyPreview ? (
                  <p className="line-clamp-3 text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-600 dark:text-gray-300">回复预览 · </span>
                    {replyPreview}
                  </p>
                ) : null}
                {refreshedLabel ? (
                  <p className="text-[11px] text-gray-400">上次刷新 · {refreshedLabel}</p>
                ) : null}
                {task?.spawnToolCallId ? (
                  <p className="break-all text-[11px] text-gray-500 dark:text-gray-500">
                    <span className="font-medium">Spawn · </span>
                    <span className="font-mono">{task.spawnToolCallId}</span>
                  </p>
                ) : null}
                {childSessionError ? (
                  <button
                    type="button"
                    onClick={() => void reload()}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-primary hover:text-primary dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    重试拉取子会话
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.max(6, Math.min(100, taskPlan?.progress ?? 0))}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabLoadingContent({ tab }) {
  const styles = STAGE_STYLES[tab.stage] ?? STAGE_STYLES.stage1;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-500">
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${styles.badge}`}>
        <TabSpinner />
      </div>
      <p className="text-sm font-medium">加载 {tab.label} 报告中…</p>
    </div>
  );
}

function TabErrorContent({ tab, onRetry }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-500">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-500 dark:bg-red-900/30">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-red-500 dark:text-red-400">加载失败</p>
        <p className="mt-0.5 text-xs text-gray-400">{tab.error}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-primary hover:text-primary dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          重试
        </button>
      )}
    </div>
  );
}

export default function SreReportWorkspace({
  tabs,
  activeTabId,
  setActiveTabId,
  onExecuteRecommendation,
  reportActionsDisabled = false,
  taskPlan = null,
  sessionRows = [],
  reloadSessions,
}) {
  const [localActiveStage, setLocalActiveStage] = useState(null);
  const runningTask = taskPlan?.tasks?.filter((t) => t.status === "running").at(-1) ?? null;
  const runningTaskTab = getRunningTaskTab(runningTask);
  const runningStageAlreadyReported = runningTaskTab && tabs.some((t) => t.stage === runningTaskTab.stage);
  const displayTabs = runningTaskTab && !runningStageAlreadyReported
    ? [...tabs, runningTaskTab]
    : tabs;

  useEffect(() => {
    if (runningTaskTab && !runningStageAlreadyReported) {
      setLocalActiveStage(runningTaskTab.stage);
    }
  }, [runningStageAlreadyReported, runningTaskTab?.stage]);

  useEffect(() => {
    setLocalActiveStage((stage) => (
      stage && !displayTabs.some((t) => t.stage === stage) ? null : stage
    ));
  }, [displayTabs]);

  const activeTab =
    displayTabs.find((t) => t.stage === localActiveStage) ??
    displayTabs.find((t) => t.stage === activeTabId) ??
    (runningTaskTab && !runningStageAlreadyReported ? runningTaskTab : null) ??
    displayTabs[0] ??
    null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab 条 */}
      <div className="flex shrink-0 items-end gap-0 overflow-x-auto border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-900/50">
        {displayTabs.map((tab) => {
          const isActive = tab.stage === activeTab?.stage;
          const styles = STAGE_STYLES[tab.stage] ?? STAGE_STYLES.stage1;
          return (
            <button
              key={tab.stage}
              type="button"
              onClick={() => {
                setLocalActiveStage(tab.stage);
                if (tab.kind !== "running_task") setActiveTabId(tab.stage);
              }}
              className={`flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none ${
                isActive
                  ? styles.active
                  : "border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <span className={isActive ? "" : "opacity-60"}>{STAGE_ICONS[tab.stage]}</span>
              <span>{tab.label}</span>
              {(tab.status === "loading" || tab.kind === "running_task") && (
                <span className="ml-0.5">
                  <TabSpinner />
                </span>
              )}
              {tab.status === "error" && (
                <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />
              )}
              {tab.status === "ready" && isActive && (
                <span className={`ml-0.5 h-1.5 w-1.5 rounded-full ${styles.dot}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* 内容区 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!activeTab ? (
          <WorkspaceEmpty />
        ) : activeTab.status === "loading" ? (
          <TabLoadingContent tab={activeTab} />
        ) : activeTab.status === "error" ? (
          <TabErrorContent tab={activeTab} />
        ) : activeTab.kind === "running_task" ? (
          <RunningTaskContent tab={activeTab} taskPlan={taskPlan} sessionRows={sessionRows} reloadSessions={reloadSessions} />
        ) : (
          <SreReportTabContent
            tab={activeTab}
            onExecuteRecommendation={onExecuteRecommendation}
            reportActionsDisabled={reportActionsDisabled}
          />
        )}
      </div>
    </div>
  );
}

function WorkspaceEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-gray-400 dark:text-gray-500">
      <svg className="mb-3 h-12 w-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
      </svg>
      <p className="text-sm font-medium">SRE 分析工作区</p>
      <p className="mt-1 text-xs">Agent 执行各阶段后，报告将在此实时展示</p>
    </div>
  );
}
