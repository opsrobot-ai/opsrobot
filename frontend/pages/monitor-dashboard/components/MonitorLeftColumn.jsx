import { useEffect, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import { getAutoScrollDurationSec } from "../constants.js";
import { getDailyTokenOption } from "../chartOptions.js";
import MonitorPanel from "./MonitorPanel.jsx";

export default function MonitorLeftColumn({ dailyTokens, instanceList, loading, error }) {
  const rows = Array.isArray(instanceList) ? instanceList : [];
  const listViewportRef = useRef(null);
  const listContentRef = useRef(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false);

  useEffect(() => {
    const viewportEl = listViewportRef.current;
    const contentEl = listContentRef.current;
    if (!viewportEl || !contentEl || loading || error || rows.length === 0) {
      setShouldAutoScroll(false);
      return;
    }

    const measure = () => {
      setShouldAutoScroll(contentEl.scrollHeight > viewportEl.clientHeight + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewportEl);
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [loading, error, rows.length]);
  const formatSessions = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? "--");
    return n.toLocaleString("zh-CN");
  };

  const formatToken = (v) => {
    const s = String(v ?? "--").trim();
    // 统一小写 k，避免 909.2K / 909.2k 混排观感不一致
    return s.replace(/K$/, "k");
  };

  const renderRows = (suffix = "") =>
    rows.map((agent, i) => (
      <div
        key={`${suffix}-${i}-${agent.name}`}
        className={`flex items-center text-xs py-1 ${agent.active ? "bg-[#004488]/30 rounded" : ""}`}
      >
        <div className="w-[40%] pl-2 min-w-0">
          <div className="text-white flex items-center gap-1.5 min-w-0">
            <svg className="w-3.5 h-3.5 text-[#00f0ff]/80 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="relative min-w-0 flex-1 group/name">
              <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                {agent.name}
              </span>
              <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden max-w-[260px] whitespace-normal break-all rounded border border-[#1f547f] bg-[#06182b] px-2 py-1 text-[11px] text-[#d7ecff] shadow-[0_4px_12px_rgba(0,0,0,0.45)] group-hover/name:block">
                {agent.name}
              </span>
            </span>
          </div>
        </div>
        <div className="w-[20%] flex justify-center items-center gap-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              agent.status === "在线" ? "bg-[#00f0ff] shadow-[0_0_5px_#00f0ff]" : "bg-[#4b5563]"
            }`}
          />
          <span className={agent.status === "在线" ? "text-[#00f0ff]" : "text-[#6b7280]"}>{agent.status}</span>
        </div>
        <div className="w-[20%] text-right font-mono tabular-nums text-white/95">{formatSessions(agent.sessions)}</div>
        <div className="w-[20%] text-right text-[#00f0ff] font-mono tabular-nums">{formatToken(agent.token)}</div>
      </div>
    ));

  return (
    <div className="flex flex-col gap-3 w-full lg:w-1/4 h-[calc(100%+2.5rem)] lg:-mt-10">
      <MonitorPanel title="每日 Token 消耗" className="shrink-0">
        <div className="h-[100px] w-full min-h-0 shrink-0 overflow-hidden">
          {loading ? (
            <div className="flex h-full w-full items-center justify-center px-4">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center">
                  <svg className="h-6 w-6 animate-spin text-[#5ba6d6]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
                <div className="text-sm text-[#8fb1c6]">加载中...</div>
              </div>
            </div>
          ) : (
            <ReactECharts option={getDailyTokenOption(dailyTokens)} style={{ height: "100%", width: "100%" }} />
          )}
        </div>
      </MonitorPanel>

      <MonitorPanel
        title="数字员工列表"
        className="flex-1 min-h-[250px]"
      >
        <div className="h-full flex flex-col">
          <div className="flex text-[#8fb1c6] text-xs pb-2 border-b border-[#16436e] mb-2 px-2">
            <div className="w-[40%] pl-2">名称</div>
            <div className="w-[20%] text-center">状态</div>
            <div className="w-[20%] text-right">会话</div>
            <div className="w-[20%] text-right">Token</div>
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col px-2">
            {loading ? (
              <div className="h-full flex items-center justify-center px-4">
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center">
                    <svg className="h-6 w-6 animate-spin text-[#5ba6d6]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                  <div className="text-sm text-[#8fb1c6]">加载中...</div>
                </div>
              </div>
            ) : error ? (
              <div className="h-full flex items-center justify-center px-4">
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center">
                    <svg className="h-4 w-4 text-[#f59e0b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="text-sm text-[#8fb1c6]">加载失败</div>
                </div>
              </div>
            ) : rows.length > 0 ? (
              <div ref={listViewportRef} className="relative min-h-0 flex-1 overflow-hidden">
                <div
                  ref={listContentRef}
                  className={`flex flex-col gap-3 ${shouldAutoScroll ? "animate-auto-scroll" : ""}`}
                  style={
                    shouldAutoScroll
                      ? {
                          "--auto-scroll-duration": `${getAutoScrollDurationSec(rows.length)}s`,
                        }
                      : undefined
                  }
                >
                  {shouldAutoScroll ? (
                    <>
                      <div className="flex flex-col gap-3">{renderRows("a")}</div>
                      <div className="flex flex-col gap-3">{renderRows("b")}</div>
                    </>
                  ) : (
                    <div className="flex flex-col gap-3">{renderRows("a")}</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center px-4">
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center">
                    <svg className="h-4 w-4 text-[#5ba6d6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17h6M9 13h6M9 9h6M5 5h14v14H5z" />
                    </svg>
                  </div>
                  <div className="text-sm text-[#8fb1c6]">暂无数据</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </MonitorPanel>
    </div>
  );
}
