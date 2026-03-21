import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { format, subMonths, startOfMonth } from 'date-fns';
import {
    Users, MapPin, TrendingUp, TrendingDown, DollarSign, Clock,
    Target, BarChart3, AlertTriangle, Award, Calendar,
    Activity
} from 'lucide-react';
import {
    ResponsiveContainer,
    PieChart, Pie, Cell, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    LineChart, Line,
    LabelList
} from 'recharts';

// ─── Color palettes ─────────────────────────────────────────────────────────
const COLORS_PIE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6'];
const COLORS_BAR = { indigo: '#6366f1', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e', violet: '#8b5cf6', blue: '#3b82f6', cyan: '#06b6d4' };

// ─── Shared sub-components ───────────────────────────────────────────────────

const SectionHeader: React.FC<{ icon: React.ElementType; title: string; subtitle: string; color: string }> = ({ icon: Icon, title, subtitle, color }) => (
    <div className="flex items-center gap-3 mb-5">
        <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center shrink-0`}>
            <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
    </div>
);

const MetricCard: React.FC<{ label: string; value: string | number; sub?: string; icon: React.ElementType; iconBg: string; iconColor: string; trend?: 'up' | 'down' | 'neutral' }> = ({ label, value, sub, icon: Icon, iconBg, iconColor, trend }) => (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-start justify-between">
            <div className={`w-9 h-9 ${iconBg} rounded-lg flex items-center justify-center`}>
                <Icon className={`w-4.5 h-4.5 ${iconColor}`} />
            </div>
            {trend && (
                <span className={`text-xs font-semibold ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-500' : 'text-slate-400'}`}>
                    {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—'}
                </span>
            )}
        </div>
        <p className="text-2xl font-black text-slate-900 mt-3">{value}</p>
        <p className="text-xs font-semibold text-slate-500 mt-0.5 uppercase tracking-wider">{label}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
);

