# OpenClaw 监控页面指标结构

## 概述

本文档描述 OpenClaw 可观测平台的监控页面结构，按不同维度组织业务指标。

---

## 一、概览页 (Overview)

### 1.1 核心指标卡片（4个卡片）

| 卡片名称 | 指标名称 | 类型 | 说明 |
|---------|---------|------|------|
| **实例状态** | instance.total | Gauge | 实例总数 |
| | instance.online | Gauge | 在线实例数 |
| | instance.offline | Gauge | 离线实例数 |
| **会话统计** | session.active | Gauge | 活跃会话数 |
| | session.stuck | Gauge | 卡顿会话数 |
| | session.total | Counter | 会话总数 |
| **Token消费** | token.total | Gauge | Token总消耗 |
| | cache.hit_rate | Gauge | Cache命中率 |
| | token.hourly | Gauge | 每小时Token |
| **成本统计** | cost.daily | Gauge | 今日成本 |
| | cost.hourly | Gauge | 每小时成本 |
| | cost.per_token | Gauge | 单Token成本 |

### 1.2 概览页趋势图表

| 图表名称 | 指标 | 时间范围 |
|---------|------|---------|
| Token消耗趋势 | token.total | 24小时 |
| 成本趋势 | cost.daily | 7天 |
| 会话处理趋势 | session.processed | 24小时 |
| 队列深度趋势 | queue.depth | 24小时 |

### 1.3 概览页Top列表

| 列表名称 | 维度 | 说明 |
|---------|------|------|
| Top Token消耗 | channel | 按渠道Token消耗 |
| Top成本 | channel | 按渠道成本 |
| Top活跃会话 | 无 | 最新活跃会话 |
| Top卡顿会话 | 无 | 卡顿会话告警 |

---

## 二、成本监控页 (Cost Analysis)

### 2.1 成本概览卡片（4个卡片）

| 卡片名称 | 指标名称 | 类型 |
|---------|---------|------|
| **总成本** | cost.total.usd | Gauge |
| **今日成本** | cost.daily.usd | Gauge |
| **每小时成本** | cost.hourly.usd | Gauge |
| **成本趋势** | cost.growth_rate | Rate |

### 2.2 分维度成本图表

| 图表名称 | 维度 | 指标 |
|---------|------|------|
| 按渠道成本分布 | channel | cost.by_channel.usd |
| 按模型成本分布 | model | cost.by_model.usd |
| 按提供商成本分布 | provider | cost.by_provider.usd |
| 成本趋势图 | 时间 | cost.hourly.usd |

### 2.3 成本效益指标

| 指标名称 | 类型 | 计算方式 |
|---------|------|---------|
| cost.per_token | Gauge | cost.total / token.total |
| cost.per_request | Gauge | cost.total / message.processed |
| cost.per_session | Gauge | cost.total / session.total |
| cost.vs.budget | Gauge | cost.daily / budget |

### 2.4 成本告警规则

| 告警名称 | 条件 | 级别 |
|---------|------|------|
| 小时成本超限 | cost.hourly > 阈值 | Critical |
| 日成本超预算 | cost.daily > 预算80% | Warning |
| 成本增长率异常 | cost.growth_rate > 50% | Warning |

---

## 三、Token监控页 (Token Analysis)

### 3.1 Token概览卡片（4个卡片）

| 卡片名称 | 指标名称 | 类型 |
|---------|---------|------|
| **Token总消耗** | token.total | Gauge |
| **今日Token** | token.daily | Gauge |
| **Cache命中率** | cache.hit_rate | Gauge |
| **Token增长率** | token.growth_rate | Rate |

### 3.2 Token分类型图表

| 图表名称 | 指标 |
|---------|------|
| Token类型分布 | token.prompt, input, output |
| Cache读写对比 | token.cache_read, token.cache_write |
| Token消耗趋势 | token.hourly |
| 按渠道Token分布 | token.by_channel |

### 3.3 Token效率指标

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| cache.hit_rate | Gauge | Cache命中率 |
| token.utilization | Gauge | Token利用率 |
| token.output_ratio | Gauge | Output/Input比例 |

### 3.4 Token告警规则

| 告警名称 | 条件 | 级别 |
|---------|------|------|
| Token消耗异常 | token.growth_rate > 50% | Warning |
| Cache命中率低 | cache.hit_rate < 50% | Warning |
| Token超预算 | token.daily > 预算80% | Info |

---

## 四、会话监控页 (Session Analysis)

### 4.1 会话概览卡片（4个卡片）

| 卡片名称 | 指标名称 | 类型 |
|---------|---------|------|
| **活跃会话** | session.active | Gauge |
| **卡顿会话** | session.stuck | Gauge |
| **会话总数** | session.total | Counter |
| **会话成功率** | session.success_rate | Gauge |

