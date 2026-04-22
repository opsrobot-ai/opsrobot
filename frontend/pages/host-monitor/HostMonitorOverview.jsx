import { useState, useEffect, useCallback } from "react";
import intl from "react-intl-universal";
import Icon from "../../components/Icon.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";
import {
  Area,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function getStatusColor(status) {
  switch (status) {
    case "healthy": return "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "warning": return "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300";
    case "critical": return "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-950/40 dark:text-red-300";
    default: return "bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400";
  }
}

function getStatusLabel(status) {
  switch (status) {
    case "healthy": return intl.get("hostMonitor.statusHealthy");
    case "warning": return intl.get("hostMonitor.statusWarning");
    case "critical": return intl.get("hostMonitor.statusCritical");
    default: return status;
  }
}

function LineChart({ data, color, height = 208, yMax }) {
  if (!data || data.length === 0) {
    return <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("hostMonitor.noData")}</p>;
  }

  const formatValue = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return String(val ?? '');
    if (yMax != null) return n.toFixed(1) + '%';
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toFixed(n < 10 ? 1 : 0);
  };

  const trendTick = (d) => {
    if (typeof d === "string" && d.length >= 10) return d.slice(5);
    return String(d ?? '');
  };

  const gradId = `areaGrad-${color.replace('#', '')}-${Math.random().toString(36).substr(2, 5)}`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={trendTick} />
        <YAxis tick={{ fontSize: 10 }} width={yMax ? 40 : 48}
          domain={yMax ? [0, yMax] : undefined}
          tickFormatter={(v) => formatValue(v)} />
        <Tooltip formatter={(v) => [formatValue(v), '']} labelFormatter={(d) => d || ''} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Area type="monotone" dataKey="value" stroke="none" fill={`url(#${gradId})`} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

