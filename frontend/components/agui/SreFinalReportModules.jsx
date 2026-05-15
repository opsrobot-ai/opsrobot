import { memo, useMemo } from "react";
import {
  mergeFinalReportKeyAliases,
  SRE_FINAL_REPORT_MODULES,
  finalReportModuleHasData,
  finalReportValueHasPresentData,
} from "../../lib/sreFinalReportModules.js";
import { ReasoningOverviewThreeLayerChain } from "./sre-viz/SreStage3ReasoningOverviewPanel.jsx";

const AXIS_OFFSET = "0.625rem";

function JsonBlock({ value }) {
  const text = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-[12px] leading-relaxed text-slate-700 shadow-inner dark:border-slate-800/80 dark:bg-slate-900/50 dark:text-slate-300">
      {text}
    </pre>
  );
}

function Subheading({ children }) {
  return (
    <h4 className="mb-3 flex items-start gap-2.5 text-[13px] font-semibold leading-snug text-gray-800 dark:text-gray-200">
      <span
        className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500/75 ring-2 ring-blue-500/15 dark:bg-blue-400/80 dark:ring-blue-400/20"
        aria-hidden
      />
      <span>{children}</span>
    </h4>
  );
}

function labelFor(aliases, key) {
  return aliases[key] || key;
}

