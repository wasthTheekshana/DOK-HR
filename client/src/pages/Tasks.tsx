import React, { useEffect, useState } from 'react';
import api from '../services/api';
import type { Task, Site, User } from '../types';
import { Calendar, MapPin, Target, Save, Loader2, User as UserIcon, BarChart3, LayoutList, Clock, ChevronRight, TrendingUp, Users } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';

const Tasks: React.FC = () => {
    const { role } = useAuth();
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState<string>('');
    const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [viewMode, setViewMode] = useState<'daily' | 'summary'>('daily');
    const [summaryDateFrom, setSummaryDateFrom] = useState<string>(format(new Date(new Date().setDate(new Date().getDate() - 7)), 'yyyy-MM-dd'));
    const [summaryDateTo, setSummaryDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
    const [users, setUsers] = useState<User[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [summaryData, setSummaryData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [drafts, setDrafts] = useState<Record<number, Partial<Task>>>({});
    const [savingRows, setSavingRows] = useState<Record<number, boolean>>({});

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

    const fetchSites = async () => {
        try {
            const response = await api.get('/sites');
            setSites(response.data);
            if (response.data.length > 0) setSelectedSite(response.data[0].SITE_NO);
        } catch (error) { console.error('Failed to fetch sites', error); }
    };

    const loadDailySheet = async () => {
        setLoading(true);
        try {
            const siteBasic = sites.find(s => s.SITE_NO === selectedSite);
            if (!siteBasic) return;
            const [siteRes, usersRes, tasksRes] = await Promise.all([
                api.get(`/sites/${siteBasic.ID}`),
                api.get(`/users?site=${siteBasic.ID}&role=staff,supervisor`),
                api.get(`/tasks?site_no=${selectedSite}&date_from=${selectedDate}&date_to=${selectedDate}`)
            ]);
            setUsers(usersRes.data);
            setTasks(tasksRes.data);
            setSites(prev => prev.map(s => s.ID === siteBasic.ID ? siteRes.data : s));
            setDrafts({});
        } catch (error) { console.error('Failed to load daily sheet', error); }
        finally { setLoading(false); }
    };

    const loadSummaryData = async () => {
        setLoading(true);
        try {
            const params: any = { date: summaryDateFrom };
            if (summaryDateTo && summaryDateTo !== summaryDateFrom) params.date_to = summaryDateTo;
            const response = await api.get('/tasks/daily-summary', { params });
            setSummaryData(response.data);
        } catch (error) { console.error('Failed to load summary', error); }
        finally { setLoading(false); }
    };

    const handleDraftChange = (staffId: number, field: keyof Task, value: any) => {
        setDrafts(prev => ({ ...prev, [staffId]: { ...prev[staffId], [field]: value } }));
    };

    const handleSaveRow = async (user: User, existingTask?: Task) => {
        const draft = drafts[user.ID];
        if (!draft) return;
        setSavingRows(prev => ({ ...prev, [user.ID]: true }));
        try {
            const site = sites.find(s => s.SITE_NO === selectedSite);
            if (!site) throw new Error('Site not found');
            const baseTask = existingTask || {
                TASK_DESCRIPTION: 'Scanning', OT_TYPE: 'time_based',
                COUNT: 0, TARGET: 0, INVOICE_PRICE: 0, PAY_UNIT_PRICE: 0, IN_TIME: null, OUT_TIME: null
            };
            const merged = { ...baseTask, ...draft };
            const payload = {
                site_id: site.ID, staff_id: user.ID, task_date: selectedDate,
                task_description: merged.TASK_DESCRIPTION, ot_type: merged.OT_TYPE,
                count: Number(merged.COUNT), target: Number(merged.TARGET),
                invoice_price: Number(merged.INVOICE_PRICE), pay_unit_price: Number(merged.PAY_UNIT_PRICE),
                in_time: merged.IN_TIME || null, out_time: merged.OUT_TIME || null
            };
            if (existingTask) { await api.patch(`/tasks/${existingTask.ID}`, payload); }
            else { await api.post('/tasks', payload); }
            setDrafts(prev => { const n = { ...prev }; delete n[user.ID]; return n; });
            await loadDailySheet();
        } catch (error) { console.error('Failed to save task', error); alert('Failed to save task'); }
        finally { setSavingRows(prev => ({ ...prev, [user.ID]: false })); }
    };

    const getValue = (user: User, task: Task | undefined, field: keyof Task, defaultValue: any = '') => {
        if (drafts[user.ID] && drafts[user.ID][field] !== undefined) return drafts[user.ID][field];
        if (task) return task[field];
        return defaultValue;
    };

    const currentSite = sites.find(s => s.SITE_NO === selectedSite);
    const recordedCount = tasks.length;
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
        <div className="space-y-5">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Daily Task Sheet</h1>
                            <p className="text-sm text-slate-500 mt-0.5">Manage tasks for all employees</p>
                        </div>
                        {role === 'admin' && (
                            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                                <button
                                    onClick={() => setViewMode('daily')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${viewMode === 'daily' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <LayoutList className="w-3.5 h-3.5" />
                                    Daily
                                </button>
                                <button
                                    onClick={() => setViewMode('summary')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${viewMode === 'summary' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <BarChart3 className="w-3.5 h-3.5" />
                                    Summary
                                </button>
                            </div>
                        )}
                    </div>

                    {viewMode === 'daily' ? (
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Site</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <select
                                        value={selectedSite}
                                        onChange={(e) => setSelectedSite(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    >
                                        {sites.map(s => <option key={s.ID} value={s.SITE_NO}>{s.NAME}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="sm:w-48">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="date"
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">From Date</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input type="date" value={summaryDateFrom} onChange={(e) => setSummaryDateFrom(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                </div>
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">To Date</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input type="date" value={summaryDateTo} onChange={(e) => setSummaryDateTo(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Stats Bar (Daily mode only) */}
            {viewMode === 'daily' && !loading && currentSite && (
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                        <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center">
                            <Users className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 font-medium">Total Staff</p>
                            <p className="text-lg font-bold text-slate-900">{totalUsers}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 font-medium">Recorded</p>
                            <p className="text-lg font-bold text-slate-900">{recordedCount}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${currentSite.OT_TYPE === 'time_based' ? 'bg-blue-50' : 'bg-violet-50'}`}>
                            {currentSite.OT_TYPE === 'time_based'
                                ? <Clock className="w-4 h-4 text-blue-600" />
                                : <Target className="w-4 h-4 text-violet-600" />
                            }
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 font-medium">OT Type</p>
                            <p className="text-sm font-bold text-slate-900">{currentSite.OT_TYPE === 'time_based' ? 'Time' : 'Target'}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="skeleton h-14 rounded-xl" />
                        ))}
                    </div>
                ) : viewMode === 'summary' ? (
                    <div className="divide-y divide-slate-100">
                        {summaryData.length === 0 ? (
                            <div className="py-16 text-center">
                                <BarChart3 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-500 font-medium">No tasks found for the selected date range</p>
                            </div>
                        ) : (
                            <>
                                {/* Summary Stats */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5">
                                    <div className="bg-indigo-50 rounded-xl p-3 text-center">
                                        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Sites</p>
                                        <p className="text-2xl font-bold text-indigo-900 mt-1">{summaryData.length}</p>
                                    </div>
                                    <div className="bg-emerald-50 rounded-xl p-3 text-center">
                                        <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Staff</p>
                                        <p className="text-2xl font-bold text-emerald-900 mt-1">{summaryData.reduce((s, d) => s + d.total_staff, 0)}</p>
                                    </div>
                                    <div className="bg-blue-50 rounded-xl p-3 text-center">
                                        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Hours</p>
                                        <p className="text-2xl font-bold text-blue-900 mt-1">{summaryData.reduce((s, d) => s + (d.total_hours || 0), 0).toFixed(1)}</p>
                                    </div>
                                    <div className="bg-orange-50 rounded-xl p-3 text-center">
                                        <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">Count</p>
                                        <p className="text-2xl font-bold text-orange-900 mt-1">{summaryData.reduce((s, d) => s + (d.total_count || 0), 0)}</p>
                                    </div>
                                </div>

                                {/* Site Accordions */}
                                {summaryData.map((site: any) => {
                                    const isExpanded = expandedSites.has(site.site_no);
                                    const toggle = () => setExpandedSites(prev => {
                                        const n = new Set(prev);
                                        isExpanded ? n.delete(site.site_no) : n.add(site.site_no);
                                        return n;
                                    });
                                    return (
                                        <div key={site.site_no} className="border-t border-slate-100">
                                            <button onClick={toggle} className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
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
                                                                {site.site_ot_type === 'target_based' && (
                                                                    <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Count</th>
                                                                )}
                                                                {site.site_ot_type === 'time_based' && (
                                                                    <>
                                                                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">In</th>
                                                                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Out</th>
                                                                    </>
                                                                )}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100 bg-white">
                                                            {site.tasks.map((task: any, i: number) => (
                                                                <tr key={i} className="hover:bg-slate-50">
                                                                    <td className="px-5 py-3 text-sm font-medium text-slate-900">{task.STAFF_NAME}</td>
                                                                    <td className="px-5 py-3 text-sm text-slate-500">{format(new Date(task.TASK_DATE), 'MMM d')}</td>
                                                                    <td className="px-5 py-3 text-sm text-slate-600">{task.TASK_DESCRIPTION}</td>
                                                                    {site.site_ot_type === 'target_based' && (
                                                                        <td className="px-5 py-3 text-sm text-right font-mono font-medium text-slate-900">{task.COUNT}</td>
                                                                    )}
                                                                    {site.site_ot_type === 'time_based' && (
                                                                        <>
                                                                            <td className="px-5 py-3 text-sm font-mono text-emerald-700">{task.IN_TIME || '-'}</td>
                                                                            <td className="px-5 py-3 text-sm font-mono text-orange-700">{task.OUT_TIME || '-'}</td>
                                                                        </>
                                                                    )}
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
                ) : (
                    /* Daily Sheet Table */
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-56">Employee</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Task Type</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">OT Mode</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Count</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">In Time</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Out Time</th>
                                    <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Save</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 bg-white">
                                {users.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-16 text-center">
                                            <UserIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                            <p className="text-slate-500 font-medium">No employees found for this site</p>
                                        </td>
                                    </tr>
                                ) : users.map(user => {
                                    const task = tasks.find(t => t.STAFF_ID === user.ID);
                                    const hasDraft = !!drafts[user.ID];
                                    const isSaving = savingRows[user.ID];
                                    const site = sites.find(s => s.SITE_NO === selectedSite);
                                    const siteTaskTypes = site?.TASK_TYPES || [];
                                    const siteOtType = site?.OT_TYPE || 'time_based';
                                    const taskType = getValue(user, task, 'TASK_DESCRIPTION', '');
                                    const count = getValue(user, task, 'COUNT', 0);
                                    const inTime = getValue(user, task, 'IN_TIME', '');
                                    const outTime = getValue(user, task, 'OUT_TIME', '');

                                    const onTaskTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
                                        const newType = e.target.value;
                                        const typeConfig = siteTaskTypes.find((t: any) => t.TASK_NAME === newType);
                                        handleDraftChange(user.ID, 'TASK_DESCRIPTION', newType);
                                        // staff_outsource sites track time (in/out), treat as time_based at task level
                                        const taskOtType = siteOtType === 'staff_outsource' ? 'time_based' : siteOtType;
                                        handleDraftChange(user.ID, 'OT_TYPE', taskOtType);
                                        if (typeConfig) handleDraftChange(user.ID, 'INVOICE_PRICE', typeConfig.INVOICE_PRICE);
                                    };

                                    return (
                                        <tr key={user.ID} className={`group transition-colors ${hasDraft ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60'}`}>
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-xs shrink-0">
                                                        {user.NAME.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-slate-900 truncate">{user.NAME}</p>
                                                        <p className="text-xs text-slate-400">{user.EPF_NUMBER}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <select
                                                    value={taskType}
                                                    onChange={onTaskTypeChange}
                                                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                                >
                                                    <option value="">Select Task</option>
                                                    {siteTaskTypes.map((type: any) => (
                                                        <option key={type.TASK_NAME} value={type.TASK_NAME}>{type.TASK_NAME}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${siteOtType === 'time_based' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
                                                    {siteOtType === 'time_based' ? 'Time' : 'Target'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                {siteOtType === 'target_based' ? (
                                                    <input
                                                        type="number"
                                                        value={count}
                                                        onChange={(e) => handleDraftChange(user.ID, 'COUNT', e.target.value)}
                                                        className="w-20 px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-center"
                                                        placeholder="0"
                                                    />
                                                ) : <span className="text-slate-300 text-sm pl-2">—</span>}
                                            </td>
                                            <td className="px-4 py-3.5">
                                                {siteOtType === 'time_based' ? (
                                                    <input
                                                        type="time"
                                                        value={inTime || ''}
                                                        onChange={(e) => handleDraftChange(user.ID, 'IN_TIME', e.target.value)}
                                                        className="w-32 px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                                    />
                                                ) : <span className="text-slate-300 text-sm pl-2">—</span>}
                                            </td>
                                            <td className="px-4 py-3.5">
                                                {siteOtType === 'time_based' ? (
                                                    <input
                                                        type="time"
                                                        value={outTime || ''}
                                                        onChange={(e) => handleDraftChange(user.ID, 'OUT_TIME', e.target.value)}
                                                        className="w-32 px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                                    />
                                                ) : <span className="text-slate-300 text-sm pl-2">—</span>}
                                            </td>
                                            <td className="px-4 py-3.5 text-right">
                                                <button
                                                    onClick={() => handleSaveRow(user, task)}
                                                    disabled={!hasDraft || isSaving}
                                                    className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${hasDraft ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 active:scale-95' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                                                    title={hasDraft ? 'Save changes' : 'No changes'}
                                                >
                                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Tasks;
