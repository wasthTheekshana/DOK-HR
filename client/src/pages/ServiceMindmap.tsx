import React, { useEffect, useState, useCallback } from 'react';
import { startOfMonth, subMonths, endOfMonth, format } from 'date-fns';
import api from '../services/api';
import {
    GitBranch, RefreshCw, TrendingUp, TrendingDown, Minus, HelpCircle,
    Users, User, Target, AlertTriangle, CheckCircle, BarChart2, X,
    Clock, Calendar, Activity, ChevronRight,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
    LineChart, Line, ReferenceLine,
} from 'recharts';

/* ── Types ───────────────────────────────────────────────────────────────────── */
interface SiteNode {
    id: number; site_no: string; name: string;
    service_type: string; ot_type: string; daily_target: number;
    supervisor_name: string | null; responsible_person_name: string | null;
    achievement_pct: number | null; performance: 'over' | 'on_track' | 'under' | 'no_data';
}
interface ServiceTypeGroup {
    service_type: string; site_count: number;
    over_count: number; on_track_count: number; under_count: number; no_data_count: number;
    sites: SiteNode[];
}
interface MindmapData {
    date_range: { from: string; to: string };
    total_sites: number; service_types: ServiceTypeGroup[];
}
interface SiteDetail {
    date_range: { from: string; to: string; total_days: number };
    site: { id: number; site_no: string; name: string; ot_type: string; daily_target: number; service_type: string; supervisor_name: string | null; responsible_person_name: string | null };
    summary: { total_records: number; total_units: number; days_with_tasks: number; unique_staff: number; total_hours: number; expected_units: number; achievement_pct: number };
    daily: { date: string; units: number; workers: number; hours: number; target: number }[];
    staff: { name: string; epf_number: string; active_days: number; total_units: number; total_hours: number }[];
}

/* ── Config ──────────────────────────────────────────────────────────────────── */
const PERF_CONFIG = {
    over:     { label: 'Over Performing',  color: '#10b981', bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', icon: TrendingUp,   dot: 'bg-emerald-400' },
    on_track: { label: 'On Track',         color: '#3b82f6', bg: 'bg-blue-50',    border: 'border-blue-200',    badge: 'bg-blue-100 text-blue-700',       icon: Minus,        dot: 'bg-blue-400'    },
    under:    { label: 'Under Performing', color: '#ef4444', bg: 'bg-red-50',     border: 'border-red-200',     badge: 'bg-red-100 text-red-700',         icon: TrendingDown, dot: 'bg-red-400'     },
    no_data:  { label: 'No Data',          color: '#94a3b8', bg: 'bg-slate-50',   border: 'border-slate-200',   badge: 'bg-slate-100 text-slate-500',     icon: HelpCircle,   dot: 'bg-slate-300'   },
};
const PERF_KEYS = ['over', 'on_track', 'under', 'no_data'] as const;

/* ── Date helpers ───────────────────────────────────────────────────────────── */
type DateMode = 'this_month' | 'last_month' | 'custom';
function getDateRange(mode: DateMode, customFrom: string, customTo: string): { from: string; to: string } {
    const today = new Date();
    if (mode === 'this_month') return {
        from: format(startOfMonth(today), 'yyyy-MM-dd'),
        to:   format(today, 'yyyy-MM-dd'),
    };
    if (mode === 'last_month') {
        const lm = subMonths(today, 1);
        return { from: format(startOfMonth(lm), 'yyyy-MM-dd'), to: format(endOfMonth(lm), 'yyyy-MM-dd') };
    }
    return { from: customFrom, to: customTo };
}

/* ── Circular progress ring ─────────────────────────────────────────────────── */
const RingProgress: React.FC<{ pct: number | null; perf: SiteNode['performance']; size?: number }> = ({ pct, perf, size = 48 }) => {
    const r = (size - 6) / 2;
    const circ = 2 * Math.PI * r;
    const dash = pct !== null ? Math.min(Math.max(pct, 0), 150) / 150 * circ : 0;
    const color = PERF_CONFIG[perf].color;
    return (
        <svg width={size} height={size} className="shrink-0 -rotate-90">
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={5} />
            {pct !== null && <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />}
            <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle" fontSize={pct !== null ? 10 : 9} fontWeight="700" fill={pct !== null ? color : '#94a3b8'} transform={`rotate(90,${size/2},${size/2})`}>
                {pct !== null ? `${Math.round(pct)}%` : '—'}
            </text>
        </svg>
    );
};

/* ── Mini donut ─────────────────────────────────────────────────────────────── */
const MiniDonut: React.FC<{ group: ServiceTypeGroup }> = ({ group }) => {
    const data = PERF_KEYS.map(k => ({ value: group[`${k}_count` as keyof ServiceTypeGroup] as number, color: PERF_CONFIG[k].color })).filter(d => d.value > 0);
    if (!data.length) return null;
    return (
        <div className="w-16 h-16 shrink-0">
            <PieChart width={64} height={64}>
                <Pie data={data} cx={32} cy={32} innerRadius={18} outerRadius={28} dataKey="value" strokeWidth={0}>
                    {data.map((d,i) => <Cell key={i} fill={d.color} />)}
                </Pie>
            </PieChart>
        </div>
    );
};

/* ── Stacked bar tooltip ─────────────────────────────────────────────────────── */
const StackedTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s: number, p: any) => s + p.value, 0);
    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-[12px]">
            <p className="font-bold text-slate-800 mb-2 truncate max-w-[180px]">{label}</p>
            {payload.map((p: any) => p.value > 0 && (
                <div key={p.name} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} /><span className="text-slate-600">{p.name}</span></span>
                    <span className="font-semibold">{p.value} <span className="text-slate-400 font-normal">({Math.round(p.value/total*100)}%)</span></span>
                </div>
            ))}
        </div>
    );
};

