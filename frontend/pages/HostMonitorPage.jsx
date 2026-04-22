import { useState, useEffect, useCallback, useMemo } from "react";
import intl from "react-intl-universal";
import Icon from "../components/Icon.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import HostMonitorOverview from "./host-monitor/HostMonitorOverview.jsx";
import HostMonitorDetail from "./host-monitor/HostMonitorDetail.jsx";

const PAGE_TABS = [
  { key: "runOverview", labelKey: "hostMonitor.pageTab.runOverview" },
  { key: "runDetail", labelKey: "hostMonitor.pageTab.runDetail" },
];

export default function HostMonitorPage() {
  const [pageTab, setPageTab] = useState("runOverview");
  const [overviewData, setOverviewData] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewErr, setOverviewErr] = useState(null);

  const [selectedHost, setSelectedHost] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewErr(null);
    try {
      const res = await fetch("/api/host-monitor/overview?hours=24");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setOverviewData(json);
    } catch (e) {
      setOverviewErr(e instanceof Error ? e.message : String(e));
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleHostClick = useCallback((host) => {
    setSelectedHost(host);
    setPageTab("runDetail");
  }, []);

  const handleBackToOverview = useCallback(() => {
    setPageTab("runOverview");
  }, []);

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pb-8">
      <div className="border-b border-gray-100 dark:border-gray-700/60">
        <nav className="flex flex-wrap gap-1" role="tablist" aria-label={intl.get("hostMonitor.pageTab.ariaLabel")}>
          {PAGE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={pageTab === tab.key}
              onClick={() => setPageTab(tab.key)}
              className={[
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                pageTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
              ].join(" ")}
            >
              {intl.get(tab.labelKey)}
            </button>
          ))}
        </nav>
      </div>

      {pageTab === "runOverview" && (
        <HostMonitorOverview onHostClick={handleHostClick} />
      )}

      {pageTab === "runDetail" && (
        <HostMonitorDetail
          selectedHost={selectedHost}
          overviewData={overviewData}
          onBack={handleBackToOverview}
        />
      )}
    </div>
  );
}
