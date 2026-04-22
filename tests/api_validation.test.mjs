/**
 * Backend Integration Test: Cost Analysis APIs
 * Targets: /api/cost-overview, /api/session-cost-detail
 */
import assert from "node:assert/strict";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8787";

async function testCostOverview() {
  console.log("Testing /api/cost-overview...");
  const res = await fetch(`${API_BASE}/api/cost-overview?trendDays=14`);
  assert.strictEqual(res.status, 200, "Should return 200 OK");
  
  const data = await res.json();
  
  // Check schema
  assert.ok(data.cards, "Missing 'cards' field");
  assert.ok(data.cards.today, "Missing 'today' card");
  assert.ok(data.agentShare, "Missing 'agentShare' field");
  assert.ok(Array.isArray(data.trend14d), "trend14d should be an array");
  
  console.log("✅ /api/cost-overview schema validated.");
}

async function testSessionCostDetail() {
  console.log("Testing /api/session-cost-detail...");
  const today = new Date().toISOString().split("T")[0];
  const qs = new URLSearchParams({
    startDay: today,
    endDay: today,
    page: "1",
    pageSize: "10"
  });
  
  const res = await fetch(`${API_BASE}/api/session-cost-detail?${qs}`);
  assert.strictEqual(res.status, 200, "Should return 200 OK");
  
  const data = await res.json();
  
  // Check schema
  assert.ok(Array.isArray(data.rows), "rows should be an array");
  assert.ok(typeof data.total === "number", "total should be a number");
  
  if (data.rows.length > 0) {
    const row = data.rows[0];
    assert.ok(row.session_id, "Missing session_id");
    assert.ok(row.agentName, "Missing agentName");
    assert.ok(typeof row.totalTokens === "number", "totalTokens should be numeric");
    assert.ok(typeof row.costYuan === "number", "costYuan should be numeric");
    
    // Verify cost calculation logic: 3 Yuan per 1M tokens
    const expectedCost = Math.round((row.totalTokens / 1_000_000) * 3 * 10000) / 10000;
    assert.strictEqual(row.costYuan, expectedCost, "Cost calculation mismatch between backend and expectation");
  }
  
  console.log("✅ /api/session-cost-detail schema and calculation validated.");
}

async function run() {
  try {
    await testCostOverview();
    await testSessionCostDetail();
    console.log("\n🚀 All API integration tests passed!");
  } catch (err) {
    console.error("\n❌ Test failed:");
    console.error(err);
    process.exit(1);
  }
}

run();
