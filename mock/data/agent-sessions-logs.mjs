/**
 * Mock: GET /api/agent-sessions-logs?sessionId=
 * 对齐 backend/agentSessionsQuery.mjs → queryAgentSessionsLogsRaw()
 * 返回数组，每项为 Doris `otel.agent_sessions_logs` 行
 */

function isoStr(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** 为所有已知 sessionId 生成一组日志行 */
const LOGS_BY_SESSION = {
  "sess_a1b2c3d4e5f67890": () => [
    {
      id: "log-001",
      sessionId: "sess_a1b2c3d4e5f67890",
      timestamp: isoStr(-3600_000),
      type: "session",
      version: "1.0",
      provider: "",
      model_id: "",
      message_model: "",
      message_role: "",
      message_tool_name: "",
      message_is_error: 0,
      message_usage_input: 0,
      message_usage_output: 0,
      message_usage_total_tokens: 0,
      message_stop_reason: "",
      message_details_exit_code: null,
      parent_id: "",
      log_attributes: JSON.stringify({
        type: "session",
        id: "sess_a1b2c3d4e5f67890",
        version: "1.0",
        timestamp: isoStr(-3600_000),
      }),
    },
    {
      id: "log-002",
      sessionId: "sess_a1b2c3d4e5f67890",
      timestamp: isoStr(-3599_000),
      type: "message",
      version: "1.0",
      provider: "openai",
      model_id: "gpt-4o-mini",
      message_model: "gpt-4o-mini",
      message_role: "user",
      message_tool_name: "",
      message_is_error: 0,
      message_usage_input: 0,
      message_usage_output: 0,
      message_usage_total_tokens: 0,
      message_stop_reason: "",
      message_details_exit_code: null,
      parent_id: "log-001",
      log_attributes: JSON.stringify({
        type: "message",
        timestamp: isoStr(-3599_000),
        message: {
          role: "user",
          content: [{ type: "text", text: "帮我查一下工单 ORD-9821 的状态" }],
        },
      }),
    },
    {
      id: "log-003",
      sessionId: "sess_a1b2c3d4e5f67890",
      timestamp: isoStr(-3598_000),
      type: "message",
      version: "1.0",
      provider: "openai",
      model_id: "gpt-4o-mini",
      message_model: "gpt-4o-mini",
      message_role: "assistant",
      message_tool_name: "",
      message_is_error: 0,
      message_usage_input: 2400,
      message_usage_output: 1200,
      message_usage_total_tokens: 3600,
      message_stop_reason: "toolCall",
      message_details_exit_code: null,
      parent_id: "log-001",
      log_attributes: JSON.stringify({
        type: "message",
        timestamp: isoStr(-3598_000),
        message: {
          role: "assistant",
          model: "gpt-4o-mini",
          stopReason: "toolCall",
          usage: { input: 2400, output: 1200, totalTokens: 3600 },
          content: [
            {
              type: "thinking",
              thinking: "用户请求查询工单状态，需要调用 CRM 工具查找工单 ORD-9821",
            },
            {
              type: "toolCall",
              id: "tc-001",
              name: "crm.lookup_ticket",
              arguments: { order_id: "ORD-9821" },
            },
          ],
        },
      }),
    },
    {
      id: "log-004",
      sessionId: "sess_a1b2c3d4e5f67890",
      timestamp: isoStr(-3597_500),
      type: "message",
      version: "1.0",
      provider: "openai",
      model_id: "gpt-4o-mini",
      message_model: "",
      message_role: "toolResult",
      message_tool_name: "crm.lookup_ticket",
      message_is_error: 0,
      message_usage_input: 0,
      message_usage_output: 0,
      message_usage_total_tokens: 0,
      message_stop_reason: "",
      message_details_exit_code: null,
      parent_id: "log-003",
      log_attributes: JSON.stringify({
        type: "message",
        timestamp: isoStr(-3597_500),
        message: {
          role: "toolResult",
          toolName: "crm.lookup_ticket",
          toolCallId: "tc-001",
          isError: false,
          content: [
            {
              type: "text",
              text: '{"orderId":"ORD-9821","status":"处理中","assignee":"服务台组B","created":"2026-03-28"}',
            },
          ],
        },
      }),
    },
    {
      id: "log-005",
      sessionId: "sess_a1b2c3d4e5f67890",
      timestamp: isoStr(-3596_000),
      type: "message",
      version: "1.0",
      provider: "openai",
      model_id: "gpt-4o-mini",
      message_model: "gpt-4o-mini",
      message_role: "assistant",
      message_tool_name: "",
      message_is_error: 0,
      message_usage_input: 3800,
      message_usage_output: 5440,
      message_usage_total_tokens: 9240,
      message_stop_reason: "end_turn",
      message_details_exit_code: null,
      parent_id: "log-001",
      log_attributes: JSON.stringify({
        type: "message",
        timestamp: isoStr(-3596_000),
        message: {
          role: "assistant",
          model: "gpt-4o-mini",
          stopReason: "end_turn",
          usage: { input: 3800, output: 5440, totalTokens: 9240 },
          content: [
            {
              type: "text",
              text: "您好！工单 ORD-9821 的当前状态为**处理中**，由服务台组 B 负责跟进。该工单创建于 2026-03-28。如需进一步了解详情或有其他问题，请随时告诉我。",
            },
          ],
        },
      }),
    },
  ],
};

/** 为未知 sessionId 生成简单的 fallback 日志 */
function fallbackLogs(sessionId) {
  return [
    {
      id: "log-fallback-001",
      sessionId,
      timestamp: isoStr(-1800_000),
      type: "session",
      version: "1.0",
      provider: "",
      model_id: "",
      message_model: "",
      message_role: "",
      message_tool_name: "",
      message_is_error: 0,
      message_usage_input: 0,
      message_usage_output: 0,
      message_usage_total_tokens: 0,
      message_stop_reason: "",
      message_details_exit_code: null,
      parent_id: "",
      log_attributes: JSON.stringify({
        type: "session",
        id: sessionId,
        version: "1.0",
        timestamp: isoStr(-1800_000),
      }),
    },
    {
      id: "log-fallback-002",
      sessionId,
      timestamp: isoStr(-1799_000),
      type: "message",
      version: "1.0",
      provider: "openai",
      model_id: "gpt-4o-mini",
      message_model: "gpt-4o-mini",
      message_role: "user",
      message_tool_name: "",
      message_is_error: 0,
      message_usage_input: 0,
      message_usage_output: 0,
      message_usage_total_tokens: 0,
      message_stop_reason: "",
      message_details_exit_code: null,
      parent_id: "log-fallback-001",
      log_attributes: JSON.stringify({
        type: "message",
        timestamp: isoStr(-1799_000),
        message: {
          role: "user",
          content: [{ type: "text", text: "（Mock 模式示例用户消息）" }],
        },
      }),
    },
    {
      id: "log-fallback-003",
      sessionId,
      timestamp: isoStr(-1797_000),
      type: "message",
      version: "1.0",
      provider: "openai",
      model_id: "gpt-4o-mini",
      message_model: "gpt-4o-mini",
      message_role: "assistant",
      message_tool_name: "",
      message_is_error: 0,
      message_usage_input: 1200,
      message_usage_output: 800,
      message_usage_total_tokens: 2000,
      message_stop_reason: "end_turn",
      message_details_exit_code: null,
      parent_id: "log-fallback-001",
      log_attributes: JSON.stringify({
        type: "message",
        timestamp: isoStr(-1797_000),
        message: {
          role: "assistant",
          model: "gpt-4o-mini",
          stopReason: "end_turn",
          usage: { input: 1200, output: 800, totalTokens: 2000 },
          content: [{ type: "text", text: "这是 Mock 模式的示例回复。" }],
        },
      }),
    },
  ];
}

export function mockAgentSessionsLogs(sessionId) {
  const sid = String(sessionId ?? "").trim();
  if (!sid) return [];
  const generator = LOGS_BY_SESSION[sid];
  return generator ? generator() : fallbackLogs(sid);
}
