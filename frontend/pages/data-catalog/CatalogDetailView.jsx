import { useEffect, useMemo, useState } from "react";
import intl from "react-intl-universal";
import PathHeader from "../../components/PathHeader.jsx";
import Icon from "../../components/Icon.jsx";
import { fetchCatalogDetail } from "../../lib/catalogApi.js";

function typeLabel(type) {
  const t = String(type || "").trim();
  if (!t) return "—";
  const key = `dataCatalog.type.${t.toLowerCase()}`;
  const v = intl.get(key);
  return v === key ? t : v;
}

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

export default function CatalogDetailView({ catalog, onBack }) {
  const catalogId = catalog?.catalogId ?? "";
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    async function run() {
      if (!catalogId) return;
      setLoading(true);
      setErr("");
      try {
        const data = await fetchCatalogDetail(catalogId);
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
  }, [catalogId]);

  const title = useMemo(() => {
    const name = detail?.businessName || catalog?.businessName || detail?.catalogName || catalog?.catalogName || "—";
    const catName = detail?.catalogName || catalog?.catalogName || "";
    return catName && name !== catName ? `${name}（${catName}）` : name;
  }, [catalog, detail]);

  const segments = useMemo(() => [intl.get("dataCatalog.tree.root"), title], [title]);

  return (
    <div className="min-h-0 w-full">
      <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <PathHeader onBack={onBack} backLabel={intl.get("dataCatalog.actions.back")} segments={segments} />
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
                {intl.get("dataCatalog.table.catalogType")}：{typeLabel(detail?.catalogType || catalog?.catalogType)}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900/40"
              onClick={onBack}
            >
              <Icon name="chevronLeft" className="h-4 w-4" />
              {intl.get("dataCatalog.actions.back")}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
              <p className="text-xs text-gray-500 dark:text-gray-400">业务名称</p>
              <p className="mt-1 break-all">{detail?.businessName || "—"}</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
              <p className="text-xs text-gray-500 dark:text-gray-400">Catalog 名称</p>
              <p className="mt-1 break-all">{detail?.catalogName || "—"}</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
              <p className="text-xs text-gray-500 dark:text-gray-400">创建时间</p>
              <p className="mt-1 break-all">{formatTime(detail?.createdAt)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
              <p className="text-xs text-gray-500 dark:text-gray-400">最近同步</p>
              <p className="mt-1 break-all">{formatTime(detail?.lastSyncTime)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950/30">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">连接配置</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {loading ? "加载中…" : "若启用 hideSensitive，将自动隐藏密码等敏感字段。"}
          </p>
          <pre className="mt-3 overflow-auto rounded-lg bg-gray-950 px-3 py-2 text-xs text-gray-100">
            {prettyJson(detail?.connectionConfig)}
          </pre>
        </div>
      </div>
    </div>
  );
}

