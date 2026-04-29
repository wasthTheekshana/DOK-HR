import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
    Calendar, Download, ChevronDown, LayoutGrid,
    Users, Clock, Target, Activity, Building2, RefreshCw
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

const TaskSummary: React.FC = () => {
    const { role } = useAuth();
    if (role !== 'system_admin') return <Navigate to="/" replace />;

    const today = format(new Date(), 'yyyy-MM-dd');
    const sevenDaysAgo = format(new Date(new Date().setDate(new Date().getDate() - 7)), 'yyyy-MM-dd');

    const [dateFrom, setDateFrom] = useState<string>(sevenDaysAgo);
    const [dateTo, setDateTo] = useState<string>(today);
    const [summaryData, setSummaryData] = useState<any[]>([]);
    const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);

    useEffect(() => { loadSummary(); }, [dateFrom, dateTo]);

    const loadSummary = async () => {
        setLoading(true);
        try {
            const params: any = { date: dateFrom };
            if (dateTo && dateTo !== dateFrom) params.date_to = dateTo;
            const res = await api.get('/tasks/daily-summary', { params });
            setSummaryData(res.data);
        } catch (err) { console.error('Failed to load summary', err); }
        finally { setLoading(false); }
    };

    const toggleSite = (siteNo: string) => {
        setExpandedSites(prev => {
            const n = new Set(prev);
            n.has(siteNo) ? n.delete(siteNo) : n.add(siteNo);
            return n;
        });
    };

    const expandAll = () => setExpandedSites(new Set(summaryData.map((s: any) => s.site_no)));
    const collapseAll = () => setExpandedSites(new Set());

    const totalStaff  = summaryData.reduce((s: number, d: any) => s + d.total_staff, 0);
    const totalHours  = summaryData.reduce((s: number, d: any) => s + (d.total_hours || 0), 0);
    const totalCount  = summaryData.reduce((s: number, d: any) => s + (d.total_count || 0), 0);
    const timeSites   = summaryData.filter((d: any) => d.site_ot_type === 'time_based').length;
    const targetSites = summaryData.filter((d: any) => d.site_ot_type !== 'time_based').length;

    const downloadReport = () => {
        if (summaryData.length === 0) { alert('No data to download'); return; }
        const wb = XLSX.utils.book_new();

        const overviewAoa: any[][] = [
            [`Task Summary Report — ${dateFrom} to ${dateTo}`],
            [],
            ['Sites', 'Staff', 'Total Hours', 'Total Count'],
            [summaryData.length, totalStaff, Number(totalHours.toFixed(1)), totalCount],
            [],
            ['Site', 'Site No', 'OT Type', 'Staff', 'Hours / Units'],
            ...summaryData.map((d: any) => [
                d.site_name, d.site_no,
                d.site_ot_type === 'time_based' ? 'Time' : 'Target',
                d.total_staff,
                d.site_ot_type === 'time_based' ? Number((d.total_hours || 0).toFixed(1)) : d.total_count,
            ]),
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overviewAoa), 'Overview');

        const detailRows: any[] = [];
        for (const site of summaryData) {
            for (const task of site.tasks) {
                detailRows.push({
                    Site: site.site_name, 'Site No': site.site_no,
                    'OT Type': site.site_ot_type === 'time_based' ? 'Time' : 'Target',
                    Employee: task.STAFF_NAME,
                    Date: task.TASK_DATE ? String(task.TASK_DATE).slice(0, 10) : '',
                    Task: task.TASK_DESCRIPTION, Count: task.COUNT ?? '',
                    'In Time': task.IN_TIME || '', 'Out Time': task.OUT_TIME || '',
                });
            }
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Detail');
        XLSX.writeFile(wb, `task_summary_${dateFrom}_${dateTo}.xlsx`);
    };

    return (
        <div className="space-y-6">

            {/* ── Hero header ─────────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 shadow-xl">
                {/* decorative circles */}
                <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
                <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-violet-500/10 blur-2xl pointer-events-none" />

                <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
                            <LayoutGrid className="w-6 h-6 text-indigo-300" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight">Task Summary</h1>
                            <p className="text-sm text-indigo-300/80 mt-0.5">Site-wise task overview across all projects</p>
                        </div>
                    </div>

                    {/* Date filters + actions */}
                    <div className="flex flex-wrap items-end gap-2">
                        <div>
                            <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-1">From</p>
                            <div className="relative">
                                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-400" />
                                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                    className="pl-8 pr-3 py-2 bg-white/10 border border-white/20 rounded-xl text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all" />
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-1">To</p>
                            <div className="relative">
                                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-400" />
                                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                    className="pl-8 pr-3 py-2 bg-white/10 border border-white/20 rounded-xl text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all" />
                            </div>
                        </div>
                        <button onClick={loadSummary}
                            className="p-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white transition-colors" title="Refresh">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={downloadReport}
                            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap">
                            <Download className="w-3.5 h-3.5" /> Export
                        </button>
                    </div>
                </div>
            </div>

            {/* ── KPI cards ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                    { label: 'Total Sites',   value: summaryData.length, icon: Building2,  color: 'indigo' },
                    { label: 'Total Staff',   value: totalStaff,         icon: Users,      color: 'emerald' },
                    { label: 'Total Hours',   value: totalHours.toFixed(1) + ' h', icon: Clock, color: 'blue' },
                    { label: 'Total Count',   value: totalCount,         icon: Activity,   color: 'orange' },
                    { label: 'Time / Target', value: `${timeSites} / ${targetSites}`, icon: Target, color: 'violet' },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label}
                        className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                            ${color === 'indigo'  ? 'bg-indigo-50'  : ''}
                            ${color === 'emerald' ? 'bg-emerald-50' : ''}
                            ${color === 'blue'    ? 'bg-blue-50'    : ''}
                            ${color === 'orange'  ? 'bg-orange-50'  : ''}
                            ${color === 'violet'  ? 'bg-violet-50'  : ''}
                        `}>
                            <Icon className={`w-5 h-5
                                ${color === 'indigo'  ? 'text-indigo-500'  : ''}
                                ${color === 'emerald' ? 'text-emerald-500' : ''}
                                ${color === 'blue'    ? 'text-blue-500'    : ''}
                                ${color === 'orange'  ? 'text-orange-500'  : ''}
                                ${color === 'violet'  ? 'text-violet-500'  : ''}
                            `} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-slate-400 font-medium truncate">{label}</p>
                            <p className="text-lg font-bold text-slate-900 leading-tight">{loading ? '—' : value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Site list ───────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

                {/* toolbar */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
                    <p className="text-sm font-semibold text-slate-700">
                        {summaryData.length} site{summaryData.length !== 1 ? 's' : ''} found
                    </p>
                    {summaryData.length > 0 && (
                        <div className="flex items-center gap-2">
                            <button onClick={expandAll}
                                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
                                Expand all
                            </button>
                            <span className="text-slate-300">|</span>
                            <button onClick={collapseAll}
                                className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors">
                                Collapse all
                            </button>
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="p-5 space-y-3">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="skeleton h-16 rounded-xl" />
                        ))}
                    </div>
                ) : summaryData.length === 0 ? (
                    <div className="py-20 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                            <LayoutGrid className="w-7 h-7 text-slate-300" />
                        </div>
                        <p className="text-slate-500 font-semibold">No tasks found</p>
                        <p className="text-slate-400 text-sm mt-1">Try adjusting the date range</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {summaryData.map((site: any, idx: number) => {
                            const isExpanded = expandedSites.has(site.site_no);
                            const isTime = site.site_ot_type === 'time_based';

                            return (
                                <div key={site.site_no}>
                                    {/* Site row */}
                                    <button onClick={() => toggleSite(site.site_no)}
                                        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50/80 transition-colors text-left group">

                                        {/* index bubble */}
                                        <span className="w-7 h-7 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center text-xs font-bold text-slate-500 group-hover:text-indigo-600 shrink-0 transition-colors">
                                            {idx + 1}
                                        </span>

                                        {/* site info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-slate-800 text-[14px]">{site.site_name}</span>
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">#{site.site_no}</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isTime ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
                                                    {isTime ? 'Time' : 'Target'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-0.5">{site.total_staff} staff member{site.total_staff !== 1 ? 's' : ''}</p>
                                        </div>

                                        {/* metric */}
                                        <div className="text-right shrink-0 hidden sm:block">
                                            {isTime ? (
                                                <div className="flex gap-4">
                                                    <div>
                                                        <p className="text-base font-bold text-blue-600">{(site.total_hours || 0).toFixed(1)}</p>
                                                        <p className="text-[10px] text-slate-400 font-medium">hours</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-base font-bold text-indigo-600">{site.total_count}</p>
                                                        <p className="text-[10px] text-slate-400 font-medium">count</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="text-base font-bold text-violet-600">{site.total_count}</p>
                                                    <p className="text-[10px] text-slate-400 font-medium">units</p>
                                                </>
                                            )}
                                        </div>

                                        <ChevronDown className={`w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>

                                    {/* Expanded task table */}
                                    {isExpanded && (
                                        <div className="border-t border-slate-100">
                                            <div className="overflow-x-auto bg-slate-50/50">
                                                <table className="min-w-full">
                                                    <thead>
                                                        <tr className="border-b border-slate-200/60">
                                                            <th className="px-5 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                                                            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                                                            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Task</th>
                                                            {!isTime && <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Count</th>}
                                                            {isTime && (
                                                                <>
                                                                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">In</th>
                                                                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Out</th>
                                                                    <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Count</th>
                                                                </>
                                                            )}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 bg-white">
                                                        {site.tasks.map((task: any, i: number) => (
                                                            <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                                                                <td className="px-5 py-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-[10px] font-bold shrink-0">
                                                                            {task.STAFF_NAME?.charAt(0).toUpperCase()}
                                                                        </div>
                                                                        <span className="text-sm font-medium text-slate-800">{task.STAFF_NAME}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3 text-xs text-slate-400 font-medium whitespace-nowrap">
                                                                    {task.TASK_DATE ? format(parseISO(String(task.TASK_DATE).slice(0, 10)), 'MMM d, yyyy') : '—'}
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                                                                        {task.TASK_DESCRIPTION}
                                                                    </span>
                                                                </td>
                                                                {!isTime && (
                                                                    <td className="px-4 py-3 text-right">
                                                                        <span className="text-sm font-bold font-mono text-violet-700">{task.COUNT}</span>
                                                                    </td>
                                                                )}
                                                                {isTime && (
                                                                    <>
                                                                        <td className="px-4 py-3 text-xs font-mono text-emerald-600 font-semibold">{task.IN_TIME || '—'}</td>
                                                                        <td className="px-4 py-3 text-xs font-mono text-orange-600 font-semibold">{task.OUT_TIME || '—'}</td>
                                                                        <td className="px-4 py-3 text-right text-sm font-bold font-mono text-indigo-700">{task.COUNT ?? 0}</td>
                                                                    </>
                                                                )}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TaskSummary;