const ChartCard: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 ${className}`}>
        <h3 className="text-sm font-bold text-slate-700 mb-4">{title}</h3>
        {children}
    </div>
);

const LoadingChart: React.FC<{ height?: number }> = ({ height = 200 }) => (
    <div className={`skeleton rounded-xl`} style={{ height }} />
);

const EmptyChart: React.FC<{ message?: string }> = ({ message = 'No data for this period' }) => (
    <div className="flex flex-col items-center justify-center py-10 text-slate-300">
        <BarChart3 className="w-10 h-10 mb-2" />
        <p className="text-xs font-medium text-slate-400">{message}</p>
    </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-3 text-xs">
            <p className="font-bold text-slate-700 mb-1">{label}</p>
            {payload.map((entry: any, i: number) => (
                <p key={i} style={{ color: entry.color }} className="font-semibold">
                    {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
                </p>
            ))}
        </div>
    );
};

// ─── Date range filter ───────────────────────────────────────────────────────
const DateRangeFilter: React.FC<{
    dateFrom: string; dateTo: string;
    onFromChange: (v: string) => void; onToChange: (v: string) => void;
}> = ({ dateFrom, dateTo, onFromChange, onToChange }) => (
    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">Period</span>
        <div className="flex gap-2 items-center">
            <input type="date" value={dateFrom} onChange={e => onFromChange(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
            <span className="text-slate-400 text-xs">to</span>
            <input type="date" value={dateTo} onChange={e => onToChange(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        </div>
    </div>
);

// ─── Main Page ───────────────────────────────────────────────────────────────

const Analytics: React.FC = () => {
    const defaultFrom = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');
    const defaultTo = format(new Date(), 'yyyy-MM-dd');

    const [activeSection, setActiveSection] = useState<string>('workforce');
    const [dateFrom, setDateFrom] = useState(defaultFrom);
    const [dateTo, setDateTo] = useState(defaultTo);

    // Data states
    const [workforce, setWorkforce] = useState<any>(null);
    const [taskData, setTaskData] = useState<any>(null);
    const [attendanceData, setAttendanceData] = useState<any>(null);
    const [payrollData, setPayrollData] = useState<any>(null);
    const [perfData, setPerfData] = useState<any>(null);
    const [siteData, setSiteData] = useState<any>(null);
    const [siteCountTrend, setSiteCountTrend] = useState<any>(null);
    const [profitData, setProfitData]           = useState<any>(null);
    const [profitTab, setProfitTab]             = useState<'service' | 'site_type' | 'ot_type' | 'all'>('service');
    const [invAnalysis, setInvAnalysis]         = useState<any>(null);
    const [invTrendMode, setInvTrendMode]       = useState<'monthly' | 'quarterly'>('monthly');
    const [invDetailTab, setInvDetailTab]       = useState<'top_revenue' | 'top_profit' | 'loss' | 'all'>('top_revenue');

    // Loading states
    const [loadingWorkforce, setLoadingWorkforce] = useState(false);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [loadingAttendance, setLoadingAttendance] = useState(false);
    const [loadingPayroll, setLoadingPayroll] = useState(false);
    const [loadingPerf, setLoadingPerf] = useState(false);
    const [loadingSite, setLoadingSite] = useState(false);
    const [loadingSiteCount, setLoadingSiteCount] = useState(false);
    const [loadingProfit, setLoadingProfit]       = useState(false);
    const [loadingInvAnalysis, setLoadingInvAnalysis] = useState(false);

    const fetchWorkforce = useCallback(async () => {
        setLoadingWorkforce(true);
        try {
            const res = await api.get('/analytics/workforce');
            setWorkforce(res.data);
        } catch (e) { console.error(e); }
        finally { setLoadingWorkforce(false); }
    }, []);

    const fetchTasks = useCallback(async () => {
        setLoadingTasks(true);
        try {
            const res = await api.get('/analytics/tasks', { params: { date_from: dateFrom, date_to: dateTo } });
            setTaskData(res.data);
        } catch (e) { console.error(e); }
        finally { setLoadingTasks(false); }
    }, [dateFrom, dateTo]);

    const fetchAttendance = useCallback(async () => {
        setLoadingAttendance(true);
        try {
            const res = await api.get('/analytics/attendance', { params: { date_from: dateFrom, date_to: dateTo } });
            setAttendanceData(res.data);
        } catch (e) { console.error(e); }
        finally { setLoadingAttendance(false); }
    }, [dateFrom, dateTo]);

    const fetchPayroll = useCallback(async () => {
        setLoadingPayroll(true);
        try {
            const res = await api.get('/analytics/payroll', { params: { date_from: dateFrom, date_to: dateTo } });
            setPayrollData(res.data);
        } catch (e) { console.error(e); }
        finally { setLoadingPayroll(false); }
    }, [dateFrom, dateTo]);

    const fetchPerformance = useCallback(async () => {
        setLoadingPerf(true);
        try {
            const res = await api.get('/analytics/performance', { params: { date_from: dateFrom, date_to: dateTo } });
            setPerfData(res.data);
        } catch (e) { console.error(e); }
        finally { setLoadingPerf(false); }
    }, [dateFrom, dateTo]);

    const fetchSite = useCallback(async () => {
        setLoadingSite(true);
        try {
            const res = await api.get('/analytics/sites', { params: { date_from: dateFrom, date_to: dateTo } });
            setSiteData(res.data);
        } catch (e) { console.error(e); }
        finally { setLoadingSite(false); }
    }, [dateFrom, dateTo]);

    const fetchSiteCountTrend = useCallback(async () => {
        setLoadingSiteCount(true);
        try {
            const res = await api.get('/analytics/site-count-trend', { params: { date_from: dateFrom, date_to: dateTo } });
            setSiteCountTrend(res.data);
        } catch (e) { console.error(e); }
        finally { setLoadingSiteCount(false); }
    }, [dateFrom, dateTo]);

    const fetchProfit = useCallback(async () => {
        setLoadingProfit(true);
        try {
            const res = await api.get('/analytics/profitability');
            setProfitData(res.data);
        } catch (e) { console.error(e); }
        finally { setLoadingProfit(false); }
    }, []);

    const fetchInvoiceAnalysis = useCallback(async () => {
        setLoadingInvAnalysis(true);
        try {
            const res = await api.get('/analytics/invoice-analysis');
            setInvAnalysis(res.data);
        } catch (e) { console.error(e); }
        finally { setLoadingInvAnalysis(false); }
    }, []);

    // Load on mount + when date changes
    useEffect(() => { fetchWorkforce(); }, [fetchWorkforce]);
    useEffect(() => {
        if (activeSection === 'tasks') fetchTasks();
        else if (activeSection === 'attendance') fetchAttendance();
        else if (activeSection === 'payroll') fetchPayroll();
        else if (activeSection === 'performance') fetchPerformance();
        else if (activeSection === 'sites') fetchSite();
        else if (activeSection === 'site-count') fetchSiteCountTrend();
        else if (activeSection === 'profitability') fetchProfit();
        else if (activeSection === 'invoice-analysis') fetchInvoiceAnalysis();
    }, [activeSection, dateFrom, dateTo]);

    const sections = [
        { id: 'workforce',    label: 'Workforce',        icon: Users,     color: 'bg-indigo-600' },
        { id: 'tasks',        label: 'Productivity',     icon: Activity,  color: 'bg-orange-500' },
        { id: 'attendance',   label: 'Attendance',       icon: Calendar,  color: 'bg-cyan-600' },
        { id: 'payroll',      label: 'Payroll & OT',     icon: DollarSign, color: 'bg-emerald-600' },
        { id: 'sites',        label: 'Site Overview',    icon: MapPin,    color: 'bg-blue-600' },
        { id: 'site-count',   label: 'Site Count Trend', icon: TrendingUp, color: 'bg-rose-500' },
        { id: 'profitability',    label: 'Profitability',     icon: BarChart3,  color: 'bg-teal-600' },
        { id: 'invoice-analysis', label: 'Invoice Analysis',  icon: DollarSign, color: 'bg-green-700' },
    ];

    const handleSectionChange = (id: string) => {
        setActiveSection(id);
        if (id === 'tasks' && !taskData) fetchTasks();
        else if (id === 'attendance' && !attendanceData) fetchAttendance();
        else if (id === 'payroll' && !payrollData) fetchPayroll();
        else if (id === 'performance' && !perfData) fetchPerformance();
        else if (id === 'sites' && !siteData) fetchSite();
        else if (id === 'site-count' && !siteCountTrend) fetchSiteCountTrend();
        else if (id === 'profitability' && !profitData) fetchProfit();
        else if (id === 'invoice-analysis' && !invAnalysis) fetchInvoiceAnalysis();
    };

    return (
        <div className="space-y-5 pb-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Workforce, productivity & payroll insights</p>
                </div>
                <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
            </div>

            {/* Section Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
                {sections.map(s => (
                    <button
                        key={s.id}
                        onClick={() => handleSectionChange(s.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all shrink-0 ${activeSection === s.id ? `${s.color} text-white shadow-sm` : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-200 hover:text-indigo-600'}`}
                    >
                        <s.icon className="w-4 h-4" />
                        {s.label}
                    </button>
                ))}
            </div>

            {/* ── SECTION 1: Workforce ────────────────────────────────────── */}
            {activeSection === 'workforce' && (
                <div className="space-y-5">
                    <SectionHeader icon={Users} title="Workforce Overview" subtitle="Employee distribution and status breakdown" color="bg-indigo-600" />

                    {/* KPI Cards */}
                    {loadingWorkforce ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
                        </div>
                    ) : workforce ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <MetricCard label="Total Staff" value={workforce.summary.TOTAL_EMPLOYEES || 0} icon={Users} iconBg="bg-indigo-50" iconColor="text-indigo-600" />
                            <MetricCard label="Active" value={workforce.summary.ACTIVE_EMPLOYEES || 0} icon={TrendingUp} iconBg="bg-emerald-50" iconColor="text-emerald-600" trend="up" />
                            <MetricCard label="Inactive" value={workforce.summary.INACTIVE_EMPLOYEES || 0} icon={TrendingDown} iconBg="bg-rose-50" iconColor="text-rose-500" trend="down" />
                            <MetricCard label="Total Sites" value={workforce.summary.TOTAL_SITES || 0} icon={MapPin} iconBg="bg-blue-50" iconColor="text-blue-600" />
                            <MetricCard label="Supervisors" value={workforce.summary.TOTAL_SUPERVISORS || 0} icon={Award} iconBg="bg-violet-50" iconColor="text-violet-600" />
                            <MetricCard label="Staff" value={workforce.summary.TOTAL_STAFF || 0} icon={Users} iconBg="bg-amber-50" iconColor="text-amber-600" />
                        </div>
                    ) : null}

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Role Distribution Pie */}
                        <ChartCard title="Role Distribution">
                            {loadingWorkforce ? <LoadingChart /> : !workforce?.roleDistribution?.length ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie data={workforce.roleDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                                            {workforce.roleDistribution.map((_: any, i: number) => (
                                                <Cell key={i} fill={COLORS_PIE[i % COLORS_PIE.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        {/* Active vs Inactive Bar */}
                        <ChartCard title="Active vs Inactive">
                            {loadingWorkforce ? <LoadingChart /> : !workforce?.statusDistribution?.length ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={workforce.statusDistribution} barSize={60}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]}>
                                            {workforce.statusDistribution.map((entry: any, i: number) => (
                                                <Cell key={i} fill={entry.name === 'active' ? COLORS_BAR.emerald : COLORS_BAR.rose} />
                                            ))}
                                            <LabelList dataKey="value" position="top" style={{ fontSize: 12, fontWeight: 700 }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        {/* Site-wise Distribution */}
                        <ChartCard title="Site-wise Employee Distribution">
                            {loadingWorkforce ? <LoadingChart /> : !workforce?.siteDistribution?.length ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={workforce.siteDistribution} layout="vertical" barSize={14}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 11 }} />
                                        <YAxis dataKey="site" type="category" tick={{ fontSize: 10 }} width={80} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Bar dataKey="staff" name="Staff" fill={COLORS_BAR.indigo} radius={[0, 4, 4, 0]} />
                                        <Bar dataKey="supervisors" name="Supervisors" fill={COLORS_BAR.violet} radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>
                    </div>
                </div>
            )}

            {/* ── SECTION 2: Productivity / Tasks ────────────────────────── */}
            {activeSection === 'tasks' && (
                <div className="space-y-5">
                    <SectionHeader icon={Activity} title="Productivity & Task Analysis" subtitle="Daily task counts, site output, and top performers" color="bg-orange-500" />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Daily Task Count Line Chart */}
                        <ChartCard title="Daily Task Count" className="lg:col-span-2">
                            {loadingTasks ? <LoadingChart height={240} /> : !taskData?.dailyCount?.length ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={240}>
                                    <LineChart data={taskData.dailyCount}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Line type="monotone" dataKey="tasks" name="Tasks" stroke={COLORS_BAR.indigo} strokeWidth={2.5} dot={{ r: 3, fill: COLORS_BAR.indigo }} activeDot={{ r: 5 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        {/* Site Productivity */}
                        <ChartCard title="Site Productivity (Task Count)">
                            {loadingTasks ? <LoadingChart /> : !taskData?.siteProductivity?.length ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={taskData.siteProductivity} barSize={28}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="site_no" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="task_count" name="Tasks" fill={COLORS_BAR.amber} radius={[6, 6, 0, 0]}>
                                            <LabelList dataKey="task_count" position="top" style={{ fontSize: 10, fontWeight: 700 }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        {/* Top 10 Performers */}
                        <ChartCard title="Top 10 Performers (Target Based)">
                            {loadingTasks ? <LoadingChart /> : !taskData?.topPerformers?.length ? <EmptyChart message="No target-based task data" /> : (
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={taskData.topPerformers} layout="vertical" barSize={16}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 10 }} />
                                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={90} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="count" name="Total Count" fill={COLORS_BAR.emerald} radius={[0, 6, 6, 0]}>
                                            <LabelList dataKey="count" position="right" style={{ fontSize: 10, fontWeight: 700 }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>
                    </div>

                    {/* Target Achievement Stacked Bar */}
                    <ChartCard title="Target Achievement % (Top 15 Staff)">
                        {loadingTasks ? <LoadingChart height={280} /> : !taskData?.targetAchievement?.length ? <EmptyChart message="No target-based data for this period" /> : (
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={taskData.targetAchievement} barSize={30}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={50} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar dataKey="target" name="Target" fill={COLORS_BAR.rose} radius={[6, 6, 0, 0]} />
                                    <Bar dataKey="actual" name="Actual" fill={COLORS_BAR.emerald} radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>
                </div>
            )}

            {/* ── SECTION 3: Attendance ───────────────────────────────────── */}
            {activeSection === 'attendance' && (
                <div className="space-y-5">
                    <SectionHeader icon={Calendar} title="Attendance & Working Hours" subtitle="Monthly trends, hours worked, and late-stay analysis" color="bg-cyan-600" />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Monthly Attendance Trend — site by site */}
                        {(() => {
                            const LINE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#06b6d4', '#f43f5e', '#84cc16', '#f97316'];
                            const siteTrend = attendanceData?.siteMonthlyTrend;
                            const sites: string[] = siteTrend?.sites || [];
                            const trend: any[] = siteTrend?.trend || [];
                            return (
                                <ChartCard title="Monthly Attendance Trend (Site-Wise)" className="lg:col-span-2">
                                    {loadingAttendance ? <LoadingChart height={240} /> : !trend.length ? <EmptyChart /> : (
                                        <ResponsiveContainer width="100%" height={240}>
                                            <LineChart data={trend}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                                <Tooltip content={<CustomTooltip />} />
                                                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                                {sites.map((siteNo, i) => (
                                                    <Line
                                                        key={siteNo}
                                                        type="monotone"
                                                        dataKey={siteNo}
                                                        name={siteNo}
                                                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                                        strokeWidth={2}
                                                        dot={trend.length <= 12 ? { r: 4 } : false}
                                                        activeDot={{ r: 6 }}
                                                    />
                                                ))}
                                            </LineChart>
                                        </ResponsiveContainer>
                                    )}
                                </ChartCard>
                            );
                        })()}

                        {/* Avg Working Hours */}
                        <ChartCard title="Avg Working Hours per Employee (Time-Based)">
                            {loadingAttendance ? <LoadingChart /> : !attendanceData?.avgWorkingHours?.length ? <EmptyChart message="No time-based task data" /> : (
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart data={attendanceData.avgWorkingHours} layout="vertical" barSize={16}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, 'auto']} />
                                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={90} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="hours" name="Avg Hours" fill={COLORS_BAR.blue} radius={[0, 6, 6, 0]}>
                                            <LabelList dataKey="hours" position="right" style={{ fontSize: 10, fontWeight: 700 }} formatter={(v: unknown) => `${v}h`} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        {/* Late Stay Analysis */}
                        <ChartCard title="Late Stay Analysis (After 5 PM)">
                            {loadingAttendance ? <LoadingChart /> : !attendanceData?.lateStay?.length ? <EmptyChart message="No late-stay data for this period" /> : (
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart data={attendanceData.lateStay} layout="vertical" barSize={16}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={90} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="count" name="Days Late" fill={COLORS_BAR.amber} radius={[0, 6, 6, 0]}>
                                            <LabelList dataKey="count" position="right" style={{ fontSize: 10, fontWeight: 700 }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>
                    </div>
                </div>
            )}

            {/* ── SECTION 4: Payroll & OT ─────────────────────────────────── */}
            {activeSection === 'payroll' && (
                <div className="space-y-5">
                    <SectionHeader icon={DollarSign} title="Payroll & OT Analysis" subtitle="Salary distribution, OT trends, and site payroll costs" color="bg-emerald-600" />

                    {/* Summary Cards */}
                    {loadingPayroll ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
                        </div>
                    ) : payrollData ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <MetricCard label="Total Basic Salary" value={payrollData.summary.total_basic_salary?.toLocaleString()} icon={DollarSign} iconBg="bg-indigo-50" iconColor="text-indigo-600" sub="Active employees" />
                            <MetricCard label="Time-based OT" value={payrollData.summary.time_based_ot_total?.toLocaleString()} icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-600" sub="Extra hours × rate" />
                            <MetricCard label="Target-based OT" value={payrollData.summary.target_based_ot_total?.toLocaleString()} icon={Target} iconBg="bg-violet-50" iconColor="text-violet-600" sub="Extra units × rate" />
                            <MetricCard label="Total OT Paid" value={payrollData.summary.total_ot_paid?.toLocaleString()} icon={BarChart3} iconBg="bg-orange-50" iconColor="text-orange-600" sub={`${dateFrom} to ${dateTo}`} />
                            <MetricCard label="Total Payroll Cost" value={payrollData.summary.total_payroll_cost?.toLocaleString()} icon={TrendingUp} iconBg="bg-emerald-50" iconColor="text-emerald-600" trend="up" />
                            <MetricCard label="Active Employees" value={payrollData.summary.active_employees || 0} icon={Users} iconBg="bg-blue-50" iconColor="text-blue-600" />
                        </div>
                    ) : null}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Basic vs OT Pie */}
                        <ChartCard title="Payroll Breakdown">
                            {loadingPayroll ? <LoadingChart height={240} /> : !payrollData?.payrollBreakdown?.some((d: any) => d.value > 0) ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart>
                                        <Pie data={payrollData.payrollBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                                            <Cell fill={COLORS_BAR.indigo} />
                                            <Cell fill={COLORS_BAR.amber} />
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        {/* Monthly OT Trend */}
                        <ChartCard title="Monthly OT Payment Trend" className="md:col-span-2">
                            {loadingPayroll ? <LoadingChart height={240} /> : !payrollData?.monthlyTrend?.length ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={240}>
                                    <LineChart data={payrollData.monthlyTrend}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Line type="monotone" dataKey="ot_payment" name="OT Payment" stroke={COLORS_BAR.amber} strokeWidth={2.5} dot={{ r: 4, fill: COLORS_BAR.amber }} activeDot={{ r: 6 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>
                    </div>

                    {/* Payroll by Site */}
                    <ChartCard title="Basic Salary Cost by Site">
                        {loadingPayroll ? <LoadingChart height={250} /> : !payrollData?.sitePayroll?.filter((d: any) => d.total_salary > 0).length ? <EmptyChart message="No salary data configured" /> : (
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={payrollData.sitePayroll.filter((d: any) => d.total_salary > 0)} barSize={36}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="site" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="total_salary" name="Total Salary" fill={COLORS_BAR.emerald} radius={[6, 6, 0, 0]}>
                                        <LabelList dataKey="staff_count" position="top" style={{ fontSize: 9 }} formatter={(v: unknown) => `${v} staff`} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    {/* ── Site-wise OT Payment Breakdown ── */}
                    <ChartCard title="Site-wise OT Payment Breakdown (Time-based vs Target-based)">
                        {loadingPayroll ? <LoadingChart height={280} /> : !payrollData?.siteOTBreakdown?.filter((d: any) => d.total_ot_payment > 0).length ? <EmptyChart message="No OT payment data for this period" /> : (
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={payrollData.siteOTBreakdown.filter((d: any) => d.total_ot_payment > 0)} barSize={32}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="site_no" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar dataKey="time_ot_payment" name="Time-based OT" stackId="ot" fill={COLORS_BAR.amber} />
                                    <Bar dataKey="target_ot_payment" name="Target-based OT" stackId="ot" fill={COLORS_BAR.violet} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    {/* OT Summary Table */}
                    {!loadingPayroll && payrollData?.siteOTBreakdown?.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                                <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                                    <DollarSign className="w-4 h-4 text-amber-600" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-800">Site-wise OT Payment Summary</h3>
                                    <p className="text-xs text-slate-500">{dateFrom} → {dateTo}</p>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-amber-600 uppercase tracking-wider">Time-based OT</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-violet-600 uppercase tracking-wider">Target-based OT</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-emerald-600 uppercase tracking-wider">Total OT</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {payrollData.siteOTBreakdown.map((row: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-3 text-sm font-semibold text-slate-800 whitespace-nowrap">
                                                    <span className="text-slate-400 font-mono text-xs mr-2">{row.site_no}</span>
                                                    {row.site_name}
                                                </td>
                                                <td className="px-5 py-3 text-sm text-right font-mono whitespace-nowrap">
                                                    {row.time_ot_payment > 0
                                                        ? <span className="font-semibold text-amber-600">{row.time_ot_payment.toLocaleString()}</span>
                                                        : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-5 py-3 text-sm text-right font-mono whitespace-nowrap">
                                                    {row.target_ot_payment > 0
                                                        ? <span className="font-semibold text-violet-600">{row.target_ot_payment.toLocaleString()}</span>
                                                        : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-5 py-3 text-sm text-right font-bold text-emerald-600 whitespace-nowrap">
                                                    {row.total_ot_payment.toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                                        <tr>
                                            <td className="px-5 py-3 text-sm font-bold text-slate-800">Grand Total</td>
                                            <td className="px-5 py-3 text-sm font-bold text-right text-amber-700">
                                                {(payrollData.otGrandTotal?.time_ot || 0).toLocaleString()}
                                            </td>
                                            <td className="px-5 py-3 text-sm font-bold text-right text-violet-700">
                                                {(payrollData.otGrandTotal?.target_ot || 0).toLocaleString()}
                                            </td>
                                            <td className="px-5 py-3 text-sm font-bold text-right text-emerald-700">
                                                {(payrollData.otGrandTotal?.total || 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── SECTION 5: Performance ──────────────────────────────────── */}
            {activeSection === 'performance' && (
                <div className="space-y-5">
                    <SectionHeader icon={Target} title="Target vs Performance Analysis" subtitle="Achievement rates, gap analysis, and incentive candidates" color="bg-violet-600" />

                    {/* Target vs Actual Chart */}
                    <ChartCard title="Target vs Actual Units (Per Staff)">
                        {loadingPerf ? <LoadingChart height={300} /> : !perfData?.performanceData?.length ? <EmptyChart message="No target-based task data for this period" /> : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={perfData.performanceData} barSize={20}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={55} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar dataKey="target" name="Target" fill={COLORS_BAR.rose} radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="actual" name="Actual" fill={COLORS_BAR.violet} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    {/* Achievement % Bar */}
                    <ChartCard title="Achievement % per Staff">
                        {loadingPerf ? <LoadingChart height={280} /> : !perfData?.performanceData?.length ? <EmptyChart /> : (
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={perfData.performanceData} barSize={24}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={55} />
                                    <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 150]} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="achievement_pct" name="Achievement %" radius={[6, 6, 0, 0]}>
                                        {perfData.performanceData.map((entry: any, i: number) => (
                                            <Cell key={i} fill={entry.achievement_pct >= 100 ? COLORS_BAR.emerald : entry.achievement_pct >= 80 ? COLORS_BAR.amber : COLORS_BAR.rose} />
                                        ))}
                                        <LabelList dataKey="achievement_pct" position="top" style={{ fontSize: 9, fontWeight: 700 }} formatter={(v: unknown) => `${v}%`} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    {/* Performers Tables */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Overperformers */}
                        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-800">Overperformers</h3>
                                    <p className="text-xs text-slate-500">Incentive candidates</p>
                                </div>
                            </div>
                            {loadingPerf ? (
                                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
                            ) : !perfData?.overperformers?.length ? (
                                <p className="text-sm text-slate-400 text-center py-6">No overperformers in this period</p>
                            ) : (
                                <div className="space-y-2">
                                    {perfData.overperformers.map((p: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-emerald-50 border border-emerald-100">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 bg-emerald-200 rounded-full flex items-center justify-center text-xs font-bold text-emerald-800">{i + 1}</div>
                                                <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-emerald-700">+{p.gap_pct}%</p>
                                                <p className="text-[11px] text-slate-500">{p.actual}/{p.target}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Underperformers */}
                        <div className="bg-white rounded-2xl border border-rose-100 shadow-sm p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center">
                                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-800">Underperformers</h3>
                                    <p className="text-xs text-slate-500">Needs attention</p>
                                </div>
                            </div>
                            {loadingPerf ? (
                                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
                            ) : !perfData?.underperformers?.length ? (
                                <p className="text-sm text-slate-400 text-center py-6">No underperformers in this period</p>
                            ) : (
                                <div className="space-y-2">
                                    {perfData.underperformers.map((p: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-rose-50 border border-rose-100">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 bg-rose-200 rounded-full flex items-center justify-center text-xs font-bold text-rose-800">{i + 1}</div>
                                                <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-rose-600">{p.gap_pct}%</p>
                                                <p className="text-[11px] text-slate-500">{p.actual}/{p.target}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── SECTION 6: Site Overview ─────────────────────────────────── */}
            {activeSection === 'sites' && (
                <div className="space-y-5">
                    <SectionHeader icon={MapPin} title="Site-Wise Overview" subtitle="Per-site staff, tasks, OT, payroll and attendance breakdown" color="bg-blue-600" />

                    {/* Site Cards */}
                    {loadingSite ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-52 rounded-xl" />)}
                        </div>
                    ) : !siteData?.sites?.length ? <EmptyChart message="No sites found" /> : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {siteData.sites.map((site: any) => (
                                <div key={site.site_id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                                                <MapPin className="w-4 h-4 text-blue-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-900 leading-none">{site.site_name}</p>
                                                <p className="text-[11px] text-slate-400 mt-0.5">#{site.site_no}</p>
                                            </div>
                                        </div>
                                        <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full">
                                            {site.active_staff} active
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                        <div className="bg-orange-50 rounded-xl p-3">
                                            <p className="text-lg font-black text-slate-900">{site.task_records.toLocaleString()}</p>
                                            <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider mt-0.5">Tasks</p>
                                        </div>
                                        <div className="bg-amber-50 rounded-xl p-3">
                                            <p className="text-lg font-black text-slate-900">{site.total_units.toLocaleString()}</p>
                                            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mt-0.5">Units</p>
                                        </div>
                                        <div className="bg-emerald-50 rounded-xl p-3">
                                            <p className="text-lg font-black text-slate-900">{site.ot_payment.toLocaleString()}</p>
                                            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mt-0.5">Total OT</p>
                                            {(site.time_ot_payment > 0 || site.target_ot_payment > 0) && (
                                                <p className="text-[10px] text-slate-400 mt-0.5">
                                                    T:{(site.time_ot_payment || 0).toLocaleString()} / G:{(site.target_ot_payment || 0).toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                        <div className="bg-cyan-50 rounded-xl p-3">
                                            <p className="text-lg font-black text-slate-900">{site.attendance_count.toLocaleString()}</p>
                                            <p className="text-[10px] font-semibold text-cyan-600 uppercase tracking-wider mt-0.5">Attendance</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-xs mb-2 px-0.5">
                                        <span className="text-slate-400 font-medium">Salary Cost</span>
                                        <span className="font-bold text-violet-700">{site.total_salary.toLocaleString()}</span>
                                    </div>
                                    {site.achievement_pct !== null && (
                                        <div>
                                            <div className="flex items-center justify-between text-xs mb-1 px-0.5">
                                                <span className="text-slate-400 font-medium">Achievement</span>
                                                <span className={`font-bold ${site.achievement_pct >= 100 ? 'text-emerald-600' : site.achievement_pct >= 80 ? 'text-amber-500' : 'text-rose-500'}`}>
                                                    {site.achievement_pct}%
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-1.5">
                                                <div
                                                    className={`h-1.5 rounded-full ${site.achievement_pct >= 100 ? 'bg-emerald-500' : site.achievement_pct >= 80 ? 'bg-amber-400' : 'bg-rose-400'}`}
                                                    style={{ width: `${Math.min(site.achievement_pct, 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Charts Row 1: Staff + Tasks */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <ChartCard title="Staff Distribution by Site">
                            {loadingSite ? <LoadingChart /> : !siteData?.sites?.length ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={siteData.sites} barSize={22}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="site_no" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Bar dataKey="active_staff" name="Active Staff" fill={COLORS_BAR.indigo} radius={[4, 4, 0, 0]}>
                                            <LabelList dataKey="active_staff" position="top" style={{ fontSize: 10, fontWeight: 700 }} />
                                        </Bar>
                                        <Bar dataKey="supervisor_count" name="Supervisors" fill={COLORS_BAR.violet} radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        <ChartCard title="Task Records by Site">
                            {loadingSite ? <LoadingChart /> : !siteData?.sites?.some((s: any) => s.task_records > 0) ? <EmptyChart message="No tasks in this period" /> : (
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={siteData.sites} barSize={28}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="site_no" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="task_records" name="Tasks" fill={COLORS_BAR.amber} radius={[6, 6, 0, 0]}>
                                            <LabelList dataKey="task_records" position="top" style={{ fontSize: 10, fontWeight: 700 }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>
                    </div>

                    {/* Charts Row 2: OT Pay + Attendance */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <ChartCard title="OT Payment by Site (Saved Records)">
                            {loadingSite ? <LoadingChart /> : !siteData?.sites?.some((s: any) => s.ot_payment > 0) ? <EmptyChart message="No saved OT payment in this period" /> : (
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={siteData.sites} barSize={20}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="site_no" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Bar dataKey="time_ot_payment" name="Time OT" fill={COLORS_BAR.cyan} radius={[4, 4, 0, 0]}>
                                            <LabelList dataKey="time_ot_payment" position="top" style={{ fontSize: 9, fontWeight: 700 }}
                                                formatter={(v: unknown) => Number(v) > 0 ? Number(v).toLocaleString() : ''} />
                                        </Bar>
                                        <Bar dataKey="target_ot_payment" name="Target OT" fill={COLORS_BAR.violet} radius={[4, 4, 0, 0]}>
                                            <LabelList dataKey="target_ot_payment" position="top" style={{ fontSize: 9, fontWeight: 700 }}
                                                formatter={(v: unknown) => Number(v) > 0 ? Number(v).toLocaleString() : ''} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        <ChartCard title="Attendance Records by Site">
                            {loadingSite ? <LoadingChart /> : !siteData?.sites?.some((s: any) => s.attendance_count > 0) ? <EmptyChart message="No attendance in this period" /> : (
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={siteData.sites} barSize={28}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="site_no" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="attendance_count" name="Attendance" fill={COLORS_BAR.cyan} radius={[6, 6, 0, 0]}>
                                            <LabelList dataKey="attendance_count" position="top" style={{ fontSize: 10, fontWeight: 700 }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>
                    </div>

                    {/* Detailed Summary Table */}
                    {!loadingSite && siteData?.sites?.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100">
                                <h3 className="text-sm font-bold text-slate-700">Site Metrics Summary Table</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Staff</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Tasks</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Units</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Attendance</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-cyan-500 uppercase tracking-wider">Time OT</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-violet-500 uppercase tracking-wider">Target OT</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-emerald-600 uppercase tracking-wider">Total OT</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Salary Cost</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Achievement</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {siteData.sites.map((site: any) => (
                                            <tr key={site.site_id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <p className="text-sm font-bold text-slate-900">{site.site_name}</p>
                                                    <p className="text-[11px] text-slate-400">#{site.site_no}</p>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className="text-sm font-semibold text-slate-700">{site.active_staff}</span>
                                                    <span className="text-[11px] text-slate-400 ml-1">/ {site.total_staff}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-orange-600">{site.task_records.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-amber-600">{site.total_units.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-cyan-600">{site.attendance_count.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-cyan-600">{(site.time_ot_payment || 0).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-violet-600">{(site.target_ot_payment || 0).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right text-sm font-bold text-emerald-600">{site.ot_payment.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-violet-600">{site.total_salary.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right">
                                                    {site.achievement_pct !== null ? (
                                                        <span className={`text-sm font-bold ${site.achievement_pct >= 100 ? 'text-emerald-600' : site.achievement_pct >= 80 ? 'text-amber-500' : 'text-rose-500'}`}>
                                                            {site.achievement_pct}%
                                                        </span>
                                                    ) : <span className="text-slate-300 text-sm">—</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 border-slate-200">
                                            <td className="px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Total</td>
                                            <td className="px-4 py-3 text-right text-sm font-black text-slate-900">
                                                {siteData.sites.reduce((s: number, r: any) => s + r.active_staff, 0)}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-black text-orange-700">
                                                {siteData.sites.reduce((s: number, r: any) => s + r.task_records, 0).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-black text-amber-700">
                                                {siteData.sites.reduce((s: number, r: any) => s + r.total_units, 0).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-black text-cyan-700">
                                                {siteData.sites.reduce((s: number, r: any) => s + r.attendance_count, 0).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-black text-cyan-700">
                                                {siteData.sites.reduce((s: number, r: any) => s + (r.time_ot_payment || 0), 0).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-black text-violet-700">
                                                {siteData.sites.reduce((s: number, r: any) => s + (r.target_ot_payment || 0), 0).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-black text-emerald-700">
                                                {siteData.sites.reduce((s: number, r: any) => s + r.ot_payment, 0).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-black text-violet-700">
                                                {siteData.sites.reduce((s: number, r: any) => s + r.total_salary, 0).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3"></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── SECTION 7: Site Count Trend ──────────────────────────────── */}
            {activeSection === 'site-count' && (() => {
                const LINE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#06b6d4', '#f43f5e', '#84cc16', '#f97316'];
                const sites: string[] = siteCountTrend?.sites || [];
                const trend: any[] = siteCountTrend?.trend || [];

                return (
                    <div className="space-y-5">
                        <SectionHeader icon={TrendingUp} title="Site-Wise Daily Count Trend" subtitle="Daily task count per site over the selected date range" color="bg-rose-500" />

                        {/* Summary KPI row */}
                        {!loadingSiteCount && trend.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <MetricCard label="Sites Tracked" value={sites.length} icon={MapPin} iconBg="bg-blue-50" iconColor="text-blue-600" />
                                <MetricCard label="Days in Range" value={trend.length} icon={Calendar} iconBg="bg-indigo-50" iconColor="text-indigo-600" />
                                <MetricCard
                                    label="Total Count"
                                    value={trend.reduce((s, row) => s + sites.reduce((ss, site) => ss + (Number(row[site]) || 0), 0), 0).toLocaleString()}
                                    icon={Activity}
                                    iconBg="bg-orange-50"
                                    iconColor="text-orange-600"
                                />
                                <MetricCard
                                    label="Avg / Day"
                                    value={trend.length > 0
                                        ? Math.round(trend.reduce((s, row) => s + sites.reduce((ss, site) => ss + (Number(row[site]) || 0), 0), 0) / trend.length).toLocaleString()
                                        : 0}
                                    icon={TrendingUp}
                                    iconBg="bg-rose-50"
                                    iconColor="text-rose-500"
                                />
                            </div>
                        )}

                        {/* Line Chart */}
                        <ChartCard title="Daily Count by Site" className="col-span-2">
                            {loadingSiteCount ? (
                                <LoadingChart height={320} />
                            ) : trend.length === 0 ? (
                                <EmptyChart message="No task count data for this period" />
                            ) : (
                                <ResponsiveContainer width="100%" height={320}>
                                    <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        {sites.map((siteNo, i) => (
                                            <Line
                                                key={siteNo}
                                                type="monotone"
                                                dataKey={siteNo}
                                                name={siteNo}
                                                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                                strokeWidth={2}
                                                dot={trend.length <= 31 ? { r: 3 } : false}
                                                activeDot={{ r: 5 }}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        {/* Per-site totals table */}
                        {!loadingSiteCount && trend.length > 0 && sites.length > 0 && (
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100">
                                    <h3 className="text-sm font-bold text-slate-700">Site Count Summary</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100">
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>
                                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Count</th>
                                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg / Day</th>
                                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Peak Day</th>
                                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Peak Count</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {sites.map((siteNo, i) => {
                                                const totals = trend.map(row => Number(row[siteNo]) || 0);
                                                const total = totals.reduce((s, v) => s + v, 0);
                                                const avg = trend.length > 0 ? (total / trend.length).toFixed(1) : '0';
                                                const peakIdx = totals.indexOf(Math.max(...totals));
                                                const peakDay = trend[peakIdx]?.date || '-';
                                                const peakCount = totals[peakIdx] || 0;
                                                return (
                                                    <tr key={siteNo} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }} />
                                                                <span className="text-sm font-bold text-slate-900">{siteNo}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-sm font-bold text-orange-600">{total.toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">{avg}</td>
                                                        <td className="px-4 py-3 text-right text-sm text-slate-500 font-mono">{peakDay}</td>
                                                        <td className="px-4 py-3 text-right text-sm font-bold text-rose-600">{peakCount.toLocaleString()}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-slate-50 border-t-2 border-slate-200">
                                                <td className="px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Grand Total</td>
                                                <td className="px-4 py-3 text-right text-sm font-black text-orange-700">
                                                    {trend.reduce((s, row) => s + sites.reduce((ss, site) => ss + (Number(row[site]) || 0), 0), 0).toLocaleString()}
                                                </td>
                                                <td colSpan={3} />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}


            {/* ── SECTION 7: Profitability ─────────────────────────────────── */}
            {activeSection === 'profitability' && (() => {
                const fmtRs = (n: number) => `Rs. ${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                const OT_LABEL: Record<string, string> = { time_based: 'Time Based', target_based: 'Target Based', staff_outsource: 'Staff Outsource' };

                const groupData: any[] =
                    profitTab === 'service'   ? (profitData?.byServiceType || []) :
                    profitTab === 'site_type' ? (profitData?.bySiteType    || []) :
                    profitTab === 'ot_type'   ? (profitData?.byOtType      || []).map((g: any) => ({ ...g, label: OT_LABEL[g.label] || g.label })) :
                    (profitData?.sites || []).map((s: any) => ({
                        label: s.site_no,
                        site_name: s.site_name,
                        total_revenue: s.total_revenue,
                        total_cost: s.total_cost,
                        net_profit: s.net_profit,
                        profit_margin: s.profit_margin,
                        invoice_count: s.invoice_count,
                    }));

                const totals = profitData?.totals || {};
                const ProfitTooltip = ({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
                            <p className="font-bold text-slate-800 mb-1.5">{label}</p>
                            {payload.map((e: any, i: number) => (
                                <p key={i} style={{ color: e.color }} className="font-semibold">
                                    {e.name}: {fmtRs(e.value)}
                                </p>
                            ))}
                        </div>
                    );
                };

                return (
                    <div className="space-y-5">
                        <SectionHeader icon={BarChart3} title="Business Profitability Analysis" subtitle="Revenue vs cost comparison across service type, site type & OT calculation mode" color="bg-teal-600" />

                        {loadingProfit ? (
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
                            </div>
                        ) : profitData ? (
                            <>
                                {/* ── KPI Summary ── */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                    <div className="bg-blue-50 rounded-xl p-4">
                                        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Total Revenue</p>
                                        <p className="text-xl font-black text-blue-900">{fmtRs(totals.total_revenue || 0)}</p>
                                        <p className="text-[10px] text-blue-500 mt-0.5">{totals.total_sites} sites total</p>
                                    </div>
                                    <div className="bg-rose-50 rounded-xl p-4">
                                        <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide mb-1">Total Cost</p>
                                        <p className="text-xl font-black text-rose-900">{fmtRs(totals.total_cost || 0)}</p>
                                        <p className="text-[10px] text-rose-500 mt-0.5">Salary + OT + Expenses + Variants</p>
                                    </div>
                                    <div className={`${(totals.net_profit || 0) >= 0 ? 'bg-emerald-50' : 'bg-red-50'} rounded-xl p-4`}>
                                        <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${(totals.net_profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Net Profit / Loss</p>
                                        <p className={`text-xl font-black ${(totals.net_profit || 0) >= 0 ? 'text-emerald-900' : 'text-red-900'}`}>
                                            {(totals.net_profit || 0) < 0 ? '−' : '+'}{fmtRs(totals.net_profit || 0)}
                                        </p>
                                        <p className={`text-[10px] mt-0.5 ${(totals.net_profit || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {totals.total_revenue > 0 ? `${Math.round((totals.net_profit / totals.total_revenue) * 100)}% margin` : '—'}
                                        </p>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-4">
                                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Site Status</p>
                                        <p className="text-xl font-black text-slate-900">
                                            <span className="text-emerald-600">{totals.profitable_count}</span>
                                            <span className="text-slate-400 text-base font-medium"> / </span>
                                            <span className="text-red-500">{totals.loss_count}</span>
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">Profitable / Loss-making</p>
                                    </div>
                                </div>

                                {/* ── Group-by tabs ── */}
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {([
                                        { id: 'service',   label: 'By Service Type' },
                                        { id: 'site_type', label: 'By Site Type' },
                                        { id: 'ot_type',   label: 'By OT Type' },
                                        { id: 'all',       label: 'All Sites' },
                                    ] as { id: typeof profitTab; label: string }[]).map(t => (
                                        <button key={t.id} onClick={() => setProfitTab(t.id)}
                                            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${profitTab === t.id ? 'bg-teal-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600'}`}>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>

                                {/* ── Bar Chart ── */}
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                    <h3 className="text-sm font-bold text-slate-700 mb-4">
                                        Revenue vs Cost vs Profit — {profitTab === 'service' ? 'By Service Type' : profitTab === 'site_type' ? 'By Site Type' : profitTab === 'ot_type' ? 'By OT Type' : 'All Sites'}
                                    </h3>
                                    {groupData.length === 0 ? <EmptyChart message="No invoice data yet. Generate invoices first." /> : (
                                        <ResponsiveContainer width="100%" height={320}>
                                            <BarChart data={groupData} margin={{ top: 8, right: 20, left: 10, bottom: profitTab === 'all' ? 50 : 24 }} barSize={profitTab === 'all' ? 12 : 24}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis dataKey="label" tick={{ fontSize: profitTab === 'all' ? 9 : 11 }}
                                                    angle={profitTab === 'all' ? -35 : 0}
                                                    textAnchor={profitTab === 'all' ? 'end' : 'middle'}
                                                    interval={0} />
                                                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                                                <Tooltip content={<ProfitTooltip />} />
                                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                                <Bar dataKey="total_revenue" name="Revenue"  fill={COLORS_BAR.blue}    radius={[3,3,0,0]} />
                                                <Bar dataKey="total_cost"    name="Cost"     fill={COLORS_BAR.rose}    radius={[3,3,0,0]} />
                                                <Bar dataKey="net_profit"    name="Profit/Loss" radius={[3,3,0,0]}>
                                                    {groupData.map((entry: any, i: number) => (
                                                        <rect key={i} fill={entry.net_profit >= 0 ? COLORS_BAR.emerald : '#ef4444'} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>

                                {/* ── Data Table ── */}
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-slate-700">Detailed Breakdown</h3>
                                        <span className="text-xs text-slate-400">{groupData.length} {profitTab === 'all' ? 'sites' : 'groups'}</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-100">
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                                        {profitTab === 'all' ? 'Site' : 'Group'}
                                                    </th>
                                                    {profitTab === 'all' && <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Service / Site Type</th>}
                                                    {profitTab !== 'all' && <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Sites</th>}
                                                    <th className="px-4 py-3 text-right text-xs font-semibold text-blue-600 uppercase tracking-wider">Revenue</th>
                                                    <th className="px-4 py-3 text-right text-xs font-semibold text-rose-600 uppercase tracking-wider">Cost</th>
                                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Profit / Loss</th>
                                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Margin</th>
                                                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {groupData.map((row: any, i: number) => {
                                                    const isProfitable = row.net_profit >= 0;
                                                    const margin = row.profit_margin ?? (row.total_revenue > 0 ? Math.round((row.net_profit / row.total_revenue) * 100) : 0);
                                                    return (
                                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-4 py-3">
                                                                <p className="text-sm font-bold text-slate-900">{row.label}</p>
                                                                {profitTab === 'all' && row.site_name && (
                                                                    <p className="text-xs text-slate-400">{row.site_name}</p>
                                                                )}
                                                            </td>
                                                            {profitTab === 'all' && (
                                                                <td className="px-4 py-3 text-xs text-slate-500">
                                                                    {(profitData?.sites || []).find((s: any) => s.site_no === row.label)?.service_type || '—'}
                                                                    {' / '}
                                                                    {(profitData?.sites || []).find((s: any) => s.site_no === row.label)?.site_type || '—'}
                                                                </td>
                                                            )}
                                                            {profitTab !== 'all' && (
                                                                <td className="px-4 py-3 text-right text-sm text-slate-600 font-semibold">{row.site_count}</td>
                                                            )}
                                                            <td className="px-4 py-3 text-right text-sm font-semibold text-blue-700">{fmtRs(row.total_revenue)}</td>
                                                            <td className="px-4 py-3 text-right text-sm font-semibold text-rose-700">{fmtRs(row.total_cost)}</td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className={`text-sm font-bold ${isProfitable ? 'text-emerald-700' : 'text-red-600'}`}>
                                                                    {isProfitable ? '+' : '−'}{fmtRs(row.net_profit)}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <div className="w-16 bg-slate-100 rounded-full h-1.5">
                                                                        <div className={`h-1.5 rounded-full ${isProfitable ? 'bg-emerald-500' : 'bg-red-400'}`}
                                                                            style={{ width: `${Math.min(Math.abs(margin), 100)}%` }} />
                                                                    </div>
                                                                    <span className={`text-sm font-bold min-w-[40px] text-right ${isProfitable ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                        {margin}%
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${isProfitable ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                                    {isProfitable ? '▲ Profit' : '▼ Loss'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-slate-50 border-t-2 border-slate-200">
                                                    <td colSpan={profitTab === 'all' ? 2 : 2} className="px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Total</td>
                                                    <td className="px-4 py-3 text-right text-sm font-black text-blue-700">{fmtRs(totals.total_revenue || 0)}</td>
                                                    <td className="px-4 py-3 text-right text-sm font-black text-rose-700">{fmtRs(totals.total_cost || 0)}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`text-sm font-black ${(totals.net_profit || 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                            {(totals.net_profit || 0) >= 0 ? '+' : '−'}{fmtRs(totals.net_profit || 0)}
                                                        </span>
                                                    </td>
                                                    <td colSpan={2} />
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </div>
                );
            })()}

            {/* ── SECTION 8: Invoice Business Model Analysis ──────────────── */}
            {activeSection === 'invoice-analysis' && (() => {
                const fmtRs   = (n: number) => `Rs. ${Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                const ia      = invAnalysis;
                const sm      = ia?.summary || {};
                const trend   = invTrendMode === 'monthly' ? (ia?.monthlyTrend || []) : (ia?.quarterlyTrend || []);
                const xKey    = invTrendMode === 'monthly' ? 'month' : 'quarter';

                const detailRows: any[] =
                    invDetailTab === 'top_revenue' ? (ia?.topByRevenue || []) :
                    invDetailTab === 'top_profit'  ? (ia?.topByProfit  || []) :
                    invDetailTab === 'loss'        ? (ia?.lossSites    || []) :
                    (ia?.sites || []);

                const OT_LABEL: Record<string, string> = { time_based: 'Time', target_based: 'Target', staff_outsource: 'Outsource' };

                return (
                    <div className="space-y-5">
                        <SectionHeader icon={DollarSign} title="Invoice Business Model Analysis"
                            subtitle="Comprehensive revenue, cost, and profitability insights from all saved invoices"
                            color="bg-green-700" />

                        {loadingInvAnalysis ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>
                                <div className="skeleton h-72 rounded-2xl" />
                            </div>
                        ) : ia ? (
                            <>
                                {/* ── KPI Cards ── */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                    {[
                                        { label: 'Total Revenue',      val: fmtRs(sm.total_revenue || 0),          sub: `${sm.total_invoices || 0} invoices`,        bg: 'bg-blue-50',    tc: 'text-blue-900',    sc: 'text-blue-500' },
                                        { label: 'Total Cost',         val: fmtRs(sm.total_cost || 0),             sub: 'Salary+OT+Variants+Exp',                    bg: 'bg-rose-50',    tc: 'text-rose-900',    sc: 'text-rose-500' },
                                        { label: 'Net Profit / Loss',  val: `${(sm.net_profit||0) >= 0 ? '+' : '−'}${fmtRs(sm.net_profit||0)}`, sub: `${sm.profit_margin || 0}% margin`, bg: (sm.net_profit||0) >= 0 ? 'bg-emerald-50' : 'bg-red-50', tc: (sm.net_profit||0) >= 0 ? 'text-emerald-900' : 'text-red-900', sc: (sm.net_profit||0) >= 0 ? 'text-emerald-500' : 'text-red-500' },
                                        { label: 'Avg Invoice Value',  val: fmtRs(sm.avg_invoice_value || 0),      sub: `${sm.site_count || 0} billing sites`,       bg: 'bg-violet-50',  tc: 'text-violet-900',  sc: 'text-violet-500' },
                                        { label: 'Site Status',        val: `${sm.profitable_sites || 0} / ${sm.loss_sites || 0}`, sub: 'Profit / Loss sites', bg: 'bg-slate-50', tc: 'text-slate-900', sc: 'text-slate-500' },
                                    ].map((c, i) => (
                                        <div key={i} className={`${c.bg} rounded-xl p-4`}>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{c.label}</p>
                                            <p className={`text-base font-black ${c.tc} leading-tight`}>{c.val}</p>
                                            <p className={`text-[10px] ${c.sc} mt-1`}>{c.sub}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* ── Revenue / Cost / Profit Trend ── */}
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                        <h3 className="text-sm font-bold text-slate-700">Revenue · Cost · Profit Trend</h3>
                                        <div className="flex gap-1.5">
                                            {(['monthly', 'quarterly'] as const).map(m => (
                                                <button key={m} onClick={() => setInvTrendMode(m)}
                                                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${invTrendMode === m ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                                    {m === 'monthly' ? 'Monthly' : 'Quarterly'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {trend.length === 0 ? <EmptyChart message="No invoice data available yet" /> : (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <BarChart data={trend} margin={{ top: 8, right: 20, left: 10, bottom: 24 }} barSize={trend.length > 12 ? 10 : 18}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis dataKey={xKey} tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                                                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                                                <Tooltip content={({ active, payload, label }: any) => {
                                                    if (!active || !payload?.length) return null;
                                                    return (
                                                        <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
                                                            <p className="font-bold text-slate-700 mb-1">{label}</p>
                                                            {payload.map((e: any, i: number) => <p key={i} style={{ color: e.fill || e.color }} className="font-semibold">{e.name}: {fmtRs(e.value)}</p>)}
                                                        </div>
                                                    );
                                                }} />
                                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                                <Bar dataKey="total_revenue" name="Revenue"      fill="#3b82f6" radius={[3,3,0,0]} />
                                                <Bar dataKey="total_cost"    name="Total Cost"   fill="#f43f5e" radius={[3,3,0,0]} />
                                                <Bar dataKey="net_profit"    name="Net Profit"   radius={[3,3,0,0]}>
                                                    {trend.map((entry: any, i: number) => (
                                                        <rect key={i} fill={entry.net_profit >= 0 ? '#10b981' : '#ef4444'} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>

                                {/* ── Cost Structure + Monthly Cost Breakdown ── */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                    {/* Cost Structure Pie */}
                                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                        <h3 className="text-sm font-bold text-slate-700 mb-4">Revenue Allocation (Cost Structure)</h3>
                                        {(ia?.costStructure || []).every((c: any) => c.value === 0)
                                            ? <EmptyChart message="No invoice data available" />
                                            : (
                                                <>
                                                    <ResponsiveContainer width="100%" height={220}>
                                                        <PieChart>
                                                            <Pie data={ia.costStructure} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
                                                                {(ia.costStructure || []).map((entry: any, i: number) => (
                                                                    <Cell key={i} fill={entry.fill} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip formatter={(val: unknown, name: string | undefined) => [fmtRs(Number(val)), name ?? '']} />
                                                            <Legend wrapperStyle={{ fontSize: 11 }} />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                                        {(ia.costStructure || []).map((c: any, i: number) => (
                                                            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
                                                                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: c.fill }} />
                                                                <div className="min-w-0">
                                                                    <p className="text-[10px] text-slate-500 truncate">{c.name}</p>
                                                                    <p className="text-xs font-bold text-slate-800">{c.pct}% · {fmtRs(c.value)}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                    </div>

                                    {/* Cost Composition Stack per month */}
                                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                        <h3 className="text-sm font-bold text-slate-700 mb-4">Cost Composition by Month</h3>
                                        {(ia?.monthlyTrend || []).length === 0 ? <EmptyChart /> : (
                                            <ResponsiveContainer width="100%" height={280}>
                                                <BarChart data={ia.monthlyTrend} margin={{ top: 4, right: 12, left: 4, bottom: 24 }} barSize={14}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                    <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval={0} />
                                                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                                                    <Tooltip formatter={(val: unknown, name: string | undefined) => [fmtRs(Number(val)), name ?? '']} />
                                                    <Legend wrapperStyle={{ fontSize: 10 }} />
                                                    <Bar dataKey="cost_variant" name="Cost Variants" stackId="a" fill="#f59e0b" />
                                                    <Bar dataKey="salary_ot"    name="Salary + OT"   stackId="a" fill="#8b5cf6" />
                                                    <Bar dataKey="expense"      name="Expense"       stackId="a" fill="#64748b" radius={[3,3,0,0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>

                                {/* ── Site Detail Tabs ── */}
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                    <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
                                        <h3 className="text-sm font-bold text-slate-700 mr-2">Site Invoice Breakdown</h3>
                                        {([
                                            { id: 'top_revenue', label: 'Top Revenue' },
                                            { id: 'top_profit',  label: 'Top Profit' },
                                            { id: 'loss',        label: `Loss Sites (${(ia?.lossSites || []).length})` },
                                            { id: 'all',         label: 'All Sites' },
                                        ] as { id: typeof invDetailTab; label: string }[]).map(t => (
                                            <button key={t.id} onClick={() => setInvDetailTab(t.id)}
                                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${invDetailTab === t.id ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                                {t.label}
                                            </button>
                                        ))}
                                        <span className="ml-auto text-xs text-slate-400">{detailRows.length} sites</span>
                                    </div>
                                    {detailRows.length === 0 ? (
                                        <div className="py-10 text-center text-slate-400 text-sm">
                                            {invDetailTab === 'loss' ? 'No loss-making sites — all sites are profitable!' : 'No invoice data yet.'}
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-100">
                                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">#</th>
                                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>
                                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Type</th>
                                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Invoices</th>
                                                        <th className="px-4 py-3 text-right text-xs font-semibold text-blue-600 uppercase tracking-wider">Revenue</th>
                                                        <th className="px-4 py-3 text-right text-xs font-semibold text-amber-600 uppercase tracking-wider hidden md:table-cell">Variants</th>
                                                        <th className="px-4 py-3 text-right text-xs font-semibold text-violet-600 uppercase tracking-wider hidden md:table-cell">Salary+OT</th>
                                                        <th className="px-4 py-3 text-right text-xs font-semibold text-rose-600 uppercase tracking-wider">Cost</th>
                                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Profit/Loss</th>
                                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Margin</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {detailRows.map((row: any, i: number) => {
                                                        const ok = row.net_profit >= 0;
                                                        return (
                                                            <tr key={i} className={`hover:bg-slate-50 transition-colors ${!ok ? 'bg-red-50/30' : ''}`}>
                                                                <td className="px-4 py-3 text-xs text-slate-400 font-bold">{i + 1}</td>
                                                                <td className="px-4 py-3">
                                                                    <p className="text-sm font-bold text-slate-900">{row.site_no}</p>
                                                                    <p className="text-[10px] text-slate-400">{row.site_name}</p>
                                                                </td>
                                                                <td className="px-4 py-3 hidden lg:table-cell">
                                                                    <p className="text-[10px] text-slate-500">{row.service_type}</p>
                                                                    <span className={`inline-flex text-[9px] font-bold px-1.5 py-0.5 rounded-full ${row.ot_type === 'time_based' ? 'bg-emerald-100 text-emerald-700' : row.ot_type === 'target_based' ? 'bg-violet-100 text-violet-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                        {OT_LABEL[row.ot_type] || row.ot_type}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 text-right text-sm font-semibold text-slate-600">{row.invoice_count}</td>
                                                                <td className="px-4 py-3 text-right text-sm font-bold text-blue-700">{fmtRs(row.total_revenue)}</td>
                                                                <td className="px-4 py-3 text-right text-sm text-amber-700 hidden md:table-cell">{fmtRs(row.cost_variant)}</td>
                                                                <td className="px-4 py-3 text-right text-sm text-violet-700 hidden md:table-cell">{fmtRs(row.salary_ot)}</td>
                                                                <td className="px-4 py-3 text-right text-sm font-semibold text-rose-700">{fmtRs(row.total_cost)}</td>
                                                                <td className="px-4 py-3 text-right">
                                                                    <span className={`text-sm font-bold ${ok ? 'text-emerald-700' : 'text-red-600'}`}>
                                                                        {ok ? '+' : '−'}{fmtRs(row.net_profit)}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 text-right">
                                                                    <div className="flex items-center justify-end gap-1.5">
                                                                        <div className="w-12 bg-slate-100 rounded-full h-1.5">
                                                                            <div className={`h-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-400'}`}
                                                                                style={{ width: `${Math.min(Math.abs(row.profit_margin), 100)}%` }} />
                                                                        </div>
                                                                        <span className={`text-xs font-bold min-w-[36px] text-right ${ok ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                            {row.profit_margin}%
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                                                        <td colSpan={4} className="px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Grand Total</td>
                                                        <td className="px-4 py-3 text-right text-sm font-black text-blue-700">{fmtRs(sm.total_revenue || 0)}</td>
                                                        <td className="px-4 py-3 text-right text-sm font-black text-amber-700 hidden md:table-cell">{fmtRs(sm.total_cost_variant || 0)}</td>
                                                        <td className="px-4 py-3 text-right text-sm font-black text-violet-700 hidden md:table-cell">{fmtRs(sm.total_salary_ot || 0)}</td>
                                                        <td className="px-4 py-3 text-right text-sm font-black text-rose-700">{fmtRs(sm.total_cost || 0)}</td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className={`text-sm font-black ${(sm.net_profit||0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                                {(sm.net_profit||0) >= 0 ? '+' : '−'}{fmtRs(sm.net_profit || 0)}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className={`text-sm font-black ${(sm.profit_margin||0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                {sm.profit_margin || 0}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : null}
                    </div>
                );
            })()}

        </div>
    );
};

export default Analytics;
