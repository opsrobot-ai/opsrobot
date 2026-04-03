/**
 * Mock: GET /api/config-audit-stats
 * 对齐 backend/security-audit/config-audit-query.mjs → queryConfigAuditStats()
 */

export function mockConfigAuditStats() {
  return {
    total: 6,
    bySource: [
      { source: "openclaw-gateway", count: 4 },
      { source: "opsRobot-agent", count: 1 },
      { source: "system", count: 1 },
    ],
    byEvent: [
      { event: "config_write", count: 3 },
      { event: "config_reload", count: 1 },
      { event: "config_create", count: 1 },
      { event: "config_delete", count: 1 },
    ],
    byResult: [
      { result: "success", count: 5 },
      { result: "failed", count: 1 },
    ],
  };
}
