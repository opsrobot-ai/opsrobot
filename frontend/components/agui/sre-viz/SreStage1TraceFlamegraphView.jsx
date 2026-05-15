/**
 * Stage1 `type: stage1_trace_flamegraph`：浅色链路火焰条（左侧虚线树 + 横向比例条 + 右侧耗时/状态）
 */
import { useMemo } from "react";
import { Shell } from "./SreVizShell.jsx";
import { EmbeddedSummaryPanel, embeddedSummaryProseClass } from "./sreEmbeddedVizChrome.jsx";
import { isStage1TraceFlamegraphPayload, traceTreeScaleMs } from "../../../lib/sreStage1TraceFlamegraph.js";

function barFill(node) {
  const c = typeof node?.color === "string" ? node.color.trim() : "";
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
  const s = String(node?.status || "").toUpperCase();
  if (s === "ERROR" || s === "FAILED") return "#dc2626";
  if (s === "TIMEOUT" || s === "DEADLINE") return "#ea580c";
  if (s === "WARN" || s === "WARNING") return "#ca8a04";
  if (s === "OK" || s === "SUCCESS") return "#16a34a";
  return "#475569";
}

function isAsyncSpan(node) {
  if (!node || typeof node !== "object") return false;
  if (node.async === true) return true;
  const k = String(node.span_kind || node.kind || "").toLowerCase();
  if (k === "async" || k === "async_outline") return true;
  const op = String(node.operation || "").toLowerCase();
  return /_async\b|\basync\b/.test(op);
}

function statusTone(statusRaw) {
  const s = String(statusRaw || "").toUpperCase();
  if (s === "ERROR" || s === "FAILED") return "error";
  if (s === "TIMEOUT" || s === "DEADLINE") return "timeout";
  if (s === "WARN" || s === "WARNING") return "warn";
  if (s === "OK" || s === "SUCCESS") return "ok";
  return "muted";
}

const STATUS_LABEL_CLASS = {
  error: "text-rose-700 dark:text-rose-400",
  timeout: "text-amber-700 dark:text-amber-400",
  warn: "text-yellow-800 dark:text-yellow-400",
  ok: "text-emerald-700 dark:text-emerald-400",
  muted: "text-gray-500 dark:text-gray-400",
};

