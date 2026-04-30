import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import intl from "react-intl-universal";
import Icon from "../../components/Icon.jsx";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../../components/TablePagination.jsx";
import {
  createDatabase,
  deleteDatabase,
  fetchDatabaseDetail,
  fetchDatabases,
  syncCatalogMetadata,
  syncDatabaseMetadata,
  updateDatabase,
} from "../../lib/catalogApi.js";

function formatSyncTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function DatabaseListView({ catalog, onBack, onSelectDatabase, onTreeRefresh, showToast }) {
  const [dbList, setDbList] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [syncingDb, setSyncingDb] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [formName, setFormName] = useState("");
  const [formRemark, setFormRemark] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const emptyMysqlAutoSyncRef = useRef(false);

  const isInternal = catalog?.catalogOrigin === "internal";
  const isMysqlLikeCatalog =
    catalog?.catalogOrigin === "internal" || ["doris", "mysql", "tidb"].includes(String(catalog?.catalogType || "").toLowerCase());

  const loadList = useCallback(async () => {
    if (!catalog?.catalogId) return;
    setLoading(true);
    setErr("");
    try {
      const d = await fetchDatabases(catalog.catalogId, {
        databaseName: search.trim() || undefined,
      });
      setDbList(d.list || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [catalog?.catalogId, search]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    emptyMysqlAutoSyncRef.current = false;
  }, [catalog?.catalogId]);

  /** Doris/MySQL/TiDB 首次进入且库列表为空时自动拉取远端元数据，避免仅显示占位库 */
  useEffect(() => {
    if (loading || err || !catalog?.catalogId || !isMysqlLikeCatalog) return;
    if (dbList.length > 0) return;
    if (emptyMysqlAutoSyncRef.current) return;
    emptyMysqlAutoSyncRef.current = true;
    void (async () => {
      setSyncingCatalog(true);
      try {
        await syncCatalogMetadata(catalog.catalogId);
        showToast?.(intl.get("dataCatalog.toast.syncOk"));
        await onTreeRefresh?.();
        await loadList();
      } catch (e) {
        showToast?.(intl.get("dataCatalog.toast.syncFail", { msg: e instanceof Error ? e.message : String(e) }));
      } finally {
        setSyncingCatalog(false);
      }
    })();
  }, [catalog?.catalogId, dbList.length, err, isMysqlLikeCatalog, loadList, loading, onTreeRefresh, showToast]);

  const handleSyncCatalog = useCallback(async () => {
    if (!catalog?.catalogId) return;
    setSyncingCatalog(true);
    try {
      await syncCatalogMetadata(catalog.catalogId);
      showToast?.(intl.get("dataCatalog.toast.syncOk"));
      await onTreeRefresh?.();
      await loadList();
    } catch (e) {
      showToast?.(intl.get("dataCatalog.toast.syncFail", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSyncingCatalog(false);
    }
  }, [catalog?.catalogId, loadList, onTreeRefresh, showToast]);

  const handleSyncDb = useCallback(
    async (databaseName) => {
      if (!catalog?.catalogId) return;
      setSyncingDb(databaseName);
      try {
        await syncDatabaseMetadata(catalog.catalogId, databaseName);
        showToast?.(intl.get("dataCatalog.toast.dbSyncOk"));
        await loadList();
        await onTreeRefresh?.();
      } catch (e) {
        showToast?.(intl.get("dataCatalog.toast.syncFail", { msg: e instanceof Error ? e.message : String(e) }));
      } finally {
        setSyncingDb(null);
      }
    },
    [catalog?.catalogId, loadList, onTreeRefresh, showToast]
  );

  const openDetail = useCallback(
    async (databaseName) => {
      if (!catalog?.catalogId) return;
      setDetail(null);
      setDetailLoading(true);
      try {
        const d = await fetchDatabaseDetail(catalog.catalogId, databaseName);
        setDetail(d);
      } catch (e) {
        showToast?.(intl.get("dataCatalog.toast.loadError", { msg: e instanceof Error ? e.message : String(e) }));
      } finally {
        setDetailLoading(false);
      }
    },
    [catalog?.catalogId, showToast]
  );

  const openCreate = useCallback(() => {
    setFormName("");
    setFormRemark("");
    setCreateOpen(true);
  }, []);

  const openEdit = useCallback((row) => {
    setFormName(row.databaseName);
    setFormRemark(row.remark || "");
    setEditRow(row);
  }, []);

  const closeModals = useCallback(() => {
    setCreateOpen(false);
    setEditRow(null);
  }, []);

  const submitCreate = useCallback(async () => {
    if (!catalog?.catalogId) return;
    const name = formName.trim();
    if (!name) return;
    setFormSubmitting(true);
    try {
      await createDatabase(catalog.catalogId, { databaseName: name, remark: formRemark });
      showToast?.(intl.get("dataCatalog.toast.saved"));
      closeModals();
      await loadList();
      await onTreeRefresh?.();
    } catch (e) {
      showToast?.(intl.get("dataCatalog.toast.loadError", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setFormSubmitting(false);
    }
  }, [catalog?.catalogId, formName, formRemark, closeModals, loadList, onTreeRefresh, showToast]);

  const submitEdit = useCallback(async () => {
    if (!catalog?.catalogId || !editRow) return;
    const nextName = formName.trim();
    if (!nextName) return;
    setFormSubmitting(true);
    try {
      await updateDatabase(catalog.catalogId, editRow.databaseName, {
        remark: formRemark,
        ...(nextName !== editRow.databaseName ? { databaseName: nextName } : {}),
      });
      showToast?.(intl.get("dataCatalog.toast.saved"));
      closeModals();
      await loadList();
      await onTreeRefresh?.();
    } catch (e) {
      showToast?.(intl.get("dataCatalog.toast.loadError", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setFormSubmitting(false);
    }
  }, [catalog?.catalogId, editRow, formName, formRemark, closeModals, loadList, onTreeRefresh, showToast]);

  const handleDelete = useCallback(
    async (row) => {
      if (!catalog?.catalogId) return;
      const ok = window.confirm(intl.get("dataCatalog.confirm.deleteDbBody", { name: row.databaseName }));
      if (!ok) return;
      try {
        await deleteDatabase(catalog.catalogId, row.databaseName);
        showToast?.(intl.get("dataCatalog.toast.deleted"));
        await loadList();
        await onTreeRefresh?.();
      } catch (e) {
        showToast?.(intl.get("dataCatalog.toast.loadError", { msg: e instanceof Error ? e.message : String(e) }));
      }
    },
    [catalog?.catalogId, loadList, onTreeRefresh, showToast]
  );

  const toggleSelect = useCallback((databaseName, row) => {
    if (!isInternal || !row) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(databaseName)) next.delete(databaseName);
      else next.add(databaseName);
      return next;
    });
  }, [isInternal]);

  const toggleAllPage = useCallback(() => {
    if (!isInternal) return;
    const start = (page - 1) * pageSize;
    const names = dbList.slice(start, start + pageSize).map((r) => r.databaseName);
    const allOn = names.length > 0 && names.every((n) => selected.has(n));
    setSelected(allOn ? new Set() : new Set(names));
  }, [dbList, isInternal, page, pageSize, selected]);

  const batchDelete = useCallback(async () => {
    if (!isInternal) return;
    const names = [...selected];
    if (!names.length) {
      showToast?.(intl.get("dataCatalog.hint.selectRows"));
      return;
    }
    const ok = window.confirm(intl.get("dataCatalog.confirm.batchDeleteBody"));
    if (!ok) return;
    try {
      for (const name of names) {
        await deleteDatabase(catalog.catalogId, name);
      }
      setSelected(new Set());
      showToast?.(intl.get("dataCatalog.toast.batchDeleted", { n: names.length }));
      await loadList();
      await onTreeRefresh?.();
    } catch (e) {
      showToast?.(intl.get("dataCatalog.toast.loadError", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }, [catalog?.catalogId, isInternal, loadList, onTreeRefresh, selected, showToast]);

  const originLabel = useMemo(
    () => ({
      internal: intl.get("dataCatalog.db.originInternal"),
      external: intl.get("dataCatalog.db.originExternal"),
    }),
    []
  );

  const pagedDbList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return dbList.slice(start, start + pageSize);
  }, [dbList, page, pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((dbList.length || 0) / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [dbList.length, page, pageSize]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700"
        >
          {intl.get("dataCatalog.actions.back")}
        </button>
        <nav>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{intl.get("dataCatalog.tree.root")}</span>
          <span className="mx-1.5 text-gray-400">/</span>
          <span>{catalog?.catalogName || "—"}</span>
        </nav>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {isInternal ? (
            <>
              <button
                type="button"
                className="rounded-lg bg-primary/90 px-3 py-2 text-sm font-medium text-white hover:opacity-95"
                onClick={openCreate}
              >
                {intl.get("dataCatalog.actions.add")}
              </button>
              <button
                type="button"
                onClick={batchDelete}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300"
              >
                {intl.get("dataCatalog.actions.batchDelete")}
              </button>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={intl.get("dataCatalog.db.searchPlaceholder")}
            className="h-9 min-w-[12rem] rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 sm:w-[18rem]"
          />
          <button
            type="button"
            disabled={syncingCatalog}
            className="rounded-lg border border-primary/40 px-3 py-2 text-sm font-medium text-primary hover:bg-primary-soft disabled:opacity-50 dark:hover:bg-primary/15"
            onClick={handleSyncCatalog}
          >
            {syncingCatalog ? intl.get("common.loadingList") : intl.get("dataCatalog.actions.refresh")}
          </button>
        </div>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900/50">
        <table className="min-w-full table-fixed divide-y divide-gray-100 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50/80 dark:bg-gray-950/80">
            <tr>
              <th className="w-10 px-3 py-3 text-left">
                <input
                  type="checkbox"
                  checked={isInternal && pagedDbList.length > 0 && pagedDbList.every((r) => selected.has(r.databaseName))}
                  onChange={toggleAllPage}
                  aria-label="select all"
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
                {intl.get("dataCatalog.table.databaseName")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
                {intl.get("dataCatalog.db.colCatalog")}
              </th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">
                {intl.get("dataCatalog.table.tableCount")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
                {intl.get("dataCatalog.db.colDbOrigin")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
                {intl.get("dataCatalog.table.lastSyncTime")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
                {intl.get("dataCatalog.table.operations")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  {intl.get("common.loadingList")}
                </td>
              </tr>
            ) : (
              pagedDbList.map((r) => (
                <tr key={r.databaseName} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      disabled={!isInternal}
                      checked={selected.has(r.databaseName)}
                      onChange={() => toggleSelect(r.databaseName, r)}
                    />
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">{r.databaseName}</td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{r.catalogName}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.tableCount}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        r.databaseOrigin === "internal"
                          ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-800 dark:text-emerald-200"
                          : "rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-900 dark:text-amber-100"
                      }
                    >
                      {originLabel[r.databaseOrigin] || r.databaseOrigin}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{formatSyncTime(r.lastSyncTime)}</td>
                  <td className="px-4 py-2">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        title={intl.get("dataCatalog.actions.viewTables")}
                        aria-label={intl.get("dataCatalog.actions.viewTables")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-200"
                        onClick={() => onSelectDatabase(r.databaseName)}
                      >
                        <Icon name="table" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={syncingDb === r.databaseName}
                        title={intl.get("dataCatalog.db.syncDbMetadata")}
                        aria-label={intl.get("dataCatalog.db.syncDbMetadata")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-200"
                        onClick={() => void handleSyncDb(r.databaseName)}
                      >
                        <Icon name="refresh" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title={intl.get("dataCatalog.db.viewDetail")}
                        aria-label={intl.get("dataCatalog.db.viewDetail")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-200"
                        onClick={() => void openDetail(r.databaseName)}
                      >
                        <Icon name="info" className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(detail != null || detailLoading) && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/30 p-4" role="presentation" onClick={() => !detailLoading && setDetail(null)}>
          <div
            className="flex h-full max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h2 className="text-sm font-semibold">{intl.get("dataCatalog.db.detailTitle")}</h2>
              <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => setDetail(null)}>
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
              {detailLoading ? (
                <p className="text-gray-500">{intl.get("common.loadingList")}</p>
              ) : detail ? (
                <dl className="space-y-2">
                  <div>
                    <dt className="text-xs text-gray-500">{intl.get("dataCatalog.table.databaseName")}</dt>
                    <dd className="font-mono font-medium">{detail.databaseName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">{intl.get("dataCatalog.db.colCatalog")}</dt>
                    <dd>{detail.catalogName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">{intl.get("dataCatalog.db.colDbOrigin")}</dt>
                    <dd>{originLabel[detail.databaseOrigin] || detail.databaseOrigin}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">{intl.get("dataCatalog.table.tableCount")}</dt>
                    <dd>{detail.tableCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">{intl.get("dataCatalog.table.lastSyncTime")}</dt>
                    <dd>{formatSyncTime(detail.lastSyncTime)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">{intl.get("dataCatalog.table.remark")}</dt>
                    <dd className="whitespace-pre-wrap">{detail.remark || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">{intl.get("dataCatalog.right.title.tables")}</dt>
                    <dd className="mt-1 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {(detail.tables || []).map((t) => t.tableName).join(", ") || "—"}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>

      <TablePagination page={page} pageSize={pageSize} total={dbList.length} onPageChange={setPage} loading={loading} />
          </div>
        </div>
      )}

      {(createOpen || editRow) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4" onClick={closeModals} role="presentation">
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h2 className="text-sm font-semibold">{createOpen ? intl.get("dataCatalog.db.addDb") : intl.get("dataCatalog.db.editDb")}</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                {intl.get("dataCatalog.table.databaseName")}
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                />
              </label>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                {intl.get("dataCatalog.table.remark")}
                <textarea
                  value={formRemark}
                  onChange={(e) => setFormRemark(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700" onClick={closeModals}>
                {intl.get("dataCatalog.form.cancel")}
              </button>
              <button
                type="button"
                disabled={formSubmitting}
                className="rounded-lg bg-primary/90 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={createOpen ? submitCreate : submitEdit}
              >
                {intl.get("dataCatalog.form.submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
