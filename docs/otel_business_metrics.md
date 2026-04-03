# OpenClaw 业务指标可观测文档

## 概述

基于 `otel_metrics_sum` 和 `otel_metrics_histogram` 表的数据模型，梳理可创建的业务指标清单。

---

## 一、成本指标

### 1.1 总成本指标

| 指标名称 | 类型 | 计算方式 | 说明 |
|---------|------|---------|------|
| cost.total.usd | Gauge | SUM(value) WHERE metric_name = 'openclaw.cost.usd' | 模型调用总成本 |
| cost.hourly.usd | Gauge | SUM(value) WHERE timestamp >= NOW() - INTERVAL 1 HOUR | 每小时成本 |
| cost.daily.usd | Gauge | SUM(value) WHERE timestamp >= DATE(NOW()) | 每日成本 |

### 1.2 分维度成本指标

| 指标名称 | 类型 | 维度 | 计算方式 |
|---------|------|------|---------|
| cost.by_channel.usd | Gauge | channel | SUM(value) GROUP BY channel |
| cost.by_model.usd | Gauge | model | SUM(value) GROUP BY model |
| cost.by_provider.usd | Gauge | provider | SUM(value) GROUP BY provider |

### 1.3 成本效益指标

| 指标名称 | 类型 | 计算方式 | 说明 |
|---------|------|---------|------|
| cost.per_token | Gauge | cost.total.usd / token.total | 每 Token 成本 |
| cost.per_request | Gauge | cost.total.usd / message.processed | 每请求成本 |
| cost.per_session | Gauge | cost.total.usd / session.total | 每 Session 成本 |

---

## 二、Token 使用指标

### 2.1 Token 总量指标

| 指标名称 | 类型 | 计算方式 |
|---------|------|---------|
| token.total | Gauge | SUM(value) WHERE metric_name = 'openclaw.tokens' AND token = 'total' |
| token.hourly | Gauge | SUM(value) WHERE timestamp >= NOW() - INTERVAL 1 HOUR AND token = 'total' |
| token.daily | Gauge | SUM(value) WHERE timestamp >= DATE(NOW()) AND token = 'total' |

### 2.2 Token 分类型指标

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| token.prompt | Gauge | Prompt Token 消耗量 |
| token.input | Gauge | Input Token 消耗量 |
| token.output | Gauge | Output Token 消耗量 |
| token.cache_read | Gauge | Cache Read Token 量 |
| token.cache_write | Gauge | Cache Write Token 量 |

### 2.3 Cache 效率指标

| 指标名称 | 类型 | 计算方式 |
|---------|------|---------|
| cache.hit_rate | Gauge | token.cache_read / (token.cache_read + token.cache_write) |

### 2.4 Token 分维度指标

| 指标名称 | 类型 | 维度 |
|---------|------|------|
| token.by_channel | Gauge | channel |
| token.by_model | Gauge | model |
| token.by_provider | Gauge | provider |

---

## 三、消息处理指标

### 3.1 消息数量指标

| 指标名称 | 类型 | 计算方式 |
|---------|------|---------|
| message.processed.total | Counter | SUM(value) WHERE metric_name = 'openclaw.message.processed' |
| message.queued.total | Gauge | SUM(value) WHERE metric_name = 'openclaw.message.queued' |
| message.queue.depth | Gauge | message.queued.total - message.processed.total |

### 3.2 消息处理速率

| 指标名称 | 类型 | 计算方式 |
|---------|------|---------|
| message.processed.rate | Rate | RATE(message.processed.total) |
| message.queued.rate | Rate | RATE(message.queued.total) |

### 3.3 消息处理耗时（Histogram）

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| message.duration.p50 | Histogram | 消息处理耗时 P50 |
| message.duration.p95 | Histogram | 消息处理耗时 P95 |
| message.duration.p99 | Histogram | 消息处理耗时 P99 |
| message.duration.avg | Gauge | sum / count |

