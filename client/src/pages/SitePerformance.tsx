import React, { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Site } from '../types';
import { format, startOfMonth, subMonths } from 'date-fns';
import {
    MapPin, Target, Users, TrendingUp, Award,
    Calendar, BarChart3, AlertTriangle, CheckCircle
} from 'lucide-react';
import {
    ResponsiveContainer,
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    BarChart, Bar, LabelList, ReferenceLine
} from 'recharts';

// ─── Shared components ──────────────────────────────────────────────────────

const MetricCard: React.FC<{
    label: string; value: string | number; sub?: string;
    icon: React.ElementType; iconBg: string; iconColor: string;
}> = ({ label, value, sub, icon: Icon, iconBg, iconColor }) => (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className={`w-9 h-9 ${iconBg} rounded-lg flex items-center justify-center mb-3`}>
            <Icon className={`w-4.5 h-4.5 ${iconColor}`} />
        </div>
        <p className="text-2xl font-black text-slate-900">{value}</p>
        <p className="text-xs font-semibold text-slate-500 mt-0.5 uppercase tracking-wider">{label}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
);

const ChartCard: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
    <div className={`card p-5 ${className}`}>
        <h3 className="text-sm font-bold text-slate-700 mb-4">{title}</h3>
        {children}
    </div>
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

// ─── Main Page ───────────────────────────────────────────────────────────────

