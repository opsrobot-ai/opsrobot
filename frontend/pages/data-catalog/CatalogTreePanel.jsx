import { useEffect, useMemo, useState } from "react";
import intl from "react-intl-universal";
import Icon from "../../components/Icon.jsx";
import {
  createCatalogGroup,
  deleteCatalogGroup,
  fetchCatalogGroups,
  setCatalogGroupAssignment,
  updateCatalogGroup,
} from "../../lib/catalogApi.js";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function typeLabel(t) {
  try {
    return intl.get(`dataCatalog.type.${t}`);
  } catch {
    return t || "—";
  }
}

function dbTablesKey(catalogId, databaseName) {
  return `${String(catalogId)}::${String(databaseName)}`;
}

function catalogTypeIcon(t) {
  const key = String(t || "").toLowerCase();
  const map = {
    internal: "logoDoris",
    doris: "logoDoris",
    mysql: "logoMysql",
    postgresql: "logoPostgresql",
    oracle: "logoOracle",
    sqlserver: "logoSqlserver",
    tidb: "logoTidb",
    mongodbbi: "logoMongodbbi",
    hive: "logoHive",
    iceberg: "logoIceberg",
    hudi: "logoHudi",
    impala: "logoImpala",
    clickhouse: "logoClickhouse",
    elasticsearch: "logoElasticsearch",
    starrocks: "logoStarrocks",
    redshift: "logoRedshift",
    jdbc: "logoJdbc",
    paimon: "logoPaimon",
    filelocalexcelcsv: "logoFileLocalExcelCsv",
    fileremoteexcelcsv: "logoFileRemoteExcelCsv",
  };
  return map[key] || "database";
}