### 3.4 消息分维度指标

| 指标名称 | 类型 | 维度 |
|---------|------|------|
| message.by_channel | Gauge | channel |

---

## 四、会话(Session)指标

### 4.1 会话状态指标

| 指标名称 | 类型 | 计算方式 |
|---------|------|---------|
| session.total | Counter | SUM(value) WHERE metric_name = 'openclaw.session.state' |
| session.active | Gauge | SUM(value) WHERE state = 'processing' |
| session.idle | Gauge | SUM(value) WHERE state = 'idle' |
| session.started | Counter | SUM(value) WHERE reason = 'run_started' |
| session.completed | Counter | SUM(value) WHERE reason = 'run_completed' |

### 4.2 会话处理指标

| 指标名称 | 类型 | 计算方式 |
|---------|------|---------|
| session.processing.rate | Rate | RATE(session.started) |
| session.completion.rate | Rate | RATE(session.completed) |
| session.success_rate | Gauge | session.completed / session.started |

### 4.3 会话卡顿指标

| 指标名称 | 类型 | 计算方式 |
|---------|------|---------|
| session.stuck.current | Gauge | value WHERE metric_name = 'openclaw.session.stuck' |
| session.stuck.total | Counter | SUM(value) WHERE metric_name = 'openclaw.session.stuck' |
| session.stuck.age | Histogram | openclaw.session.stuck_age_ms |

### 4.4 会话运行耗时（Histogram）

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| run.duration.p50 | Histogram | 运行耗时 P50 |
| run.duration.p95 | Histogram | 运行耗时 P95 |
| run.duration.p99 | Histogram | 运行耗时 P99 |
| run.duration.avg | Gauge | sum / count |

---

## 五、队列指标

### 5.1 队列深度指标

| 指标名称 | 类型 | 计算方式 |
|---------|------|---------|
| queue.depth | Histogram | openclaw.queue.depth |
| queue.depth.avg | Gauge | sum / count |
| queue.depth.max | Gauge | max |

### 5.2 队列操作指标

| 指标名称 | 类型 | 计算方式 |
|---------|------|---------|
| queue.enqueue.total | Counter | SUM(value) WHERE metric_name = 'openclaw.queue.lane.enqueue' |
| queue.dequeue.total | Counter | SUM(value) WHERE metric_name = 'openclaw.queue.lane.dequeue' |
| queue.enqueue.rate | Rate | RATE(queue.enqueue.total) |
| queue.dequeue.rate | Rate | RATE(queue.dequeue.total) |
| queue.balance | Gauge | queue.enqueue.total - queue.dequeue.total |

### 5.3 队列等待时间（Histogram）

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| queue.wait.p50 | Histogram | 队列等待时间 P50 |
| queue.wait.p95 | Histogram | 队列等待时间 P95 |
| queue.wait.p99 | Histogram | 队列等待时间 P99 |
| queue.wait.avg | Gauge | sum / count |

### 5.4 队列分维度指标

| 指标名称 | 类型 | 维度 |
|---------|------|------|
| queue.by_lane | Gauge | lane |

---

## 六、上下文指标

### 6.1 上下文 Token 指标

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| context.tokens.p50 | Histogram | 上下文 Token P50 |
| context.tokens.p95 | Histogram | 上下文 Token P95 |
| context.tokens.p99 | Histogram | 上下文 Token P99 |
| context.tokens.avg | Gauge | sum / count |

---

## 七、综合业务指标

### 7.1 核心业务指标

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| active.sessions | Gauge | 当前活跃会话数 |
| stuck.sessions | Gauge | 当前卡顿会话数 |
| queue.depth.current | Gauge | 当前队列深度 |
| hourly.cost | Gauge | 每小时成本 |
| daily.cost | Gauge | 每日成本 |
| cache.hit_rate | Gauge | Cache 命中率 |