const SitePerformance: React.FC = () => {
    const { role } = useAuth();
    const defaultFrom = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');
    const defaultTo = format(new Date(), 'yyyy-MM-dd');

    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState('');
    const [dateFrom, setDateFrom] = useState(defaultFrom);
    const [dateTo, setDateTo] = useState(defaultTo);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    if (role !== 'system_admin') return <Navigate to="/" replace />;

    // Load target-based sites
    useEffect(() => {
        api.get('/sites').then(res => {
            const targetSites = (res.data || []).filter((s: Site) => s.OT_TYPE === 'target_based');
            setSites(targetSites);
            if (targetSites.length > 0) setSelectedSiteId(String(targetSites[0].ID));
        }).catch(console.error);
    }, []);

    const fetchData = useCallback(async () => {
        if (!selectedSiteId) return;
        setLoading(true);
        setData(null);
        try {
            const res = await api.get('/analytics/site-performance', {
                params: { site_id: selectedSiteId, date_from: dateFrom, date_to: dateTo }
            });
            setData(res.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [selectedSiteId, dateFrom, dateTo]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const selectedSite = sites.find(s => String(s.ID) === selectedSiteId);

    return (
        <div className="space-y-5 pb-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Target vs Performance</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Site-wise staff performance analysis against targets</p>
                </div>
                {selectedSite && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-100 rounded-xl text-sm font-semibold text-rose-700">
                        <MapPin className="w-3.5 h-3.5 text-rose-500" />
                        {selectedSite.NAME}
                    </span>
                )}
            </div>

            {/* Filters */}
            <div className="card p-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Site</label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select
                                value={selectedSiteId}
                                onChange={e => setSelectedSiteId(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                            >
                                <option value="">Select a site...</option>
                                {sites.map(s => (
                                    <option key={s.ID} value={s.ID}>{s.SITE_NO} — {s.NAME}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">From Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-rose-500 focus:border-transparent" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">To Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-rose-500 focus:border-transparent" />
                        </div>
                    </div>
                </div>
            </div>

            {/* No site selected */}
            {!selectedSiteId && (
                <div className="card py-16 text-center">
                    <MapPin className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-base font-semibold text-slate-900 mb-1">Select a site to begin</p>
                    <p className="text-sm text-slate-500">Choose a target-based site from the dropdown above</p>
                </div>
            )}

            {/* Loading */}
            {selectedSiteId && loading && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
                    </div>
                    <div className="skeleton h-80 rounded-2xl" />
                </div>
            )}

            {/* Data */}
            {!loading && data && (
                <div className="space-y-5">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        <MetricCard label="Staff" value={data.summary.staffCount} icon={Users} iconBg="bg-indigo-50" iconColor="text-indigo-600" />
                        <MetricCard label="Total Count" value={data.summary.totalActual.toLocaleString()} icon={BarChart3} iconBg="bg-orange-50" iconColor="text-orange-600" />
                        <MetricCard label="Total Target" value={data.summary.totalTarget.toLocaleString()} icon={Target} iconBg="bg-slate-100" iconColor="text-slate-600" />
                        <MetricCard
                            label="Extra Units"
                            value={data.summary.totalExtra.toLocaleString()}
                            icon={TrendingUp}
                            iconBg="bg-emerald-50"
                            iconColor="text-emerald-600"
                            sub="Above target"
                        />
                        <MetricCard
                            label="Avg Achievement"
                            value={`${data.summary.avgAchievement}%`}
                            icon={Award}
                            iconBg={data.summary.avgAchievement >= 100 ? 'bg-emerald-50' : data.summary.avgAchievement >= 80 ? 'bg-amber-50' : 'bg-rose-50'}
                            iconColor={data.summary.avgAchievement >= 100 ? 'text-emerald-600' : data.summary.avgAchievement >= 80 ? 'text-amber-500' : 'text-rose-500'}
                        />
                    </div>

                    {/* Daily Trend Chart */}
                    <ChartCard title="Daily Actual Count vs Target">
                        {data.dailyTrend.length === 0 ? <EmptyChart message="No tasks in this period" /> : (() => {
                            const dailyTarget = (data.siteInfo.daily_target || 0) * (data.summary.staffCount || 0);
                            const chartData = data.dailyTrend.map((d: any) => ({ ...d, target: dailyTarget }));
                            return (
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Line type="monotone" dataKey="actual" name="Actual Count" stroke="#6366f1" strokeWidth={2.5} dot={data.dailyTrend.length <= 31 ? { r: 3 } : false} activeDot={{ r: 5 }} />
                                        <Line type="monotone" dataKey="target" name={`Target (${data.siteInfo.daily_target} × ${data.summary.staffCount} staff)`} stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            );
                        })()}
                    </ChartCard>

                    {/* Per-staff bar chart + over/under performers */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Staff count bar chart */}
                        <ChartCard title="Staff Count vs Target">
                            {data.staffBreakdown.length === 0 ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart
                                        data={data.staffBreakdown.slice(0, 15)}
                                        layout="vertical"
                                        margin={{ top: 4, right: 40, left: 4, bottom: 4 }}
                                        barSize={10}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                                        <YAxis type="category" dataKey="staff_name" tick={{ fontSize: 10 }} width={90} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Bar dataKey="sum_count" name="Actual" fill="#6366f1" radius={[0, 4, 4, 0]}>
                                            <LabelList dataKey="sum_count" position="right" style={{ fontSize: 9, fontWeight: 700 }} />
                                        </Bar>
                                        <Bar dataKey="total_target" name="Target" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
                                        <ReferenceLine x={0} stroke="#94a3b8" />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        {/* Over / Under performers */}
                        <div className="space-y-4">
                            {/* Overperformers */}
                            <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5">
                                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    Overperformers
                                    <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">{data.overperformers.length}</span>
                                </h3>
                                {data.overperformers.length === 0 ? (
                                    <p className="text-xs text-slate-400 py-3 text-center">No overperformers in this period</p>
                                ) : (
                                    <div className="space-y-2">
                                        {data.overperformers.map((p: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-xs font-bold text-slate-400 w-5 shrink-0">#{i + 1}</span>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-semibold text-slate-900 truncate">{p.staff_name}</p>
                                                        <p className="text-[10px] text-slate-400">{p.sum_count} / {p.total_target}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-sm font-bold text-emerald-600">{p.achievement_pct}%</p>
                                                    <p className="text-[10px] text-emerald-500">+{p.extra_units} extra</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Underperformers */}
                            <div className="bg-white rounded-2xl border border-rose-100 shadow-sm p-5">
                                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                                    Underperformers
                                    <span className="text-xs text-rose-600 font-semibold bg-rose-50 px-2 py-0.5 rounded-full">{data.underperformers.length}</span>
                                </h3>
                                {data.underperformers.length === 0 ? (
                                    <p className="text-xs text-slate-400 py-3 text-center">All staff met targets</p>
                                ) : (
                                    <div className="space-y-2">
                                        {data.underperformers.map((p: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-xs font-bold text-slate-400 w-5 shrink-0">#{i + 1}</span>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-semibold text-slate-900 truncate">{p.staff_name}</p>
                                                        <p className="text-[10px] text-slate-400">{p.sum_count} / {p.total_target}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-sm font-bold text-rose-500">{p.achievement_pct}%</p>
                                                    <p className="text-[10px] text-slate-400">{p.total_target - p.sum_count} short</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Full Staff Breakdown Table */}
                    <div className="card overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-700">Full Staff Breakdown</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100">
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">#</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">EPF</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Count</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Target</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-emerald-600 uppercase tracking-wider">Extra Units</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Achievement</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {data.staffBreakdown.map((row: any, i: number) => (
                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 text-xs text-slate-400 font-bold">{i + 1}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500 font-mono">{row.epf_number}</td>
                                            <td className="px-4 py-3 text-sm font-semibold text-slate-900">{row.staff_name}</td>
                                            <td className="px-4 py-3 text-right text-sm font-bold text-indigo-600">{row.sum_count.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-sm text-slate-500">{row.total_target.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-sm font-bold text-emerald-600">{row.extra_units > 0 ? `+${row.extra_units}` : 0}</td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="w-16 bg-slate-100 rounded-full h-1.5">
                                                        <div
                                                            className={`h-1.5 rounded-full ${row.achievement_pct >= 100 ? 'bg-emerald-500' : row.achievement_pct >= 80 ? 'bg-amber-400' : 'bg-rose-400'}`}
                                                            style={{ width: `${Math.min(row.achievement_pct, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className={`text-sm font-bold min-w-[42px] text-right ${row.achievement_pct >= 100 ? 'text-emerald-600' : row.achievement_pct >= 80 ? 'text-amber-500' : 'text-rose-500'}`}>
                                                        {row.achievement_pct}%
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                                        <td colSpan={3} className="px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Total</td>
                                        <td className="px-4 py-3 text-right text-sm font-black text-indigo-700">{data.summary.totalActual.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-sm font-black text-slate-700">{data.summary.totalTarget.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-sm font-black text-emerald-700">+{data.summary.totalExtra.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`text-sm font-black ${data.summary.avgAchievement >= 100 ? 'text-emerald-600' : data.summary.avgAchievement >= 80 ? 'text-amber-500' : 'text-rose-500'}`}>
                                                {data.summary.avgAchievement}% avg
                                            </span>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Achievement Distribution */}
                    {data.staffBreakdown.length > 0 && (
                        <ChartCard title="Staff Achievement % Distribution">
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart
                                    data={data.staffBreakdown.slice(0, 20)}
                                    barSize={18}
                                    margin={{ top: 8, right: 16, left: 0, bottom: 40 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="staff_name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                                    <YAxis tick={{ fontSize: 10 }} domain={[0, 'dataMax + 10']} unit="%" />
                                    <Tooltip content={<CustomTooltip />} />
                                    <ReferenceLine y={100} stroke="#10b981" strokeDasharray="4 3" label={{ value: '100%', fill: '#10b981', fontSize: 10 }} />
                                    <Bar dataKey="achievement_pct" name="Achievement %" radius={[4, 4, 0, 0]}
                                        fill="#6366f1"
                                        label={false}
                                    >
                                        {data.staffBreakdown.slice(0, 20).map((_: any, index: number) => {
                                            const pct = data.staffBreakdown[index]?.achievement_pct || 0;
                                            return <rect key={index} fill={pct >= 100 ? '#10b981' : pct >= 80 ? '#f59e0b' : '#f43f5e'} />;
                                        })}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                            <div className="flex items-center gap-4 mt-3 justify-center text-xs text-slate-500">
                                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />≥ 100%</span>
                                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" />80–99%</span>
                                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-rose-400 inline-block" />&lt; 80%</span>
                            </div>
                        </ChartCard>
                    )}
                </div>
            )}

            {/* No data state */}
            {!loading && data && data.staffBreakdown.length === 0 && (
                <div className="card py-16 text-center">
                    <Target className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-base font-semibold text-slate-900 mb-1">No target-based tasks found</p>
                    <p className="text-sm text-slate-500">There are no target-based tasks for this site in the selected period</p>
                </div>
            )}
        </div>
    );
};

export default SitePerformance;
