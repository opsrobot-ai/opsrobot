import { useEffect, useState } from "react";
import intl from "react-intl-universal";
import Icon from "../../components/Icon.jsx";
import { testDraftCatalogConnection } from "../../lib/catalogApi.js";

function cx(...p) {
  return p.filter(Boolean).join(" ");
}

const RELATIONAL_TYPES = new Set(["mysql", "postgresql", "oracle", "sqlserver", "tidb", "clickhouse", "starrocks", "redshift", "impala"]);
const DORIS_TYPES = new Set(["doris"]);
/** 走 Doris CREATE CATALOG(type=jdbc) 的类型：需 driver（可填默认值） */
const JDBC_CATALOG_TYPES = new Set(["mysql", "tidb", "doris", "postgresql", "oracle", "sqlserver", "clickhouse", "starrocks", "redshift", "impala"]);

const JDBC_DRIVER_DEFAULTS = {
  mysql: {
    driverClassName: "com.mysql.cj.jdbc.Driver",
    driverUrl: "https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.33/mysql-connector-java-8.0.33.jar",
  },
  tidb: {
    driverClassName: "com.mysql.cj.jdbc.Driver",
    driverUrl: "https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.33/mysql-connector-java-8.0.33.jar",
  },
  doris: {
    driverClassName: "com.mysql.cj.jdbc.Driver",
    driverUrl: "https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.33/mysql-connector-java-8.0.33.jar",
  },
  starrocks: {
    driverClassName: "com.mysql.cj.jdbc.Driver",
    driverUrl: "https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.33/mysql-connector-java-8.0.33.jar",
  },
  postgresql: {
    driverClassName: "org.postgresql.Driver",
    driverUrl: "https://repo1.maven.org/maven2/org/postgresql/postgresql/42.7.3/postgresql-42.7.3.jar",
  },
  sqlserver: {
    driverClassName: "com.microsoft.sqlserver.jdbc.SQLServerDriver",
    driverUrl: "https://repo1.maven.org/maven2/com/microsoft/sqlserver/mssql-jdbc/12.6.1.jre11/mssql-jdbc-12.6.1.jre11.jar",
  },
  clickhouse: {
    driverClassName: "com.clickhouse.jdbc.ClickHouseDriver",
    driverUrl: "https://repo1.maven.org/maven2/com/clickhouse/clickhouse-jdbc/0.6.0/clickhouse-jdbc-0.6.0-all.jar",
  },
};

const defaultForm = {
  host: "",
  port: "",
  username: "",
  password: "",
  database: "",
  metastoreUri: "",
  esClusterUrl: "",
  esAuthType: "none",
  esVersion: "",
  icebergCatalogType: "hive",
  storageConfig: "",
  driverClassName: "",
  driverUrl: "",
  jdbcUrl: "",
  extraJdbcParams: "",
  customParams: "",
  connectTimeout: "5000",
  maxConnections: "20",
  autoSync: true,
  hideSensitive: true,
};

const SOURCE_GROUPS = [
  { title: "OLTP", items: ["mysql", "postgresql", "oracle", "sqlserver", "tidb"] },
  { title: "OLAP", items: ["impala", "doris", "clickhouse", "elasticsearch", "starrocks"] },
  { title: "数据湖", items: ["hive", "iceberg", "hudi", "redshift", "paimon"] },
  { title: "API数据", items: ["jdbc"] },
];

const SOURCE_TYPE_ICON = {
  mysql: "logoMysql",
  postgresql: "logoPostgresql",
  oracle: "logoOracle",
  hive: "logoHive",
  iceberg: "logoIceberg",
  hudi: "logoHudi",
  impala: "logoImpala",
  doris: "logoDoris",
  clickhouse: "logoClickhouse",
  starrocks: "logoStarrocks",
  sqlserver: "logoSqlserver",
  tidb: "logoTidb",
  redshift: "logoRedshift",
  elasticsearch: "logoElasticsearch",
  jdbc: "logoJdbc",
  paimon: "logoPaimon",
};

