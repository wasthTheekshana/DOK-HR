import React, { useEffect, useState } from 'react';
import api from '../services/api';
import type { Task, Site, User } from '../types';
import { Calendar, MapPin, Target, Save, Loader2, User as UserIcon, BarChart3, LayoutList, Clock, ChevronRight, TrendingUp, Users, Plus, Trash2, Pencil, X, Check } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';

const TaskTypeSelect: React.FC<{ value: string; onChange: (v: string) => void; taskTypes: any[] }> = ({ value, onChange, taskTypes }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
        <option value="">Select Task</option>
        {taskTypes.map((t: any) => <option key={t.TASK_NAME} value={t.TASK_NAME}>{t.TASK_NAME}</option>)}
    </select>
);

const Tasks: React.FC = () => {
    const { role, user: authUser } = useAuth();
    const isStaff = role === 'staff';
    const today = format(new Date(), 'yyyy-MM-dd');
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState<string>('');
    const [selectedDate, setSelectedDate] = useState<string>(today);
    const [viewMode, setViewMode] = useState<'daily' | 'summary'>('daily');
    const [summaryDateFrom, setSummaryDateFrom] = useState<string>(format(new Date(new Date().setDate(new Date().getDate() - 7)), 'yyyy-MM-dd'));
    const [summaryDateTo, setSummaryDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
    const [users, setUsers] = useState<User[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [summaryData, setSummaryData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    // newDrafts: staffId → array of new unsaved task forms
    const [newDrafts, setNewDrafts] = useState<Record<number, Array<{ _tid: string } & Partial<Task>>>>({});
    // editDrafts: taskId → edited field values
    const [editDrafts, setEditDrafts] = useState<Record<number, Partial<Task>>>({});
    const [savingIds, setSavingIds] = useState<Set<string | number>>(new Set());
    const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

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
                setNewDrafts({});
                setEditDrafts({});
                return;
            }

            const [siteRes, usersRes, tasksRes] = await Promise.all([
                api.get(`/sites/${siteBasic.ID}`),
                api.get(`/users?site=${siteBasic.ID}&role=staff,supervisor&status=active`),
                api.get(`/tasks?site_no=${selectedSite}&date_from=${selectedDate}&date_to=${selectedDate}`)
            ]);
            const allUsers = usersRes.data;
            setUsers(allUsers);
            setTasks(tasksRes.data);
            setSites(prev => prev.map(s => s.ID === siteBasic.ID ? siteRes.data : s));
            setNewDrafts({});
            setEditDrafts({});
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

    const getSite = () => sites.find(s => s.SITE_NO === selectedSite);

    // ── New task draft helpers ──
    const addNewDraft = (staffId: number) => {
        const site = getSite();
        const siteOtType = site?.OT_TYPE || 'time_based';
        const taskOtType = siteOtType === 'staff_outsource' ? 'time_based' : siteOtType;
        // Pre-fill in/out from first existing task of this staff (time_based)
        const existing = tasks.filter(t => t.STAFF_ID === staffId);
        const firstTask = existing[0];
        setNewDrafts(prev => ({
            ...prev,
            [staffId]: [...(prev[staffId] || []), {
                _tid: `${staffId}_${Date.now()}`,
                TASK_DESCRIPTION: '',
                OT_TYPE: taskOtType,
                COUNT: 0, TARGET: 0, INVOICE_PRICE: 0, PAY_UNIT_PRICE: 0,
                IN_TIME: firstTask?.IN_TIME || '',
                OUT_TIME: firstTask?.OUT_TIME || '',
            }]
        }));
    };

    const updateNewDraft = (staffId: number, _tid: string, field: string, value: any) => {
        setNewDrafts(prev => ({
            ...prev,
            [staffId]: (prev[staffId] || []).map(d => d._tid === _tid ? { ...d, [field]: value } : d)
        }));
    };

    const cancelNewDraft = (staffId: number, _tid: string) => {
        setNewDrafts(prev => ({ ...prev, [staffId]: (prev[staffId] || []).filter(d => d._tid !== _tid) }));
    };

    const saveNewTask = async (staffId: number, _tid: string) => {
        const site = getSite();
        if (!site) return;
        const draft = (newDrafts[staffId] || []).find(d => d._tid === _tid);
        if (!draft || !draft.TASK_DESCRIPTION) { alert('Please select a task type'); return; }
        setSavingIds(prev => new Set(prev).add(_tid));
        try {
            const siteOtType = site.OT_TYPE || 'time_based';
            const taskOtType = siteOtType === 'staff_outsource' ? 'time_based' : siteOtType;
            await api.post('/tasks', {
                site_id: site.ID, staff_id: staffId, task_date: selectedDate,
                task_description: draft.TASK_DESCRIPTION, ot_type: taskOtType,
                count: Number(draft.COUNT || 0), target: Number(draft.TARGET || 0),
                invoice_price: Number(draft.INVOICE_PRICE || 0), pay_unit_price: Number(draft.PAY_UNIT_PRICE || 0),
                in_time: draft.IN_TIME || null, out_time: draft.OUT_TIME || null
            });
            cancelNewDraft(staffId, _tid);
            await loadDailySheet();
        } catch (err) { console.error(err); alert('Failed to save task'); }
        finally { setSavingIds(prev => { const n = new Set(prev); n.delete(_tid); return n; }); }
    };

    // ── Edit existing task helpers ──
    const startEditTask = (task: Task) => {
        setEditDrafts(prev => ({ ...prev, [task.ID]: { ...task } }));
    };

    const updateEditDraft = (taskId: number, field: string, value: any) => {
        setEditDrafts(prev => ({ ...prev, [taskId]: { ...prev[taskId], [field]: value } }));
    };

    const cancelEditTask = (taskId: number) => {
        setEditDrafts(prev => { const n = { ...prev }; delete n[taskId]; return n; });
    };

    const saveEditTask = async (taskId: number) => {
        const site = getSite();
        if (!site) return;
        const draft = editDrafts[taskId];
        if (!draft) return;
        setSavingIds(prev => new Set(prev).add(taskId));
        try {
            await api.patch(`/tasks/${taskId}`, {
                task_description: draft.TASK_DESCRIPTION, ot_type: draft.OT_TYPE,
                count: Number(draft.COUNT || 0), target: Number(draft.TARGET || 0),
                invoice_price: Number(draft.INVOICE_PRICE || 0), pay_unit_price: Number(draft.PAY_UNIT_PRICE || 0),
                in_time: draft.IN_TIME || null, out_time: draft.OUT_TIME || null,
                task_date: selectedDate
            });
            cancelEditTask(taskId);
            await loadDailySheet();
        } catch (err) { console.error(err); alert('Failed to update task'); }
        finally { setSavingIds(prev => { const n = new Set(prev); n.delete(taskId); return n; }); }
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
        <div className="space-y-5">
            {/* Header */}
            <div className="card p-5">
                <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-[17px] font-bold text-slate-900 tracking-tight">Daily Task Sheet</h1>
                            <p className="text-sm text-slate-500 mt-0.5">{isStaff ? 'Add your tasks for today' : 'Manage tasks for all employees'}</p>
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
                            {!isStaff && (
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
                            )}
                            <div className="sm:w-48">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="date"
                                        value={selectedDate}
                                        onChange={isStaff ? undefined : (e) => setSelectedDate(e.target.value)}
                                        min={isStaff || role === 'supervisor' ? today : undefined}
                                        max={isStaff || role === 'supervisor' ? today : undefined}
                                        readOnly={isStaff || role === 'supervisor'}
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
            <div className="card overflow-hidden">
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
                    /* Daily Sheet — grouped by staff, multiple tasks per person */
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-48">Task Type</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Count</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">In Time</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Out Time</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            {users.length === 0 ? (
                                <tbody>
                                    <tr>
                                        <td colSpan={5} className="px-6 py-16 text-center">
                                            <UserIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                            <p className="text-slate-500 font-medium">No employees found for this site</p>
                                        </td>
                                    </tr>
                                </tbody>
                            ) : users.map(user => {
                                const site = getSite();
                                const siteTaskTypes = site?.TASK_TYPES || [];
                                const siteOtType = site?.OT_TYPE || 'time_based';
                                const isTimeBased = siteOtType === 'time_based' || siteOtType === 'staff_outsource';
                                const userTasks = tasks.filter(t => t.STAFF_ID === user.ID);
                                const userNewDrafts = newDrafts[user.ID] || [];

                                return (
                                    <tbody key={user.ID} className="border-t-2 border-slate-200">
                                        {/* Staff header row */}
                                        <tr className="bg-slate-50">
                                            <td colSpan={4} className="px-5 py-2.5">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
                                                        {user.NAME.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <span className="text-sm font-bold text-slate-900">{user.NAME}</span>
                                                        <span className="text-xs text-slate-400 ml-2">{user.EPF_NUMBER}</span>
                                                    </div>
                                                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${isTimeBased ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700'}`}>
                                                        {isTimeBased ? 'Time' : 'Target'}
                                                    </span>
                                                    {userTasks.length > 0 && (
                                                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-600">
                                                            {userTasks.length} task{userTasks.length > 1 ? 's' : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <button onClick={() => addNewDraft(user.ID)}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-all active:scale-95 ml-auto">
                                                    <Plus className="w-3.5 h-3.5" /> Add Task
                                                </button>
                                            </td>
                                        </tr>

                                        {/* Existing task rows */}
                                        {userTasks.map(task => {
                                            const isEditing = !!editDrafts[task.ID];
                                            const ed = editDrafts[task.ID] || {};
                                            const isSaving = savingIds.has(task.ID);
                                            const isDeleting = deletingIds.has(task.ID);
                                            return (
                                                <tr key={task.ID} className={`border-t border-slate-100 transition-colors ${isEditing ? 'bg-amber-50/40' : 'hover:bg-slate-50/40'}`}>
                                                    <td className="px-5 py-3">
                                                        {isEditing
                                                            ? <TaskTypeSelect value={ed.TASK_DESCRIPTION || ''} onChange={v => updateEditDraft(task.ID, 'TASK_DESCRIPTION', v)} taskTypes={siteTaskTypes} />
                                                            : <span className="text-sm font-medium text-slate-800">{task.TASK_DESCRIPTION || '—'}</span>}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {isEditing
                                                            ? <input type="number" value={ed.COUNT ?? task.COUNT ?? 0} onChange={e => updateEditDraft(task.ID, 'COUNT', e.target.value)}
                                                                className="w-20 px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 text-center" />
                                                            : <span className="text-sm font-mono text-slate-700">{task.COUNT ?? 0}</span>}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {isTimeBased
                                                            ? isEditing
                                                                ? <input type="time" value={ed.IN_TIME || ''} onChange={e => updateEditDraft(task.ID, 'IN_TIME', e.target.value)}
                                                                    className="w-32 px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                                                                : <span className="text-sm font-mono text-emerald-700">{task.IN_TIME || '—'}</span>
                                                            : <span className="text-slate-300 text-sm">—</span>}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {isTimeBased
                                                            ? isEditing
                                                                ? <input type="time" value={ed.OUT_TIME || ''} onChange={e => updateEditDraft(task.ID, 'OUT_TIME', e.target.value)}
                                                                    className="w-32 px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                                                                : <span className="text-sm font-mono text-orange-700">{task.OUT_TIME || '—'}</span>
                                                            : <span className="text-slate-300 text-sm">—</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {isEditing ? (
                                                            <div className="flex items-center justify-end gap-1">
                                                                <button onClick={() => saveEditTask(task.ID)} disabled={isSaving}
                                                                    className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-60">
                                                                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                                </button>
                                                                <button onClick={() => cancelEditTask(task.ID)}
                                                                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                                                    <X className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ) : isStaff ? (
                                                            <span className="text-xs text-slate-300 pr-1">saved</span>
                                                        ) : (
                                                            <div className="flex items-center justify-end gap-1">
                                                                <button onClick={() => startEditTask(task)}
                                                                    className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                                                    <Pencil className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button onClick={() => handleDeleteTask(task.ID)} disabled={isDeleting}
                                                                    className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50">
                                                                    {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}

                                        {/* New task draft rows */}
                                        {userNewDrafts.map(draft => {
                                            const isSaving = savingIds.has(draft._tid);
                                            return (
                                                <tr key={draft._tid} className="border-t border-dashed border-indigo-200 bg-indigo-50/30">
                                                    <td className="px-5 py-3">
                                                        <TaskTypeSelect value={draft.TASK_DESCRIPTION || ''}
                                                            onChange={v => {
                                                                const typeConfig = siteTaskTypes.find((t: any) => t.TASK_NAME === v);
                                                                updateNewDraft(user.ID, draft._tid, 'TASK_DESCRIPTION', v);
                                                                if (typeConfig) updateNewDraft(user.ID, draft._tid, 'INVOICE_PRICE', typeConfig.INVOICE_PRICE);
                                                            }} taskTypes={siteTaskTypes} />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input type="number" value={draft.COUNT ?? 0} onChange={e => updateNewDraft(user.ID, draft._tid, 'COUNT', e.target.value)}
                                                            className="w-20 px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 text-center" placeholder="0" />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {isTimeBased
                                                            ? <input type="time" value={draft.IN_TIME || ''} onChange={e => updateNewDraft(user.ID, draft._tid, 'IN_TIME', e.target.value)}
                                                                className="w-32 px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                                                            : <span className="text-slate-300 text-sm">—</span>}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {isTimeBased
                                                            ? <input type="time" value={draft.OUT_TIME || ''} onChange={e => updateNewDraft(user.ID, draft._tid, 'OUT_TIME', e.target.value)}
                                                                className="w-32 px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                                                            : <span className="text-slate-300 text-sm">—</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button onClick={() => saveNewTask(user.ID, draft._tid)} disabled={isSaving}
                                                                className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-60">
                                                                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                                            </button>
                                                            <button onClick={() => cancelNewDraft(user.ID, draft._tid)}
                                                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}

                                        {/* Empty state for this staff */}
                                        {userTasks.length === 0 && userNewDrafts.length === 0 && (
                                            <tr className="border-t border-slate-100">
                                                <td colSpan={5} className="px-5 py-3 text-xs text-slate-400 italic">
                                                    No tasks recorded — click Add Task
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                );
                            })}
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Tasks;
