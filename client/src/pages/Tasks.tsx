import React, { useEffect, useState } from 'react';
import api from '../services/api';
import type { Task, Site, User } from '../types';
import { Calendar, MapPin, Target, User as UserIcon, BarChart3, LayoutList, Clock, ChevronRight, TrendingUp, Users, Plus, Trash2, X, Download, Save, ArrowLeft, MoreVertical, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

type PanelState =
  | null
  | { mode: 'add'; staffId: number }
  | { mode: 'edit'; task: Task };

const Tasks: React.FC = () => {
    const { role, user: authUser } = useAuth();
    const isStaff = role === 'staff';
    const isPrivileged = role === 'admin' || role === 'supervisor' || role === 'system_admin';
    const today = format(new Date(), 'yyyy-MM-dd');
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState<string>('');
    const [selectedDate, setSelectedDate] = useState<string>(today);
    const [viewMode, setViewMode] = useState<'daily' | 'summary'>('daily');
    const [summaryDateFrom, setSummaryDateFrom] = useState<string>(format(new Date(new Date().setDate(new Date().getDate() - 7)), 'yyyy-MM-dd'));
    const [summaryDateTo, setSummaryDateTo] = useState<string>(today);
    const [summaryData, setSummaryData] = useState<any[]>([]);
    const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
    const [users, setUsers] = useState<User[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(false);
    const [panelState, setPanelState] = useState<PanelState>(null);
    const [panelError, setPanelError] = useState<string | null>(null);
    const [panelSaving, setPanelSaving] = useState(false);
    const [panelTaskType, setPanelTaskType] = useState('');
    const [panelCount, setPanelCount] = useState(0);
    const [panelDate, setPanelDate] = useState(today);
    const [panelInTime, setPanelInTime] = useState('');
    const [panelOutTime, setPanelOutTime] = useState('');
    const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);

    useEffect(() => { fetchSites(); }, []);

    useEffect(() => {
        if (viewMode === 'summary') {
            loadSummaryData();
        } else if (selectedSite && selectedDate) {
            loadDailySheet();
        } else {
            setUsers([]); setTasks([]);
        }
    }, [selectedSite, selectedDate, viewMode, summaryDateFrom, summaryDateTo]);

    useEffect(() => {
        if (openMenuId === null) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('[data-menu]')) setOpenMenuId(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [openMenuId]);

    const fetchSites = async () => {
        try {
            const response = await api.get('/sites');
            setSites(response.data);
            if (isStaff && authUser?.SITE_ID) {
                const staffSite = response.data.find((s: Site) => s.ID === authUser.SITE_ID);
                if (staffSite) setSelectedSite(staffSite.SITE_NO);
            } else if (response.data.length > 0) {
                setSelectedSite(response.data[0].SITE_NO);
            }
        } catch (error) { console.error('Failed to fetch sites', error); }
    };

    const loadDailySheet = async () => {
        setLoading(true);
        try {
            const siteBasic = sites.find(s => s.SITE_NO === selectedSite);
            if (!siteBasic) return;

            if (isStaff) {
                // Staff: skip /users call — use their own profile from auth context
                const [siteRes, tasksRes] = await Promise.all([
                    api.get(`/sites/${siteBasic.ID}`),
                    api.get(`/tasks?site_no=${selectedSite}&date_from=${selectedDate}&date_to=${selectedDate}`)
                ]);
                setUsers(authUser ? [authUser as unknown as User] : []);
                setTasks(tasksRes.data);
                setSites(prev => prev.map(s => s.ID === siteBasic.ID ? siteRes.data : s));
                return;
            }

            const [siteRes, usersRes, tasksRes] = await Promise.all([
                api.get(`/sites/${siteBasic.ID}`),
                api.get(`/users?site=${siteBasic.ID}&role=staff,supervisor&status=active&date=${selectedDate}`),
                api.get(`/tasks?site_no=${selectedSite}&date_from=${selectedDate}&date_to=${selectedDate}`)
            ]);
            const allUsers = usersRes.data;
            setUsers(allUsers);
            setTasks(tasksRes.data);
            setSites(prev => prev.map(s => s.ID === siteBasic.ID ? siteRes.data : s));
        } catch (error) { console.error('Failed to load daily sheet', error); }
        finally { setLoading(false); }
    };

    const loadSummaryData = async () => {
        setLoading(true);
        try {
            const params: any = { date: summaryDateFrom };
            if (summaryDateTo && summaryDateTo !== summaryDateFrom) params.date_to = summaryDateTo;
            const res = await api.get('/tasks/daily-summary', { params });
            setSummaryData(res.data);
        } catch (err) { console.error('Failed to load summary', err); }
        finally { setLoading(false); }
    };

    const downloadSummaryReport = () => {
        if (summaryData.length === 0) { alert('No summary data to download'); return; }
        const wb = XLSX.utils.book_new();
        const totalStaff  = summaryData.reduce((s: number, d: any) => s + d.total_staff, 0);
        const totalHours  = summaryData.reduce((s: number, d: any) => s + (d.total_hours || 0), 0);
        const totalCount  = summaryData.reduce((s: number, d: any) => s + (d.total_count || 0), 0);
        const overviewAoa: any[][] = [
            [`Task Summary Report — ${summaryDateFrom} to ${summaryDateTo}`], [],
            ['Sites', 'Staff', 'Total Hours', 'Total Count'],
            [summaryData.length, totalStaff, Number(totalHours.toFixed(1)), totalCount], [],
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
        XLSX.writeFile(wb, `task_summary_${summaryDateFrom}_${summaryDateTo}.xlsx`);
    };

    const getSite = () => sites.find(s => s.SITE_NO === selectedSite);

    // ── Download daily task report ───────────────────────────────────────────
    const downloadDailyReport = async () => {
        try {
            let allTasks: Task[] = [];

            if (selectedSite === 'ALL') {
                const res = await api.get(`/tasks?date_from=${selectedDate}&date_to=${selectedDate}`);
                allTasks = res.data;
            } else {
                allTasks = tasks;
            }

            if (allTasks.length === 0) { alert('No tasks to download'); return; }

            const isAllSites = selectedSite === 'ALL';

            // ── Sheet 1: Detailed task rows ──────────────────────────────────
            const detailRows = allTasks.map((t: any) => {
                const row: any = {};
                if (isAllSites) row['Site'] = t.SITE_NO || t.SITE_NAME || '';
                row['Date'] = t.TASK_DATE ? t.TASK_DATE.slice(0, 10) : selectedDate;
                row['Staff'] = t.STAFF_NAME || '';
                row['Task'] = t.TASK_DESCRIPTION || '';
                row['OT Type'] = t.OT_TYPE || '';
                row['Count'] = t.COUNT ?? 0;
                row['In Time'] = t.IN_TIME || '';
                row['Out Time'] = t.OUT_TIME || '';
                return row;
            });

            const wsDetail = XLSX.utils.json_to_sheet(detailRows);

            // ── Sheet 2: Summary ─────────────────────────────────────────────
            const summaryAoa: any[][] = [];

            summaryAoa.push([`Daily Task Summary — ${selectedDate}${isAllSites ? ' (All Sites)' : ` — Site ${selectedSite}`}`]);
            summaryAoa.push([]);

            // Section A: Per-staff totals
            summaryAoa.push(['Staff Summary']);
            const staffHeader = isAllSites
                ? ['Site', 'Staff', 'Task', 'Total Count']
                : ['Staff', 'Task', 'Total Count'];
            summaryAoa.push(staffHeader);

            // Group: site+staff+task → total count
            const staffMap = new Map<string, { site: string; staff: string; task: string; count: number }>();
            for (const t of allTasks as any[]) {
                const key = `${t.SITE_NO || ''}|${t.STAFF_NAME || ''}|${t.TASK_DESCRIPTION || ''}`;
                if (!staffMap.has(key)) {
                    staffMap.set(key, { site: t.SITE_NO || t.SITE_NAME || '', staff: t.STAFF_NAME || '', task: t.TASK_DESCRIPTION || '', count: 0 });
                }
                staffMap.get(key)!.count += Number(t.COUNT) || 0;
            }

            for (const entry of staffMap.values()) {
                if (isAllSites) {
                    summaryAoa.push([entry.site, entry.staff, entry.task, entry.count]);
                } else {
                    summaryAoa.push([entry.staff, entry.task, entry.count]);
                }
            }

            summaryAoa.push([]);

            // Section B: Per-task-type totals
            summaryAoa.push(['Task Type Summary']);
            const taskHeader = isAllSites ? ['Site', 'Task Type', 'Total Count'] : ['Task Type', 'Total Count'];
            summaryAoa.push(taskHeader);

            const taskMap = new Map<string, { site: string; task: string; count: number }>();
            for (const t of allTasks as any[]) {
                const key = `${t.SITE_NO || ''}|${t.TASK_DESCRIPTION || ''}`;
                if (!taskMap.has(key)) {
                    taskMap.set(key, { site: t.SITE_NO || t.SITE_NAME || '', task: t.TASK_DESCRIPTION || '', count: 0 });
                }
                taskMap.get(key)!.count += Number(t.COUNT) || 0;
            }

            for (const entry of taskMap.values()) {
                if (isAllSites) {
                    summaryAoa.push([entry.site, entry.task, entry.count]);
                } else {
                    summaryAoa.push([entry.task, entry.count]);
                }
            }

            // Grand total
            const grandTotal = allTasks.reduce((sum: number, t: any) => sum + (Number(t.COUNT) || 0), 0);
            summaryAoa.push([]);
            summaryAoa.push(isAllSites ? ['', 'Grand Total', grandTotal] : ['', 'Grand Total', grandTotal]);

            const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, wsDetail, 'Tasks');
            XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

            const siteLabel = selectedSite === 'ALL' ? 'all_sites' : selectedSite;
            XLSX.writeFile(wb, `tasks_${siteLabel}_${selectedDate}.xlsx`);
        } catch (err) {
            console.error(err);
            alert('Failed to download report');
        }
    };

    const handleDeleteTask = async (taskId: number) => {
        if (!confirm('Delete this task?')) return;
        setDeletingIds(prev => new Set(prev).add(taskId));
        try {
            await api.delete(`/tasks/${taskId}`);
            await loadDailySheet();
        } catch (err) { console.error(err); alert('Failed to delete task'); }
        finally { setDeletingIds(prev => { const n = new Set(prev); n.delete(taskId); return n; }); }
    };

    const openPanel = (state: NonNullable<PanelState>) => {
        setPanelError(null);
        if (state.mode === 'edit') {
            const t = state.task;
            setPanelTaskType(t.TASK_DESCRIPTION || '');
            setPanelCount(t.COUNT || 0);
            setPanelDate(String(t.TASK_DATE).slice(0, 10));
            setPanelInTime(t.IN_TIME || '');
            setPanelOutTime(t.OUT_TIME || '');
        } else {
            setPanelTaskType('');
            setPanelCount(0);
            setPanelDate(selectedDate);
            setPanelInTime('');
            setPanelOutTime('');
        }
        setPanelState(state);
    };

    const closePanel = () => {
        setPanelState(null);
        setPanelError(null);
    };

    const handlePanelSave = async () => {
        if (!panelTaskType) { setPanelError('Please select a task type'); return; }
        const site = getSite();
        if (!site) return;
        setPanelSaving(true);
        setPanelError(null);
        try {
            const siteOtType = site.OT_TYPE || 'time_based';
            const taskOtType = siteOtType === 'staff_outsource' ? 'time_based' : siteOtType;
            if (panelState?.mode === 'edit') {
                await api.patch(`/tasks/${panelState.task.ID}`, {
                    task_description: panelTaskType,
                    ot_type: taskOtType,
                    count: Number(panelCount || 0),
                    in_time: panelInTime || null,
                    out_time: panelOutTime || null,
                    task_date: panelDate,
                });
            } else if (panelState?.mode === 'add') {
                await api.post('/tasks', {
                    site_id: site.ID,
                    staff_id: panelState.staffId,
                    task_date: panelDate,
                    task_description: panelTaskType,
                    ot_type: taskOtType,
                    count: Number(panelCount || 0),
                    in_time: panelInTime || null,
                    out_time: panelOutTime || null,
                });
            }
            closePanel();
            await loadDailySheet();
        } catch (err: any) {
            setPanelError(err.response?.data?.message || 'Failed to save task');
        } finally {
            setPanelSaving(false);
        }
    };

    const currentSite = sites.find(s => s.SITE_NO === selectedSite);
    const recordedCount = new Set(tasks.map(t => t.STAFF_ID)).size; // unique staff with tasks
    const totalUsers = users.length;

    if (!selectedSite && sites.length === 0) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center space-y-3">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500 font-medium">Loading sites...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative">
            {/* Main content — shifts left on desktop when panel is open */}
            <div className={`space-y-4 transition-all duration-300 ${panelState ? 'md:mr-[45%]' : ''}`}>

                {/* Header card */}
                <div className="card p-5 space-y-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-[17px] font-bold text-slate-900 tracking-tight">Daily Tasks</h1>
                            <p className="text-sm text-slate-500 mt-0.5">
                                {isStaff ? 'Add your tasks for today' : 'Manage tasks for all employees'}
                            </p>
                        </div>
                        {role === 'admin' && (
                            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                                <button onClick={() => setViewMode('daily')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${viewMode === 'daily' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <LayoutList className="w-3.5 h-3.5" /> Daily
                                </button>
                                <button onClick={() => setViewMode('summary')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${viewMode === 'summary' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <BarChart3 className="w-3.5 h-3.5" /> Summary
                                </button>
                            </div>
                        )}
                    </div>

                    {viewMode === 'daily' ? (
                        <div className="space-y-3">
                            {!isStaff && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Site</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)}
                                            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">
                                            {role === 'admin' && <option value="ALL">All Sites</option>}
                                            {sites.map(s => <option key={s.ID} value={s.SITE_NO}>{s.NAME}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input type="date" value={selectedDate}
                                        onChange={isStaff || role === 'supervisor' ? undefined : e => setSelectedDate(e.target.value)}
                                        min={isStaff || role === 'supervisor' ? today : undefined}
                                        max={isStaff || role === 'supervisor' ? today : undefined}
                                        readOnly={isStaff || role === 'supervisor'}
                                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                </div>
                            </div>
                            {role === 'admin' && (
                                <button onClick={downloadDailyReport}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors">
                                    <Download className="w-4 h-4" /> Download
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">From Date</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input type="date" value={summaryDateFrom} onChange={e => setSummaryDateFrom(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">To Date</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input type="date" value={summaryDateTo} onChange={e => setSummaryDateTo(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                </div>
                            </div>
                            <button onClick={downloadSummaryReport}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors">
                                <Download className="w-4 h-4" /> Download Summary
                            </button>
                        </div>
                    )}
                </div>

            {/* Stats bar — daily mode, site selected */}
            {viewMode === 'daily' && !loading && currentSite && (
                <div className="space-y-3">
                    {([
                        {
                            icon: Users,
                            label: 'Total Staff',
                            value: String(totalUsers),
                            sub: 'Active employees',
                            bg: 'bg-indigo-50',
                            color: 'text-indigo-600',
                        },
                        {
                            icon: TrendingUp,
                            label: 'Recorded',
                            value: String(recordedCount),
                            sub: 'Tasks recorded',
                            bg: 'bg-emerald-50',
                            color: 'text-emerald-600',
                        },
                        {
                            icon: currentSite.OT_TYPE === 'time_based' ? Clock : Target,
                            label: 'OT Type',
                            value: currentSite.OT_TYPE === 'time_based' ? 'Time' : currentSite.OT_TYPE === 'target_based' ? 'Target' : 'Outsource',
                            sub: 'Overtime tracking',
                            bg: currentSite.OT_TYPE === 'time_based' ? 'bg-blue-50' : 'bg-violet-50',
                            color: currentSite.OT_TYPE === 'time_based' ? 'text-blue-600' : 'text-violet-600',
                        },
                    ] as const).map((stat) => {
                        const Icon = stat.icon;
                        return (
                            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4">
                                <div className={`w-11 h-11 ${stat.bg} rounded-xl flex items-center justify-center shrink-0`}>
                                    <Icon className={`w-5 h-5 ${stat.color}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                                    <p className="text-2xl font-black text-slate-900 leading-tight">{stat.value}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{stat.sub}</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Main content card */}
            <div className="card overflow-hidden">
                {loading ? (
                    <div className="p-5 space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="skeleton h-16 rounded-2xl" />
                        ))}
                    </div>

                ) : viewMode === 'summary' ? (
                    /* ── Summary view — kept exactly as before ── */
                    <div className="divide-y divide-slate-100">
                        {summaryData.length === 0 ? (
                            <div className="py-16 text-center">
                                <BarChart3 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-500 font-medium">No tasks found for the selected date range</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5">
                                    <div className="bg-indigo-50 rounded-2xl p-3 text-center shadow-sm">
                                        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Sites</p>
                                        <p className="text-2xl font-bold text-indigo-900 mt-1">{summaryData.length}</p>
                                    </div>
                                    <div className="bg-emerald-50 rounded-2xl p-3 text-center shadow-sm">
                                        <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Staff</p>
                                        <p className="text-2xl font-bold text-emerald-900 mt-1">{summaryData.reduce((s: number, d: any) => s + d.total_staff, 0)}</p>
                                    </div>
                                    <div className="bg-blue-50 rounded-2xl p-3 text-center shadow-sm">
                                        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Hours</p>
                                        <p className="text-2xl font-bold text-blue-900 mt-1">{summaryData.reduce((s: number, d: any) => s + (d.total_hours || 0), 0).toFixed(1)}</p>
                                    </div>
                                    <div className="bg-orange-50 rounded-2xl p-3 text-center shadow-sm">
                                        <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">Count</p>
                                        <p className="text-2xl font-bold text-orange-900 mt-1">{summaryData.reduce((s: number, d: any) => s + (d.total_count || 0), 0)}</p>
                                    </div>
                                </div>
                                {summaryData.map((site: any) => {
                                    const isExpanded = expandedSites.has(site.site_no);
                                    const toggle = () => setExpandedSites(prev => {
                                        const n = new Set(prev);
                                        isExpanded ? n.delete(site.site_no) : n.add(site.site_no);
                                        return n;
                                    });
                                    return (
                                        <div key={site.site_no} className="border-t border-slate-100">
                                            <button onClick={toggle} className="w-full px-5 py-4 flex items-center justify-between hover:bg-indigo-50/40 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                                    <div className="text-left">
                                                        <p className="font-semibold text-slate-800">{site.site_name}</p>
                                                        <p className="text-xs text-slate-500">#{site.site_no} &middot; {site.total_staff} staff</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-right hidden sm:block">
                                                        {site.site_ot_type === 'time_based' ? (
                                                            <p className="text-sm font-semibold text-blue-600">{(site.total_hours || 0).toFixed(1)} hrs</p>
                                                        ) : (
                                                            <p className="text-sm font-semibold text-violet-600">{site.total_count} units</p>
                                                        )}
                                                    </div>
                                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${site.site_ot_type === 'time_based' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
                                                        {site.site_ot_type === 'time_based' ? 'Time' : 'Target'}
                                                    </span>
                                                </div>
                                            </button>
                                            {isExpanded && (
                                                <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/50">
                                                    <table className="min-w-full divide-y divide-slate-100">
                                                        <thead>
                                                            <tr className="bg-slate-100/60">
                                                                <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                                                                <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                                                                <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Task</th>
                                                                {site.site_ot_type === 'target_based' && <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Count</th>}
                                                                {site.site_ot_type === 'time_based' && <>
                                                                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">In</th>
                                                                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Out</th>
                                                                    <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Count</th>
                                                                </>}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100 bg-white">
                                                            {site.tasks.map((task: any, i: number) => (
                                                                <tr key={i} className="hover:bg-slate-50">
                                                                    <td className="px-5 py-3 text-sm font-medium text-slate-900">{task.STAFF_NAME}</td>
                                                                    <td className="px-5 py-3 text-sm text-slate-500">{task.TASK_DATE ? format(new Date(String(task.TASK_DATE).slice(0, 10)), 'MMM d') : '—'}</td>
                                                                    <td className="px-5 py-3 text-sm text-slate-600">{task.TASK_DESCRIPTION}</td>
                                                                    {site.site_ot_type === 'target_based' && <td className="px-5 py-3 text-sm text-right font-mono font-medium text-slate-900">{task.COUNT}</td>}
                                                                    {site.site_ot_type === 'time_based' && <>
                                                                        <td className="px-5 py-3 text-sm font-mono text-emerald-700">{task.IN_TIME || '-'}</td>
                                                                        <td className="px-5 py-3 text-sm font-mono text-orange-700">{task.OUT_TIME || '-'}</td>
                                                                        <td className="px-5 py-3 text-sm text-right font-mono font-medium text-slate-900">{task.COUNT ?? 0}</td>
                                                                    </>}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>

                ) : selectedSite === 'ALL' ? (
                    /* All-sites download panel */
                    <div className="py-16 text-center space-y-4">
                        <Download className="w-12 h-12 text-slate-200 mx-auto" />
                        <div>
                            <p className="text-slate-700 font-semibold">All Sites selected</p>
                            <p className="text-slate-400 text-sm mt-1">Click Download to export all sites' tasks for {format(new Date(selectedDate), 'MMM dd, yyyy')}</p>
                        </div>
                        <button onClick={downloadDailyReport}
                            className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors text-sm">
                            <Download className="w-4 h-4" /> Download All Sites Report
                        </button>
                    </div>

                ) : (
                    /* ── Daily employee card list ── */
                    <>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <p className="text-sm font-bold text-slate-700">Employee Tasks</p>
                            {isPrivileged && users.length > 0 && (
                                <button onClick={() => openPanel({ mode: 'add', staffId: users[0].ID })}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors">
                                    <Plus className="w-3.5 h-3.5" /> Add Task
                                </button>
                            )}
                        </div>

                        {users.length === 0 ? (
                            <div className="py-16 text-center">
                                <UserIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-500 font-medium">No employees found for this site</p>
                            </div>
                        ) : (
                            <div>
                                {users.map((user) => {
                                    const site = getSite();
                                    const siteOtType = site?.OT_TYPE || 'time_based';
                                    const isTimeBased = siteOtType === 'time_based' || siteOtType === 'staff_outsource';
                                    const userTasks = tasks.filter(t => t.STAFF_ID === user.ID);
                                    const avatarColors = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-orange-100 text-orange-700', 'bg-blue-100 text-blue-700'];
                                    const avatarColor = avatarColors[user.ID % avatarColors.length];
                                    const canAdd = isPrivileged || (isStaff && user.ID === authUser?.ID);

                                    return (
                                        <div key={user.ID} className="flex items-center gap-3 px-5 py-4 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                                            {/* Avatar */}
                                            <div className={`w-11 h-11 rounded-full ${avatarColor} flex items-center justify-center font-black text-sm shrink-0`}>
                                                {user.NAME.charAt(0).toUpperCase()}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-bold text-slate-900 truncate">{user.NAME}</p>
                                                    {user.IS_TEMP === 1 && (
                                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Guest</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                    <p className="text-xs text-slate-400">ID: {user.EPF_NUMBER}</p>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isTimeBased ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                                                        {isTimeBased ? 'Time' : 'Target'}
                                                    </span>
                                                    {userTasks.length > 0 && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600">
                                                            {userTasks.length} task{userTasks.length !== 1 ? 's' : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Add Task button */}
                                            {canAdd && (
                                                <button onClick={() => openPanel({ mode: 'add', staffId: user.ID })}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-indigo-200 text-indigo-600 text-xs font-bold rounded-xl hover:bg-indigo-50 transition-colors shrink-0">
                                                    <Plus className="w-3.5 h-3.5" /> Add Task
                                                </button>
                                            )}

                                            {/* Three-dot menu */}
                                            <div className="relative shrink-0" data-menu>
                                                <button onClick={() => setOpenMenuId(openMenuId === user.ID ? null : user.ID)}
                                                    className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                                                    <MoreVertical className="w-4 h-4 text-slate-400" />
                                                </button>
                                                {openMenuId === user.ID && (
                                                    <div className="absolute right-0 top-9 w-64 bg-white rounded-2xl border border-slate-100 shadow-xl z-20 overflow-hidden">
                                                        {userTasks.length === 0 ? (
                                                            <p className="px-4 py-4 text-sm text-slate-400 text-center">No tasks recorded</p>
                                                        ) : (
                                                            <>
                                                                <p className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50">
                                                                    Tasks ({userTasks.length})
                                                                </p>
                                                                {userTasks.map(task => (
                                                                    <div key={task.ID} className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                                                                        <div className="flex-1 min-w-0"
                                                                            onClick={() => {
                                                                                if (isPrivileged) {
                                                                                    openPanel({ mode: 'edit', task });
                                                                                    setOpenMenuId(null);
                                                                                }
                                                                            }}>
                                                                            <p className={`text-sm font-semibold text-slate-800 truncate ${isPrivileged ? 'cursor-pointer hover:text-indigo-600' : ''}`}>
                                                                                {task.TASK_DESCRIPTION}
                                                                            </p>
                                                                            <p className="text-xs text-slate-400">
                                                                                Count: {task.COUNT}{task.IN_TIME ? ` · ${task.IN_TIME}–${task.OUT_TIME}` : ''}
                                                                            </p>
                                                                        </div>
                                                                        {isPrivileged && (
                                                                            <button
                                                                                onClick={() => { handleDeleteTask(task.ID); setOpenMenuId(null); }}
                                                                                disabled={deletingIds.has(task.ID)}
                                                                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0 disabled:opacity-40">
                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>

        </div> {/* end main content wrapper with mr-[45%] */}

        {/* Mobile backdrop */}
        {panelState && (
            <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={closePanel} />
        )}

        {/* Slide panel */}
        <div className={`fixed inset-y-0 right-0 z-40 w-full md:w-[45%] bg-white flex flex-col shadow-2xl border-l border-slate-100 transform transition-transform duration-300 ease-in-out ${panelState ? 'translate-x-0' : 'translate-x-full'}`}>
            {panelState && (() => {
                const staffId = panelState.mode === 'add' ? panelState.staffId : panelState.task.STAFF_ID;
                const staff = users.find(u => u.ID === staffId);
                const site = getSite();
                const siteOtType = site?.OT_TYPE || 'time_based';
                const showTimeCols = siteOtType === 'time_based' || siteOtType === 'staff_outsource';
                const isEdit = panelState.mode === 'edit';

                return (
                    <>
                        {/* Panel header */}
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                            <button onClick={closePanel}
                                className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                                <ArrowLeft className="w-5 h-5 text-slate-600" />
                            </button>
                            <div>
                                <h2 className="text-base font-black text-slate-900">{isEdit ? 'Edit Task' : 'Add Task'}</h2>
                                {staff && <p className="text-xs text-slate-400">{staff.NAME} (ID: {staff.EPF_NUMBER})</p>}
                            </div>
                        </div>

                        {/* Scrollable body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {/* Employee context card */}
                            {staff && (
                                <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                                        {staff.NAME.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">{staff.NAME}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <p className="text-xs text-slate-400">ID: {staff.EPF_NUMBER}</p>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${showTimeCols ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                                                {siteOtType === 'time_based' ? 'Time' : siteOtType === 'target_based' ? 'Target' : 'Outsource'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Header accent card */}
                            <div className="flex items-center gap-3 bg-indigo-50 rounded-2xl px-4 py-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                                    <BarChart3 className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-indigo-900">{isEdit ? 'Edit Task' : 'Add Task'}</p>
                                    <p className="text-xs text-indigo-500">{isEdit ? 'Update task details below' : 'Add a new task for this employee'}</p>
                                </div>
                            </div>

                            {/* Form */}
                            <div className="space-y-4">
                                {/* Task Type */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                                        Task Type <span className="text-red-500">*</span>
                                    </label>
                                    <select value={panelTaskType} onChange={e => setPanelTaskType(e.target.value)}
                                        className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-700 bg-white focus:outline-none focus:border-indigo-500 transition-colors">
                                        <option value="">Select Task</option>
                                        {site?.TASK_TYPES?.map(tt => (
                                            <option key={tt.TASK_NAME} value={tt.TASK_NAME}>{tt.TASK_NAME}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Count */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                                        Count <span className="text-red-500">*</span>
                                    </label>
                                    <input type="number" min="0" value={panelCount}
                                        onChange={e => setPanelCount(Number(e.target.value))}
                                        onKeyDown={e => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                                        className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors" />
                                </div>

                                {/* Task Date */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                                        Task Date <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                        <input type="date" value={panelDate}
                                            readOnly={isStaff || role === 'supervisor'}
                                            onChange={isStaff || role === 'supervisor' ? undefined : e => setPanelDate(e.target.value)}
                                            className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors" />
                                    </div>
                                </div>

                                {/* In / Out Time */}
                                {showTimeCols && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">In Time</label>
                                            <div className="relative">
                                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                                <input type="time" value={panelInTime} onChange={e => setPanelInTime(e.target.value)}
                                                    className="w-full pl-10 pr-3 py-3 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Out Time</label>
                                            <div className="relative">
                                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                                <input type="time" value={panelOutTime} onChange={e => setPanelOutTime(e.target.value)}
                                                    className="w-full pl-10 pr-3 py-3 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Error */}
                            {panelError && (
                                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                                    <p className="text-sm text-red-600">{panelError}</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-5 space-y-3 border-t border-slate-100 shrink-0">
                            <button onClick={handlePanelSave} disabled={panelSaving}
                                className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold rounded-2xl transition-colors text-sm">
                                {panelSaving ? (
                                    <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving...</>
                                ) : (
                                    <><Save className="w-4 h-4" /> {isEdit ? 'Update Task' : 'Save Task'}</>
                                )}
                            </button>
                            <button onClick={closePanel}
                                className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-colors text-sm">
                                <X className="w-4 h-4" /> Cancel
                            </button>
                        </div>
                    </>
                );
            })()}
        </div>

    </div> {/* end relative outer wrapper */}
    );
};

export default Tasks;