function DualAreaChart({ data, height = 208 }) {
  if (!data || data.length === 0) {
    return <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("hostMonitor.noData")}</p>;
  }

  const formatValue = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return String(val ?? '');
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toFixed(n < 10 ? 1 : 0);
  };

  const trendTick = (d) => {
    if (typeof d === "string" && d.length >= 10) return d.slice(5);
    return String(d ?? '');
  };

  const rxGrad = `rxGrad-${Math.random().toString(36).substr(2, 5)}`;
  const txGrad = `txGrad-${Math.random().toString(36).substr(2, 5)}`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={rxGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id={txGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={trendTick} />
        <YAxis tick={{ fontSize: 10 }} width={50} tickFormatter={(v) => formatValue(v)} />
        <Tooltip formatter={(v, name) => [formatValue(v), name === 'receive' ? intl.get("hostMonitor.receive") : intl.get("hostMonitor.transmit")]} labelFormatter={(d) => d || ''} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Legend verticalAlign="top" align="right" iconType="plain" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey="receive" stroke="none" fill={`url(#${rxGrad})`} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="receive" name={intl.get("hostMonitor.receive")} stroke="#06b6d4" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
        <Area type="monotone" dataKey="transmit" stroke="none" fill={`url(#${txGrad})`} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="transmit" name={intl.get("hostMonitor.transmit")} stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

function PieChart({ data, colors: customColors }) {
  const safeData = (data && data.length > 0) ? data : [{ name: '-', value: 1 }];
  const total = safeData.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const defaultColors = ['#3b5cf6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
  const colors = customColors || defaultColors;

  if (total === 0) {
    return <p className="flex h-[200px] items-center justify-center text-xs text-gray-400">{intl.get("hostMonitor.noData")}</p>;
  }

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Pie data={safeData} dataKey="value" nameKey="name" cx="50%" cy="50%"
            outerRadius={70} innerRadius={35} paddingAngle={2}>
            {safeData.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => `${Number(v).toFixed(0)} (${(Number(v) / total * 100).toFixed(1)}%)`} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}

function TopHostsTable({ data, metricLabel, valueFormatter = (v) => v.toFixed(1) + '%' }) {
  if (!data || data.length === 0) {
    return (
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50/80 dark:bg-gray-800/50">
            <tr>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400 w-8">#</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.hostname")}</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">OS</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400 text-right">{metricLabel}</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">{intl.get("hostMonitor.noData")}</td></tr>
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-gray-50/80 dark:bg-gray-800/50">
          <tr>
            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400 w-8">#</th>
            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.hostname")}</th>
            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">OS</th>
            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400 text-right">{metricLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {data.slice(0, 8).map((item, index) => (
            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{index + 1}</td>
              <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200 truncate max-w-[140px]">{item.name || '-'}</td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{item.os || '-'}</td>
              <td className="px-3 py-2 text-right font-mono font-medium text-gray-900 dark:text-gray-100">{valueFormatter(item.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopList({ data, valueFormatter = (v) => v.toLocaleString() }) {
  if (!data || data.length === 0) return null;
  const maxValue = Math.max(...data.map(d => d.value));
  return (
    <div className="space-y-2">
      {data.slice(0, 8).map((item, index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="w-5 h-5 flex items-center justify-center rounded text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            {index + 1}
          </span>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{valueFormatter(item.value)}</span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(item.value / maxValue) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const TIME_RANGE_DEFS = [
  { value: "6h", hours: 6, labelKey: "hostMonitor.timeRange.6h" },
  { value: "12h", hours: 12, labelKey: "hostMonitor.timeRange.12h" },
  { value: "24h", hours: 24, labelKey: "hostMonitor.timeRange.24h" },
  { value: "72h", hours: 72, labelKey: "hostMonitor.timeRange.3d" },
  { value: "168h", hours: 168, labelKey: "hostMonitor.timeRange.7d" },
];

export default function HostMonitorOverview({ onHostClick }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedHours, setSelectedHours] = useState(24);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/host-monitor/overview?hours=${selectedHours}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedHours]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 60000);
    return () => clearInterval(timer);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Icon name="loading" className="h-8 w-8 text-primary animate-spin" />
          <span className="text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.loading")}</span>
        </div>
      </div>
    );
  }

  const summary = data?.summary || {};
  const hostList = data?.hostList || [];
  const trends = data?.trends || {};
  const rankings = data?.rankings || {};

  const rawTimestamps = (trends.timestamps || []);
  const safeTs = rawTimestamps.length > 0 ? rawTimestamps : Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.now() - (23 - i) * 3600000);
    return d.toISOString();
  });

  function fmtTs(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return String(ts); }
  }

  function downsample(arr, maxPts = 60) {
    if (arr.length <= maxPts) return arr;
    const step = arr.length / maxPts;
    return Array.from({ length: maxPts }, (_, i) => arr[Math.floor(i * step)]);
  }

  const tsLabels = downsample(safeTs.map(fmtTs));
  const cpuRaw = (trends.cpu || []);
  const memRaw = (trends.memory || []);
  const diskRaw = (trends.disk || []);
  const netRaw = (trends.network || []);

  const ensureTrendData = (raw, defaultVal, count) => {
    const arr = (raw && raw.length > 0) ? raw : Array.from({ length: count || tsLabels.length || 24 }, (_, i) => ({ utilization: String(defaultVal) }));
    return arr;
  };

  const cpuTrendData = downsample(ensureTrendData(cpuRaw, 0, tsLabels.length)).map((d, i) => ({ time: tsLabels[i] || '', value: parseFloat(d.utilization) || 0 }));
  const memTrendData = downsample(ensureTrendData(memRaw, 0, tsLabels.length)).map((d, i) => ({ time: tsLabels[i] || '', value: parseFloat(d.utilization) || 0 }));
  const diskTrendData = downsample(ensureTrendData(diskRaw, 0, tsLabels.length)).map((d, i) => ({ time: tsLabels[i] || '', value: parseFloat(d.utilization) || 0 }));

  const netDualDataRaw = (netRaw && netRaw.length > 0) ? netRaw : Array.from({ length: tsLabels.length || 24 }, () => ({ receiveMB: '0', transmitMB: '0' }));
  const netDualData = downsample(netDualDataRaw).map((d, i) => ({
    time: tsLabels[i] || '',
    receive: parseFloat(d.receiveMB) || 0,
    transmit: parseFloat(d.transmitMB) || 0,
  }));

  const healthDist = [
    { name: intl.get("hostMonitor.statusHealthy"), value: Number(summary.healthyHosts) || 0 },
    { name: intl.get("hostMonitor.statusWarning"), value: Number(summary.warningHosts) || 0 },
    { name: intl.get("hostMonitor.statusCritical"), value: Number(summary.criticalHosts) || 0 },
  ];

  const osDist = [];
  const osMap = {};
  (hostList || []).forEach(h => {
    const key = h.osType || 'unknown';
    osMap[key] = (osMap[key] || 0) + 1;
  });
  Object.entries(osMap).forEach(([k, v]) => osDist.push({ name: k, value: v }));
  if (osDist.length === 0) osDist.push({ name: '-', value: 1 });

  const hostOsMap = {};
  const hostNameMap = {};
  (hostList || []).forEach(h => {
    if (h.hostname) {
      hostOsMap[h.hostname] = h.osType || 'linux';
      hostNameMap[h.hostname] = h.hostname;
    }
  });
  const firstHostName = (hostList && hostList.length > 0 && hostList[0].hostname) ? hostList[0].hostname : 'unknown';

  const enrichTopData = (raw, fallback) => {
    const arr = (raw && raw.length > 0) ? raw : fallback;
    return arr.map(r => {
      const rawName = r.hostname || r.name || '';
      const resolvedName = (rawName && rawName !== 'unknown' && rawName !== 'null') ? rawName : firstHostName;
      return {
        name: resolvedName,
        os: r.osType || hostOsMap[resolvedName] || 'linux',
        value: parseFloat(r.value) || 0,
      };
    });
  };

  const topCpu = enrichTopData(rankings.cpu, [{ hostname: firstHostName, value: 0, osType: '-' }]);
  const topMem = enrichTopData(rankings.memory, [{ hostname: firstHostName, value: 0, osType: '-' }]);
  const topDisk = enrichTopData(rankings.diskIo || rankings.disk, [{ hostname: firstHostName, value: 0, osType: '-' }]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
          <div className="flex items-start gap-3">
            <Icon name="alert" className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">{intl.get("hostMonitor.loadError")}</h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>
              <button type="button" onClick={fetchData}
                className="mt-2 text-sm font-medium text-red-700 hover:text-red-800 underline dark:text-red-300 dark:hover:text-red-200">
                {intl.get("common.retry")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 工具栏：时间范围 + 刷新 (对齐 OtelOverview 样式) */}
      <div className="app-card flex flex-col gap-4 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.timeRange")}</span>
          <div className="flex gap-1.5">
            {TIME_RANGE_DEFS.map((range) => (
              <button key={range.value} type="button" onClick={() => setSelectedHours(range.hours)}
                className={[
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  selectedHours === range.hours
                    ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                    : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
                ].join(" ")}
              >
                {intl.get(range.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-6">
          <button type="button" onClick={fetchData} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors">
            <Icon name="refresh" className={["h-3.5 w-3.5", loading ? "animate-spin" : ""].join(" ")} />
            {intl.get("hostMonitor.refresh")}
          </button>

          <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.lastUpdate")}: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "-"}</span>
        </div>
      </div>

      {/* KPI 卡片行 1：核心指标 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon name="server" className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.totalHosts")}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">{summary.totalHosts || 0}</span>
                <span className="text-[11px] text-gray-400">{intl.get("hostMonitor.hostsUnit")}</span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>{intl.get("hostMonitor.healthyCount", { count: summary.healthyHosts || 0 })}</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>{intl.get("hostMonitor.warningCount", { count: summary.warningHosts || 0 })}</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>{intl.get("hostMonitor.criticalCount", { count: summary.criticalHosts || 0 })}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <Icon name="cpu" className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.avgCpuUtil")}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">{summary.avgCpuUtilization || 0}%</span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${Math.min(summary.avgCpuUtilization || 0, 100)}%` }} />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Icon name="memory" className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.avgMemUtil")}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">{summary.avgMemoryUtilization || 0}%</span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(summary.avgMemoryUtilization || 0, 100)}%` }} />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
              <Icon name="hard-drive" className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.maxDiskUtil")}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">{summary.maxDiskUtilization || 0}%</span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${Math.min(summary.maxDiskUtilization || 0, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* KPI 卡片行 2：辅助指标 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Icon name="activity" className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.healthRate")}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">
                  {summary.totalHosts > 0 ? ((summary.healthyHosts / summary.totalHosts) * 100).toFixed(0) : 0}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
              <Icon name="alert-triangle" className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.alertCount")}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">{(summary.warningHosts || 0) + (summary.criticalHosts || 0)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500">
              <Icon name="clock" className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.avgLoad")}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">{summary.loadAverage?.["1m"] || "N/A"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-pink-500/10 text-pink-500">
              <Icon name="timer" className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.lastUpdate")}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : '-'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 趋势图：2x2 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.chartCpuTrend")}</h3>
          <div className="mt-2 h-52"><LineChart data={cpuTrendData} color="#8b5cf6" yMax={100} /></div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.chartMemoryTrend")}</h3>
          <div className="mt-2 h-52"><LineChart data={memTrendData} color="#3b82f6" yMax={100} /></div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.chartDiskTrend")}</h3>
          <div className="mt-2 h-52"><LineChart data={diskTrendData} color="#f97316" yMax={100} /></div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.chartNetworkTrend")}</h3>
          <div className="mt-2 h-52"><DualAreaChart data={netDualData} /></div>
        </div>
      </div>

      {/* 占比 + 排行：3列 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3">{intl.get("hostMonitor.chartHealthDist")}</h3>
          <PieChart data={healthDist} colors={['#10b981', '#f59e0b', '#ef4444']} />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3">{intl.get("hostMonitor.chartOsDist")}</h3>
          <PieChart data={osDist.length > 0 ? osDist : [{ name: '-', value: 1 }]} />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3">{intl.get("hostMonitor.chartTopCpu")}</h3>
          <TopHostsTable data={topCpu} metricLabel={intl.get("hostMonitor.cpuUsage")} valueFormatter={(v) => v.toFixed(1) + '%'} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3">{intl.get("hostMonitor.chartTopMemory")}</h3>
          <TopHostsTable data={topMem} metricLabel={intl.get("hostMonitor.memoryUsage")} valueFormatter={(v) => v.toFixed(1) + '%'} />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3">{intl.get("hostMonitor.chartTopDisk")}</h3>
          <TopHostsTable data={topDisk} metricLabel={intl.get("hostMonitor.diskUsage")} valueFormatter={(v) => v.toFixed(1) + '%'} />
        </div>
      </div>

      {/* 主机列表表格 */}
      <div className="app-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.hostTableTitle")}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.hostTableHint")}</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.hostTotalCount", { count: hostList.length })}</span>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span className="text-emerald-600 dark:text-emerald-400">{intl.get("hostMonitor.hostHealthyCount", { count: hostList.filter(h => h.healthStatus === 'healthy').length })}</span>
          </div>
        </div>

        {hostList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
            <Icon name="server" className="h-12 w-12 mb-3 opacity-50" />
            <p>{intl.get("hostMonitor.noData")}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-800/80">
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("hostMonitor.colHostname")}</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("hostMonitor.colOs")}</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("hostMonitor.colStatus")}</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">CPU %</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("hostMonitor.colMemory")}</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("hostMonitor.colDisk")}</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Load</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("hostMonitor.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/50">
                  {hostList.map((host, idx) => (
                    <tr key={idx}
                      className="transition-colors duration-200 hover:bg-primary-soft/40 dark:hover:bg-primary/10 cursor-pointer"
                      onClick={() => onHostClick && onHostClick(host)}>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-gray-800 dark:text-gray-200">{host.hostname}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{host.osType}/{host.arch}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusColor(host.healthStatus)}`}>
                          {getStatusLabel(host.healthStatus)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                            <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(host.cpuUtilization, 100)}%` }} />
                          </div>
                          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{host.cpuUtilization}%</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(host.memoryUtilization, 100)}%` }} />
                          </div>
                          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{host.memoryUtilization}%</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`font-mono text-xs font-medium ${
                          Number(host.maxDiskUtilization) > 85 ? 'text-red-600' :
                          Number(host.maxDiskUtilization) > 70 ? 'text-amber-600' : 'text-green-600'
                        }`}>
                          {host.maxDiskUtilization}%
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{host.loadAvg1m || '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button type="button" onClick={(e) => { e.stopPropagation(); onHostClick && onHostClick(host); }}
                          className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft transition-colors">
                          <Icon name="info" className="h-3.5 w-3.5 mr-1" />
                          {intl.get("hostMonitor.viewDetail")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
