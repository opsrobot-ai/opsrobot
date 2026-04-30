import intl from "react-intl-universal";
import Icon from "../../components/Icon.jsx";

/** 指标模型：后续可接入指标定义、维度度量与物化逻辑 */
export default function MetricModelPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-gray-50/50 p-6 dark:bg-gray-950/30">
      <section className="mx-auto max-w-3xl rounded-xl border border-gray-200/80 bg-white p-8 shadow-card dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary dark:bg-primary/15">
            <Icon name="activity" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{intl.get("page.metricModel.title")}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{intl.get("page.metricModel.subtitle")}</p>
          </div>
        </div>
        <p className="mt-6 text-sm text-gray-600 dark:text-gray-300">{intl.get("page.metricModel.placeholder")}</p>
      </section>
    </div>
  );
}
