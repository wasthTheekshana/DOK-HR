import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import type { Site, User, MilestoneStage, KpiLeaderboardEntry } from '../types';
import {
    Users, MapPin, ClipboardList, DollarSign, ArrowRight, Plus, UserPlus,
    CheckCircle, XCircle, AlertTriangle, TrendingUp, BarChart3,
    ShieldAlert, RefreshCw, Activity, GitBranch, Award, Trophy, Medal, Layers
} from 'lucide-react';
import { format, startOfMonth, subMonths } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, Cell
} from 'recharts';

// Mirrors the stage column palette on the Project Planning Kanban board, so a
// project's color reads the same on both pages. Cycled by stage position; the
// done stage always gets emerald regardless of its position.
const PM_STAGE_COLORS = ['#4f46e5', '#0ea5e9', '#8b5cf6', '#f59e0b', '#f43f5e', '#14b8a6'];
const PM_DONE_COLOR = '#10b981';

// ─── Shared small components ─────────────────────────────────────────────────

const fmtRs = (n: number) =>
    `Rs. ${Math.abs(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const fmtK = (n: number) => {
    const abs = Math.abs(Number(n) || 0);
    if (abs >= 1_000_000) return `Rs.${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `Rs.${(abs / 1_000).toFixed(0)}K`;
    return fmtRs(n);
};

