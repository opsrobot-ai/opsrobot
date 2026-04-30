/**
 * 数据源 / 多 Catalog API（统一前缀 /api/catalog）
 * - 内置 internal 仅存内存
 * - 默认 DORIS_NATIVE_CATALOG=true：外部数据源以 Doris 原生 CREATE CATALOG 为事实源，扩展信息在 catalog_app_extension；元数据经 Doris SHOW DATABASES/TABLES 拉取
 * - DORIS_NATIVE_CATALOG=false：外部数据源仅走 catalog_registry（旧模式）
 * - 文件 / MongoDB BI 等无 Doris Catalog 的类型仍只写 catalog_registry
 * - CATALOG_GROUPS_MOCK=true：分组仅用内存
 * - CATALOG_REGISTRY_MOCK=true：不写 catalog_registry（与原生 Catalog 开关独立）
 * - 数据视图内存 Mock：VIEW_REGISTRY_MOCK 或 VITE_MOCK（见 isViewRegistryMockMode）
 */
import { randomUUID } from "node:crypto";
import net from "node:net";
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";
import { assertSafeSqlIdentifier, extractSourceCatalogs, normalizeViewQuerySql } from "./viewSqlGuard.mjs";
import {
  deleteMockDataView,
  getMockDataViewById,
  listMockDataViews,
  previewMockDataView,
  upsertMockDataView,
} from "./viewRegistryMock.mjs";
import { buildCreateCatalogProperties, usesDorisNativeCatalog } from "./catalogDorisPropertiesMapper.mjs";
import {
  alterDorisCatalogSetProperties,
  assertDorisCatalogName,
  createDorisCatalog,
  dropDorisCatalog,
  fetchMetaTreeViaDorisCatalog,
  fetchTablesInDatabaseViaDorisCatalog,
  formatDorisCatalogError,
  listDorisCatalogs,
} from "./dorisNativeCatalog.mjs";

/** @typedef {'internal'|'mysql'|'hive'|'iceberg'|'paimon'|'jdbc'|'elasticsearch'} CatalogType */
/** @typedef {'normal'|'error'|'disabled'} ConnectionStatus */

function nowIso() {
  return new Date().toISOString();
}

/** 内置 + 示例外部目录 */
function seedCatalogs() {
  return [
    {
      catalogId: "internal",
      catalogName: "internal",
      businessName: "internal",
      catalogType: "internal",
      catalogOrigin: "internal",
      connectionStatus: "normal",
      databaseCount: 2,
      tableCount: 5,
      lastSyncTime: nowIso(),
      createdBy: "system",
      createdAt: "2024-01-01T00:00:00.000Z",
      remark: "Doris 内置 Catalog，只读",
      enabled: true,
      connectionConfig: {},
    },
    {
      catalogId: randomUUID(),
      catalogName: "hive_prod",
      businessName: "hive_prod",
      catalogType: "hive",
      catalogOrigin: "external",
      connectionStatus: "normal",
      databaseCount: 3,
      tableCount: 42,
      lastSyncTime: nowIso(),
      createdBy: "admin",
      createdAt: nowIso(),
      remark: "生产 Hive 元数据",
      enabled: true,
      connectionConfig: { metastoreUri: "thrift://hive-metastore:9083" },
    },
    {
      catalogId: randomUUID(),
      catalogName: "mysql_ods",
      businessName: "mysql_ods",
      catalogType: "mysql",
      catalogOrigin: "external",
      connectionStatus: "error",
      databaseCount: 1,
      tableCount: 8,
      lastSyncTime: null,
      createdBy: "admin",
      createdAt: nowIso(),
      remark: "ODS 库 JDBC",
      enabled: true,
      connectionConfig: { jdbcUrl: "jdbc:mysql://mysql:3306/ods", user: "readonly" },
    },
  ];
}

let catalogs = seedCatalogs();

/** catalogId -> databaseName -> tableName[] */
const metaTree = {
  internal: {
    analytics: ["sessions_agg", "cost_daily"],
    warehouse: ["dim_user", "fact_order", "stg_events"],
  },
};

/** catalogId -> databaseName -> { remark, lastSyncTime } */
const dbMeta = {
  internal: {
    analytics: { remark: "分析域汇总库", lastSyncTime: nowIso() },
    warehouse: { remark: "数仓明细与维度", lastSyncTime: nowIso() },
  },
};

function ensureMetaTree(catalogId) {
  if (!metaTree[catalogId]) {
    const c = getCatalog(catalogId);
    const t = c ? String(c.catalogType || "").toLowerCase() : "";
    if (c && c.catalogOrigin !== "internal" && ["doris", "mysql", "tidb"].includes(t)) {
      metaTree[catalogId] = {};
    } else {
      metaTree[catalogId] = {
        default_db: [`tbl_${String(catalogId).slice(0, 6)}_a`, `tbl_${String(catalogId).slice(0, 6)}_b`],
      };
    }
  }
  const dbs = metaTree[catalogId];
  if (!dbMeta[catalogId]) dbMeta[catalogId] = {};
  for (const name of Object.keys(dbs)) {
    if (!dbMeta[catalogId][name]) {
      dbMeta[catalogId][name] = { remark: "", lastSyncTime: null };
    }
  }
  return dbs;
}

function getDbMetaRow(catalogId, databaseName) {
  if (!dbMeta[catalogId]) dbMeta[catalogId] = {};
  if (!dbMeta[catalogId][databaseName]) {
    dbMeta[catalogId][databaseName] = { remark: "", lastSyncTime: null };
  }
  return dbMeta[catalogId][databaseName];
}

function recalcCatalogCounts(catalogId) {
  const c = getCatalog(catalogId);
  if (!c) return;
  const dbs = metaTree[catalogId];
  if (!dbs) {
    c.databaseCount = 0;
    c.tableCount = 0;
    return;
  }
  c.databaseCount = Object.keys(dbs).length;
  c.tableCount = Object.values(dbs).reduce((sum, tables) => sum + (Array.isArray(tables) ? tables.length : 0), 0);
}

/** 反引号内安全的数据库名 */
function sqlIdentQuote(name) {
  return `\`${String(name).replace(/`/g, "")}\``;
}

/**
 * 从 catalog 连接配置构造 mysql2 连接参数（Doris / TiDB / MySQL 协议、内置 internal 走 .env Doris）
 * @param {{ catalogOrigin?: string, catalogType?: string, connectionConfig?: Record<string, unknown> }} c
 */
function buildMysqlLikeClientOptions(c) {
  const cfg = c.connectionConfig && typeof c.connectionConfig === "object" ? c.connectionConfig : {};
  const timeout = Math.min(Math.max(Number(cfg.connectTimeoutMs) || 20_000, 3000), 60_000);
  if (c.catalogOrigin === "internal") {
    const d = getDorisConfig();
    return {
      host: d.host,
      port: Number(d.port),
      user: d.user,
      password: d.password,
      database: d.database,
      connectTimeout: Math.min(Number(d.connectTimeout) || 25_000, 60_000),
    };
  }
  const t = String(c.catalogType || "").toLowerCase();
  if (cfg.host && cfg.port) {
    return {
      host: String(cfg.host),
      port: Number(cfg.port),
      user: cfg.username != null ? String(cfg.username) : "",
      password: cfg.password != null ? String(cfg.password) : "",
      database: cfg.database != null && String(cfg.database).trim() ? String(cfg.database) : undefined,
      connectTimeout: timeout,
    };
  }
  if ((t === "doris" || t === "mysql" || t === "tidb") && cfg.jdbcUrl) {
    const p = parseJdbcHostPort(String(cfg.jdbcUrl));
    if (!p) return null;
    return {
      host: p.host,
      port: p.port,
      user: cfg.username != null ? String(cfg.username) : "",
      password: cfg.password != null ? String(cfg.password) : "",
      database: cfg.database != null && String(cfg.database).trim() ? String(cfg.database) : undefined,
      connectTimeout: timeout,
    };
  }
  return null;
}

/**
 * 连接实例并拉取库表结构（SHOW DATABASES / SHOW TABLES）
 * @param {{ catalogOrigin?: string, catalogType?: string, connectionConfig?: Record<string, unknown> }} c
 * @returns {Promise<Record<string, string[]>>}
 */
async function fetchMysqlLikeMetaTree(c) {
  const opts = buildMysqlLikeClientOptions(c);
  if (!opts) {
    throw new Error("缺少连接参数：请配置主机与端口（或 JDBC URL）及账号");
  }
  const conn = await mysql.createConnection(opts);
  try {
    const [dbRows] = await conn.query("SHOW DATABASES");
    /** @type {Record<string, string[]>} */
    const tree = {};
    for (const row of dbRows) {
      const dbName = row.Database ?? row.database;
      if (!dbName) continue;
      const db = String(dbName);
      if (db === "information_schema") continue;
      const q = `SHOW TABLES FROM ${sqlIdentQuote(db)}`;
      try {
        const [tbRows] = await conn.query(q);
        const tables = [];
        for (const tb of tbRows) {
          const k = Object.keys(tb).find((x) => x.startsWith("Tables_in_")) || Object.keys(tb)[0];
          const tbn = k ? tb[k] : Object.values(tb)[0];
          if (tbn) tables.push(String(tbn));
        }
        tree[db] = tables;
      } catch {
        tree[db] = [];
      }
    }
    return tree;
  } finally {
    await conn.end();
  }
}

/**
 * 刷新单个库下的表名列表
 * @param {{ catalogOrigin?: string, catalogType?: string, connectionConfig?: Record<string, unknown> }} c
 * @param {string} databaseName
 */
async function fetchMysqlLikeTablesInDatabase(c, databaseName) {
  const opts = buildMysqlLikeClientOptions(c);
  if (!opts) throw new Error("缺少连接参数：请配置主机与端口（或 JDBC URL）及账号");
  const conn = await mysql.createConnection(opts);
  try {
    const [tbRows] = await conn.query(`SHOW TABLES FROM ${sqlIdentQuote(databaseName)}`);
    const tables = [];
    for (const tb of tbRows) {
      const k = Object.keys(tb).find((x) => x.startsWith("Tables_in_")) || Object.keys(tb)[0];
      const tbn = k ? tb[k] : Object.values(tb)[0];
      if (tbn) tables.push(String(tbn));
    }
    return tables;
  } finally {
    await conn.end();
  }
}

/**
 * 拉取单表字段与样例数据（真实源端）
 * @param {{ catalogOrigin?: string, catalogType?: string, connectionConfig?: Record<string, unknown> }} c
 * @param {string} databaseName
 * @param {string} tableName
 * @param {number} [limit=100]
 */
async function fetchMysqlLikeTablePreview(c, databaseName, tableName, page = 1, pageSize = 100) {
  const opts = buildMysqlLikeClientOptions(c);
  if (!opts) throw new Error("缺少连接参数：请配置主机与端口（或 JDBC URL）及账号");
  const p = Number.isFinite(Number(page)) ? Math.max(1, Number(page)) : 1;
  const size = Number.isFinite(Number(pageSize)) ? Math.max(1, Math.min(500, Number(pageSize))) : 100;
  const offset = (p - 1) * size;
  const conn = await mysql.createConnection(opts);
  try {
    const dbIdent = sqlIdentQuote(databaseName);
    const tbIdent = sqlIdentQuote(tableName);
    const [colRows] = await conn.query(`SHOW COLUMNS FROM ${dbIdent}.${tbIdent}`);
    const columns = (Array.isArray(colRows) ? colRows : []).map((r) => {
      const key = String(r.Key ?? r.key ?? "");
      return {
        columnName: String(r.Field ?? r.field ?? ""),
        dataType: String(r.Type ?? r.type ?? ""),
        isPrimaryKey: key.includes("PRI"),
        isPartitionKey: false,
        isBucketKey: false,
        nullable: String(r.Null ?? r.null ?? "").toUpperCase() === "YES",
        defaultValue: r.Default ?? r.default ?? null,
        comment: String(r.Comment ?? r.comment ?? ""),
      };
    });
    let total = 0;
    try {
      const [cntRows] = await conn.query(`SELECT COUNT(1) AS c FROM ${dbIdent}.${tbIdent}`);
      const cnt0 = Array.isArray(cntRows) && cntRows[0] ? cntRows[0] : {};
      total = Number(cnt0.c ?? cnt0.C ?? 0);
    } catch {
      total = 0;
    }
    const [rowRows] = await conn.query(`SELECT * FROM ${dbIdent}.${tbIdent} LIMIT ${size} OFFSET ${offset}`);
    const rows = Array.isArray(rowRows) ? rowRows : [];
    return {
      columns,
      rows,
      page: p,
      pageSize: size,
      total: total > 0 ? total : rows.length,
    };
  } finally {
    await conn.end();
  }
}

/**
 * 执行只读 SQL（SELECT / WITH / SHOW / DESC / EXPLAIN）
 * @param {{ catalogOrigin?: string, catalogType?: string, connectionConfig?: Record<string, unknown> }} c
 * @param {string} databaseName
 * @param {string} sql
 */
