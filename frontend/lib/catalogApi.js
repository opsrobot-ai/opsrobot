const JSON_HDR = { "Content-Type": "application/json" };

async function parseJson(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error || res.statusText || "request failed";
    throw new Error(msg);
  }
  return data;
}

export async function fetchCatalogList(params = {}) {
  const q = new URLSearchParams();
  if (params.catalogName) q.set("catalogName", params.catalogName);
  if (params.catalogType) q.set("catalogType", params.catalogType);
  if (params.connectionStatus) q.set("connectionStatus", params.connectionStatus);
  if (params.groupKey && params.groupKey !== "__all__") q.set("groupKey", params.groupKey);
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 20));
  const res = await fetch(`/api/catalog/list?${q.toString()}`);
  return parseJson(res);
}

export async function fetchCatalogTree() {
  const res = await fetch("/api/catalog/tree");
  return parseJson(res);
}

export async function fetchCatalogDetail(catalogId) {
  const res = await fetch(`/api/catalog/${encodeURIComponent(catalogId)}/detail`);
  return parseJson(res);
}

export async function fetchCatalogGroups() {
  const res = await fetch("/api/catalog/groups");
  return parseJson(res);
}

export async function createCatalogGroup(body) {
  const res = await fetch("/api/catalog/groups", {
    method: "POST",
    headers: JSON_HDR,
    body: JSON.stringify(body || {}),
  });
  return parseJson(res);
}

export async function updateCatalogGroup(groupId, body) {
  const res = await fetch(`/api/catalog/groups/${encodeURIComponent(groupId)}`, {
    method: "PUT",
    headers: JSON_HDR,
    body: JSON.stringify(body || {}),
  });
  return parseJson(res);
}

export async function deleteCatalogGroup(groupId) {
  const res = await fetch(`/api/catalog/groups/${encodeURIComponent(groupId)}`, {
    method: "DELETE",
  });
  return parseJson(res);
}

export async function setCatalogGroupAssignment(catalogId, groupId) {
  const res = await fetch("/api/catalog/groups/assignments", {
    method: "PUT",
    headers: JSON_HDR,
    body: JSON.stringify({ catalogId, groupId: groupId || null }),
  });
  return parseJson(res);
}

/** 新建/编辑抽屉内：按当前表单配置做连接测试（不创建 catalog） */
export async function testDraftCatalogConnection(body) {
  const res = await fetch("/api/catalog/test-connection-draft", {
    method: "POST",
    headers: JSON_HDR,
    body: JSON.stringify(body || {}),
  });
  return parseJson(res);
}

export async function createCatalog(body) {
  const res = await fetch("/api/catalog", { method: "POST", headers: JSON_HDR, body: JSON.stringify(body) });
  return parseJson(res);
}

