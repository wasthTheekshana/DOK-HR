import React, { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Site } from '../types';
import { format, startOfMonth, subMonths } from 'date-fns';
import {
    MapPin, Users, Calendar, BarChart3, TrendingUp,
    DollarSign, Activity, ClipboardList, ChevronDown
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, Line, ComposedChart, PieChart, Pie,
    Cell, LabelList
} from 'recharts';

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmtRs = (n: number) =>
    `Rs. ${Math.abs(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const fmtHrs = (h: number | null) =>
    h === null ? '—' : `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];

// ─── Sub-components ─────────────────────────────────────────────────────────

const KpiCard: React.FC<{
    label: string; value: string | number; sub?: string;
    icon: React.ElementType; color: string; bg: string;
}> = ({ label, value, sub, icon: Icon, color, bg }) => (
    <div className={`${bg} border rounded-2xl p-4`}>
        <div className="flex items-center justify-between mb-2">
            <Icon className={`w-4 h-4 ${color} opacity-70`} />
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
        </div>
        <p className={`text-[22px] font-black ${color} leading-none`}>{value}</p>
        {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
    </div>
);

const SectionCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; className?: string }> = ({
    title, subtitle, children, className = ''
}) => (
    <div className={`bg-white border border-slate-200 rounded-2xl p-5 shadow-sm ${className}`}>
        <div className="mb-4">
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{title}</h3>
            {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {children}
    </div>
);

const Empty: React.FC<{ msg?: string }> = ({ msg = 'No data for this period' }) => (
    <div className="flex flex-col items-center justify-center py-10 text-slate-300">
        <BarChart3 className="w-9 h-9 mb-2" />
        <p className="text-xs text-slate-400">{msg}</p>
    </div>
);

const CustomTip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-3 text-xs min-w-[140px]">
            <p className="font-bold text-slate-700 mb-1.5">{label}</p>
            {payload.map((e: any, i: number) => (
                <p key={i} style={{ color: e.color }} className="font-semibold">
                    {e.name}: {typeof e.value === 'number' ? e.value.toLocaleString() : e.value}
                </p>
            ))}
        </div>
    );
};

// ─── Quick date range presets ────────────────────────────────────────────────

const PRESETS = [
    { label: 'This Month', from: () => format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: () => format(new Date(), 'yyyy-MM-dd') },
    { label: 'Last Month', from: () => format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), to: () => format(new Date(new Date().getFullYear(), new Date().getMonth(), 0), 'yyyy-MM-dd') },
    { label: '3 Months',   from: () => format(subMonths(new Date(), 3), 'yyyy-MM-dd'),              to: () => format(new Date(), 'yyyy-MM-dd') },
    { label: '6 Months',   from: () => format(subMonths(new Date(), 6), 'yyyy-MM-dd'),              to: () => format(new Date(), 'yyyy-MM-dd') },
    { label: 'YTD',        from: () => `${new Date().getFullYear()}-01-01`,                         to: () => format(new Date(), 'yyyy-MM-dd') },
];

// ─── Main Page ───────────────────────────────────────────────────────────────

