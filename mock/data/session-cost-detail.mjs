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
  statuses = [],
}) {
  const allRows = [];
  const agentPool = agents.length > 0 ? agents : ["合规审查官", "数据分析员", "HR 面试助手", "客服助手·小智", "运维巡检员"];
  const userPool = users.length > 0 ? users : ["张三", "李四", "王五", "赵六", "钱七"];
  const gatewayPool = gateways.length > 0 ? gateways : ["api-gateway", "webchat", "feishu", "cron-job", "internal"];
  const modelPool = models.length > 0 ? models : ["Gemini 3.1 Pro", "Opus 4.6", "GLM 5.1", "MiniMax-M2.7"];

  // Map first few rows to real agent-sessions IDs for cross-page drill-down
  const REAL_SESSION_IDS = [
    "sess_9988776655443322",   // 合规审查官
    "sess_1122334455667788",   // 数据分析员
    "sess_aabbccddeeff0011",   // HR 面试助手
    "sess_shrimpx9y8z7w6v5",   // 供应链协同·员工虾
    "sess_a1b2c3d4e5f67890",   // 客服助手·小智
    "sess_f9e8d7c6b5a49382",   // 运维巡检员
  ];

  const total = 45; // 模拟总数
  
  for (let i = 0; i < total; i++) {
    const totalTokens = Math.floor(Math.random() * 50000) + 1000;
    const inputRatio = 0.7 + Math.random() * 0.2;
    const inputTokens = Math.floor(totalTokens * inputRatio);
    const outputTokens = totalTokens - inputTokens;
    const costYuan = Math.round((totalTokens / 1000000) * 3 * 10000) / 10000;

    const date = new Date(Date.now() - i * 3600000);
    const createTime = date.toISOString().slice(0, 16).replace("T", " ");

    // 模拟状态逻辑
    let status = "normal";
    let stopReason = "stop";
    let stepCount = Math.floor(Math.random() * 10) + 1;
    let duration = Math.floor(Math.random() * 60) + 10;

    if (i === 1) { // 强制设置第二个为异常死循环
      status = "loop";
      stopReason = "max_tokens (达到模型上限)";
      stepCount = 38;
      duration = 125;
    } else if (i % 5 === 3) {
      status = "interruption";
      stopReason = "gateway_timeout";
      stepCount = 5;
      duration = 45;
    } else if (i % 7 === 0) {
      status = "error";
      stopReason = "model_error";
    }

    // Use real session IDs for the first rows, generated IDs for the rest
    const session_id = i < REAL_SESSION_IDS.length
      ? REAL_SESSION_IDS[i]
      : `sess_cost_${100000 + i}`;

    allRows.push({
      session_id,
      agentName: agentPool[i % agentPool.length],
      userName: userPool[i % userPool.length],
      gateway: gatewayPool[i % gatewayPool.length],
      model: modelPool[i % modelPool.length],
      totalTokens,
      inputTokens,
      outputTokens,
      costYuan,
      createTime,
      status,
      stopReason,
      stepCount,
      duration,
    });
  }

  const filteredRows = allRows.filter(r => {
    if (statuses.length > 0 && !statuses.includes(r.status)) return false;
    return true;
  });

  const start = (page - 1) * pageSize;
  const rows = filteredRows.slice(start, start + pageSize);

  return { rows, total: filteredRows.length };
}
