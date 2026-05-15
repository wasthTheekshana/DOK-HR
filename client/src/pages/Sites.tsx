import React, { useEffect, useState } from 'react';
import api from '../services/api';
import type { Site, User } from '../types';
import { Plus, Edit, Trash2, MapPin, Users as UsersIcon, Target, Clock, X, Briefcase, Building2, DollarSign, Eye, ChevronRight, Search, PowerOff, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const SERVICE_TYPES = ['Physical', 'Scanning', 'Data entry', 'Insurance Policy', 'Staff outsource', 'DMS'];
const SITE_TYPES    = ['Insurance', 'Bank', 'Hospital', 'Tele', 'Finance'];

const OT_TYPE_CONFIG = {
    time_based:      { label: 'Time Based',     color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', icon: Clock    },
    target_based:    { label: 'Target Based',   color: 'bg-violet-100 text-violet-700',  dot: 'bg-violet-500',  icon: Target   },
    staff_outsource: { label: 'Staff Outsource',color: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-500',  icon: UsersIcon },
};

const Sites: React.FC = () => {
    const { role } = useAuth();
    const [sites, setSites] = useState<Site[]>([]);
    const [supervisors, setSupervisors] = useState<User[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    // Search + status + responsible person filter
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
    const [personFilter, setPersonFilter] = useState<string>(''); // responsible person name

    // Modals
    const [isFormOpen, setIsFormOpen]     = useState(false);
    const [viewingSite, setViewingSite]   = useState<Site | null>(null);
    const [editingSite, setEditingSite]   = useState<Site | null>(null);

    // Form state
    const [siteNo, setSiteNo]                       = useState('');
    const [name, setName]                           = useState('');
    const [supervisorId, setSupervisorId]           = useState<number | ''>('');
    const [responsiblePersonId, setResponsiblePersonId] = useState<number | ''>('');
    const [dailyTarget, setDailyTarget]             = useState<number>(0);
    const [otType, setOtType]                       = useState<'time_based' | 'target_based' | 'staff_outsource'>('time_based');
    const [serviceType, setServiceType]             = useState('');
    const [siteType, setSiteType]                   = useState('');
    const [taskTypes, setTaskTypes]                 = useState<{ task_name: string; invoice_price: number }[]>([]);
    const [costFactors, setCostFactors]             = useState<{ key: string; value: string }[]>([]);
    const [siteStatus, setSiteStatus]               = useState<'active' | 'inactive'>('active');
    const [saving, setSaving]                       = useState(false);

    useEffect(() => { fetchSites(); fetchSupervisors(); fetchAllUsers(); }, []);

    const fetchSites = async () => {
        try { const r = await api.get('/sites'); setSites(r.data); }
        catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const fetchSupervisors = async () => {
        try { const r = await api.get('/users?role=supervisor'); setSupervisors(r.data); }
        catch (e) { console.error(e); }
    };

    const fetchAllUsers = async () => {
        try { const r = await api.get('/users'); setAllUsers(r.data); }
        catch (e) { console.error(e); }
    };

    const resetForm = () => {
        setSiteNo(''); setName(''); setSupervisorId(''); setResponsiblePersonId('');
        setDailyTarget(0); setOtType('time_based'); setSiteStatus('active');
        setServiceType(''); setSiteType('');
        setTaskTypes([{ task_name: '', invoice_price: 0 }]);
        setCostFactors([]);
    };

    const handleOpenForm = (site?: Site) => {
        if (site) {
            setEditingSite(site);
            setSiteNo(site.SITE_NO);
            setName(site.NAME);
            setSupervisorId(site.SUPERVISOR_ID || '');
            setResponsiblePersonId(site.RESPONSIBLE_PERSON_ID || '');
            setDailyTarget(site.DAILY_TARGET || 0);
            const validOtTypes = ['time_based', 'target_based', 'staff_outsource'] as const;
            const ot = validOtTypes.includes(site.OT_TYPE as any) ? (site.OT_TYPE as 'time_based' | 'target_based' | 'staff_outsource') : 'time_based';
            setOtType(ot);
            setSiteStatus(site.STATUS === 'inactive' ? 'inactive' : 'active');
            setServiceType(site.SERVICE_TYPE || '');
            setSiteType(site.SITE_TYPE || '');
            setTaskTypes(site.TASK_TYPES?.length ? site.TASK_TYPES.map(t => ({ task_name: t.TASK_NAME, invoice_price: t.INVOICE_PRICE })) : []);
            setCostFactors(site.COST_FACTORS?.length ? site.COST_FACTORS.map(c => ({ key: c.FACTOR_KEY, value: c.FACTOR_VALUE })) : []);
        } else {
            setEditingSite(null);
            resetForm();
        }
        setIsFormOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this site? This cannot be undone.')) return;
        try { await api.delete(`/sites/${id}`); fetchSites(); }
        catch { alert('Failed to delete site'); }
    };

    const handleToggleStatus = async (site: Site) => {
        const newStatus = site.STATUS === 'inactive' ? 'active' : 'inactive';
        const label = newStatus === 'inactive' ? 'deactivate' : 'activate';
        if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} "${site.NAME}"? The site data will be kept.`)) return;
        try {
            await api.patch(`/sites/${site.ID}/status`, { status: newStatus });
            fetchSites();
        } catch { alert('Failed to update site status'); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setSaving(true);
        try {
            const payload = {
                site_no: siteNo, name,
                supervisor_id: supervisorId || null,
                responsible_person_id: responsiblePersonId || null,
                task_invoice_price: 0,
                daily_target: dailyTarget || 0,
                ot_type: otType,
                status: siteStatus,
                service_type: serviceType || null,
                site_type: siteType || null,
                task_types: taskTypes.filter(t => t.task_name.trim()),
                cost_factors: costFactors.filter(f => f.key.trim()),
            };
            if (editingSite) await api.put(`/sites/${editingSite.ID}`, payload);
            else await api.post('/sites', payload);
            await fetchSites(); setIsFormOpen(false);
        } catch { alert('Failed to save site'); } finally { setSaving(false); }
    };

    const handleAddTaskType    = () => setTaskTypes([...taskTypes, { task_name: '', invoice_price: 0 }]);
    const handleRemoveTaskType = (i: number) => setTaskTypes(taskTypes.filter((_, idx) => idx !== i));
    const handleTaskTypeChange = (i: number, field: 'task_name' | 'invoice_price', value: any) =>
        setTaskTypes(taskTypes.map((t, idx) => idx === i ? { ...t, [field]: field === 'invoice_price' ? Number(value) : value } : t));

    const handleAddCostFactor    = () => setCostFactors([...costFactors, { key: '', value: '' }]);
    const handleRemoveCostFactor = (i: number) => setCostFactors(costFactors.filter((_, idx) => idx !== i));
    const handleCostFactorChange = (i: number, field: 'key' | 'value', value: string) =>
        setCostFactors(costFactors.map((f, idx) => idx === i ? { ...f, [field]: value } : f));

    // Unique responsible persons across all sites (for filter dropdown)
    const responsiblePersons = Array.from(
        new Map(
            sites
                .filter(s => s.RESPONSIBLE_PERSON_NAME)
                .map(s => [s.RESPONSIBLE_PERSON_ID, s.RESPONSIBLE_PERSON_NAME!])
        ).entries()
    ).sort((a, b) => a[1].localeCompare(b[1]));

    const filteredSites = sites.filter(site => {
        if (statusFilter !== 'all' && (site.STATUS || 'active') !== statusFilter) return false;
        if (personFilter && site.RESPONSIBLE_PERSON_NAME !== personFilter) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        const otLabel = OT_TYPE_CONFIG[site.OT_TYPE as keyof typeof OT_TYPE_CONFIG]?.label || '';
        return (
            site.SITE_NO?.toLowerCase().includes(q) ||
            site.NAME?.toLowerCase().includes(q) ||
            site.SERVICE_TYPE?.toLowerCase().includes(q) ||
            site.SITE_TYPE?.toLowerCase().includes(q) ||
            otLabel.toLowerCase().includes(q) ||
            site.SUPERVISOR_NAME?.toLowerCase().includes(q) ||
            site.RESPONSIBLE_PERSON_NAME?.toLowerCase().includes(q) ||
            site.TASK_TYPES?.some(t => t.TASK_NAME?.toLowerCase().includes(q))
        );
    });

    if (loading) return (
        <div className="space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-white rounded-xl animate-pulse" />)}
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">Sites &amp; Locations</h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        {filteredSites.length} of {sites.length} site{sites.length !== 1 ? 's' : ''}
                        {personFilter && <span className="ml-1.5 font-semibold text-indigo-600">· {personFilter}</span>}
                        {statusFilter !== 'all' && <span className={`ml-1.5 font-semibold ${statusFilter === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>({statusFilter})</span>}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    {/* Status filter tabs */}
                    <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
                        {(['active', 'inactive', 'all'] as const).map(s => (
                            <button key={s} onClick={() => setStatusFilter(s)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${statusFilter === s ? s === 'active' ? 'bg-emerald-500 text-white shadow-sm' : s === 'inactive' ? 'bg-slate-500 text-white shadow-sm' : 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                        ))}
                    </div>
                    {/* Responsible Person filter */}
                    <div className="relative">
                        <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <select
                            value={personFilter}
                            onChange={e => setPersonFilter(e.target.value)}
                            className={`pl-9 pr-8 py-2 border rounded-xl text-sm font-medium transition-all appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-400 ${personFilter ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
                        >
                            <option value="">All Responsible Persons</option>
                            {responsiblePersons.map(([id, pname]) => (
                                <option key={id} value={pname}>{pname}</option>
                            ))}
                        </select>
                        {personFilter && (
                            <button onClick={() => setPersonFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    {/* Search bar */}
                    <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search sites..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9 pr-9 form-input w-full sm:w-56"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded transition-colors">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    {(role === 'admin' || role === 'system_admin') && (
                        <button onClick={() => handleOpenForm()} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all shadow-sm shadow-indigo-500/25 text-sm whitespace-nowrap">
                            <Plus className="w-4 h-4" /> Add New Site
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            {sites.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <MapPin className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 mb-2">No sites yet</h3>
                    <p className="text-slate-400 text-sm mb-5">Get started by creating your first operational site</p>
                    {(role === 'admin' || role === 'system_admin') && (
                        <button onClick={() => handleOpenForm()} className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl text-sm">
                            <Plus className="w-4 h-4" /> Add First Site
                        </button>
                    )}
                </div>
            ) : (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/70">
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Site No</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Site Name</th>
                                    <th className="hidden sm:table-cell text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="hidden sm:table-cell text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Service Type</th>
                                    <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Site Type</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">OT Type</th>
                                    <th className="hidden sm:table-cell text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Supervisor</th>
                                    <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Responsible</th>
                                    <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Staff</th>
                                    <th className="hidden lg:table-cell text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Target</th>
                                    <th className="hidden lg:table-cell text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Task Types</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredSites.length === 0 && (
                                    <tr>
                                        <td colSpan={12} className="px-4 py-10 text-center">
                                            <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                            <p className="text-sm font-semibold text-slate-400">No sites match &quot;{search}&quot;</p>
                                            <button onClick={() => setSearch('')} className="mt-2 text-xs text-indigo-500 hover:underline">Clear search</button>
                                        </td>
                                    </tr>
                                )}
                                {filteredSites.map((site) => {
                                    const otCfg = OT_TYPE_CONFIG[site.OT_TYPE as keyof typeof OT_TYPE_CONFIG] || OT_TYPE_CONFIG.time_based;
                                    return (
                                        <tr key={site.ID} className="hover:bg-slate-50/60 transition-colors group">
                                            {/* Site No */}
                                            <td className="px-4 py-3.5 whitespace-nowrap">
                                                <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                                                    {site.SITE_NO}
                                                </span>
                                            </td>
                                            {/* Site Name */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-2.5">
                                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${site.STATUS === 'inactive' ? 'bg-slate-100' : 'bg-blue-50'}`}>
                                                        <MapPin className={`w-3.5 h-3.5 ${site.STATUS === 'inactive' ? 'text-slate-400' : 'text-blue-500'}`} />
                                                    </div>
                                                    <span className={`font-semibold whitespace-nowrap ${site.STATUS === 'inactive' ? 'text-slate-400' : 'text-slate-800'}`}>{site.NAME}</span>
                                                </div>
                                            </td>
                                            {/* Status */}
                                            <td className="hidden sm:table-cell px-4 py-3.5 whitespace-nowrap">
                                                {site.STATUS === 'inactive' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-500">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Inactive
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                                                    </span>
                                                )}
                                            </td>
                                            {/* Service Type */}
                                            <td className="hidden sm:table-cell px-4 py-3.5 whitespace-nowrap">
                                                {site.SERVICE_TYPE ? (
                                                    <span className="flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-lg w-fit">
                                                        <Briefcase className="w-3 h-3" /> {site.SERVICE_TYPE}
                                                    </span>
                                                ) : <span className="text-slate-300 text-xs">—</span>}
                                            </td>
                                            {/* Site Type */}
                                            <td className="hidden md:table-cell px-4 py-3.5 whitespace-nowrap">
                                                {site.SITE_TYPE ? (
                                                    <span className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg w-fit">
                                                        <Building2 className="w-3 h-3" /> {site.SITE_TYPE}
                                                    </span>
                                                ) : <span className="text-slate-300 text-xs">—</span>}
                                            </td>
                                            {/* OT Type */}
                                            <td className="px-4 py-3.5 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${otCfg.color}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${otCfg.dot}`} />
                                                    {otCfg.label}
                                                </span>
                                            </td>
                                            {/* Supervisor */}
                                            <td className="hidden sm:table-cell px-4 py-3.5 whitespace-nowrap">
                                                {site.SUPERVISOR_NAME ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-6 h-6 bg-violet-100 rounded-full flex items-center justify-center text-violet-600 text-[10px] font-bold shrink-0">
                                                            {site.SUPERVISOR_NAME.charAt(0)}
                                                        </div>
                                                        <span className="text-xs font-medium text-slate-700">{site.SUPERVISOR_NAME}</span>
                                                    </div>
                                                ) : <span className="text-slate-300 text-xs">—</span>}
                                            </td>
                                            {/* Responsible Person */}
                                            <td className="hidden md:table-cell px-4 py-3.5 whitespace-nowrap">
                                                {site.RESPONSIBLE_PERSON_NAME ? (
                                                    <button
                                                        onClick={() => setPersonFilter(personFilter === site.RESPONSIBLE_PERSON_NAME ? '' : site.RESPONSIBLE_PERSON_NAME!)}
                                                        title={`Filter by ${site.RESPONSIBLE_PERSON_NAME}`}
                                                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors group ${personFilter === site.RESPONSIBLE_PERSON_NAME ? 'bg-indigo-100 ring-1 ring-indigo-300' : 'hover:bg-indigo-50'}`}
                                                    >
                                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${personFilter === site.RESPONSIBLE_PERSON_NAME ? 'bg-indigo-200 text-indigo-700' : 'bg-indigo-50 text-indigo-500 group-hover:bg-indigo-100'}`}>
                                                            {site.RESPONSIBLE_PERSON_NAME.charAt(0)}
                                                        </div>
                                                        <span className={`text-xs font-medium ${personFilter === site.RESPONSIBLE_PERSON_NAME ? 'text-indigo-700' : 'text-slate-700 group-hover:text-indigo-700'}`}>{site.RESPONSIBLE_PERSON_NAME}</span>
                                                    </button>
                                                ) : <span className="text-slate-300 text-xs">—</span>}
                                            </td>
                                            {/* Staff Count */}
                                            <td className="hidden md:table-cell px-4 py-3.5 text-center">
                                                <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-700">
                                                    <UsersIcon className="w-3.5 h-3.5 text-slate-400" />
                                                    {site.STAFF_COUNT || 0}
                                                </span>
                                            </td>
                                            {/* Daily Target */}
                                            <td className="hidden lg:table-cell px-4 py-3.5 text-center">
                                                <span className="text-sm font-bold text-slate-700">{site.DAILY_TARGET || 0}</span>
                                            </td>
                                            {/* Task Types count */}
                                            <td className="hidden lg:table-cell px-4 py-3.5 text-center">
                                                {site.TASK_TYPES && site.TASK_TYPES.length > 0 ? (
                                                    <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold">
                                                        {site.TASK_TYPES.length} type{site.TASK_TYPES.length !== 1 ? 's' : ''}
                                                    </span>
                                                ) : <span className="text-slate-300 text-xs">—</span>}
                                            </td>
                                            {/* Actions */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => setViewingSite(site)}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-lg transition-colors text-xs font-semibold"
                                                        title="View details"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" /> View
                                                    </button>
                                                    {(role === 'admin' || role === 'system_admin') && (<>
                                                        <button
                                                            onClick={() => handleToggleStatus(site)}
                                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors text-xs font-semibold ${site.STATUS === 'inactive' ? 'bg-slate-100 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                                                            title={site.STATUS === 'inactive' ? 'Activate' : 'Deactivate'}
                                                        >
                                                            <PowerOff className="w-3.5 h-3.5" />
                                                            {site.STATUS === 'inactive' ? 'Activate' : 'Deactivate'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleOpenForm(site)}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-600 rounded-lg transition-colors text-xs font-semibold"
                                                            title="Edit"
                                                        >
                                                            <Edit className="w-3.5 h-3.5" /> Edit
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(site.ID)}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-lg transition-colors text-xs font-semibold"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" /> Delete
                                                        </button>
                                                    </>)}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── View Detail Modal ── */}
            {viewingSite && (() => {
                const otCfg = OT_TYPE_CONFIG[viewingSite.OT_TYPE as keyof typeof OT_TYPE_CONFIG] || OT_TYPE_CONFIG.time_based;
                return (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setViewingSite(null)} />
                        <div className="relative bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-blue-500 shrink-0" />
                            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                                        <MapPin className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-slate-900 leading-tight">{viewingSite.NAME}</h2>
                                        <p className="text-xs font-mono text-slate-400 mt-0.5">#{viewingSite.SITE_NO}</p>
                                    </div>
                                </div>
                                <button onClick={() => setViewingSite(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>

                            <div className="overflow-y-auto flex-1 p-6 space-y-5">
                                {/* Badges row */}
                                <div className="flex flex-wrap gap-2">
                                    {viewingSite.STATUS === 'inactive' ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-500">
                                            <span className="w-2 h-2 rounded-full bg-slate-400" /> Inactive
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Active
                                        </span>
                                    )}
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${otCfg.color}`}>
                                        <span className={`w-2 h-2 rounded-full ${otCfg.dot}`} />
                                        {otCfg.label}
                                    </span>
                                    {viewingSite.SERVICE_TYPE && (
                                        <span className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-semibold">
                                            <Briefcase className="w-3.5 h-3.5" /> {viewingSite.SERVICE_TYPE}
                                        </span>
                                    )}
                                    {viewingSite.SITE_TYPE && (
                                        <span className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold">
                                            <Building2 className="w-3.5 h-3.5" /> {viewingSite.SITE_TYPE}
                                        </span>
                                    )}
                                </div>

                                {/* Key stats */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="bg-slate-50 rounded-xl p-4 text-center">
                                        <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                                            <UsersIcon className="w-3.5 h-3.5" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wide">Staff</span>
                                        </div>
                                        <p className="text-2xl font-black text-slate-900">{viewingSite.STAFF_COUNT || 0}</p>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-4 text-center">
                                        <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                                            <Target className="w-3.5 h-3.5" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wide">Daily Target</span>
                                        </div>
                                        <p className="text-2xl font-black text-slate-900">{viewingSite.DAILY_TARGET || 0}</p>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-4 text-center">
                                        <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                                            <ChevronRight className="w-3.5 h-3.5" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wide">Task Types</span>
                                        </div>
                                        <p className="text-2xl font-black text-slate-900">{viewingSite.TASK_TYPES?.length || 0}</p>
                                    </div>
                                </div>

                                {/* Supervisor + Responsible Person */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {viewingSite.SUPERVISOR_NAME && (
                                        <div className="flex items-center gap-3 p-4 bg-violet-50 rounded-xl">
                                            <div className="w-9 h-9 bg-violet-200 rounded-full flex items-center justify-center text-violet-700 font-bold text-sm shrink-0">
                                                {viewingSite.SUPERVISOR_NAME.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-xs text-violet-500 font-semibold uppercase tracking-wide">Supervisor</p>
                                                <p className="font-bold text-slate-800">{viewingSite.SUPERVISOR_NAME}</p>
                                            </div>
                                        </div>
                                    )}
                                    {viewingSite.RESPONSIBLE_PERSON_NAME && (
                                        <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-xl">
                                            <div className="w-9 h-9 bg-indigo-200 rounded-full flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
                                                {viewingSite.RESPONSIBLE_PERSON_NAME.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-xs text-indigo-500 font-semibold uppercase tracking-wide">Responsible Person</p>
                                                <p className="font-bold text-slate-800">{viewingSite.RESPONSIBLE_PERSON_NAME}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Task Types table */}
                                {viewingSite.TASK_TYPES && viewingSite.TASK_TYPES.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                                            <DollarSign className="w-4 h-4 text-indigo-500" /> Task Types{(role === 'admin' || role === 'system_admin') && ' & Invoice Prices'}
                                        </h3>
                                        <div className="rounded-xl overflow-hidden border border-slate-100">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-100">
                                                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Task Type</th>
                                                        {(role === 'admin' || role === 'system_admin') && (
                                                            <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Invoice Price</th>
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {viewingSite.TASK_TYPES.map((t, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50/50">
                                                            <td className="px-4 py-2.5 font-medium text-slate-700">{t.TASK_NAME}</td>
                                                            {(role === 'admin' || role === 'system_admin') && (
                                                                <td className="px-4 py-2.5 text-right font-bold text-indigo-600">
                                                                    Rs. {Number(t.INVOICE_PRICE).toLocaleString()}
                                                                </td>
                                                            )}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Cost Factors table */}
                                {viewingSite.COST_FACTORS && viewingSite.COST_FACTORS.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                                            <DollarSign className="w-4 h-4 text-amber-500" /> Cost Factors
                                        </h3>
                                        <div className="rounded-xl overflow-hidden border border-slate-100">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-100">
                                                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Factor</th>
                                                        <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Value</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {viewingSite.COST_FACTORS.map((f, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50/50">
                                                            <td className="px-4 py-2.5 font-medium text-slate-700">{f.FACTOR_KEY}</td>
                                                            <td className="px-4 py-2.5 text-right font-bold text-amber-700">{f.FACTOR_VALUE}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Staff Outsource notice */}
                                {viewingSite.OT_TYPE === 'staff_outsource' && (
                                    <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-100 rounded-xl">
                                        <UsersIcon className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-bold text-orange-800">Staff Outsource Site</p>
                                            <p className="text-xs text-orange-600 mt-0.5">
                                                Staff at this site have no OT. Invoice salary is calculated as basic salary + fix salary only. This site is excluded from Custom OT reports.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Close + Edit buttons */}
                                <div className="flex gap-3 pt-2">
                                    <button onClick={() => setViewingSite(null)} className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm">
                                        Close
                                    </button>
                                    {(role === 'admin' || role === 'system_admin') && (
                                        <button onClick={() => { setViewingSite(null); handleOpenForm(viewingSite); }}
                                            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
                                            <Edit className="w-4 h-4" /> Edit Site
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Create / Edit Modal ── */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsFormOpen(false)} />
                    <div className="relative bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <div>
                                <h2 className="text-lg font-black text-slate-900">{editingSite ? 'Edit Site' : 'Create New Site'}</h2>
                                <p className="text-xs text-slate-400 mt-0.5">{editingSite ? 'Update site configuration' : 'Add a new operational site'}</p>
                            </div>
                            <button onClick={() => setIsFormOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 p-6">
                            <form onSubmit={handleSubmit} className="space-y-5">

                                {/* Service Type + Site Type */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                                            <Briefcase className="w-4 h-4 text-blue-500" /> Service Type
                                        </label>
                                        <select value={serviceType} onChange={e => setServiceType(e.target.value)}
                                            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm">
                                            <option value="">— Select service type —</option>
                                            {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                                            <Building2 className="w-4 h-4 text-slate-500" /> Site Type
                                        </label>
                                        <select value={siteType} onChange={e => setSiteType(e.target.value)}
                                            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm">
                                            <option value="">— Select site type —</option>
                                            {SITE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Site Number + Name */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Site Number <span className="text-red-500">*</span></label>
                                        <input type="text" required disabled={!!editingSite} value={siteNo} onChange={e => setSiteNo(e.target.value)}
                                            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm disabled:bg-slate-50 disabled:text-slate-400"
                                            placeholder="e.g. SITE-001" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Site Name <span className="text-red-500">*</span></label>
                                        <input type="text" required value={name} onChange={e => setName(e.target.value)}
                                            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                                            placeholder="e.g. Main Warehouse" />
                                    </div>
                                </div>

                                {/* Supervisor + Responsible Person */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Supervisor</label>
                                        <select value={supervisorId} onChange={e => setSupervisorId(e.target.value ? Number(e.target.value) : '')}
                                            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm">
                                            <option value="">No Supervisor</option>
                                            {supervisors.map(s => <option key={s.ID} value={s.ID}>{s.NAME}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                                            <UserCheck className="w-4 h-4 text-indigo-500" /> Responsible Person
                                        </label>
                                        <select value={responsiblePersonId} onChange={e => setResponsiblePersonId(e.target.value ? Number(e.target.value) : '')}
                                            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm">
                                            <option value="">No Responsible Person</option>
                                            {allUsers.filter(u =>
                                                u.STATUS === 'active' && u.ROLE !== 'system_admin'
                                            ).map(u => (
                                                <option key={u.ID} value={u.ID}>{u.NAME} ({u.ROLE})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* OT Type */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-3">OT Calculation Type <span className="text-red-500">*</span></label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <button type="button" onClick={() => setOtType('time_based')}
                                            className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 font-semibold text-xs transition-all ${otType === 'time_based' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                                            <Clock className="w-4 h-4" /> Time Based
                                        </button>
                                        <button type="button" onClick={() => setOtType('target_based')}
                                            className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 font-semibold text-xs transition-all ${otType === 'target_based' ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                                            <Target className="w-4 h-4" /> Target Based
                                        </button>
                                        <button type="button" onClick={() => setOtType('staff_outsource')}
                                            className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 font-semibold text-xs transition-all ${otType === 'staff_outsource' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                                            <UsersIcon className="w-4 h-4" /> Staff Outsource
                                        </button>
                                    </div>
                                    {otType === 'staff_outsource' && (
                                        <p className="mt-2 text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded-lg">
                                            Staff Outsource sites have no OT. Invoice uses basic + fix salary only. Excluded from Custom OT reports.
                                        </p>
                                    )}
                                </div>

                                {/* Site Status — only show when editing */}
                                {editingSite && (
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-3">Site Status</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button type="button" onClick={() => setSiteStatus('active')}
                                                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border-2 font-semibold text-xs transition-all ${siteStatus === 'active' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                                                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Active
                                            </button>
                                            <button type="button" onClick={() => setSiteStatus('inactive')}
                                                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border-2 font-semibold text-xs transition-all ${siteStatus === 'inactive' ? 'border-slate-500 bg-slate-100 text-slate-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                                                <span className="w-2 h-2 rounded-full bg-slate-400" /> Inactive
                                            </button>
                                        </div>
                                        {siteStatus === 'inactive' && (
                                            <p className="mt-2 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
                                                Inactive sites are hidden by default. All historical data is preserved.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Daily Target */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Daily Target <span className="text-slate-400 font-normal text-xs">(Optional)</span></label>
                                    <input type="number" min="0" value={dailyTarget} onChange={e => setDailyTarget(Number(e.target.value))}
                                        className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm" placeholder="0" />
                                </div>

                                {/* Task Types */}
                                <div className="border-t border-slate-100 pt-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <label className="text-sm font-semibold text-slate-700">Task Types &amp; Prices</label>
                                        <button type="button" onClick={handleAddTaskType} className="flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                                            <Plus className="w-4 h-4" /> Add Type
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {taskTypes.map((type, i) => (
                                            <div key={i} className="flex gap-2 items-center">
                                                <input type="text" placeholder="Task type name" value={type.task_name} onChange={e => handleTaskTypeChange(i, 'task_name', e.target.value)}
                                                    className="flex-1 px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm" />
                                                <input type="number" min="0" step="0.01" placeholder="Price" value={type.invoice_price || ''} onChange={e => handleTaskTypeChange(i, 'invoice_price', e.target.value)}
                                                    className="w-32 px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm" />
                                                <button type="button" onClick={() => handleRemoveTaskType(i)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors shrink-0">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Cost Factors */}
                                <div className="border-t border-slate-100 pt-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                                                <DollarSign className="w-4 h-4 text-amber-500" /> Cost Factors
                                            </label>
                                            <p className="text-xs text-slate-400 mt-0.5">Custom key-value cost parameters for this site</p>
                                        </div>
                                        <button type="button" onClick={handleAddCostFactor} className="flex items-center gap-1 text-sm font-semibold text-amber-600 hover:text-amber-700">
                                            <Plus className="w-4 h-4" /> Add Factor
                                        </button>
                                    </div>
                                    {costFactors.length === 0 ? (
                                        <p className="text-xs text-slate-400 text-center py-3 bg-slate-50 rounded-xl">No cost factors yet</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {costFactors.map((f, i) => (
                                                <div key={i} className="flex gap-2 items-center">
                                                    <input type="text" placeholder="Factor name (e.g. Transport)" value={f.key} onChange={e => handleCostFactorChange(i, 'key', e.target.value)}
                                                        className="flex-1 px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-400 transition-colors text-sm" />
                                                    <input type="text" placeholder="Value (e.g. 500)" value={f.value} onChange={e => handleCostFactorChange(i, 'value', e.target.value)}
                                                        className="w-36 px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-400 transition-colors text-sm" />
                                                    <button type="button" onClick={() => handleRemoveCostFactor(i)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors shrink-0">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Submit */}
                                <div className="flex gap-3 pt-4 border-t border-slate-100">
                                    <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={saving}
                                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                                        {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                        {editingSite ? 'Update Site' : 'Create Site'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sites;
