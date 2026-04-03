# otel_metrics_sum 数据模型文档

## 概述

`otel_metrics_sum` 表存储 OpenTelemetry 中的 Sum（求和）类型指标数据，用于记录累积值指标。

## 数据库信息

| 项目 | 值 |
|------|-----|
| 数据库 | opsRobot |
| 存储引擎 | Doris |
| 数据时间范围 | 2026-03-30 ~ 2026-04-01 |

## 表结构

| 序号 | 列名 | 数据类型 | 可空 | 说明 |
|------|------|----------|------|------|
| 1 | service_name | varchar(200) | 是 | 服务名称 |
| 2 | timestamp | datetime(6) | 是 | 时间戳（微秒精度） |
| 3 | service_instance_id | varchar(200) | 是 | 服务实例ID |
| 4 | metric_name | varchar(200) | 是 | 指标名称 |
| 5 | metric_description | string | 是 | 指标描述 |
| 6 | metric_unit | string | 是 | 指标单位 |
| 7 | attributes | variant | 是 | 指标属性/维度（JSON） |
| 8 | start_time | datetime(6) | 是 | 指标起始时间 |
| 9 | value | double | 是 | 指标值 |
| 10 | exemplars | array&lt;struct&lt;...&gt;&gt; | 是 | 示例数据 |
| 11 | aggregation_temporality | string | 是 | 聚合时序性（Cumulative） |
| 12 | is_monotonic | tinyint(1) | 是 | 是否单调递增 |
| 13 | resource_attributes | variant | 是 | 资源属性（JSON） |
| 14 | scope_name | string | 是 | Scope名称 |
| 15 | scope_version | string | 是 | Scope版本 |

## 统计信息

| 统计项 | 值 |
|--------|-----|
| 总记录数 | 147,855 |
| 指标数量 | 8 |
| 服务名称 | openclaw-gateway |

## 指标名称详细列表

### 公共维度
所有指标都包含以下公共维度：
- **service_name** (表字段)：服务名称
  - 可选值：`openclaw-gateway`

---

### 1. openclaw.cost.usd

| 属性 | 说明 |
|------|------|
| 描述 | 模型调用成本（美元） |
| 单位 | 1 |
| 记录数 | 约10,200 |
| is_monotonic | 1 |

#### 维度信息

| 维度键 | 说明 | 可选值 |
|--------|------|--------|
| channel | 消息渠道 | webchat, heartbeat |
| model | AI模型 | MiniMax-M2.7 |
| provider | 提供商 | minimax |

#### Attributes 示例
```json
{"openclaw":{"channel":"webchat","model":"MiniMax-M2.7","provider":"minimax"}}
{"openclaw":{"channel":"heartbeat","model":"MiniMax-M2.7","provider":"minimax"}}
```

---

### 2. openclaw.tokens

| 属性 | 说明 |
|------|------|
| 描述 | Token 使用量 |
| 单位 | 1 |
| 记录数 | 约73,500 |
| is_monotonic | 1 |

#### 维度信息

| 维度键 | 说明 | 可选值 |
|--------|------|--------|
| channel | 消息渠道 | webchat, heartbeat |
| model | AI模型 | MiniMax-M2.7 |
| provider | 提供商 | minimax |
| token | Token类型 | total, prompt, input, output, cache_read, cache_write |

#### Attributes 示例
```json
{"openclaw":{"channel":"webchat","model":"MiniMax-M2.7","provider":"minimax","token":"total"}}
{"openclaw":{"channel":"webchat","model":"MiniMax-M2.7","provider":"minimax","token":"prompt"}}
{"openclaw":{"channel":"webchat","model":"MiniMax-M2.7","provider":"minimax","token":"input"}}
{"openclaw":{"channel":"webchat","model":"MiniMax-M2.7","provider":"minimax","token":"output"}}
{"openclaw":{"channel":"webchat","model":"MiniMax-M2.7","provider":"minimax","token":"cache_read"}}
{"openclaw":{"channel":"webchat","model":"MiniMax-M2.7","provider":"minimax","token":"cache_write"}}
{"openclaw":{"channel":"heartbeat","model":"MiniMax-M2.7","provider":"minimax","token":"total"}}
{"openclaw":{"channel":"heartbeat","model":"MiniMax-M2.7","provider":"minimax","token":"prompt"}}
```

