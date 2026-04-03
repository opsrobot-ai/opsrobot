# otel_metrics_histogram 数据模型文档

## 概述

`otel_metrics_histogram` 表存储 OpenTelemetry 中的 Histogram（直方图）类型指标数据，用于记录值的分布情况。

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
| 9 | count | bigint(20) | 是 | 直方图计数 |
| 10 | sum | double | 是 | 直方图总和 |
| 11 | bucket_counts | array&lt;bigint(20)&gt; | 是 | 桶计数（数组） |
| 12 | explicit_bounds | array&lt;double&gt; | 是 | 桶边界（数组） |
| 13 | exemplars | array&lt;struct&lt;...&gt;&gt; | 是 | 示例数据 |
| 14 | min | double | 是 | 最小值 |
| 15 | max | double | 是 | 最大值 |
| 16 | aggregation_temporality | string | 是 | 聚合时序性 |
| 17 | resource_attributes | variant | 是 | 资源属性（JSON） |
| 18 | scope_name | string | 是 | Scope名称 |
| 19 | scope_version | string | 是 | Scope版本 |

## 统计信息

| 统计项 | 值 |
|--------|-----|
| 总记录数 | 83,463 |
| 指标数量 | 6 |
| 服务名称 | openclaw-gateway |

## 桶边界（explicit_bounds）

默认桶边界：
```
[0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000]
```

## 指标名称详细列表

### 公共维度
所有指标都包含以下公共维度：
- **service_name** (表字段)：服务名称
  - 可选值：`openclaw-gateway`

---

### 1. openclaw.context.tokens

| 属性 | 说明 |
|------|------|
| 描述 | 上下文 Token 数量 |
| 单位 | 1 |
| 记录数 | 约10,200 |
| 聚合时序性 | Cumulative |

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

### 2. openclaw.message.duration_ms

| 属性 | 说明 |
|------|------|
| 描述 | 消息处理耗时 |
| 单位 | ms |
| 记录数 | 约22,573 |
| 聚合时序性 | Cumulative |

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

### 3. openclaw.queue.depth

| 属性 | 说明 |
|------|------|
| 描述 | 队列深度 |
| 单位 | 1 |
| 记录数 | 约56,996 |
| 聚合时序性 | Cumulative |

#### 维度信息

| 维度键 | 说明 | 可选值 |
|--------|------|--------|
| lane | 队列通道 | main, session:agent:main:main |
| channel | 消息渠道（可选） | heartbeat |

#### Attributes 示例
```json
{"openclaw":{"lane":"main"}}
{"openclaw":{"lane":"session:agent:main:main"}}
{"openclaw":{"channel":"heartbeat"}}
```

---

### 4. openclaw.queue.wait_ms

| 属性 | 说明 |
|------|------|
| 描述 | 队列等待时间 |
| 单位 | ms |
| 记录数 | 约56,996 |
| 聚合时序性 | Cumulative |

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

### 5. openclaw.run.duration_ms

| 属性 | 说明 |
|------|------|
| 描述 | 运行耗时 |
| 单位 | ms |
| 记录数 | 约56,868 |
| 聚合时序性 | Cumulative |

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

### 6. openclaw.session.stuck_age_ms

| 属性 | 说明 |
|------|------|
| 描述 | 卡顿会话时长 |
| 单位 | ms |
| 记录数 | 约5,000 |
| 聚合时序性 | Cumulative |

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
| count | 直方图中值的数量 |
| sum | 直方图中所有值的总和 |
| min | 最小值 |
| max | 最大值 |

### Histogram 特有字段

| 字段名 | 说明 |
|--------|------|
| bucket_counts | 各个桶的计数，以 JSON 数组格式存储 |
| explicit_bounds | 桶的边界值，以 JSON 数组格式存储 |

### 属性字段

| 字段名 | 说明 |
|--------|------|
| attributes | 指标的维度属性，以 JSON 形式存储 |
| resource_attributes | 资源级别的属性，包含服务运行环境等信息 |
| exemplars | 指标的示例数据，用于关联追踪 |
| aggregation_temporality | 聚合时序性，常见值为 `Cumulative`（累积） |

### 标识字段

| 字段名 | 说明 |
|--------|------|
| service_instance_id | 服务实例的唯一标识 |
| start_time | 指标开始采集的时间 |
| scope_name | 指标的 Scope 名称 |
| scope_version | 指标的 Scope 版本 |

## SQL 查询示例

### 查询所有指标名称
```sql
SELECT DISTINCT metric_name
FROM otel_metrics_histogram
ORDER BY metric_name;
```

### 按指标名称统计
```sql
SELECT
  metric_name,
  metric_description,
  COUNT(*) as record_count
FROM otel_metrics_histogram
GROUP BY metric_name, metric_description
ORDER BY record_count DESC;
```

### 查询队列等待时间分布
```sql
SELECT
  timestamp,
  JSON_EXTRACT(attributes, '$.openclaw.lane') as lane,
  count,
  sum,
  min,
  max,
  bucket_counts,
  explicit_bounds
FROM otel_metrics_histogram
WHERE metric_name = 'openclaw.queue.wait_ms'
ORDER BY timestamp DESC
LIMIT 10;
```

### 查询队列深度
```sql
SELECT
  timestamp,
  JSON_EXTRACT(attributes, '$.openclaw.lane') as lane,
  JSON_EXTRACT(attributes, '$.openclaw.channel') as channel,
  count,
  sum,
  min,
  max
FROM otel_metrics_histogram
WHERE metric_name = 'openclaw.queue.depth'
ORDER BY timestamp DESC
LIMIT 10;
```

### 查询消息处理耗时
```sql
SELECT
  timestamp,
  JSON_EXTRACT(attributes, '$.openclaw.channel') as channel,
  count,
  sum,
  min,
  max,
  bucket_counts
FROM otel_metrics_histogram
WHERE metric_name = 'openclaw.message.duration_ms'
ORDER BY timestamp DESC
LIMIT 10;
```

### 计算平均耗时
```sql
SELECT
  JSON_EXTRACT(attributes, '$.openclaw.channel') as channel,
  AVG(sum / count) as avg_duration_ms
FROM otel_metrics_histogram
WHERE metric_name = 'openclaw.message.duration_ms'
  AND count > 0
GROUP BY channel;
```

### 查询指标的所有维度值
```sql
-- 查询某指标的某个维度的所有可选值
SELECT DISTINCT
  JSON_EXTRACT(attributes, '$.openclaw.lane') as lane
FROM otel_metrics_histogram
WHERE metric_name = 'openclaw.queue.wait_ms';
```

## 注意事项

1. **桶边界**：Histogram 类型使用固定的桶边界，便于计算百分位数。
2. **平均计算**：`sum / count` 可以得到平均值，但需要确保 `count &gt; 0`。
3. **百分位数估算**：通过 `bucket_counts` 和 `explicit_bounds` 可以估算 P50、P95、P99 等百分位数。
4. **JSON 属性**：`attributes` 和 `resource_attributes` 使用 JSON 格式存储，查询时需使用 `JSON_EXTRACT` 函数。
5. **公共维度**：`service_name` 是所有指标的公共维度，当前值为 `openclaw-gateway`。
