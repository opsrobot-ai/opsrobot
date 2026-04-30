/**
 * Doris 4.x 原生 Catalog：SHOW / CREATE / DROP / ALTER CATALOG，以及经 Doris 拉取 Federated 元数据树。
 */

/** @param {string} name */
export function assertDorisCatalogName(name) {
  const s = String(name || "").trim();
  if (!s) throw new Error("Catalog 名称不能为空");
  if (s.length > 256) throw new Error("Catalog 名称过长");
  if (!/^[a-zA-Z0-9_.-]+$/.test(s)) {
    throw new Error("Catalog 名称仅允许字母、数字、点、下划线与连字符");
  }
  if (s.toLowerCase() === "internal") throw new Error("不能使用保留名称 internal");
}

/** 反引号包裹标识符（catalog / db / table） */
export function sqlCatalogIdent(name) {
  return `\`${String(name).replace(/`/g, "")}\``;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {{ name: string, type: string }}
 */
function normalizeShowCatalogRow(row) {
  const o = row && typeof row === "object" ? row : {};
  const keys = Object.keys(o);
  let name = "";
  let type = "";
  for (const k of keys) {
    const lk = k.toLowerCase();
    const v = o[k];
    if (v == null) continue;
    const sv = String(v).trim();
    if (!sv) continue;
    if (lk.includes("catalog") && (lk.includes("name") || lk === "catalog")) name = sv;
    else if (lk.includes("type")) type = sv;
  }
  if (!name && keys.length) {
    const first = o[keys[0]];
    if (first != null) name = String(first).trim();
  }
  return { name, type: type || "" };
}

/**
 * @param {import("mysql2/promise").Connection} conn
 * @returns {Promise<Array<{ name: string, type: string }>>}
 */
export async function listDorisCatalogs(conn) {
  const [rows] = await conn.query("SHOW CATALOGS");
  const list = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const { name, type } = normalizeShowCatalogRow(row);
    if (name) list.push({ name, type });
  }
  return list;
}

/**
 * @param {Record<string, string>} propertiesObject
 * @returns {string}
 */
export function formatCatalogPropertiesSql(propertiesObject) {
  const parts = [];
  for (const [k, v] of Object.entries(propertiesObject)) {
    const key = String(k).replace(/'/g, "''");
    const val = String(v).replace(/\\/g, "\\\\").replace(/'/g, "''");
    parts.push(`'${key}' = '${val}'`);
  }
  return parts.join(",\n    ");
}

/**
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} catalogName
 * @param {Record<string, string>} propertiesObject
 */
export async function createDorisCatalog(conn, catalogName, propertiesObject) {
  assertDorisCatalogName(catalogName);
  const propsSql = formatCatalogPropertiesSql(propertiesObject);
  const sql = `CREATE CATALOG ${sqlCatalogIdent(catalogName)} PROPERTIES (\n    ${propsSql}\n  )`;
  await conn.query(sql);
}

/**
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} catalogName
 * @param {{ force?: boolean }} [opts]
 */
export async function dropDorisCatalog(conn, catalogName, opts = {}) {
  assertDorisCatalogName(catalogName);
  const force = opts.force ? " FORCE" : "";
  await conn.query(`DROP CATALOG IF EXISTS ${sqlCatalogIdent(catalogName)}${force}`);
}

/**
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} catalogName
 * @param {Record<string, string>} propertiesObject
 */
export async function alterDorisCatalogSetProperties(conn, catalogName, propertiesObject) {
  assertDorisCatalogName(catalogName);
  const propsSql = formatCatalogPropertiesSql(propertiesObject);
  await conn.query(`ALTER CATALOG ${sqlCatalogIdent(catalogName)} SET PROPERTIES (\n    ${propsSql}\n  )`);
}

/**
 * 经 Doris 查询外部 catalog 的库表树（SHOW DATABASES / SHOW TABLES）
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} catalogName
 * @returns {Promise<Record<string, string[]>>}
 */
/**
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} catalogName
 * @param {string} databaseName
 * @returns {Promise<string[]>}
 */
export async function fetchTablesInDatabaseViaDorisCatalog(conn, catalogName, databaseName) {
  assertDorisCatalogName(catalogName);
  const cat = sqlCatalogIdent(catalogName);
  const dbq = sqlCatalogIdent(String(databaseName || "").trim());
  const [tbRows] = await conn.query(`SHOW TABLES FROM ${cat}.${dbq}`);
  const tables = [];
  for (const tb of Array.isArray(tbRows) ? tbRows : []) {
    const k = Object.keys(tb).find((x) => x.startsWith("Tables_in_")) || Object.keys(tb)[0];
    const tbn = k ? tb[k] : Object.values(tb)[0];
    if (tbn) tables.push(String(tbn));
  }
  return tables;
}

export async function fetchMetaTreeViaDorisCatalog(conn, catalogName) {
  assertDorisCatalogName(catalogName);
  const cat = sqlCatalogIdent(catalogName);
  const [dbRows] = await conn.query(`SHOW DATABASES FROM ${cat}`);
  /** @type {Record<string, string[]>} */
  const tree = {};
  for (const row of Array.isArray(dbRows) ? dbRows : []) {
    const dbName = row.Database ?? row.database ?? row.DatabaseName;
    if (!dbName) continue;
    const db = String(dbName);
    if (db.toLowerCase() === "information_schema") continue;
    const dbq = sqlCatalogIdent(db);
    try {
      const [tbRows] = await conn.query(`SHOW TABLES FROM ${cat}.${dbq}`);
      const tables = [];
      for (const tb of Array.isArray(tbRows) ? tbRows : []) {
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
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function formatDorisCatalogError(err) {
  if (!err) return "unknown error";
  if (err instanceof Error) return err.message;
  const o = err;
  if (o && typeof o === "object" && "sqlMessage" in o) return String(o.sqlMessage);
  return String(err);
}
