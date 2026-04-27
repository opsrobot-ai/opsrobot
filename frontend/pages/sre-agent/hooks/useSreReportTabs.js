import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SRE_REPORT_CONFIGS,
  extractSreReportPaths,
  getSreSessionId,
  getSreReportStageConfig,
  getSreSessionTimestamp,
} from "../../../lib/sreReportPathExtract.js";

/**
 * 从 messages 中扫描 SRE 阶段报告路径，拉取 Markdown，管理 Tab 状态。
 *
 * 返回值：
 *   tabs[]        — 当前最新 SRE 会话中已发现的 stage tab 列表（顺序固定 stage1→final）
 *   activeTabId   — 当前选中的 stage
 *   setActiveTabId — 手动切换（同时锁定自动切换）
 */
export function useSreReportTabs(messages) {
  const [tabDataMap, setTabDataMap] = useState({}); // { [stage]: { path, status, markdown, error, title } }
  const [activeTabId, setActiveTabIdState] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  const fetchedPaths = useRef(new Set());
  const userSelectedRef = useRef(false);

  // 从所有 assistant 消息中提取最新的 SRE 会话路径 map: sessionId → { stage → path }
  const latestSessionPaths = useMemo(() => {
    const sessionMap = {}; // sessionId → { stage → path }

    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const paths = extractSreReportPaths(msg.content || "");
      for (const p of paths) {
        const sessionId = getSreSessionId(p);
        if (!sessionId) continue;
        const cfg = getSreReportStageConfig(p);
        if (!cfg) continue;
        if (!sessionMap[sessionId]) sessionMap[sessionId] = {};
        sessionMap[sessionId][cfg.stage] = p;
      }
    }

    if (Object.keys(sessionMap).length === 0) return null;

    // 选择时间戳最大的 sessionId
    const latestId = Object.keys(sessionMap).reduce((best, id) =>
      getSreSessionTimestamp(id) > getSreSessionTimestamp(best) ? id : best,
    );
    return { sessionId: latestId, stages: sessionMap[latestId] };
  }, [messages]);

  // 当最新会话变化时（新会话 or reset），清空 tab 数据
  useEffect(() => {
    const newSessionId = latestSessionPaths?.sessionId ?? null;
    if (newSessionId !== currentSessionId) {
      setCurrentSessionId(newSessionId);
      setTabDataMap({});
      fetchedPaths.current.clear();
      userSelectedRef.current = false;
      setActiveTabIdState(null);
    }
  }, [latestSessionPaths, currentSessionId]);

  // 对新发现的路径发起 fetch
  useEffect(() => {
    if (!latestSessionPaths) return;
    const { stages } = latestSessionPaths;

    for (const [stage, path] of Object.entries(stages)) {
      if (fetchedPaths.current.has(path)) continue;
      fetchedPaths.current.add(path);

      // 标记 loading
      setTabDataMap((prev) => ({
        ...prev,
        [stage]: { ...(prev[stage] ?? {}), path, status: "loading", markdown: null, error: null },
      }));

      // fetch markdown
      const url = `/api/sre-agent/report-md?path=${encodeURIComponent(path)}`;
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(({ markdown, title }) => {
          setTabDataMap((prev) => ({
            ...prev,
            [stage]: { ...(prev[stage] ?? {}), path, status: "ready", markdown, title, error: null },
          }));
          // 新 stage 出现时若用户未手动切换则自动跳至此 tab
          if (!userSelectedRef.current) {
            setActiveTabIdState(stage);
          }
        })
        .catch((err) => {
          setTabDataMap((prev) => ({
            ...prev,
            [stage]: { ...(prev[stage] ?? {}), path, status: "error", markdown: null, error: err.message },
          }));
        });
    }
  }, [latestSessionPaths]);

  // 构建有序 tabs（按 REPORT_CONFIGS 顺序，只含已发现的 stage）
  const tabs = useMemo(() => {
    if (!latestSessionPaths) return [];
    return SRE_REPORT_CONFIGS
      .filter((cfg) => latestSessionPaths.stages[cfg.stage] !== undefined)
      .map((cfg) => {
        const data = tabDataMap[cfg.stage] ?? {};
        return {
          stage: cfg.stage,
          label: cfg.label,
          color: cfg.color,
          path: data.path ?? latestSessionPaths.stages[cfg.stage],
          status: data.status ?? "loading",
          markdown: data.markdown ?? null,
          title: data.title ?? cfg.label,
          error: data.error ?? null,
        };
      });
  }, [latestSessionPaths, tabDataMap]);

  const setActiveTabId = useCallback((stage) => {
    userSelectedRef.current = true;
    setActiveTabIdState(stage);
  }, []);

  // 若 activeTabId 指向的 tab 消失（新会话重置后），修正为首个
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.stage === activeTabId)) {
      setActiveTabIdState(tabs[tabs.length - 1].stage);
    }
  }, [tabs, activeTabId]);

  return { tabs, activeTabId, setActiveTabId };
}
