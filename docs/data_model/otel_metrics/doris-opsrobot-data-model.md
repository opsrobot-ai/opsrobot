# Doris 数据库数据模型文档

## 文档信息

| 项目 | 内容 |
|------|------|
| 数据库 | `opsRobot` |
| 文档版本 | 1.0 |
| 生成日期 | 2026-04-01 |
| 适用引擎 | Apache Doris 4.0.4（Docker 部署） |
| 连接方式 | `docker exec doris-be mysql -h doris-fe -P9030 -uroot` |

---

## 一、整体数据架构

### 1.1 数据库概览

`opsRobot` 数据库是 OpenClaw 平台的可观测性数据中枢，用于存储来自 OTel（OpenTelemetry）收集器的各类指标数据。当前数据库共包含以下 5 张表：

| 表名 | 用途 | 行数（约） |
|------|------|-----------|
| `otel_metrics_sum` | Monotonic Counter 增量求和指标 | 134,148 |
| `otel_metrics_histogram` | Histogram 分布统计指标 | 75,661 |
| `otel_metrics_gauge` | Gauge 瞬时值指标 | - |
| `otel_metrics_exponential_histogram` | 指数直方图指标 | - |
| `otel_metrics_summary` | Summary 摘要指标 | - |

### 1.2 数据来源

所有指标数据均来自 OpenClaw Gateway 服务（`service_name = openclaw-gateway`），通过 OpenTelemetry Collector（容器 `otel-collector`）采集后写入 Doris。采集的指标涵盖以下业务维度：

- **消息队列**：排队、出队、消息处理
- **Token 使用**：Token 消耗与上下文 Token 统计
- **会话管理**：会话状态切换、会话卡死检测
- **队列通道**：多 lane 队列操作
- **运行耗时**：消息处理延迟、排队等待时间

### 1.3 技术选型说明

两张表在 Doris 中的存储配置如下：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 引擎类型 | `OLAP` | Doris 在线分析引擎 |
| 模型 | `DUPLICATE KEY` | 允许重复，允许对历史数据追加同维度指标 |
| 分区策略 | `RANGE` 按天 | 按 `timestamp` 字段按天分区，配合动态分区自动管理 |
| 分桶策略 | `RANDOM BUCKETS AUTO` | 自动分桶，Doris 自行管理数据分布 |
| 索引 | `INVERTED` 全字段倒排索引 | 所有字段均建倒排索引，支持高速关键词检索 |
| Compaction 策略 | `time_series` | 时序数据优化合并，减少 IO |
| 存储介质 | `HDD` | 当前配置 |

---

## 二、`otel_metrics_sum` 表

### 2.1 表用途

`otel_metrics_sum` 用于存储 **Monotonic Counter（单调递增计数器）** 类型的指标。在 OTel 语义中，Counter 类型指标记录的是持续递增的总量值（如 Token 总消耗量、消息总处理数），每次上报携带的是该时刻的累计值，Doris 存储的是原始累计值。

### 2.2 字段说明

| 字段名 | 数据类型 | Nullable | Key | 说明 |
|--------|----------|----------|-----|------|
| `service_name` | `varchar(200)` | Yes | DUPLICATE KEY | 服务名称，如 `openclaw-gateway` |
| `timestamp` | `datetime(6)` | Yes | DUPLICATE KEY | 指标数据点的时间戳（微秒精度） |
| `service_instance_id` | `varchar(200)` | Yes | - | 服务实例唯一标识 |
| `metric_name` | `varchar(200)` | Yes | - | 指标名称（OTel 标准格式），如 `openclaw.tokens` |
| `metric_description` | `text` | Yes | - | 指标的中文/英文描述 |
| `metric_unit` | `text` | Yes | - | 指标单位，如 `1`、`ms`、`bytes` |
| `attributes` | `variant` | Yes | - | 指标维度标签（JSON 结构），最多 2048 个子列 |
| `start_time` | `datetime(6)` | Yes | - | 指标聚合周期起始时间 |
| `value` | `double` | Yes | - | 计数器累计值（原始上报值） |
| `exemplars` | `array<struct>` | Yes | - | 追踪关联的样本数据（Trace Exemplar） |
| `aggregation_temporality` | `text` | Yes | - | 聚合时序性，当前值：`Cumulative`（累积） |
| `is_monotonic` | `boolean` | Yes | - | 是否单调递增，Counter 类型固定为 `true` |
| `resource_attributes` | `variant` | Yes | - | 资源级别属性（JSON），包含 host/process/service 等 |
| `scope_name` | `text` | Yes | - | OTel Scope 名称 |
| `scope_version` | `text` | Yes | - | OTel Scope 版本 |

