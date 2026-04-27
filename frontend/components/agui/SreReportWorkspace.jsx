/**
 * SreReportWorkspace — SRE 阶段报告工作区（Tab 容器）
 *
 * 展示 5 个固定 Tab（环境感知 / 异常分析 / 根因推理 / 行动建议 / SRE报告），
 * 只显示已在对话中出现报告路径的阶段 Tab，实时解锁并自动切换至最新阶段。
 */
import { SreReportTabContent } from "./SreReportTabContent.jsx";

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

function TabSpinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
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
}) {
  const activeTab = tabs.find((t) => t.stage === activeTabId) ?? tabs[0] ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab 条 */}
      <div className="flex shrink-0 items-end gap-0 overflow-x-auto border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-900/50">
        {tabs.map((tab) => {
          const isActive = tab.stage === activeTab?.stage;
          const styles = STAGE_STYLES[tab.stage] ?? STAGE_STYLES.stage1;
          return (
            <button
              key={tab.stage}
              type="button"
              onClick={() => setActiveTabId(tab.stage)}
              className={`flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none ${
                isActive
                  ? styles.active
                  : "border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <span className={isActive ? "" : "opacity-60"}>{STAGE_ICONS[tab.stage]}</span>
              <span>{tab.label}</span>
              {tab.status === "loading" && (
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
