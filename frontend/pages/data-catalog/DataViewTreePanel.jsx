import { useEffect, useMemo, useState } from "react";
import intl from "react-intl-universal";
import Icon from "../../components/Icon.jsx";
import { fetchDataViewTree } from "../../lib/catalogApi.js";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function DataViewTreePanel({ selection, onSelectView, onTreeRefresh }) {
  const [tree, setTree] = useState({ groups: [] });
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [openGroups, setOpenGroups] = useState(() => ({}));

  const loadTree = async () => {
    setLoading(true);
    try {
      const data = await fetchDataViewTree({ viewName: q.trim() || undefined });
      setTree(data && typeof data === "object" ? data : { groups: [] });
      onTreeRefresh?.();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const arr = Array.isArray(tree?.groups) ? tree.groups : [];
    // 默认展开“所有”
    if (arr.length > 0) {
      const firstKey = String(arr[0]?.key || "");
      if (firstKey) {
        setOpenGroups((prev) => (prev[firstKey] == null ? { ...prev, [firstKey]: true } : prev));
      }
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  const activeViewId = selection?.viewId || "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-gray-950/40">
      <div className="border-b border-gray-100 p-3 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={intl.get("dataView.filter.namePlaceholder")}
            className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            title={intl.get("dataCatalog.actions.refresh")}
            aria-label={intl.get("dataCatalog.actions.refresh")}
            onClick={() => void loadTree()}
          >
            <Icon name={loading ? "loading" : "refresh"} className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-0">
        {groups.map((g) => {
          const gKey = String(g.key || "");
          const label = String(g.label || gKey || "—");
          const views = Array.isArray(g.views) ? g.views : [];
          const open = openGroups[gKey] ?? (gKey === "__all__");
          return (
            <div key={gKey} className="mb-0">
              <button
                type="button"
                onClick={() => setOpenGroups((prev) => ({ ...prev, [gKey]: !(prev[gKey] ?? (gKey === "__all__")) }))}
                className="flex w-full items-center justify-between rounded-none px-0 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/50"
              >
                <span className="truncate font-medium">
                  {label}
                  <span className="ml-2 text-xs text-gray-400">({views.length})</span>
                </span>
                <Icon name="chevron" className={cx("h-4 w-4 text-gray-400 transition-transform", open ? "rotate-180" : "")} />
              </button>

              {open ? (
                <div className="mt-1 space-y-1 pl-0">
                  {views.length === 0 ? (
                    <p className="px-0 py-1 text-xs text-gray-400">{intl.get("common.noData")}</p>
                  ) : (
                    views.map((v) => (
                      <button
                        key={v.viewId}
                        type="button"
                        onClick={() => onSelectView?.(v)}
                        className={cx(
                          "flex w-full items-center gap-2 rounded-none border px-0 py-1.5 text-left text-sm",
                          activeViewId === v.viewId
                            ? "border-primary/40 bg-primary-soft/60 text-primary dark:bg-primary/15"
                            : "border-transparent text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/50"
                        )}
                      >
                        <Icon name="inspection" className="h-4 w-4 text-gray-400" />
                        <span className="min-w-0 flex-1 truncate">{v.viewName || v.viewId}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

