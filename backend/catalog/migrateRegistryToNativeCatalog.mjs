/**
 * 一次性迁移：将 catalog_registry 中「可走 Doris 原生 Catalog」的行转为 CREATE CATALOG + catalog_app_extension，
 * 并删除对应 catalog_registry 行（需 Doris 账号具备 CREATE CATALOG 权限）。
 *
 * 干跑（默认）：只打印将执行的步骤，不写库。
 * 执行：设置环境变量 APPLY_MIGRATE=true 后运行：
 *   node backend/catalog/migrateRegistryToNativeCatalog.mjs
 *
 * 依赖：项目根目录 .env 中 Doris 连接（与 getDorisConfig 一致）。
 */
import path from "node:path";
import fs from "node:fs";
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";
import { buildCreateCatalogProperties, usesDorisNativeCatalog } from "./catalogDorisPropertiesMapper.mjs";
import { assertDorisCatalogName, createDorisCatalog } from "./dorisNativeCatalog.mjs";

function loadEnvFile() {
  const envPaths = [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../.env")];
  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    console.log(`[migrate] Loaded env: ${path.basename(envPath)}`);
    return;
  }
}

loadEnvFile();

const apply = String(process.env.APPLY_MIGRATE || "").toLowerCase() === "true";

async function main() {
  const cfg = getDorisConfig();
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: Number(cfg.port),
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || "opsRobot",
    connectTimeout: 25_000,
  });
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_app_extension (
        catalog_name VARCHAR(256) NOT NULL,
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
    const [rows] = await conn.query(
      "SELECT catalog_id, catalog_name, catalog_type, remark, connection_config_json FROM catalog_registry ORDER BY created_at ASC"
    );
    const list = Array.isArray(rows) ? rows : [];
    for (const r of list) {
      const catalogName = String(r.catalog_name ?? "").trim();
      const catalogType = String(r.catalog_type ?? "").trim();
      const catalogId = String(r.catalog_id ?? "").trim();
      if (!catalogName || !usesDorisNativeCatalog(catalogType)) continue;
      let connectionConfig = {};
      try {
        connectionConfig = JSON.parse(String(r.connection_config_json || "{}"));
      } catch {
        connectionConfig = {};
      }
      let props;
      try {
        assertDorisCatalogName(catalogName);
        props = buildCreateCatalogProperties(catalogType, connectionConfig);
      } catch (e) {
        console.warn(`[migrate] skip ${catalogName}: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      console.log(`[migrate] ${apply ? "APPLY" : "dry-run"}: CREATE CATALOG ${catalogName} (${catalogType})`);
      if (apply) {
        await createDorisCatalog(conn, catalogName, props);
        const snap = JSON.stringify({ tree: {}, dbMeta: {} });
        const connJson = JSON.stringify(connectionConfig);
        await conn.query("DELETE FROM catalog_app_extension WHERE catalog_name = ?", [catalogName]);
        await conn.query(
          `INSERT INTO catalog_app_extension (catalog_name, catalog_type, remark, connection_config_json, meta_snapshot_json, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [catalogName, catalogType, String(r.remark || ""), connJson, snap, "migrate"]
        );
        await conn.query("DELETE FROM catalog_group_assignments WHERE catalog_id = ?", [catalogId]);
        await conn.query("DELETE FROM catalog_registry WHERE catalog_id = ?", [catalogId]);
        console.log(`[migrate] done: ${catalogName}`);
      }
    }
    if (!apply) console.log("[migrate] 干跑结束。执行迁移请设置 APPLY_MIGRATE=true");
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