export async function updateCatalog(catalogId, body) {
  const res = await fetch(`/api/catalog/${encodeURIComponent(catalogId)}`, {
    method: "PUT",
    headers: JSON_HDR,
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function deleteCatalog(catalogId) {
  const res = await fetch(`/api/catalog/${encodeURIComponent(catalogId)}`, { method: "DELETE" });
  return parseJson(res);
}

export async function batchDeleteCatalogs(catalogIds) {
  const res = await fetch("/api/catalog/batch-delete", {
    method: "POST",
    headers: JSON_HDR,
    body: JSON.stringify({ catalogIds }),
  });
  return parseJson(res);
}

export async function testCatalogConnection(catalogId) {
  const res = await fetch(`/api/catalog/${encodeURIComponent(catalogId)}/test-connection`, {
    method: "POST",
    headers: JSON_HDR,
    body: "{}",
  });
  return parseJson(res);
}

export async function syncCatalogMetadata(catalogId) {
  const res = await fetch(`/api/catalog/${encodeURIComponent(catalogId)}/sync-metadata`, {
    method: "POST",
    headers: JSON_HDR,
    body: "{}",
  });
  return parseJson(res);
}

export async function setCatalogEnabled(catalogId, enabled) {
  const res = await fetch(`/api/catalog/${encodeURIComponent(catalogId)}`, {
    method: "PATCH",
    headers: JSON_HDR,
    body: JSON.stringify({ enabled }),
  });
  return parseJson(res);
}

export async function fetchDatabases(catalogId, params = {}) {
  const q = new URLSearchParams();
  if (params.databaseName) q.set("databaseName", params.databaseName);
  const qs = q.toString();
  const url = `/api/catalog/${encodeURIComponent(catalogId)}/databases${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  return parseJson(res);
}

export async function fetchDatabaseDetail(catalogId, databaseName) {
  const res = await fetch(
    `/api/catalog/${encodeURIComponent(catalogId)}/databases/${encodeURIComponent(databaseName)}/detail`
  );
  return parseJson(res);
}

export async function syncDatabaseMetadata(catalogId, databaseName) {
  const res = await fetch(
    `/api/catalog/${encodeURIComponent(catalogId)}/databases/${encodeURIComponent(databaseName)}/sync-metadata`,
    { method: "POST", headers: JSON_HDR, body: "{}" }
  );
  return parseJson(res);
}

export async function createDatabase(catalogId, body) {
  const res = await fetch(`/api/catalog/${encodeURIComponent(catalogId)}/databases`, {
    method: "POST",
    headers: JSON_HDR,
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function updateDatabase(catalogId, databaseName, body) {
  const res = await fetch(
    `/api/catalog/${encodeURIComponent(catalogId)}/databases/${encodeURIComponent(databaseName)}`,
    { method: "PUT", headers: JSON_HDR, body: JSON.stringify(body) }
  );
  return parseJson(res);
}

export async function deleteDatabase(catalogId, databaseName) {
  const res = await fetch(
    `/api/catalog/${encodeURIComponent(catalogId)}/databases/${encodeURIComponent(databaseName)}`,
    { method: "DELETE" }
  );
  return parseJson(res);
}

export async function fetchTables(catalogId, databaseName) {
  const res = await fetch(
    `/api/catalog/${encodeURIComponent(catalogId)}/databases/${encodeURIComponent(databaseName)}/tables`
  );
  return parseJson(res);
}

export async function fetchTablePreview(catalogId, databaseName, tableName, params = {}) {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.pageSize != null) q.set("pageSize", String(params.pageSize));
  const qs = q.toString();
  const res = await fetch(
    `/api/catalog/${encodeURIComponent(catalogId)}/databases/${encodeURIComponent(databaseName)}/tables/${encodeURIComponent(tableName)}/preview${qs ? `?${qs}` : ""}`
  );
  return parseJson(res);
}

export async function queryCatalogDatabase(catalogId, databaseName, sql) {
  const res = await fetch(
    `/api/catalog/${encodeURIComponent(catalogId)}/databases/${encodeURIComponent(databaseName)}/query`,
    {
      method: "POST",
      headers: JSON_HDR,
      body: JSON.stringify({ sql }),
    }
  );
  return parseJson(res);
}

export async function fetchTableDetail(catalogId, databaseName, tableName) {
  const res = await fetch(
    `/api/catalog/${encodeURIComponent(catalogId)}/databases/${encodeURIComponent(databaseName)}/tables/${encodeURIComponent(tableName)}/detail`
  );
  return parseJson(res);
}

export async function fetchDataViews(params = {}) {
  const q = new URLSearchParams();
  if (params.viewName) q.set("viewName", params.viewName);
  if (params.status) q.set("status", params.status);
  if (params.viewGroupKey) q.set("viewGroupKey", params.viewGroupKey);
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 20));
  const res = await fetch(`/api/catalog/views?${q.toString()}`);
  return parseJson(res);
}

export async function fetchDataViewTree(params = {}) {
  const q = new URLSearchParams();
  if (params.viewName) q.set("viewName", params.viewName);
  const qs = q.toString();
  const res = await fetch(`/api/catalog/views/tree${qs ? `?${qs}` : ""}`);
  return parseJson(res);
}

export async function fetchViewGroups() {
  const res = await fetch("/api/catalog/view-groups");
  return parseJson(res);
}

export async function createViewGroup(body) {
  const res = await fetch("/api/catalog/view-groups", {
    method: "POST",
    headers: JSON_HDR,
    body: JSON.stringify(body || {}),
  });
  return parseJson(res);
}

export async function updateViewGroup(groupId, body) {
  const res = await fetch(`/api/catalog/view-groups/${encodeURIComponent(groupId)}`, {
    method: "PUT",
    headers: JSON_HDR,
    body: JSON.stringify(body || {}),
  });
  return parseJson(res);
}

export async function deleteViewGroup(groupId) {
  const res = await fetch(`/api/catalog/view-groups/${encodeURIComponent(groupId)}`, { method: "DELETE" });
  return parseJson(res);
}

export async function setViewGroupAssignment(viewId, groupId) {
  const res = await fetch("/api/catalog/view-groups/assignments", {
    method: "POST",
    headers: JSON_HDR,
    body: JSON.stringify({ viewId, groupId }),
  });
  return parseJson(res);
}

export async function createDataView(body) {
  const res = await fetch("/api/catalog/views", {
    method: "POST",
    headers: JSON_HDR,
    body: JSON.stringify(body || {}),
  });
  return parseJson(res);
}

export async function updateDataView(viewId, body) {
  const res = await fetch(`/api/catalog/views/${encodeURIComponent(viewId)}`, {
    method: "PUT",
    headers: JSON_HDR,
    body: JSON.stringify(body || {}),
  });
  return parseJson(res);
}

export async function deleteDataView(viewId) {
  const res = await fetch(`/api/catalog/views/${encodeURIComponent(viewId)}`, {
    method: "DELETE",
  });
  return parseJson(res);
}

export async function fetchDataViewDetail(viewId) {
  const res = await fetch(`/api/catalog/views/${encodeURIComponent(viewId)}/detail`);
  return parseJson(res);
}

export async function previewDataView(viewId, params = {}) {
  const res = await fetch(`/api/catalog/views/${encodeURIComponent(viewId)}/preview`, {
    method: "POST",
    headers: JSON_HDR,
    body: JSON.stringify({
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 100,
    }),
  });
  return parseJson(res);
}
