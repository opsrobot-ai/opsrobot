import { memo, useMemo } from "react";
import { stage2ConclusionSummaryText } from "../../lib/sreStage2AnomalyModules.js";
import {
  mergeStage4KeyAliases,
  SRE_STAGE4_MODULES,
  stage4KeyHasPresentData,
  stage4ModuleHasData,
} from "../../lib/sreStage4ActionModules.js";

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

function TextBlock({ text }) {
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-[12px] leading-relaxed text-slate-700 shadow-inner dark:border-slate-800/80 dark:bg-slate-900/50 dark:text-slate-300">
      {text}
    </pre>
  );
}

function FieldShell({ label, children }) {
  return (
    <div>
      <h4 className="mb-3 flex items-start gap-2.5 text-[13px] font-semibold leading-snug text-gray-800 dark:text-gray-200">
        <span
          className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500/75 ring-2 ring-blue-500/15 dark:bg-blue-400/80 dark:ring-blue-400/20"
          aria-hidden
        />
        <span>{label}</span>
      </h4>
      <div className="pl-1">{children}</div>
    </div>
  );
}

function StringNumberList({ items }) {
  return (
    <ul className="list-inside list-disc space-y-1.5 pl-1 text-[13px] text-slate-700 dark:text-slate-300">
      {items.map((x, i) => (
        <li key={i}>{String(x)}</li>
      ))}
    </ul>
  );
}

function nonEmptyStr(v) {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/** 行动建议 core_conclusion：推荐方案 + 风险 + 依据 等结构化字段 */
function isStage4StructuredCoreConclusion(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const id =
    nonEmptyStr(raw.recommended_solution_id) ||
    nonEmptyStr(raw.recommendedSolutionId) ||
    nonEmptyStr(raw.solution_id) ||
    nonEmptyStr(raw.solutionId);
  const name =
    nonEmptyStr(raw.recommended_solution_name) ||
    nonEmptyStr(raw.recommendedSolutionName) ||
    nonEmptyStr(raw.solution_name) ||
    nonEmptyStr(raw.solutionName);
  const hasRec = Boolean(id || name);
  const risk = nonEmptyStr(raw.risk_level) || nonEmptyStr(raw.riskLevel);
  const note = nonEmptyStr(raw.risk_note) || nonEmptyStr(raw.riskNote);
  const reason = nonEmptyStr(raw.ruling_reason) || nonEmptyStr(raw.rulingReason);
  const hasRiskOrReason = Boolean(risk || note || reason);
  return hasRec && hasRiskOrReason;
}

function riskLevelPresentation(levelRaw) {
  const s = String(levelRaw ?? "")
    .trim()
    .toLowerCase();
  const labelMap = { high: "高", medium: "中", low: "低", 高: "高", 中: "中", 低: "低" };
  const label = labelMap[s] ?? (String(levelRaw ?? "").trim() || "—");
  let chipClass =
    "border-slate-200/90 bg-slate-100/90 text-slate-800 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100";
  if (s === "high" || s === "高") {
    chipClass =
      "border-rose-200/90 bg-rose-50 text-rose-900 dark:border-rose-800/70 dark:bg-rose-950/45 dark:text-rose-100";
  } else if (s === "medium" || s === "中") {
    chipClass =
      "border-amber-200/90 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-100";
  } else if (s === "low" || s === "低") {
    chipClass =
      "border-emerald-200/90 bg-emerald-50 text-emerald-950 dark:border-emerald-800/55 dark:bg-emerald-950/35 dark:text-emerald-100";
  }
  return { label, chipClass };
}

/** 方案对比：{ id, name, risk, description, expected_effect, applicable_condition }[] */
function isStage4SolutionComparisonList(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return false;
  return raw.every((x) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return false;
    const id = nonEmptyStr(x.id) || nonEmptyStr(x.solution_id) || nonEmptyStr(x.solutionId);
    const name = nonEmptyStr(x.name);
    const desc = nonEmptyStr(x.description);
    return Boolean(id || name || desc);
  });
}

