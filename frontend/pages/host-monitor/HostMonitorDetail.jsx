import { useState, useEffect, useCallback } from "react";
import intl from "react-intl-universal";
import Icon from "../../components/Icon.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";
import HostMonitorHostTable from "./HostMonitorHostTable.jsx";
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

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function CoreMetricCard({ title, value, hint, accent, children }) {
  const baseClass = [
    "rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm ring-1 ring-black/[0.03]",
    "dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]",
    accent ?? "",
  ].join(" ");
  return (
    <div className={baseClass}>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}
      {children}
    </div>
  );
}

function getStatusColor(status) {
  switch (status) {
    case "healthy": return "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "warning": return "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300";
    case "critical": return "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-950/40 dark:text-red-300";
    default: return "bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400";
  }
}
function getHealthLabel(status) {
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

function RechartsDonut({ data, colors, height = 220 }) {
  const safeData = (data && data.length > 0) ? data : [];
  if (safeData.length === 0) {
    return <p className="flex items-center justify-center text-xs text-gray-400" style={{ height }}>{intl.get("hostMonitor.noData")}</p>;
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Pie data={safeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={1}
            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
            {safeData.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => (v != null ? Number(v).toFixed(1) : "—")} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}

const DETAIL_TABS = [
  { id: "basicInfo", labelKey: "hostMonitor.detailTab.basicInfo" },
  { id: "cpu", labelKey: "hostMonitor.detailTab.cpu" },
  { id: "memory", labelKey: "hostMonitor.detailTab.memory" },
  { id: "disk", labelKey: "hostMonitor.detailTab.disk" },
  { id: "network", labelKey: "hostMonitor.detailTab.network" },
  { id: "processes", labelKey: "hostMonitor.detailTab.processes" },
];

const CPU_PIE_COLORS = ["#3b82f6", "#ec4899", "#22c55e", "#f59e0b"];
const MEM_PIE_COLORS = ["#ef4444", "#22c55e", "#f59e0b", "#06b6d4"];
const DISK_PIE_COLORS = ["#0ea5e9", "#6366f1", "#22c55e", "#f97316", "#ec4899", "#a855f7", "#14b8a6", "#eab308"];
const PROC_PIE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

/** 运行详情右侧主体（与「主机列表」抽屉内展示一致） */
export function HostMonitorDetailMainPanel({ selectedHost, overviewData, onBack }) {
  const [activeTab, setActiveTab] = useState("basicInfo");
  const [detailData, setDetailData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const hostList = overviewData?.hostList || [];
  const currentHostname = selectedHost?.hostname || selectedHost || (hostList[0]?.hostname || null);

  const fetchDetail = useCallback(async (hostname) => {
    if (!hostname) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ hours: 24, hostname });
      const res = await fetch(`/api/host-monitor?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDetailData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentHostname) {
      fetchDetail(currentHostname);
      setActiveTab("basicInfo");
    }
  }, [currentHostname, fetchDetail]);

  const summary = detailData?.summary || {};
  const cpu = detailData?.cpu || {};
  const memory = detailData?.memory || {};
  const memTotal = Number(memory.totalBytes) || 0;
  const memUsed = Number(memory.usedBytes) || 0;
  const memFree = Number(memory.freeBytes) || 0;
  const memCached = Number(memory.cachedBytes) || 0;
  const memBuffer = Number(memory.bufferBytes) || 0;
  const memPct = (val) => memTotal > 0 ? ((val / memTotal) * 100) : 0;
  const memBreakdown = [
    { label: intl.get("hostMonitor.memUsed"), value: memory.formatted?.used || "0 B", pct: memPct(memUsed), color: "bg-red-500", tc: "text-red-600 dark:text-red-400" },
    { label: intl.get("hostMonitor.memFree"), value: memory.formatted?.free || "0 B", pct: memPct(memFree), color: "bg-green-500", tc: "text-green-600 dark:text-green-400" },
    { label: intl.get("hostMonitor.memCached"), value: memory.formatted?.cached || "0 B", pct: memPct(memCached), color: "bg-amber-500", tc: "text-amber-600 dark:text-amber-400" },
    { label: intl.get("hostMonitor.memBuffer"), value: memory.formatted?.buffer || "0 B", pct: memPct(memBuffer), color: "bg-cyan-500", tc: "text-cyan-600 dark:text-cyan-400" },
  ];
  const memPieData = memBreakdown
    .map(b => ({ name: b.label, value: Number(b.pct.toFixed(1)) }))
    .filter(x => x.value > 0);
  const disks = detailData?.disks || [];
  const networks = detailData?.networks || [];
  const processes = detailData?.processes || {};
  const hostInfo = detailData?.hostInfo || {};

  function downsample(arr, maxPts = 60) {
    if (!arr || arr.length <= maxPts) return arr || [];
    const step = arr.length / maxPts;
    return Array.from({ length: maxPts }, (_, i) => arr[Math.floor(i * step)]);
  }

  function fmtTs(ts) {
    if (!ts) return '';
    try { const d = new Date(ts); return `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
    catch { return String(ts); }
  }

  const cpuTrendRaw = detailData?.trends?.cpuUtilization || [];
  const memTrendRaw = detailData?.trends?.memoryUtilization || [];
  const diskTrendRaw = detailData?.trends?.diskMaxUtilization || [];
  const netTrendRaw = detailData?.trends?.network || [];
  const tsRaw = detailData?.trends?.timestamps || [];

  const safeTs = tsRaw.length > 0 ? tsRaw : Array.from({ length: 24 }, (_, i) => new Date(Date.now() - (23 - i) * 3600000).toISOString());

  const tsLabels = downsample(safeTs.map(fmtTs));
  const extractValues = (raw, key = 'utilization') => {
    if (!raw || raw.length === 0) return Array(tsLabels.length || 24).fill(0);
    return raw.map(d => typeof d === 'object' ? parseFloat(d[key]) || 0 : parseFloat(d) || 0);
  };
  const cpuTrendData = downsample(extractValues(cpuTrendRaw)).map((v, i) => ({ time: tsLabels[i] || '', value: v }));
  const memTrendData = downsample(extractValues(memTrendRaw)).map((v, i) => ({ time: tsLabels[i] || '', value: v }));
  const diskTrendData = downsample(extractValues(diskTrendRaw)).map((v, i) => ({ time: tsLabels[i] || '', value: v }));
  const netRxTrend = downsample(netTrendRaw.length > 0 ? netTrendRaw : Array(tsLabels.length || 24).fill({ receiveMB: '0', transmitMB: '0' })).map((v, i) => ({ time: tsLabels[i] || '', value: parseFloat(v.receiveMB) || 0 }));
  const netTxTrend = downsample(netTrendRaw.length > 0 ? netTrendRaw : Array(tsLabels.length || 24).fill({ receiveMB: '0', transmitMB: '0' })).map((v, i) => ({ time: tsLabels[i] || '', value: parseFloat(v.transmitMB) || 0 }));

  const cpuPieData = [
    { name: intl.get("hostMonitor.cpuUser"), value: Number(cpu.userPercent) || 0 },
    { name: intl.get("hostMonitor.cpuSystem"), value: Number(cpu.systemPercent) || 0 },
    { name: intl.get("hostMonitor.cpuIdle"), value: Number(cpu.idlePercent) || 0 },
    { name: intl.get("hostMonitor.cpuIowait"), value: Number(cpu.iowaitPercent) || 0 },
  ].filter(x => x.value > 0);

  const diskPieData = disks.map(d => ({ name: d.mountpoint, value: Number(d.utilizationPercent) || 0 })).filter(x => x.value > 0);

  const procPieData = [
    { name: intl.get("hostMonitor.procRunning"), value: Number(processes.running) || 0 },
    { name: intl.get("hostMonitor.procSleeping"), value: Number(processes.sleeping) || 0 },
    { name: intl.get("hostMonitor.procStopped"), value: Number(processes.stopped) || 0 },
    { name: intl.get("hostMonitor.procZombie"), value: Number(processes.zombie) || 0 },
  ].filter(x => x.value > 0);

  return (
    <section className="flex h-full min-h-0 w-full flex-1 flex-col">
        {!currentHostname ? (
          <div className="app-card flex min-h-[420px] flex-1 items-center justify-center p-8 text-center">
            <div>
              <Icon name="server" className="mx-auto h-12 w-12 mb-3 opacity-30 text-gray-400" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{intl.get("hostMonitor.detail.empty.selectHost")}</p>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.detail.empty.hint")}</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {loading && (
              <div className="flex flex-1 items-center justify-center py-16">
                <LoadingSpinner />
              </div>
            )}
            {error && (<div className="app-card shrink-0 p-4 text-sm text-rose-600 dark:text-rose-400">{error}</div>)}

            {!loading && !error && detailData && (
              <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="app-card flex shrink-0 items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon name="server" className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{currentHostname}</h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{hostInfo.osType || '-'}/{hostInfo.arch || '-'} · {summary.healthStatus ? getHealthLabel(summary.healthStatus) : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getStatusColor(detailData.healthStatus)}`}>
                      {getHealthLabel(detailData.healthStatus)}
                    </span>
                    {onBack && (
                      <button type="button" onClick={onBack}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors">
                        <Icon name="arrow-left" className="h-3.5 w-3.5" />{intl.get("hostMonitor.backToOverview")}
                      </button>
                    )}
                  </div>
                </div>

                <div className="app-card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
                  <nav
                    className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-100 px-6 dark:border-gray-700/60 scrollbar-ui"
                    role="tablist"
                  >
                    {DETAIL_TABS.map((tab) => (
                      <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={[
                          "-mb-px whitespace-nowrap rounded-t-md border px-3 py-2.5 text-sm font-medium transition",
                          activeTab === tab.id
                            ? "border-gray-200 border-b-white bg-white text-primary dark:border-gray-700 dark:border-b-gray-900 dark:bg-gray-900 dark:text-primary"
                            : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-800"
                        ].join(" ")}>
                        {intl.get(tab.labelKey)}
                      </button>
                    ))}
                  </nav>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-6">
                    {/* ===== 基础信息 Tab ===== */}
                    {activeTab === "basicInfo" && (
                      <div className="space-y-6">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.basicInfo.title")}</h4>
                        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {[
                            { labelKey: "hostMonitor.basicInfo.hostname", value: hostInfo.name || currentHostname },
                            { labelKey: "hostMonitor.basicInfo.osType", value: `${hostInfo.osType || "-"}/${hostInfo.arch || "-"}` },
                            { labelKey: "hostMonitor.basicInfo.status", value: getHealthLabel(detailData.healthStatus), color: getStatusColor(detailData.healthStatus) },
                            { labelKey: "hostMonitor.basicInfo.cpuCores", value: cpu.coreCount || "-" },
                            { labelKey: "hostMonitor.basicInfo.totalMemory", value: memory.formatted?.total || "-" },
                            { labelKey: "hostMonitor.basicInfo.processCount", value: processes.total || summary.processCount || 0 },
                          ].map((item) => (
                            <div key={item.labelKey}>
                              <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{intl.get(item.labelKey)}</dt>
                              <dd className={`mt-1 text-sm font-medium ${item.color || 'text-gray-900 dark:text-gray-100'}`}>{item.value}</dd>
                            </div>
                          ))}
                        </dl>

                        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                          <CoreMetricCard title={intl.get("hostMonitor.cpuUsage")} value={`${summary.avgCpuUtilization}%`} hint={intl.get("hostMonitor.cpuUsage")}>
                            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                              <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(Number(summary.avgCpuUtilization) || 0, 100)}%` }} />
                            </div>
                          </CoreMetricCard>
                          <CoreMetricCard title={intl.get("hostMonitor.memoryUsage")} value={`${summary.avgMemoryUtilization}%`} hint={intl.get("hostMonitor.memoryUsage")}>
                            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                              <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(Number(summary.avgMemoryUtilization) || 0, 100)}%` }} />
                            </div>
                          </CoreMetricCard>
                          <CoreMetricCard title={intl.get("hostMonitor.diskUsage")} value={`${summary.maxDiskUtilization}%`} hint={intl.get("hostMonitor.diskUsage")}>
                            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                              <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(Number(summary.maxDiskUtilization) || 0, 100)}%` }} />
                            </div>
                          </CoreMetricCard>
                          <CoreMetricCard title={intl.get("hostMonitor.loadAvg")} value={summary.loadAverage?.["1m"] || "N/A"} />
                          <CoreMetricCard title={intl.get("hostMonitor.alertCount")} value={(summary.warningHosts||0)+(summary.criticalHosts||0)} />
                        </div>

                        <div className="app-card overflow-hidden p-0">
                          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.resourceTrend24h")}</h4>
                          </div>
                          <div className="grid gap-4 p-4 lg:grid-cols-2">
                            <div>
                              <p className="mb-2 text-xs font-medium text-violet-600 dark:text-violet-400">CPU {intl.get("hostMonitor.usage")}</p>
                              <div className="h-52"><LineChart data={cpuTrendData} color="#8b5cf6" yMax={100} /></div>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-medium text-blue-600 dark:text-blue-400">MEM {intl.get("hostMonitor.usage")}</p>
                              <div className="h-52"><LineChart data={memTrendData} color="#3b82f6" yMax={100} /></div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                          <CoreMetricCard title={intl.get("hostMonitor.cpuUser")} value={`${Number(cpu.userPercent || 0).toFixed(1)}%`} accent="border-l-4 border-l-violet-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.cpuSystem")} value={`${Number(cpu.systemPercent || 0).toFixed(1)}%`} accent="border-l-4 border-l-pink-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.cpuIowait")} value={`${Number(cpu.iowaitPercent || 0).toFixed(1)}%`} accent="border-l-4 border-l-amber-500" />
                        </div>
                      </div>
                    )}

                    {/* ===== CPU Tab ===== */}
                    {activeTab === "cpu" && (
                      <div className="space-y-6">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.cpuDetail")}</h4>

                        <div className="app-card overflow-hidden p-0">
                          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.cpuTrend24h")}</h4>
                          </div>
                          <div className="h-64 w-full px-2 py-4 sm:px-4">
                            <LineChart data={cpuTrendData} color="#8b5cf6" yMax={100} />
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          <CoreMetricCard title={intl.get("hostMonitor.cores")} value={Number(cpu.coreCount) || 0} accent="border-l-4 border-l-violet-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.cpuUser")} value={`${Number(cpu.userPercent || 0).toFixed(1)}%`} accent="border-l-4 border-l-blue-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.cpuSystem")} value={`${Number(cpu.systemPercent || 0).toFixed(1)}%`} accent="border-l-4 border-l-pink-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.cpuIowait")} value={`${Number(cpu.iowaitPercent || 0).toFixed(1)}%`} accent="border-l-4 border-l-amber-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.cpuIdle")} value={`${Number(cpu.idlePercent || 0).toFixed(1)}%`} accent="border-l-4 border-l-emerald-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.cpuSteal")} value={`${Number(cpu.stealPercent || 0).toFixed(1)}%`} accent="border-l-4 border-l-cyan-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.cpuNice")} value={`${Number(cpu.nicePercent || 0).toFixed(1)}%`} accent="border-l-4 border-l-indigo-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.cpuIrq")} value={`${Number(cpu.irqPercent || 0).toFixed(1)}%`} accent="border-l-4 border-l-yellow-500" />
                        </div>

                        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
                          <h5 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.cpuBreakdown")}</h5>
                          <div className="space-y-3">
                            {[
                              { name: intl.get("hostMonitor.cpuUser"), val: Number(cpu.userPercent) || 0, color: "#3b82f6" },
                              { name: intl.get("hostMonitor.cpuSystem"), val: Number(cpu.systemPercent) || 0, color: "#ec4899" },
                              { name: intl.get("hostMonitor.cpuIdle"), val: Number(cpu.idlePercent) || 0, color: "#22c55e" },
                              { name: intl.get("hostMonitor.cpuIowait"), val: Number(cpu.iowaitPercent) || 0, color: "#f59e0b" },
                              { name: intl.get("hostMonitor.cpuSteal"), val: Number(cpu.stealPercent) || 0, color: "#06b6d4" },
                              { name: intl.get("hostMonitor.cpuOther"), val: (Number(cpu.nicePercent)||0)+(Number(cpu.irqPercent)||0)+(Number(cpu.softIrqPercent)||0), color: "#8b5cf6" },
                            ].filter(r => r.val > 0).map((row) => {
                              const numVal = Number(row.val);
                              return (
                              <div key={row.name} className="flex items-center gap-3">
                                <span className="w-20 shrink-0 text-xs text-gray-600 dark:text-gray-400">{row.name}</span>
                                <div className="flex-1 h-5 overflow-hidden rounded bg-gray-100 dark:bg-gray-700">
                                  <div className="h-full rounded transition-all" style={{ width: `${Math.min(numVal, 100)}%`, backgroundColor: row.color }} />
                                </div>
                                <span className="w-12 text-right text-xs font-mono font-medium text-gray-700 dark:text-gray-300">{numVal.toFixed(1)}%</span>
                              </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="app-card overflow-hidden p-0">
                            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.cpuTimeDist")}</h4>
                            </div>
                            <div className="px-2 py-4 sm:px-4">
                              <RechartsDonut data={cpuPieData} colors={CPU_PIE_COLORS} height={220} />
                            </div>
                          </div>
                          <div className="grid gap-4 content-start">
                            <CoreMetricCard title={intl.get("hostMonitor.contextSwitches")} value={cpu.contextSwitches?.toLocaleString() || "N/A"} hint="/sec" />
                            <CoreMetricCard title={intl.get("hostMonitor.interrupts")} value={cpu.interrupts?.toLocaleString() || "N/A"} hint="/sec" />
                            <CoreMetricCard title={intl.get("hostMonitor.loadAvg5m")} value={summary.loadAverage?.["5m"] || "N/A"} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ===== 内存 Tab ===== */}
                    {activeTab === "memory" && (
                      <div className="space-y-6">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.memoryDetail")}</h4>

                        <div className="app-card overflow-hidden p-0">
                          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.memTrend24h")}</h4>
                          </div>
                          <div className="h-64 w-full px-2 py-4 sm:px-4">
                            <LineChart data={memTrendData} color="#3b82f6" yMax={100} />
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          <CoreMetricCard title={intl.get("hostMonitor.totalMemory")} value={memory.formatted?.total || "-"} accent="border-l-4 border-l-blue-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.memUsed")} value={memory.formatted?.used || "0 B"} accent="border-l-4 border-l-red-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.memFree")} value={memory.formatted?.free || "0 B"} accent="border-l-4 border-l-green-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.utilizationRate")} value={`${summary.avgMemoryUtilization || 0}%`} accent="border-l-4 border-l-violet-500" />
                        </div>

                        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
                          <h5 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.memoryBreakdown")}</h5>
                          <div className="space-y-3">
                            {memBreakdown.map((row) => (
                              <div key={row.label} className="flex items-center gap-3">
                                <span className="w-16 shrink-0 text-xs font-medium text-gray-700 dark:text-gray-300">{row.label}</span>
                                <div className="flex-1 h-6 overflow-hidden rounded bg-gray-100 dark:bg-gray-700">
                                  <div className={`h-full rounded ${row.color}`} style={{ width: `${Math.min(row.pct, 100)}%` }} />
                                </div>
                                <span className={`w-28 text-right text-xs font-mono font-medium ${row.tc}`}>{row.value}</span>
                                <span className="w-12 text-right text-xs text-gray-500">{Number(row.pct).toFixed(1)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="app-card overflow-hidden p-0">
                            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.memDistChart")}</h4>
                            </div>
                            <div className="px-2 py-4 sm:px-4">
                              <RechartsDonut data={memPieData} colors={MEM_PIE_COLORS} height={220} />
                            </div>
                          </div>
                          <div className="grid gap-4 content-start">
                            <CoreMetricCard title={intl.get("hostMonitor.swapTotal")} value={memory.swapFormatted?.total || "N/A"} />
                            <CoreMetricCard title={intl.get("hostMonitor.swapUsed")} value={memory.swapFormatted?.used || "0 B"} />
                            <CoreMetricCard title={intl.get("hostMonitor.pageTables")} value={memory.pageTables || "N/A"} />
                            <CoreMetricCard title={intl.get("hostMonitor.memAvailable")} value={memory.formatted?.available || "N/A"} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ===== 磁盘 Tab ===== */}
                    {activeTab === "disk" && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.diskDetail")} ({disks.length})</h4>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" />{intl.get("hostMonitor.diskHealthy")}: {disks.filter(d => Number(d.utilizationPercent) < 70).length}</span>
                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />{intl.get("hostMonitor.diskWarning")}: {disks.filter(d => Number(d.utilizationPercent) >= 70 && Number(d.utilizationPercent) < 85).length}</span>
                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />{intl.get("hostMonitor.diskCritical")}: {disks.filter(d => Number(d.utilizationPercent) >= 85).length}</span>
                          </div>
                        </div>

                        <div className="app-card overflow-hidden p-0">
                          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.diskTrend24h")}</h4>
                          </div>
                          <div className="h-64 w-full px-2 py-4 sm:px-4">
                            <LineChart data={diskTrendData} color="#f97316" yMax={100} />
                          </div>
                        </div>

                        {disks.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.noData")}</p>
                        ) : (
                          <>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-700/60 dark:bg-gray-800/30">
                                    <th className="pb-3 text-left font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.mountpoint")}</th>
                                    <th className="pb-3 text-left font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.device")}</th>
                                    <th className="pb-3 text-left font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.fstype")}</th>
                                    <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.usage")}</th>
                                    <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.used")}</th>
                                    <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.available")}</th>
                                    <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.totalSize")}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                                  {disks.map((disk, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                      <td className="py-3 font-medium text-gray-900 dark:text-gray-100">{disk.mountpoint}</td>
                                      <td className="py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{disk.device}</td>
                                      <td className="py-3 text-xs text-gray-500 dark:text-gray-400">{disk.fstype || "-"}</td>
                                      <td className="py-3 text-right">
                                        <span className={`font-mono text-sm font-medium ${Number(disk.utilizationPercent) > 85 ? 'text-red-600' : Number(disk.utilizationPercent) > 70 ? 'text-amber-600' : 'text-green-600'}`}>{disk.utilizationPercent}%</span>
                                        <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700 ml-auto">
                                          <div className={`h-full rounded-full ${Number(disk.utilizationPercent) > 85 ? 'bg-red-500' : Number(disk.utilizationPercent) > 70 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(disk.utilizationPercent, 100)}%` }} />
                                        </div>
                                      </td>
                                      <td className="py-3 text-right font-mono text-xs text-gray-700 dark:text-gray-300">{disk.usedFormatted}</td>
                                      <td className="py-3 text-right font-mono text-xs text-gray-700 dark:text-gray-300">{disk.freeFormatted}</td>
                                      <td className="py-3 text-right font-mono text-xs text-gray-700 dark:text-gray-300">{disk.totalFormatted || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                              <div className="app-card overflow-hidden p-0">
                                <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.diskSpaceDist")}</h4>
                                </div>
                                <div className="px-2 py-4 sm:px-4">
                                  <RechartsDonut data={diskPieData} colors={DISK_PIE_COLORS} height={220} />
                                </div>
                              </div>
                              <div className="grid gap-4 content-start">
                                <CoreMetricCard title={intl.get("hostMonitor.diskReadOps")} value={(summary.diskReadOps||0).toLocaleString()} hint="ops/sec" />
                                <CoreMetricCard title={intl.get("hostMonitor.diskWriteOps")} value={(summary.diskWriteOps||0).toLocaleString()} hint="ops/sec" />
                                <CoreMetricCard title={intl.get("hostMonitor.diskReadBytes")} value={summary.diskReadBytes || "N/A"} hint="KB/s" />
                                <CoreMetricCard title={intl.get("hostMonitor.diskWriteBytes")} value={summary.diskWriteBytes || "N/A"} hint="KB/s" />
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* ===== 网络 Tab ===== */}
                    {activeTab === "network" && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.networkDetail")} ({networks.length})</h4>
                        </div>

                        <div className="app-card overflow-hidden p-0">
                          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.netTrafficTrend")}</h4>
                          </div>
                          <div className="grid gap-4 p-4 lg:grid-cols-2">
                            <div>
                              <p className="mb-2 text-xs font-medium text-cyan-600 dark:text-cyan-400">⬇ {intl.get("hostMonitor.receive")} (MB)</p>
                              <div className="h-52"><LineChart data={netRxTrend} color="#06b6d4" /></div>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-medium text-violet-600 dark:text-violet-400">⬆ {intl.get("hostMonitor.transmit")} (MB)</p>
                              <div className="h-52"><LineChart data={netTxTrend} color="#8b5cf6" /></div>
                            </div>
                          </div>
                        </div>

                        {networks.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.noData")}</p>
                        ) : (
                          <>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                              {networks.slice(0, 6).map((net, idx) => (
                                <div key={idx} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05] hover:border-primary/30 transition-colors">
                                  <div className="mb-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-400">
                                        <Icon name="wifi" className="h-3.5 w-3.5" />
                                      </div>
                                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{net.device}</span>
                                    </div>
                                    <span className="text-[10px] text-gray-400">{net.macAddress || ''}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="rounded bg-blue-50/70 p-2.5 dark:bg-blue-950/20">
                                      <div className="text-[10px] text-blue-600 dark:text-blue-400">⬇ {intl.get("hostMonitor.receive")}</div>
                                      <div className="mt-0.5 text-sm font-semibold text-blue-900 dark:text-blue-100">{net.receiveFormatted || "0 B"}</div>
                                    </div>
                                    <div className="rounded bg-green-50/70 p-2.5 dark:bg-green-950/20">
                                      <div className="text-[10px] text-green-600 dark:text-green-400">⬆ {intl.get("hostMonitor.transmit")}</div>
                                      <div className="mt-0.5 text-sm font-semibold text-green-900 dark:text-green-100">{net.transmitFormatted || "0 B"}</div>
                                    </div>
                                  </div>
                                  {net.speed && <div className="mt-2 text-[10px] text-gray-400">Speed: {net.speed}</div>}
                                </div>
                              ))}
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                              <CoreMetricCard title={intl.get("hostMonitor.netPacketsRx")} value={(summary.netPacketsRx||0).toLocaleString()} accent="border-l-4 border-l-cyan-500" />
                              <CoreMetricCard title={intl.get("hostMonitor.netPacketsTx")} value={(summary.netPacketsTx||0).toLocaleString()} accent="border-l-4 border-l-violet-500" />
                              <CoreMetricCard title={intl.get("hostMonitor.netErrors")} value={(summary.netErrors||0).toLocaleString()} accent="border-l-4 border-l-red-500" />
                              <CoreMetricCard title={intl.get("hostMonitor.netDrops")} value={(summary.netDrops||0).toLocaleString()} accent="border-l-4 border-l-amber-500" />
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* ===== 进程 Tab ===== */}
                    {activeTab === "processes" && (
                      <div className="space-y-6">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.processDetail")}</h4>

                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                          <CoreMetricCard title={intl.get("hostMonitor.procRunning")} value={processes.running || 0} accent="border-l-4 border-l-green-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.procSleeping")} value={processes.sleeping || 0} accent="border-l-4 border-l-blue-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.procStopped")} value={processes.stopped || 0} accent="border-l-4 border-l-amber-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.procZombie")} value={processes.zombie || 0} accent="border-l-4 border-l-red-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.procThreads")} value={processes.threads || "-"} accent="border-l-4 border-l-violet-500" />
                          <CoreMetricCard title={intl.get("hostMonitor.procHandles")} value={processes.handles || "-"} accent="border-l-4 border-l-cyan-500" />
                        </div>

                        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.processStatusDist")}</h5>
                            <span className="text-xs text-gray-400">{intl.get("hostMonitor.totalProcesses")}: <strong className="text-gray-700 dark:text-gray-300">{processes.total || 0}</strong></span>
                          </div>
                          <div className="flex gap-1 h-8 rounded overflow-hidden">
                            {[
                              { label: intl.get("hostMonitor.procRunning"), count: processes.running, color: "bg-green-500" },
                              { label: intl.get("hostMonitor.procSleeping"), count: processes.sleeping, color: "bg-blue-500" },
                              { label: intl.get("hostMonitor.procStopped"), count: processes.stopped, color: "bg-amber-500" },
                              { label: intl.get("hostMonitor.procZombie"), count: processes.zombie, color: "bg-red-500" },
                            ].filter(p => p.count > 0).map((p) => {
                              const pct = processes.total > 0 ? (p.count / processes.total * 100) : 0;
                              return <div key={p.label} className={`${p.color}`} style={{ width: `${pct}%` }} title={`${p.label}: ${p.count} (${pct.toFixed(1)}%)`} />;
                            })}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs">
                            {[
                              { label: intl.get("hostMonitor.procRunning"), count: processes.running, color: "bg-green-500" },
                              { label: intl.get("hostMonitor.procSleeping"), count: processes.sleeping, color: "bg-blue-500" },
                              { label: intl.get("hostMonitor.procStopped"), count: processes.stopped, color: "bg-amber-500" },
                              { label: intl.get("hostMonitor.procZombie"), count: processes.zombie, color: "bg-red-500" },
                            ].map((p) => (
                              <span key={p.label} className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${p.color}`} /><span className="text-gray-600 dark:text-gray-400">{p.label}: <strong>{p.count}</strong></span>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="app-card overflow-hidden p-0">
                            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.procStatusPie")}</h4>
                            </div>
                            <div className="px-2 py-4 sm:px-4">
                              <RechartsDonut data={procPieData} colors={PROC_PIE_COLORS} height={220} />
                            </div>
                          </div>
                          <div className="grid gap-4 content-start">
                            <CoreMetricCard title={intl.get("hostMonitor.topCpuProcess")} value={summary.topCpuProcess || "N/A"} hint={`CPU: ${summary.topCpuProcessUsage || "-"}%`} accent="border-l-4 border-l-violet-500" />
                            <CoreMetricCard title={intl.get("hostMonitor.topMemProcess")} value={summary.topMemProcess || "N/A"} hint={`MEM: ${summary.topMemProcessUsage || "-"}`} accent="border-l-4 border-l-blue-500" />
                            <CoreMetricCard title={intl.get("hostMonitor.processUptime")} value={summary.hostUptime || "N/A"} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
    </section>
  );
}

export default function HostMonitorDetail({ selectedHost, overviewData, overviewLoading, onBack, onSelectHost }) {
  const hostList = overviewData?.hostList || [];
  const currentHostname = selectedHost?.hostname || selectedHost || (hostList[0]?.hostname || null);

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(280px,22rem)_minmax(0,1fr)]">
      <aside className="min-h-0">
        <div className="app-card flex h-full min-h-[420px] flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.hostList.title")}</p>
            <span className="text-xs text-gray-400">{hostList.length} {intl.get("hostMonitor.hostsUnit")}</span>
          </div>

          {overviewLoading && !overviewData ? (
            <div className="flex flex-1 items-center justify-center py-10"><LoadingSpinner /></div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto pr-0.5">
              <HostMonitorHostTable
                hosts={hostList}
                selectedHostname={currentHostname}
                showToolbar={false}
                onRowClick={(host) => {
                  onSelectHost?.(host);
                }}
              />
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        <HostMonitorDetailMainPanel selectedHost={selectedHost} overviewData={overviewData} onBack={onBack} />
      </div>
    </div>
  );
}
