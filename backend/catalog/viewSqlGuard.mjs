/**
 * 多源逻辑视图：视图定义 SQL 校验与弱依赖提取（catalog.db.table 三段式）
 */

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Doris 视图名 / 库名：仅允许标识符字符，避免拼接 DDL 时注入
 * @param {string} name
 * @param {string} label
 */
export function assertSafeSqlIdentifier(name, label) {
  const s = String(name || "").trim();
  if (!s) throw new Error(`${label} 不能为空`);
  if (!IDENT_RE.test(s)) throw new Error(`${label} 仅允许字母、数字与下划线，且不能以数字开头`);
}

/**
 * @param {string} sql
 * @returns {string}
 */
export function normalizeViewQuerySql(sql) {
  const raw = String(sql || "").trim().replace(/;+$/g, "");
  if (!raw) throw new Error("视图 SQL 不能为空");
  if (raw.includes(";")) throw new Error("仅支持单条 SQL");
  if (!/^(select|with)\b/i.test(raw)) {
    throw new Error("视图仅支持 SELECT / WITH 查询");
  }
  if (
    /\b(insert\s+into|delete\s+from|update\s+\w+\s+set|truncate\s+table|alter\s+table|drop\s+table|create\s+table|create\s+database|grant\s+|revoke\s+|load\s+label|export\s+outfile)\b/i.test(
      raw
    )
  ) {
    throw new Error("视图 SQL 含有不允许的写操作语句");
  }
  return raw;
}

/**
 * 从 SQL 中提取可能的外部 catalog 名（`cat`.`db`.`tbl` 或 cat.db.tbl 的首段）
 * @param {string} sql
 * @returns {string[]}
 */
export function extractSourceCatalogs(sql) {
  const out = new Set();
  const s = String(sql || "");
  /** 反引号三段式，支持 catalog 名含点、数字（如 `192.168.64.239`.`ods`.`orders`） */
  const tripleBt = /`([^`]+)`\s*\.\s*`([^`]+)`\s*\.\s*`([^`]+)`/g;
  let m = null;
  while ((m = tripleBt.exec(s)) !== null) {
    if (m[1]) out.add(String(m[1]));
  }
  const re =
    /`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s*\.\s*`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s*\.\s*`?([a-zA-Z_][a-zA-Z0-9_]*)`?/g;
  while ((m = re.exec(s)) !== null) {
    if (m[1]) out.add(String(m[1]));
  }
  return [...out];
}
