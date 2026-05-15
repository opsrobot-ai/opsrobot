import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SRE_REPORT_CONFIGS,
  extractSreReportPaths,
  getSreSessionId,
  getSreReportStageConfig,
  getSreSessionTimestamp,
} from "../../../lib/sreReportPathExtract.js";
import { isProbableOpenClawPathString } from "../../../lib/sreOpenclawPathGuess.js";

/**
 * 从 messages 中扫描 SRE 阶段产物路径，拉取 Markdown 或 stage content JSON，管理 Tab 状态。
 *
 * stage1–4：优先 `_content.json`（工作区解析展示），否则回落 `_report.md`。
 */
export function useSreReportTabs(messages) {
  const [tabDataMap, setTabDataMap] = useState({});
  const [activeTabId, setActiveTabIdState] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  const fetchedPaths = useRef(new Set());
  const userSelectedRef = useRef(false);

  const pathRank = useCallback((p) => (getSreReportStageConfig(p)?.pathKind === "content" ? 2 : 1), []);

  const latestSessionPaths = useMemo(() => {
    const sessionMap = {};

    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const paths = extractSreReportPaths(msg.content || "");
      for (const p of paths) {
        const sessionId = getSreSessionId(p);
        if (!sessionId) continue;
        const cfg = getSreReportStageConfig(p);
        if (!cfg) continue;
        if (!sessionMap[sessionId]) sessionMap[sessionId] = {};
        const prev = sessionMap[sessionId][cfg.stage];
        if (!prev || pathRank(p) > pathRank(prev)) {
          sessionMap[sessionId][cfg.stage] = p;
        }
      }
    }

    if (Object.keys(sessionMap).length === 0) return null;

    const latestId = Object.keys(sessionMap).reduce((best, id) =>
      getSreSessionTimestamp(id) > getSreSessionTimestamp(best) ? id : best,
    );
    return { sessionId: latestId, stages: sessionMap[latestId] };
  }, [messages, pathRank]);

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

  useEffect(() => {
    if (!latestSessionPaths) return;
    const { stages } = latestSessionPaths;

    for (const [stage, path] of Object.entries(stages)) {
      if (fetchedPaths.current.has(path)) continue;
      fetchedPaths.current.add(path);

      const cfg = getSreReportStageConfig(path);
      const useStageJson = cfg?.pathKind === "content";

      setTabDataMap((prev) => ({
        ...prev,
        [stage]: {
          ...(prev[stage] ?? {}),
          path,
          viewKind: useStageJson ? "stage_json" : "markdown",
          status: "loading",
          markdown: null,
          stageJson: useStageJson ? null : undefined,
          title: null,
          error: null,
        },
      }));

      if (useStageJson) {
        const url = `/api/sre-agent/viz-json?path=${encodeURIComponent(path)}`;
        fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then((root) => {
            const nested = {};
            if (root && typeof root === "object" && !Array.isArray(root)) {
              for (const key of Object.keys(root)) {
                const v = root[key];
                if (typeof v === "string" && isProbableOpenClawPathString(v)) {
                  nested[key] = { path: v.trim(), status: "loading" };
                }
              }
            }

            const title = path.split("/").pop() || cfg?.label || stage;

            setTabDataMap((prev) => ({
              ...prev,
              [stage]: {
                ...(prev[stage] ?? {}),
                path,
                viewKind: "stage_json",
                status: "ready",
                stageJson: { root, nested },
                title,
                error: null,
              },
            }));

            if (!userSelectedRef.current) {
              setActiveTabIdState(stage);
            }

            const fetchNested = async (key, filePath) => {
              try {
                const r = await fetch(`/api/sre-agent/openclaw-file?path=${encodeURIComponent(filePath)}`);
                const payload = await r.json();
                if (!r.ok || !payload?.ok) {
                  throw new Error(payload?.error || `HTTP ${r.status}`);
                }
                setTabDataMap((prev) => {
                  const cur = prev[stage]?.stageJson;
                  if (!cur?.nested?.[key]) return prev;
                  const nextNested = {
                    ...cur.nested,
                    [key]:
                      payload.kind === "json"
                        ? { path: filePath, status: "ready", kind: "json", data: payload.data }
                        : { path: filePath, status: "ready", kind: "text", text: payload.text },
                  };
                  return {
                    ...prev,
                    [stage]: {
                      ...(prev[stage] ?? {}),
                      stageJson: { ...cur, nested: nextNested },
                    },
                  };
                });
              } catch (e) {
                const msg = e?.message || String(e);
                setTabDataMap((prev) => {
                  const cur = prev[stage]?.stageJson;
                  if (!cur?.nested?.[key]) return prev;
                  return {
                    ...prev,
                    [stage]: {
                      ...(prev[stage] ?? {}),
                      stageJson: {
                        ...cur,
                        nested: {
                          ...cur.nested,
                          [key]: { path: filePath, status: "error", error: msg },
                        },
                      },
                    },
                  };
                });
              }
            };

            for (const key of Object.keys(nested)) {
              void fetchNested(key, nested[key].path);
            }
          })
          .catch((err) => {
            setTabDataMap((prev) => ({
              ...prev,
              [stage]: {
                ...(prev[stage] ?? {}),
                path,
                viewKind: "stage_json",
                status: "error",
                stageJson: null,
                markdown: null,
                error: err.message,
              },
            }));
          });
      } else {
        const url = `/api/sre-agent/report-md?path=${encodeURIComponent(path)}`;
        fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then(({ markdown, title }) => {
            setTabDataMap((prev) => ({
              ...prev,
              [stage]: {
                ...(prev[stage] ?? {}),
                path,
                viewKind: "markdown",
                status: "ready",
                markdown,
                title,
                error: null,
              },
            }));
            if (!userSelectedRef.current) {
              setActiveTabIdState(stage);
            }
          })
          .catch((err) => {
            setTabDataMap((prev) => ({
              ...prev,
              [stage]: {
                ...(prev[stage] ?? {}),
                path,
                viewKind: "markdown",
                status: "error",
                markdown: null,
                error: err.message,
              },
            }));
          });
      }
    }
  }, [latestSessionPaths]);

  const tabs = useMemo(() => {
    if (!latestSessionPaths) return [];
    return SRE_REPORT_CONFIGS.filter((cfg) => latestSessionPaths.stages[cfg.stage] !== undefined).map((cfg) => {
      const data = tabDataMap[cfg.stage] ?? {};
      const path = data.path ?? latestSessionPaths.stages[cfg.stage];
      const viewKind = data.viewKind ?? (getSreReportStageConfig(path)?.pathKind === "content" ? "stage_json" : "markdown");
      return {
        stage: cfg.stage,
        label: cfg.label,
        color: cfg.color,
        path,
        status: data.status ?? "loading",
        markdown: data.markdown ?? null,
        title: data.title ?? cfg.label,
        error: data.error ?? null,
        viewKind,
        stageJson: data.stageJson ?? null,
      };
    });
  }, [latestSessionPaths, tabDataMap]);

  const setActiveTabId = useCallback((stage) => {
    userSelectedRef.current = true;
    setActiveTabIdState(stage);
  }, []);

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.stage === activeTabId)) {
      setActiveTabIdState(tabs[tabs.length - 1].stage);
    }
  }, [tabs, activeTabId]);

  return { tabs, activeTabId, setActiveTabId };
}