### 7.2 性能指标

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| message.latency.p95 | Histogram | 消息处理延迟 P95 |
| run.latency.p95 | Histogram | 运行耗时 P95 |
| queue.wait.p95 | Histogram | 队列等待时间 P95 |
| token.utilization | Gauge | Token 利用率 |

### 7.3 成本指标

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| cost.per_hour | Gauge | 每小时成本 |
| cost.prediction.daily | Prediction | 预测日成本 |
| cost.vs.budget | Gauge | 成本 vs 预算 |

---

## 八、告警规则

### 8.1 严重告警（Critical）

| 告警名称 | 条件 | 说明 |
|---------|------|------|
| 卡顿会话超限 | session.stuck.current > 10 | 卡顿会话超过阈值 |
| 队列深度超限 | queue.depth > 1000 | 队列深度超过阈值 |
| 成本超限 | hourly.cost > 100 USD | 每小时成本超限 |
| 无数据 | 无新数据 > 5分钟 | 服务不可用 |

### 8.2 警告告警（Warning）

| 告警名称 | 条件 | 说明 |
|---------|------|------|
| 成本增长率异常 | cost_rate > 50% | 成本增长过快 |
| Token消耗异常 | token_rate > 50% | Token消耗异常 |
| 处理延迟增加 | message.duration.p95 > 30s | 处理延迟增加 |
| Cache命中率低 | cache.hit_rate < 50% | Cache命中率过低 |
| 会话堆积 | session.active > 100 | 会话堆积 |

### 8.3 预警通知（Info）

| 告警名称 | 条件 | 说明 |
|---------|------|------|
| 日成本超预算 | daily.cost > 预算 80% | 日成本即将超预算 |
| Token使用超预算 | token.daily > 预算 80% | Token使用即将超预算 |
| 队列积压增加 | queue.depth 持续增长 | 队列积压正在增加 |

---

## 九、SQL 查询示例

### 9.1 查询总成本
```sql
SELECT SUM(value) as total_cost
FROM otel_metrics_sum
WHERE metric_name = 'openclaw.cost.usd';
```

### 9.2 查询每小时成本
```sql
SELECT
  DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00') as hour,
  SUM(value) as hourly_cost
FROM otel_metrics_sum
WHERE metric_name = 'openclaw.cost.usd'
GROUP BY hour
ORDER BY hour DESC;
```

### 9.3 查询 Cache 命中率
```sql
SELECT
  (SUM(CASE WHEN token = 'cache_read' THEN value ELSE 0 END) /
   SUM(CASE WHEN token IN ('cache_read', 'cache_write') THEN value ELSE 0 END)) * 100 as cache_hit_rate
FROM otel_metrics_sum
WHERE metric_name = 'openclaw.tokens';
```

### 9.4 查询当前活跃会话数
```sql
SELECT SUM(value) as active_sessions
FROM otel_metrics_sum
WHERE metric_name = 'openclaw.session.state'
  AND JSON_EXTRACT(attributes, '$.openclaw.state') = '"processing"';
```

### 9.5 查询队列深度分布（P50/P95）
```sql
SELECT
  count,
  sum,
  min,
  max,
  bucket_counts,
  explicit_bounds
FROM otel_metrics_histogram
WHERE metric_name = 'openclaw.queue.depth'
ORDER BY timestamp DESC
LIMIT 1;
```

---

## 十、指标维度参考

### 公共维度
- **service_name**: openclaw-gateway
- **channel**: webchat, heartbeat
- **model**: MiniMax-M2.7
- **provider**: minimax
- **lane**: main, session:agent:main:main
- **state**: processing, idle
- **reason**: run_started, run_completed, message_start, message_completed
- **token**: total, prompt, input, output, cache_read, cache_write

### 数据来源
- **otel_metrics_sum**: 8个指标，147,855条记录
- **otel_metrics_histogram**: 6个指标，83,463条记录