function SolutionComparisonBlockRow({ title, body, accent = "slate", content }) {
  const t = nonEmptyStr(body);
  if (!content && !t) return null;

  const bar =
    accent === "blue"
      ? "bg-blue-500 dark:bg-blue-400"
      : accent === "emerald"
        ? "bg-emerald-500 dark:bg-emerald-400"
        : accent === "amber"
          ? "bg-amber-500 dark:bg-amber-400"
          : accent === "violet"
            ? "bg-violet-500 dark:bg-violet-400"
            : "bg-slate-400 dark:bg-slate-500";

  const panelTint =
    accent === "blue"
      ? "border-blue-100/90 bg-blue-50/45 dark:border-blue-900/35 dark:bg-blue-950/20"
      : accent === "emerald"
        ? "border-emerald-100/90 bg-emerald-50/40 dark:border-emerald-900/35 dark:bg-emerald-950/18"
        : accent === "amber"
          ? "border-amber-100/90 bg-amber-50/40 dark:border-amber-900/35 dark:bg-amber-950/18"
          : accent === "violet"
            ? "border-violet-100/90 bg-violet-50/40 dark:border-violet-900/35 dark:bg-violet-950/20"
            : "border-slate-100/90 bg-slate-50/60 dark:border-slate-800/70 dark:bg-slate-950/35";

  return (
    <div
      className={`flex gap-3 rounded-lg border px-3 py-2.5 sm:gap-3.5 sm:px-3.5 sm:py-3 ${panelTint}`}
    >
      <span
        className={`mt-0.5 w-[3px] shrink-0 self-stretch rounded-full ${bar}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-gray-400">
          {title}
        </p>
        {content ? (
          <div className="mt-1.5">{content}</div>
        ) : (
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-[1.6] text-slate-800 dark:text-slate-200">
            {t}
          </p>
        )}
      </div>
    </div>
  );
}

function SolutionComparisonList({ items }) {
  const indexRing = [
    "ring-violet-500/25 bg-gradient-to-br from-violet-50 to-white text-violet-800 dark:from-violet-950/50 dark:to-gray-950 dark:text-violet-200 dark:ring-violet-400/20",
    "ring-blue-500/25 bg-gradient-to-br from-blue-50 to-white text-blue-900 dark:from-blue-950/45 dark:to-gray-950 dark:text-blue-200 dark:ring-blue-400/20",
    "ring-teal-500/25 bg-gradient-to-br from-teal-50 to-white text-teal-900 dark:from-teal-950/40 dark:to-gray-950 dark:text-teal-200 dark:ring-teal-400/20",
    "ring-amber-500/25 bg-gradient-to-br from-amber-50 to-white text-amber-950 dark:from-amber-950/40 dark:to-gray-950 dark:text-amber-100 dark:ring-amber-400/20",
    "ring-rose-500/25 bg-gradient-to-br from-rose-50 to-white text-rose-900 dark:from-rose-950/40 dark:to-gray-950 dark:text-rose-100 dark:ring-rose-400/20",
    "ring-slate-500/20 bg-gradient-to-br from-slate-50 to-white text-slate-900 dark:from-slate-900/55 dark:to-gray-950 dark:text-slate-200 dark:ring-slate-400/25",
  ];

  return (
    <ol className="list-none space-y-4 p-0 sm:space-y-5">
      {items.map((item, i) => {
        const sid = nonEmptyStr(item.id) || nonEmptyStr(item.solution_id) || nonEmptyStr(item.solutionId);
        const name = nonEmptyStr(item.name);
        const riskRaw = nonEmptyStr(item.risk) || nonEmptyStr(item.risk_level);
        const desc = nonEmptyStr(item.description);
        const expected =
          nonEmptyStr(item.expected_effect) || nonEmptyStr(item.expectedEffect);
        const condition =
          nonEmptyStr(item.applicable_condition) || nonEmptyStr(item.applicableCondition);
        const { label: riskLabel, chipClass: riskChip } = riskLevelPresentation(riskRaw);

        const idxStyle = indexRing[i % indexRing.length];

        return (
          <li
            key={sid ? `${sid}-${i}` : `sol-${i}`}
            className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-black/[0.03] transition-shadow hover:shadow-md hover:ring-black/[0.05] dark:border-gray-800 dark:bg-gray-900 dark:shadow-[0_2px_8px_rgb(0_0_0/0.35)] dark:ring-white/[0.05] dark:hover:ring-white/[0.08]"
          >
            <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50/98 via-white to-slate-50/50 px-3.5 py-3.5 sm:px-4 sm:py-4 dark:border-gray-800/70 dark:from-gray-950/95 dark:via-gray-950/60 dark:to-slate-950/40">
              <div className="flex gap-3 sm:gap-3.5">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold tracking-tight shadow-sm ring-2 ${idxStyle}`}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  {name ? (
                    <p className="text-[14px] font-semibold leading-snug tracking-tight text-gray-900 dark:text-gray-50">
                      {name}
                    </p>
                  ) : null}
                  <div
                    className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 ${name ? "" : "mt-0"}`}
                  >
                    {sid ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200/80 bg-indigo-500/[0.07] px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-indigo-900 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/12 dark:text-indigo-100">
                        <span className="sr-only">方案编号 </span>
                        {sid}
                      </span>
                    ) : null}
                    {riskRaw ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-medium text-gray-500 dark:text-gray-400">风险等级</span>
                        <span
                          className={`inline-flex items-center rounded-lg border px-2 py-0.5 font-semibold tabular-nums shadow-sm ${riskChip}`}
                        >
                          {riskLabel}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-3 bg-gradient-to-b from-white to-slate-50/35 p-3.5 pb-4 sm:space-y-3.5 sm:p-4 sm:pb-[1.125rem] dark:from-gray-900 dark:to-slate-950/50">
              <SolutionComparisonBlockRow accent="blue" title="方案说明" body={desc} />
              <SolutionComparisonBlockRow accent="emerald" title="预期效果" body={expected} />
              <SolutionComparisonBlockRow accent="amber" title="适用条件" body={condition} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** 核心结论：结构化对象 → 多卡片栅格，便于扫读 */
function Stage4StructuredCoreConclusionCards({ data }) {
  const id =
    nonEmptyStr(data.recommended_solution_id) ||
    nonEmptyStr(data.recommendedSolutionId) ||
    nonEmptyStr(data.solution_id) ||
    nonEmptyStr(data.solutionId);
  const name =
    nonEmptyStr(data.recommended_solution_name) ||
    nonEmptyStr(data.recommendedSolutionName) ||
    nonEmptyStr(data.solution_name) ||
    nonEmptyStr(data.solutionName);
  const riskRaw =
    nonEmptyStr(data.risk_level) || nonEmptyStr(data.riskLevel) || nonEmptyStr(data.risk);
  const note = nonEmptyStr(data.risk_note) || nonEmptyStr(data.riskNote);
  const reason = nonEmptyStr(data.ruling_reason) || nonEmptyStr(data.rulingReason);

  const { label: riskLabel, chipClass: riskChip } = riskLevelPresentation(riskRaw);

  const cardBase =
    "rounded-lg border p-3.5 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04] sm:p-4";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {id || name ? (
        <div
          className={`${cardBase} border-indigo-200/70 bg-white/85 dark:border-indigo-900/50 dark:bg-indigo-950/25`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600/90 dark:text-indigo-300/90">
            推荐方案
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {id ? (
              <span className="inline-flex items-center rounded-md border border-indigo-300/80 bg-indigo-500/10 px-2 py-0.5 font-mono text-[12px] font-semibold text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-100">
                {id}
              </span>
            ) : null}
          </div>
          {name ? (
            <p className="mt-2 text-[13px] font-medium leading-snug text-slate-900 dark:text-slate-100">
              {name}
            </p>
          ) : null}
        </div>
      ) : null}

      {riskRaw ? (
        <div
          className={`${cardBase} border-gray-200/90 bg-white/80 dark:border-gray-700 dark:bg-gray-950/40`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            风险等级
          </p>
          <div className="mt-2">
            <span
              className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[13px] font-semibold ${riskChip}`}
            >
              {riskLabel}
            </span>
          </div>
        </div>
      ) : null}

      {note ? (
        <div
          className={`${cardBase} border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white/60 sm:col-span-2 dark:border-amber-900/45 dark:from-amber-950/30 dark:to-gray-950/40`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200/90">
            态势说明
          </p>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-amber-950 dark:text-amber-50/95">
            {note}
          </p>
        </div>
      ) : null}

      {reason ? (
        <div
          className={`${cardBase} border-slate-200/85 bg-white/90 sm:col-span-2 dark:border-slate-700 dark:bg-slate-950/35`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            结论与依据
          </p>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
            {reason}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** 根因摘要：字段中文标题（对象多键时） */
const ROOT_CAUSE_SUMMARY_LABELS = {
  summary: "概要",
  overview: "分析概览",
  root_cause: "根本原因",
  direct_cause: "直接原因",
  contributing_factors: "促成因素",
  ruling_reason: "判定依据",
  evidence_digest: "证据提要",
  description: "说明",
  text: "说明",
  body: "说明",
};

function rootCauseSummaryFieldOrder(k) {
  const order = [
    "summary",
    "overview",
    "root_cause",
    "direct_cause",
    "ruling_reason",
    "contributing_factors",
    "evidence_digest",
    "description",
    "text",
    "body",
  ];
  const i = order.indexOf(k);
  return i === -1 ? 900 : i;
}

function sortedRootCauseSummaryStringEntries(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const entries = Object.entries(obj).filter(([key, v]) => !key.startsWith("_") && nonEmptyStr(v));
  entries.sort(([a], [b]) => {
    const d = rootCauseSummaryFieldOrder(a) - rootCauseSummaryFieldOrder(b);
    return d !== 0 ? d : a.localeCompare(b);
  });
  return entries;
}

function rootCauseSummaryLabelForKey(k) {
  return ROOT_CAUSE_SUMMARY_LABELS[k] ?? String(k).replace(/_/g, " ");
}

/** 根因摘要主文：左侧强调条 + 紫系渐变底，与方案对比区块区分 */
function Stage4RootCauseSummaryProse({ children }) {
  return (
    <div className="rounded-xl border border-violet-200/50 bg-gradient-to-br from-white via-violet-50/[0.22] to-indigo-50/15 py-3.5 pl-3.5 pr-3.5 shadow-sm ring-1 ring-violet-500/[0.05] dark:border-violet-900/38 dark:from-gray-950 dark:via-violet-950/10 dark:to-indigo-950/15 dark:ring-violet-400/[0.07] sm:p-4">
      <div className="flex gap-3 sm:gap-3.5">
        <span
          className="mt-0.5 w-[3px] shrink-0 self-stretch rounded-full bg-gradient-to-b from-violet-500 via-indigo-500 to-slate-400 dark:from-violet-400 dark:via-indigo-500 dark:to-slate-600"
          aria-hidden
        />
        <div className="min-w-0 flex-1 text-[13px] leading-[1.7] text-slate-800 dark:text-slate-200 [&_p]:m-0">
          {children}
        </div>
      </div>
    </div>
  );
}

function Stage4RootCauseSummaryContent({ value }) {
  if (value === undefined || value === null) {
    return <p className="text-xs text-gray-400">暂无内容</p>;
  }

  if (typeof value === "string" || typeof value === "number") {
    const t = String(value).trim();
    if (!t) return <p className="text-xs text-gray-400">暂无内容</p>;
    return (
      <Stage4RootCauseSummaryProse>
        <p className="whitespace-pre-wrap">{t}</p>
      </Stage4RootCauseSummaryProse>
    );
  }

  if (typeof value === "boolean") {
    return (
      <Stage4RootCauseSummaryProse>
        <p>{value ? "是" : "否"}</p>
      </Stage4RootCauseSummaryProse>
    );
  }

  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((x) => typeof x === "string" || typeof x === "number")) {
      const lines = value.map((x) => String(x).trim()).filter(Boolean);
      if (!lines.length) return <p className="text-xs text-gray-400">暂无内容</p>;
      return (
        <Stage4RootCauseSummaryProse>
          <ul className="my-0 list-inside list-disc space-y-1.5 pl-0.5 leading-relaxed">
            {lines.map((line, i) => (
              <li key={i} className="whitespace-pre-wrap">
                {line}
              </li>
            ))}
          </ul>
        </Stage4RootCauseSummaryProse>
      );
    }
    return <JsonBlock value={value} />;
  }

  if (typeof value === "object") {
    const entries = sortedRootCauseSummaryStringEntries(value);
    if (entries.length === 0) {
      const picked = stage2ConclusionSummaryText(value);
      if (picked) {
        return (
          <Stage4RootCauseSummaryProse>
            <p className="whitespace-pre-wrap">{picked}</p>
          </Stage4RootCauseSummaryProse>
        );
      }
      return <JsonBlock value={value} />;
    }
    if (entries.length === 1) {
      const [, text] = entries[0];
      return (
        <Stage4RootCauseSummaryProse>
          <p className="whitespace-pre-wrap">{text}</p>
        </Stage4RootCauseSummaryProse>
      );
    }

    const [first, ...rest] = entries;
    const [fk, ftext] = first;
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-violet-200/50 bg-gradient-to-br from-white via-violet-50/[0.22] to-indigo-50/15 py-3.5 pl-3.5 pr-3.5 shadow-sm ring-1 ring-violet-500/[0.05] dark:border-violet-900/38 dark:from-gray-950 dark:via-violet-950/10 dark:to-indigo-950/15 dark:ring-violet-400/[0.07] sm:p-4">
          <div className="flex gap-3 sm:gap-3.5">
            <span
              className="mt-0.5 w-[3px] shrink-0 self-stretch rounded-full bg-gradient-to-b from-violet-500 via-indigo-500 to-slate-400 dark:from-violet-400 dark:via-indigo-500 dark:to-slate-600"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-violet-700/90 dark:text-violet-300/85">
                {rootCauseSummaryLabelForKey(fk)}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.7] text-slate-800 dark:text-slate-200">
                {ftext}
              </p>
            </div>
          </div>
        </div>
        {rest.map(([k, text]) => (
          <SolutionComparisonBlockRow
            key={k}
            accent="violet"
            title={rootCauseSummaryLabelForKey(k)}
            body={text}
          />
        ))}
      </div>
    );
  }

  return <TextBlock text={String(value)} />;
}