### 4.2 会话状态图表

| 图表名称 | 指标 |
|---------|------|
| 会话状态分布 | session.active, session.idle |
| 会话趋势 | session.started, session.completed |
| 会话处理速率 | session.processing.rate |
| 卡顿会话趋势 | session.stuck.total |

### 4.3 会话性能指标（Histogram）

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| run.duration.p50 | Histogram | 运行耗时P50 |
| run.duration.p95 | Histogram | 运行耗时P95 |
| run.duration.p99 | Histogram | 运行耗时P99 |
| run.duration.avg | Gauge | 平均运行耗时 |

### 4.4 会话告警规则

| 告警名称 | 条件 | 级别 |
|---------|------|------|
| 卡顿会话超限 | session.stuck > 10 | Critical |
| 会话堆积 | session.active > 100 | Warning |
| 会话成功率低 | session.success_rate < 90% | Warning |
| 运行耗时过长 | run.duration.p95 > 30s | Warning |

---

## 五、消息监控页 (Message Analysis)

### 5.1 消息概览卡片（4个卡片）

| 卡片名称 | 指标名称 | 类型 |
|---------|---------|------|
| **已处理消息** | message.processed | Counter |
| **排队消息** | message.queued | Gauge |
| **队列深度** | message.queue.depth | Gauge |
| **处理速率** | message.processed.rate | Rate |

### 5.2 消息处理图表

| 图表名称 | 指标 |
|---------|------|
| 消息处理趋势 | message.processed |
| 队列深度趋势 | message.queue.depth |
| 按渠道消息分布 | message.by_channel |
| 消息处理耗时分布 | message.duration |

### 5.3 消息性能指标（Histogram）

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| message.duration.p50 | Histogram | 消息处理耗时P50 |
| message.duration.p95 | Histogram | 消息处理耗时P95 |
| message.duration.p99 | Histogram | 消息处理耗时P99 |
| message.duration.avg | Gauge | 平均处理耗时 |

### 5.4 消息告警规则

| 告警名称 | 条件 | 级别 |
|---------|------|------|
| 队列深度超限 | message.queue.depth > 1000 | Critical |
| 处理延迟过长 | message.duration.p95 > 30s | Warning |
| 队列积压增加 | message.queue.depth 持续增长 | Info |

---

## 六、队列监控页 (Queue Analysis)

### 6.1 队列概览卡片（4个卡片）

| 卡片名称 | 指标名称 | 类型 |
|---------|---------|------|
| **队列深度** | queue.depth.avg | Gauge |
| **入队总数** | queue.enqueue.total | Counter |
| **出队总数** | queue.dequeue.total | Counter |
| **队列平衡** | queue.balance | Gauge |

### 6.2 队列操作图表

| 图表名称 | 指标 |
|---------|------|
| 入出队趋势 | queue.enqueue, queue.dequeue |
| 队列深度分布 | queue.depth |
| 队列等待时间分布 | queue.wait |
| 按Lane队列分布 | queue.by_lane |

### 6.3 队列性能指标（Histogram）

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| queue.depth.p50 | Histogram | 队列深度P50 |
| queue.depth.p95 | Histogram | 队列深度P95 |
| queue.wait.p50 | Histogram | 等待时间P50 |
| queue.wait.p95 | Histogram | 等待时间P95 |

### 6.4 队列告警规则

| 告警名称 | 条件 | 级别 |
|---------|------|------|
| 队列深度超限 | queue.depth > 1000 | Critical |
| 队列失衡 | queue.balance > 阈值 | Warning |
| 等待时间过长 | queue.wait.p95 > 5s | Warning |

---

## 七、实例监控页 (Instance Monitoring)

### 7.1 实例概览卡片（4个卡片）

| 卡片名称 | 指标名称 | 类型 |
|---------|---------|------|
| **实例总数** | instance.total | Gauge |
| **在线实例** | instance.online | Gauge |
| **异常实例** | instance.abnormal | Gauge |
| **数据新鲜度** | instance.data_freshness | Gauge |

### 7.2 OpenClaw 实例列表

| 列名 | 说明 | 指标来源 |
|------|------|---------|
| **OpenClaw实例ID** | 实例唯一标识 | service_instance_id / host.name |
| **OpenClaw名称** | 服务名称 | service.name |
| **状态** | 实例状态（在线/离线/异常） | 健康检查 |
| **活跃会话** | 当前活跃会话数 | session.active |
| **卡顿会话** | 卡顿会话数 | session.stuck |
| **Token消耗** | Token总消耗 | token.total |
| **总成本** | 成本总和 | cost.total |
| **消息处理** | 已处理消息数 | message.processed |
| **队列深度** | 当前队列深度 | queue.depth |
| **Cache命中率** | Cache命中率 | cache.hit_rate |
| **最后活跃** | 最后数据时间 | MAX(timestamp) |
| **操作** | 查看详情 | 详情弹窗 |

