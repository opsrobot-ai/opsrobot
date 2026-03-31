/**
 * 会话成本明细 Mock 数据生成器
 */
export function mockSessionCostDetail({
  page = 1,
  pageSize = 20,
  agents = [],
  users = [],
  gateways = [],
  models = [],
}) {
  const allRows = [];
  const agentPool = agents.length > 0 ? agents : ["合规审查官", "数据分析员", "HR 面试助手", "客服助手·小智", "运维巡检员"];
  const userPool = users.length > 0 ? users : ["张三", "李四", "王五", "赵六", "钱七"];
  const gatewayPool = gateways.length > 0 ? gateways : ["api-gateway", "webchat", "feishu", "cron-job", "internal"];
  const modelPool = models.length > 0 ? models : ["gpt-4o", "claude-3-5-sonnet", "deepseek-v3", "qwen-max"];

  const total = 45; // 模拟总数
  
  for (let i = 0; i < total; i++) {
    const totalTokens = Math.floor(Math.random() * 50000) + 1000;
    const inputRatio = 0.7 + Math.random() * 0.2;
    const inputTokens = Math.floor(totalTokens * inputRatio);
    const outputTokens = totalTokens - inputTokens;
    const costYuan = Math.round((totalTokens / 1000000) * 3 * 10000) / 10000;

    const date = new Date(Date.now() - i * 3600000);
    const createTime = date.toISOString().slice(0, 16).replace("T", " ");

    allRows.push({
      session_id: `sess_cost_${100000 + i}`,
      agentName: agentPool[i % agentPool.length],
      userName: userPool[i % userPool.length],
      gateway: gatewayPool[i % gatewayPool.length],
      model: modelPool[i % modelPool.length],
      totalTokens,
      inputTokens,
      outputTokens,
      costYuan,
      createTime,
    });
  }

  const start = (page - 1) * pageSize;
  const rows = allRows.slice(start, start + pageSize);

  return { rows, total };
}