async function runMysqlLikeReadonlyQuery(c, databaseName, sql) {
  const opts = buildMysqlLikeClientOptions(c);
  if (!opts) throw new Error("缺少连接参数：请配置主机与端口（或 JDBC URL）及账号");
  const raw = String(sql || "").trim().replace(/;+$/g, "");
  if (!raw) throw new Error("SQL 不能为空");
  if (raw.includes(";")) throw new Error("仅支持单条 SQL");
  if (!/^(select|with|show|desc|describe|explain)\b/i.test(raw)) {
    throw new Error("仅支持只读查询（SELECT/WITH/SHOW/DESC/EXPLAIN）");
  }
  let finalSql = raw;
  if (/^(select|with)\b/i.test(raw) && !/\blimit\s+\d+\b/i.test(raw)) {
    finalSql = `${raw} LIMIT 500`;
  }
  const conn = await mysql.createConnection({ ...opts, database: databaseName });
  try {
    const [rows, fields] = await conn.query(finalSql);
    let columns = [];
    if (Array.isArray(fields) && fields.length > 0) {
      columns = fields.map((f) => ({
        columnName: String(f.name || ""),
        dataType: String(f.columnType ?? ""),
      }));
    } else if (Array.isArray(rows) && rows[0] && typeof rows[0] === "object") {
      columns = Object.keys(rows[0]).map((k) => ({ columnName: k, dataType: "" }));
    }
    return {
      sql: finalSql,
      columns,
      rows: Array.isArray(rows) ? rows : [],
    };
  } finally {
    await conn.end();
  }
}