/** 视口居中删除确认（替代 window.confirm） */
function DeleteGroupConfirmDialog({ open, groupName, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-group-dialog-title"
      className="fixed inset-0 z-[150] flex items-center justify-center bg-gray-900/50 p-4 dark:bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="delete-group-dialog-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {intl.get("dataCatalog.tree.group.deleteDialogTitle")}
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {intl.get("dataCatalog.tree.group.deleteConfirm", { name: groupName || "" })}
        </p>
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
                await onConfirm?.();
              } finally {
                setBusy(false);
              }
            }}
            className={cx(
              "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700",
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

export default function CatalogTreePanel({
  tree,
  selection,
  onSelectRoot,
  onSelectCatalog,
  onSelectDatabase,
  onSelectTable,
  onSelectGroupCatalogs,
}) {
  const [openRoot, setOpenRoot] = useState(false);
  const [openCatalogs, setOpenCatalogs] = useState(() => ({}));
  /** 默认 custom：与 Doris 返回的分组一致展示；若为 none 则刷新后只显示「所有/未分组」、自定义分组被隐藏 */
  const [groupMode, setGroupMode] = useState("custom"); // 'none' | 'type' | 'custom'
  const [openGroups, setOpenGroups] = useState(() => ({}));
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [sourcePulse, setSourcePulse] = useState(false);
  const [customGroups, setCustomGroups] = useState([]);
  const [catalogGroupMap, setCatalogGroupMap] = useState({});
  const [newGroupName, setNewGroupName] = useState("");
  const [renameDraft, setRenameDraft] = useState(() => ({}));
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [draggingCatalogId, setDraggingCatalogId] = useState("");
  const [dragOverGroupKey, setDragOverGroupKey] = useState("");
  /** 数据库下数据表是否展开；默认 false（收起） */
  const [openDbTables, setOpenDbTables] = useState(() => ({}));
  /** 删除分组确认弹层：{ groupId, groupName } */
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(null);

  const nodes = tree?.nodes ?? [];

  const toggleCatalog = (id) => {
    setOpenCatalogs((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }));
  };

  const toggleGroup = (key) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }));
  };

  const toggleDbTables = (catalogId, databaseName) => {
    const k = dbTablesKey(catalogId, databaseName);
    setOpenDbTables((prev) => ({ ...prev, [k]: !(prev[k] ?? false) }));
  };

  const highlightCatalog = selection.catalogId;
  const highlightDb = selection.databaseName;
  const highlightTable = selection.tableName;

  const rootActive = selection.level === "catalogs";

  const unnamedGroupName = useMemo(() => intl.get("dataCatalog.tree.group.unnamed"), []);

  const reloadGroups = async () => {
    try {
      const data = await fetchCatalogGroups();
      const groups = Array.isArray(data?.groups)
        ? data.groups.map((g) => ({ id: String(g.groupId), name: String(g.groupName), displayOrder: Number(g.displayOrder || 0) }))
        : [];
      const assignments = data?.assignments && typeof data.assignments === "object" ? data.assignments : {};
      setCustomGroups(groups);
      setCatalogGroupMap(assignments);
      if (groups.length > 0) setGroupMode("custom");
    } catch (e) {
      console.error("[catalog-groups] load failed:", e);
    }
  };

  useEffect(() => {
    reloadGroups();
  }, []);

  /** 查看表详情时展开对应库下的数据表，便于在树中高亮当前表 */
  useEffect(() => {
    const cid = selection.catalogId;
    const dbn = selection.databaseName;
    const tbl = selection.tableName;
    if (selection.level === "preview" && cid && dbn && tbl) {
      const k = dbTablesKey(cid, dbn);
      setOpenDbTables((prev) => (prev[k] ? prev : { ...prev, [k]: true }));
    }
  }, [selection.level, selection.catalogId, selection.databaseName, selection.tableName]);

  const groups = useMemo(() => {
    if (groupMode === "none") {
      return [
        { key: "__all__", label: intl.get("dataCatalog.tree.all"), catalogs: nodes },
        { key: "__ungrouped__", label: intl.get("dataCatalog.tree.group.ungrouped"), catalogs: nodes },
      ];
    }
    if (groupMode === "type") {
      const map = new Map();
      for (const cat of nodes) {
        const key = String(cat.catalogType || "unknown");
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(cat);
      }
      const keys = [...map.keys()];
      keys.sort((a, b) => {
        if (a === "internal") return -1;
        if (b === "internal") return 1;
        return a.localeCompare(b);
      });
      return keys.map((k) => ({ key: k, label: typeLabel(k), catalogs: map.get(k) }));
    }

    // custom
    const groupsById = new Map(customGroups.map((g) => [g.id, g]));
    const bucket = new Map();
    bucket.set("__ungrouped__", []);
    for (const g of customGroups) bucket.set(g.id, []);
    for (const cat of nodes) {
      const gid = catalogGroupMap[cat.catalogId];
      if (gid && bucket.has(gid)) bucket.get(gid).push(cat);
      else bucket.get("__ungrouped__").push(cat);
    }
    const rows = [
      { key: "__all__", label: intl.get("dataCatalog.tree.all"), catalogs: nodes },
      { key: "__ungrouped__", label: intl.get("dataCatalog.tree.group.ungrouped"), catalogs: bucket.get("__ungrouped__") },
      ...customGroups.map((g) => ({ key: g.id, label: g.name, catalogs: bucket.get(g.id) || [] })),
    ];
    // empty groups still shown for management
    return rows;
  }, [groupMode, nodes, customGroups, catalogGroupMap]);

  /** 选中某数据源或更深层级时展开其所在分组与数据源节点，避免默认全收起时看不到当前选中项 */
  useEffect(() => {
    if (selection.level === "catalogs" || !selection.catalogId) return;
    const cid = selection.catalogId;
    setOpenCatalogs((prev) => (prev[cid] ? prev : { ...prev, [cid]: true }));
    const keysToOpen = groups.filter((g) => (g.catalogs || []).some((c) => c.catalogId === cid)).map((g) => g.key);
    if (!keysToOpen.length) return;
    setOpenGroups((prev) => {
      let next = prev;
      let changed = false;
      for (const k of keysToOpen) {
        if (!(prev[k] ?? false)) {
          if (!changed) next = { ...prev };
          changed = true;
          next[k] = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selection.level, selection.catalogId, groups]);

  const effectiveGroupOptions = useMemo(() => {
    return [
      { id: "", name: intl.get("dataCatalog.tree.group.ungrouped") },
      ...customGroups.map((g) => ({ id: g.id, name: g.name })),
    ];
  }, [customGroups]);

  const commitGroupRename = async (groupId, value) => {
    const raw = String(value ?? renameDraft[groupId] ?? "").trim();
    const nextName = raw || unnamedGroupName;
    try {
      await updateCatalogGroup(groupId, { groupName: nextName });
      setCustomGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name: nextName } : g)));
    } catch (e) {
      console.error("[catalog-groups] rename failed:", e);
    }
    setRenameDraft((prev) => {
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
    setEditingGroupId(null);
  };

  const openDeleteGroupDialog = (groupId, groupName) => {
    setDeleteGroupTarget({ groupId, groupName: String(groupName || "") });
  };

  const closeDeleteGroupDialog = () => setDeleteGroupTarget(null);

  const confirmDeleteGroup = async () => {
    if (!deleteGroupTarget) return;
    const { groupId } = deleteGroupTarget;
    try {
      await deleteCatalogGroup(groupId);
      setCustomGroups((prev) => prev.filter((x) => x.id !== groupId));
      setCatalogGroupMap((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (next[k] === groupId) delete next[k];
        }
        return next;
      });
      setDeleteGroupTarget(null);
    } catch (e) {
      console.error("[catalog-groups] delete failed:", e);
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(intl.get("dataCatalog.toast.groupDeleteFail", { msg }));
    }
  };

  const assignCatalogToGroup = async (catalogId, groupKey) => {
    if (!catalogId) return;
    if (groupMode !== "custom") return;
    if (groupKey === "__all__") return;
    const nextGroupId = groupKey === "__ungrouped__" ? null : groupKey;
    await setCatalogGroupAssignment(catalogId, nextGroupId);
    setCatalogGroupMap((prev) => {
      const next = { ...prev };
      if (!nextGroupId) delete next[catalogId];
      else next[catalogId] = nextGroupId;
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-gray-200/80 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-950/50">
      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
        <div className="mb-2 flex items-center justify-end gap-1.5">
          {(() => {
            const baseBtn =
              "inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white shadow-sm transition-colors dark:bg-gray-950";
            const idleBtn =
              "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-800 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-gray-100";
            const activeBtn = "border-primary/30 bg-primary-soft text-primary dark:bg-primary/15";
            const groupActive = groupManageOpen;
            const sourceActive = sourcePulse;

            return (
              <>
          <button
            type="button"
            className={cx(baseBtn, groupActive ? activeBtn : idleBtn)}
            onClick={async () => {
              try {
                setOpenRoot(true);
                setGroupMode("custom");
                const created = await createCatalogGroup({ groupName: unnamedGroupName, displayOrder: Date.now() });
                const id = String(created.groupId);
                setCustomGroups((prev) => [
                  ...prev,
                  { id, name: String(created.groupName || unnamedGroupName), displayOrder: Number(created.displayOrder || 0) },
                ]);
                setOpenGroups((prev) => ({ ...prev, [id]: true }));
                setRenameDraft((prev) => ({ ...prev, [id]: unnamedGroupName }));
                setEditingGroupId(id);
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                window.alert(`新增分组失败：${msg}`);
              }
            }}
            title={intl.get("dataCatalog.tree.actions.addGroup")}
            aria-label={intl.get("dataCatalog.tree.actions.addGroup")}
          >
            <Icon name="folder" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cx(baseBtn, sourceActive ? activeBtn : idleBtn)}
            onClick={() => {
              onSelectRoot?.();
              window.dispatchEvent(new CustomEvent("dataCatalog:openCreateSource"));
              setSourcePulse(true);
              window.setTimeout(() => setSourcePulse(false), 700);
            }}
            title={intl.get("dataCatalog.tree.actions.addSource")}
            aria-label={intl.get("dataCatalog.tree.actions.addSource")}
          >
            <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
              <Icon name="database" className="h-3.5 w-3.5" />
              <span
                className={cx(
                  "absolute -right-1 -top-1 rounded-full p-[1px] shadow-sm",
                  sourceActive ? "bg-primary/15 text-primary" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300"
                )}
              >
                <Icon name="plus" className="h-2 w-2" />
              </span>
            </span>
          </button>
              </>
            );
          })()}
        </div>

        <div className="mt-0.5 space-y-0.5 border-l border-gray-200 pl-2 dark:border-gray-700">
            {groups.map((g) => {
              const groupOpen = openGroups[g.key] ?? false;
              return (
                <div key={g.key} className="space-y-0.5">
                  <div
                    className={cx(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/80",
                      groupMode === "custom" && dragOverGroupKey === g.key && g.key !== "__all__" && "bg-primary-soft/70 ring-1 ring-primary/40 dark:bg-primary/15"
                    )}
                    onDragOver={(e) => {
                      if (groupMode !== "custom") return;
                      if (!draggingCatalogId) return;
                      if (g.key === "__all__") return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverGroupKey(g.key);
                    }}
                    onDragLeave={() => {
                      if (dragOverGroupKey === g.key) setDragOverGroupKey("");
                    }}
                    onDrop={async (e) => {
                      if (groupMode !== "custom") return;
                      e.preventDefault();
                      e.stopPropagation();
                      const catalogId = e.dataTransfer.getData("text/plain") || draggingCatalogId;
                      try {
                        await assignCatalogToGroup(catalogId, g.key);
                      } catch (err) {
                        console.error("[catalog-groups] drag assign failed:", err);
                      } finally {
                        setDragOverGroupKey("");
                        setDraggingCatalogId("");
                      }
                    }}
                  >
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.key)}
                        className="inline-flex items-center gap-2"
                        aria-label="toggle"
                      >
                        <Icon name="chevron" className={cx("h-3.5 w-3.5 transition-transform text-gray-400", groupOpen ? "rotate-180" : "")} />
                      </button>
                      <Icon name="folder" className="h-4 w-4 shrink-0 opacity-70" />

                      {groupMode === "custom" && g.key !== "__ungrouped__" && g.key !== "__all__" && editingGroupId === g.key ? (
                        <input
                          autoFocus
                          value={renameDraft[g.key] ?? ""}
                          onChange={(e) => setRenameDraft((p) => ({ ...p, [g.key]: e.target.value }))}
                          onBlur={(e) => void commitGroupRename(g.key, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.isComposing) {
                              e.preventDefault();
                              e.stopPropagation();
                              void commitGroupRename(g.key, e.currentTarget.value);
                            }
                            if (e.key === "Escape") setEditingGroupId(null);
                          }}
                          className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                        />
                      ) : (
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left"
                          onClick={() => {
                            if (groupMode === "custom") {
                              onSelectGroupCatalogs?.(g.key);
                            }
                            toggleGroup(g.key);
                          }}
                          title={g.label}
                        >
                          {g.label}
                        </button>
                      )}

                      <span className="ml-auto text-[11px] font-normal text-gray-400">{g.catalogs.length}</span>
                      {groupMode === "custom" && g.key !== "__ungrouped__" && g.key !== "__all__" ? (
                        <div className="group/menu relative">
                          <button
                            type="button"
                            className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-200/70 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/70 dark:hover:text-gray-200"
                            onClick={(e) => e.stopPropagation()}
                            title={intl.get("dataCatalog.tree.group.manageMenu")}
                            aria-label={intl.get("dataCatalog.tree.group.manageMenu")}
                          >
                            <Icon name="menu" className="h-3 w-3" />
                          </button>
                          <div className="invisible absolute right-0 top-6 z-20 min-w-[6rem] rounded-md border border-gray-200 bg-white p-1 opacity-0 shadow-lg transition-all group-hover/menu:visible group-hover/menu:opacity-100 group-focus-within/menu:visible group-focus-within/menu:opacity-100 dark:border-gray-700 dark:bg-gray-900">
                            <button
                              type="button"
                              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingGroupId(g.key);
                                setRenameDraft((p) => ({ ...p, [g.key]: String(g.label || "") }));
                              }}
                            >
                              <Icon name="pencil" className="h-3 w-3" />
                              {intl.get("dataCatalog.tree.group.rename")}
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteGroupDialog(g.key, g.label);
                              }}
                            >
                              <Icon name="trash" className="h-3 w-3" />
                              {intl.get("dataCatalog.tree.group.delete")}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>

                  {groupOpen &&
                    g.catalogs.map((cat) => {
                      const open = openCatalogs[cat.catalogId] ?? false;
                      const catActive = selection.level !== "catalogs" && highlightCatalog === cat.catalogId && !highlightDb;
                      return (
                        <div key={cat.catalogId} className={cx("space-y-0.5", g.key !== "all" && "ml-2")}>
                          <div className="flex items-stretch gap-0.5">
                            <button
                              type="button"
                              aria-label="toggle"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCatalog(cat.catalogId);
                              }}
                              className="flex w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200/80 dark:hover:bg-gray-800"
                            >
                              <Icon name="chevron" className={cx("h-3.5 w-3.5 transition-transform", open ? "rotate-180" : "")} />
                            </button>
                            <button
                              type="button"
                              draggable={groupMode === "custom"}
                              onDragStart={(e) => {
                                if (groupMode !== "custom") return;
                                e.dataTransfer.setData("text/plain", String(cat.catalogId));
                                e.dataTransfer.effectAllowed = "move";
                                setDraggingCatalogId(String(cat.catalogId));
                              }}
                              onDragEnd={() => {
                                setDraggingCatalogId("");
                                setDragOverGroupKey("");
                              }}
                              onClick={() => {
                                onSelectCatalog(cat);
                                toggleCatalog(cat.catalogId);
                              }}
                              className={cx(
                                "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                                catActive ? "bg-primary-soft/90 text-primary dark:bg-primary/15" : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/80"
                              )}
                            >
                              <Icon name={catalogTypeIcon(cat.catalogType)} className="h-4 w-4 shrink-0 opacity-90" />
                              <span className="truncate font-medium">{cat.catalogName}</span>
                            </button>
                          </div>
                          {open && (cat.children || []).map((db) => {
                            const dbActive =
                              highlightCatalog === cat.catalogId && highlightDb === db.databaseName && !highlightTable;
                            const dbKey = dbTablesKey(cat.catalogId, db.databaseName);
                            const tablesOpen = openDbTables[dbKey] ?? false;
                            return (
                              <div key={`${cat.catalogId}-${db.databaseName}`} className="ml-5 border-l border-gray-200 pl-2 dark:border-gray-700">
                                <div className="flex items-stretch gap-0.5">
                                  <button
                                    type="button"
                                    aria-label={intl.get("dataCatalog.tree.toggleTables")}
                                    title={intl.get("dataCatalog.tree.toggleTables")}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleDbTables(cat.catalogId, db.databaseName);
                                    }}
                                    className="flex w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200/80 dark:hover:bg-gray-800"
                                  >
                                    <Icon name="chevron" className={cx("h-3.5 w-3.5 transition-transform", tablesOpen ? "rotate-180" : "")} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onSelectDatabase(cat, db.databaseName);
                                      toggleDbTables(cat.catalogId, db.databaseName);
                                    }}
                                    className={cx(
                                      "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors",
                                      dbActive ? "bg-primary-soft/70 text-primary dark:bg-primary/15" : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/80"
                                    )}
                                  >
                                    <Icon name="database" className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                    <span className="truncate">{db.databaseName}</span>
                                  </button>
                                </div>
                                {tablesOpen ? (
                                  <div className="ml-3 border-l border-dashed border-gray-200 pl-2 dark:border-gray-700">
                                    {(db.children || []).map((tb) => {
                                      const tbActive =
                                        highlightCatalog === cat.catalogId &&
                                        highlightDb === db.databaseName &&
                                        highlightTable === tb.tableName;
                                      return (
                                        <button
                                          key={tb.tableName}
                                          type="button"
                                          onClick={() => onSelectTable(cat, db.databaseName, tb.tableName)}
                                          className={cx(
                                            "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] transition-colors",
                                            tbActive ? "bg-primary-soft font-medium text-primary dark:bg-primary/15" : "text-gray-500 hover:bg-gray-50 dark:text-gray-500 dark:hover:bg-gray-800/60"
                                          )}
                                        >
                                          <Icon name="viewColumns" className="h-3 w-3 shrink-0 opacity-60" />
                                          <span className="truncate">{tb.tableName}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                </div>
              );
            })}
        </div>

        {groupManageOpen ? (
          <div
            className="fixed inset-0 z-[140] flex items-center justify-center bg-gray-900/50 p-4 dark:bg-black/60"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setGroupManageOpen(false);
            }}
          >
            <div
              className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
              role="dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("dataCatalog.tree.group.manageTitle")}</h3>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  onClick={() => setGroupManageOpen(false)}
                >
                  {intl.get("common.close")}
                </button>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{intl.get("dataCatalog.tree.group.groups")}</p>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder={intl.get("dataCatalog.tree.group.newPlaceholder")}
                      className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                    />
                    <button
                      type="button"
                      className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-95"
                      onClick={async () => {
                        const name = newGroupName.trim();
                        if (!name) return;
                        const created = await createCatalogGroup({ groupName: name, displayOrder: Date.now() });
                        setCustomGroups((prev) => [
                          ...prev,
                          { id: String(created.groupId), name: String(created.groupName || name), displayOrder: Number(created.displayOrder || 0) },
                        ]);
                        setNewGroupName("");
                      }}
                    >
                      {intl.get("dataCatalog.tree.group.create")}
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {customGroups.length === 0 ? (
                      <p className="text-xs text-gray-500">{intl.get("dataCatalog.tree.group.empty")}</p>
                    ) : (
                      customGroups.map((g) => (
                        <div key={g.id} className="flex items-center gap-2">
                          <input
                            value={renameDraft[g.id] ?? g.name}
                            onChange={(e) => setRenameDraft((p) => ({ ...p, [g.id]: e.target.value }))}
                            className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                          />
                          <button
                            type="button"
                            className="rounded-md border border-gray-200 px-2 py-1.5 text-xs dark:border-gray-700"
                            onClick={async () => {
                              const next = String(renameDraft[g.id] ?? g.name).trim();
                              if (!next) return;
                              await updateCatalogGroup(g.id, { groupName: next });
                              setCustomGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, name: next } : x)));
                            }}
                          >
                            {intl.get("dataCatalog.tree.group.rename")}
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-700 dark:border-red-900/50 dark:text-red-300"
                            onClick={() => openDeleteGroupDialog(g.id, g.name)}
                          >
                            {intl.get("dataCatalog.tree.group.delete")}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{intl.get("dataCatalog.tree.group.assignments")}</p>
                  <div className="mt-3 max-h-[55vh] overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500">
                          <th className="py-2 pr-2">{intl.get("dataCatalog.table.catalogName")}</th>
                          <th className="py-2 pr-2">{intl.get("dataCatalog.table.catalogType")}</th>
                          <th className="py-2">{intl.get("dataCatalog.tree.group.group")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {nodes.map((cat) => (
                          <tr key={cat.catalogId} className="text-gray-700 dark:text-gray-200">
                            <td className="py-2 pr-2">{cat.catalogName}</td>
                            <td className="py-2 pr-2 text-gray-500 dark:text-gray-400">{typeLabel(cat.catalogType)}</td>
                            <td className="py-2">
                              <select
                                value={catalogGroupMap[cat.catalogId] || ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  void setCatalogGroupAssignment(cat.catalogId, v || null);
                                  setCatalogGroupMap((prev) => {
                                    const next = { ...prev };
                                    if (!v) delete next[cat.catalogId];
                                    else next[cat.catalogId] = v;
                                    return next;
                                  });
                                }}
                                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                              >
                                {effectiveGroupOptions.map((o) => (
                                  <option key={o.id || "ungrouped"} value={o.id}>
                                    {o.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <DeleteGroupConfirmDialog
        open={!!deleteGroupTarget}
        groupName={deleteGroupTarget?.groupName ?? ""}
        onCancel={closeDeleteGroupDialog}
        onConfirm={confirmDeleteGroup}
      />
    </div>
  );
}