### 7.3 实例详情弹窗

#### 7.3.1 OpenClaw 基本信息

| 信息项 | 说明 | 数据来源 |
|--------|------|---------|
| **实例名称** | 服务名称 | service.name |
| **实例ID** | 实例唯一标识 | service_instance_id / host.name |
| **环境信息** | 主机架构 | host.arch |
| | 主机名 | host.name |
| | 进程ID | process.pid |
| | 进程所有者 | process.owner |
| | 运行时 | process.runtime (Node.js 24.14.0) |
| | 启动命令 | process.command |
| | 启动参数 | process.command_args |
| | 可执行文件 | process.executable |
| | 监听端口 | 从启动参数解析 |

#### 7.3.2 详细监控指标 - 会话指标

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| session.active | Gauge | 活跃会话数 |
| session.idle | Gauge | 空闲会话数 |
| session.total | Counter | 会话总数 |
| session.started | Counter | 已启动会话数 |
| session.completed | Counter | 已完成会话数 |
| session.stuck | Gauge | 卡顿会话数 |
| session.stuck.total | Counter | 历史卡顿累计 |
| session.success_rate | Gauge | 会话成功率 |
| session.processing_rate | Rate | 会话处理速率 |
| run.duration.p50 | Histogram | 运行耗时P50 |
| run.duration.p95 | Histogram | 运行耗时P95 |
| run.duration.p99 | Histogram | 运行耗时P99 |
| session.stuck_age.p50 | Histogram | 卡顿时长P50 |
| session.stuck_age.p95 | Histogram | 卡顿时长P95 |

#### 7.3.3 详细监控指标 - Agent指标

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| token.total | Gauge | Token总消耗 |
| token.prompt | Gauge | Prompt Token消耗 |
| token.input | Gauge | Input Token消耗 |
| token.output | Gauge | Output Token消耗 |
| token.cache_read | Gauge | Cache Read Token |
| token.cache_write | Gauge | Cache Write Token |
| cache.hit_rate | Gauge | Cache命中率 |
| cost.total | Gauge | 总成本 |
| cost.hourly | Gauge | 每小时成本 |
| message.processed | Counter | 已处理消息数 |
| message.queued | Gauge | 排队消息数 |
| message.duration.p50 | Histogram | 消息耗时P50 |
| message.duration.p95 | Histogram | 消息耗时P95 |
| queue.enqueue | Counter | 入队总数 |
| queue.dequeue | Counter | 出队总数 |
| queue.depth | Gauge | 队列深度 |
| queue.wait.p50 | Histogram | 等待时间P50 |
| queue.wait.p95 | Histogram | 等待时间P95 |
| context.tokens.p50 | Histogram | 上下文Token P50 |
| context.tokens.p95 | Histogram | 上下文Token P95 |

---

## 八、页面导航结构

```
概览 (Overview)
├── 实例状态卡片
├── 会话统计卡片
├── Token消费卡片
├── 成本统计卡片
├── 趋势图表
└── Top列表

成本监控 (Cost Analysis)
├── 成本概览卡片
├── 分维度成本图表
├── 成本效益指标
└── 成本告警

Token监控 (Token Analysis)
├── Token概览卡片
├── Token分类型图表
├── Token效率指标
└── Token告警

会话监控 (Session Analysis)
├── 会话概览卡片
├── 会话状态图表
├── 会话性能指标
└── 会话告警

消息监控 (Message Analysis)
├── 消息概览卡片
├── 消息处理图表
├── 消息性能指标
└── 消息告警

队列监控 (Queue Analysis)
├── 队列概览卡片
├── 队列操作图表
├── 队列性能指标
└── 队列告警

实例监控 (Instance Monitoring)
├── 实例概览卡片
├── OpenClaw实例列表
└── 实例详情弹窗
    ├── OpenClaw基本信息
    ├── 会话指标
    └── Agent指标
```

---

## 九、数据来源

| 表名 | 指标数量 | 记录数 |
|------|---------|--------|
| otel_metrics_sum | 8 | 147,855 |
| otel_metrics_histogram | 6 | 83,463 |

## 十、公共维度

| 维度键 | 可选值 |
|--------|--------|
| service_name | openclaw-gateway |
| channel | webchat, heartbeat |
| model | MiniMax-M2.7 |
| provider | minimax |
| lane | main, session:agent:main:main |
| state | processing, idle |
| reason | run_started, run_completed, message_start, message_completed |
| token | total, prompt, input, output, cache_read, cache_write |