async function listDataViews({ page, pageSize, viewName, status, viewGroupKey }) {
  if (isViewRegistryMockMode()) {
    logViewRegistryMockModeOnce();
    const out = await listMockDataViews({ page, pageSize, viewName, status });
    const key = String(viewGroupKey || "").trim();
    if (!key || key === "__all__") return out;
    const assignments = (mockViewGroupStore && mockViewGroupStore.assignments) || {};
    const hasGroup = (viewId) => Boolean(assignments[String(viewId)]);
    if (key === "__ungrouped__") {
      const filtered = (out.list || []).filter((r) => !hasGroup(r.viewId));
      return { list: filtered, total: filtered.length };
    }
    const filtered = (out.list || []).filter((r) => String(assignments[String(r.viewId)] || "") === key);
    return { list: filtered, total: filtered.length };
  }
  await ensureGroupTables();
  return withCatalogDb(async (conn) => {
    const nameQ = String(viewName || "").trim().toLowerCase();
    const statusQ = String(status || "").trim();
    const whereParts = [];
    const params = [];
    if (nameQ) {
      whereParts.push("LOWER(view_name) LIKE ?");
      params.push(`%${nameQ}%`);
    }
    if (statusQ) {
      whereParts.push("status = ?");
      params.push(statusQ);
    }
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
    const [cntRows] = await conn.query(`SELECT COUNT(1) AS c FROM view_registry ${whereSql}`, params);
    const cnt0 = Array.isArray(cntRows) && cntRows[0] ? cntRows[0] : {};
    const total = Number(cnt0.c ?? cnt0.C ?? 0) || 0;
    const start = Math.max(0, (page - 1) * pageSize);
    const listParams = [...params, pageSize, start];
    const [rows] = await conn.query(
      `SELECT
        view_id AS viewId,
        view_name AS viewName,
        target_database AS targetDatabase,
        view_type AS viewType,
        status,
        source_catalogs_json AS sourceCatalogsJson,
        created_by AS createdBy,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM view_registry
      ${whereSql}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?`,
      listParams
    );
    const all = Array.isArray(rows) ? rows : [];
    const list = all.map((r) => ({
      ...r,
      sourceCatalogs: (() => {
        try {
          const parsed = JSON.parse(String(r.sourceCatalogsJson || "[]"));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
    }));

    const key = String(viewGroupKey || "").trim();
    if (!key || key === "__all__") return { list, total };
    try {
      await ensureViewGroupTables();
      if (key === "__ungrouped__") {
        const [assignedRows] = await conn.query(
          "SELECT DISTINCT view_id FROM view_group_assignments WHERE group_id IS NOT NULL AND view_id IS NOT NULL"
        );
        const ids = (Array.isArray(assignedRows) ? assignedRows : [])
          .map((r) => String(r.view_id ?? r.viewId ?? ""))
          .filter(Boolean);
        const assignedSet = new Set(ids);
        const filtered = list.filter((r) => !assignedSet.has(String(r.viewId)));
        return { list: filtered, total: filtered.length };
      }
      const [assignedRows] = await conn.query("SELECT view_id FROM view_group_assignments WHERE group_id = ?", [key]);
      const ids = (Array.isArray(assignedRows) ? assignedRows : [])
        .map((r) => String(r.view_id ?? r.viewId ?? ""))
        .filter(Boolean);
      const assignedSet = new Set(ids);
      const filtered = list.filter((r) => assignedSet.has(String(r.viewId)));
      return { list: filtered, total: filtered.length };
    } catch {
      return { list, total };
    }
  });
}

async function getDataViewById(viewId) {
  if (isViewRegistryMockMode()) {
    return getMockDataViewById(viewId);
  }
  await ensureGroupTables();
  return withCatalogDb(async (conn) => {
    const [rows] = await conn.query(
      `SELECT
        view_id AS viewId,
        view_name AS viewName,
        target_database AS targetDatabase,
        view_type AS viewType,
        status,
        view_sql AS viewSql,
        source_catalogs_json AS sourceCatalogsJson,
        created_by AS createdBy,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM view_registry
      WHERE view_id = ?
      LIMIT 1`,
      [viewId]
    );
    if (!Array.isArray(rows) || !rows[0]) return null;
    const row = rows[0];
    return {
      ...row,
      sourceCatalogs: (() => {
        try {
          const parsed = JSON.parse(String(row.sourceCatalogsJson || "[]"));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
    };
  });
}

async function listAllDataViewsForTree(viewName) {
  if (isViewRegistryMockMode()) {
    logViewRegistryMockModeOnce();
    const out = await listMockDataViews({ page: 1, pageSize: 5000, viewName, status: "" });
    return Array.isArray(out.list) ? out.list : [];
  }
  await ensureGroupTables();
  return withCatalogDb(async (conn) => {
    const nameQ = String(viewName || "").trim().toLowerCase();
    const whereParts = [];
    const params = [];
    if (nameQ) {
      whereParts.push("LOWER(view_name) LIKE ?");
      params.push(`%${nameQ}%`);
    }
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
    const [rows] = await conn.query(
      `SELECT
        view_id AS viewId,
        view_name AS viewName,
        target_database AS targetDatabase,
        view_type AS viewType,
        status,
        created_by AS createdBy,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM view_registry
      ${whereSql}
      ORDER BY updated_at DESC
      LIMIT 5000`,
      params
    );
    return Array.isArray(rows) ? rows : [];
  });
}

/**
 * @param {{ viewId: string, viewName: string, targetDatabase: string, viewSql: string, viewType?: string, status?: string, createdBy?: string, previous?: { viewName: string, targetDatabase: string } | null }} p
 */
async function createOrReplaceDataView({ viewId, viewName, targetDatabase, viewSql, viewType, status, createdBy, previous = null }) {
  const safeViewName = String(viewName || "").trim();
  const safeTargetDb = String(targetDatabase || "").trim();
  const safeSql = normalizeViewQuerySql(viewSql);
  assertSafeSqlIdentifier(safeViewName, "视图名称");
  assertSafeSqlIdentifier(safeTargetDb, "目标数据库");
  const sourceCatalogs = extractSourceCatalogs(safeSql);
  if (isViewRegistryMockMode()) {
    const ts = nowIso();
    upsertMockDataView({
      viewId,
      viewName: safeViewName,
      targetDatabase: safeTargetDb,
      viewType: String(viewType || "logical"),
      status: String(status || "active"),
      viewSql: safeSql,
      sourceCatalogs,
      createdBy: String(createdBy || "currentUser"),
      createdAt: ts,
      updatedAt: ts,
    });
    return;
  }
  await ensureGroupTables();
  await withCatalogDb(async (conn) => {
    if (previous && (previous.viewName !== safeViewName || previous.targetDatabase !== safeTargetDb)) {
      await conn.query(
        `DROP VIEW IF EXISTS ${sqlIdentQuote(String(previous.targetDatabase))}.${sqlIdentQuote(String(previous.viewName))}`
      );
    }
    await conn.query(`CREATE DATABASE IF NOT EXISTS ${sqlIdentQuote(safeTargetDb)}`);
    await conn.query(`DROP VIEW IF EXISTS ${sqlIdentQuote(safeTargetDb)}.${sqlIdentQuote(safeViewName)}`);
    await conn.query(`CREATE VIEW ${sqlIdentQuote(safeTargetDb)}.${sqlIdentQuote(safeViewName)} AS ${safeSql}`);
    await conn.query(
      `DELETE FROM view_registry WHERE view_id = ?`,
      [viewId]
    );
    await conn.query(
      `INSERT INTO view_registry (
        view_id, view_name, target_database, view_type, status, view_sql, source_catalogs_json, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        viewId,
        safeViewName,
        safeTargetDb,
        String(viewType || "logical"),
        String(status || "active"),
        safeSql,
        JSON.stringify(sourceCatalogs),
        String(createdBy || "currentUser"),
      ]
    );
  });
}

async function deleteDataView(viewId) {
  if (isViewRegistryMockMode()) {
    return deleteMockDataView(viewId);
  }
  const row = await getDataViewById(viewId);
  if (!row) return false;
  await withCatalogDb(async (conn) => {
    await conn.query(`DROP VIEW IF EXISTS ${sqlIdentQuote(row.targetDatabase)}.${sqlIdentQuote(row.viewName)}`);
    await conn.query(`DELETE FROM view_registry WHERE view_id = ?`, [viewId]);
  });
  return true;
}

async function previewDataView(viewId, page = 1, pageSize = 100) {
  const row = await getDataViewById(viewId);
  if (!row) throw new Error("view not found");
  const p = Number.isFinite(Number(page)) ? Math.max(1, Number(page)) : 1;
  const size = Number.isFinite(Number(pageSize)) ? Math.max(1, Math.min(500, Number(pageSize))) : 100;
  if (isViewRegistryMockMode()) {
    return previewMockDataView(viewId, p, size);
  }
  const offset = (p - 1) * size;
  return withCatalogDb(async (conn) => {
    let total = 0;
    try {
      const [cntRows] = await conn.query(
        `SELECT COUNT(1) AS c FROM ${sqlIdentQuote(row.targetDatabase)}.${sqlIdentQuote(row.viewName)}`
      );
      const first = Array.isArray(cntRows) && cntRows[0] ? cntRows[0] : {};
      total = Number(first.c ?? first.C ?? 0) || 0;
    } catch {
      total = 0;
    }
    const [rows, fields] = await conn.query(
      `SELECT * FROM ${sqlIdentQuote(row.targetDatabase)}.${sqlIdentQuote(row.viewName)} LIMIT ${size} OFFSET ${offset}`
    );
    const columns = Array.isArray(fields)
      ? fields.map((f) => ({ columnName: String(f.name || ""), dataType: String(f.columnType ?? "") }))
      : [];
    return {
      ...row,
      columns,
      rows: Array.isArray(rows) ? rows : [],
      page: p,
      pageSize: size,
      total,
    };
  });
}

async function fetchMysqlLikeTableDetail(c, databaseName, tableName) {
  const opts = buildMysqlLikeClientOptions(c);
  if (!opts) throw new Error("缺少连接参数：请配置主机与端口（或 JDBC URL）及账号");
  const conn = await mysql.createConnection(opts);
  try {
    const db = String(databaseName);
    const tb = String(tableName);
    /** @type {Record<string, any>} */
    let info = {};
    try {
      const [infoRows] = await conn.query(
        `SELECT
          TABLE_ROWS AS rowCount,
          DATA_LENGTH AS dataLength,
          INDEX_LENGTH AS indexLength,
          CREATE_TIME AS createdAt,
          UPDATE_TIME AS updatedAt,
          ENGINE AS storageEngine,
          TABLE_TYPE AS tableType,
          TABLE_COMMENT AS tableComment
        FROM information_schema.tables
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        LIMIT 1`,
        [db, tb]
      );
      info = Array.isArray(infoRows) && infoRows[0] ? infoRows[0] : {};
    } catch {
      info = {};
    }

    let fieldCount = 0;
    try {
      const [colRows] = await conn.query(`SHOW COLUMNS FROM ${sqlIdentQuote(db)}.${sqlIdentQuote(tb)}`);
      fieldCount = Array.isArray(colRows) ? colRows.length : 0;
    } catch {
      fieldCount = 0;
    }

    let partitionCount = 0;
    try {
      const [pRows] = await conn.query(
        `SELECT COUNT(1) AS c
         FROM information_schema.partitions
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND PARTITION_NAME IS NOT NULL`,
        [db, tb]
      );
      const p0 = Array.isArray(pRows) && pRows[0] ? pRows[0] : {};
      partitionCount = Number(p0.c ?? 0);
      if (!Number.isFinite(partitionCount)) partitionCount = 0;
    } catch {
      partitionCount = 0;
    }

    const rowCount = Number(info.rowCount ?? 0);
    const dataLength = Number(info.dataLength ?? 0);
    const indexLength = Number(info.indexLength ?? 0);
    const storageSizeBytes = dataLength + indexLength;
    const storageSizeMB = storageSizeBytes > 0 ? storageSizeBytes / 1024 / 1024 : 0;
    const storageFormat = String(info.tableType ?? info.storageFormat ?? "").trim() || "—";
    const storageEngine = String(info.storageEngine ?? "").trim() || "—";
    const tableComment = String(info.tableComment ?? "").trim();

    const createdAt = info.createdAt ? String(info.createdAt) : null;
    const updatedAt = info.updatedAt ? String(info.updatedAt) : null;

    const catalogType = String(c.catalogType || "").toLowerCase();
    const dataModel =
      catalogType === "doris" || c.catalogOrigin === "internal" ? String(info.tableType ?? "").trim() || "—" : null;

    return {
      catalogType: String(c.catalogType || ""),
      storageEngine,
      dataModel,
      fieldCount,
      partitionCount,
      rowCount: Number.isFinite(rowCount) ? rowCount : 0,
      storageSizeBytes,
      storageSizeMB,
      lastUpdatedAt: updatedAt,
      storageFormat,
      tableRemark: tableComment || `${db}.${tb}`,
      createdAt,
    };
  } finally {
    await conn.end();
  }
}

function isMysqlLikeCatalog(c) {
  if (!c) return false;
  const t = String(c.catalogType || "").toLowerCase();
  return c.catalogOrigin === "internal" || ["doris", "mysql", "tidb"].includes(t);
}

function sanitizeConnectionConfigForClient(cfg, hideSensitive) {
  const raw = cfg && typeof cfg === "object" ? cfg : {};
  const out = { ...raw };
  const hide = hideSensitive !== false;
  if (hide) {
    if ("password" in out) out.password = out.password ? "******" : "";
    if ("secret" in out) out.secret = "******";
    if ("accessKey" in out) out.accessKey = out.accessKey ? "******" : "";
    if ("secretKey" in out) out.secretKey = out.secretKey ? "******" : "";
    if ("token" in out) out.token = out.token ? "******" : "";
  }
  return out;
}

let groupTablesReadyPromise = null;
/** 为 true 时数据源分组 API 走内存 mock，不读写 Doris 分组表（不再绑定 VITE_MOCK，避免前端 Mock 误关分组持久化） */
const catalogGroupsMemoryOnly = String(process.env.CATALOG_GROUPS_MOCK || "").toLowerCase() === "true";

/** @type {Promise<void> | null} */
let viewGroupTablesReadyPromise = null;
/** @type {{ groups: Array<{groupId:string,groupName:string,displayOrder:number}>, assignments: Record<string,string> }} */
let mockViewGroupStore = { groups: [], assignments: {} };

async function ensureViewGroupTables() {
  if (viewGroupTablesReadyPromise) return viewGroupTablesReadyPromise;
  viewGroupTablesReadyPromise = withCatalogDb(async (conn) => {
    await ensureGroupTables();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS view_groups (
        group_id VARCHAR(64) NOT NULL,
        group_name VARCHAR(128) NOT NULL,
        display_order BIGINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )
      UNIQUE KEY(group_id)
      DISTRIBUTED BY HASH(group_id) BUCKETS 1
      PROPERTIES ("replication_num" = "1")
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS view_group_assignments (
        view_id VARCHAR(64) NOT NULL,
        group_id VARCHAR(64) NULL,
        updated_at DATETIME NOT NULL
      )
      UNIQUE KEY(view_id)
      DISTRIBUTED BY HASH(view_id) BUCKETS 1
      PROPERTIES ("replication_num" = "1")
    `);
  });
  try {
    return await viewGroupTablesReadyPromise;
  } catch {
    viewGroupTablesReadyPromise = null;
    throw new Error("ensure view group tables failed");
  }
}

async function listViewGroupsWithAssignments() {
  await ensureViewGroupTables();
  return withCatalogDb(async (conn) => {
    const [groups] = await conn.query(
      "SELECT group_id AS groupId, group_name AS groupName, display_order AS displayOrder FROM view_groups ORDER BY display_order ASC, group_name ASC"
    );
    const [as] = await conn.query("SELECT view_id AS viewId, group_id AS groupId FROM view_group_assignments");
    const map = {};
    for (const r of Array.isArray(as) ? as : []) {
      if (r.viewId && r.groupId) map[String(r.viewId)] = String(r.groupId);
    }
    return { groups: Array.isArray(groups) ? groups : [], assignments: map };
  });
}

function ensureMockViewGroupsSeeded() {
  if (mockViewGroupStore.groups.length > 0) return;
  mockViewGroupStore = {
    groups: [
      { groupId: "vg_default_1", groupName: "示例分组", displayOrder: 1 },
      { groupId: "vg_default_2", groupName: "指标分组", displayOrder: 2 },
    ],
    assignments: {},
  };
}

function listMockViewGroupsWithAssignments() {
  ensureMockViewGroupsSeeded();
  return {
    groups: [...mockViewGroupStore.groups].sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0)),
    assignments: { ...(mockViewGroupStore.assignments || {}) },
  };
}

function createMockViewGroup(groupName, displayOrder) {
  ensureMockViewGroupsSeeded();
  const row = {
    groupId: randomUUID(),
    groupName: String(groupName || "").trim() || "未命名",
    displayOrder: Number.isFinite(Number(displayOrder)) ? Number(displayOrder) : Date.now(),
  };
  mockViewGroupStore.groups.push(row);
  return row;
}

function updateMockViewGroup(groupId, groupName) {
  ensureMockViewGroupsSeeded();
  const idx = mockViewGroupStore.groups.findIndex((g) => g.groupId === groupId);
  if (idx < 0) return false;
  mockViewGroupStore.groups[idx] = { ...mockViewGroupStore.groups[idx], groupName: String(groupName || "").trim() || mockViewGroupStore.groups[idx].groupName };
  return true;
}

function deleteMockViewGroup(groupId) {
  ensureMockViewGroupsSeeded();
  mockViewGroupStore.groups = mockViewGroupStore.groups.filter((g) => g.groupId !== groupId);
  for (const k of Object.keys(mockViewGroupStore.assignments || {})) {
    if (mockViewGroupStore.assignments[k] === groupId) delete mockViewGroupStore.assignments[k];
  }
}

function setMockViewGroupAssignment(viewId, groupId) {
  ensureMockViewGroupsSeeded();
  const vid = String(viewId || "");
  if (!vid) return;
  if (!groupId) {
    delete mockViewGroupStore.assignments[vid];
    return;
  }
  mockViewGroupStore.assignments[vid] = String(groupId);
}
/** 为 true 时 catalog_registry 数据源持久化关闭（默认 false，写入 Doris） */
const catalogRegistryMemoryOnly = String(process.env.CATALOG_REGISTRY_MOCK || "").toLowerCase() === "true";
/** 为 false 时关闭 Doris 原生 Catalog 路径，仅使用 catalog_registry（兼容旧环境与权限不足账号） */
function useNativeDorisCatalogStorage() {
  if (catalogRegistryMemoryOnly) return false;
  return String(process.env.DORIS_NATIVE_CATALOG || "true").trim().toLowerCase() !== "false";
}

/**
 * @param {string} dorisType
 * @returns {string}
 */
function mapDorisCatalogTypeToApp(dorisType) {
  const t = String(dorisType || "").trim().toLowerCase();
  if (t === "hms" || t === "hive") return "hive";
  if (t === "es" || t === "elasticsearch") return "elasticsearch";
  if (t === "jdbc") return "mysql";
  if (t === "iceberg") return "iceberg";
  if (t === "hudi") return "hudi";
  if (t === "paimon") return "paimon";
  if (t === "doris") return "doris";
  return t || "jdbc";
}
/** 为 true 时数据视图 API 使用内存示例（5 条，含 192.168.64.239 跨源示例），不写 Doris */
/** 数据视图走内存示例：显式开关，或与前端 VITE_MOCK 联用（开发常见只开后者） */
function isViewRegistryMockMode() {
  const v = String(process.env.VIEW_REGISTRY_MOCK || "")
    .trim()
    .toLowerCase();
  if (["true", "1", "yes", "on"].includes(v)) return true;
  if (String(process.env.VITE_MOCK || "")
    .trim()
    .toLowerCase() === "true") {
    return true;
  }
  return false;
}

let loggedViewRegistryMockMode = false;
function logViewRegistryMockModeOnce() {
  if (loggedViewRegistryMockMode) return;
  loggedViewRegistryMockMode = true;
  const vm = String(process.env.VIEW_REGISTRY_MOCK || "").trim().toLowerCase();
  const vmOn = ["true", "1", "yes", "on"].includes(vm);
  const viteOn = String(process.env.VITE_MOCK || "").trim().toLowerCase() === "true";
  const reason = vmOn ? `VIEW_REGISTRY_MOCK=${String(process.env.VIEW_REGISTRY_MOCK || "").trim()}` : viteOn ? "VITE_MOCK=true" : "env";
  console.log(`[catalog/views] 使用内存 Mock（${reason}），不写 Doris view_registry`);
}

/** @type {{ groups: Array<{groupId:string,groupName:string,displayOrder:number}>, assignments: Record<string,string> }} */
let mockGroupStore = { groups: [], assignments: {} };

function getCatalogDbConfig() {
  const cfg = getDorisConfig();
  return {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || "opsRobot",
    connectTimeout: 25_000,
  };
}

async function withCatalogDb(fn) {
  const conn = await mysql.createConnection(getCatalogDbConfig());
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

async function ensureGroupTables() {
  if (groupTablesReadyPromise) return groupTablesReadyPromise;
  groupTablesReadyPromise = withCatalogDb(async (conn) => {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_groups (
        group_id VARCHAR(64) NOT NULL,
        group_name VARCHAR(128) NOT NULL,
        display_order BIGINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )
      UNIQUE KEY(group_id)
      DISTRIBUTED BY HASH(group_id) BUCKETS 1
      PROPERTIES ("replication_num" = "1")
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_group_assignments (
        catalog_id VARCHAR(64) NOT NULL,
        group_id VARCHAR(64) NULL,
        updated_at DATETIME NOT NULL
      )
      UNIQUE KEY(catalog_id)
      DISTRIBUTED BY HASH(catalog_id) BUCKETS 1
      PROPERTIES ("replication_num" = "1")
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_registry (
        catalog_id VARCHAR(64) NOT NULL,
        catalog_name VARCHAR(256) NOT NULL,
        catalog_type VARCHAR(64) NOT NULL,
        catalog_origin VARCHAR(32) NOT NULL DEFAULT 'external',
        connection_status VARCHAR(32) NOT NULL DEFAULT 'normal',
        database_count INT NOT NULL DEFAULT 0,
        table_count INT NOT NULL DEFAULT 0,
        last_sync_time VARCHAR(64) NULL,
        created_by VARCHAR(128) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL,
        remark VARCHAR(2048) NOT NULL DEFAULT '',
        enabled TINYINT NOT NULL DEFAULT 1,
        connection_config_json STRING NOT NULL,
        meta_snapshot_json STRING NULL
      )
      UNIQUE KEY(catalog_id)
      DISTRIBUTED BY HASH(catalog_id) BUCKETS 1
      PROPERTIES ("replication_num" = "1")
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS view_registry (
        view_id VARCHAR(64) NOT NULL,
        view_name VARCHAR(128) NOT NULL,
        target_database VARCHAR(128) NOT NULL,
        view_type VARCHAR(32) NOT NULL DEFAULT 'logical',
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        view_sql STRING NOT NULL,
        source_catalogs_json STRING NULL,
        created_by VARCHAR(128) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )
      UNIQUE KEY(view_id)
      DISTRIBUTED BY HASH(view_id) BUCKETS 1
      PROPERTIES ("replication_num" = "1")
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_app_extension (
        catalog_name VARCHAR(256) NOT NULL,
        business_name VARCHAR(256) NOT NULL DEFAULT '',
        catalog_type VARCHAR(64) NOT NULL,
        remark VARCHAR(2048) NOT NULL DEFAULT '',
        connection_config_json STRING NOT NULL,
        meta_snapshot_json STRING NULL,
        created_by VARCHAR(128) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )
      UNIQUE KEY(catalog_name)
      DISTRIBUTED BY HASH(catalog_name) BUCKETS 1
      PROPERTIES ("replication_num" = "1")
    `);
    try {
      await conn.query("ALTER TABLE catalog_app_extension ADD COLUMN business_name VARCHAR(256) NOT NULL DEFAULT ''");
    } catch {
      /* ignore: 已存在或权限不足 */
    }
    try {
      await conn.query("ALTER TABLE catalog_group_assignments MODIFY COLUMN catalog_id VARCHAR(256) NOT NULL");
    } catch {
      /* 已扩容或权限不足时忽略 */
    }
    const [cntRows] = await conn.query("SELECT COUNT(1) AS c FROM catalog_groups");
    const cnt0 = Array.isArray(cntRows) && cntRows[0] ? cntRows[0] : {};
    if (Number(cnt0.c ?? cnt0.C ?? 0) === 0) {
      await conn.query(
        `INSERT INTO catalog_groups (group_id, group_name, display_order, created_at, updated_at) VALUES (?, ?, 1, NOW(), NOW()), (?, ?, 2, NOW(), NOW())`,
        ["g_default_core", "核心数据源", "g_default_external", "外部数据源"]
      );
    }
  });
  try {
    return await groupTablesReadyPromise;
  } catch (e) {
    groupTablesReadyPromise = null;
    throw e;
  }
}

async function listCatalogGroupsWithAssignments() {
  await ensureGroupTables();
  return withCatalogDb(async (conn) => {
    const [groups] = await conn.query(
      "SELECT group_id AS groupId, group_name AS groupName, display_order AS displayOrder FROM catalog_groups ORDER BY display_order ASC, group_name ASC"
    );
    const [assignments] = await conn.query(
      "SELECT catalog_id AS catalogId, group_id AS groupId FROM catalog_group_assignments"
    );
    /** @type {Record<string, string>} */
    const map = {};
    for (const r of assignments) {
      if (r.catalogId && r.groupId) map[String(r.catalogId)] = String(r.groupId);
    }
    return { groups, assignments: map };
  });
}

function ensureMockGroupStoreSeeded() {
  if (mockGroupStore.groups.length > 0) return;
  const defaultGroups = [
    { groupId: "g_default_core", groupName: "核心数据源", displayOrder: 1 },
    { groupId: "g_default_external", groupName: "外部数据源", displayOrder: 2 },
  ];
  /** @type {Record<string,string>} */
  const assignments = {};
  for (const c of catalogs) {
    if (c.catalogName === "internal") assignments[c.catalogId] = "g_default_core";
    else if (c.catalogOrigin === "external") assignments[c.catalogId] = "g_default_external";
  }
  mockGroupStore = { groups: defaultGroups, assignments };
}

function listMockGroupsWithAssignments() {
  ensureMockGroupStoreSeeded();
  return {
    groups: [...mockGroupStore.groups].sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0)),
    assignments: { ...mockGroupStore.assignments },
  };
}

function createMockGroup(groupName, displayOrder) {
  ensureMockGroupStoreSeeded();
  const row = {
    groupId: randomUUID(),
    groupName: String(groupName || "").trim() || "未命名",
    displayOrder: Number.isFinite(Number(displayOrder)) ? Number(displayOrder) : Date.now(),
  };
  mockGroupStore.groups.push(row);
  return row;
}

function updateMockGroup(groupId, groupName) {
  ensureMockGroupStoreSeeded();
  const idx = mockGroupStore.groups.findIndex((g) => g.groupId === groupId);
  if (idx < 0) return false;
  mockGroupStore.groups[idx] = { ...mockGroupStore.groups[idx], groupName: String(groupName || "").trim() || mockGroupStore.groups[idx].groupName };
  return true;
}

function deleteMockGroup(groupId) {
  ensureMockGroupStoreSeeded();
  mockGroupStore.groups = mockGroupStore.groups.filter((g) => g.groupId !== groupId);
  for (const k of Object.keys(mockGroupStore.assignments)) {
    if (mockGroupStore.assignments[k] === groupId) delete mockGroupStore.assignments[k];
  }
}

function setMockGroupAssignment(catalogId, groupId) {
  ensureMockGroupStoreSeeded();
  if (!groupId) {
    delete mockGroupStore.assignments[catalogId];
    return;
  }
  mockGroupStore.assignments[catalogId] = groupId;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 2_000_000) {
        reject(new Error("body too large"));
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/** @param {string} host @param {number} port @param {number} timeoutMs */
function tcpProbe(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: Number(port) }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** @param {string} uri */
function parseThriftMetastore(uri) {
  const m = String(uri || "").trim().match(/^thrift:\/\/([^:/]+):(\d+)/i);
  if (!m) return null;
  return { host: m[1], port: Number(m[2]) };
}

/** @param {string} jdbcUrl */
function parseJdbcHostPort(jdbcUrl) {
  const u = String(jdbcUrl || "").trim();
  const patterns = [
    [/jdbc:mysql:\/\/([^/?;:]+)(?::(\d+))?/i, 3306],
    [/jdbc:mariadb:\/\/([^/?;:]+)(?::(\d+))?/i, 3306],
    [/jdbc:postgresql:\/\/([^/?;:]+)(?::(\d+))?/i, 5432],
    [/jdbc:sqlserver:\/\/([^/?;:]+)(?::(\d+))?/i, 1433],
  ];
  for (const [re, defaultPort] of patterns) {
    const m = u.match(re);
    if (m) return { host: m[1], port: m[2] ? Number(m[2]) : defaultPort };
  }
  return null;
}

/**
 * 新建/编辑数据源前的连接探测（按类型尽力而为：MySQL 协议执行 SELECT 1，其余多为 TCP/HTTP）。
 * @param {string} catalogType
 * @param {Record<string, unknown>} cfg
 */
async function runDraftConnectionTest(catalogType, cfg) {
  const started = Date.now();
  const latency = () => Date.now() - started;
  const t = String(catalogType || "").toLowerCase();
  const timeout = Math.min(Math.max(Number(cfg.connectTimeoutMs) || 5000, 1000), 20_000);

  if (t === "internal") {
    return { ok: true, message: "内置目录无需连接测试", latencyMs: latency() };
  }

  // Doris：JDBC 连接串模式（TCP 或解析失败时的提示）
  if (t === "doris" && cfg.connectionMode === "jdbc" && cfg.jdbcUrl) {
    const parsed = parseJdbcHostPort(String(cfg.jdbcUrl));
    if (!parsed) {
      return { ok: false, message: "无法从 JDBC URL 解析主机与端口", latencyMs: latency() };
    }
    const ok = await tcpProbe(parsed.host, parsed.port, timeout);
    return ok
      ? { ok: true, message: `JDBC 地址 TCP 可达（${parsed.host}:${parsed.port}）`, latencyMs: latency() }
      : { ok: false, message: `无法在超时内连接 ${parsed.host}:${parsed.port}`, latencyMs: latency() };
  }

  if (t === "postgresql" && cfg.jdbcUrl && !cfg.host) {
    const parsed = parseJdbcHostPort(String(cfg.jdbcUrl));
    if (!parsed) {
      return { ok: false, message: "无法从 JDBC URL 解析主机与端口", latencyMs: latency() };
    }
    const ok = await tcpProbe(parsed.host, parsed.port, timeout);
    return ok
      ? {
          ok: true,
          message: `PostgreSQL 端口 TCP 可达（${parsed.host}:${parsed.port}）。未校验用户名密码。`,
          latencyMs: latency(),
        }
      : { ok: false, message: `无法在超时内连接 ${parsed.host}:${parsed.port}`, latencyMs: latency() };
  }

  if ((t === "mysql" || t === "tidb") && cfg.jdbcUrl && !cfg.host) {
    const parsed = parseJdbcHostPort(String(cfg.jdbcUrl));
    if (!parsed) {
      return { ok: false, message: "无法从 JDBC URL 解析主机与端口", latencyMs: latency() };
    }
    let conn;
    try {
      conn = await mysql.createConnection({
        host: parsed.host,
        port: parsed.port,
        user: cfg.username != null ? String(cfg.username) : undefined,
        password: cfg.password != null ? String(cfg.password) : undefined,
        database: cfg.database != null && String(cfg.database).trim() ? String(cfg.database) : undefined,
        connectTimeout: timeout,
      });
      await conn.query("SELECT 1");
      await conn.end();
      return { ok: true, message: "连接成功：已执行 SELECT 1（JDBC 地址 + 表单账号）", latencyMs: latency() };
    } catch (e) {
      if (conn) {
        try {
          await conn.end();
        } catch {
          /* ignore */
        }
      }
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: `连接失败：${msg}`, latencyMs: latency() };
    }
  }

  const mysqlFamily = new Set(["mysql", "doris", "tidb"]);
  if (mysqlFamily.has(t) && cfg.host && cfg.port) {
    let conn;
    try {
      conn = await mysql.createConnection({
        host: String(cfg.host),
        port: Number(cfg.port),
        user: cfg.username != null ? String(cfg.username) : undefined,
        password: cfg.password != null ? String(cfg.password) : undefined,
        database: cfg.database != null && String(cfg.database).trim() ? String(cfg.database) : undefined,
        connectTimeout: timeout,
      });
      await conn.query("SELECT 1");
      await conn.end();
      return { ok: true, message: "连接成功：已执行 SELECT 1", latencyMs: latency() };
    } catch (e) {
      if (conn) {
        try {
          await conn.end();
        } catch {
          /* ignore */
        }
      }
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: `连接失败：${msg}`, latencyMs: latency() };
    }
  }

  const hostPortTypes = new Set(["postgresql", "oracle", "sqlserver", "clickhouse", "starrocks", "impala", "mongodbbi", "redshift"]);
  if (hostPortTypes.has(t) && cfg.host && cfg.port) {
    const ok = await tcpProbe(String(cfg.host), Number(cfg.port), timeout);
    return ok
      ? {
          ok: true,
          message: `TCP 连接成功（${cfg.host}:${cfg.port}）。当前类型未做数据库认证，请在目标环境确认账号权限。`,
          latencyMs: latency(),
        }
      : { ok: false, message: `无法在超时内连接 ${cfg.host}:${cfg.port}`, latencyMs: latency() };
  }

  if (t === "hive") {
    const parsed = parseThriftMetastore(String(cfg.metastoreUri || ""));
    if (!parsed) {
      return { ok: false, message: "Metastore 地址无效或为空，请使用 thrift://host:port 格式", latencyMs: latency() };
    }
    const ok = await tcpProbe(parsed.host, parsed.port, timeout);
    return ok
      ? { ok: true, message: `Metastore 端口可达（${parsed.host}:${parsed.port}）`, latencyMs: latency() }
      : { ok: false, message: `Metastore 不可达：${parsed.host}:${parsed.port}`, latencyMs: latency() };
  }

  if (t === "elasticsearch") {
    const base = String(cfg.esClusterUrl || "").trim().replace(/\/+$/, "");
    if (!base) {
      return { ok: false, message: "集群地址为空", latencyMs: latency() };
    }
    try {
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), timeout);
      const res = await fetch(`${base}/`, { method: "HEAD", signal: ac.signal });
      clearTimeout(tid);
      if (res.ok || res.status === 404 || res.status === 405) {
        return { ok: true, message: `集群 HTTP 可达（状态 ${res.status}）`, latencyMs: latency() };
      }
      return { ok: false, message: `HTTP 状态 ${res.status}`, latencyMs: latency() };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: `请求失败：${msg}`, latencyMs: latency() };
    }
  }

  if (t === "jdbc") {
    const parsed = parseJdbcHostPort(String(cfg.jdbcUrl || ""));
    if (parsed) {
      const ok = await tcpProbe(parsed.host, parsed.port, timeout);
      return ok
        ? { ok: true, message: `JDBC URL 解析地址 TCP 可达（${parsed.host}:${parsed.port}）`, latencyMs: latency() }
        : { ok: false, message: `无法在超时内连接 ${parsed.host}:${parsed.port}`, latencyMs: latency() };
    }
    return {
      ok: true,
      message: "已填写 JDBC 配置；未能从 URL 解析主机，未发起网络探测。",
      latencyMs: latency(),
    };
  }

  if (["iceberg", "hudi", "paimon", "filelocalexcelcsv", "fileremoteexcelcsv"].includes(t)) {
    return {
      ok: true,
      message: "该类型不做网络连接探测；请确认存储与元数据配置符合环境要求。",
      latencyMs: latency(),
    };
  }

  return { ok: false, message: `当前类型「${catalogType}」暂无自动连接测试规则`, latencyMs: latency() };
}

function getCatalog(id) {
  return catalogs.find((c) => c.catalogId === id);
}

let catalogsHydrated = false;
/** @type {Promise<void> | null} */
let hydrateCatalogsPromise = null;

function mapCatalogRegistryRow(r) {
  let connectionConfig = {};
  try {
    const raw = r.connection_config_json;
    if (raw) connectionConfig = JSON.parse(String(raw));
  } catch {
    connectionConfig = {};
  }
  const last = r.last_sync_time;
  const created = r.created_at;
  return {
    catalogId: String(r.catalog_id ?? ""),
    catalogName: String(r.catalog_name ?? ""),
    businessName: String(r.catalog_name ?? ""),
    catalogType: String(r.catalog_type ?? ""),
    catalogOrigin: String(r.catalog_origin ?? "external"),
    connectionStatus: String(r.connection_status ?? "normal"),
    databaseCount: Number(r.database_count ?? 0),
    tableCount: Number(r.table_count ?? 0),
    lastSyncTime: last ? (last instanceof Date ? last.toISOString() : String(last)) : null,
    createdBy: String(r.created_by ?? ""),
    createdAt: created instanceof Date ? created.toISOString() : String(created ?? nowIso()),
    remark: String(r.remark ?? ""),
    enabled: Number(r.enabled ?? 1) !== 0,
    connectionConfig,
    dorisNative: false,
  };
}

/** 将当前内存中的外部数据源写入 Doris catalog_registry（含元数据快照） */
async function persistCatalogToDb(c) {
  if (catalogRegistryMemoryOnly || !c || c.catalogOrigin === "internal") return;
  await ensureGroupTables();
  const snap = JSON.stringify({
    tree: metaTree[c.catalogId] || {},
    dbMeta: dbMeta[c.catalogId] || {},
  });
  const connJson = JSON.stringify(c.connectionConfig && typeof c.connectionConfig === "object" ? c.connectionConfig : {});
  if (c.dorisNative && useNativeDorisCatalogStorage()) {
    await withCatalogDb(async (conn) => {
      await conn.query("DELETE FROM catalog_app_extension WHERE catalog_name = ?", [c.catalogName]);
      await conn.query(
        `INSERT INTO catalog_app_extension (
          catalog_name, business_name, catalog_type, remark, connection_config_json, meta_snapshot_json, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          c.catalogName,
          String(c.businessName || ""),
          c.catalogType,
          String(c.remark || ""),
          connJson,
          snap,
          String(c.createdBy || ""),
        ]
      );
    });
    return;
  }
  // Doris 多数版本不支持 MySQL 的 INSERT ... ON DUPLICATE KEY UPDATE；用 DELETE + INSERT 等价 upsert
  await withCatalogDb(async (conn) => {
    await conn.query("DELETE FROM catalog_registry WHERE catalog_id = ?", [c.catalogId]);
    await conn.query(
      `INSERT INTO catalog_registry (
        catalog_id, catalog_name, catalog_type, catalog_origin,
        connection_status, database_count, table_count, last_sync_time,
        created_by, created_at, remark, enabled,
        connection_config_json, meta_snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.catalogId,
        c.catalogName,
        c.catalogType,
        c.catalogOrigin,
        c.connectionStatus,
        c.databaseCount ?? 0,
        c.tableCount ?? 0,
        c.lastSyncTime,
        c.createdBy,
        c.createdAt,
        c.remark,
        c.enabled !== false ? 1 : 0,
        connJson,
        snap,
      ]
    );
  });
}

async function deleteCatalogFromDb(catalogId) {
  if (catalogRegistryMemoryOnly || catalogId === "internal") return;
  const c = getCatalog(catalogId);
  await ensureGroupTables();
  await withCatalogDb(async (conn) => {
    await conn.query("DELETE FROM catalog_group_assignments WHERE catalog_id = ?", [catalogId]);
    if (c && c.dorisNative) {
      const nm = String(c.catalogName || catalogId);
      try {
        await dropDorisCatalog(conn, nm, {});
      } catch (e) {
        console.error("[catalog] DROP CATALOG failed:", formatDorisCatalogError(e));
        throw e;
      }
      await conn.query("DELETE FROM catalog_app_extension WHERE catalog_name = ?", [nm]);
    } else {
      await conn.query("DELETE FROM catalog_registry WHERE catalog_id = ?", [catalogId]);
    }
  });
}

async function hydrateCatalogsRegistryOnly() {
  await withCatalogDb(async (conn) => {
    const [rows] = await conn.query(
      "SELECT catalog_id, catalog_name, catalog_type, catalog_origin, connection_status, database_count, table_count, last_sync_time, created_by, created_at, remark, enabled, connection_config_json, meta_snapshot_json FROM catalog_registry ORDER BY created_at ASC"
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return;
    const internal = catalogs.find((x) => x.catalogId === "internal");
    if (!internal) return;
    const externals = list.map((r) => mapCatalogRegistryRow(r));
    catalogs = [internal, ...externals];
    for (const r of list) {
      const cid = String(r.catalog_id ?? "");
      const raw = r.meta_snapshot_json;
      if (raw == null || raw === "") continue;
      try {
        const snap = JSON.parse(String(raw));
        if (snap.tree && typeof snap.tree === "object") metaTree[cid] = snap.tree;
        if (snap.dbMeta && typeof snap.dbMeta === "object") dbMeta[cid] = snap.dbMeta;
      } catch {
        /* ignore */
      }
    }
    for (const c of externals) {
      recalcCatalogCounts(c.catalogId);
    }
  });
}

async function hydrateCatalogsNativeAndLegacy() {
  await withCatalogDb(async (conn) => {
    const internal = catalogs.find((x) => x.catalogId === "internal");
    if (!internal) return;

    const nativeNames = new Set();
    /** @type {Array<Record<string, unknown>>} */
    let extRows = [];
    try {
      const [er] = await conn.query(
        "SELECT catalog_name, business_name, catalog_type, remark, connection_config_json, meta_snapshot_json, created_by, created_at FROM catalog_app_extension"
      );
      extRows = Array.isArray(er) ? er : [];
    } catch {
      extRows = [];
    }
    /** @type {Map<string, Record<string, unknown>>} */
    const extByName = new Map();
    for (const r of extRows) {
      const nm = String(r.catalog_name ?? "").trim();
      if (nm) extByName.set(nm, r);
    }

    /** @type {Array<{ catalogId: string, catalogName: string, catalogType: string, catalogOrigin: string, connectionStatus: string, databaseCount: number, tableCount: number, lastSyncTime: string | null, createdBy: string, createdAt: string, remark: string, enabled: boolean, connectionConfig: Record<string, unknown>, dorisNative: boolean }>} */
    const nativeExternals = [];
    try {
      const dorisCats = await listDorisCatalogs(conn);
      for (const { name, type } of dorisCats) {
        const nm = String(name || "").trim();
        if (!nm || nm.toLowerCase() === "internal") continue;
        nativeNames.add(nm);
        const ext = extByName.get(nm);
        let connectionConfig = {};
        if (ext) {
          try {
            connectionConfig = JSON.parse(String(ext.connection_config_json || "{}"));
          } catch {
            connectionConfig = {};
          }
        }
        const appType = ext ? String(ext.catalog_type || "") : mapDorisCatalogTypeToApp(type);
        nativeExternals.push({
          catalogId: nm,
          catalogName: nm,
          businessName: ext ? String(ext.business_name || "") : "",
          catalogType: appType || mapDorisCatalogTypeToApp(type),
          catalogOrigin: "external",
          connectionStatus: "normal",
          databaseCount: 0,
          tableCount: 0,
          lastSyncTime: null,
          createdBy: ext ? String(ext.created_by || "") : "doris",
          createdAt: ext && ext.created_at ? (ext.created_at instanceof Date ? ext.created_at.toISOString() : String(ext.created_at)) : nowIso(),
          remark: ext ? String(ext.remark || "") : "",
          enabled: true,
          connectionConfig,
          dorisNative: true,
        });
      }
    } catch (e) {
      console.error("[catalog] SHOW CATALOGS hydrate failed:", formatDorisCatalogError(e));
    }

    const [regRows] = await conn.query(
      "SELECT catalog_id, catalog_name, catalog_type, catalog_origin, connection_status, database_count, table_count, last_sync_time, created_by, created_at, remark, enabled, connection_config_json, meta_snapshot_json FROM catalog_registry ORDER BY created_at ASC"
    );
    const regList = Array.isArray(regRows) ? regRows : [];
    const legacyExternals = [];
    for (const r of regList) {
      const nm = String(r.catalog_name ?? "").trim();
      if (nativeNames.has(nm)) continue;
      legacyExternals.push(mapCatalogRegistryRow(r));
    }

    for (const k of Object.keys(metaTree)) {
      if (k !== "internal") delete metaTree[k];
    }
    for (const k of Object.keys(dbMeta)) {
      if (k !== "internal") delete dbMeta[k];
    }

    catalogs = [internal, ...nativeExternals, ...legacyExternals];

    for (const r of regList) {
      const nm = String(r.catalog_name ?? "").trim();
      if (nativeNames.has(nm)) continue;
      const cid = String(r.catalog_id ?? "");
      const raw = r.meta_snapshot_json;
      if (raw != null && raw !== "") {
        try {
          const snap = JSON.parse(String(raw));
          if (snap.tree && typeof snap.tree === "object") metaTree[cid] = snap.tree;
          if (snap.dbMeta && typeof snap.dbMeta === "object") dbMeta[cid] = snap.dbMeta;
        } catch {
          /* ignore */
        }
      } else {
        ensureMetaTree(cid);
      }
    }

    for (const c of nativeExternals) {
      const ext = extByName.get(c.catalogName);
      const raw = ext ? ext.meta_snapshot_json : null;
      if (raw != null && raw !== "") {
        try {
          const snap = JSON.parse(String(raw));
          if (snap.tree && typeof snap.tree === "object") metaTree[c.catalogId] = snap.tree;
          if (snap.dbMeta && typeof snap.dbMeta === "object") dbMeta[c.catalogId] = snap.dbMeta;
        } catch {
          /* ignore */
        }
      }
      if (!metaTree[c.catalogId]) ensureMetaTree(c.catalogId);
    }
    for (const c of [...nativeExternals, ...legacyExternals]) {
      recalcCatalogCounts(c.catalogId);
    }
  });
}

async function hydrateCatalogsFromDoris() {
  if (catalogsHydrated || catalogRegistryMemoryOnly) return;
  if (!hydrateCatalogsPromise) {
    hydrateCatalogsPromise = (async () => {
      try {
        await ensureGroupTables();
        if (useNativeDorisCatalogStorage()) {
          await hydrateCatalogsNativeAndLegacy();
        } else {
          await hydrateCatalogsRegistryOnly();
        }
      } catch (e) {
        console.error("[catalog-registry] hydrate failed:", e);
      } finally {
        catalogsHydrated = true;
      }
    })();
  }
  await hydrateCatalogsPromise;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleCatalogApi(req, res) {
  const url = req.url || "";
  let pathname;
  try {
    pathname = new URL(url, "http://127.0.0.1").pathname;
  } catch {
    sendJson(res, 400, { error: "bad url" });
    return;
  }

  const method = req.method || "GET";

  try {
    await hydrateCatalogsFromDoris();

    if (method === "POST" && pathname === "/api/catalog/test-connection-draft") {
      const body = await readBody(req);
      const catalogType = String(body.catalogType || "").trim();
      const connectionConfig = body.connectionConfig && typeof body.connectionConfig === "object" ? body.connectionConfig : {};
      if (!catalogType) {
        sendJson(res, 400, { error: "catalogType required" });
        return;
      }
      const result = await runDraftConnectionTest(catalogType, connectionConfig);
      sendJson(res, 200, result);
      return;
    }

    if (method === "GET" && pathname === "/api/catalog/views") {
      const u = new URL(url, "http://127.0.0.1");
      const viewName = (u.searchParams.get("viewName") || "").trim();
      const status = (u.searchParams.get("status") || "").trim();
      const viewGroupKey = (u.searchParams.get("viewGroupKey") || "").trim();
      const page = Math.max(1, Number(u.searchParams.get("page") || 1));
      const pageSize = Math.min(100, Math.max(1, Number(u.searchParams.get("pageSize") || 20)));
      const out = await listDataViews({ page, pageSize, viewName, status, viewGroupKey });
      sendJson(res, 200, { list: out.list, total: out.total });
      return;
    }

    if (method === "GET" && pathname === "/api/catalog/views/tree") {
      const u = new URL(url, "http://127.0.0.1");
      const viewName = (u.searchParams.get("viewName") || "").trim();
      const views = await listAllDataViewsForTree(viewName);
      let groups = [];
      /** @type {Record<string,string>} */
      let assignments = {};
      if (isViewRegistryMockMode()) {
        assignments = (mockViewGroupStore && mockViewGroupStore.assignments) || {};
        groups = (listMockViewGroupsWithAssignments().groups || []).map((g) => ({
          groupId: String(g.groupId),
          groupName: String(g.groupName),
          displayOrder: Number(g.displayOrder || 0),
        }));
      } else {
        try {
          const data = await listViewGroupsWithAssignments();
          assignments = (data && data.assignments) || {};
          groups = (data && data.groups) || [];
        } catch {
          const data = listMockViewGroupsWithAssignments();
          assignments = (data && data.assignments) || {};
          groups = (data && data.groups) || [];
        }
      }

      const groupList = Array.isArray(groups) ? groups : [];
      const groupsById = new Map(groupList.map((g) => [String(g.groupId), g]));
      const bucket = new Map();
      bucket.set("__ungrouped__", []);
      for (const g of groupList) bucket.set(String(g.groupId), []);
      for (const v of Array.isArray(views) ? views : []) {
        const vid = String(v.viewId || "");
        const gid = assignments[vid];
        if (gid && bucket.has(String(gid))) bucket.get(String(gid)).push(v);
        else bucket.get("__ungrouped__").push(v);
      }
      const outGroups = [];
      outGroups.push({ key: "__all__", label: "所有", views: Array.isArray(views) ? views : [] });
      outGroups.push({ key: "__ungrouped__", label: "未分组", views: bucket.get("__ungrouped__") || [] });
      const sortedCustom = [...groupsById.keys()].sort((a, b) => {
        const ga = groupsById.get(a);
        const gb = groupsById.get(b);
        const oa = Number(ga?.displayOrder || 0);
        const ob = Number(gb?.displayOrder || 0);
        if (oa !== ob) return oa - ob;
        return String(ga?.groupName || a).localeCompare(String(gb?.groupName || b));
      });
      for (const gid of sortedCustom) {
        const g = groupsById.get(gid);
        outGroups.push({
          key: String(gid),
          label: String(g?.groupName || gid),
          views: bucket.get(String(gid)) || [],
        });
      }
      sendJson(res, 200, { groups: outGroups });
      return;
    }

    if (method === "POST" && pathname === "/api/catalog/views") {
      const body = await readBody(req);
      const viewId = randomUUID();
      try {
        await createOrReplaceDataView({
          viewId,
          viewName: body.viewName,
          targetDatabase: body.targetDatabase,
          viewSql: body.viewSql,
          viewType: body.viewType || "logical",
          status: "active",
          createdBy: body.createdBy || "currentUser",
          previous: null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendJson(res, 400, { error: msg });
        return;
      }
      const row = await getDataViewById(viewId);
      sendJson(res, 201, row || { viewId });
      return;
    }

    if (method === "GET" && /^\/api\/catalog\/views\/[^/]+\/detail$/.test(pathname)) {
      const parts = pathname.split("/");
      const viewId = parts[4];
      const row = await getDataViewById(viewId);
      if (!row) {
        sendJson(res, 404, { error: "view not found" });
        return;
      }
      let viewGroupId = null;
      try {
        if (isViewRegistryMockMode()) {
          viewGroupId = (mockViewGroupStore.assignments || {})[String(viewId)] || null;
        } else {
          await ensureViewGroupTables();
          await withCatalogDb(async (conn) => {
            const [as] = await conn.query("SELECT group_id AS groupId FROM view_group_assignments WHERE view_id = ? LIMIT 1", [viewId]);
            const g = Array.isArray(as) && as[0] ? as[0].groupId : null;
            viewGroupId = g ? String(g) : null;
          });
        }
      } catch {
        viewGroupId = null;
      }
      sendJson(res, 200, { ...row, viewGroupId });
      return;
    }

    if (method === "GET" && pathname === "/api/catalog/view-groups") {
      let data;
      if (isViewRegistryMockMode()) data = listMockViewGroupsWithAssignments();
      else {
        try {
          data = await listViewGroupsWithAssignments();
        } catch {
          data = listMockViewGroupsWithAssignments();
        }
      }
      sendJson(res, 200, data);
      return;
    }

    if (method === "POST" && pathname === "/api/catalog/view-groups") {
      const body = await readBody(req);
      const groupName = String(body.groupName || "").trim() || "未命名";
      const displayOrder = Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : Date.now();
      if (isViewRegistryMockMode()) {
        const row = createMockViewGroup(groupName, displayOrder);
        sendJson(res, 201, { groupId: row.groupId, groupName: row.groupName, displayOrder: row.displayOrder });
        return;
      }
      try {
        const groupId = randomUUID();
        await ensureViewGroupTables();
        await withCatalogDb(async (conn) => {
          await conn.query(
            "INSERT INTO view_groups (group_id, group_name, display_order, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
            [groupId, groupName, displayOrder]
          );
        });
        sendJson(res, 201, { groupId, groupName, displayOrder });
      } catch {
        const row = createMockViewGroup(groupName, displayOrder);
        sendJson(res, 201, { groupId: row.groupId, groupName: row.groupName, displayOrder: row.displayOrder });
      }
      return;
    }

    if (method === "PUT" && /^\/api\/catalog\/view-groups\/[^/]+$/.test(pathname) && pathname !== "/api/catalog/view-groups/assignments") {
      const groupId = decodeURIComponent(pathname.split("/").pop() || "");
      const body = await readBody(req);
      const groupName = String(body.groupName || "").trim();
      if (!groupId || !groupName) {
        sendJson(res, 400, { error: "groupId and groupName required" });
        return;
      }
      if (isViewRegistryMockMode()) {
        const ok = updateMockViewGroup(groupId, groupName);
        if (!ok) {
          sendJson(res, 404, { error: "group not found" });
          return;
        }
      } else {
        try {
          await ensureViewGroupTables();
          await withCatalogDb(async (conn) => {
            await conn.query("UPDATE view_groups SET group_name = ?, updated_at = NOW() WHERE group_id = ?", [groupName, groupId]);
          });
        } catch {
          const ok = updateMockViewGroup(groupId, groupName);
          if (!ok) {
            sendJson(res, 404, { error: "group not found" });
            return;
          }
        }
      }
      sendJson(res, 200, { ok: true, groupId, groupName });
      return;
    }

    if (method === "DELETE" && /^\/api\/catalog\/view-groups\/[^/]+$/.test(pathname)) {
      const groupId = decodeURIComponent(pathname.split("/").pop() || "");
      if (!groupId) {
        sendJson(res, 400, { error: "groupId required" });
        return;
      }
      if (isViewRegistryMockMode()) {
        deleteMockViewGroup(groupId);
      } else {
        try {
          await ensureViewGroupTables();
          await withCatalogDb(async (conn) => {
            await conn.query("DELETE FROM view_groups WHERE group_id = ?", [groupId]);
            await conn.query("DELETE FROM view_group_assignments WHERE group_id = ?", [groupId]);
          });
        } catch {
          deleteMockViewGroup(groupId);
        }
      }
      sendJson(res, 200, { ok: true, groupId });
      return;
    }

    if (method === "POST" && pathname === "/api/catalog/view-groups/assignments") {
      const body = await readBody(req);
      const viewId = String(body.viewId || "").trim();
      const groupIdRaw = body.groupId == null ? "" : String(body.groupId).trim();
      const groupId = groupIdRaw && groupIdRaw !== "__ungrouped__" ? groupIdRaw : "";
      if (!viewId) {
        sendJson(res, 400, { error: "viewId required" });
        return;
      }
      if (isViewRegistryMockMode()) {
        setMockViewGroupAssignment(viewId, groupId || null);
        sendJson(res, 200, { ok: true, viewId, groupId: groupId || null });
        return;
      }
      try {
        await ensureViewGroupTables();
        await withCatalogDb(async (conn) => {
          await conn.query("DELETE FROM view_group_assignments WHERE view_id = ?", [viewId]);
          if (groupId) {
            await conn.query(
              "INSERT INTO view_group_assignments (view_id, group_id, updated_at) VALUES (?, ?, NOW())",
              [viewId, groupId]
            );
          }
        });
        sendJson(res, 200, { ok: true, viewId, groupId: groupId || null });
      } catch {
        setMockViewGroupAssignment(viewId, groupId || null);
        sendJson(res, 200, { ok: true, viewId, groupId: groupId || null });
      }
      return;
    }

    if (method === "PUT" && /^\/api\/catalog\/views\/[^/]+$/.test(pathname)) {
      const parts = pathname.split("/");
      const viewId = parts[4];
      const existing = await getDataViewById(viewId);
      if (!existing) {
        sendJson(res, 404, { error: "view not found" });
        return;
      }
      const body = await readBody(req);
      try {
        await createOrReplaceDataView({
          viewId,
          viewName: body.viewName ?? existing.viewName,
          targetDatabase: body.targetDatabase ?? existing.targetDatabase,
          viewSql: body.viewSql ?? existing.viewSql,
          viewType: body.viewType ?? existing.viewType ?? "logical",
          status: body.status ?? existing.status ?? "active",
          createdBy: body.createdBy ?? existing.createdBy ?? "currentUser",
          previous: { viewName: existing.viewName, targetDatabase: existing.targetDatabase },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendJson(res, 400, { error: msg });
        return;
      }
      const row = await getDataViewById(viewId);
      sendJson(res, 200, row || { viewId });
      return;
    }

    if (method === "DELETE" && /^\/api\/catalog\/views\/[^/]+$/.test(pathname)) {
      const parts = pathname.split("/");
      const viewId = parts[4];
      try {
        const ok = await deleteDataView(viewId);
        if (!ok) {
          sendJson(res, 404, { error: "view not found" });
          return;
        }
        sendJson(res, 200, { ok: true, viewId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendJson(res, 500, { error: `删除视图失败：${msg}` });
      }
      return;
    }

    if (method === "POST" && /^\/api\/catalog\/views\/[^/]+\/preview$/.test(pathname)) {
      const parts = pathname.split("/");
      const viewId = parts[4];
      const body = await readBody(req);
      const page = Number(body.page || 1);
      const pageSize = Number(body.pageSize || 100);
      try {
        const out = await previewDataView(viewId, page, pageSize);
        sendJson(res, 200, out);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("view not found")) sendJson(res, 404, { error: msg });
        else sendJson(res, 400, { error: msg });
      }
      return;
    }

    if (method === "GET" && pathname === "/api/catalog/list") {
      const u = new URL(url, "http://127.0.0.1");
      const nameQ = (u.searchParams.get("catalogName") || "").trim().toLowerCase();
      const typeQ = (u.searchParams.get("catalogType") || "").trim();
      const statusQ = (u.searchParams.get("connectionStatus") || "").trim();
      const groupKeyQ = (u.searchParams.get("groupKey") || "").trim();
      const page = Math.max(1, Number(u.searchParams.get("page") || 1));
      const pageSize = Math.min(100, Math.max(1, Number(u.searchParams.get("pageSize") || 20)));
      let rows = [...catalogs];
      if (nameQ)
        rows = rows.filter(
          (c) => String(c.catalogName || "").toLowerCase().includes(nameQ) || String(c.businessName || "").toLowerCase().includes(nameQ)
        );
      if (typeQ) rows = rows.filter((c) => c.catalogType === typeQ);
      if (statusQ) rows = rows.filter((c) => c.connectionStatus === statusQ);

      // data source group filter
      if (groupKeyQ && groupKeyQ !== "__all__") {
        try {
          let assignedSet = new Set();
          if (catalogGroupsMemoryOnly) {
            const assignments = mockGroupStore.assignments || {};
            if (groupKeyQ === "__ungrouped__") {
              // "未分组" = 没有任何 group_id 赋值的 catalog
              assignedSet = new Set(Object.keys(assignments).filter((k) => assignments[k])); // assigned to some group
              rows = rows.filter((c) => !assignedSet.has(String(c.catalogId)));
            } else {
              for (const [catalogId, gId] of Object.entries(assignments)) {
                if (String(gId) === String(groupKeyQ)) assignedSet.add(String(catalogId));
              }
              rows = rows.filter((c) => assignedSet.has(String(c.catalogId)));
            }
          } else {
            await ensureGroupTables();
            await withCatalogDb(async (conn) => {
              if (groupKeyQ === "__ungrouped__") {
                const [assignedRows] = await conn.query(
                  "SELECT DISTINCT catalog_id FROM catalog_group_assignments WHERE group_id IS NOT NULL AND catalog_id IS NOT NULL"
                );
                const ids = (Array.isArray(assignedRows) ? assignedRows : []).map((r) => String(r.catalog_id ?? r.catalogId ?? "")).filter(Boolean);
                assignedSet = new Set(ids);
                rows = rows.filter((c) => !assignedSet.has(String(c.catalogId)));
                return;
              }

              const [assignedRows] = await conn.query("SELECT catalog_id FROM catalog_group_assignments WHERE group_id = ?", [groupKeyQ]);
              const ids = (Array.isArray(assignedRows) ? assignedRows : []).map((r) => String(r.catalog_id ?? r.catalogId ?? "")).filter(Boolean);
              assignedSet = new Set(ids);
              rows = rows.filter((c) => assignedSet.has(String(c.catalogId)));
            });
          }
        } catch {
          // ignore group filter on failure to avoid breaking list page
        }
      }
      const total = rows.length;
      const start = (page - 1) * pageSize;
      sendJson(res, 200, { list: rows.slice(start, start + pageSize), total });
      return;
    }

    if (method === "GET" && /^\/api\/catalog\/[^/]+\/detail$/.test(pathname)) {
      const catalogId = pathname.split("/")[3];
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      const cfg = c.connectionConfig && typeof c.connectionConfig === "object" ? c.connectionConfig : {};
      const hideSensitive = cfg.hideSensitive !== false;
      sendJson(res, 200, {
        ...c,
        connectionConfig: sanitizeConnectionConfigForClient(cfg, hideSensitive),
      });
      return;
    }

    if (method === "GET" && pathname === "/api/catalog/tree") {
      const nodes = catalogs.map((c) => {
        const dbs = ensureMetaTree(c.catalogId);
        const children = Object.keys(dbs).map((databaseName) => ({
          databaseName,
          children: dbs[databaseName].map((tableName) => ({ tableName })),
        }));
        return {
          catalogId: c.catalogId,
          catalogName: c.catalogName,
          catalogType: c.catalogType,
          catalogOrigin: c.catalogOrigin,
          connectionStatus: c.connectionStatus,
          children,
        };
      });
      sendJson(res, 200, { rootLabel: "数据源", nodes });
      return;
    }

    if (method === "GET" && pathname === "/api/catalog/groups") {
      let data;
      if (catalogGroupsMemoryOnly) {
        data = listMockGroupsWithAssignments();
      } else {
        try {
          data = await listCatalogGroupsWithAssignments();
        } catch {
          data = listMockGroupsWithAssignments();
        }
      }
      sendJson(res, 200, data);
      return;
    }

    if (method === "POST" && pathname === "/api/catalog/groups") {
      const body = await readBody(req);
      const groupName = String(body.groupName || "").trim() || "未命名";
      const displayOrder = Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : Date.now();
      if (catalogGroupsMemoryOnly) {
        const row = createMockGroup(groupName, displayOrder);
        sendJson(res, 201, { groupId: row.groupId, groupName: row.groupName, displayOrder: row.displayOrder });
        return;
      }
      try {
        const groupId = randomUUID();
        await ensureGroupTables();
        await withCatalogDb(async (conn) => {
          await conn.query(
            "INSERT INTO catalog_groups (group_id, group_name, display_order, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
            [groupId, groupName, displayOrder]
          );
        });
        sendJson(res, 201, { groupId, groupName, displayOrder });
      } catch {
        const row = createMockGroup(groupName, displayOrder);
        sendJson(res, 201, { groupId: row.groupId, groupName: row.groupName, displayOrder: row.displayOrder });
      }
      return;
    }

    if (method === "PUT" && /^\/api\/catalog\/groups\/[^/]+$/.test(pathname) && pathname !== "/api/catalog/groups/assignments") {
      const groupId = decodeURIComponent(pathname.split("/").pop() || "");
      const body = await readBody(req);
      const groupName = String(body.groupName || "").trim();
      if (!groupId || !groupName) {
        sendJson(res, 400, { error: "groupId and groupName required" });
        return;
      }
      if (catalogGroupsMemoryOnly) {
        const ok = updateMockGroup(groupId, groupName);
        if (!ok) {
          sendJson(res, 404, { error: "group not found" });
          return;
        }
      } else {
        try {
          await ensureGroupTables();
          await withCatalogDb(async (conn) => {
            await conn.query("UPDATE catalog_groups SET group_name = ?, updated_at = NOW() WHERE group_id = ?", [groupName, groupId]);
          });
        } catch {
          const ok = updateMockGroup(groupId, groupName);
          if (!ok) {
            sendJson(res, 404, { error: "group not found" });
            return;
          }
        }
      }
      sendJson(res, 200, { ok: true, groupId, groupName });
      return;
    }

    if (method === "DELETE" && /^\/api\/catalog\/groups\/[^/]+$/.test(pathname)) {
      const groupId = decodeURIComponent(pathname.split("/").pop() || "");
      if (!groupId) {
        sendJson(res, 400, { error: "groupId required" });
        return;
      }
      if (catalogGroupsMemoryOnly) {
        deleteMockGroup(groupId);
      } else {
        try {
          await ensureGroupTables();
          await withCatalogDb(async (conn) => {
            await conn.query("DELETE FROM catalog_groups WHERE group_id = ?", [groupId]);
            await conn.query("UPDATE catalog_group_assignments SET group_id = NULL, updated_at = NOW() WHERE group_id = ?", [groupId]);
          });
        } catch {
          deleteMockGroup(groupId);
        }
      }
      sendJson(res, 200, { ok: true, groupId });
      return;
    }

    if (method === "PUT" && pathname === "/api/catalog/groups/assignments") {
      const body = await readBody(req);
      const catalogId = String(body.catalogId || "").trim();
      const groupIdRaw = body.groupId == null ? "" : String(body.groupId).trim();
      const groupId = groupIdRaw || null;
      if (!catalogId) {
        sendJson(res, 400, { error: "catalogId required" });
        return;
      }
      const exists = getCatalog(catalogId);
      if (!exists) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      if (catalogGroupsMemoryOnly) {
        ensureMockGroupStoreSeeded();
        if (groupId && !mockGroupStore.groups.some((g) => g.groupId === groupId)) {
          sendJson(res, 404, { error: "group not found" });
          return;
        }
        setMockGroupAssignment(catalogId, groupId);
      } else {
        try {
          await ensureGroupTables();
          await withCatalogDb(async (conn) => {
            if (groupId) {
              const [rows] = await conn.query("SELECT group_id FROM catalog_groups WHERE group_id = ? LIMIT 1", [groupId]);
              if (!Array.isArray(rows) || rows.length === 0) {
                sendJson(res, 404, { error: "group not found" });
                return;
              }
            }
            await conn.query("DELETE FROM catalog_group_assignments WHERE catalog_id = ?", [catalogId]);
            await conn.query(
              "INSERT INTO catalog_group_assignments (catalog_id, group_id, updated_at) VALUES (?, ?, NOW())",
              [catalogId, groupId]
            );
          });
          if (res.writableEnded) return;
        } catch {
          ensureMockGroupStoreSeeded();
          if (groupId && !mockGroupStore.groups.some((g) => g.groupId === groupId)) {
            sendJson(res, 404, { error: "group not found" });
            return;
          }
          setMockGroupAssignment(catalogId, groupId);
        }
      }
      sendJson(res, 200, { ok: true, catalogId, groupId });
      return;
    }

    if (method === "GET" && /^\/api\/catalog\/[^/]+\/databases\/[^/]+\/detail$/.test(pathname)) {
      const parts = pathname.split("/");
      const catalogId = parts[3];
      const databaseName = decodeURIComponent(parts[5]);
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      const dbs = ensureMetaTree(catalogId);
      const tables = dbs[databaseName];
      if (!tables) {
        sendJson(res, 404, { error: "database not found" });
        return;
      }
      const row = getDbMetaRow(catalogId, databaseName);
      const databaseOrigin = c.catalogOrigin === "internal" ? "internal" : "external";
      sendJson(res, 200, {
        catalogId,
        catalogName: c.catalogName,
        catalogOrigin: c.catalogOrigin,
        databaseName,
        databaseOrigin,
        tableCount: tables.length,
        lastSyncTime: row.lastSyncTime,
        remark: row.remark,
        tables: tables.map((tableName) => ({ tableName })),
      });
      return;
    }

    if (method === "POST" && /^\/api\/catalog\/[^/]+\/databases\/[^/]+\/sync-metadata$/.test(pathname)) {
      const parts = pathname.split("/");
      const catalogId = parts[3];
      const databaseName = decodeURIComponent(parts[5]);
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      const dbs = ensureMetaTree(catalogId);
      if (!(c.dorisNative && useNativeDorisCatalogStorage()) && !dbs[databaseName]) {
        sendJson(res, 404, { error: "database not found" });
        return;
      }
      if (c.dorisNative && useNativeDorisCatalogStorage()) {
        try {
          const tables = await withCatalogDb((conn) =>
            fetchTablesInDatabaseViaDorisCatalog(conn, c.catalogName, databaseName)
          );
          dbs[databaseName] = tables;
          const row = getDbMetaRow(catalogId, databaseName);
          row.lastSyncTime = nowIso();
          recalcCatalogCounts(catalogId);
          try {
            await persistCatalogToDb(c);
          } catch (pe) {
            console.error("[catalog] persist after native db sync failed:", pe);
          }
          sendJson(res, 200, { ok: true, databaseName, lastSyncTime: row.lastSyncTime, tableCount: tables.length });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendJson(res, 502, { ok: false, error: msg });
        }
        return;
      }
      if (isMysqlLikeCatalog(c)) {
        try {
          const tables = await fetchMysqlLikeTablesInDatabase(c, databaseName);
          dbs[databaseName] = tables;
          const row = getDbMetaRow(catalogId, databaseName);
          row.lastSyncTime = nowIso();
          recalcCatalogCounts(catalogId);
          try {
            await persistCatalogToDb(c);
          } catch (pe) {
            console.error("[catalog-registry] persist after db sync failed:", pe);
          }
          sendJson(res, 200, { ok: true, databaseName, lastSyncTime: row.lastSyncTime, tableCount: tables.length });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendJson(res, 502, { ok: false, error: msg });
        }
        return;
      }
      const row = getDbMetaRow(catalogId, databaseName);
      row.lastSyncTime = nowIso();
      try {
        await persistCatalogToDb(c);
      } catch (pe) {
        console.error("[catalog-registry] persist after db sync failed:", pe);
      }
      sendJson(res, 200, { ok: true, databaseName, lastSyncTime: row.lastSyncTime });
      return;
    }

    if (method === "PUT" && /^\/api\/catalog\/[^/]+\/databases\/[^/]+$/.test(pathname)) {
      const parts = pathname.split("/");
      const catalogId = parts[3];
      const databaseName = decodeURIComponent(parts[5]);
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      if (c.catalogOrigin !== "internal") {
        sendJson(res, 403, { error: "external catalog databases are read-only" });
        return;
      }
      const dbs = ensureMetaTree(catalogId);
      if (!dbs[databaseName]) {
        sendJson(res, 404, { error: "database not found" });
        return;
      }
      const body = await readBody(req);
      const row = getDbMetaRow(catalogId, databaseName);
      if (body.remark != null) row.remark = String(body.remark);
      const newName = body.databaseName != null ? String(body.databaseName).trim() : "";
      if (newName && newName !== databaseName) {
        if (dbs[newName]) {
          sendJson(res, 409, { error: "database name already exists" });
          return;
        }
        dbs[newName] = dbs[databaseName];
        delete dbs[databaseName];
        dbMeta[catalogId][newName] = row;
        delete dbMeta[catalogId][databaseName];
      }
      recalcCatalogCounts(catalogId);
      sendJson(res, 200, {
        databaseName: newName && newName !== databaseName ? newName : databaseName,
        remark: row.remark,
        lastSyncTime: row.lastSyncTime,
      });
      return;
    }

    if (method === "DELETE" && /^\/api\/catalog\/[^/]+\/databases\/[^/]+$/.test(pathname)) {
      const parts = pathname.split("/");
      const catalogId = parts[3];
      const databaseName = decodeURIComponent(parts[5]);
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      if (c.catalogOrigin !== "internal") {
        sendJson(res, 403, { error: "external catalog databases cannot be deleted" });
        return;
      }
      const dbs = ensureMetaTree(catalogId);
      if (!dbs[databaseName]) {
        sendJson(res, 404, { error: "database not found" });
        return;
      }
      delete dbs[databaseName];
      if (dbMeta[catalogId]) delete dbMeta[catalogId][databaseName];
      recalcCatalogCounts(catalogId);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && /^\/api\/catalog\/[^/]+\/databases$/.test(pathname)) {
      const catalogId = pathname.split("/")[3];
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      if (c.catalogOrigin !== "internal") {
        sendJson(res, 403, { error: "cannot create database in external catalog" });
        return;
      }
      const body = await readBody(req);
      const name = String(body.databaseName || "").trim();
      if (!name) {
        sendJson(res, 400, { error: "databaseName required" });
        return;
      }
      const dbs = ensureMetaTree(catalogId);
      if (dbs[name]) {
        sendJson(res, 409, { error: "database already exists" });
        return;
      }
      dbs[name] = [];
      const row = getDbMetaRow(catalogId, name);
      row.remark = String(body.remark || "");
      row.lastSyncTime = null;
      recalcCatalogCounts(catalogId);
      sendJson(res, 201, {
        databaseName: name,
        catalogName: c.catalogName,
        tableCount: 0,
        databaseOrigin: "internal",
        lastSyncTime: row.lastSyncTime,
        remark: row.remark,
      });
      return;
    }

    if (method === "GET" && /^\/api\/catalog\/[^/]+\/databases$/.test(pathname)) {
      const catalogId = pathname.split("/")[3];
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      const u = new URL(url, "http://127.0.0.1");
      const nameQ = (u.searchParams.get("databaseName") || "").trim().toLowerCase();
      const dbs = ensureMetaTree(catalogId);
      const databaseOrigin = c.catalogOrigin === "internal" ? "internal" : "external";
      let keys = Object.keys(dbs);
      if (nameQ) keys = keys.filter((k) => k.toLowerCase().includes(nameQ));
      const list = keys.map((databaseName) => {
        const row = getDbMetaRow(catalogId, databaseName);
        return {
          databaseName,
          catalogName: c.catalogName,
          tableCount: dbs[databaseName].length,
          databaseOrigin,
          lastSyncTime: row.lastSyncTime,
          remark: row.remark,
        };
      });
      sendJson(res, 200, { catalogId, catalogName: c.catalogName, catalogOrigin: c.catalogOrigin, list });
      return;
    }

    if (method === "GET" && /^\/api\/catalog\/[^/]+\/databases\/[^/]+\/tables$/.test(pathname)) {
      const parts = pathname.split("/");
      const catalogId = parts[3];
      const databaseName = decodeURIComponent(parts[5]);
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      const dbs = ensureMetaTree(catalogId);
      let tables = dbs[databaseName] || [];
      if (isMysqlLikeCatalog(c)) {
        try {
          tables = await fetchMysqlLikeTablesInDatabase(c, databaseName);
          dbs[databaseName] = tables;
          recalcCatalogCounts(catalogId);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendJson(res, 502, { error: `获取表列表失败：${msg}` });
          return;
        }
      }
      sendJson(res, 200, {
        catalogId,
        databaseName,
        catalogOrigin: c.catalogOrigin,
        list: tables.map((tableName) => ({
          tableName,
          remark: `${databaseName}.${tableName}`,
        })),
      });
      return;
    }

    if (method === "GET" && /^\/api\/catalog\/[^/]+\/databases\/[^/]+\/tables\/[^/]+\/preview$/.test(pathname)) {
      const parts = pathname.split("/");
      const catalogId = parts[3];
      const databaseName = decodeURIComponent(parts[5]);
      const tableName = decodeURIComponent(parts[7]);
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      if (isMysqlLikeCatalog(c)) {
        try {
          const u = new URL(url, "http://127.0.0.1");
          const page = Number(u.searchParams.get("page") || 1);
          const pageSize = Number(u.searchParams.get("pageSize") || 100);
          const real = await fetchMysqlLikeTablePreview(c, databaseName, tableName, page, pageSize);
          sendJson(res, 200, {
            catalogId,
            databaseName,
            tableName,
            readOnly: c.catalogOrigin === "external",
            columns: real.columns,
            rows: real.rows,
            page: real.page,
            pageSize: real.pageSize,
            total: real.total,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendJson(res, 502, { error: `获取表详情失败：${msg}` });
        }
        return;
      }
      sendJson(res, 200, {
        catalogId,
        databaseName,
        tableName,
        readOnly: c.catalogOrigin === "external",
        columns: [],
        rows: [],
        page: 1,
        pageSize: 100,
        total: 0,
      });
      return;
    }

    if (method === "GET" && /^\/api\/catalog\/[^/]+\/databases\/[^/]+\/tables\/[^/]+\/detail$/.test(pathname)) {
      const parts = pathname.split("/");
      const catalogId = parts[3];
      const databaseName = decodeURIComponent(parts[5]);
      const tableName = decodeURIComponent(parts[7]);
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }

      const dbRow = getDbMetaRow(catalogId, databaseName);
      const lastSyncTime = dbRow?.lastSyncTime ?? null;
      const maintainer = String(c.createdBy ?? "");
      let syncStatus = "未同步";
      if (lastSyncTime) syncStatus = c.connectionStatus === "error" ? "同步失败" : "已同步";
      else if (c.connectionStatus === "disabled") syncStatus = "已禁用";

      let businessGroup = "未分组";
      if (!catalogGroupsMemoryOnly) {
        try {
          await ensureGroupTables();
          const raw = await withCatalogDb(async (conn) => {
            const [rows] = await conn.query(
              `SELECT cg.group_name AS groupName
               FROM catalog_group_assignments a
               LEFT JOIN catalog_groups cg ON a.group_id = cg.group_id
               WHERE a.catalog_id = ?
               LIMIT 1`,
              [catalogId]
            );
            return Array.isArray(rows) && rows[0] ? rows[0].groupName : null;
          });
          if (raw) businessGroup = String(raw);
        } catch {
          businessGroup = "未分组";
        }
      }

      if (!isMysqlLikeCatalog(c)) {
        sendJson(res, 200, {
          catalogId,
          catalogName: c.catalogName,
          catalogType: c.catalogType,
          databaseName,
          tableName,
          tableRemark: `${databaseName}.${tableName}`,
          createdAt: null,
          lastSyncTime,
          storageEngine: "—",
          dataModel: null,
          fieldCount: 0,
          partitionCount: 0,
          rowCount: 0,
          storageSizeBytes: 0,
          storageSizeMB: 0,
          lastUpdatedAt: null,
          storageFormat: "—",
          syncStatus,
          maintainer,
          businessGroup,
        });
        return;
      }

      try {
        const detail = await fetchMysqlLikeTableDetail(c, databaseName, tableName);
        sendJson(res, 200, {
          catalogId,
          catalogName: c.catalogName,
          catalogType: c.catalogType,
          databaseName,
          tableName,
          tableRemark: detail.tableRemark,
          createdAt: detail.createdAt,
          lastSyncTime,
          storageEngine: detail.storageEngine,
          dataModel: detail.dataModel,
          fieldCount: detail.fieldCount,
          partitionCount: detail.partitionCount,
          rowCount: detail.rowCount,
          storageSizeBytes: detail.storageSizeBytes,
          storageSizeMB: detail.storageSizeMB,
          lastUpdatedAt: detail.lastUpdatedAt,
          storageFormat: detail.storageFormat,
          syncStatus,
          maintainer,
          businessGroup,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendJson(res, 502, { error: `获取表详情失败：${msg}` });
      }
      return;
    }

    if (method === "POST" && /^\/api\/catalog\/[^/]+\/databases\/[^/]+\/query$/.test(pathname)) {
      const parts = pathname.split("/");
      const catalogId = parts[3];
      const databaseName = decodeURIComponent(parts[5]);
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      if (!isMysqlLikeCatalog(c)) {
        sendJson(res, 400, { error: "当前数据源类型暂不支持 SQL 查询" });
        return;
      }
      const body = await readBody(req);
      const sql = String(body.sql || "");
      try {
        const out = await runMysqlLikeReadonlyQuery(c, databaseName, sql);
        sendJson(res, 200, {
          catalogId,
          databaseName,
          sql: out.sql,
          columns: out.columns,
          rows: out.rows,
          total: out.rows.length,
          page: 1,
          pageSize: out.rows.length,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendJson(res, 400, { error: msg });
      }
      return;
    }

    if (method === "POST" && pathname === "/api/catalog") {
      const body = await readBody(req);
      const catalogName = String(body.catalogName || "").trim();
      const businessName = String(body.businessName || "").trim();
      const catalogType = String(body.catalogType || "").trim();
      if (!catalogName || !catalogType) {
        sendJson(res, 400, { error: "catalogName and catalogType required" });
        return;
      }
      if (catalogType === "internal") {
        sendJson(res, 400, { error: "cannot create internal catalog" });
        return;
      }
      const connectionConfig = body.connectionConfig && typeof body.connectionConfig === "object" ? body.connectionConfig : {};
      if (!useNativeDorisCatalogStorage()) {
        sendJson(res, 400, { error: "已禁用旧版/降级创建路径，请开启 DORIS_NATIVE_CATALOG（默认 true）" });
        return;
      }
      if (!usesDorisNativeCatalog(catalogType)) {
        sendJson(res, 400, { error: `catalogType 不支持 Doris 原生 Catalog：${catalogType}` });
        return;
      }
      let props;
      try {
        assertDorisCatalogName(catalogName);
        props = buildCreateCatalogProperties(catalogType, connectionConfig);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendJson(res, 400, { error: msg });
        return;
      }
      const row = {
        catalogId: catalogName,
        catalogName,
        businessName: businessName || catalogName,
        catalogType,
        catalogOrigin: "external",
        connectionStatus: "normal",
        databaseCount: 0,
        tableCount: 0,
        lastSyncTime: null,
        createdBy: String(body.createdBy || "currentUser"),
        createdAt: nowIso(),
        remark: String(body.remark || ""),
        enabled: body.enabled !== false,
        connectionConfig,
        dorisNative: true,
      };
      catalogs.push(row);
      ensureMetaTree(row.catalogId);
      try {
        await ensureGroupTables();
        await withCatalogDb(async (conn) => {
          await createDorisCatalog(conn, catalogName, props);
        });
        await persistCatalogToDb(row);
      } catch (e) {
        catalogs = catalogs.filter((x) => x.catalogId !== row.catalogId);
        delete metaTree[row.catalogId];
        delete dbMeta[row.catalogId];
        const msg = formatDorisCatalogError(e);
        sendJson(res, 500, { error: `创建 Doris Catalog 失败：${msg}` });
        return;
      }
      sendJson(res, 201, row);
      return;
    }

    if (method === "PUT" && /^\/api\/catalog\/[^/]+$/.test(pathname)) {
      const catalogId = pathname.split("/").pop();
      const body = await readBody(req);
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      if (c.catalogOrigin === "internal") {
        sendJson(res, 403, { error: "internal catalog is read-only" });
        return;
      }
      if (body.catalogName != null && String(body.catalogName).trim() !== String(c.catalogName)) {
        sendJson(res, 400, { error: "不支持修改 catalogName（请删除后重建 Doris Catalog）" });
        return;
      }
      if (body.remark != null) c.remark = String(body.remark);
      if (body.connectionConfig && typeof body.connectionConfig === "object") c.connectionConfig = body.connectionConfig;
      if (body.catalogType != null) c.catalogType = String(body.catalogType);
      if (c.dorisNative && useNativeDorisCatalogStorage() && body.connectionConfig && typeof body.connectionConfig === "object") {
        try {
          const props = buildCreateCatalogProperties(c.catalogType, c.connectionConfig);
          await ensureGroupTables();
          await withCatalogDb(async (conn) => {
            await alterDorisCatalogSetProperties(conn, c.catalogName, props);
          });
        } catch (e) {
          const msg = formatDorisCatalogError(e);
          sendJson(res, 500, { error: `更新 Doris Catalog 失败：${msg}` });
          return;
        }
      }
      try {
        await persistCatalogToDb(c);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendJson(res, 500, { error: `更新 Doris 失败：${msg}` });
        return;
      }
      sendJson(res, 200, c);
      return;
    }

    if (method === "DELETE" && /^\/api\/catalog\/[^/]+$/.test(pathname)) {
      const catalogId = pathname.split("/").pop();
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      if (c.catalogOrigin === "internal") {
        sendJson(res, 403, { error: "cannot delete internal catalog" });
        return;
      }
      try {
        await deleteCatalogFromDb(catalogId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendJson(res, 500, { error: `删除 Doris 记录失败：${msg}` });
        return;
      }
      catalogs = catalogs.filter((x) => x.catalogId !== catalogId);
      delete metaTree[catalogId];
      delete dbMeta[catalogId];
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && pathname.endsWith("/test-connection")) {
      const parts = pathname.split("/");
      const catalogId = parts[3];
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      if (c.catalogOrigin === "internal") {
        sendJson(res, 200, { ok: true, message: "内置目录无需连接", latencyMs: 0 });
        return;
      }
      if (c.dorisNative && useNativeDorisCatalogStorage()) {
        const t0 = Date.now();
        try {
          await withCatalogDb(async (conn) => {
            await conn.query(`SHOW DATABASES FROM ${sqlIdentQuote(c.catalogName)} LIMIT 1`);
          });
          c.connectionStatus = "normal";
          sendJson(res, 200, { ok: true, message: "已通过 Doris 访问该 Catalog", latencyMs: Date.now() - t0 });
        } catch (e) {
          c.connectionStatus = "error";
          sendJson(res, 200, { ok: false, message: formatDorisCatalogError(e), latencyMs: Date.now() - t0 });
        }
        return;
      }
      const latencyMs = 30 + Math.floor(Math.random() * 120);
      const ok = c.connectionStatus !== "error" || Math.random() > 0.3;
      if (ok) {
        c.connectionStatus = "normal";
        sendJson(res, 200, { ok: true, message: "连接成功", latencyMs });
      } else {
        c.connectionStatus = "error";
        sendJson(res, 200, { ok: false, message: "连接失败：超时或认证错误", latencyMs });
      }
      return;
    }

    if (method === "POST" && /^\/api\/catalog\/[^/]+\/sync-metadata$/.test(pathname)) {
      const catalogId = pathname.split("/")[3];
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      if (c.dorisNative && useNativeDorisCatalogStorage()) {
        try {
          const tree = await withCatalogDb((conn) => fetchMetaTreeViaDorisCatalog(conn, c.catalogName));
          metaTree[catalogId] = tree;
          if (!dbMeta[catalogId]) dbMeta[catalogId] = {};
          for (const k of Object.keys(dbMeta[catalogId])) {
            if (!tree[k]) delete dbMeta[catalogId][k];
          }
          const ts = nowIso();
          for (const name of Object.keys(tree)) {
            getDbMetaRow(catalogId, name).lastSyncTime = ts;
          }
          recalcCatalogCounts(catalogId);
          c.lastSyncTime = ts;
          c.connectionStatus = "normal";
          try {
            await persistCatalogToDb(c);
          } catch (pe) {
            console.error("[catalog] persist after native sync failed:", pe);
          }
          sendJson(res, 200, {
            ok: true,
            lastSyncTime: c.lastSyncTime,
            databaseCount: c.databaseCount,
            tableCount: c.tableCount,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          c.connectionStatus = "error";
          sendJson(res, 502, { ok: false, error: msg });
        }
        return;
      }
      if (isMysqlLikeCatalog(c)) {
        try {
          const tree = await fetchMysqlLikeMetaTree(c);
          metaTree[catalogId] = tree;
          if (!dbMeta[catalogId]) dbMeta[catalogId] = {};
          for (const k of Object.keys(dbMeta[catalogId])) {
            if (!tree[k]) delete dbMeta[catalogId][k];
          }
          const ts = nowIso();
          for (const name of Object.keys(tree)) {
            getDbMetaRow(catalogId, name).lastSyncTime = ts;
          }
          recalcCatalogCounts(catalogId);
          c.lastSyncTime = ts;
          c.connectionStatus = "normal";
          try {
            await persistCatalogToDb(c);
          } catch (pe) {
            console.error("[catalog-registry] persist after sync failed:", pe);
          }
          sendJson(res, 200, {
            ok: true,
            lastSyncTime: c.lastSyncTime,
            databaseCount: c.databaseCount,
            tableCount: c.tableCount,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          c.connectionStatus = "error";
          sendJson(res, 502, { ok: false, error: msg });
        }
        return;
      }
      ensureMetaTree(catalogId);
      recalcCatalogCounts(catalogId);
      c.lastSyncTime = nowIso();
      try {
        await persistCatalogToDb(c);
      } catch (pe) {
        console.error("[catalog-registry] persist after sync failed:", pe);
      }
      sendJson(res, 200, {
        ok: true,
        lastSyncTime: c.lastSyncTime,
        databaseCount: c.databaseCount,
        tableCount: c.tableCount,
      });
      return;
    }

    if (method === "PATCH" && /^\/api\/catalog\/[^/]+$/.test(pathname)) {
      const catalogId = pathname.split("/").pop();
      const body = await readBody(req);
      const c = getCatalog(catalogId);
      if (!c) {
        sendJson(res, 404, { error: "catalog not found" });
        return;
      }
      if (c.catalogOrigin === "internal") {
        sendJson(res, 403, { error: "internal catalog cannot change enabled state via API" });
        return;
      }
      if (typeof body.enabled === "boolean") {
        c.enabled = body.enabled;
        c.connectionStatus = body.enabled ? "normal" : "disabled";
      }
      try {
        await persistCatalogToDb(c);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendJson(res, 500, { error: `更新 Doris 失败：${msg}` });
        return;
      }
      sendJson(res, 200, c);
      return;
    }

    if (method === "POST" && pathname === "/api/catalog/batch-delete") {
      const body = await readBody(req);
      const ids = Array.isArray(body.catalogIds) ? body.catalogIds : [];
      const removed = [];
      for (const id of ids) {
        const c = getCatalog(id);
        if (c && c.catalogOrigin !== "internal") {
          try {
            await deleteCatalogFromDb(String(id));
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            sendJson(res, 500, { error: `删除 Doris 记录失败：${msg}`, removedIds: removed });
            return;
          }
          catalogs = catalogs.filter((x) => x.catalogId !== id);
          delete metaTree[id];
          delete dbMeta[id];
          removed.push(id);
        }
      }
      sendJson(res, 200, { ok: true, removedCount: removed.length, removedIds: removed });
      return;
    }

    sendJson(res, 404, { error: "not found", path: pathname });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendJson(res, 500, { error: msg });
  }
}
