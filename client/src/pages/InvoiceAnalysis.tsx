import React, { useEffect, useState } from 'react';
import api from '../services/api';
import * as XLSX from 'xlsx';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import {
    DollarSign, FileDown, Search, X, Loader2,
} from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    PieChart, Pie, Cell,
} from 'recharts';

const fmtRs = (n: number) =>
    `Rs. ${Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const OT_LABEL: Record<string, string> = {
    time_based: 'Time', target_based: 'Target', staff_outsource: 'Outsource',
};

type DetailTab = 'top_revenue' | 'top_profit' | 'loss' | 'all';
type TrendMode  = 'monthly' | 'quarterly';
type DatePreset = 'this_month' | 'last_month' | 'custom';

const InvoiceAnalysis: React.FC = () => {
    const [ia, setIa]             = useState<any>(null);
    const [loading, setLoading]   = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [trendMode, setTrendMode] = useState<TrendMode>('monthly');
    const [tab, setTab]           = useState<DetailTab>('all');
    const [search, setSearch]     = useState('');
    const [datePreset, setDatePreset] = useState<DatePreset>('this_month');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo,   setCustomTo]   = useState('');

    const fetchData = (df: string, dt: string) => {
        if (ia === null) setLoading(true);
        else setRefreshing(true);
        api.get('/analytics/invoice-analysis', { params: { date_from: df, date_to: dt } })
            .then(r => setIa(r.data))
            .catch(e => console.error('invoice-analysis error', e))
            .finally(() => { setLoading(false); setRefreshing(false); });
    };

    useEffect(() => {
        const now = new Date();
        fetchData(
            format(startOfMonth(now), 'yyyy-MM-dd'),
            format(now, 'yyyy-MM-dd')
        );
    }, []);

    const handlePresetChange = (preset: DatePreset) => {
        setDatePreset(preset);
        if (preset === 'this_month') {
            const now = new Date();
            fetchData(format(startOfMonth(now), 'yyyy-MM-dd'), format(now, 'yyyy-MM-dd'));
        } else if (preset === 'last_month') {
            const last = subMonths(new Date(), 1);
            fetchData(format(startOfMonth(last), 'yyyy-MM-dd'), format(endOfMonth(last), 'yyyy-MM-dd'));
        }
        // 'custom' — waits for the Load button
    };

    const sm    = ia?.summary || {};
    const trend = trendMode === 'monthly' ? (ia?.monthlyTrend || []) : (ia?.quarterlyTrend || []);
    const xKey  = trendMode === 'monthly' ? 'month' : 'quarter';

    const baseRows: any[] =
        tab === 'top_revenue' ? (ia?.topByRevenue || []) :
        tab === 'top_profit'  ? (ia?.topByProfit  || []) :
        tab === 'loss'        ? (ia?.lossSites    || []) :
        (ia?.sites || []);

    const detailRows = search.trim()
        ? baseRows.filter((r: any) =>
            r.site_no?.toLowerCase().includes(search.toLowerCase()) ||
            r.site_name?.toLowerCase().includes(search.toLowerCase()) ||
            r.service_type?.toLowerCase().includes(search.toLowerCase())
          )
        : baseRows;

    const downloadExcel = () => {
        const tabLabel = tab === 'top_revenue' ? 'Top Revenue' :
                         tab === 'top_profit'  ? 'Top Profit'  :
                         tab === 'loss'        ? 'Loss Sites'  : 'All Sites';
        const headers = ['#', 'Site No', 'Site Name', 'Service Type', 'OT Type', 'Invoices',
                         'Revenue (Rs)', 'Cost Variants (Rs)', 'Salary+OT (Rs)',
                         'Total Cost (Rs)', 'Net Profit/Loss (Rs)', 'Margin (%)'];
        const rows = detailRows.map((row: any, i: number) => [
            i + 1, row.site_no, row.site_name, row.service_type || '',
            OT_LABEL[row.ot_type] || row.ot_type, row.invoice_count,
            Number(row.total_revenue) || 0, Number(row.cost_variant)  || 0,
            Number(row.salary_ot)     || 0, Number(row.total_cost)    || 0,
            Number(row.net_profit)    || 0, Number(row.profit_margin) || 0,
        ]);
        const totalRow = ['', '', '', '', 'TOTAL', '',
            Number(sm.total_revenue)      || 0, Number(sm.total_cost_variant) || 0,
            Number(sm.total_salary_ot)    || 0, Number(sm.total_cost)         || 0,
            Number(sm.net_profit)         || 0, Number(sm.profit_margin)      || 0,
        ];
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows, totalRow]);
        ws['!cols'] = [4,10,20,14,10,8,14,14,14,14,16,10].map(w => ({ wch: w }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, tabLabel);
        XLSX.writeFile(wb, `Invoice_Breakdown_${tabLabel.replace(/ /g,'_')}.xlsx`);
    };

    if (loading) return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
            </div>
            <div className="skeleton h-72 rounded-2xl" />
            <div className="skeleton h-96 rounded-2xl" />
        </div>
    );

    if (!ia) return (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <DollarSign className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">No invoice data available yet.</p>
            <p className="text-sm mt-1">Generate and save invoices to see analysis here.</p>
        </div>
    );

    return (
        <div className="space-y-5">

            {/* Page header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-700 rounded-xl flex items-center justify-center shrink-0">
                    <DollarSign className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-slate-900">Invoice Business Model Analysis</h2>
                    <p className="text-xs text-slate-500">Comprehensive revenue, cost, and profitability insights from all saved invoices</p>
                </div>
            </div>

            {/* Date preset tabs */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex gap-1.5">
                        {([
                            { id: 'this_month' as const, label: 'This Month'   },
                            { id: 'last_month' as const, label: 'Last Month'   },
                            { id: 'custom'     as const, label: 'Custom Range' },
                        ]).map(p => (
                            <button key={p.id} type="button"
                                onClick={() => handlePresetChange(p.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    datePreset === p.id
                                        ? 'bg-green-700 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}>
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {refreshing && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}

                    {datePreset === 'custom' && (
                        <>
                            <div>
                                <label className="form-label">From</label>
                                <input type="date" value={customFrom}
                                    onChange={e => setCustomFrom(e.target.value)}
                                    className="form-input" />
                            </div>
                            <div>
                                <label className="form-label">To</label>
                                <input type="date" value={customTo}
                                    onChange={e => setCustomTo(e.target.value)}
                                    className="form-input" />
                            </div>
                            <button type="button"
                                disabled={!customFrom || !customTo || loading}
                                onClick={() => fetchData(customFrom, customTo)}
                                className="btn btn-primary flex items-center gap-2">
                                {loading
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <Search className="w-4 h-4" />
                                }
                                Load
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                    { label: 'Total Revenue',     val: fmtRs(sm.total_revenue || 0),   sub: `${sm.total_invoices || 0} invoices`,       bg: 'bg-blue-50',   tc: 'text-blue-900',   sc: 'text-blue-500' },
                    { label: 'Total Cost',        val: fmtRs(sm.total_cost || 0),      sub: 'Salary+OT+Variants+Exp',                   bg: 'bg-rose-50',   tc: 'text-rose-900',   sc: 'text-rose-500' },
                    { label: 'Net Profit / Loss', val: `${(sm.net_profit||0) >= 0 ? '+' : '−'}${fmtRs(sm.net_profit||0)}`,
                      sub: `${sm.profit_margin || 0}% margin`,
                      bg: (sm.net_profit||0) >= 0 ? 'bg-emerald-50' : 'bg-red-50',
                      tc: (sm.net_profit||0) >= 0 ? 'text-emerald-900' : 'text-red-900',
                      sc: (sm.net_profit||0) >= 0 ? 'text-emerald-500' : 'text-red-500' },
                    { label: 'Avg Invoice Value', val: fmtRs(sm.avg_invoice_value || 0), sub: `${sm.site_count || 0} billing sites`,    bg: 'bg-violet-50', tc: 'text-violet-900', sc: 'text-violet-500' },
                    { label: 'Site Status',       val: `${sm.profitable_sites || 0} / ${sm.loss_sites || 0}`, sub: 'Profit / Loss sites', bg: 'bg-slate-50', tc: 'text-slate-900', sc: 'text-slate-500' },
                ].map((c, i) => (
                    <div key={i} className={`${c.bg} rounded-xl p-4`}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{c.label}</p>
                        <p className={`text-base font-black ${c.tc} leading-tight`}>{c.val}</p>
                        <p className={`text-[10px] ${c.sc} mt-1`}>{c.sub}</p>
                    </div>
                ))}
            </div>

            {/* Revenue / Cost / Profit Trend */}
            <div className="card p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="text-sm font-bold text-slate-700">Revenue · Cost · Profit Trend</h3>
                    <div className="flex gap-1.5">
                        {(['monthly', 'quarterly'] as const).map(m => (
                            <button key={m} onClick={() => setTrendMode(m)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${trendMode === m ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                {m === 'monthly' ? 'Monthly' : 'Quarterly'}
                            </button>
                        ))}
                    </div>
                </div>
                {trend.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No invoice data available yet</div>
                ) : (
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
                                        {payload.map((e: any, i: number) => (
                                            <p key={i} style={{ color: e.fill || e.color }} className="font-semibold">{e.name}: {fmtRs(e.value)}</p>
                                        ))}
                                    </div>
                                );
                            }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="total_revenue" name="Revenue"    fill="#3b82f6" radius={[3,3,0,0]} />
                            <Bar dataKey="total_cost"    name="Total Cost" fill="#f43f5e" radius={[3,3,0,0]} />
                            <Bar dataKey="net_profit"    name="Net Profit" fill="#10b981" radius={[3,3,0,0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Cost Structure + Cost Composition */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="card p-5">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Revenue Allocation (Cost Structure)</h3>
                    {(ia?.costStructure || []).every((c: any) => c.value === 0)
                        ? <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No invoice data available</div>
                        : (
                            <>
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie data={ia.costStructure} dataKey="value" nameKey="name"
                                            cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
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

                <div className="card p-5">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Cost Composition by Month</h3>
                    {(ia?.monthlyTrend || []).length === 0
                        ? <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No data</div>
                        : (
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

            {/* Site Invoice Breakdown */}
            <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-700 mr-2">Site Invoice Breakdown</h3>

                    {/* Tab filters */}
                    {([
                        { id: 'top_revenue', label: 'Top Revenue' },
                        { id: 'top_profit',  label: 'Top Profit' },
                        { id: 'loss',        label: `Loss Sites (${(ia?.lossSites || []).length})` },
                        { id: 'all',         label: 'All Sites' },
                    ] as { id: DetailTab; label: string }[]).map(t => (
                        <button key={t.id} onClick={() => { setTab(t.id); setSearch(''); }}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            {t.label}
                        </button>
                    ))}

                    {/* Search */}
                    <div className="relative flex-1 min-w-[160px] max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search site…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-300 focus:border-green-400 transition"
                        />
                        {search && (
                            <button onClick={() => setSearch('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    <span className="text-xs text-slate-400">{detailRows.length} sites</span>

                    <button onClick={downloadExcel}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-all shadow-sm">
                        <FileDown className="w-3.5 h-3.5" /> Download Excel
                    </button>
                </div>

                {detailRows.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">
                        {tab === 'loss'
                            ? 'No loss-making sites — all sites are profitable!'
                            : search
                                ? `No sites match "${search}"`
                                : 'No invoice data yet.'}
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
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-rose-600 uppercase tracking-wider">Total Cost</th>
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
                                                <span className={`inline-flex text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                                    row.ot_type === 'time_based' ? 'bg-emerald-100 text-emerald-700' :
                                                    row.ot_type === 'target_based' ? 'bg-violet-100 text-violet-700' :
                                                    'bg-orange-100 text-orange-700'}`}>
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
        </div>
    );
};

export default InvoiceAnalysis;