#### 2.2.1 `attributes` 字段（Variant 类型）

`attributes` 是 Doris 的 `variant` 类型列，以 JSON 结构存储指标的维度标签。示例：

```json
{
  "openclaw": {
    "lane": "main"
  }
}
```

```json
{
  "openclaw": {
    "reason": "run_completed",
    "state": "idle"
  }
}
```

> `variant` 类型允许 Doris 将 JSON 中的各字段索引为独立的虚拟列，配合倒排索引实现高速过滤查询。例如可以按 `attributes.openclaw.lane = 'main'` 直接过滤。

#### 2.2.2 `exemplars` 字段（Array of Struct）

用于存储追踪关联样本，允许将指标数据点与具体的 Trace（调用链）关联：

```sql
array<struct<
  filtered_attributes: map<text,text>,   -- 过滤后的样本属性
  timestamp:        datetime(6),           -- 样本采集时间
  value:           double,                 -- 样本值
  span_id:         text,                   -- Trace Span ID
  trace_id:        text                    -- Trace ID
>>
```

> 当前表中 `exemplars` 字段均为 NULL（未采集追踪样本）。

#### 2.2.3 `resource_attributes` 字段（Variant 类型）

存储服务运行时的资源上下文信息：

```json
{
  "host": {
    "arch": "amd64",
    "name": "0a1b9f1f9725"
  },
  "process": {
    "command": "/app/openclaw.mjs",
    "command_args": ["/usr/local/bin/node", "/app/openclaw.mjs", "gateway", ...],
    "executable": {
      "name": "openclaw-gateway",
      "path": "/usr/local/bin/node"
    },
    "owner": "root",
    "pid": 189,
    "runtime": {
      "description": "Node.js",
      "name": "nodejs",
      "version": "24.14.0"
    }
  },
  "service": {
    "name": "openclaw-gateway"
  }
}
```

### 2.3 当前存储的指标列表

| metric_name | metric_unit | 说明 |
|-------------|-------------|------|
| `openclaw.message.queued` | `1` | 排入队列的消息数量 |
| `openclaw.cost.usd` | `1` | Token 消耗成本（USD） |
| `openclaw.session.state` | `1` | 会话状态切换次数 |
| `openclaw.queue.lane.enqueue` | `1` | 各 Lane 入队次数 |
| `openclaw.tokens` | `1` | Token 总消耗量 |
| `openclaw.queue.lane.dequeue` | `1` | 各 Lane 出队次数 |
| `openclaw.session.stuck` | `1` | 会话卡死次数 |
| `openclaw.message.processed` | `1` | 已处理消息总量 |

### 2.4 数据示例

```
+---------------+----------------------------+-------------------------+---------------+------------------+----+
| service_name  | metric_name                | aggregation_temporality | is_monotonic  | start_time       |value|
+---------------+----------------------------+-------------------------+---------------+------------------+----+
| openclaw-gateway | openclaw.tokens           | Cumulative              | true          | 2026-04-01 06:13 | 27418 |
| openclaw-gateway | openclaw.tokens           | Cumulative              | true          | 2026-04-01 06:13 | 219   |
| openclaw-gateway | openclaw.tokens           | Cumulative              | true          | 2026-04-01 06:13 | 62677 |
| openclaw-gateway | openclaw.tokens           | Cumulative              | true          | 2026-04-01 06:13 | 39032 |
| openclaw-gateway | openclaw.tokens           | Cumulative              | true          | 2026-04-01 06:13 | 129127|
+---------------+----------------------------+-------------------------+---------------+------------------+----+
```

> 注意：同一 `metric_name` 和 `timestamp` 下存在多条记录，是因为 `attributes`（维度标签）不同导致。例如不同的 `lane` 对应不同的队列通道，各自有独立的累计值。

---

## 三、`otel_metrics_histogram` 表

### 3.1 表用途

