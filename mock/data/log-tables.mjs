/**
 * Mock: GET /api/agent-sessions-logs-tables
 * 对齐 backend/log-search/log-search-query.mjs → listOtelAgentSessionsLogTables()
 */

function dayStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export function mockLogTables() {
  const tables = ["agent_sessions_logs"];
  for (let i = 0; i < 7; i++) {
    tables.push(`agent_sessions_logs_${dayStr(-i)}`);
  }
  return {
    database: "otel",
    tables,
  };
}
