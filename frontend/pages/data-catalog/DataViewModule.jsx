import { useCallback, useEffect, useState } from "react";
import intl from "react-intl-universal";
import DataViewTreePanel from "./DataViewTreePanel.jsx";
import DataViewDetailView from "./DataViewDetailView.jsx";

/** 基于 Doris Catalog 的多源逻辑视图：列表 + 定义 + 预览 */
export default function DataViewModule() {
  const [toast, setToast] = useState("");
  const [selection, setSelection] = useState({ viewId: "", viewName: "" });

  useEffect(() => {
    if (!toast) return;
    const tid = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(tid);
  }, [toast]);

  const handleSelectView = useCallback((v) => {
    setSelection({ viewId: String(v?.viewId || ""), viewName: String(v?.viewName || "") });
  }, []);

  const handleBack = useCallback(() => {
    setSelection({ viewId: "", viewName: "" });
  }, []);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-gray-50/50 dark:bg-gray-950/30">
      {toast ? (
        <div className="pointer-events-none fixed left-1/2 top-20 z-[220] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-gray-100 dark:text-gray-900">
          {toast}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="w-[min(100%,18rem)] shrink-0 lg:w-72">
          <DataViewTreePanel selection={selection} onSelectView={handleSelectView} />
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-white dark:bg-gray-950/40">
          <DataViewDetailView view={selection} onBack={selection.viewId ? handleBack : null} />
        </div>
      </div>
    </div>
  );
}
