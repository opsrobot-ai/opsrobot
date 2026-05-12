import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchOpenClawSessionDetail } from "../../../lib/sreOpenclawSessions.js";
import {
  buildSortedChildSessionHistoryFromDetail,
  inferChildSessionProgressFromDetail,
} from "../../../lib/sreChildSessionProgress.js";
import { USE_MOCK } from "../constants.js";

const POLL_MS = 3000;

/**
 * 子智能体会话：轮询详情推断「工具调用 / 生成回复」，并在会话列表中解析展示行。
 *
 * @param {string|null|undefined} childSessionKey
 * @param {{ enabled?: boolean }} options
 */
export function useSreChildSessionProgress(childSessionKey, options = {}) {
  const { enabled = false } = options;
  const key = String(childSessionKey ?? "").trim();

  const [phase, setPhase] = useState("generating_reply");
  const [summaryLine, setSummaryLine] = useState("");
  const [toolName, setToolName] = useState("");
  const [toolCallId, setToolCallId] = useState("");
  const [replyPreview, setReplyPreview] = useState("");
  const [error, setError] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [detail, setDetail] = useState(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (USE_MOCK || !key || !enabled) return;
    try {
      const d = await fetchOpenClawSessionDetail(key);
      if (!mounted.current) return;
      setDetail(d);
      const inf = inferChildSessionProgressFromDetail(d);
      setPhase(inf.phase);
      setSummaryLine(inf.summaryLine);
      setToolName(inf.toolName);
      setToolCallId(inf.toolCallId);
      setReplyPreview(inf.replyPreview);
      setError(null);
      setRefreshedAt(Date.now());
    } catch (e) {
      if (!mounted.current) return;
      setDetail(null);
      setError(e?.message || String(e));
      setRefreshedAt(Date.now());
    }
  }, [enabled, key]);

  useEffect(() => {
    if (USE_MOCK || !key || !enabled) {
      setPhase("generating_reply");
      setSummaryLine("");
      setToolName("");
      setToolCallId("");
      setReplyPreview("");
      setError(null);
      setRefreshedAt(null);
      setDetail(null);
      return;
    }

    let interval = null;
    void load();
    interval = setInterval(() => void load(), POLL_MS);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [enabled, key, load]);

  const sessionHistory = useMemo(
    () => (detail ? buildSortedChildSessionHistoryFromDetail(detail) : []),
    [detail],
  );

  return {
    phase,
    summaryLine,
    toolName,
    toolCallId,
    replyPreview,
    error,
    refreshedAt,
    detail,
    sessionHistory,
    reload: load,
  };
}