---

### 3. openclaw.message.processed

| 属性 | 说明 |
|------|------|
| 描述 | 已处理的消息数量 |
| 单位 | 1 |
| 记录数 | 约4,389 |
| is_monotonic | 1 |

#### 维度信息

| 维度键 | 说明 | 可选值 |
|--------|------|--------|
| channel | 消息渠道 | webchat, heartbeat |

#### Attributes 示例
```json
{"openclaw":{"channel":"webchat"}}
{"openclaw":{"channel":"heartbeat"}}
```

---

### 4. openclaw.message.queued

| 属性 | 说明 |
|------|------|
| 描述 | 排队的消息数量 |
| 单位 | 1 |
| 记录数 | 约4,435 |
| is_monotonic | 1 |

#### 维度信息

| 维度键 | 说明 | 可选值 |
|--------|------|--------|
| channel | 消息渠道 | webchat, heartbeat |

#### Attributes 示例
```json
{"openclaw":{"channel":"webchat"}}
{"openclaw":{"channel":"heartbeat"}}
```

---

### 5. openclaw.queue.lane.dequeue

| 属性 | 说明 |
|------|------|
| 描述 | 命令队列出队事件 |
| 单位 | 1 |
| 记录数 | 约113,992 |
| is_monotonic | 1 |

#### 维度信息

| 维度键 | 说明 | 可选值 |
|--------|------|--------|
| lane | 队列通道 | main, session:agent:main:main |

#### Attributes 示例
```json
{"openclaw":{"lane":"main"}}
{"openclaw":{"lane":"session:agent:main:main"}}
```

---

### 6. openclaw.queue.lane.enqueue

| 属性 | 说明 |
|------|------|
| 描述 | 命令队列入队事件 |
| 单位 | 1 |
| 记录数 | 约113,992 |
| is_monotonic | 1 |

#### 维度信息

| 维度键 | 说明 | 可选值 |
|--------|------|--------|
| lane | 队列通道 | main, session:agent:main:main |

#### Attributes 示例
```json
{"openclaw":{"lane":"main"}}
{"openclaw":{"lane":"session:agent:main:main"}}
```

---

### 7. openclaw.session.state

| 属性 | 说明 |
|------|------|
| 描述 | Session 状态转换 |
| 单位 | 1 |
| 记录数 | 约159,163 |
| is_monotonic | 1 |

#### 维度信息

| 维度键 | 说明 | 可选值 |
|--------|------|--------|
| state | 会话状态 | processing, idle |
| reason | 状态原因 | run_started, run_completed, message_start, message_completed |

#### Attributes 示例
```json
{"openclaw":{"reason":"run_completed","state":"idle"}}
{"openclaw":{"reason":"run_started","state":"processing"}}
{"openclaw":{"reason":"message_start","state":"processing"}}
{"openclaw":{"reason":"message_completed","state":"idle"}}
```

---

### 8. openclaw.session.stuck

| 属性 | 说明 |
|------|------|
| 描述 | 卡住的 Session 数量 |
| 单位 | 1 |
| 记录数 | 约5,000 |
| is_monotonic | 1 |

#### 维度信息
无额外维度

#### Attributes 示例
```json
{"openclaw":{}}
```

---

## 资源属性（resource_attributes）