`otel_metrics_histogram` 用于存储 **Histogram（分布直方图）** 类型的指标。Histogram 记录的是一组数据的分布统计信息，包括样本数量、累加和、各桶的计数等，适用于分析响应时间、队列等待时间等具有分布特征的指标。

### 3.2 字段说明

| 字段名 | 数据类型 | Nullable | Key | 说明 |
|--------|----------|----------|-----|------|
| `service_name` | `varchar(200)` | Yes | DUPLICATE KEY | 服务名称 |
| `timestamp` | `datetime(6)` | Yes | DUPLICATE KEY | 指标数据点时间戳（微秒精度） |
| `service_instance_id` | `varchar(200)` | Yes | - | 服务实例唯一标识 |
| `metric_name` | `varchar(200)` | Yes | - | 指标名称 |
| `metric_description` | `text` | Yes | - | 指标描述 |
| `metric_unit` | `text` | Yes | - | 指标单位 |
| `attributes` | `variant` | Yes | - | 指标维度标签（JSON） |
| `start_time` | `datetime(6)` | Yes | - | 聚合周期起始时间 |
| `count` | `bigint` | Yes | - | 落入当前桶范围的样本总数 |
| `sum` | `double` | Yes | - | 样本值之和 |
| `bucket_counts` | `array<bigint>` | Yes | - | 各桶的样本计数数组 |
| `explicit_bounds` | `array<double>` | Yes | - | 各桶的边界值数组 |
| `exemplars` | `array<struct>` | Yes | - | 追踪关联样本（结构同 sum 表） |
| `min` | `double` | Yes | - | 当前聚合窗口内最小样本值 |
| `max` | `double` | Yes | - | 当前聚合窗口内最大样本值 |
| `aggregation_temporality` | `text` | Yes | - | 聚合时序性，当前值：`Cumulative` |
| `resource_attributes` | `variant` | Yes | - | 资源级别属性（JSON） |
| `scope_name` | `text` | Yes | - | OTel Scope 名称 |
| `scope_version` | `text` | Yes | - | OTel Scope 版本 |

#### 3.2.1 `bucket_counts` 与 `explicit_bounds`

Doris 中的 Histogram 存储使用的是 **显式边界桶（Explicit Bounds Histogram）** 模式：

- `explicit_bounds`：定义了每个桶的上边界（不含最后一个桶的上界），数组长度为 N 时，数据点落入 N+1 个桶中
- `bucket_counts`：与 `explicit_bounds` 对应的各桶计数数组

当前数据中的桶配置：

| 桶编号 | explicit_bounds 值 | 含义 |
|--------|-------------------|------|
| 桶 0 | `[0]` | 值恰好为 0 |
| 桶 1 | `[0, 5)` | 0 ≤ value < 5 |
| 桶 2 | `[0, 5, 10)` | 5 ≤ value < 10 |
| 桶 3 | `[0, 5, 10, 25)` | 10 ≤ value < 25 |
| 桶 4 | `[0, 5, 10, 25, 50)` | 25 ≤ value < 50 |
| 桶 5 | `[0, 5, 10, 25, 50, 75)` | 50 ≤ value < 75 |
| 桶 6 | `[0, 5, 10, 25, 50, 75, 100)` | 75 ≤ value < 100 |
| 桶 7 | `[0, 5, 10, 25, 50, 75, 100, 250)` | 100 ≤ value < 250 |
| 桶 8 | `[0, 5, 10, 25, 50, 75, 100, 250, 500)` | 250 ≤ value < 500 |
| 桶 9 | `[0, 5, 10, 25, 50, 75, 100, 250, 500, 750)` | 500 ≤ value < 750 |
| 桶 10 | `[0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000)` | 750 ≤ value < 1000 |
| 桶 11 | `[0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500)` | 1000 ≤ value < 2500 |
| 桶 12 | `[0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000)` | 2500 ≤ value < 5000 |
| 桶 13 | `[0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500)` | 5000 ≤ value < 7500 |
| 桶 14 | `[0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000)` | 7500 ≤ value < 10000 |
| 桶 15 | - | value ≥ 10000（overflow bucket） |

> 当前配置共 16 个桶（15 个显式边界 + 1 个溢出桶），默认范围从 0ms 到 10000ms，适用于毫秒级延迟分析。

### 3.3 当前存储的指标列表