const TimeSitePerformance: React.FC = () => {
    const { role } = useAuth();
    const [sites, setSites]                     = useState<Site[]>([]);
    const [selectedSiteId, setSelectedSiteId]   = useState('');
    const [dateFrom, setDateFrom]               = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [dateTo, setDateTo]                   = useState(format(new Date(), 'yyyy-MM-dd'));
    const [data, setData]                       = useState<any>(null);
    const [loading, setLoading]                 = useState(false);
    const [staffTab, setStaffTab]               = useState<'days' | 'hours'>('days');
    const [showOtTable, setShowOtTable]         = useState(false);

    if (role !== 'system_admin') return <Navigate to="/" replace />;

    // Load time-based sites only
    useEffect(() => {
        api.get('/sites').then(res => {
            const timeSites = (res.data || []).filter((s: Site) => s.OT_TYPE === 'time_based' || !s.OT_TYPE);
            setSites(timeSites);
            if (timeSites.length > 0) setSelectedSiteId(String(timeSites[0].ID));
        }).catch(console.error);
    }, []);

    const fetchData = useCallback(async () => {
        if (!selectedSiteId) return;
        setLoading(true);
        setData(null);
        try {
            const res = await api.get('/analytics/time-site-performance', {
                params: { site_id: selectedSiteId, date_from: dateFrom, date_to: dateTo }
            });
            setData(res.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [selectedSiteId, dateFrom, dateTo]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const applyPreset = (p: typeof PRESETS[0]) => {
        setDateFrom(p.from());
        setDateTo(p.to());
    };

    const selectedSite = sites.find(s => String(s.ID) === selectedSiteId);

    return (
        <div className="space-y-5 pb-8">

            {/* ── Page Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Time-Based Site Performance</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Daily attendance, activity analysis & OT tracking for time-based sites</p>
                </div>
                {selectedSite && data && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-sm font-bold text-emerald-700">{selectedSite.NAME}</span>
                        <span className="text-[10px] text-emerald-500 font-semibold">#{selectedSite.SITE_NO}</span>
                    </div>
                )}
            </div>

            {/* ── Filters ── */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    {/* Site selector */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Time-Based Site</label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select
                                value={selectedSiteId}
                                onChange={e => setSelectedSiteId(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none">
                                <option value="">Select a site…</option>
                                {sites.map(s => (
                                    <option key={s.ID} value={s.ID}>{s.SITE_NO} — {s.NAME}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                    {/* Date From */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">From Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                        </div>
                    </div>
                    {/* Date To */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">To Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                        </div>
                    </div>
                </div>
                {/* Quick presets */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">Quick:</span>
                    {PRESETS.map(p => (
                        <button key={p.label} onClick={() => applyPreset(p)}
                            className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 transition-all">
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* No site selected */}
            {!selectedSiteId && (
                <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center shadow-sm">
                    <MapPin className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-base font-semibold text-slate-900 mb-1">Select a site to begin</p>
                    <p className="text-sm text-slate-500">Choose a time-based site from the dropdown above</p>
                </div>
            )}

            {/* Loading skeleton */}
            {selectedSiteId && loading && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {[...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-2xl skeleton" />)}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="h-64 rounded-2xl skeleton" />
                        <div className="h-64 rounded-2xl skeleton" />
                    </div>
                </div>
            )}

            {/* ── Data Loaded ── */}
            {!loading && data && (
                <>
                    {/* ── KPI Strip ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <KpiCard
                            label="Active Days"
                            value={data.summary.activeDays}
                            sub={`${dateFrom} → ${dateTo}`}
                            icon={Calendar}
                            color="text-indigo-700" bg="bg-indigo-50 border-indigo-200" />
                        <KpiCard
                            label="Task Records"
                            value={data.summary.totalTaskRecords.toLocaleString()}
                            sub="total staff-day logs"
                            icon={ClipboardList}
                            color="text-violet-700" bg="bg-violet-50 border-violet-200" />
                        <KpiCard
                            label="Unique Staff"
                            value={data.summary.uniqueStaff}
                            sub="workers in period"
                            icon={Users}
                            color="text-blue-700" bg="bg-blue-50 border-blue-200" />
                        <KpiCard
                            label="Avg Daily Workers"
                            value={data.summary.avgDailyWorkers}
                            sub="per working day"
                            icon={TrendingUp}
                            color="text-emerald-700" bg="bg-emerald-50 border-emerald-200" />
                        <KpiCard
                            label="Peak Attendance"
                            value={data.summary.peakWorkers}
                            sub={data.summary.peakDate ?? '—'}
                            icon={Activity}
                            color="text-amber-700" bg="bg-amber-50 border-amber-200" />
                        <KpiCard
                            label="Total OT Paid"
                            value={fmtRs(data.summary.totalOtPaid)}
                            sub="time-based OT"
                            icon={DollarSign}
                            color="text-rose-700" bg="bg-rose-50 border-rose-200" />
                    </div>

                    {/* ── Site Info Banner ── */}
                    <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm">
                        <div className="flex flex-wrap gap-6">
                            {[
                                { label: 'Site',        val: `${data.siteInfo.site_no} — ${data.siteInfo.name}` },
                                { label: 'OT Type',     val: 'Time Based' },
                                { label: 'Service',     val: data.siteInfo.service_type },
                                { label: 'Site Type',   val: data.siteInfo.site_type },
                                { label: 'Supervisor',  val: data.siteInfo.supervisor_name },
                            ].map((item, i) => (
                                <div key={i}>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{item.label}</p>
                                    <p className="text-[13px] font-bold text-slate-800">{item.val}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Daily Attendance Chart ── */}
                    <SectionCard
                        title="Daily Attendance"
                        subtitle="Workers present per day + average working hours">
                        {data.daily.length === 0 ? <Empty /> : (
                            <ResponsiveContainer width="100%" height={220}>
                                <ComposedChart
                                    data={data.daily.map((d: any) => ({
                                        date:     d.date?.slice(5),   // MM-DD
                                        workers:  d.unique_workers,
                                        records:  d.task_records,
                                        avg_hrs:  d.avg_hours,
                                    }))}
                                    margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                    <YAxis yAxisId="left"  tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: '#94a3b8' }}
                                        tickFormatter={(v: number) => `${v}h`} />
                                    <Tooltip content={<CustomTip />} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar yAxisId="left" dataKey="workers" name="Workers" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={14} />
                                    <Bar yAxisId="left" dataKey="records" name="Task Records" fill="#c7d2fe" radius={[3, 3, 0, 0]} barSize={14} />
                                    {data.summary.hasTimeData && (
                                        <Line yAxisId="right" type="monotone" dataKey="avg_hrs" name="Avg Hours"
                                            stroke="#f59e0b" strokeWidth={2} dot={false} />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </SectionCard>

                    {/* ── Monthly Trend + Task Types ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                        {/* Monthly Trend */}
                        <SectionCard title="Monthly Trend" subtitle="Task records, workers & active days per month">
                            {data.monthly.length === 0 ? <Empty /> : (
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={data.monthly}
                                        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                        <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                        <Tooltip content={<CustomTip />} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Bar dataKey="task_records" name="Task Records" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={16} />
                                        <Bar dataKey="workers"      name="Workers"      fill="#10b981" radius={[3, 3, 0, 0]} barSize={16} />
                                        <Bar dataKey="working_days" name="Active Days"  fill="#f59e0b" radius={[3, 3, 0, 0]} barSize={16} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </SectionCard>

                        {/* Activity / Task Type Breakdown */}
                        <SectionCard title="Activity Breakdown" subtitle="Task types performed at this site">
                            {data.taskTypes.length === 0 ? <Empty msg="No task description data" /> : (
                                <div className="grid grid-cols-2 gap-4 items-center">
                                    <ResponsiveContainer width="100%" height={180}>
                                        <PieChart>
                                            <Pie
                                                data={data.taskTypes.slice(0, 8).map((t: any) => ({
                                                    name: t.task_type || '(unspecified)',
                                                    value: t.records,
                                                }))}
                                                cx="50%" cy="50%"
                                                innerRadius={40} outerRadius={75}
                                                paddingAngle={2} dataKey="value">
                                                {data.taskTypes.slice(0, 8).map((_: any, i: number) => (
                                                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(val: unknown, name: string | undefined) => [String(val), String(name ?? '')] as [string, string]} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 180 }}>
                                        {data.taskTypes.slice(0, 8).map((t: any, i: number) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] font-bold text-slate-700 truncate capitalize">{t.task_type}</p>
                                                    <p className="text-[9px] text-slate-400">{t.records} records · {t.staff_count} staff · {t.day_count} days</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </SectionCard>
                    </div>

                    {/* ── Staff Performance Table ── */}
                    <SectionCard
                        title="Staff Performance"
                        subtitle="Individual attendance and working hours analysis">
                        {/* Tab toggle */}
                        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-4">
                            {(['days', 'hours'] as const).map(tab => (
                                <button key={tab} onClick={() => setStaffTab(tab)}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                        staffTab === tab ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}>
                                    {tab === 'days' ? 'Days Worked' : 'Hours Analysis'}
                                </button>
                            ))}
                        </div>

                        {data.staff.length === 0 ? <Empty /> : staffTab === 'days' ? (
                            // Days worked bar chart + table
                            <div className="space-y-4">
                                <ResponsiveContainer width="100%" height={Math.min(data.staff.length * 28 + 20, 280)}>
                                    <BarChart
                                        layout="vertical"
                                        data={data.staff.slice(0, 12).map((s: any) => ({
                                            name:  s.staff_name.split(' ').slice(0, 2).join(' '),
                                            days:  s.days_worked,
                                            recs:  s.task_records,
                                        }))}
                                        margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#475569' }} width={90} />
                                        <Tooltip content={<CustomTip />} />
                                        <Bar dataKey="days" name="Days Worked" fill="#6366f1" radius={[0, 3, 3, 0]} barSize={12}>
                                            <LabelList dataKey="days" position="right" style={{ fontSize: 9, fill: '#6366f1', fontWeight: 700 }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>

                                {/* Staff table */}
                                <div className="overflow-x-auto rounded-xl border border-slate-100">
                                    <table className="w-full text-[12px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100">
                                                <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">#</th>
                                                <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Staff Name</th>
                                                <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">EPF</th>
                                                <th className="text-right px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Days Worked</th>
                                                <th className="text-right px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Task Records</th>
                                                <th className="text-right px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Avg Hours</th>
                                                <th className="text-right px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Performance</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.staff.map((s: any, i: number) => {
                                                const maxDays = data.staff[0]?.days_worked || 1;
                                                const pct = Math.round(s.days_worked / maxDays * 100);
                                                return (
                                                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                                        <td className="px-3 py-2 text-slate-400 font-semibold">{i + 1}</td>
                                                        <td className="px-3 py-2 font-bold text-slate-800">{s.staff_name}</td>
                                                        <td className="px-3 py-2 text-slate-400">{s.epf_number}</td>
                                                        <td className="px-3 py-2 text-right">
                                                            <span className="font-black text-indigo-700">{s.days_worked}</span>
                                                            <span className="text-slate-400 ml-1">days</span>
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-semibold text-slate-700">{s.task_records}</td>
                                                        <td className="px-3 py-2 text-right font-semibold text-slate-600">{fmtHrs(s.avg_hours)}</td>
                                                        <td className="px-3 py-2">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                                    <div className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                                                                        style={{ width: `${pct}%` }} />
                                                                </div>
                                                                <span className={`text-[10px] font-black w-8 text-right ${pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{pct}%</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            // Hours analysis
                            !data.summary.hasTimeData ? (
                                <Empty msg="No in-time / out-time data recorded for this period" />
                            ) : (
                                <div className="space-y-4">
                                    <ResponsiveContainer width="100%" height={Math.min(data.staff.filter((s: any) => s.avg_hours !== null).length * 28 + 20, 260)}>
                                        <BarChart
                                            layout="vertical"
                                            data={data.staff
                                                .filter((s: any) => s.avg_hours !== null)
                                                .slice(0, 12)
                                                .map((s: any) => ({
                                                    name:  s.staff_name.split(' ').slice(0, 2).join(' '),
                                                    hours: s.avg_hours,
                                                }))}
                                            margin={{ top: 0, right: 50, left: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                            <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={(v: number) => `${v}h`} />
                                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#475569' }} width={90} />
                                            <Tooltip formatter={(val: unknown) => [`${val}h`, 'Avg Hours']} contentStyle={{ fontSize: 11 }} />
                                            <Bar dataKey="hours" name="Avg Hours/Day" fill="#f59e0b" radius={[0, 3, 3, 0]} barSize={12}>
                                                <LabelList dataKey="hours" position="right" style={{ fontSize: 9, fill: '#d97706', fontWeight: 700 }}
                                                    formatter={(v: unknown) => `${v}h`} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                                        <table className="w-full text-[12px]">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-100">
                                                    <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Staff</th>
                                                    <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">EPF</th>
                                                    <th className="text-right px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Avg Hrs/Day</th>
                                                    <th className="text-right px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Records w/ Time</th>
                                                    <th className="text-right px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Days Worked</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.staff.filter((s: any) => s.avg_hours !== null).map((s: any, i: number) => (
                                                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                                                        <td className="px-3 py-2 font-bold text-slate-800">{s.staff_name}</td>
                                                        <td className="px-3 py-2 text-slate-400">{s.epf_number}</td>
                                                        <td className="px-3 py-2 text-right font-black text-amber-700">{fmtHrs(s.avg_hours)}</td>
                                                        <td className="px-3 py-2 text-right text-slate-600 font-semibold">{s.records_with_time}</td>
                                                        <td className="px-3 py-2 text-right font-bold text-indigo-700">{s.days_worked}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )
                        )}
                    </SectionCard>

                    {/* ── Activity Detail Table ── */}
                    {data.taskTypes.length > 0 && (
                        <SectionCard title="Activity Detail" subtitle="All task types with staff and day coverage">
                            <div className="overflow-x-auto rounded-xl border border-slate-100">
                                <table className="w-full text-[12px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="text-left px-3 py-2.5 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Activity / Task Type</th>
                                            <th className="text-right px-3 py-2.5 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Records</th>
                                            <th className="text-right px-3 py-2.5 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Staff</th>
                                            <th className="text-right px-3 py-2.5 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Days Active</th>
                                            <th className="px-3 py-2.5">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Share</span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const total = data.taskTypes.reduce((s: number, t: any) => s + t.records, 0);
                                            return data.taskTypes.map((t: any, i: number) => {
                                                const pct = total > 0 ? Math.round(t.records / total * 100) : 0;
                                                return (
                                                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                                                        <td className="px-3 py-2.5">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                                                <span className="font-bold text-slate-800 capitalize">{t.task_type}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-black text-indigo-700">{t.records.toLocaleString()}</td>
                                                        <td className="px-3 py-2.5 text-right font-semibold text-slate-600">{t.staff_count}</td>
                                                        <td className="px-3 py-2.5 text-right font-semibold text-slate-600">{t.day_count}</td>
                                                        <td className="px-3 py-2.5">
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                                                                </div>
                                                                <span className="text-[10px] font-bold text-slate-500 w-8 text-right">{pct}%</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            });
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        </SectionCard>
                    )}

                    {/* ── OT Records ── */}
                    <SectionCard title="Time-Based OT Records" subtitle="Custom OT payment history for this site">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-xl">
                                    <span className="text-[11px] font-black text-rose-700">Total Paid: {fmtRs(data.summary.totalOtPaid)}</span>
                                </div>
                                <span className="text-[11px] text-slate-400">{data.otRecords.length} records</span>
                            </div>
                            <button onClick={() => setShowOtTable(v => !v)}
                                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">
                                {showOtTable ? 'Hide Table' : 'Show Table'}
                            </button>
                        </div>

                        {data.otRecords.length === 0 ? (
                            <div className="flex flex-col items-center py-8 text-slate-300">
                                <DollarSign className="w-8 h-8 mb-2" />
                                <p className="text-xs text-slate-400">No OT records found for this site</p>
                            </div>
                        ) : (
                            <>
                                {/* OT summary chart */}
                                {(() => {
                                    const byStaff: Record<string, number> = {};
                                    data.otRecords.forEach((r: any) => {
                                        byStaff[r.staff_name] = (byStaff[r.staff_name] || 0) + r.total_payment;
                                    });
                                    const chartData = Object.entries(byStaff)
                                        .map(([name, total]) => ({ name: name.split(' ').slice(0, 2).join(' '), total }))
                                        .sort((a, b) => b.total - a.total)
                                        .slice(0, 12);
                                    return (
                                        <ResponsiveContainer width="100%" height={Math.min(chartData.length * 30 + 20, 260)}>
                                            <BarChart layout="vertical" data={chartData}
                                                margin={{ top: 0, right: 80, left: 8, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                                <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }}
                                                    tickFormatter={(v: number) => `Rs.${(v / 1000).toFixed(0)}K`} />
                                                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#475569' }} width={90} />
                                                <Tooltip formatter={(val: unknown) => [fmtRs(Number(val)), 'OT Paid']} contentStyle={{ fontSize: 11 }} />
                                                <Bar dataKey="total" name="OT Payment" fill="#f43f5e" radius={[0, 3, 3, 0]} barSize={14}>
                                                    <LabelList dataKey="total" position="right"
                                                        style={{ fontSize: 9, fill: '#e11d48', fontWeight: 700 }}
                                                        formatter={(v: unknown) => `Rs.${(Number(v) / 1000).toFixed(1)}K`} />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    );
                                })()}

                                {/* OT detail table */}
                                {showOtTable && (
                                    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
                                        <table className="w-full text-[12px]">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-100">
                                                    <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Staff</th>
                                                    <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">EPF</th>
                                                    <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Period</th>
                                                    <th className="text-right px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Extra Hrs</th>
                                                    <th className="text-right px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Adj. Hrs</th>
                                                    <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Type</th>
                                                    <th className="text-right px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Payment</th>
                                                    <th className="text-right px-3 py-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Saved At</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.otRecords.map((r: any, i: number) => (
                                                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                                                        <td className="px-3 py-2 font-bold text-slate-800">{r.staff_name}</td>
                                                        <td className="px-3 py-2 text-slate-400">{r.epf_number}</td>
                                                        <td className="px-3 py-2 text-slate-600 text-[11px]">{r.date_from} → {r.date_to}</td>
                                                        <td className="px-3 py-2 text-right text-slate-600">{Number(r.total_extra_hours).toFixed(2)}</td>
                                                        <td className="px-3 py-2 text-right text-slate-600">{Number(r.total_adjusted_hours).toFixed(2)}</td>
                                                        <td className="px-3 py-2 text-[11px]">
                                                            <span className="px-2 py-0.5 bg-slate-100 rounded-md text-slate-600 font-semibold">{r.calculation_type}</span>
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-black text-rose-700">{fmtRs(r.total_payment)}</td>
                                                        <td className="px-3 py-2 text-right text-slate-400 text-[10px]">{r.saved_at}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
                    </SectionCard>
                </>
            )}
        </div>
    );
};

export default TimeSitePerformance;