/* ── Site card ───────────────────────────────────────────────────────────────── */
const SiteCard: React.FC<{ site: SiteNode; onSelect: (site: SiteNode) => void }> = ({ site, onSelect }) => {
    const cfg = PERF_CONFIG[site.performance];
    return (
        <button onClick={() => onSelect(site)} className={cn('rounded-xl border p-3.5 text-left w-full transition-all hover:shadow-lg hover:scale-[1.02] flex flex-col gap-2.5 group', cfg.bg, cfg.border)}>
            <div className="flex items-center gap-3">
                <RingProgress pct={site.achievement_pct} perf={site.performance} size={48} />
                <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{site.site_no}</span>
                    <p className="text-[13px] font-semibold text-slate-800 leading-tight truncate">{site.name}</p>
                    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5', cfg.badge)}>
                        <cfg.icon className="w-2.5 h-2.5" />{cfg.label}
                    </span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
            </div>
            {site.achievement_pct !== null && (
                <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                        <span>Achievement</span>
                        <span className="font-semibold" style={{ color: cfg.color }}>{site.achievement_pct}%</span>
                    </div>
                    <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(site.achievement_pct, 100)}%`, backgroundColor: cfg.color }} />
                    </div>
                </div>
            )}
            <div className="space-y-1 border-t border-white/50 pt-2">
                {site.ot_type === 'target_based' && site.daily_target > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><Target className="w-3 h-3 shrink-0" /><span>Target: {site.daily_target}/day</span></div>
                )}
                {site.responsible_person_name && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium"><User className="w-3 h-3 shrink-0 text-indigo-400" /><span className="truncate">{site.responsible_person_name}</span></div>
                )}
                {site.supervisor_name && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><Users className="w-3 h-3 shrink-0" /><span className="truncate">{site.supervisor_name}</span></div>
                )}
            </div>
        </button>
    );
};

/* ── Site Detail Modal ───────────────────────────────────────────────────────── */
const SiteDetailModal: React.FC<{ site: SiteNode; dateFrom: string; dateTo: string; onClose: () => void }> = ({ site, dateFrom, dateTo, onClose }) => {
    const [detail, setDetail] = useState<SiteDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const cfg = PERF_CONFIG[site.performance];

    useEffect(() => {
        api.get(`/analytics/service-site-detail/${site.id}`, { params: { date_from: dateFrom, date_to: dateTo } })
            .then(r => setDetail(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [site.id, dateFrom, dateTo]);

    const isTargetBased = site.ot_type === 'target_based';

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className={cn('px-6 py-4 flex items-start justify-between gap-3 border-b border-slate-100', cfg.bg)}>
                    <div className="flex items-center gap-3 min-w-0">
                        <RingProgress pct={site.achievement_pct} perf={site.performance} size={52} />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{site.site_no}</span>
                                <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', cfg.badge)}>{cfg.label}</span>
                            </div>
                            <p className="text-[17px] font-bold text-slate-900 leading-tight truncate">{site.name}</p>
                            <p className="text-[12px] text-slate-500 mt-0.5">{site.service_type} · {dateFrom} → {dateTo}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white/60 rounded-xl transition-colors shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 p-5 space-y-5">
                    {loading && (
                        <div className="flex justify-center py-10">
                            <div className="w-7 h-7 rounded-full border-[3px] border-indigo-600 border-t-transparent animate-spin" />
                        </div>
                    )}

                    {detail && !loading && (
                        <>
                            {/* KPI row */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { icon: Calendar,  label: 'Active Days',   value: detail.summary.days_with_tasks, sub: `of ${detail.date_range.total_days} days` },
                                    { icon: Users,     label: 'Staff Working', value: detail.summary.unique_staff,    sub: 'unique members' },
                                    { icon: Clock,     label: 'Total Hours',   value: `${detail.summary.total_hours.toFixed(1)}h`, sub: 'recorded time' },
                                    isTargetBased
                                        ? { icon: Target,  label: 'Total Units',   value: detail.summary.total_units.toLocaleString(), sub: `target ${detail.summary.expected_units.toLocaleString()}` }
                                        : { icon: Activity, label: 'Task Records', value: detail.summary.total_records, sub: 'entries logged' },
                                ].map(({ icon: Icon, label, value, sub }) => (
                                    <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <Icon className="w-4 h-4 text-indigo-400" />
                                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
                                        </div>
                                        <p className="text-[20px] font-black text-slate-900 leading-none">{value}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Daily chart */}
                            {detail.daily.length > 0 && (
                                <div className="bg-white border border-slate-200 rounded-xl p-4">
                                    <p className="text-[13px] font-bold text-slate-800 mb-3">
                                        {isTargetBased ? 'Daily Units vs Target' : 'Daily Workers & Hours'}
                                    </p>
                                    <div className="h-[180px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            {isTargetBased ? (
                                                <BarChart data={detail.daily} barSize={14}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} />
                                                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e2e8f0' }} labelFormatter={d => `Date: ${d}`} />
                                                    {site.daily_target > 0 && <ReferenceLine y={site.daily_target} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: 'Target', fontSize: 10, fill: '#f59e0b' }} />}
                                                    <Bar dataKey="units" name="Units" fill={cfg.color} radius={[4,4,0,0]} />
                                                </BarChart>
                                            ) : (
                                                <LineChart data={detail.daily}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} />
                                                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e2e8f0' }} labelFormatter={d => `Date: ${d}`} />
                                                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                                                    <Line type="monotone" dataKey="workers" name="Workers" stroke="#6366f1" strokeWidth={2} dot={false} />
                                                    <Line type="monotone" dataKey="hours"   name="Hours"   stroke="#10b981" strokeWidth={2} dot={false} />
                                                </LineChart>
                                            )}
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* Staff table */}
                            {detail.staff.length > 0 && (
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                    <div className="px-4 py-3 border-b border-slate-100">
                                        <p className="text-[13px] font-bold text-slate-800">Staff Breakdown</p>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[12px]">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Name</th>
                                                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500">EPF</th>
                                                    <th className="text-right px-4 py-2.5 font-semibold text-slate-500">Active Days</th>
                                                    {isTargetBased && <th className="text-right px-4 py-2.5 font-semibold text-slate-500">Units</th>}
                                                    <th className="text-right px-4 py-2.5 font-semibold text-slate-500">Hours</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {detail.staff.map((s, i) => (
                                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-4 py-2.5 font-medium text-slate-800">{s.name}</td>
                                                        <td className="px-4 py-2.5 text-slate-400">{s.epf_number}</td>
                                                        <td className="px-4 py-2.5 text-right text-slate-700">{s.active_days}</td>
                                                        {isTargetBased && <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{s.total_units.toLocaleString()}</td>}
                                                        <td className="px-4 py-2.5 text-right text-slate-700">{s.total_hours.toFixed(1)}h</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {detail.daily.length === 0 && (
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-[13px] text-slate-500">
                                    No task data recorded for this period.
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ── Service-type card ───────────────────────────────────────────────────────── */
const ServiceTypeCard: React.FC<{ group: ServiceTypeGroup; expanded: boolean; onToggle: () => void; onSelectSite: (s: SiteNode) => void }> = ({ group, expanded, onToggle, onSelectSite }) => {
    const healthPct = group.site_count > 0 ? Math.round(((group.over_count + group.on_track_count) / group.site_count) * 100) : 0;
    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                        <GitBranch className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left min-w-0">
                        <p className="text-[15px] font-bold text-slate-900 truncate">{group.service_type}</p>
                        <p className="text-[12px] text-slate-500">{group.site_count} site{group.site_count !== 1 ? 's' : ''}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                    <MiniDonut group={group} />
                    <div className="hidden sm:flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                            {group.over_count > 0 && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">{group.over_count} over</span>}
                            {group.on_track_count > 0 && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{group.on_track_count} ok</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {group.under_count > 0 && <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{group.under_count} under</span>}
                            {group.no_data_count > 0 && <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{group.no_data_count} no data</span>}
                        </div>
                    </div>
                    <div className="hidden md:flex flex-col items-center gap-0.5 min-w-[48px]">
                        <span className="text-[10px] text-slate-400 font-medium">Health</span>
                        <span className={cn('text-[18px] font-black leading-none', healthPct >= 70 ? 'text-emerald-500' : healthPct >= 40 ? 'text-amber-500' : 'text-red-500')}>{healthPct}%</span>
                    </div>
                    <div className={cn('w-6 h-6 rounded-full border border-slate-200 flex items-center justify-center transition-transform', expanded ? 'rotate-180' : '')}>
                        <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </div>
            </button>
            {expanded && (
                <div className="px-5 pb-5 border-t border-slate-100">
                    <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {group.sites.map(site => <SiteCard key={site.id} site={site} onSelect={onSelectSite} />)}
                    </div>
                </div>
            )}
        </div>
    );
};

/* ── Main ────────────────────────────────────────────────────────────────────── */
const ServiceMindmap: React.FC = () => {
    const today = new Date();
    const [dateMode, setDateMode]       = useState<DateMode>('this_month');
    const [customFrom, setCustomFrom]   = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
    const [customTo, setCustomTo]       = useState(format(today, 'yyyy-MM-dd'));
    const [data, setData]               = useState<MindmapData | null>(null);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState<string | null>(null);
    const [expanded, setExpanded]       = useState<Set<string>>(new Set());
    const [perfFilter, setPerfFilter]   = useState<string>('all');
    const [selectedSite, setSelectedSite] = useState<SiteNode | null>(null);

    const { from, to } = getDateRange(dateMode, customFrom, customTo);

    const load = useCallback(async () => {
        if (dateMode === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
        setLoading(true); setError(null);
        try {
            const res = await api.get('/analytics/service-mindmap', { params: { date_from: from, date_to: to } });
            setData(res.data);
            setExpanded(new Set(res.data.service_types.map((g: ServiceTypeGroup) => g.service_type)));
        } catch { setError('Failed to load service analysis.'); }
        finally { setLoading(false); }
    }, [from, to, dateMode, customFrom, customTo]);

    useEffect(() => { load(); }, [load]);

    const toggle      = (key: string) => setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    const expandAll   = () => data && setExpanded(new Set(data.service_types.map(g => g.service_type)));
    const collapseAll = () => setExpanded(new Set());

    const filteredGroups = (data?.service_types ?? []).map(g => ({
        ...g, sites: perfFilter === 'all' ? g.sites : g.sites.filter(s => s.performance === perfFilter),
    })).filter(g => g.sites.length > 0);

    const summary = data ? data.service_types.reduce(
        (acc, g) => ({ over: acc.over + g.over_count, on_track: acc.on_track + g.on_track_count, under: acc.under + g.under_count, no_data: acc.no_data + g.no_data_count }),
        { over: 0, on_track: 0, under: 0, no_data: 0 }
    ) : null;

    const donutData = summary ? PERF_KEYS.map(k => ({ name: PERF_CONFIG[k].label, value: summary[k], color: PERF_CONFIG[k].color })).filter(d => d.value > 0) : [];
    const barData = (data?.service_types ?? []).map(g => ({
        name: g.service_type.length > 14 ? g.service_type.slice(0,13) + '…' : g.service_type,
        'Over Performing': g.over_count, 'On Track': g.on_track_count,
        'Under Performing': g.under_count, 'No Data': g.no_data_count,
    }));

    return (
        <div className="space-y-5">
            {/* Header + date controls */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-[20px] font-bold text-slate-900">Service Analysis</h1>
                    {data && <p className="text-[12px] text-slate-500 mt-0.5">{data.date_range.from} → {data.date_range.to} · {data.total_sites} active sites</p>}
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    {/* Mode pills */}
                    <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                        {([['this_month','This Month'],['last_month','Last Month'],['custom','Custom']] as [DateMode,string][]).map(([m, label]) => (
                            <button key={m} onClick={() => setDateMode(m)}
                                className={cn('px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all', dateMode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                                {label}
                            </button>
                        ))}
                    </div>
                    {/* Custom pickers */}
                    {dateMode === 'custom' && (
                        <div className="flex items-center gap-2">
                            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-indigo-400" />
                            <span className="text-slate-400 text-[12px]">→</span>
                            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-indigo-400" />
                        </div>
                    )}
                    <button onClick={load} disabled={loading}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-[12px] font-medium text-slate-600 hover:bg-slate-50 shadow-sm disabled:opacity-60">
                        <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />Refresh
                    </button>
                </div>
            </div>

            {loading && <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-full border-[3px] border-indigo-600 border-t-transparent animate-spin" /></div>}
            {error && !loading && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-[13px] text-red-600">{error}</div>}

            {!loading && !error && data && (
                <>
                    {/* KPI strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {([
                            { key: 'over'     as const, label: 'Over Performing',  icon: TrendingUp,    cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
                            { key: 'on_track' as const, label: 'On Track',         icon: CheckCircle,   cls: 'text-blue-600 bg-blue-50 border-blue-200' },
                            { key: 'under'    as const, label: 'Under Performing', icon: AlertTriangle, cls: 'text-red-600 bg-red-50 border-red-200' },
                            { key: 'no_data'  as const, label: 'No Data',          icon: HelpCircle,    cls: 'text-slate-500 bg-slate-50 border-slate-200' },
                        ]).map(({ key, label, icon: Icon, cls }) => (
                            <button key={key} onClick={() => setPerfFilter(prev => prev === key ? 'all' : key)}
                                className={cn('flex items-center gap-3 p-3.5 rounded-xl border shadow-sm hover:shadow-md transition-all', cls, perfFilter === key ? 'ring-2 ring-offset-1 ring-indigo-400' : '')}>
                                <Icon className="w-5 h-5 shrink-0" />
                                <div className="text-left">
                                    <p className="text-[22px] font-black leading-none">{summary?.[key] ?? 0}</p>
                                    <p className="text-[10px] font-medium mt-0.5 leading-tight">{label}</p>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Charts row */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                            <div className="flex items-center gap-2 mb-4"><BarChart2 className="w-4 h-4 text-indigo-500" /><p className="text-[13px] font-bold text-slate-800">Overall Distribution</p></div>
                            <div className="h-[200px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                                            {donutData.map((d,i) => <Cell key={i} fill={d.color} strokeWidth={0} />)}
                                        </Pie>
                                        <Tooltip formatter={(v:any, n:string | undefined) => [v, n ?? '']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
                                {donutData.map(d => (
                                    <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                                        <span className="truncate">{d.name}</span>
                                        <span className="ml-auto font-bold text-slate-800">{d.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                            <div className="flex items-center gap-2 mb-4"><BarChart2 className="w-4 h-4 text-indigo-500" /><p className="text-[13px] font-bold text-slate-800">Performance by Service Type</p></div>
                            <div className="h-[220px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={barData} barSize={22}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <Tooltip content={<StackedTooltip />} />
                                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                        <Bar dataKey="Over Performing"  stackId="a" fill="#10b981" />
                                        <Bar dataKey="On Track"         stackId="a" fill="#3b82f6" />
                                        <Bar dataKey="Under Performing" stackId="a" fill="#ef4444" />
                                        <Bar dataKey="No Data"          stackId="a" fill="#cbd5e1" radius={[4,4,0,0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 text-[12px]">
                        <button onClick={expandAll}   className="text-indigo-600 hover:underline font-medium">Expand all</button>
                        <span className="text-slate-300">·</span>
                        <button onClick={collapseAll} className="text-indigo-600 hover:underline font-medium">Collapse all</button>
                        {perfFilter !== 'all' && (<><span className="text-slate-300">·</span><button onClick={() => setPerfFilter('all')} className="text-slate-500 hover:underline">Clear filter</button></>)}
                    </div>

                    {filteredGroups.length === 0 && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-[13px] text-slate-500">No sites match the selected filter.</div>
                    )}

                    <div className="space-y-4">
                        {filteredGroups.map(group => (
                            <ServiceTypeCard key={group.service_type} group={group}
                                expanded={expanded.has(group.service_type)} onToggle={() => toggle(group.service_type)}
                                onSelectSite={setSelectedSite} />
                        ))}
                    </div>

                    {/* Legend */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Performance Thresholds · Click any site card to view details</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {PERF_KEYS.map(key => {
                                const cfg = PERF_CONFIG[key];
                                return (
                                    <div key={key} className={cn('flex items-center gap-2 p-2.5 rounded-lg border', cfg.bg, cfg.border)}>
                                        <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                                        <div>
                                            <p className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded-full', cfg.badge)}>{cfg.label}</p>
                                            {key === 'over'     && <p className="text-[10px] text-slate-400 mt-0.5">≥ 110%</p>}
                                            {key === 'on_track' && <p className="text-[10px] text-slate-400 mt-0.5">90 – 110%</p>}
                                            {key === 'under'    && <p className="text-[10px] text-slate-400 mt-0.5">&lt; 90%</p>}
                                            {key === 'no_data'  && <p className="text-[10px] text-slate-400 mt-0.5">No tasks recorded</p>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {/* Site detail modal */}
            {selectedSite && (
                <SiteDetailModal site={selectedSite} dateFrom={from} dateTo={to} onClose={() => setSelectedSite(null)} />
            )}
        </div>
    );
};

export default ServiceMindmap;