| metric_name | metric_unit | 说明 |
|-------------|-------------|------|
| `openclaw.context.tokens` | `1` | 上下文窗口 Token 数量分布 |
| `openclaw.queue.wait_ms` | `ms` | 消息在队列中等待时间分布 |
| `openclaw.queue.depth` | `1` | 各 Lane 队列深度分布 |
| `openclaw.session.stuck_age_ms` | `ms` | 会话卡死时长分布 |
| `openclaw.message.duration_ms` | `ms` | 消息处理耗时分布 |
| `openclaw.run.duration_ms` | `ms` | 任务运行耗时分布 |

### 3.4 数据示例

```
+---------------+-------------------------+--------+----------+----------+----------+-------------------------------+------------------------+
| service_name  | metric_name             | count  | sum      | min      | max      | bucket_counts                 | explicit_bounds        |
+---------------+-------------------------+--------+----------+----------+----------+-------------------------------+------------------------+
| openclaw-gateway | openclaw.run.duration_ms | 3      | 41717    | 7208     | 22995    | [5, 2, 0, 0, 0, 0, ...]       | [0,5,10,25,50,...]     |
| openclaw-gateway | openclaw.context.tokens  | 3      | 614400   | 204800   | 204800   | -                             | -                      |
| openclaw-gateway | openclaw.queue.wait_ms   | 8      | 4        | 0        | 1        | [5, 2, 0, 0, 1, 0, ...]       | [0,5,10,25,50,...]     |
| openclaw-gateway | openclaw.queue.depth      | 8      | 4        | 0        | 1        | [28, 0, 0, 0, 0, 0, ...]     | [0,5,10,25,50,...]     |
+---------------+-------------------------+--------+----------+----------+----------+-------------------------------+------------------------+
```

---

## 四、两表对比分析

### 4.1 字段差异

| 字段 | `otel_metrics_sum` | `otel_metrics_histogram` |
|------|:------------------:|:------------------------:|
| `service_name` | ✅ | ✅ |
| `timestamp` | ✅ | ✅ |
| `service_instance_id` | ✅ | ✅ |
| `metric_name` | ✅ | ✅ |
| `metric_description` | ✅ | ✅ |
| `metric_unit` | ✅ | ✅ |
| `attributes` | ✅（variant） | ✅（variant） |
| `start_time` | ✅ | ✅ |
| `value` | ✅（double） | ❌ |
| `aggregation_temporality` | ✅ | ✅ |
| `is_monotonic` | ✅ | ❌ |
| `count` | ❌ | ✅（bigint） |
| `sum` | ❌ | ✅（double） |
| `bucket_counts` | ❌ | ✅（array） |
| `explicit_bounds` | ❌ | ✅（array） |
| `min` | ❌ | ✅ |
| `max` | ❌ | ✅ |
| `exemplars` | ✅ | ✅ |
| `resource_attributes` | ✅（variant） | ✅（variant） |
| `scope_name` | ✅ | ✅ |
| `scope_version` | ✅ | ✅ |

### 4.2 数据模型对比

```
┌─────────────────────────────────────────────┐
│              OTel 指标类型                   │
├──────────────────┬──────────────────────────┤
│  Counter          │  Histogram               │
│  (otel_metrics_sum)│  (otel_metrics_histogram)│
├──────────────────┼──────────────────────────┤
│  value: 单个累加值 │  count: 样本总数           │
│  is_monotonic: true│  sum: 样本和              │
│                   │  bucket_counts: 桶计数    │
│                   │  explicit_bounds: 边界   │
│                   │  min / max: 极值         │
└──────────────────┴──────────────────────────┘
```

### 4.3 存储特点总结

| 特性 | `otel_metrics_sum` | `otel_metrics_histogram` |
|------|---------------------|---------------------------|
| 记录内容 | 累计计数器最终值 | 统计分布数据 |
| 查询场景 | 计算增量（差值）、速率 | 计算百分位数（P50/P90/P99）、分布 |
| 典型指标 | 消息总数、Token 总量、成本 | 延迟、队列深度、Token 窗口分布 |
| 数据粒度 | 维度标签下全量累计 | 各桶分布 + 极值统计 |
| 单行数据量 | 较小 | 较大（含数组字段） |

---

## 五、索引与查询优化

### 5.1 倒排索引配置

两张表所有字段均配置了 `INVERTED` 倒排索引，包括：