export default function CatalogFormModal({ open, mode, initial, onClose, onSubmit }) {
  const [catalogName, setCatalogName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [catalogType, setCatalogType] = useState("mysql");
  const [remark, setRemark] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [step, setStep] = useState(2);
  const [connMode, setConnMode] = useState("host");
  const [sourceSearch, setSourceSearch] = useState("");
  const [openTypeGroups, setOpenTypeGroups] = useState({
    OLTP: true,
    OLAP: true,
    数据湖: true,
    API数据: true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [connectionTestResult, setConnectionTestResult] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr("");
    setConnectionTestResult(null);
    setTestingConnection(false);
    if (mode === "edit" && initial) {
      setCatalogName(initial.catalogName || "");
      setBusinessName(initial.businessName || initial.catalogName || "");
      setCatalogType(initial.catalogType && initial.catalogType !== "internal" ? initial.catalogType : "mysql");
      setRemark(initial.remark || "");
      const cfg = initial.connectionConfig || {};
      setForm({
        ...defaultForm,
        host: cfg.host || "",
        port: cfg.port != null ? String(cfg.port) : "",
        username: cfg.username || "",
        password: cfg.password || "",
        database: cfg.database || "",
        metastoreUri: cfg.metastoreUri || "",
        esClusterUrl: cfg.esClusterUrl || "",
        esAuthType: cfg.esAuthType || "none",
        esVersion: cfg.esVersion || "",
        icebergCatalogType: cfg.icebergCatalogType || "hive",
        storageConfig: cfg.storageConfig || "",
        driverClassName: cfg.driverClassName || "",
        driverUrl: cfg.driverUrl || "",
        jdbcUrl: cfg.jdbcUrl || "",
        extraJdbcParams: cfg.extraJdbcParams || "",
        customParams: cfg.customParams ? JSON.stringify(cfg.customParams, null, 2) : "",
        connectTimeout: cfg.connectTimeoutMs != null ? String(cfg.connectTimeoutMs) : "5000",
        maxConnections: cfg.maxConnections != null ? String(cfg.maxConnections) : "20",
        autoSync: cfg.autoSync !== false,
        hideSensitive: cfg.hideSensitive !== false,
      });
    } else {
      setCatalogName("");
      setBusinessName("");
      setCatalogType("mysql");
      setRemark("");
      setForm(defaultForm);
    }
    setAdvancedOpen(false);
    setStep(2);
    setConnMode("host");
    setSourceSearch("");
    setOpenTypeGroups({
      OLTP: true,
      OLAP: true,
      数据湖: true,
      API数据: true,
    });
  }, [open, mode, initial]);

  if (!open) return null;

  const q = sourceSearch.trim().toLowerCase();

  const field = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const parseCustomParams = () => {
    const t = String(form.customParams || "").trim();
    if (!t) return undefined;
    return JSON.parse(t);
  };

  const buildConnectionConfig = () => {
    const cfg = {
      connectTimeoutMs: Number(form.connectTimeout || 0) || 0,
      maxConnections: Number(form.maxConnections || 0) || 0,
      autoSync: !!form.autoSync,
      hideSensitive: !!form.hideSensitive,
    };

    if (RELATIONAL_TYPES.has(catalogType)) {
      if (connMode === "jdbc" && form.jdbcUrl.trim()) {
        cfg.jdbcUrl = form.jdbcUrl.trim();
        cfg.username = form.username.trim();
        cfg.password = form.password;
        if (form.database.trim()) cfg.database = form.database.trim();
      } else {
        cfg.host = form.host.trim();
        cfg.port = Number(form.port || 0);
        cfg.username = form.username.trim();
        cfg.password = form.password;
        if (form.database.trim()) cfg.database = form.database.trim();
      }
    }
    if (DORIS_TYPES.has(catalogType)) {
      cfg.connectionMode = connMode;
      cfg.host = form.host.trim();
      cfg.port = Number(form.port || 0);
      cfg.database = form.database.trim();
      cfg.username = form.username.trim();
      cfg.password = form.password;
      if (form.jdbcUrl.trim()) cfg.jdbcUrl = form.jdbcUrl.trim();
      if (form.extraJdbcParams.trim()) cfg.extraJdbcParams = form.extraJdbcParams.trim();
    }
    if (catalogType === "hive" || catalogType === "hudi") cfg.metastoreUri = form.metastoreUri.trim();
    if (catalogType === "elasticsearch") {
      cfg.esClusterUrl = form.esClusterUrl.trim();
      cfg.esAuthType = form.esAuthType;
      if (form.esVersion.trim()) cfg.esVersion = form.esVersion.trim();
    }
    if (catalogType === "iceberg" || catalogType === "paimon") {
      cfg.icebergCatalogType = form.icebergCatalogType;
      cfg.storageConfig = form.storageConfig.trim();
    }
    if (catalogType === "jdbc") {
      cfg.driverClassName = form.driverClassName.trim();
      cfg.driverUrl = form.driverUrl.trim();
      cfg.jdbcUrl = form.jdbcUrl.trim();
    }
    if (JDBC_CATALOG_TYPES.has(catalogType) && catalogType !== "jdbc") {
      const d = JDBC_DRIVER_DEFAULTS[catalogType];
      cfg.driverClassName = form.driverClassName.trim() || (d ? d.driverClassName : "");
      cfg.driverUrl = form.driverUrl.trim() || (d ? d.driverUrl : "");
    }
    const customParams = parseCustomParams();
    if (customParams) cfg.customParams = customParams;
    return cfg;
  };

  const validateStep2 = () => {
    if (RELATIONAL_TYPES.has(catalogType)) {
      if (connMode === "jdbc") {
        if (!form.jdbcUrl.trim()) return intl.get("dataCatalog.form.jdbcUrl") + " " + intl.get("dataCatalog.form.required");
      } else {
        if (!form.host.trim()) return intl.get("dataCatalog.form.host") + " " + intl.get("dataCatalog.form.required");
        if (!form.port.trim()) return intl.get("dataCatalog.form.port") + " " + intl.get("dataCatalog.form.required");
        if (!/^\d+$/.test(form.port.trim())) return intl.get("dataCatalog.form.portInvalid");
      }
    }
    if (DORIS_TYPES.has(catalogType)) {
      if (connMode === "host") {
        if (!form.host.trim()) return intl.get("dataCatalog.form.dorisHost") + " " + intl.get("dataCatalog.form.required");
        if (!form.port.trim()) return intl.get("dataCatalog.form.port") + " " + intl.get("dataCatalog.form.required");
        if (!/^\d+$/.test(form.port.trim())) return intl.get("dataCatalog.form.portInvalid");
      } else if (!form.jdbcUrl.trim()) {
        return intl.get("dataCatalog.form.jdbcUrl") + " " + intl.get("dataCatalog.form.required");
      }
      if (!form.database.trim()) return intl.get("dataCatalog.form.databaseName") + " " + intl.get("dataCatalog.form.required");
    }
    return "";
  };

  /** 连接测试前校验（含 Hive / ES / JDBC 等） */
  const validateConnectionTest = () => {
    const base = validateStep2();
    if (base) return base;
    if ((catalogType === "hive" || catalogType === "hudi") && !form.metastoreUri.trim()) {
      return intl.get("dataCatalog.form.metastoreUri") + " " + intl.get("dataCatalog.form.required");
    }
    if ((catalogType === "iceberg" || catalogType === "paimon") && !form.storageConfig.trim()) {
      return intl.get("dataCatalog.form.storageConfig") + " " + intl.get("dataCatalog.form.required");
    }
    if (JDBC_CATALOG_TYPES.has(catalogType) && catalogType !== "jdbc") {
      const d = JDBC_DRIVER_DEFAULTS[catalogType];
      if (!d && (!form.driverClassName.trim() || !form.driverUrl.trim())) {
        return intl.get("dataCatalog.form.driverRequired");
      }
      if (!d && !form.driverClassName.trim()) {
        return intl.get("dataCatalog.form.driverClassName") + " " + intl.get("dataCatalog.form.required");
      }
      if (!d && !form.driverUrl.trim()) {
        return intl.get("dataCatalog.form.driverUrl") + " " + intl.get("dataCatalog.form.required");
      }
    }
    if (catalogType === "elasticsearch" && !form.esClusterUrl.trim()) {
      return intl.get("dataCatalog.form.esClusterUrl") + " " + intl.get("dataCatalog.form.required");
    }
    if (catalogType === "jdbc") {
      if (!form.jdbcUrl.trim()) return intl.get("dataCatalog.form.jdbcUrl") + " " + intl.get("dataCatalog.form.required");
      if (!form.driverClassName.trim()) {
        return intl.get("dataCatalog.form.driverClassName") + " " + intl.get("dataCatalog.form.required");
      }
    }
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    const stepErr = validateStep2();
    if (stepErr) {
      setErr(stepErr);
      return;
    }
    let connectionConfig = {};
    try {
      connectionConfig = buildConnectionConfig();
    } catch {
      setErr(intl.get("dataCatalog.form.customParams") + " JSON invalid");
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") {
        await onSubmit({
          catalogName: catalogName.trim(),
          businessName: businessName.trim(),
          catalogType,
          remark: remark.trim(),
          connectionConfig,
        });
      } else {
        await onSubmit({
          catalogName: catalogName.trim(),
          businessName: businessName.trim(),
          catalogType,
          remark: remark.trim(),
          connectionConfig,
        });
      }
      onClose();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  const handleConnectionTest = async () => {
    setErr("");
    setConnectionTestResult(null);
    const stepErr = validateConnectionTest();
    if (stepErr) {
      setErr(stepErr);
      return;
    }
    let connectionConfig;
    try {
      connectionConfig = buildConnectionConfig();
    } catch {
      setErr(intl.get("dataCatalog.form.customParams") + " JSON invalid");
      return;
    }
    setTestingConnection(true);
    try {
      const res = await testDraftCatalogConnection({ catalogType, connectionConfig });
      setConnectionTestResult({
        ok: !!res.ok,
        message: String(res.message || ""),
        latencyMs: res.latencyMs != null ? Number(res.latencyMs) : null,
      });
    } catch (e) {
      setConnectionTestResult({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        latencyMs: null,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-stretch justify-end bg-gray-900/50 dark:bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-6xl flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {mode === "create" ? intl.get("dataCatalog.form.addTitle") : intl.get("dataCatalog.form.editTitle")}
          </h3>
          <div className="flex items-center gap-6 text-xs">
            <button type="button" onClick={() => setStep(1)} className={cx("inline-flex items-center gap-2", step === 1 ? "text-primary" : "text-gray-500")}>
              <span className={cx("inline-flex h-4 w-4 items-center justify-center rounded-full border", step === 1 ? "border-primary bg-primary text-white" : "border-gray-300")}>1</span>
              {intl.get("dataCatalog.form.step1")}
            </button>
            <button type="button" onClick={() => setStep(2)} className={cx("inline-flex items-center gap-2", step === 2 ? "text-primary" : "text-gray-500")}>
              <span className={cx("inline-flex h-4 w-4 items-center justify-center rounded-full border", step === 2 ? "border-primary bg-primary text-white" : "border-gray-300")}>2</span>
              {intl.get("dataCatalog.form.step2")}
            </button>
          </div>
          <button type="button" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" onClick={onClose}>x</button>
        </div>

        <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 grid-cols-[220px,1fr] overflow-hidden md:grid">
            <aside className="border-r border-gray-200 p-3 dark:border-gray-800">
              <input
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.target.value)}
                placeholder="搜索"
                className="mb-2 w-full rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
              />
              <div className="space-y-2 text-sm">
                {SOURCE_GROUPS.map((g) => {
                  const visibleItems = q
                    ? g.items.filter((t) => {
                        const label = intl.get(`dataCatalog.type.${t}`);
                        return String(label).toLowerCase().includes(q) || t.toLowerCase().includes(q);
                      })
                    : g.items;
                  if (visibleItems.length === 0) return null;
                  return (
                  <div key={g.title}>
                    <button
                      type="button"
                      className="mb-1 flex w-full items-center justify-between rounded px-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => setOpenTypeGroups((prev) => ({ ...prev, [g.title]: !prev[g.title] }))}
                    >
                      <span>{g.title}</span>
                      <Icon name="chevron" className={cx("h-3 w-3 transition-transform", openTypeGroups[g.title] ? "rotate-180" : "")} />
                    </button>
                    {q || openTypeGroups[g.title] ? (
                      <div className="space-y-0.5">
                        {visibleItems.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setCatalogType(t);
                              setStep(2);
                            }}
                            className={cx(
                              "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm",
                              catalogType === t ? "bg-primary-soft text-primary dark:bg-primary/15" : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                            )}
                          >
                            <Icon name={SOURCE_TYPE_ICON[t] || "database"} className="h-5 w-5 opacity-90" />
                            <span>{intl.get(`dataCatalog.type.${t}`)}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );})}
              </div>
            </aside>

            <section className="min-h-0 overflow-y-auto p-5">
              {step === 1 ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
                  {intl.get("dataCatalog.form.step1")}：请选择左侧数据源类型
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{intl.get(`dataCatalog.type.${catalogType}`)}</h4>
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                    {intl.get("dataCatalog.form.dorisNativeHint")}
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("dataCatalog.form.businessName")}</label>
                      <input
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder={intl.get("dataCatalog.form.businessNamePlaceholder")}
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                      />
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{intl.get("dataCatalog.form.businessNameHelp")}</p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("dataCatalog.form.catalogName")} *</label>
                      <input
                        required
                        value={catalogName}
                        onChange={(e) => setCatalogName(e.target.value)}
                        placeholder={intl.get("dataCatalog.form.catalogNamePlaceholder")}
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                      />
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{intl.get("dataCatalog.form.catalogNameHelp")}</p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("dataCatalog.form.remark")}</label>
                      <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                    </div>
                  </div>

                  {RELATIONAL_TYPES.has(catalogType) ? (
                    <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                      <div>
                        <p className="text-xs font-medium text-gray-500">连接方式</p>
                        <label className="mr-4 inline-flex items-center gap-1 text-sm"><input type="radio" checked={connMode === "host"} onChange={() => setConnMode("host")} />主机名</label>
                        <label className="inline-flex items-center gap-1 text-sm"><input type="radio" checked={connMode === "jdbc"} onChange={() => setConnMode("jdbc")} />JDBC 连接</label>
                      </div>
                      {connMode === "host" ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.host")} *</label>
                            <input value={form.host} onChange={(e) => field("host", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.port")} *</label>
                            <input value={form.port} onChange={(e) => field("port", e.target.value.replace(/[^\d]/g, ""))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.jdbcUrl")}</label>
                          <input value={form.jdbcUrl} onChange={(e) => field("jdbcUrl", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                        </div>
                      )}
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.username")}</label>
                          <input value={form.username} onChange={(e) => field("username", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.password")}</label>
                          <input type="password" value={form.password} onChange={(e) => field("password", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.defaultDb")}</label>
                          <input value={form.database} onChange={(e) => field("database", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                        </div>
                        {JDBC_CATALOG_TYPES.has(catalogType) ? (
                          <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.driverClassName")}</label>
                              <input
                                value={form.driverClassName}
                                onChange={(e) => field("driverClassName", e.target.value)}
                                placeholder={JDBC_DRIVER_DEFAULTS[catalogType]?.driverClassName || ""}
                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.driverUrl")}</label>
                              <input
                                value={form.driverUrl}
                                onChange={(e) => field("driverUrl", e.target.value)}
                                placeholder={JDBC_DRIVER_DEFAULTS[catalogType]?.driverUrl || intl.get("dataCatalog.form.driverUrlPlaceholder")}
                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                              />
                            </div>
                            <p className="md:col-span-2 text-xs text-gray-500 dark:text-gray-400">{intl.get("dataCatalog.form.dorisJdbcDriverHint")}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {DORIS_TYPES.has(catalogType) ? (
                    <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                      <div>
                        <p className="text-xs font-medium text-gray-500">连接方式</p>
                        <label className="mr-4 inline-flex items-center gap-1 text-sm"><input type="radio" checked={connMode === "host"} onChange={() => setConnMode("host")} />主机名</label>
                        <label className="inline-flex items-center gap-1 text-sm"><input type="radio" checked={connMode === "jdbc"} onChange={() => setConnMode("jdbc")} />JDBC 连接</label>
                      </div>
                      {connMode === "host" ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.dorisHost")} *</label>
                            <input
                              value={form.host}
                              onChange={(e) => field("host", e.target.value)}
                              placeholder={intl.get("dataCatalog.form.dorisHostPlaceholder")}
                              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.port")} *</label>
                            <input
                              value={form.port}
                              onChange={(e) => field("port", e.target.value.replace(/[^\d]/g, ""))}
                              placeholder={intl.get("dataCatalog.form.portPlaceholder")}
                              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.jdbcUrl")} *</label>
                          <input
                            value={form.jdbcUrl}
                            onChange={(e) => field("jdbcUrl", e.target.value)}
                            placeholder={intl.get("dataCatalog.form.jdbcUrl")}
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.databaseName")} *</label>
                        <input
                          value={form.database}
                          onChange={(e) => field("database", e.target.value)}
                          placeholder={intl.get("dataCatalog.form.databaseNamePlaceholder")}
                          className={cx(
                            "mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-gray-950",
                            err && !form.database.trim() ? "border-red-400" : "border-gray-200 dark:border-gray-700"
                          )}
                        />
                        {err && !form.database.trim() ? <p className="mt-1 text-xs text-red-500">{intl.get("dataCatalog.form.databaseNameRequired")}</p> : null}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.username")}</label>
                          <input
                            value={form.username}
                            onChange={(e) => field("username", e.target.value)}
                            placeholder={intl.get("dataCatalog.form.usernamePlaceholder")}
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.password")}</label>
                          <input
                            type="password"
                            value={form.password}
                            onChange={(e) => field("password", e.target.value)}
                            placeholder={intl.get("dataCatalog.form.passwordPlaceholder")}
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.extraJdbcParams")}</label>
                        <input
                          value={form.extraJdbcParams}
                          onChange={(e) => field("extraJdbcParams", e.target.value)}
                          placeholder={intl.get("dataCatalog.form.extraJdbcParamsPlaceholder")}
                          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                        />
                      </div>
                    </div>
                  ) : null}

                  {catalogType === "hive" || catalogType === "hudi" ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.metastoreUri")}</label>
                      <input value={form.metastoreUri} onChange={(e) => field("metastoreUri", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                    </div>
                  ) : null}

                  {catalogType === "elasticsearch" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.esClusterUrl")}</label>
                        <input value={form.esClusterUrl} onChange={(e) => field("esClusterUrl", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.esAuthType")}</label>
                        <select value={form.esAuthType} onChange={(e) => field("esAuthType", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
                          <option value="none">None</option>
                          <option value="basic">Basic</option>
                          <option value="token">Token</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.esVersion")}</label>
                        <input value={form.esVersion} onChange={(e) => field("esVersion", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                      </div>
                    </div>
                  ) : null}

                  {catalogType === "iceberg" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.icebergCatalogType")}</label>
                        <select value={form.icebergCatalogType} onChange={(e) => field("icebergCatalogType", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
                          <option value="hive">Hive</option>
                          <option value="rest">REST</option>
                          <option value="glue">Glue</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.storageConfig")}</label>
                        <input value={form.storageConfig} onChange={(e) => field("storageConfig", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                      </div>
                    </div>
                  ) : null}

                  {catalogType === "paimon" ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.paimonWarehouse")}</label>
                      <input
                        value={form.storageConfig}
                        onChange={(e) => field("storageConfig", e.target.value)}
                        placeholder={intl.get("dataCatalog.form.paimonWarehousePlaceholder")}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                      />
                    </div>
                  ) : null}

                  {catalogType === "jdbc" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.driverClassName")}</label>
                        <input value={form.driverClassName} onChange={(e) => field("driverClassName", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.driverUrl")}</label>
                        <input value={form.driverUrl} onChange={(e) => field("driverUrl", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.jdbcUrl")}</label>
                        <input value={form.jdbcUrl} onChange={(e) => field("jdbcUrl", e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                      </div>
                    </div>
                  ) : null}

                  <details open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200">{intl.get("dataCatalog.form.advanced")}</summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.customParams")}</label>
                        <textarea value={form.customParams} onChange={(e) => field("customParams", e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-950" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.connectTimeout")}</label>
                        <input value={form.connectTimeout} onChange={(e) => field("connectTimeout", e.target.value.replace(/[^\d]/g, ""))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500">{intl.get("dataCatalog.form.maxConnections")}</label>
                        <input value={form.maxConnections} onChange={(e) => field("maxConnections", e.target.value.replace(/[^\d]/g, ""))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <input type="checkbox" checked={form.autoSync} onChange={(e) => field("autoSync", e.target.checked)} />
                        {intl.get("dataCatalog.form.autoSync")}
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <input type="checkbox" checked={form.hideSensitive} onChange={(e) => field("hideSensitive", e.target.checked)} />
                        {intl.get("dataCatalog.form.hideSensitive")}
                      </label>
                    </div>
                  </details>
                </div>
              ) : null}
            </section>
          </div>

          <div className="sticky bottom-0 border-t border-gray-200 bg-white px-6 py-3 dark:border-gray-800 dark:bg-gray-900">
            {err ? <p className="mb-2 text-xs text-red-600 dark:text-red-400">{err}</p> : null}
            {connectionTestResult ? (
              <div
                className={cx(
                  "mb-2 rounded-lg border px-3 py-2 text-sm",
                  connectionTestResult.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
                    : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                )}
              >
                <p className="font-semibold">
                  {connectionTestResult.ok
                    ? intl.get("dataCatalog.form.connectionTestOkTitle")
                    : intl.get("dataCatalog.form.connectionTestFailTitle")}
                </p>
                {connectionTestResult.message ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs opacity-95">{connectionTestResult.message}</p>
                ) : null}
                {connectionTestResult.latencyMs != null ? (
                  <p className="mt-1 text-xs opacity-80">{intl.get("dataCatalog.form.connectionTestLatency", { ms: connectionTestResult.latencyMs })}</p>
                ) : null}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {intl.get("dataCatalog.form.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleConnectionTest()}
                disabled={busy || testingConnection}
                className={cx(
                  "rounded-lg border border-gray-200 px-4 py-2 text-sm dark:border-gray-700",
                  (busy || testingConnection) && "pointer-events-none opacity-60"
                )}
              >
                {testingConnection ? intl.get("dataCatalog.form.connectionTestBusy") : intl.get("dataCatalog.form.connectionTest")}
              </button>
              <button
                type="submit"
                disabled={busy || testingConnection}
                className={cx(
                  "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-95",
                  (busy || testingConnection) && "pointer-events-none opacity-60"
                )}
              >
                {intl.get("dataCatalog.form.submit")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
