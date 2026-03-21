import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import type { Site, User } from '../types';
import {
    Users, MapPin, ClipboardList, DollarSign, ArrowRight, Plus, UserPlus,
    CheckCircle, XCircle, AlertTriangle, TrendingUp, TrendingDown, BarChart3,
    FileText, Wallet, ChevronRight, Zap, ShieldAlert, ChevronDown,
    Building2, RefreshCw, Activity
} from 'lucide-react';
import { format, startOfMonth, subMonths } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, Cell, PieChart, Pie, Legend, LineChart, Line
} from 'recharts';

// ─── Shared small components ─────────────────────────────────────────────────

const fmtRs = (n: number) =>
    `Rs. ${Math.abs(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const StatCard: React.FC<{
    label: string; value: number | string; icon: React.ElementType;
    color: string; bg: string; onClick?: () => void; sub?: string;
}> = ({ label, value, icon: Icon, color, bg, onClick, sub }) => (
    <div onClick={onClick}
        className={`group relative bg-white rounded-2xl border border-slate-100 shadow-sm p-5 transition-all hover:-translate-y-0.5 hover:shadow-md ${onClick ? 'cursor-pointer' : ''}`}>
        <div className="flex items-start justify-between">
            <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${color}`} />
            </div>
            {onClick && <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" />}
        </div>
        <div className="mt-4">
            <p className="text-2xl font-black text-slate-900">{value}</p>
            <p className="text-sm text-slate-500 font-medium mt-0.5">{label}</p>
            {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
    </div>
);

const getRoleBadge = (role: string) => {
    switch (role) {
        case 'admin':      return 'bg-orange-100 text-orange-700';
        case 'supervisor': return 'bg-violet-100 text-violet-700';
        default:           return 'bg-blue-100 text-blue-700';
    }
};

const OT_LABEL: Record<string, string> = {
    time_based:      'Time Based',
    target_based:    'Target Based',
    staff_outsource: 'Staff Outsource',
};

// ─── Site Snapshot Panel ──────────────────────────────────────────────────────

const SiteSnapshot: React.FC<{ siteId: number; siteName: string }> = ({ siteId }) => {
    const [data, setData]     = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab]       = useState<'overview' | 'staff' | 'tasks' | 'invoices'>('overview');
    const navigate            = useNavigate();

    const load = useCallback(async () => {
        setLoading(true);
        setData(null);
        try {
            const res = await api.get(`/analytics/site-snapshot/${siteId}`);
            setData(res.data);
        } catch (e) {
            console.error('site snapshot error', e);
        } finally {
            setLoading(false);
        }
    }, [siteId]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
                </div>
                <div className="skeleton h-64 rounded-2xl" />
                <div className="skeleton h-48 rounded-2xl" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="mt-4 bg-red-50 rounded-2xl p-6 text-center text-sm text-red-500 border border-red-100">
                Failed to load site data. <button onClick={load} className="underline font-semibold ml-1">Retry</button>
            </div>
        );
    }

    const site = data.site;
    const wf   = data.workforce;
    const fin  = data.financials;
    const ta   = data.taskActivity;
    const invoices: any[]       = data.invoices || [];
    const monthlyInv: any[]     = data.monthlyInvoices || [];
    const monthlyTasks: any[]   = data.taskActivity?.monthlyTasks || [];
    const taskTypes: any[]      = data.taskActivity?.taskTypes || [];

    // Pie colours for task types
    const PIE_COLORS = ['#6366f1','#10b981','#f59e0b','#3b82f6','#8b5cf6','#f43f5e','#06b6d4','#f97316'];

    return (
        <div className="mt-3 space-y-4 pb-2">

            {/* Site info header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-5 text-white flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <MapPin className="w-4 h-4 text-slate-300" />
                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">#{site.site_no}</span>
                        <span className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            site.ot_type === 'time_based'   ? 'bg-emerald-500' :
                            site.ot_type === 'target_based' ? 'bg-violet-500' : 'bg-orange-500'
                        }`}>{OT_LABEL[site.ot_type] || site.ot_type}</span>
                    </div>
                    <h2 className="text-xl font-black leading-tight">{site.name}</h2>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-300">
                        {site.service_type !== '—' && <span>🏷 {site.service_type}</span>}
                        {site.site_type    !== '—' && <span>🏢 {site.site_type}</span>}
                        {site.supervisor_name !== '—' && <span>👤 {site.supervisor_name}</span>}
                        {site.daily_target > 0 && <span>🎯 Daily target: {site.daily_target}</span>}
                    </div>
                </div>
                <button onClick={load}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="bg-blue-50 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Active Staff</p>
                    <p className="text-2xl font-black text-blue-900 mt-1">{wf.active}</p>
                    <p className="text-[10px] text-blue-400 mt-0.5">of {wf.total} total</p>
                </div>
                <div className="bg-violet-50 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wide">Monthly Salary</p>
                    <p className="text-xl font-black text-violet-900 mt-1 leading-tight">{fmtRs(wf.total_salary)}</p>
                    <p className="text-[10px] text-violet-400 mt-0.5">active staff</p>
                </div>
                <div className="bg-blue-600 rounded-xl p-4 text-white">
                    <p className="text-[10px] font-bold opacity-70 uppercase tracking-wide">Total Revenue</p>
                    <p className="text-xl font-black mt-1 leading-tight">{fmtRs(fin.totalRevenue)}</p>
                    <p className="text-[10px] opacity-60 mt-0.5">{fin.invoiceCount} invoice{fin.invoiceCount !== 1 ? 's' : ''}</p>
                </div>
                <div className={`${fin.netProfit >= 0 ? 'bg-emerald-600' : 'bg-red-600'} rounded-xl p-4 text-white`}>
                    <p className="text-[10px] font-bold opacity-70 uppercase tracking-wide">Net Profit</p>
                    <p className="text-xl font-black mt-1 leading-tight">
                        {fin.netProfit >= 0 ? '+' : '−'}{fmtRs(fin.netProfit)}
                    </p>
                    <p className="text-[10px] opacity-60 mt-0.5">{fin.profitMargin}% margin</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">OT Paid</p>
                    <p className="text-xl font-black text-amber-900 mt-1 leading-tight">{fmtRs(fin.totalOtPaid)}</p>
                    <p className="text-[10px] text-amber-400 mt-0.5">target + time</p>
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1">
                {(['overview', 'staff', 'tasks', 'invoices'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                            tab === t
                                ? 'bg-slate-800 text-white shadow-sm'
                                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
                        }`}>
                        {t === 'overview' ? 'Overview' : t === 'staff' ? `Staff (${wf.total})` : t === 'tasks' ? 'Task Activity' : `Invoices (${invoices.length})`}
                    </button>
                ))}
            </div>

            {/* ── Tab: Overview ── */}
            {tab === 'overview' && (
                <div className="space-y-4">

                    {/* Revenue vs Cost monthly trend */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <h3 className="text-sm font-bold text-slate-700 mb-4">Monthly Revenue · Cost · Profit</h3>
                        {monthlyInv.length === 0 ? (
                            <div className="flex flex-col items-center py-8 text-slate-300">
                                <BarChart3 className="w-8 h-8 mb-2" />
                                <p className="text-xs text-slate-400">No invoices generated for this site yet</p>
                                <button onClick={() => navigate('/invoices')} className="mt-2 text-xs font-semibold text-indigo-600 hover:underline">
                                    Create an invoice →
                                </button>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={monthlyInv} barSize={14} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip formatter={(val: unknown, name: string | undefined) => [fmtRs(Number(val)), name ?? '']}
                                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[3,3,0,0]} />
                                    <Bar dataKey="cost"    name="Cost"    fill="#f97316" radius={[3,3,0,0]} />
                                    <Bar dataKey="profit"  name="Profit"  radius={[3,3,0,0]}>
                                        {monthlyInv.map((e, i) => <Cell key={i} fill={e.profit >= 0 ? '#10b981' : '#ef4444'} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* Task activity trend + cost split */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                        {/* Monthly task records */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                            <h3 className="text-sm font-bold text-slate-700 mb-4">Monthly Task Records (12 mo)</h3>
                            {monthlyTasks.length === 0 ? (
                                <div className="flex flex-col items-center py-8 text-slate-300">
                                    <Activity className="w-8 h-8 mb-2" />
                                    <p className="text-xs text-slate-400">No task data yet</p>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart data={monthlyTasks} barSize={18}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="month" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
                                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                        <Bar dataKey="task_records" name="Task Records" fill="#6366f1" radius={[3,3,0,0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* Cost breakdown for this site */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                            <h3 className="text-sm font-bold text-slate-700 mb-4">Cost Composition (All Invoices)</h3>
                            {invoices.length === 0 ? (
                                <div className="flex flex-col items-center py-8 text-slate-300">
                                    <DollarSign className="w-8 h-8 mb-2" />
                                    <p className="text-xs text-slate-400">No invoice data yet</p>
                                </div>
                            ) : (() => {
                                const cv  = invoices.reduce((s, r) => s + r.cost_variant_amount, 0);
                                const sot = invoices.reduce((s, r) => s + r.salary_ot_amount, 0);
                                const exp = invoices.reduce((s, r) => s + r.expense_cost, 0);
                                const pieData = [
                                    { name: 'Cost Variants', value: cv,  fill: '#f59e0b' },
                                    { name: 'Salary + OT',   value: sot, fill: '#8b5cf6' },
                                    { name: 'Expense',       value: exp, fill: '#64748b' },
                                    { name: 'Net Profit',    value: Math.max(fin.netProfit, 0), fill: '#10b981' },
                                ].filter(d => d.value > 0);
                                return (
                                    <>
                                        <ResponsiveContainer width="100%" height={150}>
                                            <PieChart>
                                                <Pie data={pieData} dataKey="value" cx="50%" cy="50%"
                                                    innerRadius={45} outerRadius={70} paddingAngle={3}>
                                                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                                                </Pie>
                                                <Tooltip formatter={(v: unknown, n: string | undefined) => [fmtRs(Number(v)), n ?? '']}
                                                    contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="grid grid-cols-2 gap-1.5 mt-1">
                                            {pieData.map((d, i) => (
                                                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                                                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.fill }} />
                                                    <span className="text-slate-500 truncate">{d.name}</span>
                                                    <span className="font-bold text-slate-700 ml-auto">{fmtRs(d.value)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Tab: Staff ── */}
            {tab === 'staff' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-700">Staff Members</h3>
                        <div className="flex gap-2 text-xs">
                            <span className="bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">{wf.active} Active</span>
                            <span className="bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">{wf.inactive} Inactive</span>
                        </div>
                    </div>
                    {wf.staff.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-8">No staff assigned</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100">
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">EPF</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Basic Salary</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Fix Salary</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {wf.staff.map((u: any) => (
                                        <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${u.status !== 'active' ? 'opacity-60' : ''}`}>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                                        {u.name.charAt(0)}
                                                    </div>
                                                    <span className="text-sm font-semibold text-slate-900">{u.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-500 font-mono">{u.epf_number}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${getRoleBadge(u.role)}`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-semibold text-violet-700">{fmtRs(u.basic_salary)}</td>
                                            <td className="px-4 py-3 text-right text-sm text-slate-500">{u.fix_salary > 0 ? fmtRs(u.fix_salary) : '—'}</td>
                                            <td className="px-4 py-3 text-center">
                                                {u.status === 'active'
                                                    ? <span className="text-[10px] font-semibold text-emerald-600 flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3" />Active</span>
                                                    : <span className="text-[10px] font-semibold text-red-500 flex items-center justify-center gap-1"><XCircle className="w-3 h-3" />Inactive</span>
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                                        <td colSpan={3} className="px-4 py-3 text-xs font-bold text-slate-700 uppercase">Total Monthly Cost</td>
                                        <td className="px-4 py-3 text-right text-sm font-black text-violet-700">{fmtRs(wf.total_salary)}</td>
                                        <td colSpan={2} />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Tab: Tasks ── */}
            {tab === 'tasks' && (
                <div className="space-y-4">

                    {/* Summary row */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-indigo-50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-black text-indigo-900">{ta.totalTaskRecords.toLocaleString()}</p>
                            <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide mt-1">Task Records</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-black text-amber-900">{ta.totalUnits.toLocaleString()}</p>
                            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mt-1">
                                {ta.isTimeBased ? 'Staff Days' : 'Total Units'}
                            </p>
                        </div>
                        <div className="bg-emerald-50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-black text-emerald-900">{taskTypes.length}</p>
                            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mt-1">Task Types</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                        {/* Task type breakdown */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                            <h3 className="text-sm font-bold text-slate-700 mb-4">Task Type Distribution</h3>
                            {taskTypes.length === 0 ? (
                                <div className="text-center py-6 text-slate-400 text-xs">No task data</div>
                            ) : (
                                <>
                                    <ResponsiveContainer width="100%" height={160}>
                                        <PieChart>
                                            <Pie data={taskTypes} dataKey="records" nameKey="task_type"
                                                cx="50%" cy="50%" outerRadius={70} paddingAngle={2}
                                                label={({ name, percent }) => `${name} ${((percent ?? 0)*100).toFixed(0)}%`}
                                                labelLine={false} fontSize={9}>
                                                {taskTypes.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="space-y-1.5 mt-2">
                                        {taskTypes.slice(0, 6).map((t: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                                    <span className="text-slate-600 capitalize font-medium">{t.task_type}</span>
                                                </div>
                                                <div className="flex gap-3">
                                                    <span className="text-slate-500">{t.records} records</span>
                                                    <span className="font-bold text-indigo-700">
                                                        {t.total_units.toLocaleString()} {ta.isTimeBased ? 'days' : 'units'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Monthly task records line */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                            <h3 className="text-sm font-bold text-slate-700 mb-4">Monthly Task Trend</h3>
                            {monthlyTasks.length === 0 ? (
                                <div className="text-center py-6 text-slate-400 text-xs">No task data</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <LineChart data={monthlyTasks}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="month" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Line type="monotone" dataKey="task_records" name="Records" stroke="#6366f1" strokeWidth={2.5}
                                            dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                        <Line type="monotone" dataKey="workers" name="Workers" stroke="#10b981" strokeWidth={2}
                                            dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Tab: Invoices ── */}
            {tab === 'invoices' && (
                <div className="space-y-4">

                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-blue-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Total Revenue</p>
                            <p className="text-lg font-black text-blue-900 mt-1">{fmtRs(fin.totalRevenue)}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Total Cost</p>
                            <p className="text-lg font-black text-slate-800 mt-1">{fmtRs(fin.totalCost)}</p>
                        </div>
                        <div className={`${fin.netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'} rounded-xl p-3`}>
                            <p className={`text-[10px] font-bold uppercase tracking-wide ${fin.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Net Profit</p>
                            <p className={`text-lg font-black mt-1 ${fin.netProfit >= 0 ? 'text-emerald-900' : 'text-red-900'}`}>
                                {fin.netProfit >= 0 ? '+' : '−'}{fmtRs(fin.netProfit)}
                            </p>
                        </div>
                        <div className="bg-violet-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wide">Avg Invoice</p>
                            <p className="text-lg font-black text-violet-900 mt-1">{fmtRs(fin.avgInvoice)}</p>
                        </div>
                    </div>

                    {/* Invoice table */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-700">Invoice History</h3>
                            <span className="text-xs text-slate-400">{invoices.length} records</span>
                        </div>
                        {invoices.length === 0 ? (
                            <div className="py-10 text-center text-slate-400">
                                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                <p className="text-sm">No invoices yet</p>
                                <button onClick={() => navigate('/invoices')} className="mt-2 text-xs font-semibold text-indigo-600 hover:underline">
                                    Create first invoice →
                                </button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Period</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-blue-600 uppercase tracking-wider">Revenue</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-amber-600 uppercase tracking-wider hidden md:table-cell">Variants</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-violet-600 uppercase tracking-wider hidden md:table-cell">Salary+OT</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Cost</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Profit/Loss</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Margin</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {invoices.map((inv: any) => {
                                            const ok     = inv.profit >= 0;
                                            const margin = inv.revenue > 0 ? Math.round((inv.profit / inv.revenue) * 100) : 0;
                                            return (
                                                <tr key={inv.id} className={`hover:bg-slate-50 transition-colors ${!ok ? 'bg-red-50/30' : ''}`}>
                                                    <td className="px-4 py-3">
                                                        <p className="text-xs font-semibold text-slate-800">{inv.date_from} → {inv.date_to}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-sm font-bold text-blue-700">{fmtRs(inv.revenue)}</td>
                                                    <td className="px-4 py-3 text-right text-xs text-amber-700 hidden md:table-cell">{fmtRs(inv.cost_variant_amount)}</td>
                                                    <td className="px-4 py-3 text-right text-xs text-violet-700 hidden md:table-cell">{fmtRs(inv.salary_ot_amount)}</td>
                                                    <td className="px-4 py-3 text-right text-sm font-semibold text-slate-600">{fmtRs(inv.total_cost)}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`text-sm font-black ${ok ? 'text-emerald-700' : 'text-red-600'}`}>
                                                            {ok ? '+' : '−'}{fmtRs(inv.profit)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`text-xs font-bold ${ok ? 'text-emerald-600' : 'text-red-500'}`}>{margin}%</span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 border-slate-200">
                                            <td className="px-4 py-3 text-xs font-bold text-slate-700 uppercase">Total</td>
                                            <td className="px-4 py-3 text-right text-sm font-black text-blue-700">{fmtRs(fin.totalRevenue)}</td>
                                            <td className="px-4 py-3 text-right text-sm font-black text-amber-700 hidden md:table-cell">
                                                {fmtRs(invoices.reduce((s: number, r: any) => s + r.cost_variant_amount, 0))}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-black text-violet-700 hidden md:table-cell">
                                                {fmtRs(invoices.reduce((s: number, r: any) => s + r.salary_ot_amount, 0))}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-black text-slate-700">{fmtRs(fin.totalCost)}</td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`text-sm font-black ${fin.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                    {fin.netProfit >= 0 ? '+' : '−'}{fmtRs(fin.netProfit)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`text-xs font-black ${fin.netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {fin.profitMargin}%
                                                </span>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const { role } = useAuth();

    const [loading, setLoading]   = useState(true);
    const [stats, setStats]       = useState({ totalSites: 0, totalStaff: 0, totalSupervisors: 0, totalTasks: 0 });
    const [usersList, setUsersList] = useState<User[]>([]);
    const [sitesList, setSitesList] = useState<Site[]>([]);

    // System admin financial overview
    const [bizData, setBizData]     = useState<any>(null);
    const [bizLoading, setBizLoading] = useState(false);

    // Site selector for snapshot
    const [selectedSiteId, setSelectedSiteId]     = useState<number | null>(null);
    const [selectedSiteName, setSelectedSiteName] = useState<string>('');
    const [dropdownOpen, setDropdownOpen]         = useState(false);

    useEffect(() => {
        const loadStats = async () => {
            try {
                const [sitesRes, usersRes, tasksRes] = await Promise.all([
                    api.get('/sites'),
                    api.get('/users'),
                    api.get('/tasks', {
                        params: {
                            date_from: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'),
                            date_to:   format(new Date(), 'yyyy-MM-dd'),
                        },
                    }),
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
            } catch (e) {
                console.error('Failed to load dashboard stats', e);
            } finally {
                setLoading(false);
            }
        };
        loadStats();
    }, []);

    useEffect(() => {
        if (role !== 'system_admin') return;
        setBizLoading(true);
        api.get('/analytics/invoice-analysis')
            .then(r => setBizData(r.data))
            .catch(e => console.error('biz data error', e))
            .finally(() => setBizLoading(false));
    }, [role]);

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

    // ── System Admin Dashboard ────────────────────────────────────────────────
    if (role === 'system_admin') {
        const sm       = bizData?.summary || {};
        const topSites: any[] = (bizData?.topByRevenue || []).slice(0, 6);
        const lossSites: any[] = bizData?.lossSites || [];
        const allSites: any[]  = bizData?.sites || [];
        const monthlyTrend: any[] = (bizData?.monthlyTrend || []).slice(-6);
        const hasInvoiceData = (sm.total_invoices || 0) > 0;

        const siteChartData = [...allSites]
            .sort((a, b) => b.total_revenue - a.total_revenue)
            .slice(0, 8)
            .map(s => ({ name: s.site_no, revenue: s.total_revenue, cost: s.total_cost, profit: s.net_profit }));

        return (
            <div className="space-y-5 pb-6">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-black text-slate-900">Business Dashboard</h1>
                        <p className="text-slate-500 text-sm mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {flaggedUsers.length > 0 && (
                            <button onClick={() => navigate('/users')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {flaggedUsers.length} Flagged Staff
                            </button>
                        )}
                        {lossSites.length > 0 && (
                            <button onClick={() => navigate('/analytics')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
                                <TrendingDown className="w-3.5 h-3.5" />
                                {lossSites.length} Loss Site{lossSites.length > 1 ? 's' : ''}
                            </button>
                        )}
                        <button onClick={() => navigate('/analytics')}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-full text-xs font-semibold hover:bg-indigo-700 transition-colors">
                            <BarChart3 className="w-3.5 h-3.5" /> Full Analytics
                        </button>
                    </div>
                </div>

                {/* Workforce KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Active Sites"     value={stats.totalSites}       icon={MapPin}        color="text-blue-600"    bg="bg-blue-50"    onClick={() => navigate('/sites')} />
                    <StatCard label="Staff Members"    value={stats.totalStaff}       icon={Users}         color="text-emerald-600" bg="bg-emerald-50" onClick={() => navigate('/users')} />
                    <StatCard label="Supervisors"      value={stats.totalSupervisors} icon={UserPlus}      color="text-violet-600"  bg="bg-violet-50"  onClick={() => navigate('/users')} />
                    <StatCard label="Tasks This Month" value={stats.totalTasks}       icon={ClipboardList} color="text-orange-600"  bg="bg-orange-50"  onClick={() => navigate('/tasks')} />
                </div>

                {/* ── Site Snapshot Selector ── */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                                <MapPin className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-slate-900">Site Deep Dive</h2>
                                <p className="text-[11px] text-slate-400">Select a site to see full staff, task, and financial analysis</p>
                            </div>
                        </div>

                        {/* Dropdown */}
                        <div className="relative sm:ml-auto">
                            <button
                                onClick={() => setDropdownOpen(o => !o)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 transition-all min-w-[220px] justify-between">
                                <span className="truncate">{selectedSiteName || 'Select a site…'}</span>
                                <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {dropdownOpen && (
                                <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl w-64 max-h-64 overflow-y-auto">
                                    <div className="p-1">
                                        <button
                                            onClick={() => { setSelectedSiteId(null); setSelectedSiteName(''); setDropdownOpen(false); }}
                                            className="w-full text-left px-3 py-2 rounded-xl text-sm text-slate-400 hover:bg-slate-50 transition-colors">
                                            — Clear selection
                                        </button>
                                        {sitesList.map(site => (
                                            <button
                                                key={site.ID}
                                                onClick={() => {
                                                    setSelectedSiteId(site.ID);
                                                    setSelectedSiteName(`${site.SITE_NO} – ${site.NAME}`);
                                                    setDropdownOpen(false);
                                                }}
                                                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                                                    selectedSiteId === site.ID
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'hover:bg-slate-50 text-slate-700'
                                                }`}>
                                                <p className="text-sm font-semibold leading-none">#{site.SITE_NO} — {site.NAME}</p>
                                                {site.OT_TYPE && (
                                                    <p className={`text-[10px] mt-0.5 ${selectedSiteId === site.ID ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                        {OT_LABEL[site.OT_TYPE] || site.OT_TYPE}
                                                    </p>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Click-outside close */}
                    {dropdownOpen && (
                        <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                    )}

                    {/* Snapshot panel */}
                    {selectedSiteId !== null && (
                        <SiteSnapshot key={selectedSiteId} siteId={selectedSiteId} siteName={selectedSiteName} />
                    )}

                    {selectedSiteId === null && (
                        <div className="flex flex-col items-center py-8 text-slate-300">
                            <Building2 className="w-10 h-10 mb-2" />
                            <p className="text-sm text-slate-400">Choose a site from the dropdown above to view its full analysis</p>
                        </div>
                    )}
                </div>

                {/* Financial KPIs */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-emerald-600" />
                            Financial Overview
                            <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">All-time invoices</span>
                        </h2>
                        <button onClick={() => navigate('/invoices')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                            View Invoices <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {bizLoading ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            <div className="bg-blue-600 rounded-xl p-4 text-white">
                                <div className="flex items-center justify-between mb-2">
                                    <DollarSign className="w-5 h-5 opacity-80" />
                                    <span className="text-[10px] font-semibold opacity-70 uppercase tracking-wide">Revenue</span>
                                </div>
                                <p className="text-xl font-black leading-tight">{fmtRs(sm.total_revenue || 0)}</p>
                                <p className="text-[11px] opacity-70 mt-1">{sm.total_invoices || 0} invoices</p>
                            </div>
                            <div className="bg-slate-600 rounded-xl p-4 text-white">
                                <div className="flex items-center justify-between mb-2">
                                    <TrendingDown className="w-5 h-5 opacity-80" />
                                    <span className="text-[10px] font-semibold opacity-70 uppercase tracking-wide">Total Cost</span>
                                </div>
                                <p className="text-xl font-black leading-tight">{fmtRs(sm.total_cost || 0)}</p>
                                <p className="text-[11px] opacity-70 mt-1">Salary + OT + Exp</p>
                            </div>
                            <div className={`${(sm.net_profit || 0) >= 0 ? 'bg-emerald-600' : 'bg-red-600'} rounded-xl p-4 text-white`}>
                                <div className="flex items-center justify-between mb-2">
                                    <TrendingUp className="w-5 h-5 opacity-80" />
                                    <span className="text-[10px] font-semibold opacity-70 uppercase tracking-wide">Net Profit</span>
                                </div>
                                <p className="text-xl font-black leading-tight">
                                    {(sm.net_profit || 0) >= 0 ? '+' : '−'}{fmtRs(sm.net_profit || 0)}
                                </p>
                                <p className="text-[11px] opacity-70 mt-1">{sm.profit_margin || 0}% margin</p>
                            </div>
                            <div className="bg-violet-600 rounded-xl p-4 text-white">
                                <div className="flex items-center justify-between mb-2">
                                    <FileText className="w-5 h-5 opacity-80" />
                                    <span className="text-[10px] font-semibold opacity-70 uppercase tracking-wide">Avg Invoice</span>
                                </div>
                                <p className="text-xl font-black leading-tight">{fmtRs(sm.avg_invoice_value || 0)}</p>
                                <p className="text-[11px] opacity-70 mt-1">{sm.site_count || 0} billing sites</p>
                            </div>
                            <div className="bg-slate-800 rounded-xl p-4 text-white">
                                <div className="flex items-center justify-between mb-2">
                                    <Building2 className="w-5 h-5 opacity-80" />
                                    <span className="text-[10px] font-semibold opacity-70 uppercase tracking-wide">Site Health</span>
                                </div>
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-xl font-black text-emerald-400">{sm.profitable_sites || 0}</span>
                                    <span className="text-sm text-slate-400">/</span>
                                    <span className="text-xl font-black text-red-400">{sm.loss_sites || 0}</span>
                                </div>
                                <p className="text-[11px] opacity-70 mt-1">Profitable / Loss</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Revenue vs Cost Chart + Top Sites */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-700">Revenue vs Cost by Site</h3>
                            <button onClick={() => navigate('/analytics')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                                Deep dive <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        {bizLoading ? <div className="skeleton h-56 rounded-xl" /> :
                         !hasInvoiceData ? (
                            <div className="flex flex-col items-center justify-center h-56 text-slate-300">
                                <BarChart3 className="w-10 h-10 mb-2" />
                                <p className="text-xs text-slate-400">No invoices generated yet</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={siteChartData} barSize={14} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip formatter={(val: unknown, name: string | undefined) => [fmtRs(Number(val)), name ?? '']}
                                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[3,3,0,0]} />
                                    <Bar dataKey="cost"    name="Cost"    fill="#f97316" radius={[3,3,0,0]} />
                                    <Bar dataKey="profit"  name="Profit"  radius={[3,3,0,0]}>
                                        {siteChartData.map((entry, i) => <Cell key={i} fill={entry.profit >= 0 ? '#10b981' : '#ef4444'} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                                <Zap className="w-4 h-4 text-amber-500" /> Top Sites
                            </h3>
                            <button onClick={() => navigate('/analytics')} className="text-xs text-slate-400 hover:text-indigo-600">See all</button>
                        </div>
                        {bizLoading ? (
                            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
                        ) : topSites.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-6">No invoice data yet</p>
                        ) : (
                            <div className="space-y-2">
                                {topSites.map((site, i) => (
                                    <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0 ${
                                                i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-orange-400' : 'bg-slate-300'
                                            }`}>{i + 1}</div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-slate-800 leading-none truncate">{site.site_no}</p>
                                                <p className="text-[10px] text-slate-400 truncate">{site.site_name}</p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 ml-2">
                                            <p className="text-xs font-black text-blue-700">{fmtRs(site.total_revenue)}</p>
                                            <p className={`text-[10px] font-semibold ${site.net_profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {site.net_profit >= 0 ? '+' : '−'}{fmtRs(site.net_profit)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Monthly Trend + Loss Alerts */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <h3 className="text-sm font-bold text-slate-700 mb-4">Monthly Revenue Trend (last 6 months)</h3>
                        {bizLoading ? <div className="skeleton h-44 rounded-xl" /> :
                         monthlyTrend.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-44 text-slate-300">
                                <BarChart3 className="w-8 h-8 mb-2" />
                                <p className="text-xs text-slate-400">No monthly data yet</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={monthlyTrend} barSize={18} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip formatter={(val: unknown, name: string | undefined) => [fmtRs(Number(val)), name ?? '']}
                                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar dataKey="total_revenue" name="Revenue"    fill="#3b82f6" radius={[3,3,0,0]} />
                                    <Bar dataKey="total_cost"    name="Cost"       fill="#f97316" radius={[3,3,0,0]} />
                                    <Bar dataKey="net_profit"    name="Net Profit" radius={[3,3,0,0]}>
                                        {monthlyTrend.map((entry, i) => <Cell key={i} fill={entry.net_profit >= 0 ? '#10b981' : '#ef4444'} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center">
                                <ShieldAlert className="w-4 h-4 text-red-500" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-700">Loss-Making Sites</h3>
                        </div>
                        {bizLoading ? (
                            <div className="space-y-2 flex-1">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
                        ) : lossSites.length === 0 ? (
                            <div className="flex flex-col items-center justify-center flex-1 py-4">
                                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mb-2">
                                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                                </div>
                                <p className="text-sm font-semibold text-emerald-700">All sites profitable!</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">No loss-making sites detected</p>
                            </div>
                        ) : (
                            <div className="space-y-2 flex-1 overflow-auto">
                                {lossSites.map((site: any, i: number) => (
                                    <div key={i} className="p-2.5 rounded-xl bg-red-50 border border-red-100">
                                        <div className="flex items-center justify-between">
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-slate-800 truncate">{site.site_no}</p>
                                                <p className="text-[10px] text-slate-400 truncate">{site.site_name}</p>
                                            </div>
                                            <span className="text-xs font-black text-red-600 shrink-0 ml-2">
                                                −{fmtRs(site.net_profit)}
                                            </span>
                                        </div>
                                        <div className="mt-1.5 flex items-center gap-1">
                                            <div className="flex-1 bg-red-100 rounded-full h-1">
                                                <div className="h-1 rounded-full bg-red-400"
                                                    style={{ width: `${Math.min(Math.abs(site.profit_margin), 100)}%` }} />
                                            </div>
                                            <span className="text-[10px] text-red-500 font-semibold">{site.profit_margin}%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button onClick={() => navigate('/analytics')}
                            className="mt-4 text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center justify-center gap-1 pt-3 border-t border-slate-100">
                            View Invoice Analysis <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Team + Sites */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="font-bold text-slate-900 text-sm">Team Members</h2>
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
                                    {usersList.slice(0, 6).map((u) => {
                                        const userSite = sitesList.find(s => s.ID === u.SITE_ID);
                                        return (
                                            <tr key={u.ID} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                                            {u.NAME.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-semibold text-slate-900 leading-none">{u.NAME}</p>
                                                            <p className="text-[11px] text-slate-400 mt-0.5">{u.EPF_NUMBER}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${getRoleBadge(u.ROLE)}`}>{u.ROLE}</span>
                                                </td>
                                                <td className="px-5 py-3 hidden sm:table-cell">
                                                    <span className="text-sm text-slate-500">{userSite ? userSite.SITE_NO : '—'}</span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    {u.INACTIVATION_REQUESTED ? (
                                                        <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600"><AlertTriangle className="w-3 h-3" /> Flagged</span>
                                                    ) : u.STATUS === 'active' ? (
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

                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="font-bold text-slate-900 text-sm">Sites</h2>
                                <button onClick={() => navigate('/sites')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">View all</button>
                            </div>
                            <div className="space-y-2">
                                {sitesList.slice(0, 4).map((site) => (
                                    <div key={site.ID} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 bg-teal-50 rounded-lg flex items-center justify-center">
                                                <MapPin className="w-3 h-3 text-teal-600" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-slate-800 leading-none">{site.NAME}</p>
                                                <p className="text-[10px] text-slate-400">#{site.SITE_NO}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 text-slate-400">
                                            <Users className="w-3 h-3" />
                                            <span className="text-xs font-semibold text-slate-600">{site.STAFF_COUNT || 0}</span>
                                        </div>
                                    </div>
                                ))}
                                {sitesList.length === 0 && <p className="text-sm text-slate-400 text-center py-3">No sites yet</p>}
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
                            <h2 className="font-bold text-slate-900 text-sm mb-3">Quick Actions</h2>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'Add Site',  icon: Plus,      bg: 'bg-blue-50 border-blue-200',    text: 'text-blue-700',    link: '/sites' },
                                    { label: 'Add Staff', icon: UserPlus,  bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', link: '/users' },
                                    { label: 'Invoices',  icon: FileText,  bg: 'bg-violet-50 border-violet-200', text: 'text-violet-700',  link: '/invoices' },
                                    { label: 'Analytics', icon: BarChart3, bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700',  link: '/analytics' },
                                ].map((a) => (
                                    <button key={a.label} onClick={() => navigate(a.link)}
                                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all active:scale-95 hover:shadow-sm ${a.bg} ${a.text}`}>
                                        <a.icon className="w-4 h-4" />
                                        <span className="text-[11px] font-semibold">{a.label}</span>
                                    </button>
                                ))}
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