- 基础字段：service_name、timestamp、service_instance_id、metric_name
- 描述字段：metric_description、metric_unit
- 结构字段：attributes、resource_attributes
- 聚合字段：start_time、aggregation_temporality、count（仅 histogram）

倒排索引的优势：
- **前缀匹配**：`LIKE 'openclaw%'` 可走索引
- **等值查询**：`WHERE service_name = 'openclaw-gateway'` 高效
- **Variant 列查询**：`WHERE attributes.openclaw.lane = 'main'` 同样走索引

### 5.2 推荐查询模式

```sql
-- 查询最近 1 小时某指标的值（Sum 表）
SELECT metric_name, value, timestamp, attributes
FROM opsRobot.otel_metrics_sum
WHERE service_name = 'openclaw-gateway'
  AND metric_name = 'openclaw.tokens'
  AND timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
ORDER BY timestamp DESC;

-- 查询某指标的百分位分布（Histogram 表）
SELECT
  metric_name,
  count,
  sum,
  min,
  max,
  -- 计算 P50/P90/P99 需要对 bucket_counts 展开
  timestamp
FROM opsRobot.otel_metrics_histogram
WHERE service_name = 'openclaw-gateway'
  AND metric_name = 'openclaw.queue.wait_ms'
ORDER BY timestamp DESC;

-- 按维度标签聚合统计（利用 Variant 列索引）
SELECT
  attributes.openclaw.lane AS lane,
  COUNT(*) AS record_count,
  SUM(value) AS total_value
FROM opsRobot.otel_metrics_sum
WHERE service_name = 'openclaw-gateway'
  AND metric_name = 'openclaw.queue.lane.enqueue'
GROUP BY attributes.openclaw.lane;
```

---

## 六、动态分区管理

两张表均启用了 **动态分区（Dynamic Partition）**：

| 配置项 | 值 |
|--------|-----|
| 时间单元 | `DAY`（按天分区） |
| 时区 | `Etc/UTC` |
| 自动扩展范围 | 从历史到未来 1 天（`end = 1`） |
| 分桶数 | `10` BUCKETS AUTO |
| 压缩格式 | `V2`（ClickHouse 兼容格式） |
| Compaction 策略 | `time_series` |

当前分区（截至 2026-04-01）：

| 分区名 | 范围 |
|--------|------|
| `p20260330` | 2026-03-30（含）~ 2026-03-31 |
| `p20260331` | 2026-03-31（含）~ 2026-04-01 |
| `p20260401` | 2026-04-01（含）~ 2026-04-02 |
| `p20260402` | 2026-04-02（含）~ 2026-04-03 |

系统每天自动创建新分区（UTC 时区），分区保留策略由 `dynamic_partition.start = -2147483648` 控制（保留全部历史分区）。

---

## 七、常见问题与注意事项

1. **`is_monotonic` 字段类型为 `boolean`**：Doris MySQL 协议下查询结果显示为 `0/1`，代码中解析时需注意类型映射。

2. **Variant 类型子列查询**：访问 `attributes.key.subkey` 格式的列时，Doris 会自动将其作为虚拟列处理，首次查询会触发元数据加载，可能有轻微延迟。

3. **Histogram 百分位计算**：Doris 不直接支持 `APPROX_PERCENTILE` 聚合函数（如有需求），需要手动用 `bucket_counts` + `explicit_bounds` 数组展开计算。

4. **时区注意**：动态分区以 `Etc/UTC` 为准，数据上报的 `timestamp` 也是 UTC 时间，前端展示时需转换。

5. **Counter 增量计算**：存储的是累计值，计算增量或速率（rate）时需要用差值或 ` window_functions` 计算。

---

## 八、附录

### 8.1 建表语句（参考）

**`otel_metrics_sum`**

