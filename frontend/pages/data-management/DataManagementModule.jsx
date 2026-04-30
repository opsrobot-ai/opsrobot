import { useState } from "react";
import intl from "react-intl-universal";
import DataCatalogModule from "../data-catalog/DataCatalogModule.jsx";
import DataViewPanel from "./DataViewPanel.jsx";
import MetricModelPanel from "./MetricModelPanel.jsx";

const TABS = [
  { key: "catalog", labelKey: "nav.dataCatalog" },
  { key: "dataView", labelKey: "nav.dataView" },
  { key: "metricModel", labelKey: "nav.metricModel" },
];

export default function DataManagementModule() {
  const [activeTab, setActiveTab] = useState("catalog");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-gray-200/80 bg-white/95 px-4 dark:border-gray-800 dark:bg-gray-950/95 sm:px-6">
        <nav className="flex gap-1" aria-label={intl.get("nav.dataManagement")}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
              ].join(" ")}
            >
              {intl.get(tab.labelKey)}
            </button>
          ))}
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "catalog" ? <DataCatalogModule /> : null}
        {activeTab === "dataView" ? <DataViewPanel /> : null}
        {activeTab === "metricModel" ? <MetricModelPanel /> : null}
      </div>
    </div>
  );
}
