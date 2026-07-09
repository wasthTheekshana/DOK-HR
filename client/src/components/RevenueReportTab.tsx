import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import type { Site } from '../types';
import { format } from 'date-fns';
import { ChevronDown, Download, FileText, Play } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface RevenueLine {
    site_id: number; site_no: string; site_name: string;
    task_name: string; total_count: number; unit_price: number; line_total: number;
}
interface RevenueSummary { site_id: number; site_name: string; total_revenue: number; }
interface RevenueReport {
    date_from: string; date_to: string;
    lines: RevenueLine[]; summary: RevenueSummary[]; grand_total: number;
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCount = (n: number) => n.toLocaleString('en-US');

// Checkbox dropdown. Empty `selected` means "all".
const MultiSelect = ({ label, options, selected, onChange }: {
    label: string;
    options: { value: string; label: string }[];
    selected: string[];
    onChange: (next: string[]) => void;
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const toggle = (value: string) => {
        onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
    };

    const buttonText = selected.length === 0
        ? `All ${label}`
        : `${selected.length} of ${options.length} selected`;

    return (
        <div className="relative" ref={ref}>
            <button type="button" onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all">
                <span className="truncate">{buttonText}</span>
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
            {open && (
                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg p-2">
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm font-semibold text-slate-700">
                        <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        All {label}
                    </label>
                    <div className="border-t border-slate-100 my-1" />
                    {options.map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-600">
                            <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                            <span className="truncate">{opt.label}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

const RevenueReportTab: React.FC<{ sites: Site[] }> = ({ sites }) => {
    const [dateFrom, setDateFrom] = useState(format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'));
    const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);   // empty = all sites
    const [selectedTasks, setSelectedTasks] = useState<string[]>([]);       // lowercased names; empty = all
    const [report, setReport] = useState<RevenueReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const activeSites = useMemo(() => sites.filter(s => s.STATUS !== 'inactive'), [sites]);

    const siteOptions = useMemo(
        () => activeSites.map(s => ({ value: String(s.ID), label: `${s.SITE_NO} - ${s.NAME}` })),
        [activeSites]
    );

    // Task options = union of task types across the selected sites (all sites when none selected).
    // Key is the lowercased trimmed name; label shows the price when it is the same everywhere.
    const taskOptions = useMemo(() => {
        const scope = selectedSiteIds.length === 0
            ? activeSites
            : activeSites.filter(s => selectedSiteIds.includes(String(s.ID)));
        const byKey = new Map<string, { display: string; prices: Set<number> }>();
        for (const site of scope) {
            for (const tt of site.TASK_TYPES || []) {
                const key = tt.TASK_NAME.trim().toLowerCase();
                if (!key) continue;
                const entry = byKey.get(key) || { display: tt.TASK_NAME.trim(), prices: new Set<number>() };
                entry.prices.add(Number(tt.INVOICE_PRICE) || 0);
                byKey.set(key, entry);
            }
        }
        return Array.from(byKey.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, { display, prices }]) => ({
                value: key,
                label: prices.size === 1 ? `${display} — Rs ${fmt([...prices][0])}` : `${display} — multiple prices`,
            }));
    }, [activeSites, selectedSiteIds]);

    // Prune task selections that no longer exist for the chosen sites.
    useEffect(() => {
        const valid = new Set(taskOptions.map(o => o.value));
        setSelectedTasks(prev => prev.filter(t => valid.has(t)));
    }, [taskOptions]);

    const generate = async () => {
        setError('');
        if (!dateFrom || !dateTo) { setError('Both dates are required.'); return; }
        if (dateFrom > dateTo) { setError('Date From must be on or before Date To.'); return; }
        setLoading(true);
        try {
            const params: Record<string, string> = { date_from: dateFrom, date_to: dateTo };
            if (selectedSiteIds.length > 0) params.site_ids = selectedSiteIds.join(',');
            if (selectedTasks.length > 0) params.task_names = selectedTasks.join(',');
            const res = await api.get('/tasks/revenue-report', { params });
            setReport(res.data);
        } catch {
            setError('Failed to generate the report.');
            setReport(null);
        } finally {
            setLoading(false);
        }
    };

    const exportExcel = () => {
        if (!report) return;
        const detail: (string | number)[][] = [
            ['Project Name', 'Task', 'Total Count', 'Unit Price', 'Total Value'],
            ...report.lines.map(l => [l.site_name, l.task_name, l.total_count, l.unit_price, l.line_total]),
            ['Grand Total', '', '', '', report.grand_total],
        ];
        const summary: (string | number)[][] = [
            ['Projects', 'Total Revenue'],
            ...report.summary.map(s => [s.site_name, s.total_revenue]),
            ['Total', report.grand_total],
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), 'Detail');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');
        XLSX.writeFile(wb, `Revenue-Report_${report.date_from}_${report.date_to}.xlsx`);
    };

    const chartData = useMemo(
        () => (report?.summary || []).map(s => ({ name: s.site_name, revenue: Math.round(s.total_revenue * 100) / 100 })),
        [report]
    );

    return (
        <div className="space-y-5">
            {/* Filters */}
            <div className="card p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date From</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date To</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Sites</label>
                        <MultiSelect label="Sites" options={siteOptions} selected={selectedSiteIds} onChange={setSelectedSiteIds} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tasks</label>
                        <MultiSelect label="Tasks" options={taskOptions} selected={selectedTasks} onChange={setSelectedTasks} />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={generate} disabled={loading}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                            <Play className="w-4 h-4" />
                            Generate
                        </button>
                        <button onClick={exportExcel} disabled={!report || report.lines.length === 0}
                            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Excel</span>
                        </button>
                    </div>
                </div>
                {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
            </div>

            {loading ? (
                <div className="card p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
            ) : !report ? (
                <div className="card py-16 text-center">
                    <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">Select filters and press Generate</p>
                </div>
            ) : report.lines.length === 0 ? (
                <div className="card py-16 text-center">
                    <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No data found for the selected criteria</p>
                </div>
            ) : (
                <>
                    {/* Detail table */}
                    <div className="card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-100">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Task</th>
                                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Count</th>
                                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Unit Price (Rs)</th>
                                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Value (Rs)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {report.lines.map((line, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                            <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 whitespace-nowrap">
                                                {idx === 0 || report.lines[idx - 1].site_id !== line.site_id ? line.site_name : ''}
                                            </td>
                                            <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap">{line.task_name}</td>
                                            <td className="px-5 py-3.5 text-sm text-slate-600 text-right">{fmtCount(line.total_count)}</td>
                                            <td className="px-5 py-3.5 text-sm text-slate-600 text-right">{fmt(line.unit_price)}</td>
                                            <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 text-right">{fmt(line.line_total)}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-slate-50">
                                        <td colSpan={4} className="px-5 py-3.5 text-sm font-bold text-slate-900">Grand Total</td>
                                        <td className="px-5 py-3.5 text-sm font-bold text-slate-900 text-right">{fmt(report.grand_total)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Summary + chart */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="card overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100">
                                <h3 className="text-sm font-bold text-slate-900">Revenue by Project</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Revenue (Rs)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {report.summary.map(s => (
                                            <tr key={s.site_id} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 whitespace-nowrap">{s.site_name}</td>
                                                <td className="px-5 py-3.5 text-sm text-slate-600 text-right">{fmt(s.total_revenue)}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-slate-50">
                                            <td className="px-5 py-3.5 text-sm font-bold text-slate-900">Total</td>
                                            <td className="px-5 py-3.5 text-sm font-bold text-slate-900 text-right">{fmt(report.grand_total)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="card p-5">
                            <h3 className="text-sm font-bold text-slate-900 mb-4">Revenue Chart</h3>
                            <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 20)}>
                                <BarChart data={chartData} layout="vertical" barSize={14} margin={{ left: 8, right: 24 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" tickFormatter={(v: number) => v.toLocaleString('en-US')} tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                                    <Tooltip formatter={(value) => [`Rs ${fmt(Number(value))}`, 'Revenue']} />
                                    <Bar dataKey="revenue" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default RevenueReportTab;
