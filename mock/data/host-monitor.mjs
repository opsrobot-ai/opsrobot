/**
 * 主机监控 Mock 数据
 * 用于前端开发和测试（无需连接真实数据库）
 */

/**
 * 单机详情 Mock 数据
 */
export function mockHostMonitorData() {
  const now = new Date();
  return {
    generatedAt: now.toISOString(),
    dataTimestamp: now.toISOString(),
    timeRange: {
      start: new Date(now.getTime() - 3600000).toISOString(),
      end: now.toISOString(),
      hours: 1
    },

    hostInfo: {
      name: "prod-server-01",
      osType: "linux",
      arch: "amd64"
    },

    summary: {
      avgCpuUtilization: (35 + Math.random() * 30).toFixed(1),
      avgMemoryUtilization: (65 + Math.random() * 20).toFixed(1),
      maxDiskUtilization: (55 + Math.random() * 25).toFixed(1),
      loadAverage: {
        "1m": (1.5 + Math.random() * 2).toFixed(2),
        "5m": (2.0 + Math.random() * 1.5).toFixed(2),
        "15m": (2.5 + Math.random()).toFixed(2)
      },
      processCount: Math.floor(200 + Math.random() * 100),
      networkInterfaces: 3,
      alertCount: {
        critical: 0,
        warning: Math.random() > 0.7 ? 1 : 0
      }
    },

    cpu: {
      coreCount: 12,
      utilizationPercent: (35 + Math.random() * 30).toFixed(1),
      userPercent: (20 + Math.random() * 15).toFixed(1),
      systemPercent: (8 + Math.random() * 5).toFixed(1),
      iowaitPercent: (1 + Math.random() * 3).toFixed(1),
      idlePercent: (60 - Math.random() * 25).toFixed(1),
      load: {
        hostname: "prod-server-01",
        osType: "linux",
        arch: "amd64",
        loadAvg1m: 1.85,
        loadAvg5m: 2.34,
        loadAvg15m: 2.78
      }
    },

    memory: {
      totalBytes: 68719476736, // 64 GB
      usedBytes: 45097156608,   // ~42 GB
      freeBytes: 2147483648,    // ~2 GB
      cachedBytes: 17179869184,  // ~16 GB
      bufferBytes: 1073741824,   // ~1 GB
      utilizationPercent: (65 + Math.random() * 15).toFixed(1),
      formatted: {
        total: "64.00 GB",
        used: "42.00 GB",
        free: "2.00 GB",
        cached: "16.00 GB",
        buffer: "1.00 GB"
      }
    },

    disks: [
      {
        device: "/dev/sda1",
        mountpoint: "/",
        fsType: "ext4",
        totalBytes: 500 * 1024 * 1024 * 1024, // 500 GB
        usedBytes: 300 * 1024 * 1024 * 1024,  // 300 GB
        freeBytes: 200 * 1024 * 1024 * 1024,  // 200 GB
        utilizationPercent: "60.0",
        ioReadBytes: 107374182400,
        ioWriteBytes: 53687091200,
        readOperations: 15000,
        writeOperations: 8000,
        totalFormatted: "500.00 GB",
        usedFormatted: "300.00 GB",
        freeFormatted: "200.00 GB",
        ioReadFormatted: "100.00 GB",
        ioWriteFormatted: "50.00 GB"
      },
      {
        device: "/dev/sdb1",
        mountpoint: "/data",
        fsType: "xfs",
        totalBytes: 1024 * 1024 * 1024 * 1024, // 1 TB
        usedBytes: 858993459200,             // ~800 GB
        freeBytes: 164926744166,              // ~153.6 GB
        utilizationPercent: "83.7",
        ioReadBytes: 214748364800,
        ioWriteBytes: 322122547200,
        readOperations: 25000,
        writeOperations: 30000,
        totalFormatted: "1.00 TB",
        usedFormatted: "800.00 GB",
        freeFormatted: "153.60 GB",
        ioReadFormatted: "200.00 GB",
        ioWriteFormatted: "300.00 GB"
      }
    ],

    networks: [
      {
        device: "eth0",
        receiveBytes: 10737418240,  // 10 GB
        transmitBytes: 5368709120,   // 5 GB
        receivePackets: 8500000,
        transmitPackets: 4200000,
        receiveErrors: 12,
        transmitErrors: 3,
        receiveDropped: 45,
        transmitDropped: 8,
        connections: 256,
        receiveFormatted: "10.00 GB",
        transmitFormatted: "5.00 GB"
      },
      {
        device: "eth1",
        receiveBytes: 5368709120,   // 5 GB
        transmitBytes: 10737418240,  // 10 GB
        receivePackets: 3200000,
        transmitPackets: 6800000,
        receiveErrors: 0,
        transmitErrors: 1,
        receiveDropped: 2,
        transmitDropped: 0,
        connections: 128,
        receiveFormatted: "5.00 GB",
        transmitFormatted: "10.00 GB"
      },
      {
        device: "lo",
        receiveBytes: 1073741824,   // 1 GB
        transmitBytes: 1073741824,  // 1 GB
        receivePackets: 1200000,
        transmitPackets: 1200000,
        receiveErrors: 0,
        transmitErrors: 0,
        receiveDropped: 0,
        transmitDropped: 0,
        connections: 0,
        receiveFormatted: "1.00 GB",
        transmitFormatted: "1.00 GB"
      }
    ],

    processes: {
      running: 3 + Math.floor(Math.random() * 5),
      sleeping: 180 + Math.floor(Math.random() * 80),
      stopped: 2 + Math.floor(Math.random() * 3),
      zombie: Math.random() > 0.8 ? 1 : 0,
      total: 200 + Math.floor(Math.random() * 100)
    },

    healthStatus: "healthy",

    alerts: []
  };
}

