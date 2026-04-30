/**
 * 前端 catalogType → Apache Doris 4.x CREATE CATALOG PROPERTIES（事实源为 Doris FE Catalog）。
 *
 * 参考：Doris 4.x Data Catalog / CREATE CATALOG（hms、jdbc、es、iceberg、hudi、paimon、doris 等）
 */

/**
 * @param {string} catalogType
 * @returns {boolean}
 */
export function usesDorisNativeCatalog(catalogType) {
  const t = String(catalogType || "").trim().toLowerCase();
  return Boolean(t) && t !== "internal";
}

/**
 * @param {string} s
 * @returns {string}
 */
function trimStr(s) {
  return String(s ?? "").trim();
}

/**
 * @param {Record<string, unknown>} cfg
 * @returns {Record<string, string>}
 */
function jdbcPropsFromConnection(cfg) {
  const jdbcUrl = trimStr(cfg.jdbcUrl);
  const user = trimStr(cfg.username);
  const password = cfg.password != null ? String(cfg.password) : "";
  const driverClass = trimStr(cfg.driverClassName);
  const driverUrl = trimStr(cfg.driverUrl);
  if (!jdbcUrl) throw new Error("JDBC Catalog 需要 jdbcUrl（或主机+端口合成 jdbc:mysql://...）");
  if (!user) throw new Error("JDBC Catalog 需要 username");
  if (!driverClass) throw new Error("JDBC Catalog 需要 driverClassName（如 com.mysql.cj.jdbc.Driver）");
  if (!driverUrl) throw new Error("JDBC Catalog 需要 driverUrl（FE/BE 可访问的 jar URL 或 file:/// 路径）");
  let finalUrl = jdbcUrl;
  const extra = trimStr(cfg.extraJdbcParams);
  if (extra) finalUrl = `${jdbcUrl}${jdbcUrl.includes("?") ? "&" : "?"}${extra}`;
  return {
    type: "jdbc",
    user,
    password,
    jdbc_url: finalUrl,
    driver_class: driverClass,
    driver_url: driverUrl,
  };
}

/** catalogType → 默认 JDBC driver（可被表单覆盖） */
const JDBC_DEFAULTS = {
  mysql: { driver_class: "com.mysql.cj.jdbc.Driver", driver_url: "https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.33/mysql-connector-java-8.0.33.jar" },
  tidb: { driver_class: "com.mysql.cj.jdbc.Driver", driver_url: "https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.33/mysql-connector-java-8.0.33.jar" },
  doris: { driver_class: "com.mysql.cj.jdbc.Driver", driver_url: "https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.33/mysql-connector-java-8.0.33.jar" },
  postgresql: {
    driver_class: "org.postgresql.Driver",
    driver_url: "https://repo1.maven.org/maven2/org/postgresql/postgresql/42.7.3/postgresql-42.7.3.jar",
  },
  oracle: { driver_class: "oracle.jdbc.OracleDriver", driver_url: "" },
  sqlserver: {
    driver_class: "com.microsoft.sqlserver.jdbc.SQLServerDriver",
    driver_url: "https://repo1.maven.org/maven2/com/microsoft/sqlserver/mssql-jdbc/12.6.1.jre11/mssql-jdbc-12.6.1.jre11.jar",
  },
  clickhouse: {
    driver_class: "com.clickhouse.jdbc.ClickHouseDriver",
    driver_url: "https://repo1.maven.org/maven2/com/clickhouse/clickhouse-jdbc/0.6.0/clickhouse-jdbc-0.6.0-all.jar",
  },
  impala: { driver_class: "com.cloudera.impala.jdbc.Driver", driver_url: "" },
  starrocks: { driver_class: "com.mysql.cj.jdbc.Driver", driver_url: "https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.33/mysql-connector-java-8.0.33.jar" },
  redshift: { driver_class: "com.amazon.redshift.jdbc.Driver", driver_url: "" },
};

/**
 * 将 connectionConfig 与 catalogType 转为 Doris CREATE CATALOG PROPERTIES（键值均为字符串）
 * @param {string} catalogType
 * @param {Record<string, unknown>} connectionConfig
 * @returns {Record<string, string>}
 */