const StatCard: React.FC<{
    label: string; value: number | string; icon: React.ElementType;
    color: string; bg: string; onClick?: () => void; sub?: string;
}> = ({ label, value, icon: Icon, color, bg, onClick, sub }) => (
    <div onClick={onClick}
        className={`stat-card group relative ${onClick ? 'clickable' : ''}`}>
        <div className="flex items-start justify-between">
            <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center`}>
                <Icon className={`w-4.5 h-4.5 ${color}`} style={{ width: 18, height: 18 }} />
            </div>
            {onClick && <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400 transition-colors" style={{ width: 14, height: 14 }} />}
        </div>
        <div className="mt-4">
            <p className="text-[22px] font-black text-slate-900 leading-tight">{value}</p>
            <p className="text-[12.5px] text-slate-500 font-medium mt-0.5">{label}</p>
            {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
    </div>
);

const getRoleBadge = (role: string) => {
    switch (role) {
        case 'admin':      return 'bg-orange-50 text-orange-600 border border-orange-100';
        case 'supervisor': return 'bg-violet-50 text-violet-600 border border-violet-100';
        default:           return 'bg-blue-50 text-blue-600 border border-blue-100';
    }
};

const OT_LABEL: Record<string, string> = {
    time_based:      'Time Based',
    target_based:    'Target Based',
    staff_outsource: 'Staff Outsource',
};


// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const { role, user: authUser } = useAuth();

    const [loading, setLoading]   = useState(true);
    const [stats, setStats]       = useState({ totalSites: 0, totalStaff: 0, totalSupervisors: 0, totalTasks: 0 });
    const [usersList, setUsersList] = useState<User[]>([]);
    const [sitesList, setSitesList] = useState<Site[]>([]);

    // System admin financial overview
    const [bizData, setBizData]     = useState<any>(null);
    const [bizLoading, setBizLoading] = useState(false);

    // Project manager portfolio overview
    const [pmPortfolio, setPmPortfolio] = useState<any[]>([]);
    const [pmLoading, setPmLoading]     = useState(false);
    const [pmStages, setPmStages]       = useState<MilestoneStage[]>([]);
    const [pmLeaderboard, setPmLeaderboard] = useState<KpiLeaderboardEntry[]>([]);

    // CEO live dashboard
    const [slideIndex, setSlideIndex]         = useState(0);
    const [isPaused,   setIsPaused]           = useState(false);
    const [currentTime, setCurrentTime]       = useState('');
    const [timeRange, setTimeRange]           = useState<'month' | '3m' | '6m' | 'ytd' | 'custom'>('month');
    const [customFrom, setCustomFrom]         = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [customTo,   setCustomTo]           = useState(format(new Date(), 'yyyy-MM-dd'));
    const [siteDetails, setSiteDetails]       = useState<Record<string, any>>({});
    const [siteDetailLoading, setSiteDetailLoading] = useState(false);
    const [currentSiteId, setCurrentSiteId]   = useState<number | null>(null);

    useEffect(() => {
        const loadStats = async () => {
            try {
                const taskParams = {
                    date_from: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'),
                    date_to:   format(new Date(), 'yyyy-MM-dd'),
                };
                if (role === 'staff') {
                    const tasksRes = await api.get('/tasks', { params: taskParams });
                    setStats({ totalSites: 0, totalStaff: 0, totalSupervisors: 0, totalTasks: tasksRes.data.length });
                } else {
                    const [sitesRes, usersRes, tasksRes] = await Promise.all([
                        api.get('/sites'),
                        api.get('/users'),
                        api.get('/tasks', { params: taskParams }),
                    ]);
                    const sites: Site[] = sitesRes.data;
                    const users: User[] = usersRes.data;
                    setUsersList(users);
                    setSitesList(sites);
                    setStats({
                        totalSites:        sites.length,
                        totalStaff:        users.filter(u => u.ROLE === 'staff').length,
                        totalSupervisors:  users.filter(u => u.ROLE === 'supervisor').length,
                        totalTasks:        tasksRes.data.length,
                    });
                }
            } catch (e) {
                console.error('Failed to load dashboard stats', e);
            } finally {
                setLoading(false);
            }
        };
        loadStats();
    }, [role]);

    const ceoDateRange = useCallback(() => {
        return { from: customFrom, to: customTo };
    }, [customFrom, customTo]);

    useEffect(() => {
        if (role !== 'system_admin') return;
        setSiteDetails({});
        setBizLoading(true);
        const { from, to } = ceoDateRange();
        api.get('/analytics/sites', { params: { date_from: from, date_to: to } })
            .then(r => setBizData(r.data))
            .catch(e => console.error('biz data error', e))
            .finally(() => setBizLoading(false));
    }, [role, ceoDateRange]);

    useEffect(() => {
        if (role !== 'project_manager') return;
        setPmLoading(true);
        Promise.all([
            api.get('/project-planning/sites'),
            api.get('/milestone-stages'),
            api.get('/kpi/leaderboard'),
        ])
            .then(([portfolioRes, stagesRes, leaderboardRes]) => {
                setPmPortfolio(portfolioRes.data);
                setPmStages(stagesRes.data);
                setPmLeaderboard(leaderboardRes.data);
            })
            .catch(e => console.error('pm dashboard error', e))
            .finally(() => setPmLoading(false));
    }, [role]);

    // Live clock
    useEffect(() => {
        const tick = () => setCurrentTime(format(new Date(), 'HH:mm:ss'));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    // Auto-advance CEO slideshow
    useEffect(() => {
        if (role !== 'system_admin' || isPaused) return;
        const slides = (bizData?.sites || []).filter((s: any) => s.task_records > 0 || s.total_units > 0);
        if (slides.length < 2) return;
        const id = setInterval(() => setSlideIndex(i => (i + 1) % slides.length), 8000);
        return () => clearInterval(id);
    }, [role, isPaused, bizData]);

    // Auto-refresh site data every 5 minutes
    useEffect(() => {
        if (role !== 'system_admin') return;
        const refresh = () => {
            const { from, to } = ceoDateRange();
            api.get('/analytics/sites', { params: { date_from: from, date_to: to } })
                .then(r => setBizData(r.data))
                .catch(e => console.error('auto-refresh error', e));
        };
        const id = setInterval(refresh, 5 * 60 * 1000);
        return () => clearInterval(id);
    }, [role, ceoDateRange]);

    // Track current site_id from slide index
    useEffect(() => {
        if (role !== 'system_admin') return;
        const slides = (bizData?.sites || []).filter((s: any) => s.task_records > 0 || s.total_units > 0);
        const site = slides.length > 0 ? slides[slideIndex % slides.length] : null;
        setCurrentSiteId(site?.site_id ?? null);
    }, [role, bizData, slideIndex]);

    // Fetch per-site detail (daily trend + staff breakdown) on slide change
    useEffect(() => {
        if (role !== 'system_admin' || !currentSiteId) return;
        const key = `${currentSiteId}-${timeRange}`;
        if (siteDetails[key]) return;
        setSiteDetailLoading(true);
        const { from, to } = ceoDateRange();
        api.get('/analytics/site-performance', { params: { site_id: currentSiteId, date_from: from, date_to: to } })
            .then(r => setSiteDetails(prev => ({ ...prev, [key]: r.data })))
            .catch(e => console.error('site detail error', e))
            .finally(() => setSiteDetailLoading(false));
    }, [role, currentSiteId, timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Staff self-service data ───────────────────────────────────────────────
    const [staffDateFrom, setStaffDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [staffDateTo,   setStaffDateTo]   = useState(format(new Date(), 'yyyy-MM-dd'));
    const [staffTasks,    setStaffTasks]    = useState<any[]>([]);
    const [staffLoading,  setStaffLoading]  = useState(false);

    useEffect(() => {
        if (role !== 'staff' || !authUser?.ID) return;
        setStaffLoading(true);
        api.get('/tasks', { params: { staff_id: authUser.ID, date_from: staffDateFrom, date_to: staffDateTo } })
            .then(r => setStaffTasks(r.data || []))
            .catch(console.error)
            .finally(() => setStaffLoading(false));
    }, [role, authUser?.ID, staffDateFrom, staffDateTo]);

    if (role === 'staff') {
        const staffSite = sitesList.find(s => s.ID === authUser?.SITE_ID);
        const myCount   = staffTasks.reduce((s, t) => s + (Number(t.COUNT) || 0), 0);
        const myDays    = new Set(staffTasks.map(t => t.TASK_DATE?.slice(0, 10))).size;
        return (
            <div className="space-y-5">
                {/* Greeting */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-lg font-black shrink-0 shadow-md">
                        {authUser?.NAME?.charAt(0).toUpperCase() || 'S'}
                    </div>
                    <div>
                        <p className="text-lg font-bold text-slate-900">Hello, {authUser?.NAME?.split(' ')[0]} 👋</p>
                        {staffSite
                            ? <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-indigo-400" />{staffSite.NAME}</p>
                            : <p className="text-sm text-slate-400 mt-0.5">No site assigned</p>}
                    </div>
                </div>

                {/* Date range filter */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">From</label>
                        <input type="date" value={staffDateFrom} onChange={e => setStaffDateFrom(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">To</label>
                        <input type="date" value={staffDateTo} onChange={e => setStaffDateTo(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                    </div>
                </div>

                {/* Stats */}
                {staffLoading ? (
                    <div className="grid grid-cols-2 gap-4">
                        {[...Array(2)].map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                            <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center mb-3">
                                <BarChart3 className="w-4.5 h-4.5 text-indigo-600" style={{ width: 18, height: 18 }} />
                            </div>
                            <p className="text-2xl font-black text-slate-900">{myCount.toLocaleString()}</p>
                            <p className="text-xs font-semibold text-slate-500 mt-0.5 uppercase tracking-wider">Total Count</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center mb-3">
                                <ClipboardList className="w-4.5 h-4.5 text-emerald-600" style={{ width: 18, height: 18 }} />
                            </div>
                            <p className="text-2xl font-black text-slate-900">{myDays}</p>
                            <p className="text-xs font-semibold text-slate-500 mt-0.5 uppercase tracking-wider">Working Days</p>
                        </div>
                    </div>
                )}

                {/* Recent tasks */}
                {!staffLoading && staffTasks.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-700">My Recent Tasks</h3>
                        </div>
                        <div className="divide-y divide-slate-50">
                            {staffTasks.slice(0, 10).map((t, i) => (
                                <div key={i} className="flex items-center justify-between px-5 py-3">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">{t.TASK_DESCRIPTION || '—'}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">{t.TASK_DATE?.slice(0, 10)}</p>
                                    </div>
                                    <span className="text-sm font-bold text-indigo-600">{t.COUNT ?? 0}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-2xl p-5 h-32 skeleton" />)}
                </div>
                <div className="bg-white rounded-2xl p-6 h-64 skeleton" />
            </div>
        );
    }

    const flaggedUsers = usersList.filter(u => u.INACTIVATION_REQUESTED);

    if (role === 'project_manager') {
        if (pmLoading) return <div className="p-8 text-center text-slate-400">Loading...</div>;

        const atRiskSites = pmPortfolio.filter((s: any) => s.RISK);
        const understaffedSites = pmPortfolio.filter((s: any) => s.UNDERSTAFFED);

        const urgentSites = pmPortfolio
            .filter((s: any) => s.RISK)
            .sort((a: any, b: any) => (a.RISK === 'red' ? 0 : 1) - (b.RISK === 'red' ? 0 : 1));

        const sortedStages = [...pmStages].sort((a, b) => a.SORT_ORDER - b.SORT_ORDER);
        const stageDistribution = sortedStages.map((stage, i) => ({
            name: stage.NAME,
            count: pmPortfolio.filter((s: any) => s.STAGE_ID === stage.ID).length,
            fill: stage.IS_DONE ? PM_DONE_COLOR : PM_STAGE_COLORS[i % PM_STAGE_COLORS.length],
        }));
        const doneStageIds = new Set(sortedStages.filter(s => s.IS_DONE).map(s => s.ID));
        const completedCount = pmPortfolio.filter((s: any) => doneStageIds.has(s.STAGE_ID)).length;

        const kpiValues = pmPortfolio.map((s: any) => s.AVERAGE_KPI).filter((v: any) => v != null);
        const avgCompanyKpi = kpiValues.length > 0 ? kpiValues.reduce((a: number, b: number) => a + b, 0) / kpiValues.length : null;

        const targetSites = pmPortfolio.filter((s: any) => s.MONTHLY_TARGET_PCT != null);
        const targetAchColor = (pct: number) => pct < 50 ? '#ef4444' : pct < 100 ? '#f59e0b' : '#10b981';

        const topLeaders = pmLeaderboard.slice(0, 3);
        const LEADER_ICON = [
            <Trophy key="0" className="w-3.5 h-3.5 text-amber-500" />,
            <Medal key="1" className="w-3.5 h-3.5 text-slate-400" />,
            <Medal key="2" className="w-3.5 h-3.5 text-orange-400" />,
        ];

        return (
            <div className="space-y-5">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Project Overview</h1>
                    <p className="text-slate-500 text-sm mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
                </div>

                {/* KPI strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[
                        { label: 'Total Projects', val: pmPortfolio.length, sub: `${sortedStages.length} stages`, color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', icon: Layers },
                        { label: 'At-Risk', val: atRiskSites.length, sub: 'overdue or due soon', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: AlertTriangle },
                        { label: 'Understaffed', val: understaffedSites.length, sub: 'below planned headcount', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Users },
                        { label: 'Completed', val: completedCount, sub: 'in done stage', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle },
                        { label: 'Avg Staff KPI', val: avgCompanyKpi != null ? avgCompanyKpi.toFixed(1) : '—', sub: 'across all sites', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', icon: Award },
                    ].map((kpi, i) => (
                        <div key={i} onClick={() => navigate('/project-planning')}
                            className={`${kpi.bg} border rounded-2xl p-4 cursor-pointer hover:shadow-sm transition-shadow`}>
                            <div className="flex items-center justify-between mb-2">
                                <kpi.icon className={`w-4 h-4 ${kpi.color} opacity-60`} />
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{kpi.label}</p>
                            </div>
                            <p className={`text-[20px] font-black ${kpi.color} leading-none`}>{kpi.val}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{kpi.sub}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Left: charts + attention list */}
                    <div className="lg:col-span-2 flex flex-col gap-4">

                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Projects by Stage</h3>
                                <button onClick={() => navigate('/project-planning')} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                                    Open board <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                            {stageDistribution.length === 0 ? (
                                <div className="flex items-center justify-center h-40 text-slate-400 text-xs">No stages configured yet</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart data={stageDistribution} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                        <Bar dataKey="count" name="Projects" radius={[4, 4, 0, 0]} barSize={36}>
                                            {stageDistribution.map((s, i) => <Cell key={i} fill={s.fill} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">Monthly Target Achievement</h3>
                            {targetSites.length === 0 ? (
                                <div className="flex items-center justify-center h-40 text-slate-400 text-xs">No target-based sites this month</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart data={targetSites.map((s: any) => ({ name: s.SITE_NO, site_name: s.NAME, pct: s.MONTHLY_TARGET_PCT }))}
                                        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                                        <Tooltip
                                            content={({ active, payload }: any) => {
                                                if (!active || !payload?.length) return null;
                                                const d = payload[0]?.payload;
                                                return (
                                                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
                                                        <p style={{ fontWeight: 700, marginBottom: 4 }}>{d?.site_name}</p>
                                                        <p>{d?.pct}% of monthly target</p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Bar dataKey="pct" name="% of target" radius={[4, 4, 0, 0]} barSize={20}>
                                            {targetSites.map((s: any, i: number) => <Cell key={i} fill={targetAchColor(s.MONTHLY_TARGET_PCT)} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                                <h2 className="font-bold text-slate-900">Sites Needing Attention</h2>
                                <button onClick={() => navigate('/project-planning')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                                    View all <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {urgentSites.slice(0, 8).map((s: any) => (
                                    <div key={s.ID} onClick={() => navigate('/project-planning')}
                                        className={`px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 border-l-4 ${s.RISK === 'red' ? 'border-l-red-500' : 'border-l-amber-500'}`}>
                                        <div className="flex items-center gap-2.5">
                                            <span className={`w-2 h-2 rounded-full ${s.RISK === 'red' ? 'bg-red-500' : 'bg-amber-500'}`} />
                                            <div>
                                                <p className="text-sm font-semibold text-slate-800 leading-none">{s.NAME}</p>
                                                <p className="text-[11px] text-slate-400 mt-0.5">Stage: {s.STAGE_NAME ?? '—'}</p>
                                            </div>
                                        </div>
                                        <span className="text-xs font-semibold text-slate-500">{s.RISK === 'red' ? 'Overdue' : 'Due soon'}</span>
                                    </div>
                                ))}
                                {urgentSites.length === 0 && (
                                    <p className="px-5 py-8 text-center text-slate-400 text-sm">No sites at risk right now.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: leaderboard + quick links */}
                    <div className="flex flex-col gap-4">
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Top Performers</h3>
                                <button onClick={() => navigate('/kpi')} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                                    Leaderboard <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                            {topLeaders.length === 0 ? (
                                <p className="text-[11px] text-slate-400 text-center py-6">No KPI scores recorded yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {topLeaders.map((e, i) => (
                                        <div key={e.STAFF_ID} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50">
                                            {LEADER_ICON[i]}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[12px] font-semibold text-slate-800 truncate leading-none">{e.STAFF_NAME}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{e.SITE_NAME ?? '—'}</p>
                                            </div>
                                            <p className="text-[13px] font-black text-slate-700">{e.AVG_SCORE.toFixed(1)}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button onClick={() => navigate('/project-planning')}
                            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 text-left hover:border-indigo-300 transition-colors flex items-center gap-3">
                            <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
                                <GitBranch className="w-4.5 h-4.5 text-indigo-600" style={{ width: 18, height: 18 }} />
                            </div>
                            <div>
                                <p className="font-bold text-slate-900 text-sm">Project Planning</p>
                                <p className="text-xs text-slate-400 mt-0.5">Move projects through stages</p>
                            </div>
                        </button>
                        <button onClick={() => navigate('/kpi')}
                            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 text-left hover:border-indigo-300 transition-colors flex items-center gap-3">
                            <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center shrink-0">
                                <Award className="w-4.5 h-4.5 text-violet-600" style={{ width: 18, height: 18 }} />
                            </div>
                            <div>
                                <p className="font-bold text-slate-900 text-sm">Staff KPI</p>
                                <p className="text-xs text-slate-400 mt-0.5">Score staff, view leaderboard</p>
                            </div>
                        </button>
                        <button onClick={() => navigate('/sites')}
                            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 text-left hover:border-indigo-300 transition-colors flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                                <MapPin className="w-4.5 h-4.5 text-blue-600" style={{ width: 18, height: 18 }} />
                            </div>
                            <div>
                                <p className="font-bold text-slate-900 text-sm">Sites</p>
                                <p className="text-xs text-slate-400 mt-0.5">Manage site setup & staffing</p>
                            </div>
                        </button>
                        <button onClick={() => navigate('/reports')}
                            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 text-left hover:border-indigo-300 transition-colors flex items-center gap-3">
                            <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center shrink-0">
                                <BarChart3 className="w-4.5 h-4.5 text-orange-600" style={{ width: 18, height: 18 }} />
                            </div>
                            <div>
                                <p className="font-bold text-slate-900 text-sm">Reports</p>
                                <p className="text-xs text-slate-400 mt-0.5">Operation, OT & target reports</p>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── System Admin CEO Live Dashboard ──────────────────────────────────────
    if (role === 'system_admin') {
        const sitesData: any[] = bizData?.sites || [];
        const { from: rangeFrom, to: rangeTo } = ceoDateRange();

        const totalActiveWorkers = sitesData.reduce((s: number, x: any) => s + (x.active_workers || x.unique_attendees || 0), 0);
        const totalUnits         = sitesData.reduce((s: number, x: any) => s + (x.total_units || 0), 0);
        const totalTarget        = sitesData.reduce((s: number, x: any) => s + (x.total_target || 0), 0);
        const companyAchievement = totalTarget > 0 ? Math.round(totalUnits / totalTarget * 100) : null;

        const slideSites   = sitesData.filter((s: any) => s.task_records > 0 || s.total_units > 0);
        const safeIdx      = slideSites.length > 0 ? slideIndex % slideSites.length : 0;
        const currentSlide = slideSites[safeIdx] || null;

        const detailKey     = currentSlide ? `${currentSlide.site_id}-${timeRange}` : '';
        const currentDetail = detailKey ? (siteDetails[detailKey] || null) : null;

        const underperformers = sitesData
            .filter((s: any) => s.achievement_pct !== null && s.achievement_pct < 90)
            .sort((a: any, b: any) => a.achievement_pct - b.achievement_pct);

        const achColor = (pct: number | null) =>
            pct === null ? 'text-slate-400' : pct >= 100 ? 'text-emerald-600' : pct >= 80 ? 'text-amber-600' : 'text-red-600';
        const achBg = (pct: number | null) =>
            pct === null ? 'bg-slate-50 border-slate-200' : pct >= 100 ? 'bg-emerald-50 border-emerald-200' : pct >= 80 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
        const achBar = (pct: number | null) =>
            pct === null ? 'bg-slate-300' : pct >= 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-amber-500' : 'bg-red-500';

        const TIME_RANGES = [
            { key: 'month', label: 'Month' },
            { key: '3m',    label: '3M'    },
            { key: '6m',    label: '6M'    },
            { key: 'ytd',   label: 'YTD'   },
        ] as const;

        const applyPreset = (key: typeof TIME_RANGES[number]['key']) => {
            const now = new Date();
            const to  = format(now, 'yyyy-MM-dd');
            let from: string;
            if (key === '3m')  from = format(subMonths(now, 3), 'yyyy-MM-dd');
            else if (key === '6m')  from = format(subMonths(now, 6), 'yyyy-MM-dd');
            else if (key === 'ytd') from = `${now.getFullYear()}-01-01`;
            else                    from = format(startOfMonth(now), 'yyyy-MM-dd');
            setTimeRange(key);
            setCustomFrom(from);
            setCustomTo(to);
        };

        const handleRefresh = () => {
            setSiteDetails({});
            setBizLoading(true);
            const { from, to } = ceoDateRange();
            api.get('/analytics/sites', { params: { date_from: from, date_to: to } })
                .then(r => setBizData(r.data))
                .catch(e => console.error('refresh error', e))
                .finally(() => setBizLoading(false));
        };

        return (
            <div className="space-y-4"
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}>

                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-5 py-3.5 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                            <span className="text-white font-black text-sm">D</span>
                        </div>
                        <div>
                            <p className="text-slate-900 font-black text-sm leading-none">DOK Systems</p>
                            <p className="text-slate-400 text-[10px] mt-0.5 tracking-wide">CEO Performance Dashboard</p>
                        </div>
                        <div className="flex items-center gap-1.5 ml-3 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <p className="text-emerald-700 text-[10px] font-bold">Live</p>
                        </div>
                    </div>

                    {/* Time range: presets + always-visible date inputs */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                            {TIME_RANGES.map(tr => (
                                <button key={tr.key}
                                    onClick={() => applyPreset(tr.key)}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                        timeRange === tr.key
                                            ? 'bg-white text-indigo-700 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}>
                                    {tr.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <input type="date" value={customFrom}
                                onChange={e => { setCustomFrom(e.target.value); setTimeRange('custom'); }}
                                className="border border-slate-200 rounded-lg px-2 py-1 text-[11px] text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            <span className="text-slate-400 text-[11px]">→</span>
                            <input type="date" value={customTo}
                                onChange={e => { setCustomTo(e.target.value); setTimeRange('custom'); }}
                                className="border border-slate-200 rounded-lg px-2 py-1 text-[11px] text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4">
                        <div className="text-right hidden sm:block">
                            <p className="text-slate-900 text-[13px] font-semibold">{format(new Date(), 'EEE, MMM d yyyy')}</p>
                            <p className="text-slate-400 text-[10px] mt-0.5">{rangeFrom} &rarr; {rangeTo}</p>
                        </div>
                        <p className="text-indigo-700 font-mono text-xl font-black tracking-wider">{currentTime}</p>
                        <button onClick={handleRefresh} disabled={bizLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] text-slate-600 hover:text-slate-900 transition-all disabled:opacity-50">
                            <RefreshCw className={`w-3 h-3 ${bizLoading ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                        <button onClick={() => navigate('/analytics')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-[11px] text-white font-semibold transition-all shadow-sm">
                            <BarChart3 className="w-3 h-3" /> Analytics
                        </button>
                    </div>
                </div>

                {/* KPI Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[
                        { label: 'Total Sites',    val: stats.totalSites,                    sub: `${stats.totalStaff} staff`,              color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200',   icon: MapPin },
                        { label: 'Active Workers', val: totalActiveWorkers,                  sub: 'in period',                              color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',       icon: Users },
                        { label: 'Actual Units',   val: totalUnits.toLocaleString(),          sub: 'produced',                               color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200',   icon: Activity },
                        { label: 'Target Units',   val: totalTarget.toLocaleString(),         sub: 'expected',                               color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200',     icon: ClipboardList },
                        {
                            label: 'Achievement',
                            val: companyAchievement !== null ? `${companyAchievement}%` : 'N/A',
                            sub: totalTarget > 0 ? `${totalUnits.toLocaleString()} / ${totalTarget.toLocaleString()}` : 'no targets',
                            color: companyAchievement === null ? 'text-slate-500' : companyAchievement >= 100 ? 'text-emerald-700' : companyAchievement >= 80 ? 'text-amber-700' : 'text-red-700',
                            bg:    companyAchievement === null ? 'bg-slate-50 border-slate-200' : companyAchievement >= 100 ? 'bg-emerald-50 border-emerald-200' : companyAchievement >= 80 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200',
                            icon: TrendingUp,
                        },
                    ].map((kpi, i) => (
                        <div key={i} className={`${kpi.bg} border rounded-2xl p-4`}>
                            <div className="flex items-center justify-between mb-2">
                                <kpi.icon className={`w-4 h-4 ${kpi.color} opacity-60`} />
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{kpi.label}</p>
                            </div>
                            <p className={`text-[20px] font-black ${kpi.color} leading-none`}>{kpi.val}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{kpi.sub}</p>
                        </div>
                    ))}
                </div>

                {/* Main Body */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                    {/* Left col: Site Slide + Charts */}
                    <div className="lg:col-span-2 flex flex-col gap-4">

                        {/* Site Performance Slide */}
                        {bizLoading ? (
                            <div className="bg-white border border-slate-200 rounded-2xl skeleton" style={{ minHeight: 240 }} />
                        ) : slideSites.length === 0 ? (
                            <div className="bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 shadow-sm" style={{ minHeight: 240 }}>
                                <ClipboardList className="w-10 h-10 mb-3 opacity-30" />
                                <p className="text-sm font-semibold">No task data in this period</p>
                                <button onClick={() => navigate('/tasks')} className="mt-2 text-xs text-indigo-600 hover:text-indigo-700 font-semibold">Add tasks &rarr;</button>
                            </div>
                        ) : currentSlide && (
                            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">

                                {/* Slide header */}
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                                                currentSlide.ot_type === 'time_based'   ? 'bg-emerald-100 text-emerald-700' :
                                                currentSlide.ot_type === 'target_based' ? 'bg-violet-100 text-violet-700'  :
                                                                                          'bg-amber-100 text-amber-700'
                                            }`}>{OT_LABEL[currentSlide.ot_type] || currentSlide.ot_type}</span>
                                            {currentSlide.achievement_pct !== null && currentSlide.achievement_pct < 80 && (
                                                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-600 flex items-center gap-1">
                                                    <AlertTriangle className="w-2.5 h-2.5" /> Underperforming
                                                </span>
                                            )}
                                            {currentSlide.achievement_pct !== null && currentSlide.achievement_pct >= 100 && (
                                                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                                                    <CheckCircle className="w-2.5 h-2.5" /> On Target
                                                </span>
                                            )}
                                        </div>
                                        <h2 className="text-[22px] font-black text-slate-900 leading-tight">{currentSlide.site_name}</h2>
                                        <p className="text-slate-400 text-[12px] mt-0.5">#{currentSlide.site_no}</p>
                                    </div>
                                    {/* Slide dots */}
                                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                                        <p className="text-[9px] text-slate-400 tabular-nums">{safeIdx + 1} / {slideSites.length}</p>
                                        <div className="flex gap-1 flex-wrap justify-end max-w-[120px]">
                                            {slideSites.slice(0, 15).map((_: any, di: number) => (
                                                <button key={di}
                                                    onClick={(e) => { e.stopPropagation(); setSlideIndex(di); }}
                                                    className={`h-1 rounded-full transition-all duration-300 ${
                                                        di === safeIdx ? 'w-5 bg-indigo-500' : 'w-1 bg-slate-300 hover:bg-slate-400'
                                                    }`} />
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Target vs Performance — three columns */}
                                {(() => {
                                    const slideTarget = (currentSlide.daily_target || 0) * 22 * (currentSlide.active_workers || 0);
                                    const slideAchievement = slideTarget > 0 ? Math.round(currentSlide.total_units / slideTarget * 1000) / 10 : null;
                                    const slideExtra = currentSlide.total_units > slideTarget ? currentSlide.total_units - slideTarget : 0;
                                    return slideTarget > 0 ? (
                                    <div className={`rounded-2xl p-4 sm:p-5 border ${achBg(slideAchievement)} mb-4`}>
                                        <div className="grid grid-cols-3 gap-2 sm:gap-4 items-center">
                                            <div className="text-center">
                                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Actual Units</p>
                                                <p className={`text-[22px] sm:text-[38px] font-black leading-none ${achColor(slideAchievement)}`}>
                                                    {Number(currentSlide.total_units || 0).toLocaleString()}
                                                </p>
                                                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1">produced</p>
                                            </div>
                                            <div className="text-center border-x border-slate-200 px-2 sm:px-4">
                                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Achievement</p>
                                                <p className={`text-[28px] sm:text-[44px] font-black leading-none ${achColor(slideAchievement)}`}>
                                                    {slideAchievement}%
                                                </p>
                                                <div className="mt-2 h-2 bg-white/80 border border-slate-200 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all duration-700 ${achBar(slideAchievement)}`}
                                                        style={{ width: `${Math.min(Number(slideAchievement || 0), 100)}%` }} />
                                                </div>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Target Units</p>
                                                <p className="text-[22px] sm:text-[38px] font-black text-slate-500 leading-none">
                                                    {slideTarget.toLocaleString()}
                                                </p>
                                                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1">daily × 22 × staff</p>
                                            </div>
                                        </div>
                                        {slideExtra > 0 && (
                                            <div className="mt-3 pt-3 border-t border-white/50 flex items-center justify-between">
                                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Extra Units</p>
                                                <p className="text-[20px] font-black text-emerald-600 leading-none">
                                                    +{slideExtra.toLocaleString()}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    ) : (
                                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-4">
                                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Period Activity</p>
                                            <p className="text-[28px] sm:text-[42px] font-black text-slate-700 leading-none">{Number(currentSlide.task_records || 0).toLocaleString()}</p>
                                            <p className="text-[12px] text-slate-400 mt-1.5">Task records (time-based site)</p>
                                        </div>
                                    );
                                })()}

                                {/* Site KPIs */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {[
                                        { label: 'Active Workers', val: currentSlide.active_workers || currentSlide.unique_attendees || 0, color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-100' },
                                        { label: 'Total Staff',    val: currentSlide.total_staff || 0,                                     color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
                                        { label: 'Task Records',   val: currentSlide.task_records || 0,                                    color: 'text-violet-700',bg: 'bg-violet-50 border-violet-100' },
                                        { label: 'OT Paid',        val: fmtK(currentSlide.ot_payment || 0),                                color: 'text-amber-700', bg: 'bg-amber-50 border-amber-100' },
                                    ].map((k, ki) => (
                                        <div key={ki} className={`rounded-xl p-3 border ${k.bg}`}>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{k.label}</p>
                                            <p className={`text-base font-black ${k.color} leading-none`}>{k.val}</p>
                                        </div>
                                    ))}
                                </div>

                                {isPaused && (
                                    <p className="text-[10px] text-slate-400 text-center mt-3">Paused &mdash; move cursor away to resume</p>
                                )}
                            </div>
                        )}

                        {/* Daily Target vs Performance Trend */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Daily Target vs Performance</h3>
                                    {currentSlide && (
                                        <p className="text-[10px] text-indigo-600 font-semibold mt-0.5">{currentSlide.site_name} &mdash; {currentSlide.site_no}</p>
                                    )}
                                </div>
                                {siteDetailLoading && (
                                    <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                )}
                            </div>
                            {!currentSlide ? (
                                <div className="flex items-center justify-center h-44 text-slate-400 text-xs">Select a site slide to see daily trend</div>
                            ) : currentSlide.ot_type === 'time_based' ? (
                                <div className="flex items-center justify-center h-44 text-slate-400 text-xs">Time-based site &mdash; no unit target tracking</div>
                            ) : siteDetailLoading && !currentDetail ? (
                                <div className="skeleton h-44 rounded-xl" />
                            ) : !currentDetail || !currentDetail.dailyTrend || currentDetail.dailyTrend.length === 0 ? (
                                <div className="flex items-center justify-center h-44 text-slate-400 text-xs">No daily data for this period</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart
                                        data={currentDetail.dailyTrend.map((d: any) => ({
                                            date:   d.date?.slice(5),
                                            target: d.target,
                                            actual: d.actual,
                                        }))}
                                        barSize={12} barGap={2}
                                        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                        <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                        <Tooltip
                                            formatter={(val: unknown, name: string | undefined) => [String(val), name === 'target' ? 'Target' : 'Actual'] as [string, string]}
                                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                        <Bar dataKey="target" name="Target" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="actual" name="Actual" fill="#6366f1" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* All Sites Achievement Overview */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">ALL SITES &mdash; TARGET vs ACHIEVEMENT</h3>
                            {bizLoading ? (
                                <div className="skeleton h-44 rounded-xl" />
                            ) : sitesData.filter((s: any) => s.total_target > 0).length === 0 ? (
                                <div className="flex items-center justify-center h-44 text-slate-400 text-xs">No sites with daily targets configured</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart
                                        data={[...sitesData]
                                            .map((s: any) => {
                                                const target = (s.daily_target || 0) * 22 * (s.active_workers || 0);
                                                const achievement = target > 0 ? Math.round(s.total_units / target * 1000) / 10 : null;
                                                return { name: s.site_no, site_name: s.site_name, target, actual: s.total_units, achievement };
                                            })
                                            .filter((s: any) => s.target > 0)}
                                        barCategoryGap="30%"
                                        barGap={2}
                                        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                                        <Tooltip
                                            content={({ active, payload, label }: any) => {
                                                if (!active || !payload?.length) return null;
                                                const d = payload[0]?.payload;
                                                return (
                                                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
                                                        <p style={{ fontWeight: 700, marginBottom: 4 }}>{d?.site_name || label}</p>
                                                        <p style={{ color: '#6366f1' }}>Actual: {Number(d?.actual || 0).toLocaleString()}</p>
                                                        <p style={{ color: '#94a3b8' }}>Target: {Number(d?.target || 0).toLocaleString()}</p>
                                                        <p style={{ color: d?.achievement >= 100 ? '#10b981' : d?.achievement >= 80 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
                                                            Achievement: {d?.achievement != null ? `${d.achievement}%` : 'N/A'}
                                                        </p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Bar dataKey="target" name="Target" fill="#cbd5e1" radius={[3, 3, 0, 0]} barSize={14} />
                                        <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]} barSize={14}>
                                            {[...sitesData]
                                                .map((s: any) => {
                                                    const target = (s.daily_target || 0) * 22 * (s.active_workers || 0);
                                                    return target > 0 ? Math.round(s.total_units / target * 1000) / 10 : null;
                                                })
                                                .filter((pct: any) => pct !== null)
                                                .map((pct: any, i: number) => (
                                                    <Cell key={i} fill={pct >= 100 ? '#10b981' : pct >= 80 ? '#f59e0b' : '#ef4444'} />
                                                ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* Right col: Staff Performance + Alerts + Sites List */}
                    <div className="flex flex-col gap-4">

                        {/* Staff vs Target for current site */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <Users className="w-3.5 h-3.5 text-indigo-500" />
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Staff vs Target</h3>
                                {currentSlide && (
                                    <span className="ml-auto text-[9px] text-slate-400 truncate max-w-[90px]">{currentSlide.site_no}</span>
                                )}
                            </div>
                            {!currentSlide ? (
                                <p className="text-[11px] text-slate-400 text-center py-6">No site selected</p>
                            ) : currentSlide.ot_type === 'time_based' ? (
                                <p className="text-[11px] text-slate-400 text-center py-6">Time-based site<br/>No unit targets</p>
                            ) : siteDetailLoading && !currentDetail ? (
                                <div className="skeleton h-40 rounded-xl" />
                            ) : !currentDetail || !currentDetail.staffBreakdown || currentDetail.staffBreakdown.length === 0 ? (
                                <p className="text-[11px] text-slate-400 text-center py-6">No staff data</p>
                            ) : (
                                <div className="space-y-1.5">
                                    <div className="grid grid-cols-4 gap-1 px-1 mb-2">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase col-span-2">Staff</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase text-right">Act/Tgt</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase text-right">Ach%</p>
                                    </div>
                                    {(currentDetail.staffBreakdown as any[]).slice(0, 9).map((st: any, si: number) => (
                                        <div key={si} className={`grid grid-cols-4 gap-1 px-2 py-1.5 rounded-lg ${
                                            st.achievement_pct >= 100 ? 'bg-emerald-50' : st.achievement_pct >= 80 ? 'bg-amber-50' : 'bg-red-50'
                                        }`}>
                                            <div className="col-span-2 min-w-0">
                                                <p className="text-[10px] font-bold text-slate-800 truncate leading-none">{st.staff_name}</p>
                                                <p className="text-[9px] text-slate-400">{st.epf_number}</p>
                                            </div>
                                            <p className="text-[10px] text-slate-500 text-right self-center tabular-nums">
                                                {st.sum_count}/{st.total_target}
                                            </p>
                                            <p className={`text-[11px] font-black text-right self-center ${achColor(st.achievement_pct)}`}>
                                                {st.achievement_pct}%
                                            </p>
                                        </div>
                                    ))}
                                    {currentDetail.staffBreakdown.length > 9 && (
                                        <p className="text-[10px] text-slate-400 text-center pt-1">
                                            +{currentDetail.staffBreakdown.length - 9} more
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Needs Attention */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                                    <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                                </div>
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Needs Attention</h3>
                                {underperformers.length > 0 && (
                                    <span className="ml-auto text-[10px] font-black text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                                        {underperformers.length}
                                    </span>
                                )}
                            </div>
                            {underperformers.length === 0 ? (
                                <div className="flex flex-col items-center py-3">
                                    <CheckCircle className="w-7 h-7 text-emerald-400 mb-1.5" />
                                    <p className="text-[11px] font-semibold text-emerald-700">All sites on track</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">Achievement &ge; 90%</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {underperformers.slice(0, 5).map((s: any, i: number) => (
                                        <div key={i} className="p-2.5 rounded-xl bg-red-50 border border-red-100">
                                            <div className="flex items-center justify-between gap-1">
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-bold text-slate-800 truncate leading-none">{s.site_no}</p>
                                                    <p className="text-[9px] text-slate-400 truncate mt-0.5">
                                                        {Number(s.total_units || 0).toLocaleString()} / {Number(s.total_target || 0).toLocaleString()} units
                                                    </p>
                                                </div>
                                                <span className={`text-[11px] font-black shrink-0 ${achColor(s.achievement_pct)}`}>{s.achievement_pct}%</span>
                                            </div>
                                            <div className="mt-1.5 h-1 bg-red-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(s.achievement_pct, 100)}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Flagged staff */}
                        {flaggedUsers.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                    <p className="text-[11px] font-bold text-amber-700">{flaggedUsers.length} Flagged Staff</p>
                                </div>
                                <button onClick={() => navigate('/users')}
                                    className="text-[10px] text-amber-600 hover:text-amber-700 font-semibold transition-colors">
                                    Review in Users &rarr;
                                </button>
                            </div>
                        )}

                        {/* All sites list */}
                        <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col">
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">ALL SITES</h3>
                            <div className="space-y-1 overflow-y-auto flex-1" style={{ maxHeight: '320px' }}>
                                {sitesData.length === 0 ? (
                                    <p className="text-[11px] text-slate-400 text-center py-4">No site data</p>
                                ) : sitesData.map((s: any, ai: number) => {
                                    const idx      = slideSites.findIndex((ss: any) => ss.site_no === s.site_no);
                                    const isActive = currentSlide?.site_no === s.site_no;
                                    return (
                                        <div key={ai}
                                            onClick={() => idx >= 0 && setSlideIndex(idx)}
                                            className={`flex items-center gap-2 p-2 rounded-xl transition-all ${idx >= 0 ? 'cursor-pointer' : ''} ${
                                                isActive ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50'
                                            }`}>
                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                s.achievement_pct === null ? 'bg-slate-300' :
                                                s.achievement_pct >= 100   ? 'bg-emerald-500' :
                                                s.achievement_pct >= 80    ? 'bg-amber-500'   : 'bg-red-500'
                                            }`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-bold text-slate-700 truncate leading-none">{s.site_no}</p>
                                                <p className="text-[9px] text-slate-400 truncate">{s.site_name}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                {s.achievement_pct !== null ? (
                                                    <>
                                                        <p className={`text-[10px] font-black ${achColor(s.achievement_pct)}`}>{s.achievement_pct}%</p>
                                                        <p className="text-[9px] text-slate-400 tabular-nums">{s.total_units} / {s.total_target}</p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="text-[10px] font-black text-slate-500">{s.task_records} tasks</p>
                                                        <p className="text-[9px] text-slate-400">{s.active_workers || s.unique_attendees || 0} workers</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    // ── Admin / Supervisor / Staff Dashboard ──────────────────────────────────

    const quickActions = [
        { label: 'Add Site',    icon: Plus,          bg: 'bg-blue-50 hover:bg-blue-100 border-blue-200',       text: 'text-blue-700',    link: '/sites' },
        { label: 'Add Staff',   icon: UserPlus,      bg: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200', text: 'text-emerald-700', link: '/users' },
        { label: 'Daily Tasks', icon: ClipboardList, bg: 'bg-orange-50 hover:bg-orange-100 border-orange-200', text: 'text-orange-700',  link: '/tasks' },
        { label: 'Payroll',     icon: DollarSign,    bg: 'bg-violet-50 hover:bg-violet-100 border-violet-200', text: 'text-violet-700',  link: '/payroll' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Dashboard</h1>
                    <p className="text-slate-500 text-sm mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
                </div>
                {flaggedUsers.length > 0 && role === 'admin' && (
                    <button onClick={() => navigate('/users')}
                        className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full cursor-pointer hover:bg-amber-100 transition-colors">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-xs font-semibold text-amber-700">{flaggedUsers.length} Flagged</span>
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Active Sites"     value={stats.totalSites}       icon={MapPin}        color="text-blue-600"    bg="bg-blue-50"    onClick={() => navigate('/sites')} />
                <StatCard label="Staff Members"    value={stats.totalStaff}       icon={Users}         color="text-emerald-600" bg="bg-emerald-50" onClick={() => navigate('/users')} />
                <StatCard label="Supervisors"      value={stats.totalSupervisors} icon={UserPlus}      color="text-violet-600"  bg="bg-violet-50"  onClick={() => navigate('/users')} />
                <StatCard label="Tasks This Month" value={stats.totalTasks}       icon={ClipboardList} color="text-orange-600"  bg="bg-orange-50"  onClick={() => navigate('/tasks')} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="font-bold text-slate-900">Team Members</h2>
                        <button onClick={() => navigate('/users')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                            View all <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Site</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {usersList.slice(0, 6).map((user) => {
                                    const userSite = sitesList.find(s => s.ID === user.SITE_ID);
                                    return (
                                        <tr key={user.ID} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                                        {user.NAME.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-slate-900 leading-none">{user.NAME}</p>
                                                        <p className="text-[11px] text-slate-400 mt-0.5">{user.EPF_NUMBER}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${getRoleBadge(user.ROLE)}`}>{user.ROLE}</span>
                                            </td>
                                            <td className="px-5 py-3.5 hidden sm:table-cell">
                                                <span className="text-sm text-slate-500">{userSite ? userSite.SITE_NO : '—'}</span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {user.INACTIVATION_REQUESTED ? (
                                                    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600"><AlertTriangle className="w-3 h-3" /> Flagged</span>
                                                ) : user.STATUS === 'active' ? (
                                                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><CheckCircle className="w-3 h-3" /> Active</span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-[11px] font-semibold text-red-500"><XCircle className="w-3 h-3" /> Inactive</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {usersList.length === 0 && (
                                    <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400 text-sm">No team members yet</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="space-y-5">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                        <h2 className="font-bold text-slate-900 mb-4">Quick Actions</h2>
                        <div className="grid grid-cols-2 gap-3">
                            {quickActions.map((action) => (
                                <button key={action.label} onClick={() => navigate(action.link)}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all active:scale-95 ${action.bg} ${action.text}`}>
                                    <action.icon className="w-5 h-5" />
                                    <span className="text-xs font-semibold">{action.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold text-slate-900">Sites</h2>
                            <button onClick={() => navigate('/sites')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">View all</button>
                        </div>
                        <div className="space-y-3">
                            {sitesList.slice(0, 4).map((site) => (
                                <div key={site.ID} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                                            <MapPin className="w-3.5 h-3.5 text-blue-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800 leading-none">{site.NAME}</p>
                                            <p className="text-[11px] text-slate-400 mt-0.5">#{site.SITE_NO}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-slate-400">
                                        <Users className="w-3.5 h-3.5" />
                                        <span className="text-xs font-semibold text-slate-600">{site.STAFF_COUNT || 0}</span>
                                    </div>
                                </div>
                            ))}
                            {sitesList.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No sites yet</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