function KeyValueList({ obj, aliases, depth = 0 }) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const entries = Object.entries(obj).filter(([k]) => !String(k).startsWith("_"));
  if (entries.length === 0) return null;

  return (
    <dl
      className={`grid gap-x-4 gap-y-2 ${depth === 0 ? "sm:grid-cols-[minmax(0,11rem)_1fr]" : ""}`}
    >
      {entries.map(([k, v]) => {
        if (v === undefined || v === null) return null;
        if (typeof v === "object" && !Array.isArray(v)) {
          if (!finalReportValueHasPresentData(v)) return null;
          const inner = KeyValueList({ obj: v, aliases, depth: depth + 1 });
          if (!inner) return null;
          return (
            <div key={k} className="contents sm:col-span-2">
              <dt className="pt-1 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {labelFor(aliases, k)}
              </dt>
              <dd className="min-w-0 border-l border-gray-100 pl-3 dark:border-gray-800">{inner}</dd>
            </div>
          );
        }
        let display = v;
        if (typeof v === "boolean") display = v ? "是" : "否";
        return (
          <div key={k} className="contents">
            <dt className="pt-0.5 text-[12px] font-medium text-gray-600 dark:text-gray-300">
              {labelFor(aliases, k)}
            </dt>
            <dd className="break-words text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">{String(display)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** @param {{ aliases: Record<string,string>; conclusion: Record<string, unknown> | null }} */
function ConclusionBanner({ aliases, conclusion }) {
  if (!conclusion || typeof conclusion !== "object" || Array.isArray(conclusion)) return null;
  const icon = conclusion.icon != null ? String(conclusion.icon) : "";
  const desc = conclusion.description != null ? String(conclusion.description).trim() : "";
  if (!desc && !icon) return null;
  return (
    <div className="flex gap-3 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-3 dark:border-slate-700/70 dark:bg-slate-950/40">
      {icon ? <span className="shrink-0 text-lg leading-none">{icon}</span> : null}
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">{desc}</p>
    </div>
  );
}

function FaultKeyNodesTimeline({ rows, aliases }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const body = (
    <div className="relative min-w-0 pl-5">
      <div
        className="pointer-events-none absolute top-2 bottom-2 w-px -translate-x-1/2 bg-gradient-to-b from-indigo-400 via-indigo-300 to-slate-200 dark:from-indigo-500 dark:via-indigo-600 dark:to-slate-600"
        style={{ left: AXIS_OFFSET }}
        aria-hidden
      />
      <ul className="relative z-[1] space-y-4" role="list">
        {rows.map((row, i) => {
          const r = row && typeof row === "object" && !Array.isArray(row) ? row : {};
          const timeLabel = String(r.time ?? "").trim() || "—";
          const eventText = String(r.event ?? r.description ?? "").trim();
          const source = String(r.source ?? "").trim();
          const hasSource = source !== "" && source !== "—";

          return (
            <li key={`${timeLabel}-${i}`} className="relative">
              <span
                className="absolute top-3 z-[2] h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-indigo-600 shadow-sm ring-2 ring-white dark:bg-indigo-500 dark:ring-gray-950"
                style={{ left: `calc(-1 * ${AXIS_OFFSET})` }}
                aria-hidden
              />
              <div className="min-w-0 rounded-lg border border-gray-200/75 bg-white/90 px-3 py-2 shadow-sm dark:border-gray-800/90 dark:bg-gray-950/50">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <time className="font-mono text-[12px] font-bold tabular-nums tracking-tight text-indigo-700 dark:text-indigo-300">
                    {timeLabel}
                  </time>
                  {hasSource ? (
                    <span className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400">{source}</span>
                  ) : null}
                </div>
                {eventText ? (
                  <p className="mt-1.5 text-[12px] leading-relaxed text-slate-800 dark:text-slate-200">{eventText}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="space-y-3">
      <Subheading>{labelFor(aliases, "key_nodes")}</Subheading>
      <div className="pl-1">{body}</div>
    </div>
  );
}

function ImprovementHorizonSection({ title, rows, aliases }) {
  const list = Array.isArray(rows) ? rows.filter((x) => x !== undefined && x !== null) : [];
  if (!list.length) return null;

  return (
    <div className="space-y-2">
      <Subheading>{title}</Subheading>
      <ul className="space-y-2 pl-1">
        {list.map((item, i) => {
          if (item == null) return null;
          if (typeof item === "string" || typeof item === "number") {
            const s = String(item).trim();
            if (!s) return null;
            return (
              <li
                key={i}
                className="rounded-lg border border-gray-100 bg-slate-50/80 px-3 py-2 text-[13px] leading-relaxed text-slate-800 dark:border-gray-800 dark:bg-slate-900/35 dark:text-slate-200"
              >
                {s}
              </li>
            );
          }
          if (typeof item === "object" && !Array.isArray(item)) {
            const priority = item.priority !== undefined ? String(item.priority).trim() : "";
            const action = item.action !== undefined ? String(item.action).trim() : "";
            const owner = item.owner !== undefined ? String(item.owner).trim() : "";
            const deadline = item.deadline !== undefined ? String(item.deadline).trim() : "";
            const bits = [];
            if (priority) bits.push(`${labelFor(aliases, "priority")}：${priority}`);
            if (action) bits.push(`${labelFor(aliases, "action")}：${action}`);
            if (owner) bits.push(`${labelFor(aliases, "owner")}：${owner}`);
            if (deadline) bits.push(`${labelFor(aliases, "deadline")}：${deadline}`);
            const line = bits.join("　");
            const fallback =
              line ||
              [
                typeof item.summary === "string" ? item.summary.trim() : "",
                typeof item.text === "string" ? item.text.trim() : "",
              ].filter(Boolean)[0];

            const text = fallback || "";
            return (
              <li
                key={i}
                className="rounded-lg border border-gray-100 bg-slate-50/80 px-3 py-2 text-[13px] leading-relaxed text-slate-800 dark:border-gray-800 dark:bg-slate-900/35 dark:text-slate-200"
              >
                {text || <JsonBlock value={item} />}
              </li>
            );
          }
          return (
            <li key={i} className="pl-1">
              <JsonBlock value={item} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function renderCoreSummary(data, aliases) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return <JsonBlock value={data} />;
  const bi = data.basic_info;
  const is = data.impact_scope;
  const rca = data.rca_summary;

  return (
    <div className="space-y-6">
      {bi && typeof bi === "object" && !Array.isArray(bi) && finalReportValueHasPresentData(bi) ? (
        <div>
          <Subheading>{labelFor(aliases, "basic_info")}</Subheading>
          <div className="pl-1">{KeyValueList({ obj: bi, aliases }) ?? <JsonBlock value={bi} />}</div>
        </div>
      ) : null}
      {is && typeof is === "object" && !Array.isArray(is) && finalReportValueHasPresentData(is) ? (
        <div>
          <Subheading>{labelFor(aliases, "impact_scope")}</Subheading>
          <div className="pl-1">{KeyValueList({ obj: is, aliases }) ?? <JsonBlock value={is} />}</div>
        </div>
      ) : null}
      {rca && typeof rca === "object" && !Array.isArray(rca) ? (
        <div className="space-y-3">
          <Subheading>{labelFor(aliases, "rca_summary")}</Subheading>
          <div className="space-y-3 pl-1">
            {rca.confidence !== undefined ? (
              <p className="text-[13px] text-slate-700 dark:text-slate-300">
                <span className="font-medium text-gray-700 dark:text-gray-200">{labelFor(aliases, "confidence")}：</span>
                {String(rca.confidence)}
              </p>
            ) : null}
            {typeof rca.confidence_rationale === "string" && rca.confidence_rationale.trim() ? (
              <blockquote className="rounded-lg border border-amber-200/70 bg-amber-50/50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-950/90 dark:border-amber-900/55 dark:bg-amber-950/25 dark:text-amber-50/95">
                {rca.confidence_rationale.trim()}
              </blockquote>
            ) : null}
            {typeof rca.core_root_cause === "string" && rca.core_root_cause.trim() ? (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
                <span className="font-semibold text-gray-800 dark:text-gray-100">{labelFor(aliases, "core_root_cause")}：</span>
                {rca.core_root_cause.trim()}
              </p>
            ) : null}
            {(() => {
              const cs = rca.current_status;
              const hasStatus =
                cs &&
                typeof cs === "object" &&
                !Array.isArray(cs) &&
                (String(cs.description ?? "").trim() !== "" || String(cs.icon ?? "").trim() !== "");
              return hasStatus ? (
                <div className="space-y-2">
                  <span className="text-[13px] font-medium text-gray-700 dark:text-gray-200">
                    {labelFor(aliases, "current_status")}
                  </span>
                  <ConclusionBanner aliases={aliases} conclusion={cs} />
                </div>
              ) : null;
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function renderFaultTimeline(data, aliases) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return <JsonBlock value={data} />;
  const nodes = data.key_nodes;
  const remediation = data.remediation_actions;

  return (
    <div className="space-y-6">
      <FaultKeyNodesTimeline rows={nodes} aliases={aliases} />
      {Array.isArray(remediation) && remediation.some((x) => String(x).trim()) ? (
        <div>
          <Subheading>{labelFor(aliases, "remediation_actions")}</Subheading>
          <ul className="list-inside list-disc space-y-1.5 pl-1 text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
            {remediation.map((raw, i) => {
              const s = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
              if (!s) return null;
              return (
                <li key={i} className="pl-0.5">
                  {s}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function layerBlockHasContent(block) {
  if (!block || typeof block !== "object" || Array.isArray(block)) return false;
  const desc = typeof block.description === "string" ? block.description.trim() : String(block.description ?? "").trim();
  const note = typeof block.note === "string" ? block.note.trim() : "";
  return Boolean(desc || note);
}

/** 终稿三层结构 → 推理总览 Tab 同源卡片数据（触发 → 直接原因 → 根因） */
function finalThreeStructureRows(three, aliases) {
  const order = ["trigger_event", "direct_cause", "root_cause"];
  const rows = [];
  for (const key of order) {
    const block = three[key];
    if (!layerBlockHasContent(block)) continue;
    const desc =
      typeof block.description === "string" ? block.description.trim() : String(block.description ?? "").trim();
    const note = typeof block.note === "string" ? block.note.trim() : "";
    const parts = [];
    if (desc) parts.push(desc);
    if (note) parts.push(`备注：${note}`);
    rows.push({
      id: key,
      layerZh: labelFor(aliases, key),
      description: parts.join("\n\n"),
      confidence: null,
    });
  }
  return rows;
}

function renderRootCauseImpact(data, aliases) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return <JsonBlock value={data} />;
  const three = data.three_layer_structure;
  const ruling = data.rca_ruling;
  const excluded = data.excluded_hypotheses;
  const gaps = data.data_gaps;

  const excludedClean = Array.isArray(excluded)
    ? excluded.filter((row) => {
        if (!row || typeof row !== "object") return false;
        const hyp = String(row.hypothesis ?? "").trim();
        const reason = String(row.rejection_reason ?? "").trim();
        return hyp || reason;
      })
    : [];

  const threeRows =
    three && typeof three === "object" && !Array.isArray(three) ? finalThreeStructureRows(three, aliases) : [];

  return (
    <div className="space-y-6">
      {threeRows.length > 0 ? (
        <div className="space-y-3">
          <Subheading>{labelFor(aliases, "three_layer_structure")}</Subheading>
          <div className="pl-1">
            <ReasoningOverviewThreeLayerChain rows={threeRows} />
          </div>
        </div>
      ) : null}

      {ruling &&
      typeof ruling === "object" &&
      !Array.isArray(ruling) &&
      ((typeof ruling.dominant_hypothesis === "string" && ruling.dominant_hypothesis.trim()) ||
        (typeof ruling.ruling_reason === "string" && ruling.ruling_reason.trim())) ? (
        <div className="space-y-2">
          <Subheading>{labelFor(aliases, "rca_ruling")}</Subheading>
          <div className="space-y-2 pl-1">
            {typeof ruling.dominant_hypothesis === "string" && ruling.dominant_hypothesis.trim() ? (
              <p className="text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
                <span className="font-medium text-gray-800 dark:text-gray-100">{labelFor(aliases, "dominant_hypothesis")}：</span>
                {ruling.dominant_hypothesis.trim()}
              </p>
            ) : null}
            {typeof ruling.ruling_reason === "string" && ruling.ruling_reason.trim() ? (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                <span className="font-medium text-gray-800 dark:text-gray-100">{labelFor(aliases, "ruling_reason")}：</span>
                {ruling.ruling_reason.trim()}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {excludedClean.length > 0 ? (
        <div className="space-y-3">
          <Subheading>{labelFor(aliases, "excluded_hypotheses")}</Subheading>
          <ul className="space-y-3 pl-1">
            {excludedClean.map((row, i) => {
              const hyp = String(row.hypothesis ?? "").trim();
              const reason = String(row.rejection_reason ?? "").trim();
              return (
                <li
                  key={i}
                  className="rounded-lg border border-rose-100/80 bg-rose-50/35 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/25"
                >
                  {hyp ? (
                    <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100">{hyp}</p>
                  ) : null}
                  {reason ? (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-300">{reason}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {typeof gaps === "string" && gaps.trim() ? (
        <div>
          <Subheading>{labelFor(aliases, "data_gaps")}</Subheading>
          <p className="whitespace-pre-wrap pl-1 text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">{gaps.trim()}</p>
        </div>
      ) : null}
    </div>
  );
}

function renderProblems(data, aliases) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return <JsonBlock value={data} />;
  const levels = ["process_level", "technical_level", "monitoring_level"];

  return (
    <div className="space-y-6">
      {levels.map((lk) => {
        const rows = data[lk];
        if (!Array.isArray(rows) || !rows.some((x) => String(x).trim())) return null;
        return (
          <div key={lk}>
            <Subheading>{labelFor(aliases, lk)}</Subheading>
            <ul className="list-inside list-disc space-y-1.5 pl-1 text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
              {rows.map((raw, i) => {
                const s = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
                if (!s) return null;
                return (
                  <li key={i} className="pl-0.5">
                    {s}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function renderImprovementPlan(data, aliases) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return <JsonBlock value={data} />;
  const shortK = "short_term_0_2_weeks";
  const midK = "medium_term_1_3_months";
  const longK = "long_term_over_3_months";

  return (
    <div className="space-y-6">
      <ImprovementHorizonSection title={labelFor(aliases, shortK)} rows={data[shortK]} aliases={aliases} />
      <ImprovementHorizonSection title={labelFor(aliases, midK)} rows={data[midK]} aliases={aliases} />
      <ImprovementHorizonSection title={labelFor(aliases, longK)} rows={data[longK]} aliases={aliases} />
    </div>
  );
}

function renderConclusionRisks(data, aliases) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return <JsonBlock value={data} />;
  const residual = data.residual_risks;

  return (
    <div className="space-y-5">
      {(() => {
        const c = data.conclusion;
        const ok =
          c &&
          typeof c === "object" &&
          !Array.isArray(c) &&
          (String(c.description ?? "").trim() !== "" || String(c.icon ?? "").trim() !== "");
        return ok ? (
          <div className="space-y-2">
            <Subheading>{labelFor(aliases, "conclusion")}</Subheading>
            <div className="pl-1">
              <ConclusionBanner aliases={aliases} conclusion={c} />
            </div>
          </div>
        ) : null;
      })()}
      {typeof residual === "string" && residual.trim() ? (
        <div>
          <Subheading>{labelFor(aliases, "residual_risks")}</Subheading>
          <p className="whitespace-pre-wrap pl-1 text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">{residual.trim()}</p>
        </div>
      ) : null}
    </div>
  );
}

function ModuleBody({ moduleId, resolved, aliases }) {
  switch (moduleId) {
    case "core_summary":
      return renderCoreSummary(resolved, aliases);
    case "fault_timeline":
      return renderFaultTimeline(resolved, aliases);
    case "root_cause_and_impact":
      return renderRootCauseImpact(resolved, aliases);
    case "problems":
      return renderProblems(resolved, aliases);
    case "improvement_plan":
      return renderImprovementPlan(resolved, aliases);
    case "conclusion":
      return renderConclusionRisks(resolved, aliases);
    default:
      return <JsonBlock value={resolved} />;
  }
}

export const SreFinalReportModules = memo(function SreFinalReportModules({ root, nested }) {
  const nest = nested ?? {};
  const aliases = useMemo(() => mergeFinalReportKeyAliases(root), [root]);

  return (
    <div className="space-y-5">
      {SRE_FINAL_REPORT_MODULES.map((module) => {
        if (!finalReportModuleHasData(module, root, nest)) return null;

        const key = module.keys[0];
        const slot = nest[key];

        let moduleInner;
        if (slot?.status === "loading") {
          moduleInner = <p className="text-xs text-gray-400">加载引用文件…</p>;
        } else if (slot?.status === "error") {
          moduleInner = (
            <p className="text-xs text-rose-600 dark:text-rose-400">{String(slot.error || "加载失败")}</p>
          );
        } else {
          const resolved =
            slot?.status === "ready" && slot.kind === "json"
              ? slot.data
              : slot?.status === "ready" && slot.kind === "text"
                ? slot.text
                : root[key];
          moduleInner = <ModuleBody moduleId={module.id} resolved={resolved} aliases={aliases} />;
        }

        const body =
          module.id === "core_summary" ? (
            <div
              className="max-w-[100ch] rounded-xl border border-indigo-100/85 bg-gradient-to-br from-indigo-50/60 via-white to-slate-50/40 p-4 shadow-sm ring-1 ring-indigo-500/[0.06] dark:border-indigo-900/40 dark:from-indigo-950/[0.2] dark:via-gray-950/65 dark:to-slate-950/80 dark:ring-indigo-400/10 [&_p]:text-[13px] [&_p]:leading-relaxed"
            >
              {moduleInner}
            </div>
          ) : (
            <div className="space-y-6 p-4 sm:p-5">{moduleInner}</div>
          );

        if (module.id === "core_summary") {
          return (
            <header key={module.id}>
              <h2 className="mb-2 text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                {module.title}
              </h2>
              {body}
            </header>
          );
        }

        return (
          <section
            key={module.id}
            className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:ring-white/[0.06]"
          >
            <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50/95 via-white to-slate-50/40 px-4 py-3.5 dark:border-gray-800/50 dark:from-gray-950/50 dark:via-gray-950/30 dark:to-slate-950/25">
              <h3 className="text-sm font-semibold tracking-tight text-gray-800 dark:text-gray-100">{module.title}</h3>
            </div>
            {body}
          </section>
        );
      })}
    </div>
  );
});