export function buildCreateCatalogProperties(catalogType, connectionConfig) {
  const t = String(catalogType || "").trim().toLowerCase();
  const cfg = connectionConfig && typeof connectionConfig === "object" ? connectionConfig : {};

  if (t === "hive") {
    const uris = trimStr(cfg.metastoreUri);
    if (!uris) throw new Error("Hive(HMS) Catalog 需要 metastoreUri（thrift://host:9083）");
    const props = { type: "hms", "hive.metastore.uris": uris };
    const storage = trimStr(cfg.storageConfig);
    if (storage) {
      try {
        const o = JSON.parse(storage);
        if (o && typeof o === "object") {
          for (const [k, v] of Object.entries(o)) {
            if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") props[k] = String(v);
          }
        }
      } catch {
        throw new Error("storageConfig 需为 JSON 字符串（可含 HDFS HA 等 Hadoop 属性）");
      }
    }
    return props;
  }

  if (t === "iceberg") {
    let warehouse = trimStr(cfg.icebergWarehouse || cfg.warehouse);
    const storage = trimStr(cfg.storageConfig);
    if (!warehouse && storage) {
      try {
        const o = JSON.parse(storage);
        if (o && typeof o === "object") {
          warehouse = trimStr(o.warehouse || o.WAREHOUSE || "");
        }
      } catch {
        /* 非 JSON 时当作 warehouse 字面量 */
        if (!warehouse) warehouse = storage;
      }
    }
    if (!warehouse) throw new Error("Iceberg Catalog 需要 warehouse（storageConfig JSON 内 warehouse 或纯文本路径）");
    const props = {
      type: "iceberg",
      "iceberg.catalog.type": trimStr(cfg.icebergCatalogType) || "hive",
      warehouse,
    };
    if (storage) {
      try {
        const o = JSON.parse(storage);
        if (o && typeof o === "object") {
          for (const [k, v] of Object.entries(o)) {
            if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") props[k] = String(v);
          }
        }
      } catch {
        /* 已把非 JSON 当作 warehouse */
      }
    }
    return props;
  }

  if (t === "hudi") {
    const uris = trimStr(cfg.metastoreUri);
    if (!uris) throw new Error("Hudi Catalog 需要 metastoreUri");
    return { type: "hudi", "hive.metastore.uris": uris };
  }

  if (t === "paimon") {
    let warehouse = trimStr(cfg.warehouse);
    const storage = trimStr(cfg.storageConfig);
    if (!warehouse && storage) {
      try {
        const o = JSON.parse(storage);
        if (o && typeof o === "object") warehouse = trimStr(o.warehouse || o.WAREHOUSE || "");
      } catch {
        if (!warehouse) warehouse = storage;
      }
    }
    if (!warehouse) throw new Error("Paimon Catalog 需要 warehouse（storageConfig 填写 warehouse 或路径）");
    return { type: "paimon", warehouse };
  }

  if (t === "elasticsearch") {
    const hosts = trimStr(cfg.esClusterUrl);
    if (!hosts) throw new Error("Elasticsearch Catalog 需要 esClusterUrl（如 http://host:9200）");
    const props = { type: "es", hosts };
    const ver = trimStr(cfg.esVersion);
    if (ver) props.es_version = ver;
    return props;
  }

  if (t === "jdbc") {
    return jdbcPropsFromConnection(cfg);
  }

  if (JDBC_DEFAULTS[t]) {
    const merged = {
      ...cfg,
      driverClassName: trimStr(cfg.driverClassName) || JDBC_DEFAULTS[t].driver_class,
      driverUrl: trimStr(cfg.driverUrl) || JDBC_DEFAULTS[t].driver_url,
    };
    if (!merged.driverUrl && t === "oracle") throw new Error("Oracle JDBC Catalog 需要填写 driverUrl（ojdbc jar 可访问 URL）");
    if (!merged.driverUrl && t === "impala") throw new Error("Impala JDBC Catalog 需要填写 driverUrl");
    if (!merged.driverUrl && t === "redshift") throw new Error("Redshift JDBC Catalog 需要填写 driverUrl");
    let jdbcUrl = trimStr(cfg.jdbcUrl);
    if (!jdbcUrl && cfg.host && cfg.port) {
      const host = trimStr(cfg.host);
      const port = trimStr(cfg.port);
      const db = trimStr(cfg.database);
      if (t === "mysql" || t === "tidb" || t === "doris" || t === "starrocks") {
        jdbcUrl = `jdbc:mysql://${host}:${port}/${db || ""}`;
      } else if (t === "postgresql") {
        jdbcUrl = `jdbc:postgresql://${host}:${port}/${db || "postgres"}`;
      } else if (t === "clickhouse") {
        jdbcUrl = `jdbc:clickhouse://${host}:${port}/${db || "default"}`;
      } else if (t === "sqlserver") {
        jdbcUrl = `jdbc:sqlserver://${host}:${port};databaseName=${db || "master"}`;
      } else if (t === "redshift") {
        jdbcUrl = `jdbc:redshift://${host}:${port}/${db || "dev"}`;
      }
    }
    return jdbcPropsFromConnection({ ...merged, jdbcUrl });
  }

  throw new Error(`暂不支持的 catalogType：${catalogType}（或请使用 jdbc 通用类型）`);
}