```sql
CREATE TABLE `otel_metrics_sum` (
  `service_name`           varchar(200)  NULL,
  `timestamp`              datetime(6)   NULL,
  `service_instance_id`    varchar(200)  NULL,
  `metric_name`            varchar(200)  NULL,
  `metric_description`     text          NULL,
  `metric_unit`            text          NULL,
  `attributes`             variant<PROPERTIES ("variant_max_subcolumns_count" = "2048")> NULL,
  `start_time`             datetime(6)   NULL,
  `value`                  double        NULL,
  `exemplars`              array<struct<filtered_attributes:map<text,text>,timestamp:datetime(6),value:double,span_id:text,trace_id:text>> NULL,
  `aggregation_temporality` text         NULL,
  `is_monotonic`           boolean       NULL,
  `resource_attributes`    variant<PROPERTIES ("variant_max_subcolumns_count" = "2048")> NULL,
  `scope_name`             text          NULL,
  `scope_version`          text          NULL,
  INDEX idx_service_name     (`service_name`)           USING INVERTED,
  INDEX idx_timestamp         (`timestamp`)             USING INVERTED,
  INDEX idx_metric_name      (`metric_name`)           USING INVERTED,
  INDEX idx_attributes        (`attributes`)            USING INVERTED,
  INDEX idx_resource_attributes (`resource_attributes`) USING INVERTED
) ENGINE=OLAP
DUPLICATE KEY(`service_name`, `timestamp`)
PARTITION BY RANGE(`timestamp`) ()
DISTRIBUTED BY RANDOM BUCKETS AUTO
PROPERTIES (
  "replication_allocation" = "tag.location.default: 1",
  "dynamic_partition.enable" = "true",
  "dynamic_partition.time_unit" = "DAY",
  "dynamic_partition.time_zone" = "Etc/UTC",
  "dynamic_partition.end" = "1",
  "dynamic_partition.prefix" = "p",
  "dynamic_partition.buckets" = "10",
  "storage_medium" = "hdd",
  "compaction_policy" = "time_series"
);
```

**`otel_metrics_histogram`**

```sql
CREATE TABLE `otel_metrics_histogram` (
  `service_name`           varchar(200)  NULL,
  `timestamp`              datetime(6)   NULL,
  `service_instance_id`    varchar(200)  NULL,
  `metric_name`            varchar(200)  NULL,
  `metric_description`     text          NULL,
  `metric_unit`            text          NULL,
  `attributes`             variant<PROPERTIES ("variant_max_subcolumns_count" = "2048")> NULL,
  `start_time`             datetime(6)   NULL,
  `count`                  bigint        NULL,
  `sum`                    double        NULL,
  `bucket_counts`          array<bigint> NULL,
  `explicit_bounds`        array<double> NULL,
  `exemplars`              array<struct<filtered_attributes:map<text,text>,timestamp:datetime(6),value:double,span_id:text,trace_id:text>> NULL,
  `min`                    double        NULL,
  `max`                    double        NULL,
  `aggregation_temporality` text         NULL,
  `resource_attributes`    variant<PROPERTIES ("variant_max_subcolumns_count" = "2048")> NULL,
  `scope_name`             text          NULL,
  `scope_version`          text          NULL,
  INDEX idx_service_name     (`service_name`)           USING INVERTED,
  INDEX idx_timestamp         (`timestamp`)             USING INVERTED,
  INDEX idx_metric_name      (`metric_name`)           USING INVERTED,
  INDEX idx_count             (`count`)                 USING INVERTED,
  INDEX idx_attributes        (`attributes`)            USING INVERTED,
  INDEX idx_resource_attributes (`resource_attributes`) USING INVERTED
) ENGINE=OLAP
DUPLICATE KEY(`service_name`, `timestamp`)
PARTITION BY RANGE(`timestamp`) ()
DISTRIBUTED BY RANDOM BUCKETS AUTO
PROPERTIES (
  "replication_allocation" = "tag.location.default: 1",
  "dynamic_partition.enable" = "true",
  "dynamic_partition.time_unit" = "DAY",
  "dynamic_partition.time_zone" = "Etc/UTC",
  "dynamic_partition.end" = "1",
  "dynamic_partition.prefix" = "p",
  "dynamic_partition.buckets" = "10",
  "storage_medium" = "hdd",
  "compaction_policy" = "time_series"
);
```

### 8.2 数据规模汇总

| 表名 | 总行数 | 日均增量（估算） | 单行大小（估算） |
|------|--------|----------------|----------------|
| `otel_metrics_sum` | ~134,148 | ~134,148/3 ≈ 44,716 条/天 | ~1-2 KB |
| `otel_metrics_histogram` | ~75,661 | ~75,661/3 ≈ 25,220 条/天 | ~2-3 KB（含数组） |

> 数据采集频率约为每分钟上报一次，每种指标+维度组合每天约产生 1440 条记录。
