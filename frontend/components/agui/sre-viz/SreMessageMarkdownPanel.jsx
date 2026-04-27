/**
 * 长 Markdown 报告面板：最终报告等走与 Tab 相同的 `SreReportTabContent` 富渲染（含候选方案卡片等）。
 */

import { SreReportTabContent } from "../SreReportTabContent.jsx";
import { Shell } from "./SreVizShell.jsx";

export function SreMessageMarkdownPanel({ panel }) {
  const markdown = String(panel.markdown ?? "").trim();
  const title = panel.title || "消息";

  return (
    <Shell title={title} accent="blue">
      <div className="max-h-[70vh] min-h-0 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/40 px-2 py-2 dark:border-gray-700 dark:bg-gray-950/50">
        <SreReportTabContent
          tab={{
            stage: "final",
            markdown,
            label: title,
            status: "ready",
          }}
        />
      </div>
    </Shell>
  );
}
