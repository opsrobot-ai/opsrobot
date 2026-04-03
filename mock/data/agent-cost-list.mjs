/**
 * Mock: GET /api/agent-cost-list?startDay=&endDay=
 * 对齐 backend/cost-analysis/agent-llm-cost-tables-query.mjs → queryAgentCostList()
 */

export function mockAgentCostList(startDay, endDay) {
  const rows = [
    {
      agentId: "agt-a1b2c3d4e5f6",
      agent: "客服助手·小智",
      totalCost: "2.80M",
      avgPerTask: "4.7K",
      callCount: 596,
      successRate: "97.3%",
      drill: [
        { segment: "输入 Token", tokens: "1.82M", pct: "65.0%" },
        { segment: "输出 Token", tokens: "980K", pct: "35.0%" },
      ],
    },
    {
      agentId: "agt-f6e5d4c3b2a1",
      agent: "运维巡检员",
      totalCost: "1.60M",
      avgPerTask: "8.0K",
      callCount: 200,
      successRate: "94.5%",
      drill: [
        { segment: "输入 Token", tokens: "1.12M", pct: "70.0%" },
        { segment: "输出 Token", tokens: "480K", pct: "30.0%" },
      ],
    },
    {
      agentId: "agt-112233445566",
      agent: "数据分析员",
      totalCost: "1.20M",
      avgPerTask: "12.0K",
      callCount: 100,
      successRate: "91.0%",
      drill: [
        { segment: "输入 Token", tokens: "720K", pct: "60.0%" },
        { segment: "输出 Token", tokens: "480K", pct: "40.0%" },
      ],
    },
    {
      agentId: "agt-aabbccddeeff",
      agent: "HR 面试助手",
      totalCost: "900K",
      avgPerTask: "6.0K",
      callCount: 150,
      successRate: "99.3%",
      drill: [
        { segment: "输入 Token", tokens: "540K", pct: "60.0%" },
        { segment: "输出 Token", tokens: "360K", pct: "40.0%" },
      ],
    },
    {
      agentId: "agt-001122334455",
      agent: "合规审查官",
      totalCost: "520K",
      avgPerTask: "10.4K",
      callCount: 50,
      successRate: "100.0%",
      drill: [
        { segment: "输入 Token", tokens: "364K", pct: "70.0%" },
        { segment: "输出 Token", tokens: "156K", pct: "30.0%" },
      ],
    },
  ];

  return {
    source: "mock",
    startDay: startDay || "2026-03-01",
    endDay: endDay || "2026-03-30",
    legend: "Mock 数据 · 无需数据库连接",
    rows,
  };
}
