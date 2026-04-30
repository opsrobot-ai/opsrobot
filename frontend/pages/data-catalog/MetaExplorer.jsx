import { Fragment, useEffect, useState } from "react";
import intl from "react-intl-universal";
import { fetchTablePreview, fetchTables, fetchTableDetail, queryCatalogDatabase } from "../../lib/catalogApi.js";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../../components/TablePagination.jsx";
import PathHeader from "../../components/PathHeader.jsx";
import { downloadCsv, filenameWithTime } from "../../utils/exportCsv.js";
import { downloadExcel } from "../../utils/exportExcel.js";
import Icon from "../../components/Icon.jsx";
import DatabaseListView from "./DatabaseListView.jsx";

export default function MetaExplorer({
  view,
  catalog,
  databaseName,
  tableName,
  onBack,
  onSelectDatabase,
  onSelectTable,
  onTreeRefresh,
  showToast,
}) {
  const formatDetailValue = (value) => {
    if (value == null) return "";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const [tbList, setTbList] = useState([]);
  const [tbQ, setTbQ] = useState("");
  const [tbPage, setTbPage] = useState(1);
  const [tbPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [preview, setPreview] = useState(null);
  const [tableTab, setTableTab] = useState("basic");
  const [columnQ, setColumnQ] = useState("");
  const [columnPage, setColumnPage] = useState(1);
  const [columnPageSize, setColumnPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [dataPage, setDataPage] = useState(1);
  const [dataPageSize, setDataPageSize] = useState(100);
  const [previewFilterQ, setPreviewFilterQ] = useState("");
  const [sqlText, setSqlText] = useState("");
  const [customSqlMode, setCustomSqlMode] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [expandedRowKeys, setExpandedRowKeys] = useState(() => ({}));
  const [expandedRowView, setExpandedRowView] = useState(() => ({})); // rowKey -> 'fields' | 'json'
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ddlCopied, setDdlCopied] = useState(false);
  const [tableDetail, setTableDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");

  const InfoCell = ({ label, value }) => (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold">{value ?? "—"}</p>
    </div>
  );

  useEffect(() => {
    if (!catalog?.catalogId || !databaseName) return;
    if (view === "tables") {
      setLoading(true);
      setErr("");
      fetchTables(catalog.catalogId, databaseName)
        .then((d) => setTbList(d.list || []))
        .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
    }
  }, [view, catalog?.catalogId, databaseName]);

  useEffect(() => {
    if (!catalog?.catalogId || !databaseName || !tableName) return;
    if (view === "preview" && !customSqlMode) {
      setLoading(true);
      setErr("");
      fetchTablePreview(catalog.catalogId, databaseName, tableName, { page: dataPage, pageSize: dataPageSize })
        .then(setPreview)
        .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
    }
  }, [view, catalog?.catalogId, databaseName, tableName, dataPage, dataPageSize, customSqlMode]);

  useEffect(() => {
    if (view !== "preview" || !catalog?.catalogId || !databaseName || !tableName) return;
    setDetailLoading(true);
    setDetailErr("");
    fetchTableDetail(catalog.catalogId, databaseName, tableName)
      .then((d) => setTableDetail(d || null))
      .catch((e) => setDetailErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setDetailLoading(false));
  }, [view, catalog?.catalogId, databaseName, tableName]);

  useEffect(() => {
    if (view === "preview") {
      setTableTab("basic");
      setColumnQ("");
      setPreviewFilterQ("");
      setSqlText(`SELECT * FROM \`${tableName}\` LIMIT 100`);
      setCustomSqlMode(false);
      setDownloadMenuOpen(false);
      setColumnPage(1);
      setDataPage(1);
      setExpandedRowKeys({});
      setExpandedRowView({});
      setDdlCopied(false);
      setTableDetail(null);
      setDetailErr("");
    }
  }, [view, tableName]);

  useEffect(() => {
    setColumnPage(1);
  }, [columnQ]);

  useEffect(() => {
    setTbPage(1);
  }, [tbQ, view, databaseName]);

  if (view === "databases") {
    return (
      <DatabaseListView
        catalog={catalog}
        onBack={onBack}
        onSelectDatabase={onSelectDatabase}
        onTreeRefresh={onTreeRefresh}
        showToast={showToast}
      />
    );
  }

  if (view === "tables") {
    const tbFiltered = tbList.filter((r) => {
      const q = tbQ.trim().toLowerCase();
      if (!q) return true;
      return (
        String(r.tableName || "").toLowerCase().includes(q) ||
        String(r.remark || "").toLowerCase().includes(q)
      );
    });
    const tbStart = (tbPage - 1) * tbPageSize;
    const tbPaged = tbFiltered.slice(tbStart, tbStart + tbPageSize);

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
        <PathHeader
          onBack={onBack}
          backLabel={intl.get("dataCatalog.actions.back")}
          segments={[intl.get("dataCatalog.tree.root"), catalog?.catalogName || "—", databaseName, intl.get("dataCatalog.right.title.tables")]}
        />
        <div className="flex items-center justify-end gap-2">
          <input
            type="search"
            value={tbQ}
            onChange={(e) => setTbQ(e.target.value)}
            placeholder={intl.get("dataCatalog.search.catalogNamePlaceholder")}
            className="h-9 min-w-[12rem] rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 sm:w-[18rem]"
          />
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"
            onClick={() => {
              if (!catalog?.catalogId || !databaseName) return;
              setLoading(true);
              setErr("");
              fetchTables(catalog.catalogId, databaseName)
                .then((d) => setTbList(d.list || []))
                .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
                .finally(() => setLoading(false));
            }}
          >
            {intl.get("dataCatalog.actions.refresh")}
          </button>
        </div>
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900/50">
          <table className="min-w-full table-fixed divide-y divide-gray-100 text-sm dark:divide-gray-800">
            <thead className="bg-gray-50/80 dark:bg-gray-950/80">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">{intl.get("dataCatalog.table.tableName")}</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">{intl.get("dataCatalog.table.tableRemark")}</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">{intl.get("dataCatalog.table.operations")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                    {intl.get("common.loadingList")}
                  </td>
                </tr>
              ) : tbPaged.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                    {intl.get("common.noData")}
                  </td>
                </tr>
              ) : (
                tbPaged.map((r) => (
                  <tr key={r.tableName} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-2 font-mono text-sm text-gray-900 dark:text-gray-100">{r.tableName}</td>
                    <td className="px-4 py-2 truncate text-gray-600 dark:text-gray-400">{r.remark || "—"}</td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        title={intl.get("dataCatalog.actions.preview")}
                        aria-label={intl.get("dataCatalog.actions.preview")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-200"
                        onClick={() => onSelectTable(r.tableName)}
                      >
                        <Icon name="table" className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination page={tbPage} pageSize={tbPageSize} total={tbFiltered.length} onPageChange={setTbPage} loading={loading} />
      </div>
    );
  }

  if (view === "preview" && loading && !preview) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">
        {intl.get("common.loadingList")}
      </div>
    );
  }

  if (view === "preview" && preview) {
    const columns = preview.columns || [];
    const rows = preview.rows || [];
    const dataTotal = customSqlMode ? rows.length : Number(preview.total ?? rows.length ?? 0);
    const filteredColumns = columns.filter((c) => {
      const q = columnQ.trim().toLowerCase();
      if (!q) return true;
      return String(c.columnName || "").toLowerCase().includes(q) || String(c.dataType || "").toLowerCase().includes(q);
    });
    const filteredRows = rows.filter((row) => {
      const q = previewFilterQ.trim().toLowerCase();
      return !q || columns.some((c) => String(row[c.columnName] ?? "").toLowerCase().includes(q));
    });
    const displayRows = customSqlMode
      ? filteredRows.slice((dataPage - 1) * dataPageSize, dataPage * dataPageSize)
      : filteredRows;
    const columnTotal = filteredColumns.length;
    const columnStart = (columnPage - 1) * columnPageSize;
    const pagedColumns = filteredColumns.slice(columnStart, columnStart + columnPageSize);
    const ddlText = [
      `CREATE TABLE ${tableName} (`,
      ...columns.map((c, i) => `  ${c.columnName} ${c.dataType || "STRING"}${i < columns.length - 1 ? "," : ""}`),
      ");",
    ].join("\n");
    const tabs = [
      { key: "basic", label: "基础信息" },
      { key: "columns", label: "表字段" },
      { key: "data", label: "数据" },
      { key: "ddl", label: "DDL" },
    ];

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
        <PathHeader
          onBack={onBack}
          backLabel={intl.get("dataCatalog.actions.back")}
          segments={[intl.get("dataCatalog.tree.root"), catalog?.catalogName || "—", databaseName, tableName]}
        />
        {err ? <p className="text-sm text-red-600">{err}</p> : null}

        <div className="rounded-xl border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900/50">
          <div className="flex flex-wrap gap-2 border-b border-gray-200 p-3 dark:border-gray-800">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTableTab(t.key)}
                className={
                  t.key === tableTab
                    ? "rounded-md bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary dark:bg-primary/15"
                    : "rounded-md px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tableTab === "basic" ? (
              <div className="space-y-3">
                {detailErr ? <p className="text-sm text-red-600">{detailErr}</p> : null}

                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">基础信息</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <InfoCell label="数据表名称" value={tableDetail?.tableName || tableName} />
                    <InfoCell label="所属数据目录" value={tableDetail?.catalogName || catalog?.catalogName || "—"} />
                    <InfoCell label="所属数据库" value={tableDetail?.databaseName || databaseName} />
                    <InfoCell label="目录类型" value={tableDetail?.catalogType || catalog?.catalogType || "—"} />
                    <InfoCell label="表业务备注" value={tableDetail?.tableRemark || "—"} />
                    <InfoCell label="创建时间" value={tableDetail?.createdAt || "—"} />
                    <InfoCell label="最后元数据同步时间" value={tableDetail?.lastSyncTime || "—"} />
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">类型与模型</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <InfoCell label="存储引擎" value={tableDetail?.storageEngine || "—"} />
                    <InfoCell label="数据模型（Doris）" value={tableDetail?.dataModel ? tableDetail.dataModel : "不适用"} />
                    <InfoCell label="字段数量" value={String(tableDetail?.fieldCount ?? columns.length)} />
                    <InfoCell label="分区数量" value={String(tableDetail?.partitionCount ?? 0)} />
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">存储统计</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <InfoCell label="数据行数" value={String(tableDetail?.rowCount ?? 0)} />
                    <InfoCell
                      label="存储大小"
                      value={tableDetail?.storageSizeBytes ? `${tableDetail.storageSizeMB.toFixed(2)} MB` : "—"}
                    />
                    <InfoCell label="最后更新时间" value={tableDetail?.lastUpdatedAt || "—"} />
                    <InfoCell label="存储文件格式" value={tableDetail?.storageFormat || "—"} />
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">管理信息</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <InfoCell label="元数据同步状态" value={tableDetail?.syncStatus || "—"} />
                    <InfoCell label="维护负责人" value={tableDetail?.maintainer || "—"} />
                    <InfoCell label="所属业务分组" value={tableDetail?.businessGroup || "未分组"} />
                  </div>
                </div>
              </div>
            ) : null}

            {tableTab === "columns" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <input
                    value={columnQ}
                    onChange={(e) => setColumnQ(e.target.value)}
                    placeholder="筛选字段/类型"
                    className="w-64 rounded-lg border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                  />
                </div>
                <TablePagination
                  page={columnPage}
                  pageSize={columnPageSize}
                  total={columnTotal}
                  onPageChange={setColumnPage}
                  trailingControls={
                    <select
                      value={columnPageSize}
                      onChange={(e) => {
                        setColumnPageSize(Number(e.target.value));
                        setColumnPage(1);
                      }}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-950"
                    >
                      {[10, 20, 50, 100].map((n) => (
                        <option key={n} value={n}>
                          {n} /页
                        </option>
                      ))}
                    </select>
                  }
                />
                <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-950">
                      <tr>
                        {["字段名称", "类型", "主键", "分区键", "可空", "默认值", "注释"].map((h) => (
                          <th key={h} className="border-b border-gray-200 px-2 py-2 text-left dark:border-gray-800">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedColumns.map((c) => (
                        <tr key={c.columnName} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="px-2 py-1 font-mono">{c.columnName}</td>
                          <td className="px-2 py-1">{c.dataType || "—"}</td>
                          <td className="px-2 py-1">{c.isPrimaryKey ? "Y" : "—"}</td>
                          <td className="px-2 py-1">{c.isPartitionKey ? "Y" : "—"}</td>
                          <td className="px-2 py-1">{c.nullable === false ? "N" : "Y"}</td>
                          <td className="px-2 py-1">{c.defaultValue || "—"}</td>
                          <td className="px-2 py-1">{c.comment || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {tableTab === "data" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <textarea
                    value={sqlText}
                    onChange={(e) => setSqlText(e.target.value)}
                    rows={3}
                    placeholder="例如：SELECT * FROM `table_name` LIMIT 100"
                    className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-mono dark:border-gray-700 dark:bg-gray-900/60"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded bg-primary px-3 py-1.5 text-xs text-white"
                      onClick={async () => {
                        try {
                          setLoading(true);
                          setErr("");
                          const out = await queryCatalogDatabase(catalog.catalogId, databaseName, sqlText);
                          setPreview(out);
                          setCustomSqlMode(true);
                          setDataPage(1);
                          setExpandedRowKeys({});
                        } catch (e) {
                          setErr(e instanceof Error ? e.message : String(e));
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      执行 SQL
                    </button>
                  </div>
                </div>
                <TablePagination
                  page={dataPage}
                  pageSize={dataPageSize}
                  total={dataTotal}
                  onPageChange={setDataPage}
                  loading={loading}
                  leadingControls={
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={previewFilterQ}
                        onChange={(e) => setPreviewFilterQ(e.target.value)}
                        placeholder="简单筛选"
                        className="w-64 rounded-lg border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                      />
                      <button
                        type="button"
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs dark:border-gray-700"
                        onClick={() => {
                          setCustomSqlMode(false);
                          setDataPage(1);
                        }}
                      >
                        恢复默认预览
                      </button>
                    </div>
                  }
                  trailingControls={
                    <>
                      <select
                        value={dataPageSize}
                        onChange={(e) => {
                          setDataPageSize(Number(e.target.value));
                          setDataPage(1);
                        }}
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-950"
                      >
                        {[50, 100, 200, 500].map((n) => (
                          <option key={n} value={n}>
                            {n} /页
                          </option>
                        ))}
                      </select>
                      <div className="relative">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs dark:border-gray-700"
                          onClick={() => setDownloadMenuOpen((v) => !v)}
                        >
                          <Icon name="download" className="h-4 w-4" />
                          下载
                        </button>
                        {downloadMenuOpen ? (
                          <div className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[8rem] rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                            <button
                              type="button"
                              className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
                              onClick={() => {
                                const headers = columns.map((c) => c.columnName);
                                const toCell = (v) => {
                                  if (v == null) return "";
                                  if (typeof v === "object") return JSON.stringify(v);
                                  return String(v);
                                };
                                const outRows = filteredRows.map((r) => headers.map((h) => toCell(r[h])));
                                downloadCsv(filenameWithTime(`${tableName}-preview`, "csv"), headers, outRows);
                                setDownloadMenuOpen(false);
                              }}
                            >
                              CSV
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
                              onClick={() => {
                                const headers = columns.map((c) => c.columnName);
                                const toCell = (v) => {
                                  if (v == null) return "";
                                  if (typeof v === "object") return JSON.stringify(v);
                                  return String(v);
                                };
                                const outRows = filteredRows.map((r) => headers.map((h) => toCell(r[h])));
                                downloadExcel(filenameWithTime(`${tableName}-preview`, "xlsx"), headers, outRows);
                                setDownloadMenuOpen(false);
                              }}
                            >
                              Excel
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </>
                  }
                />
                <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-950">
                      <tr>
                        {columns.map((c) => (
                          <th
                            key={c.columnName}
                            className="border-b border-gray-200 px-2 py-2 text-left dark:border-gray-800"
                          >
                            <span className="font-semibold">{c.columnName}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row, i) => {
                        const rowKey = `r_${i}`;
                        const expanded = !!expandedRowKeys[rowKey];
                        return (
                          <Fragment key={rowKey}>
                            <tr key={rowKey} className="border-b border-gray-100 dark:border-gray-800">
                              {columns.map((c) => (
                                <td key={c.columnName} className="px-2 py-1 font-mono">
                                  {c === columns[0] ? (
                                    <span className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        className={`inline-flex h-6 w-6 items-center justify-center rounded text-sm transition-colors ${
                                          expanded
                                            ? "bg-primary-soft text-primary dark:bg-primary/15"
                                            : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                                        }`}
                                        onClick={() => {
                                          setExpandedRowKeys((prev) => {
                                            const next = !prev[rowKey];
                                            if (next) {
                                              setExpandedRowView((v) => ({ ...v, [rowKey]: v[rowKey] || "fields" }));
                                            }
                                            return { ...prev, [rowKey]: next };
                                          });
                                        }}
                                        title={expanded ? "收起详情" : "展开详情"}
                                      >
                                        {expanded ? "▾" : "▸"}
                                      </button>
                                      <span>{String(row[c.columnName] ?? "")}</span>
                                    </span>
                                  ) : (
                                    String(row[c.columnName] ?? "")
                                  )}
                                </td>
                              ))}
                            </tr>
                            {expanded ? (
                              <tr className="border-b border-gray-100 bg-gray-50/60 dark:border-gray-800 dark:bg-gray-900/40">
                                <td colSpan={columns.length} className="px-3 py-2">
                                  <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                                    <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                                      <div className="inline-flex gap-1">
                                        <button
                                          type="button"
                                          className={`rounded px-2 py-1 text-xs ${
                                            (expandedRowView[rowKey] || "fields") === "fields"
                                              ? "bg-primary-soft text-primary dark:bg-primary/15"
                                              : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                                          }`}
                                          onClick={() => setExpandedRowView((v) => ({ ...v, [rowKey]: "fields" }))}
                                        >
                                          字段详情
                                        </button>
                                        <button
                                          type="button"
                                          className={`rounded px-2 py-1 text-xs ${
                                            (expandedRowView[rowKey] || "fields") === "json"
                                              ? "bg-primary-soft text-primary dark:bg-primary/15"
                                              : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                                          }`}
                                          onClick={() => setExpandedRowView((v) => ({ ...v, [rowKey]: "json" }))}
                                        >
                                          原始记录(JSON)
                                        </button>
                                      </div>
                                      <span className="text-[11px] text-gray-400">行索引 #{i + 1}</span>
                                    </div>

                                    {(expandedRowView[rowKey] || "fields") === "json" ? (
                                      <pre className="overflow-x-auto p-3 text-xs text-gray-700 dark:text-gray-200">
                                        {JSON.stringify(row, null, 2)}
                                      </pre>
                                    ) : (
                                      <div className="p-3">
                                        <table className="min-w-full text-xs">
                                          <thead>
                                            <tr>
                                              <th className="w-44 border-b border-gray-200 px-2 py-1.5 text-left text-gray-500 dark:border-gray-700">
                                                字段
                                              </th>
                                              <th className="border-b border-gray-200 px-2 py-1.5 text-left text-gray-500 dark:border-gray-700">
                                                字段值
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {columns.map((c) => (
                                              <tr key={`${rowKey}_${c.columnName}`} className="border-b border-gray-100 dark:border-gray-800">
                                                <td className="px-2 py-1 font-mono text-gray-600 dark:text-gray-300">{c.columnName}</td>
                                                <td className="px-2 py-1 font-mono text-gray-800 dark:text-gray-200 break-all">
                                                  <pre className="whitespace-pre-wrap break-all">{formatDetailValue(row[c.columnName])}</pre>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {tableTab === "ddl" ? (
              <div className="space-y-2">
                <button
                  type="button"
                  className={`rounded-lg border px-3 py-1.5 text-xs dark:border-gray-700 ${
                    ddlCopied ? "border-primary/40 bg-primary-soft text-primary dark:bg-primary/10" : "border-gray-200 dark:border-gray-700"
                  }`}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(ddlText);
                      setDdlCopied(true);
                      window.setTimeout(() => setDdlCopied(false), 2500);
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e);
                      window.alert(`复制失败：${msg}`);
                    }
                  }}
                >
                  {ddlCopied ? "已复制" : "复制DDL"}
                </button>
                <pre className="overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-800 dark:bg-gray-950">
                  {ddlText}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">
      {loading ? intl.get("common.loadingList") : err || "—"}
    </div>
  );
}