function StatusGlyph({ tone }) {
  if (tone === "error") {
    return (
      <span
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-rose-100 ring-1 ring-rose-300"
        aria-hidden
      >
        <svg className="h-2 w-2 text-rose-700" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (tone === "warn") {
    return (
      <span
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-yellow-100 ring-1 ring-yellow-400"
        aria-hidden
      >
        <span className="text-[10px] font-bold leading-none text-yellow-800">!</span>
      </span>
    );
  }
  if (tone === "timeout") {
    return (
      <span
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-amber-100 ring-1 ring-amber-300"
        aria-hidden
      >
        <svg className="h-2.5 w-2.5 text-amber-700" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2} />
          <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (tone === "ok") {
    return (
      <span
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-100 ring-1 ring-emerald-300"
        aria-hidden
      >
        <svg className="h-2 w-2 text-emerald-700" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2.5 6l2.5 3 4.5-5.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-gray-100 ring-1 ring-gray-300"
      aria-hidden
    >
      <span className="h-1 w-1 rounded-full bg-gray-500" />
    </span>
  );
}

const TREE_LINE = "border-gray-300 dark:border-gray-600";

function FlameSpanRow({ node, scaleMs }) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;

  const dur = Number(node.duration_ms);
  const duration = Number.isFinite(dur) ? dur : 0;
  const pctBase = scaleMs > 0 ? (duration / scaleMs) * 100 : 100;
  const pct = Math.min(100, Math.max(8, pctBase || 8));
  const bg = barFill(node);
  const async = isAsyncSpan(node);
  const kids = Array.isArray(node.children) ? node.children : [];
  const service = String(node.service || "—").trim();
  const operation = String(node.operation || "").trim();
  const tone = statusTone(node.status);
  const labelCls = STATUS_LABEL_CLASS[tone];
  const statusLabel = String(node.status || "—").trim().toUpperCase() || "—";

  const title =
    [node.start_time, node.span_id, service, operation].filter(Boolean).join("\n") || undefined;

  return (
    <div className="select-text">
      <div className="flex items-stretch gap-2 py-1">
        <div className="flex min-w-0 flex-1 items-center">
          <div
            className={`min-w-0 overflow-hidden rounded-lg shadow-sm ${
              async ? "border-2 border-dashed bg-white/90 dark:bg-gray-900/40" : "border border-gray-200 dark:border-gray-700"
            }`}
            style={{
              width: `${pct}%`,
              minWidth: "4.5rem",
              maxWidth: "100%",
              ...(async ? { borderColor: bg } : {}),
            }}
          >
            <div
              className="flex min-h-[30px] flex-col justify-center gap-0.5 px-2.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-2"
              style={
                async
                  ? undefined
                  : {
                      backgroundColor: bg,
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
                    }
              }
              title={title}
            >
              <span
                className={`truncate text-[11px] font-semibold tracking-tight ${async ? "text-gray-800 dark:text-gray-100" : "text-white"}`}
              >
                {service}
              </span>
              {operation ? (
                <span
                  className={`truncate font-mono text-[10px] ${async ? "text-gray-600 dark:text-gray-400" : "text-white/90"}`}
                >
                  {operation}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex w-[5.75rem] shrink-0 flex-col items-end justify-center gap-0.5 text-right">
          <div className="flex items-center gap-1.5">
            <StatusGlyph tone={tone} />
            <span className="font-mono text-[11px] font-medium tabular-nums text-gray-800 dark:text-gray-100">{duration}ms</span>
          </div>
          <span className={`text-[9px] font-semibold uppercase tracking-wide ${labelCls}`}>{statusLabel}</span>
        </div>
      </div>
      {kids.length ? (
        <div className={`relative mt-1.5 border-l border-dashed pl-3.5 ml-0.5 ${TREE_LINE}`}>
          {kids.map((ch, i) => (
            <div key={String(ch?.span_id ?? ch?.operation ?? i)} className="relative">
              <span
                className={`pointer-events-none absolute left-0 top-[17px] z-0 w-3 -translate-x-full border-t border-dashed ${TREE_LINE}`}
                aria-hidden
              />
              <div className="relative z-[1]">
                <FlameSpanRow node={ch} scaleMs={scaleMs} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FlameCard({ traceRoot, scaleMs }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 shadow-sm ring-1 ring-black/[0.04] dark:border-gray-800 dark:bg-gray-950 dark:ring-white/[0.06]">
      <p className="mb-3 text-[10px] font-medium tracking-wide text-gray-500 dark:text-gray-400">
        链路火焰条（相对根耗时 {scaleMs}ms 缩放）
      </p>
      <FlameSpanRow node={traceRoot} scaleMs={scaleMs} />
    </div>
  );
}

/**
 * @param {{ data: object; variant?: "embedded" | "standalone" }}
 */
export function SreStage1TraceFlamegraphView({ data, variant = "embedded" }) {
  const scaleMs = useMemo(() => (data?.trace_root ? traceTreeScaleMs(data.trace_root) : 1), [data]);

  if (!isStage1TraceFlamegraphPayload(data) || !data.trace_root) return null;

  const desc = String(data.description || "").trim();
  const summary = String(data.summary || "").trim();

  const hasIntro = Boolean(desc) || Boolean(summary);

  const body = (
    <>
      {hasIntro ? (
        <EmbeddedSummaryPanel>
          {desc ? <p className={embeddedSummaryProseClass}>{desc}</p> : null}
          {summary ? (
            <p
              className={`text-[12px] font-semibold leading-snug text-gray-800 dark:text-gray-200 ${desc ? "mt-3" : ""}`}
            >
              {summary}
            </p>
          ) : null}
        </EmbeddedSummaryPanel>
      ) : null}
      <div className={hasIntro ? "mt-5" : ""}>
        <FlameCard traceRoot={data.trace_root} scaleMs={scaleMs} />
      </div>
    </>
  );

  if (variant === "standalone") {
    const title =
      typeof data.title === "string" && data.title.trim() ? data.title.trim() : "链路火焰图";
    return <Shell title={title}>{body}</Shell>;
  }

  return body;
}
