/**
 * Stage2 `trace_anomalies`：受影响 Trace 数、根因 Span、传播路径
 */

/** @param {unknown} o */
export function isStage2TraceAnomaliesPayload(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const span = o.root_cause_span;
  const hasSpan =
    span &&
    typeof span === "object" &&
    !Array.isArray(span) &&
    ["span_id", "service", "operation", "duration_ms"].some((k) => {
      const v = span[k];
      if (v == null) return false;
      if (typeof v === "number") return Number.isFinite(v);
      return String(v).trim() !== "";
    });
  const hasPath = typeof o.propagation_path === "string" && o.propagation_path.trim() !== "";
  const n = o.affected_trace_count;
  const hasCount = n != null && Number.isFinite(Number(n));
  return Boolean(hasSpan || hasPath || hasCount);
}

/** @param {string} s */
export function parseStage2PropagationPath(s) {
  if (typeof s !== "string" || !s.trim()) return [];
  return s
    .split(/\s*(?:→|->|⇒)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * @param {unknown} span
 * @returns {{ span_id: string; service: string; operation: string; duration_ms: number | null }}
 */
export function normalizeStage2RootCauseSpan(span) {
  if (!span || typeof span !== "object" || Array.isArray(span)) {
    return { span_id: "", service: "", operation: "", duration_ms: null };
  }
  const span_id = span.span_id != null ? String(span.span_id).trim() : "";
  const service = span.service != null ? String(span.service).trim() : "";
  const operation = span.operation != null ? String(span.operation).trim() : "";
  const raw = span.duration_ms ?? span.durationMs;
  let duration_ms = null;
  if (raw != null && Number.isFinite(Number(raw))) duration_ms = Number(raw);
  return { span_id, service, operation, duration_ms };
}

/**
 * @param {unknown} o
 * @returns {{ affected_trace_count: number | null; root_cause: ReturnType<typeof normalizeStage2RootCauseSpan>; steps: string[] }}
 */
export function normalizeStage2TraceAnomalies(o) {
  if (!isStage2TraceAnomaliesPayload(o)) {
    return { affected_trace_count: null, root_cause: normalizeStage2RootCauseSpan(null), steps: [] };
  }
  const c = o.affected_trace_count;
  const affected_trace_count =
    c != null && Number.isFinite(Number(c)) ? Number(c) : null;
  const root_cause = normalizeStage2RootCauseSpan(o.root_cause_span);
  const steps = parseStage2PropagationPath(
    typeof o.propagation_path === "string" ? o.propagation_path : "",
  );
  return { affected_trace_count, root_cause, steps };
}
