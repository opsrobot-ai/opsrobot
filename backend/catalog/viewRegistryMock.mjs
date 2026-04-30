/**
 * VIEW_REGISTRY_MOCK（或 VITE_MOCK=true）开启内存数据视图时：内置示例（不写 Doris）。
 * 含 5 条示例，其中一条演示数据源「192.168.64.239」与 internal 的跨 Catalog 关联（SQL 为示例，执行以真实 Doris Catalog 为准）。
 */

/** @typedef {{ viewId: string, viewName: string, targetDatabase: string, viewType: string, status: string, viewSql: string, sourceCatalogs: string[], createdBy: string, createdAt: string, updatedAt: string }} MockViewRow */

/** @type {MockViewRow[]} */
let mockViewRows = [];

/**
 * @param {() => string} nowIso
 */
export function ensureViewRegistryMockSeed(nowIso) {
  if (mockViewRows.length) return;
  const ts = nowIso();
  mockViewRows = [
    {
      viewId: "view-mock-001-192-internal",
      viewName: "v_192_ods_orders_with_dim_user",
      targetDatabase: "opsRobot",
      viewType: "logical",
      status: "active",
      viewSql:
        "SELECT o.order_id AS order_id, o.user_id AS user_id, u.name AS user_name\n" +
        "FROM `192.168.64.239`.`ods`.`orders` o\n" +
        "LEFT JOIN `internal`.`warehouse`.`dim_user` u ON u.id = o.user_id",
      sourceCatalogs: ["192.168.64.239", "internal"],
      createdBy: "demo",
      createdAt: ts,
      updatedAt: ts,
    },
    {
      viewId: "view-mock-002-hive-mysql",
      viewName: "v_hive_mysql_cross_cnt",
      targetDatabase: "opsRobot",
      viewType: "logical",
      status: "active",
      viewSql:
        "SELECT 'hive' AS side, COUNT(1) AS cnt\n" +
        "FROM `hive_prod`.`default_db`.`tbl_hive_a`\n" +
        "UNION ALL\n" +
        "SELECT 'mysql' AS side, COUNT(1) AS cnt\n" +
        "FROM `mysql_ods`.`default_db`.`tbl_mysql_b`",
      sourceCatalogs: ["hive_prod", "mysql_ods"],
      createdBy: "demo",
      createdAt: ts,
      updatedAt: ts,
    },
    {
      viewId: "view-mock-003-internal-only",
      viewName: "v_internal_sessions_join_orders",
      targetDatabase: "opsRobot",
      viewType: "logical",
      status: "active",
      viewSql:
        "SELECT s.session_id, f.order_id\n" +
        "FROM `internal`.`analytics`.`sessions_agg` s\n" +
        "INNER JOIN `internal`.`warehouse`.`fact_order` f ON f.user_id = s.user_id",
      sourceCatalogs: ["internal"],
      createdBy: "demo",
      createdAt: ts,
      updatedAt: ts,
    },
    {
      viewId: "view-mock-004-192-only",
      viewName: "v_192_ods_sales_daily",
      targetDatabase: "opsRobot",
      viewType: "logical",
      status: "active",
      viewSql:
        "SELECT sale_date, region, SUM(amount) AS total_amount\n" +
        "FROM `192.168.64.239`.`ods`.`sales_daily`\n" +
        "GROUP BY sale_date, region",
      sourceCatalogs: ["192.168.64.239"],
      createdBy: "demo",
      createdAt: ts,
      updatedAt: ts,
    },
    {
      viewId: "view-mock-005-triple-lineage",
      viewName: "v_lineage_internal_192_hive",
      targetDatabase: "opsRobot",
      viewType: "logical",
      status: "active",
      viewSql:
        "SELECT 'internal' AS catalog, COUNT(1) AS n FROM `internal`.`warehouse`.`dim_user`\n" +
        "UNION ALL\n" +
        "SELECT '192' AS catalog, COUNT(1) AS n FROM `192.168.64.239`.`ods`.`orders`\n" +
        "UNION ALL\n" +
        "SELECT 'hive' AS catalog, COUNT(1) AS n FROM `hive_prod`.`default_db`.`tbl_hive_a`",
      sourceCatalogs: ["internal", "192.168.64.239", "hive_prod"],
      createdBy: "demo",
      createdAt: ts,
      updatedAt: ts,
    },
  ];
}

/**
 * @param {{ page: number, pageSize: number, viewName?: string, status?: string }} q
 */
export function listMockDataViews(q) {
  ensureViewRegistryMockSeed(() => new Date().toISOString());
  let rows = [...mockViewRows];
  const nq = String(q.viewName || "").trim().toLowerCase();
  if (nq) rows = rows.filter((x) => x.viewName.toLowerCase().includes(nq));
  const st = String(q.status || "").trim();
  if (st) rows = rows.filter((x) => x.status === st);
  const total = rows.length;
  const start = Math.max(0, (q.page - 1) * q.pageSize);
  const slice = rows.slice(start, start + q.pageSize);
  const list = slice.map((r) => {
    const { viewSql: _omit, ...rest } = r;
    return rest;
  });
  return { list, total };
}

/** @param {string} viewId */
export function getMockDataViewById(viewId) {
  ensureViewRegistryMockSeed(() => new Date().toISOString());
  const r = mockViewRows.find((x) => x.viewId === viewId);
  if (!r) return null;
  return { ...r, sourceCatalogs: [...r.sourceCatalogs] };
}

/**
 * @param {MockViewRow} row
 */
export function upsertMockDataView(row) {
  const ts0 = new Date().toISOString();
  ensureViewRegistryMockSeed(() => ts0);
  const i = mockViewRows.findIndex((x) => x.viewId === row.viewId);
  const ts = row.updatedAt || new Date().toISOString();
  const next = { ...row, updatedAt: ts };
  if (i >= 0) {
    mockViewRows[i] = { ...mockViewRows[i], ...next, createdAt: mockViewRows[i].createdAt };
  } else {
    mockViewRows.push({ ...next, createdAt: next.createdAt || ts });
  }
}

/** @param {string} viewId */
export function deleteMockDataView(viewId) {
  ensureViewRegistryMockSeed(() => new Date().toISOString());
  const n = mockViewRows.length;
  mockViewRows = mockViewRows.filter((x) => x.viewId !== viewId);
  return mockViewRows.length < n;
}

/**
 * @param {string} viewId
 * @param {number} page
 * @param {number} pageSize
 */
export function previewMockDataView(viewId, page, pageSize) {
  const row = getMockDataViewById(viewId);
  if (!row) throw new Error("view not found");
  const p = Math.max(1, page);
  const size = Math.max(1, Math.min(500, pageSize));
  const total = 37;
  const cols = [
    { columnName: "col_a", dataType: "VARCHAR" },
    { columnName: "col_b", dataType: "BIGINT" },
  ];
  const rows = [];
  const base = (p - 1) * size;
  for (let i = 0; i < size && base + i < total; i++) {
    rows.push({ col_a: `${row.viewName}#${base + i + 1}`, col_b: base + i + 1 });
  }
  return {
    ...row,
    columns: cols,
    rows,
    page: p,
    pageSize: size,
    total,
  };
}