/** 「步骤 1：…」与左侧序号徽章重复时去掉前缀 */
function stripEmbeddedStepPrefix(text) {
  const t = String(text ?? "").trim();
  if (!t) return t;
  const stripped = t.replace(/^步骤\s*\d+\s*[:：.．]\s*/i, "").trim();
  return stripped.length ? stripped : t;
}

/** 推荐方案详情：含 detailed_steps / id / name / estimated_duration */
function RecommendedSolutionDetailBody({ raw }) {
  if (Array.isArray(raw)) {
    if (raw.length > 0 && raw.every((x) => typeof x === "string" || typeof x === "number")) {
      return <StringNumberList items={raw.map(String)} />;
    }
    return <JsonBlock value={raw} />;
  }

  if (!raw || typeof raw !== "object") {
    return <JsonBlock value={raw} />;
  }

  const steps = raw.detailed_steps;
  const hasStructuredSteps =
    Array.isArray(steps) &&
    steps.length > 0 &&
    steps.every((x) => typeof x === "string" || typeof x === "number");

  if (hasStructuredSteps) {
    const sid =
      nonEmptyStr(raw.id) ||
      nonEmptyStr(raw.solution_id) ||
      nonEmptyStr(raw.solutionId);
    const name = nonEmptyStr(raw.name) || nonEmptyStr(raw.title);
    const duration =
      nonEmptyStr(raw.estimated_duration) ||
      nonEmptyStr(raw.estimatedDuration) ||
      nonEmptyStr(raw.duration);

    const stepLines = steps.map((s) => stripEmbeddedStepPrefix(s));

    return (
      <div className="space-y-4">
        {sid || name || duration ? (
          <div className="rounded-xl border border-indigo-200/60 bg-gradient-to-r from-gray-50/98 via-white to-indigo-50/35 px-3.5 py-3.5 shadow-sm ring-1 ring-indigo-500/[0.04] dark:border-indigo-900/45 dark:from-gray-950/95 dark:via-gray-950/70 dark:to-indigo-950/25 dark:ring-indigo-400/08 sm:px-4 sm:py-4">
            <div className="flex flex-wrap items-start gap-2">
              {sid ? (
                <span className="inline-flex shrink-0 items-center rounded-lg border border-indigo-300/75 bg-indigo-500/[0.08] px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-900 shadow-sm dark:border-indigo-500/35 dark:bg-indigo-500/12 dark:text-indigo-100">
                  {sid}
                </span>
              ) : null}
              {name ? (
                <p className="min-w-0 flex-1 text-[14px] font-semibold leading-snug tracking-tight text-gray-900 dark:text-gray-50">
                  {name}
                </p>
              ) : null}
            </div>
            {duration ? (
              <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-slate-200/85 bg-slate-50/90 px-3 py-2 text-[13px] dark:border-slate-700/80 dark:bg-slate-900/50">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  预计耗时
                </span>
                <span className="min-w-0 flex-1 font-medium leading-relaxed text-slate-800 dark:text-slate-200">
                  {duration}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-gray-400">
            详细步骤
          </p>
          <ol className="m-0 list-none space-y-2.5 p-0">
            {stepLines.map((line, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-lg border border-slate-200/85 bg-gradient-to-br from-white to-slate-50/40 px-3 py-2.5 shadow-sm ring-1 ring-black/[0.02] dark:border-slate-700 dark:from-gray-950/50 dark:to-slate-950/35 dark:ring-white/[0.04] sm:gap-3.5 sm:px-3.5 sm:py-3"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/12 text-[12px] font-bold tabular-nums text-indigo-900 shadow-sm dark:bg-indigo-500/14 dark:text-indigo-100"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-[1.65] text-slate-800 dark:text-slate-200">
                  {line}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  return <JsonBlock value={raw} />;
}

/** 「（1）…」条目拆分为列表展示 */
function stripLeadingEnumerationPrefix(line) {
  return String(line ?? "")
    .trim()
    .replace(/^[（(]\d+[）)]\s*/, "")
    .trim();
}

function splitChineseEnumeratedClauses(text) {
  const t = nonEmptyStr(text);
  if (!t) return { plain: true, full: t, intro: null, items: [] };
  const chunks = t.split(/(?=[（(]\d+[）)])/).map((s) => s.trim()).filter(Boolean);
  if (chunks.length <= 1) {
    return { plain: true, full: t, intro: null, items: [] };
  }
  const first = chunks[0];
  if (/^[（(]\d+[）)]/.test(first)) {
    return { plain: false, full: null, intro: null, items: chunks };
  }
  return { plain: false, full: null, intro: first, items: chunks.slice(1) };
}

function RollbackEnumeratedBody({ text, tryEnumerate }) {
  const t = nonEmptyStr(text);
  if (!t) return null;
  if (!tryEnumerate) {
    return (
      <p className="whitespace-pre-wrap text-[13px] leading-[1.65] text-slate-800 dark:text-slate-200">{t}</p>
    );
  }
  const split = splitChineseEnumeratedClauses(t);
  if (split.plain) {
    return (
      <p className="whitespace-pre-wrap text-[13px] leading-[1.65] text-slate-800 dark:text-slate-200">{split.full}</p>
    );
  }
  return (
    <div className="space-y-2.5">
      {split.intro ? (
        <p className="whitespace-pre-wrap text-[13px] font-medium leading-relaxed text-slate-800 dark:text-slate-200">
          {split.intro}
        </p>
      ) : null}
      <ol className="m-0 list-none space-y-2 p-0">
        {split.items.map((line, i) => (
          <li
            key={i}
            className="flex gap-3 rounded-lg border border-slate-200/60 bg-white/70 px-2.5 py-2 dark:border-slate-600/55 dark:bg-slate-950/35"
          >
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-500/14 text-[11px] font-bold tabular-nums text-slate-800 dark:bg-slate-500/22 dark:text-slate-100"
              aria-hidden
            >
              {i + 1}
            </span>
            <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-[1.65] text-slate-800 dark:text-slate-200">
              {stripLeadingEnumerationPrefix(line)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

const ROLLBACK_PLAN_SECTIONS = [
  {
    keys: ["trigger_condition", "triggerCondition"],
    title: "触发条件",
    accent: "amber",
    tryEnumerate: true,
  },
  {
    keys: ["rollback_method", "rollbackMethod"],
    title: "回滚方式",
    accent: "blue",
    tryEnumerate: true,
  },
  {
    keys: ["estimated_duration", "estimatedDuration", "duration"],
    title: "预计耗时",
    accent: "slate",
    tryEnumerate: false,
  },
  {
    keys: ["success_criteria", "successCriteria"],
    title: "成功判定",
    accent: "emerald",
    tryEnumerate: false,
  },
];

function pickFirstRollbackField(raw, keys) {
  for (const k of keys) {
    const t = nonEmptyStr(raw[k]);
    if (t) return t;
  }
  return null;
}

function isStage4RollbackPlanObject(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return ROLLBACK_PLAN_SECTIONS.some((sec) => pickFirstRollbackField(raw, sec.keys) != null);
}

function RollbackPlanStructuredBody({ raw }) {
  return (
    <div className="space-y-3">
      {ROLLBACK_PLAN_SECTIONS.map((sec) => {
        const text = pickFirstRollbackField(raw, sec.keys);
        if (text == null) return null;
        return (
          <SolutionComparisonBlockRow
            key={sec.keys[0]}
            accent={sec.accent}
            title={sec.title}
            content={<RollbackEnumeratedBody text={text} tryEnumerate={sec.tryEnumerate} />}
          />
        );
      })}
    </div>
  );
}

/** 执行后检查清单：字符串数组 → 编号卡片列表（与详细步骤同源布局，强调色区分） */
function PostExecutionChecklistList({ items }) {
  const lines = items.map((x) => String(x).trim()).filter(Boolean);
  if (!lines.length) {
    return <p className="text-xs text-gray-400">暂无内容</p>;
  }
  return (
    <ol className="m-0 list-none space-y-2.5 p-0">
      {lines.map((line, i) => (
        <li
          key={i}
          className="flex gap-3 rounded-lg border border-slate-200/85 bg-gradient-to-br from-white to-emerald-50/[0.22] px-3 py-2.5 shadow-sm ring-1 ring-black/[0.02] dark:border-emerald-900/35 dark:from-gray-950/55 dark:to-emerald-950/18 dark:ring-white/[0.04] sm:gap-3.5 sm:px-3.5 sm:py-3"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600/14 text-[12px] font-bold tabular-nums text-emerald-900 shadow-sm dark:bg-emerald-500/18 dark:text-emerald-100"
            aria-hidden
          >
            {i + 1}
          </span>
          <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-[1.65] text-slate-800 dark:text-slate-200">
            {line}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** 残余风险：字符串数组 → 编号卡片（风险向配色） */
function ResidualRisksCardList({ items }) {
  const lines = items.map((x) => String(x).trim()).filter(Boolean);
  if (!lines.length) {
    return <p className="text-xs text-gray-400">暂无内容</p>;
  }
  return (
    <ol className="m-0 list-none space-y-2.5 p-0">
      {lines.map((line, i) => (
        <li
          key={i}
          className="flex gap-3 rounded-lg border border-rose-200/70 bg-gradient-to-br from-white to-rose-50/[0.18] px-3 py-2.5 shadow-sm ring-1 ring-rose-500/[0.04] dark:border-rose-900/40 dark:from-gray-950/55 dark:to-rose-950/16 dark:ring-rose-400/[0.08] sm:gap-3.5 sm:px-3.5 sm:py-3"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-600/13 text-[12px] font-bold tabular-nums text-rose-900 shadow-sm dark:bg-rose-500/17 dark:text-rose-100"
            aria-hidden
          >
            {i + 1}
          </span>
          <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-[1.65] text-slate-800 dark:text-slate-200">
            {line}
          </p>
        </li>
      ))}
    </ol>
  );
}

function approvalStatusLabel(statusRaw) {
  const u = String(statusRaw ?? "").trim().toUpperCase();
  if (u === "WAITING_FOR_APPROVAL") return "待审批";
  if (u === "APPROVED") return "已通过";
  if (u === "REJECTED") return "已驳回";
  return String(statusRaw ?? "").trim() || "—";
}

function approvalStatusChipClass(statusRaw) {
  const u = String(statusRaw ?? "").trim().toUpperCase();
  if (u === "WAITING_FOR_APPROVAL") {
    return "border-amber-200/90 bg-amber-50 text-amber-950 dark:border-amber-800/55 dark:bg-amber-950/35 dark:text-amber-50";
  }
  if (u === "APPROVED") {
    return "border-emerald-200/90 bg-emerald-50 text-emerald-950 dark:border-emerald-800/55 dark:bg-emerald-950/35 dark:text-emerald-100";
  }
  if (u === "REJECTED") {
    return "border-rose-200/90 bg-rose-50 text-rose-950 dark:border-rose-800/55 dark:bg-rose-950/35 dark:text-rose-50";
  }
  return "border-slate-200/90 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
}

function approvalActionRowShellClass(actionRaw) {
  const a = String(actionRaw ?? "").trim().toLowerCase();
  if (a === "approve") {
    return "border-emerald-200/72 bg-gradient-to-br from-white to-emerald-50/[0.18] shadow-sm ring-1 ring-emerald-500/[0.04] dark:border-emerald-900/42 dark:from-gray-950/52 dark:to-emerald-950/16 dark:ring-emerald-400/10";
  }
  if (a === "cancel") {
    return "border-slate-200/85 bg-gradient-to-br from-white to-slate-50/45 shadow-sm ring-1 ring-black/[0.02] dark:border-slate-700 dark:from-gray-950/50 dark:to-slate-950/40 dark:ring-white/[0.04]";
  }
  if (a === "reanalyze") {
    return "border-indigo-200/72 bg-gradient-to-br from-white to-indigo-50/[0.2] shadow-sm ring-1 ring-indigo-500/[0.05] dark:border-indigo-900/42 dark:from-gray-950/50 dark:to-indigo-950/18 dark:ring-indigo-400/10";
  }
  return "border-gray-200/85 bg-white shadow-sm ring-1 ring-black/[0.02] dark:border-gray-700 dark:bg-gray-950/42 dark:ring-white/[0.04]";
}

function approvalActionIndexClass(actionRaw) {
  const a = String(actionRaw ?? "").trim().toLowerCase();
  if (a === "approve") {
    return "bg-emerald-600/13 text-emerald-900 dark:bg-emerald-500/17 dark:text-emerald-100";
  }
  if (a === "cancel") {
    return "bg-slate-500/14 text-slate-800 dark:bg-slate-500/22 dark:text-slate-100";
  }
  if (a === "reanalyze") {
    return "bg-indigo-600/13 text-indigo-900 dark:bg-indigo-500/17 dark:text-indigo-100";
  }
  return "bg-blue-600/12 text-blue-900 dark:bg-blue-500/15 dark:text-blue-100";
}

function isStage4ApprovalRequestObject(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const actions = raw.available_actions ?? raw.availableActions;
  if (!Array.isArray(actions) || actions.length === 0) return false;
  return actions.every(
    (x) =>
      x &&
      typeof x === "object" &&
      !Array.isArray(x) &&
      Boolean(
        nonEmptyStr(x.action) || nonEmptyStr(x.label) || nonEmptyStr(x.description),
      ),
  );
}

function ApprovalRequestStructuredBody({ raw }) {
  const status =
    nonEmptyStr(raw.status) ||
    nonEmptyStr(raw.approval_status) ||
    nonEmptyStr(raw.approvalStatus);
  const recId =
    nonEmptyStr(raw.recommended_solution_id) ||
    nonEmptyStr(raw.recommendedSolutionId) ||
    nonEmptyStr(raw.solution_id) ||
    nonEmptyStr(raw.solutionId);
  const riskRaw = nonEmptyStr(raw.risk_level) || nonEmptyStr(raw.riskLevel);
  const { label: riskLabel, chipClass: riskChip } = riskLevelPresentation(riskRaw);

  const actionsRaw = raw.available_actions ?? raw.availableActions ?? [];

  const hasMetaBar = Boolean(status || recId || riskRaw);

  return (
    <div className="space-y-4">
      {hasMetaBar ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200/80 bg-gradient-to-r from-slate-50/90 via-white to-indigo-50/25 px-3 py-3 shadow-sm ring-1 ring-black/[0.03] dark:border-slate-700 dark:from-gray-950/92 dark:via-gray-950/65 dark:to-indigo-950/25 dark:ring-white/[0.04] sm:gap-x-4 sm:px-4">
          {status ? (
            <span
              className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${approvalStatusChipClass(status)}`}
            >
              {approvalStatusLabel(status)}
            </span>
          ) : null}
          {recId ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-800 dark:text-slate-100">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                推荐方案
              </span>
              <span className="rounded-lg border border-indigo-300/75 bg-indigo-500/[0.08] px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-900 dark:border-indigo-500/35 dark:bg-indigo-500/14 dark:text-indigo-100">
                {recId}
              </span>
            </span>
          ) : null}
          {riskRaw ? (
            <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-medium text-gray-500 dark:text-gray-400">风险等级</span>
              <span
                className={`inline-flex items-center rounded-lg border px-2 py-0.5 font-semibold tabular-nums shadow-sm ${riskChip}`}
              >
                {riskLabel}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-gray-400">
          可选操作
        </p>
        <ol className="m-0 list-none space-y-2.5 p-0">
          {actionsRaw.map((item, i) => {
            const act = nonEmptyStr(item?.action);
            const lbl = nonEmptyStr(item?.label);
            const dsc = nonEmptyStr(item?.description);
            if (!act && !lbl && !dsc) return null;
            return (
              <li
                key={i}
                className={`rounded-lg px-3 py-2.5 sm:px-3.5 sm:py-3 ${approvalActionRowShellClass(act ?? "")}`}
              >
                <div className="flex gap-3 sm:gap-3.5">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold tabular-nums shadow-sm ${approvalActionIndexClass(act ?? "")}`}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {act ? (
                        <span className="rounded-md border border-black/[0.06] bg-black/[0.04] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:border-white/10 dark:bg-white/[0.08] dark:text-slate-200">
                          {act}
                        </span>
                      ) : null}
                    </div>
                    {lbl ? (
                      <p className="text-[13px] font-semibold leading-snug text-gray-900 dark:text-gray-50">
                        {lbl}
                      </p>
                    ) : null}
                    {dsc ? (
                      <p className="whitespace-pre-wrap text-[13px] leading-[1.65] text-slate-700 dark:text-slate-300">
                        {dsc}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function renderActionFieldBody(key, rawVal, slot) {
  if (slot) {
    return (
      <div className="space-y-2">
        {slot.status === "loading" ? (
          <p className="text-xs text-gray-400">加载引用文件…</p>
        ) : slot.status === "error" ? (
          <p className="text-xs text-rose-600 dark:text-rose-400">{slot.error || "加载失败"}</p>
        ) : slot.kind === "json" ? (
          renderActionFieldBody(key, slot.data, null)
        ) : key === "root_cause_summary" ? (
          <Stage4RootCauseSummaryContent value={slot.text ?? ""} />
        ) : (
          <TextBlock text={slot.text ?? ""} />
        )}
      </div>
    );
  }

  if (key === "root_cause_summary") {
    return <Stage4RootCauseSummaryContent value={rawVal} />;
  }

  if (rawVal === undefined || rawVal === null) return <TextBlock text="" />;

  if (typeof rawVal === "string" || typeof rawVal === "number") {
    if (key === "core_conclusion") {
      return (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
          {String(rawVal)}
        </p>
      );
    }
    return <TextBlock text={String(rawVal)} />;
  }

  if (typeof rawVal === "boolean") {
    return <TextBlock text={rawVal ? "是" : "否"} />;
  }

  if (Array.isArray(rawVal)) {
    if (key === "solution_comparison" && isStage4SolutionComparisonList(rawVal)) {
      return <SolutionComparisonList items={rawVal} />;
    }
    if (
      key === "post_execution_checklist" &&
      rawVal.length > 0 &&
      rawVal.every((x) => typeof x === "string" || typeof x === "number")
    ) {
      return <PostExecutionChecklistList items={rawVal} />;
    }
    if (
      key === "residual_risks" &&
      rawVal.length > 0 &&
      rawVal.every((x) => typeof x === "string" || typeof x === "number")
    ) {
      return <ResidualRisksCardList items={rawVal} />;
    }
    if (rawVal.length > 0 && rawVal.every((x) => typeof x === "string" || typeof x === "number")) {
      return <StringNumberList items={rawVal.map(String)} />;
    }
    return <JsonBlock value={rawVal} />;
  }

  if (typeof rawVal === "object") {
    if (key === "core_conclusion") {
      if (isStage4StructuredCoreConclusion(rawVal)) {
        return <Stage4StructuredCoreConclusionCards data={rawVal} />;
      }
      const t = stage2ConclusionSummaryText(rawVal);
      if (t != null) {
        return (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
            {t}
          </p>
        );
      }
    }
    if (key === "recommended_solution_detail") {
      return <RecommendedSolutionDetailBody raw={rawVal} />;
    }
    if (key === "rollback_plan" && isStage4RollbackPlanObject(rawVal)) {
      return <RollbackPlanStructuredBody raw={rawVal} />;
    }
    if (key === "approval_request" && isStage4ApprovalRequestObject(rawVal)) {
      return <ApprovalRequestStructuredBody raw={rawVal} />;
    }
    return <JsonBlock value={rawVal} />;
  }

  return <TextBlock text={String(rawVal)} />;
}

export const SreStage4ActionModules = memo(function SreStage4ActionModules({ root, nested }) {
  const aliases = useMemo(() => mergeStage4KeyAliases(root), [root]);
  const nest = nested ?? {};

  const hasAny = SRE_STAGE4_MODULES.some((m) => stage4ModuleHasData(m, root, nest));
  if (!hasAny) {
    return <p className="text-xs text-gray-400">暂无数据</p>;
  }

  return (
    <div className="space-y-5">
      {SRE_STAGE4_MODULES.map((module) => {
        if (!stage4ModuleHasData(module, root, nest)) return null;

        const moduleBody =
          module.id === "conclusion" ? (
            <div className="max-w-[100ch] rounded-xl border border-indigo-100/85 bg-gradient-to-br from-indigo-50/60 via-white to-slate-50/40 p-4 shadow-sm ring-1 ring-indigo-500/[0.06] dark:border-indigo-900/40 dark:from-indigo-950/[0.2] dark:via-gray-950/65 dark:to-slate-950/80 dark:ring-indigo-400/10 [&_p]:m-0 [&_p]:text-[13px] [&_p]:leading-relaxed">
              {module.keys.map((key) => {
                if (!stage4KeyHasPresentData(key, root[key], nest[key])) return null;
                return (
                  <div key={key}>{renderActionFieldBody(key, root[key], nest[key])}</div>
                );
              })}
            </div>
          ) : module.id === "root_cause" ? (
            <div className="p-4 sm:p-5">
              {module.keys.map((key) => {
                if (!stage4KeyHasPresentData(key, root[key], nest[key])) return null;
                const body = renderActionFieldBody(key, root[key], nest[key]);
                return <div key={key}>{body}</div>;
              })}
            </div>
          ) : module.id === "comparison" ||
            module.id === "recommended" ||
            module.id === "rollback" ||
            module.id === "checklist" ||
            module.id === "risks" ||
            module.id === "approval" ? (
            <div className="p-4 sm:p-5">
              {module.keys.map((key) => {
                if (!stage4KeyHasPresentData(key, root[key], nest[key])) return null;
                const body = renderActionFieldBody(key, root[key], nest[key]);
                return <div key={key}>{body}</div>;
              })}
            </div>
          ) : (
            <div className="space-y-6 p-4 sm:p-5">
              {module.keys.map((key) => {
                if (!stage4KeyHasPresentData(key, root[key], nest[key])) return null;
                const label = aliases[key] || key;
                const body = renderActionFieldBody(key, root[key], nest[key]);
                return (
                  <FieldShell key={key} label={label}>
                    {body}
                  </FieldShell>
                );
              })}
            </div>
          );

        if (module.id === "conclusion") {
          return (
            <header key={module.id}>
              <h2 className="mb-2 text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                {module.title}
              </h2>
              {moduleBody}
            </header>
          );
        }

        return (
          <section
            key={module.id}
            className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:ring-white/[0.06]"
          >
            <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50/95 via-white to-slate-50/40 px-4 py-3.5 dark:border-gray-800/50 dark:from-gray-950/50 dark:via-gray-950/30 dark:to-slate-950/25">
              <h3 className="text-sm font-semibold tracking-tight text-gray-800 dark:text-gray-100">
                {module.title}
              </h3>
            </div>
            {moduleBody}
          </section>
        );
      })}
    </div>
  );
});
