import { useEffect, useMemo, useState } from "react";
import intl from "react-intl-universal";
import PathHeader from "../../components/PathHeader.jsx";
import Icon from "../../components/Icon.jsx";
import { fetchDataViewDetail } from "../../lib/catalogApi.js";

function prettyJson(v) {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return String(v ?? "");
  }
}

function formatTime(ts) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    // eslint-disable-next-line no-restricted-globals
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString();
  } catch {
    return String(ts);
  }
}

export default function DataViewDetailView({ view, onBack }) {
  const viewId = view?.viewId || "";
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    async function run() {
      if (!viewId) return;
      setLoading(true);
      setErr("");
      try {
        const data = await fetchDataViewDetail(viewId);
        if (!alive) return;
        setDetail(data);
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    }
    void run();
    return () => {
      alive = false;
    };
  }, [viewId]);

  const title = useMemo(() => {
    return String(detail?.viewName || view?.viewName || "—");
  }, [detail, view]);

  if (!viewId) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        请选择一个数据视图
      </div>
    );
  }

  return (
    <div className="min-h-0 w-full">
      <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <PathHeader
          onBack={onBack}
          backLabel={intl.get("dataCatalog.actions.back")}
          segments={[intl.get("nav.dataView"), title]}
        />
      </div>

      <div className="space-y-4 p-4">
        {err ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            {err}
          </div>
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-gray-900 dark:text-gray-50">{title}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                viewId：{viewId} {loading ? "（加载中…）" : ""}
              </p>
            </div>
            {onBack ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900/40"
                onClick={onBack}
              >
                <Icon name="chevronLeft" className="h-4 w-4" />
                {intl.get("dataCatalog.actions.back")}
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
              <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("dataView.form.targetDatabase")}</p>
              <p className="mt-1 break-all">{detail?.targetDatabase || "—"}</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
              <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("dataView.form.viewType")}</p>
              <p className="mt-1 break-all">{detail?.viewType || "—"}</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
              <p className="text-xs text-gray-500 dark:text-gray-400">更新时间</p>
              <p className="mt-1 break-all">{formatTime(detail?.updatedAt)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950/30">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{intl.get("dataView.form.viewSql")}</p>
          <pre className="mt-3 overflow-auto rounded-lg bg-gray-950 px-3 py-2 text-xs text-gray-100">{detail?.viewSql || ""}</pre>
          {Array.isArray(detail?.sourceCatalogs) && detail.sourceCatalogs.length > 0 ? (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {intl.get("dataView.detail.sourceCatalogs")}: {detail.sourceCatalogs.join(", ")}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950/30">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">原始数据</p>
          <pre className="mt-3 overflow-auto rounded-lg bg-gray-950 px-3 py-2 text-xs text-gray-100">{prettyJson(detail)}</pre>
        </div>
      </div>
    </div>
  );
}