/**
 * 总览分析 Mock 数据（多主机聚合）
 */
export function mockHostMonitorOverviewData() {
  const now = new Date();
  const hours = 24;
  
  // 生成时间戳数组
  const timestamps = [];
  for (let i = hours; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600000);
    timestamps.push(t.toISOString().replace('T', ' ').slice(0, 16));
  }
  
  // 生成趋势数据
  const cpuTrend = timestamps.map(() => ({
    utilization: (30 + Math.random() * 40).toFixed(1),
    user: "25",
    system: "10",
    iowait: "3",
    idle: "62"
  }));
  
  const memoryTrend = timestamps.map(() => ({
    usedGB: (35 + Math.random() * 20).toFixed(2),
    freeGB: (10 + Math.random() * 15).toFixed(2),
    utilization: (60 + Math.random() * 25).toFixed(1)
  }));
  
  const diskTrend = timestamps.map(() => ({
    utilization: (50 + Math.random() * 30).toFixed(1),
    usedGB: (250 + Math.random() * 150).toFixed(2)
  }));
  
  const networkTrend = timestamps.map(() => ({
    receiveMB: (80 + Math.random() * 120).toFixed(2),
    transmitMB: (60 + Math.random() * 100).toFixed(2)
  }));

  return {
    generatedAt: now.toISOString(),
    timeRange: {
      start: new Date(now.getTime() - hours * 3600000).toISOString(),
      end: now.toISOString(),
      hours
    },

    summary: {
      totalHosts: 5,
      healthyHosts: 3,
      warningHosts: 1,
      criticalHosts: 1,
      avgCpuUtilization: "45.3",
      avgMemoryUtilization: "68.7",
      maxDiskUtilization: "83.5"
    },

    hostList: [
      {
        hostname: "prod-server-01",
        osType: "linux",
        arch: "amd64",
        cpuUtilization: "38.5",
        loadAvg1m: "1.85",
        memoryUtilization: "62.3",
        memoryUsed: 45097156608,
        memoryTotal: 68719476736,
        memoryFormatted: { used: "42.0 GB", total: "64.0 GB" },
        maxDiskUtilization: "60.0",
        healthStatus: "healthy",
        alertCount: 0,
        lastUpdate: now.toISOString()
      },
      {
        hostname: "prod-server-02",
        osType: "linux",
        arch: "amd64",
        cpuUtilization: "72.8",
        loadAvg1m: "14.32",
        memoryUtilization: "85.6",
        memoryUsed: 137438953472,
        memoryTotal: 171798691840,
        memoryFormatted: { used: "128.0 GB", total: "160.0 GB" },
        maxDiskUtilization: "91.2",
        healthStatus: "critical",
        alertCount: 3,
        lastUpdate: now.toISOString()
      },
      {
        hostname: "worker-node-01",
        osType: "linux",
        arch: "amd64",
        cpuUtilization: "45.2",
        loadAvg1m: "8.67",
        memoryUtilization: "71.4",
        memoryUsed: 22906492262,
        memoryTotal: 32212254720,
        memoryFormatted: { used: "21.3 GB", total: "30.0 GB" },
        maxDiskUtilization: "78.9",
        healthStatus: "warning",
        alertCount: 1,
        lastUpdate: now.toISOString()
      },
      {
        hostname: "worker-node-02",
        osType: "linux",
        arch: "arm64",
        cpuUtilization: "28.4",
        loadAvg1m: "2.34",
        memoryUtilization: "55.8",
        memoryUsed: 17937208320,
        memoryTotal: 32212254720,
        memoryFormatted: { used: "16.7 GB", total: "30.0 GB" },
        maxDiskUtilization: "45.6",
        healthStatus: "healthy",
        alertCount: 0,
        lastUpdate: now.toISOString()
      },
      {
        hostname: "db-master-01",
        osType: "linux",
        arch: "amd64",
        cpuUtilization: "52.1",
        loadAvg1m: "6.89",
        memoryUtilization: "74.2",
        memoryUsed: 119266290176,
        memoryTotal: 164926744166,
        memoryFormatted: { used: "111.1 GB", total: "153.6 GB" },
        maxDiskUtilization: "83.5",
        healthStatus: "healthy",
        alertCount: 0,
        lastUpdate: now.toISOString()
      }
    ],

    trends: {
      timestamps,
      cpu: cpuTrend,
      memory: memoryTrend,
      disk: diskTrend,
      network: networkTrend
    },

    rankings: {
      cpu: [
        { hostname: "prod-server-02", value: 72.8, unit: "%" },
        { hostname: "db-master-01", value: 52.1, unit: "%" },
        { hostname: "worker-node-01", value: 45.2, unit: "%" },
        { hostname: "prod-server-01", value: 38.5, unit: "%" },
        { hostname: "worker-node-02", value: 28.4, unit: "%" }
      ],
      memory: [
        { hostname: "prod-server-02", value: 85.6, unit: "%", usedGB: "128.0", totalGB: "160.0" },
        { hostname: "db-master-01", value: 74.2, unit: "%", usedGB: "111.1", totalGB: "153.6" },
        { hostname: "worker-node-01", value: 71.4, unit: "%", usedGB: "21.3", totalGB: "30.0" },
        { hostname: "worker-node-02", value: 55.8, unit: "%", usedGB: "16.7", totalGB: "30.0" },
        { hostname: "prod-server-01", value: 62.3, unit: "%", usedGB: "42.0", totalGB: "64.0" }
      ],
      diskIo: [
        { hostname: "db-master-01", value: 256.8, unit: "MB/s", readMB: "180.2", writeMB: "76.6" },
        { hostname: "prod-server-02", value: 198.3, unit: "MB/s", readMB: "112.1", writeMB: "86.2" },
        { hostname: "prod-server-01", value: 125.6, unit: "MB/s", readMB: "80.2", writeMB: "45.4" }
      ],
      network: [
        { hostname: "prod-server-02", value: 289.4, unit: "MB/s", rxMB: "156.8", txMB: "132.6" },
        { hostname: "db-master-01", value: 198.6, unit: "MB/s", rxMB: "112.3", txMB: "86.3" },
        { hostname: "prod-server-01", value: 156.8, unit: "MB/s", rxMB: "89.2", txMB: "67.6" }
      ]
    }
  };
}
