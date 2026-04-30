import { useCallback, useEffect, useRef, useState } from "react";
import intl from "react-intl-universal";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../../components/TablePagination.jsx";
import Icon from "../../components/Icon.jsx";
import {
  batchDeleteCatalogs,
  createCatalog,
  deleteCatalog,
  fetchCatalogList,
  setCatalogEnabled,
  syncCatalogMetadata,
  testCatalogConnection,
  updateCatalog,
} from "../../lib/catalogApi.js";
import { ALL_CATALOG_TYPES } from "./catalogConstants.js";
import CatalogFormModal from "./CatalogFormModal.jsx";
import PathHeader from "../../components/PathHeader.jsx";

function cx(...p) {
  return p.filter(Boolean).join(" ");
}

function typeLabel(t) {
  try {
    return intl.get(`dataCatalog.type.${t}`);
  } catch {
    return t;
  }
}

function statusLabel(s) {
  return intl.get(`dataCatalog.conn.${s === "normal" ? "normal" : s === "error" ? "error" : "disabled"}`);
}

function formatTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function ConfirmDialog({ open, title, body, onOk, onCancel, danger }) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-gray-900/50 p-4 dark:bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300"
          >
            {intl.get("dataCatalog.confirm.cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onOk?.();
              } finally {
                setBusy(false);
              }
            }}
            className={cx(
              "rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm",
              danger ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:opacity-95",
              busy && "pointer-events-none opacity-70"
            )}
          >
            {intl.get("dataCatalog.confirm.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CatalogListHome({ onViewDatabases, onViewDetail, onTreeRefresh, toast, catalogGroupKey }) {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [nameQ, setNameQ] = useState("");
  const [typeQ, setTypeQ] = useState("");
  const [statusQ, setStatusQ] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editRow, setEditRow] = useState(null);

  const [confirm, setConfirm] = useState(null);
  const [openOpMenuFor, setOpenOpMenuFor] = useState(null);
  const opMenuWrapRef = useRef(null);
  const opMenuRef = useRef(null);
  const [opMenuPos, setOpMenuPos] = useState(null); // { top, right } (viewport-fixed)

  // 表头过滤（目录类型 / 连接状态）
  const [openHeaderFilter, setOpenHeaderFilter] = useState(null); // 'type' | 'status'
  const headerFilterBtnRef = useRef(null);
  const headerFilterMenuRef = useRef(null);
  const [headerFilterPos, setHeaderFilterPos] = useState(null); // { top, right }
  const [headerFilterQ, setHeaderFilterQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCatalogList({
        catalogName: nameQ.trim() || undefined,
        catalogType: typeQ || undefined,
        connectionStatus: statusQ || undefined,
        page,
        pageSize,
        groupKey: catalogGroupKey || undefined,
      });
      setList(data.list || []);
      setTotal(data.total ?? 0);
    } catch (e) {
      toast(intl.get("dataCatalog.toast.loadError", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setLoading(false);
    }
  }, [nameQ, typeQ, statusQ, page, pageSize, toast, catalogGroupKey]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // 切换分组后，分页重置避免出现“当前页无数据”的空白
    setPage(1);
  }, [catalogGroupKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = () => openCreate();
    window.addEventListener("dataCatalog:openCreateSource", onOpen);
    return () => window.removeEventListener("dataCatalog:openCreateSource", onOpen);
  }, []);

  useEffect(() => {
    if (!openOpMenuFor) return;
    // 菜单打开后测量：如果超出视口底部，则自动上移
    const raf = window.requestAnimationFrame(() => {
      const menuEl = opMenuRef.current;
      if (!menuEl) return;
      const menuRect = menuEl.getBoundingClientRect();
      const margin = 8;
      if (menuRect.bottom > window.innerHeight - margin) {
        const nextTop = Math.max(margin, window.innerHeight - menuRect.height - margin);
        setOpMenuPos((prev) => (prev ? { ...prev, top: nextTop } : prev));
      }
      if (menuRect.top < margin) {
        setOpMenuPos((prev) => (prev ? { ...prev, top: margin } : prev));
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [openOpMenuFor]);

  useEffect(() => {
    if (!openOpMenuFor) return;
    const onDocDown = (e) => {
      const el = opMenuWrapRef.current;
      const menuEl = opMenuRef.current;
      if (el?.contains?.(e.target)) return;
      if (menuEl?.contains?.(e.target)) return;
      setOpenOpMenuFor(null);
      setOpMenuPos(null);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [openOpMenuFor]);

  useEffect(() => {
    if (!openHeaderFilter) return;
    setHeaderFilterQ("");
    const onDocDown = (e) => {
      const btnEl = headerFilterBtnRef.current;
      const menuEl = headerFilterMenuRef.current;
      if (btnEl?.contains?.(e.target)) return;
      if (menuEl?.contains?.(e.target)) return;
      setOpenHeaderFilter(null);
      setHeaderFilterPos(null);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [openHeaderFilter]);

  const isInternal = (row) => row.catalogOrigin === "internal";

  const toggleSelect = (id, row) => {
    if (isInternal(row)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllPage = () => {
    const externalRows = list.filter((r) => !isInternal(r));
    const allOn = externalRows.length > 0 && externalRows.every((r) => selected.has(r.catalogId));
    setSelected(() => {
      if (allOn) return new Set();
      return new Set(externalRows.map((r) => r.catalogId));
    });
  };

  const runTest = async (row) => {
    try {
      const r = await testCatalogConnection(row.catalogId);
      if (r.ok) toast(intl.get("dataCatalog.toast.testOk", { ms: r.latencyMs ?? 0 }));
      else toast(intl.get("dataCatalog.toast.testFail", { msg: r.message || "" }));
      load();
      onTreeRefresh();
    } catch (e) {
      toast(intl.get("dataCatalog.toast.testFail", { msg: e instanceof Error ? e.message : String(e) }));
    }
  };

  const runSync = async (row) => {
    if (isInternal(row)) return;
    try {
      await syncCatalogMetadata(row.catalogId);
      toast(intl.get("dataCatalog.toast.syncOk"));
      load();
      onTreeRefresh();
    } catch (e) {
      toast(intl.get("dataCatalog.toast.syncFail", { msg: e instanceof Error ? e.message : String(e) }));
    }
  };

  const openEdit = (row) => {
    if (isInternal(row)) return;
    setFormMode("edit");
    setEditRow(row);
    setFormOpen(true);
  };

  const openCreate = () => {
    setFormMode("create");
    setEditRow(null);
    setFormOpen(true);
  };

  const handleFormSubmit = async (payload) => {
    if (formMode === "create") {
      await createCatalog(payload);
    } else if (editRow) {
      await updateCatalog(editRow.catalogId, payload);
    }
    toast(intl.get("dataCatalog.toast.saved"));
    await load();
    onTreeRefresh();
  };

  const requestDelete = (row) => {
    if (isInternal(row)) return;
    setConfirm({
      key: "delete",
      title: intl.get("dataCatalog.confirm.deleteTitle"),
      body: intl.get("dataCatalog.confirm.deleteBody", { name: row.catalogName }),
      danger: true,
      onOk: async () => {
        setConfirm(null);
        await deleteCatalog(row.catalogId);
        toast(intl.get("dataCatalog.toast.deleted"));
        await load();
        onTreeRefresh();
      },
    });
  };

  const requestToggle = (row, enabled) => {
    if (isInternal(row)) return;
    setConfirm({
      key: "toggle",
      title: intl.get("dataCatalog.confirm.toggleTitle"),
      body: enabled
        ? intl.get("dataCatalog.confirm.toggleEnableBody", { name: row.catalogName })
        : intl.get("dataCatalog.confirm.toggleDisableBody", { name: row.catalogName }),
      danger: false,
      onOk: async () => {
        setConfirm(null);
        await setCatalogEnabled(row.catalogId, enabled);
        toast(intl.get("dataCatalog.toast.saved"));
        await load();
        onTreeRefresh();
      },
    });
  };

  const batchDelete = () => {
    const ids = [...selected];
    if (!ids.length) {
      toast(intl.get("dataCatalog.hint.selectRows"));
      return;
    }
    setConfirm({
      key: "batch",
      title: intl.get("dataCatalog.confirm.batchDeleteTitle"),
      body: intl.get("dataCatalog.confirm.batchDeleteBody"),
      danger: true,
      onOk: async () => {
        setConfirm(null);
        const r = await batchDeleteCatalogs(ids);
        setSelected(new Set());
        toast(intl.get("dataCatalog.toast.batchDeleted", { n: r.removedCount ?? 0 }));
        await load();
        onTreeRefresh();
      },
    });
  };

  const externalOnPage = list.filter((r) => !isInternal(r));
  const allSelected = externalOnPage.length > 0 && externalOnPage.every((r) => selected.has(r.catalogId));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
      <div>
        <PathHeader segments={[intl.get("dataCatalog.right.title.catalogs")]} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white shadow-sm hover:opacity-95"
          >
            {intl.get("dataCatalog.actions.add")}
          </button>
          <button
            type="button"
            onClick={batchDelete}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            {intl.get("dataCatalog.actions.batchDelete")}
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <div className="w-full sm:w-[18rem]">
            <label className="sr-only">{intl.get("dataCatalog.search.catalogName")}</label>
            <input
              type="search"
              value={nameQ}
              onChange={(e) => {
                setNameQ(e.target.value);
                setPage(1);
              }}
              placeholder={intl.get("dataCatalog.search.catalogNamePlaceholder")}
              className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-950"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              load();
              onTreeRefresh();
            }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 whitespace-nowrap"
          >
            {intl.get("dataCatalog.actions.refresh")}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900/50">
        <table className="min-w-full table-fixed divide-y divide-gray-100 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50/80 dark:bg-gray-950/80">
            <tr>
              <th className="w-10 px-3 py-3 text-left">
                <input type="checkbox" checked={allSelected} onChange={toggleAllPage} aria-label="select all" />
              </th>
              <th className="min-w-[210px] px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">{intl.get("dataCatalog.table.catalogName")}</th>
              <th className="min-w-[140px] px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
                <div className="flex items-center gap-2">
                  <span>{intl.get("dataCatalog.table.catalogType")}</span>
                  <button
                    type="button"
                    ref={headerFilterBtnRef}
                    aria-label="filter catalogType"
                    className={cx(
                      "inline-flex h-5 w-5 items-center justify-center rounded border border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40",
                      typeQ ? "text-primary" : "text-gray-400"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHeaderFilterPos({
                        top: rect.bottom + 6,
                        right: Math.max(0, window.innerWidth - rect.right),
                      });
                      setOpenHeaderFilter((p) => (p === "type" ? null : "type"));
                    }}
                  >
                    <Icon name="filterInclude" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </th>
              <th className="min-w-[150px] px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
                <div className="flex items-center gap-2">
                  <span>{intl.get("dataCatalog.table.connectionStatus")}</span>
                  <button
                    type="button"
                    ref={headerFilterBtnRef}
                    aria-label="filter connectionStatus"
                    className={cx(
                      "inline-flex h-5 w-5 items-center justify-center rounded border border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40",
                      statusQ ? "text-primary" : "text-gray-400"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHeaderFilterPos({
                        top: rect.bottom + 6,
                        right: Math.max(0, window.innerWidth - rect.right),
                      });
                      setOpenHeaderFilter((p) => (p === "status" ? null : "status"));
                    }}
                  >
                    <Icon name="filterInclude" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </th>
              <th className="w-[90px] px-3 py-3 text-right font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">{intl.get("dataCatalog.table.databaseCount")}</th>
              <th className="w-[90px] px-3 py-3 text-right font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">{intl.get("dataCatalog.table.tableCount")}</th>
              <th className="min-w-[140px] px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">{intl.get("dataCatalog.table.lastSyncTime")}</th>
              <th className="min-w-[140px] px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">{intl.get("dataCatalog.table.createdAt")}</th>
              <th className="sticky right-0 w-[120px] bg-gray-50/95 px-3 py-3 text-left font-semibold text-gray-600 shadow-sm dark:bg-gray-950/95 dark:text-gray-300">
                {intl.get("dataCatalog.table.operations")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                  {intl.get("common.loadingList")}
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                  {intl.get("common.noData")}
                </td>
              </tr>
            ) : (
              list.map((row) => (
                <tr key={row.catalogId} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      disabled={isInternal(row)}
                      checked={selected.has(row.catalogId)}
                      onChange={() => toggleSelect(row.catalogId, row)}
                    />
                  </td>
                  <td className="px-3 py-2" title={`${row.businessName || row.catalogName}\n${row.catalogName}`}>
                    <p className="truncate font-medium text-gray-900 dark:text-gray-100">{row.businessName || row.catalogName}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{row.catalogName}</p>
                  </td>
                  <td className="px-3 py-2 truncate text-gray-600 dark:text-gray-300" title={row.catalogType}>
                    {typeLabel(row.catalogType)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        row.connectionStatus === "normal" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
                        row.connectionStatus === "error" && "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
                        row.connectionStatus === "disabled" && "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      )}
                    >
                      {statusLabel(row.connectionStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">{row.databaseCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">{row.tableCount}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{formatTime(row.lastSyncTime)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{formatTime(row.createdAt)}</td>
                  <td className="sticky right-0 w-[120px] bg-white/95 px-2 py-2 shadow-sm dark:bg-gray-900/95">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        title={intl.get("dataCatalog.actions.viewDetail")}
                        aria-label={intl.get("dataCatalog.actions.viewDetail")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-200"
                        onClick={() => onViewDetail?.(row)}
                      >
                        <Icon name="info" className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        title={intl.get("dataCatalog.actions.viewDatabases")}
                        aria-label={intl.get("dataCatalog.actions.viewDatabases")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-200"
                        onClick={() => onViewDatabases(row)}
                      >
                        <Icon name="database" className="h-4 w-4" />
                      </button>

                      <div
                        className="relative inline-flex items-center"
                        ref={(el) => {
                          if (openOpMenuFor === row.catalogId) opMenuWrapRef.current = el;
                        }}
                      >
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={openOpMenuFor === row.catalogId}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-200"
                        title={intl.get("dataCatalog.actions.more")}
                        aria-label={intl.get("dataCatalog.actions.more")}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (openOpMenuFor === row.catalogId) {
                            setOpenOpMenuFor(null);
                            setOpMenuPos(null);
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setOpMenuPos({
                            top: rect.bottom + 6,
                            right: Math.max(0, window.innerWidth - rect.right),
                          });
                          setOpenOpMenuFor(row.catalogId);
                        }}
                      >
                        <Icon name="menu" className="h-4 w-4" />
                      </button>

                      {openOpMenuFor === row.catalogId ? (
                        <>
                          <div
                            className="fixed inset-0"
                            style={{ zIndex: 2147483646, pointerEvents: "auto" }}
                            onMouseDown={() => {
                              setOpenOpMenuFor(null);
                              setOpMenuPos(null);
                            }}
                          />
                          <div
                            role="menu"
                            ref={opMenuRef}
                            style={{
                              position: "fixed",
                              top: opMenuPos?.top ?? 0,
                              right: opMenuPos?.right ?? 0,
                              zIndex: 2147483647,
                              maxHeight: "calc(100vh - 16px)",
                              overflowY: "auto",
                              pointerEvents: "auto",
                            }}
                            className="w-[12rem] rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900"
                          >
                            <div className="py-1">
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm text-primary hover:bg-primary-soft dark:hover:bg-primary/15 whitespace-nowrap"
                              onClick={() => {
                                setOpenOpMenuFor(null);
                                setOpMenuPos(null);
                                void runTest(row);
                              }}
                            >
                              <Icon name="timer" className="h-4 w-4 text-primary" />
                              {intl.get("dataCatalog.actions.testConnection")}
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              disabled={isInternal(row)}
                              className={cx(
                                "flex w-full items-center gap-2 px-2 py-2 text-left text-sm whitespace-nowrap",
                                isInternal(row)
                                  ? "cursor-not-allowed text-gray-400 dark:text-gray-500"
                                  : "text-primary hover:bg-primary-soft dark:hover:bg-primary/15"
                              )}
                              onClick={() => {
                                if (isInternal(row)) return;
                                setOpenOpMenuFor(null);
                                setOpMenuPos(null);
                                void runSync(row);
                              }}
                            >
                              <Icon name="refresh" className={cx("h-4 w-4", isInternal(row) ? "text-gray-400 dark:text-gray-500" : "text-primary")} />
                              {intl.get("dataCatalog.actions.syncMetadata")}
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              disabled={isInternal(row)}
                              className={cx(
                                "flex w-full items-center gap-2 px-2 py-2 text-left text-sm whitespace-nowrap",
                                isInternal(row)
                                  ? "cursor-not-allowed text-gray-400 dark:text-gray-500"
                                  : "text-primary hover:bg-primary-soft dark:hover:bg-primary/15"
                              )}
                              onClick={() => {
                                if (isInternal(row)) return;
                                setOpenOpMenuFor(null);
                                setOpMenuPos(null);
                                openEdit(row);
                              }}
                            >
                              <Icon name="pencil" className={cx("h-4 w-4", isInternal(row) ? "text-gray-400 dark:text-gray-500" : "text-primary")} />
                              {intl.get("dataCatalog.actions.edit")}
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              disabled={isInternal(row)}
                              className={cx(
                                "flex w-full items-center gap-2 px-2 py-2 text-left text-sm whitespace-nowrap",
                                isInternal(row)
                                  ? "cursor-not-allowed text-gray-400 dark:text-gray-500"
                                  : "text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 dark:text-amber-300"
                              )}
                              onClick={() => {
                                if (isInternal(row)) return;
                                setOpenOpMenuFor(null);
                                setOpMenuPos(null);
                                requestToggle(row, !row.enabled);
                              }}
                            >
                              <Icon
                                name={row.enabled ? "close" : "check-circle"}
                                className={cx("h-4 w-4", isInternal(row) ? "text-gray-400 dark:text-gray-500" : "")}
                              />
                              {row.enabled ? intl.get("dataCatalog.actions.disable") : intl.get("dataCatalog.actions.enable")}
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              disabled={isInternal(row)}
                              className={cx(
                                "flex w-full items-center gap-2 px-2 py-2 text-left text-sm whitespace-nowrap",
                                isInternal(row)
                                  ? "cursor-not-allowed text-gray-400 dark:text-gray-500"
                                  : "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 dark:text-red-400"
                              )}
                              onClick={() => {
                                if (isInternal(row)) return;
                                setOpenOpMenuFor(null);
                                setOpMenuPos(null);
                                void requestDelete(row);
                              }}
                            >
                              <Icon name="trash" className={cx("h-4 w-4", isInternal(row) ? "text-gray-400 dark:text-gray-500" : "text-red-600 dark:text-red-400")} />
                              {intl.get("dataCatalog.actions.delete")}
                            </button>

                            </div>
                          </div>
                        </>
                      ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {openHeaderFilter && headerFilterPos ? (
          <div
            ref={headerFilterMenuRef}
            role="menu"
            style={{
              position: "fixed",
              top: headerFilterPos.top ?? 0,
              right: headerFilterPos.right ?? 0,
              zIndex: 185,
            }}
            className="w-[16rem] overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900"
          >
            {openHeaderFilter === "type" ? (
              <div className="py-1">
                <div className="px-3 py-2">
                  <input
                    type="search"
                    value={headerFilterQ}
                    onChange={(e) => setHeaderFilterQ(e.target.value)}
                    placeholder={intl.get("dataCatalog.search.filterSearchPlaceholder")}
                    className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-800 dark:bg-gray-950"
                  />
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className={cx(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800",
                    !typeQ ? "text-primary" : "text-gray-700 dark:text-gray-200"
                  )}
                  onClick={() => {
                    setTypeQ("");
                    setPage(1);
                    setOpenHeaderFilter(null);
                    setHeaderFilterPos(null);
                  }}
                >
                  {intl.get("dataCatalog.search.catalogTypeAll")}
                </button>
                {(() => {
                  const q = headerFilterQ.trim().toLowerCase();
                  const items = q
                    ? ALL_CATALOG_TYPES.filter((t) => {
                        const lbl = (() => {
                          try {
                            return intl.get(`dataCatalog.type.${t}`);
                          } catch {
                            return String(t);
                          }
                        })();
                        return String(lbl || "").toLowerCase().includes(q) || String(t).toLowerCase().includes(q);
                      })
                    : ALL_CATALOG_TYPES;
                  return items.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="menuitem"
                      className={cx(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800",
                        typeQ === t ? "text-primary" : "text-gray-700 dark:text-gray-200"
                      )}
                      onClick={() => {
                        setTypeQ(t);
                        setPage(1);
                        setOpenHeaderFilter(null);
                        setHeaderFilterPos(null);
                      }}
                    >
                      {typeLabel(t)}
                    </button>
                  ));
                })()}
              </div>
            ) : null}

            {openHeaderFilter === "status" ? (
              <div className="py-1">
                <div className="px-3 py-2">
                  <input
                    type="search"
                    value={headerFilterQ}
                    onChange={(e) => setHeaderFilterQ(e.target.value)}
                    placeholder={intl.get("dataCatalog.search.filterSearchPlaceholder")}
                    className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-800 dark:bg-gray-950"
                  />
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className={cx(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800",
                    !statusQ ? "text-primary" : "text-gray-700 dark:text-gray-200"
                  )}
                  onClick={() => {
                    setStatusQ("");
                    setPage(1);
                    setOpenHeaderFilter(null);
                    setHeaderFilterPos(null);
                  }}
                >
                  {intl.get("dataCatalog.search.statusAll")}
                </button>
                {(() => {
                  const q = headerFilterQ.trim().toLowerCase();
                  const statuses = ["normal", "error", "disabled"];
                  const items = q
                    ? statuses.filter((s) => {
                        const txt = String(statusLabel(s) || "").toLowerCase();
                        return txt.includes(q) || String(s).toLowerCase().includes(q);
                      })
                    : statuses;
                  return items.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="menuitem"
                      className={cx(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800",
                        statusQ === s ? "text-primary" : "text-gray-700 dark:text-gray-200"
                      )}
                      onClick={() => {
                        setStatusQ(s);
                        setPage(1);
                        setOpenHeaderFilter(null);
                        setHeaderFilterPos(null);
                      }}
                    >
                      {statusLabel(s)}
                    </button>
                  ));
                })()}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} loading={loading} />

      <CatalogFormModal
        open={formOpen}
        mode={formMode}
        initial={editRow}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title || ""}
        body={confirm?.body || ""}
        danger={confirm?.danger}
        onCancel={() => setConfirm(null)}
        onOk={() => confirm?.onOk?.()}
      />
    </div>
  );
}
