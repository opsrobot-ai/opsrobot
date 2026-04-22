/**
 * Mock: GET /api/llm-cost-detail?startDay=&endDay=
 * 对齐 backend/cost-analysis/agent-llm-cost-tables-query.mjs → queryLlmCostDetail()
 */

function dayStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function mockLlmCostDetail(startDay, endDay) {
  const models = [
    { model: "Gemini 3.1 Pro", provider: "google" },
    { model: "Opus 4.6", provider: "anthropic" },
    { model: "MiniMax-M2.7", provider: "minimax-cn" },
    { model: "GLM 5.1", provider: "zhipu" },
  ];

  const rows = [];
  for (let dayOff = 0; dayOff >= -6; dayOff--) {
    const d = dayStr(dayOff);
    for (const m of models) {
      const total = 50_000 + Math.floor(Math.random() * 200_000);
      const inp = Math.floor(total * (0.55 + Math.random() * 0.15));
      const outp = total - inp;
      const io = inp + outp;
      rows.push({
        model: m.model,
        statDate: d,
        provider: m.provider,
        tokens: total >= 1e6 ? `${(total / 1e6).toFixed(2)}M` : total >= 1e3 ? `${(total / 1e3).toFixed(1)}K` : String(total),
        share: `${(Math.random() * 30 + 5).toFixed(1)}%`,
        inputOut: `${Math.round((inp / io) * 1000) / 10}% / ${Math.round((outp / io) * 1000) / 10}%`,
        drill: [
          {
            segment: "输入 Token",
            tokens: inp >= 1e3 ? `${(inp / 1e3).toFixed(1)}K` : String(inp),
            pct: `${Math.round((inp / io) * 1000) / 10}%`,
          },
          {
            segment: "输出 Token",
            tokens: outp >= 1e3 ? `${(outp / 1e3).toFixed(1)}K` : String(outp),
            pct: `${Math.round((outp / io) * 1000) / 10}%`,
          },
        ],
      });
    }
  }

  return {
    source: "mock",
    startDay: startDay || "2026-03-24",
    endDay: endDay || "2026-03-30",
    legend: "Mock 数据 · 无需数据库连接",
    rows,
  };
}