```json
{
  "host":{
    "arch":"amd64",
    "name":"0a1b9f1f9725"
  },
  "process":{
    "command":"/app/openclaw.mjs",
    "command_args":[
      "/usr/local/bin/node",
      "--disable-warning=ExperimentalWarning",
      "--max-old-space-size=3072",
      "/app/openclaw.mjs",
      "gateway",
      "--port",
      "18789",
      "--allow-unconfigured"
    ],
    "executable":{"name":"openclaw-gateway","path":"/usr/local/bin/node"},
    "owner":"root",
    "pid":189,
    "runtime":{"description":"Node.js","name":"nodejs","version":"24.14.0"}
  },
  "service":{"name":"openclaw-gateway"}
}
```

## 字段说明

### 核心字段

| 字段名 | 说明 |
|--------|------|
| service_name | 服务名称，如 `openclaw-gateway` |
| timestamp | 指标记录的时间戳 |
| metric_name | 指标名称 |
| metric_description | 指标的描述信息 |
| metric_unit | 指标的计量单位 |
| value | 指标的当前值 |

### 属性字段

| 字段名 | 说明 |
|--------|------|
| attributes | 指标的维度属性，以 JSON 形式存储，用于细分指标 |
| resource_attributes | 资源级别的属性，包含服务运行环境等信息 |
| exemplars | 指标的示例数据，用于关联追踪 |
| aggregation_temporality | 聚合时序性，常见值为 `Cumulative`（累积） |

### 标识字段

| 字段名 | 说明 |
|--------|------|
| service_instance_id | 服务实例的唯一标识 |
| start_time | 指标开始采集的时间 |
| is_monotonic | 是否单调递增，1表示是，0表示否 |
| scope_name | 指标的 Scope 名称 |
| scope_version | 指标的 Scope 版本 |

## SQL 查询示例

### 查询所有指标名称
```sql
SELECT DISTINCT metric_name
FROM otel_metrics_sum
ORDER BY metric_name;
```

### 按指标名称统计
```sql
SELECT
  metric_name,
  metric_description,
  COUNT(*) as record_count
FROM otel_metrics_sum
GROUP BY metric_name, metric_description
ORDER BY record_count DESC;
```

### 查询 Token 使用量
```sql
SELECT
  JSON_EXTRACT(attributes, '$.openclaw.channel') as channel,
  JSON_EXTRACT(attributes, '$.openclaw.token') as token_type,
  SUM(value) as total_tokens
FROM otel_metrics_sum
WHERE metric_name = 'openclaw.tokens'
GROUP BY channel, token_type
ORDER BY channel, token_type;
```

### 查询成本指标
```sql
SELECT
  JSON_EXTRACT(attributes, '$.openclaw.channel') as channel,
  JSON_EXTRACT(attributes, '$.openclaw.model') as model,
  SUM(value) as total_cost,
  COUNT(*) as request_count,
  AVG(value) as avg_cost
FROM otel_metrics_sum
WHERE metric_name = 'openclaw.cost.usd'
GROUP BY channel, model;
```

### 查询会话状态
```sql
SELECT
  JSON_EXTRACT(attributes, '$.openclaw.state') as state,
  JSON_EXTRACT(attributes, '$.openclaw.reason') as reason,
  SUM(value) as count
FROM otel_metrics_sum
WHERE metric_name = 'openclaw.session.state'
GROUP BY state, reason;
```

### 查询指标的所有维度值
```sql
-- 查询某指标的某个维度的所有可选值
SELECT DISTINCT
  JSON_EXTRACT(attributes, '$.openclaw.channel') as channel
FROM otel_metrics_sum
WHERE metric_name = 'openclaw.cost.usd';
```

## 注意事项

1. **聚合时序性**：所有指标的 `aggregation_temporality` 均为 `Cumulative`（累积型），表示从 `start_time` 到 `timestamp` 的累积值。
2. **单调性**：`is_monotonic = 1` 表示指标值只增不减，适用于计数器类型。
3. **JSON 属性**：`attributes` 和 `resource_attributes` 使用 JSON 格式存储，查询时需使用 `JSON_EXTRACT` 函数。
4. **公共维度**：`service_name` 是所有指标的公共维度，当前值为 `openclaw-gateway`。
