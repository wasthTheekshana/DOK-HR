import React, { useEffect, useState } from 'react';
import api from '../services/api';
import type { Site } from '../types';
import { format } from 'date-fns';
import { MapPin, FileText, Download, Calendar, Clock, Target, TrendingUp, DollarSign, Users, Save, History, ChevronDown, ChevronUp, Moon, Plus, Trash2, Sparkles, Check, Pencil, X } from 'lucide-react';
import { calculatePoyaDays, type PoyaDate } from '../utils/poyaUtils';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';

const DEFAULT_OUT_TIME = '17:00';
const DEFAULT_IN_TIME  = '08:30';

const Payroll: React.FC = () => {
    const { role } = useAuth();
    const canSeePayment = role === 'admin' || role === 'system_admin';
    const [sites, setSites] = useState<Site[]>([]);
    const [payrollData, setPayrollData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [siteFilter, setSiteFilter] = useState('');
    const [dateFrom, setDateFrom] = useState(format(new Date(new Date().setMonth(new Date().getMonth() - 1, 1)), 'yyyy-MM-dd'));
    const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [otType, setOtType] = useState('time_based');
    const [viewMode, setViewMode] = useState<'detailed' | 'summary'>('detailed');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showPayrollHistory, setShowPayrollHistory] = useState(false);
    const [payrollHistory, setPayrollHistory] = useState<any[]>([]);
    const [histLoading, setHistLoading] = useState(false);
    const [histDateFrom, setHistDateFrom] = useState('');
    const [histDateTo, setHistDateTo] = useState('');
    const [histSiteNo, setHistSiteNo] = useState('');
    const [showPoyaPanel, setShowPoyaPanel] = useState(false);
    const [poyaDays, setPoyaDays] = useState<any[]>([]);
    const [newPoyaDate, setNewPoyaDate] = useState('');
    const [newPoyaDesc, setNewPoyaDesc] = useState('');
    const [poyaMsg, setPoyaMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [autoYear, setAutoYear] = useState(new Date().getFullYear());
    const [autoPreview, setAutoPreview] = useState<PoyaDate[]>([]);
    const [selectedAuto, setSelectedAuto] = useState<Set<string>>(new Set());
    const [bulkAdding, setBulkAdding] = useState(false);
    const [editingPoya, setEditingPoya] = useState<any | null>(null);
    const [editDate, setEditDate] = useState('');
    const [editDesc, setEditDesc] = useState('');

    useEffect(() => {
        const loadSites = async () => {
            const res = await api.get('/sites');
            setSites(res.data);
            setSiteFilter('');
            setOtType('time_based');
        };
        loadSites();
    }, []);

    useEffect(() => {
        if (sites.length > 0) fetchPayroll();
    }, [siteFilter, dateFrom, dateTo, otType, viewMode, sites.length]);

    const handleSiteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sno = e.target.value;
        setSiteFilter(sno);
        if (sno) {
            const site = sites.find(s => s.SITE_NO === sno);
            if (site) setOtType(site.OT_TYPE || 'time_based');
        } else {
            setOtType(sites[0]?.OT_TYPE || 'time_based');
        }
    };

    const fetchPayroll = async () => {
        setLoading(true);
        try {
            const params: any = { date_from: dateFrom, date_to: dateTo, ot_type: otType, view_mode: viewMode };
            if (siteFilter) params.site_no = siteFilter;
            const response = await api.get('/payroll', { params });
            setPayrollData(response.data);
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    };

    const savePayroll = async () => {
        if (!siteFilter || payrollData.length === 0) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            const res = await api.post('/payroll/save-target', {
                date_from: dateFrom,
                date_to: dateTo,
                site_no: siteFilter,
                records: payrollData
            });
            setSaveMsg({ type: 'success', text: `Saved ${res.data.count} records (Batch: ${res.data.batch_id})` });
        } catch (err: any) {
            setSaveMsg({ type: 'error', text: err.response?.data?.message || 'Save failed' });
        } finally {
            setSaving(false);
        }
    };

    const fetchPayrollHistory = async () => {
        setHistLoading(true);
        try {
            const params: any = {};
            if (histDateFrom && histDateTo) { params.date_from = histDateFrom; params.date_to = histDateTo; }
            if (histSiteNo) params.site_no = histSiteNo;
            const res = await api.get('/payroll/saved-history', { params });
            setPayrollHistory(res.data);
        } catch (err) { console.error(err); }
        finally { setHistLoading(false); }
    };

    useEffect(() => {
        if (showPayrollHistory) fetchPayrollHistory();
    }, [showPayrollHistory, histDateFrom, histDateTo, histSiteNo]);

    const fetchPoyaDays = async () => {
        try {
            const res = await api.get('/poya-days');
            setPoyaDays(res.data);
        } catch (err) { console.error(err); }
    };

    useEffect(() => { if (showPoyaPanel) fetchPoyaDays(); }, [showPoyaPanel]);

    const addPoyaDay = async () => {
        if (!newPoyaDate) return;
        try {
            await api.post('/poya-days', { poya_date: newPoyaDate, description: newPoyaDesc || undefined });
            setPoyaMsg({ type: 'success', text: 'Poya day added' });
            setNewPoyaDate(''); setNewPoyaDesc('');
            fetchPoyaDays();
            fetchPayroll(); // recalculate with new poya day
        } catch (err: any) {
            setPoyaMsg({ type: 'error', text: err.response?.data?.message || 'Failed to add' });
        }
        setTimeout(() => setPoyaMsg(null), 3000);
    };

    const deletePoyaDay = async (id: number) => {
        try {
            await api.delete(`/poya-days/${id}`);
            fetchPoyaDays();
            fetchPayroll();
        } catch (err) { console.error(err); }
    };

    const openEditPoya = (p: any) => {
        setEditingPoya(p);
        setEditDate(p.POYA_DATE);
        setEditDesc(p.DESCRIPTION || '');
    };

    const saveEditPoya = async () => {
        if (!editingPoya || !editDate) return;
        try {
            await api.put(`/poya-days/${editingPoya.ID}`, { poya_date: editDate, description: editDesc || undefined });
            setPoyaMsg({ type: 'success', text: 'Poya day updated' });
            setEditingPoya(null);
            fetchPoyaDays();
            fetchPayroll();
        } catch (err: any) {
            setPoyaMsg({ type: 'error', text: err.response?.data?.message || 'Update failed' });
        }
        setTimeout(() => setPoyaMsg(null), 3000);
    };

    const generateAutoPreview = () => {
        const calculated = calculatePoyaDays(autoYear);
        const existingDates = new Set(poyaDays.map((p: any) => p.POYA_DATE));
        const withExists = calculated.map(p => ({ ...p, exists: existingDates.has(p.date) }));
        setAutoPreview(withExists);
        // Pre-select all non-existing dates
        setSelectedAuto(new Set(withExists.filter(p => !p.exists).map(p => p.date)));
    };

    const toggleAutoSelect = (date: string) => {
        setSelectedAuto(prev => {
            const next = new Set(prev);
            next.has(date) ? next.delete(date) : next.add(date);
            return next;
        });
    };

    const bulkAddPoyaDays = async () => {
        const toAdd = autoPreview.filter(p => selectedAuto.has(p.date));
        if (toAdd.length === 0) return;
        setBulkAdding(true);
        let added = 0, skipped = 0;
        for (const p of toAdd) {
            try {
                await api.post('/poya-days', { poya_date: p.date, description: p.description });
                added++;
            } catch { skipped++; }
        }
        setBulkAdding(false);
        setPoyaMsg({ type: 'success', text: `Added ${added} Poya days${skipped > 0 ? ` (${skipped} skipped — already exist)` : ''}` });
        setAutoPreview([]);
        setSelectedAuto(new Set());
        fetchPoyaDays();
        fetchPayroll();
        setTimeout(() => setPoyaMsg(null), 4000);
    };

    const DAY_TYPE_LABEL: Record<string, { label: string; cls: string }> = {
        sunday_poya: { label: 'Sun/Poya', cls: 'bg-orange-100 text-orange-700' },
        saturday:    { label: 'Saturday', cls: 'bg-blue-100 text-blue-700' },
        weekday:     { label: 'Weekday',  cls: 'bg-slate-100 text-slate-500' },
    };

    const selectedSite = sites.find(s => s.SITE_NO === siteFilter);

    const safeFormatDate = (dateVal: any) => {
        try {
            if (!dateVal) return '-';
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return '-';
            return format(d, 'MMM dd, yyyy');
        } catch { return '-'; }
    };

    const exportToExcel = () => {
        if (payrollData.length === 0) return;
        let data: any[] = [];
        let fileName = '';
        if (otType === 'time_based' && viewMode === 'detailed' && siteFilter) {
            data = payrollData.map(row => {
                const base: any = {
                    'EPF Number': row.EPF_NUMBER || '-', 'Staff Name': row.NAME,
                    'Date': safeFormatDate(row.TASK_DATE || row.task_date),
                    'In Time': row.IN_TIME || '-', 'Out Time': row.OUT_TIME || '-',
                    'Default In': row.default_in_time || DEFAULT_IN_TIME,
                    'Default Out': row.default_out_time || DEFAULT_OUT_TIME, 'Extra Hours': row.extra_hours || 0
                };
                if (canSeePayment) { base['Rate'] = (row.ot_rate || 0).toFixed(2); base['Payment'] = (row.extra_payment || 0).toFixed(2); }
                return base;
            });
            fileName = `payroll_detailed_${siteFilter}_${dateFrom}_to_${dateTo}.xlsx`;
        } else if (otType === 'time_based') {
            data = payrollData.map(row => {
                const base: any = { ...(siteFilter ? {} : { 'Site': row.SITE_NO || '-' }), 'EPF Number': row.EPF_NUMBER || '-', 'Staff Name': row.NAME, 'Total Extra Hours': (row.total_extra_hours || 0).toFixed(2) };
                if (canSeePayment) { base['Rate'] = (row.ot_rate || 0).toFixed(2); base['Total Payment'] = (row.total_payment || 0).toFixed(2); }
                return base;
            });
            fileName = `payroll_summary_${siteFilter || 'all_sites'}_${dateFrom}_to_${dateTo}.xlsx`;
        } else {
            data = payrollData.map(row => {
                const base: any = { ...(siteFilter ? {} : { 'Site': row.SITE_NO || '-' }), 'EPF Number': row.EPF_NUMBER || '-', 'Staff Name': row.NAME, 'Total Count': row.SUM_COUNT || row.sum_count || 0, 'Total Target': row.target_count || 0, 'Extra Units': row.extra_units || 0 };
                if (canSeePayment) base['Payment'] = (row.extra_payment || 0).toFixed(2);
                return base;
            });
            fileName = `payroll_target_based_${siteFilter || 'all_sites'}_${dateFrom}_to_${dateTo}.xlsx`;
        }
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
        XLSX.writeFile(wb, fileName);
    };

    const totalPayment = canSeePayment ? payrollData.reduce((s, r) => s + (Number(r.extra_payment || r.total_payment) || 0), 0) : 0;
    const totalHours = otType === 'time_based' ? payrollData.reduce((s, r) => s + (Number(r.extra_hours || r.total_extra_hours) || 0), 0) : 0;
    const totalUnits = otType === 'target_based' ? payrollData.reduce((s, r) => s + (Number(r.extra_units) || 0), 0) : 0;
    const totalOutsourceHoursWorked = otType === 'staff_outsource' ? payrollData.reduce((s, r) => s + (Number(r.hours_worked ?? r.total_hours) || 0), 0) : 0;
    const totalOutsourceExtraHours  = otType === 'staff_outsource' ? payrollData.reduce((s, r) => s + (Number(r.extra_hours ?? r.total_extra_hours) || 0), 0) : 0;
    const totalOutsourceHours = totalOutsourceHoursWorked; // used in stats strip

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Payroll</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Calculate overtime and performance payments</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end">
                    {selectedSite && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-sm font-semibold text-emerald-800">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                            {selectedSite.NAME}
                        </span>
                    )}
                    {canSeePayment && otType === 'target_based' && (
                        <button
                            onClick={() => setShowPayrollHistory(v => !v)}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all shadow-sm active:scale-95 ${showPayrollHistory ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'}`}
                        >
                            <History className="w-4 h-4" />
                            {showPayrollHistory ? 'Hide History' : 'Saved History'}
                            {showPayrollHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                    )}
                    {canSeePayment && otType === 'target_based' && siteFilter && payrollData.length > 0 && (
                        <button
                            onClick={savePayroll}
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-all shadow-sm active:scale-95"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? 'Saving...' : 'Save Payroll'}
                        </button>
                    )}
                    {canSeePayment && otType === 'time_based' && (
                        <button
                            onClick={() => setShowPoyaPanel(v => !v)}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all shadow-sm active:scale-95 ${showPoyaPanel ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200'}`}
                        >
                            <Moon className="w-4 h-4" />
                            Poya Days
                            {showPoyaPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                    )}
                    {payrollData.length > 0 && (
                        <button
                            onClick={exportToExcel}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm active:scale-95"
                        >
                            <Download className="w-4 h-4" />
                            Export Excel
                        </button>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className="card p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Site</label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select value={siteFilter} onChange={handleSiteChange}
                                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all">
                                <option value="">All Sites</option>
                                {sites.map(s => <option key={s.ID} value={s.SITE_NO}>{s.SITE_NO} - {s.NAME}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">From Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">To Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Calculation Type</label>
                        <div className="relative">
                            {otType === 'time_based'
                                ? <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                : <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            }
                            <select value={otType} disabled
                                className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-slate-500 cursor-not-allowed">
                                <option value="time_based">Time Based (OT)</option>
                                <option value="target_based">Target Based</option>
                                <option value="staff_outsource">Staff Outsource</option>
                            </select>
                        </div>
                    </div>
                </div>

                {(otType === 'time_based' || otType === 'staff_outsource') && (
                    <div className="mt-4 flex gap-2">
                        <button onClick={() => setViewMode('detailed')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'detailed' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            Detailed View
                        </button>
                        <button onClick={() => setViewMode('summary')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'summary' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            Summary View
                        </button>
                    </div>
                )}
            </div>

            {/* Summary Stats */}
            {payrollData.length > 0 && !loading && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                        <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center">
                            <Users className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500">Records</p>
                            <p className="text-xl font-bold text-slate-900">{payrollData.length}</p>
                        </div>
                    </div>
                    {(otType === 'time_based' || otType === 'staff_outsource') && (
                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                                <Clock className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">{otType === 'staff_outsource' ? 'Total Hours' : 'Extra Hours'}</p>
                                <p className="text-xl font-bold text-slate-900">
                                    {otType === 'staff_outsource' ? totalOutsourceHours.toFixed(1) : totalHours.toFixed(1)}
                                </p>
                            </div>
                        </div>
                    )}
                    {otType === 'target_based' && (
                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                            <div className="w-9 h-9 bg-violet-50 rounded-lg flex items-center justify-center">
                                <Target className="w-4 h-4 text-violet-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Extra Units</p>
                                <p className="text-xl font-bold text-slate-900">{totalUnits}</p>
                            </div>
                        </div>
                    )}
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                        <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500">OT Type</p>
                            <p className="text-sm font-bold text-slate-900">{otType === 'time_based' ? 'Time Based' : otType === 'staff_outsource' ? 'Staff Outsource' : 'Target'}</p>
                        </div>
                    </div>
                    {canSeePayment && (
                        <div className="bg-white rounded-xl border border-emerald-100 shadow-sm p-4 flex items-center gap-3">
                            <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
                                <DollarSign className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Total Payment</p>
                                <p className="text-xl font-bold text-emerald-700">{totalPayment.toFixed(2)}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Save message */}
            {saveMsg && (
                <div className={`px-4 py-3 rounded-xl text-sm font-medium ${saveMsg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'}`}>
                    {saveMsg.text}
                </div>
            )}

            {/* Table */}
            <div className="card overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
                    </div>
                ) : payrollData.length === 0 ? (
                    <div className="py-16 text-center">
                        <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                        <p className="text-base font-semibold text-slate-900 mb-1">No records found</p>
                        <p className="text-sm text-slate-500">Try adjusting your filters to view payroll data</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-slate-50">
                                {otType === 'staff_outsource' ? (
                                    viewMode === 'detailed' ? (
                                        <tr>
                                            {!siteFilter && <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>}
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">EPF No</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Day Type</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">In / Out</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Def. In</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Def. Out / Cut</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Hours Worked</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Extra Hrs</th>
                                        </tr>
                                    ) : (
                                        <tr>
                                            {!siteFilter && <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>}
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">EPF No</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Days Attended</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Hours</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-blue-600 uppercase tracking-wider">Extra Hrs</th>
                                        </tr>
                                    )
                                ) : otType === 'time_based' ? (
                                    (viewMode === 'detailed' && siteFilter) ? (
                                        <tr>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">EPF No</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Day Type</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">In / Out</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Def. In</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Def. Out / Cut</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Extra Hrs</th>
                                            {canSeePayment && <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate</th>}
                                            {canSeePayment && <th className="px-5 py-3.5 text-right text-xs font-semibold text-emerald-600 uppercase tracking-wider">Payment</th>}
                                        </tr>
                                    ) : (
                                        <tr>
                                            {!siteFilter && <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>}
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">EPF No</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Extra Hrs</th>
                                            {canSeePayment && <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate</th>}
                                            {canSeePayment && <th className="px-5 py-3.5 text-right text-xs font-semibold text-emerald-600 uppercase tracking-wider">Total Payment</th>}
                                        </tr>
                                    )
                                ) : (
                                    <tr>
                                        {!siteFilter && <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>}
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">EPF No</th>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff</th>
                                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Count</th>
                                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Extra Units</th>
                                        {canSeePayment && <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate</th>}
                                        {canSeePayment && <th className="px-5 py-3.5 text-right text-xs font-semibold text-emerald-600 uppercase tracking-wider">Payment</th>}
                                    </tr>
                                )}
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {payrollData.map((row, idx) => {
                                    if (otType === 'staff_outsource') {
                                        if (viewMode === 'detailed') {
                                            const dt = row.day_type || 'weekday';
                                            const dtInfo = DAY_TYPE_LABEL[dt] || DAY_TYPE_LABEL.weekday;
                                            const defOutDisplay = dt === 'saturday' ? '12:00 (Sat)' : dt === 'sunday_poya' ? 'Full Day' : (row.default_out_time || DEFAULT_OUT_TIME);
                                            return (
                                                <tr key={idx} className={`hover:bg-slate-50/60 transition-colors ${dt === 'sunday_poya' ? 'bg-orange-50/40' : dt === 'saturday' ? 'bg-blue-50/30' : ''}`}>
                                                    {!siteFilter && <td className="px-5 py-4 text-sm text-slate-500 font-mono whitespace-nowrap">{row.SITE_NO || '-'}</td>}
                                                    <td className="px-5 py-4 text-sm text-slate-500 font-mono whitespace-nowrap">{row.EPF_NUMBER || '-'}</td>
                                                    <td className="px-5 py-4 text-sm font-semibold text-slate-900 whitespace-nowrap">{row.NAME}</td>
                                                    <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">{row.ATTENDANCE_DATE || '-'}</td>
                                                    <td className="px-5 py-4 whitespace-nowrap">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${dtInfo.cls}`}>{dtInfo.label}</span>
                                                    </td>
                                                    <td className="px-5 py-4 whitespace-nowrap">
                                                        <div className="flex flex-col gap-0.5 text-xs">
                                                            <span className="text-emerald-600 font-medium">In: {row.IN_TIME || '—'}</span>
                                                            <span className="text-rose-500 font-medium">Out: {row.OUT_TIME || '—'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4 text-sm text-right text-slate-500 whitespace-nowrap font-mono">{row.default_in_time || DEFAULT_IN_TIME}</td>
                                                    <td className="px-5 py-4 text-sm text-right text-slate-500 whitespace-nowrap font-mono">{defOutDisplay}</td>
                                                    <td className="px-5 py-4 text-sm text-right font-bold text-slate-900 whitespace-nowrap">{Number(row.hours_worked || 0).toFixed(2)}</td>
                                                    <td className="px-5 py-4 text-sm text-right font-bold text-blue-700 whitespace-nowrap">{Number(row.extra_hours || 0).toFixed(2)}</td>
                                                </tr>
                                            );
                                        } else {
                                            return (
                                                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                                    {!siteFilter && <td className="px-5 py-4 text-sm text-slate-500 font-mono whitespace-nowrap">{row.SITE_NO || '-'}</td>}
                                                    <td className="px-5 py-4 text-sm text-slate-500 font-mono whitespace-nowrap">{row.EPF_NUMBER || '-'}</td>
                                                    <td className="px-5 py-4 text-sm font-semibold text-slate-900 whitespace-nowrap">{row.NAME}</td>
                                                    <td className="px-5 py-4 text-sm text-right text-slate-700 whitespace-nowrap">{Number(row.days_attended || 0)}</td>
                                                    <td className="px-5 py-4 text-sm text-right font-bold text-slate-900 whitespace-nowrap">{Number(row.total_hours || 0).toFixed(2)}</td>
                                                    <td className="px-5 py-4 text-sm text-right font-bold text-blue-700 whitespace-nowrap">{Number(row.total_extra_hours || 0).toFixed(2)}</td>
                                                </tr>
                                            );
                                        }
                                    } else if (otType === 'time_based' && viewMode === 'detailed' && siteFilter) {
                                        const dt = row.day_type || 'weekday';
                                        const dtInfo = DAY_TYPE_LABEL[dt] || DAY_TYPE_LABEL.weekday;
                                        const defOutDisplay = dt === 'saturday' ? '12:00 (Sat)' : dt === 'sunday_poya' ? 'Full Day' : (row.default_out_time || DEFAULT_OUT_TIME);
                                        return (
                                            <tr key={idx} className={`hover:bg-slate-50/60 transition-colors ${dt === 'sunday_poya' ? 'bg-orange-50/40' : dt === 'saturday' ? 'bg-blue-50/30' : ''}`}>
                                                <td className="px-5 py-4 text-sm text-slate-500 font-mono whitespace-nowrap">{row.EPF_NUMBER || '-'}</td>
                                                <td className="px-5 py-4 text-sm font-semibold text-slate-900 whitespace-nowrap">{row.NAME}</td>
                                                <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">{safeFormatDate(row.TASK_DATE || row.task_date)}</td>
                                                <td className="px-5 py-4 whitespace-nowrap">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${dtInfo.cls}`}>{dtInfo.label}</span>
                                                </td>
                                                <td className="px-5 py-4 whitespace-nowrap">
                                                    <div className="flex flex-col gap-0.5 text-xs">
                                                        <span className="text-emerald-600 font-medium">In: {row.IN_TIME || '-'}</span>
                                                        <span className="text-rose-500 font-medium">Out: {row.OUT_TIME || '-'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-sm text-right text-slate-500 whitespace-nowrap font-mono">{row.default_in_time || DEFAULT_IN_TIME}</td>
                                                <td className="px-5 py-4 text-sm text-right text-slate-500 whitespace-nowrap font-mono">{defOutDisplay}</td>
                                                <td className="px-5 py-4 text-sm text-right font-bold text-slate-900 whitespace-nowrap">{row.extra_hours}</td>
                                                {canSeePayment && <td className="px-5 py-4 text-sm text-right text-slate-500 whitespace-nowrap">{(row.ot_rate || 0).toFixed(2)}</td>}
                                                {canSeePayment && (
                                                    <td className="px-5 py-4 text-sm text-right font-bold text-emerald-600 whitespace-nowrap">
                                                        {(row.extra_payment || 0).toFixed(2)}
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    } else if (otType === 'time_based') {
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                                {!siteFilter && <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap font-mono">{row.SITE_NO || '-'}</td>}
                                                <td className="px-5 py-4 text-sm text-slate-500 font-mono whitespace-nowrap">{row.EPF_NUMBER || '-'}</td>
                                                <td className="px-5 py-4 text-sm font-semibold text-slate-900 whitespace-nowrap">{row.NAME}</td>
                                                <td className="px-5 py-4 text-sm text-right font-bold text-slate-900 whitespace-nowrap">{(row.total_extra_hours || 0).toFixed(2)}</td>
                                                {canSeePayment && <td className="px-5 py-4 text-sm text-right text-slate-500 whitespace-nowrap">{(row.ot_rate || 0).toFixed(2)}</td>}
                                                {canSeePayment && <td className="px-5 py-4 text-sm text-right font-bold text-emerald-600 whitespace-nowrap">{(row.total_payment || 0).toFixed(2)}</td>}
                                            </tr>
                                        );
                                    } else {
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                                {!siteFilter && <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap font-mono">{row.SITE_NO || '-'}</td>}
                                                <td className="px-5 py-4 text-sm text-slate-500 font-mono whitespace-nowrap">{row.EPF_NUMBER || '-'}</td>
                                                <td className="px-5 py-4 text-sm font-semibold text-slate-900 whitespace-nowrap">{row.NAME}</td>
                                                <td className="px-5 py-4 text-sm text-right text-slate-900 whitespace-nowrap">{row.SUM_COUNT || row.sum_count}</td>
                                                <td className="px-5 py-4 text-sm text-right font-bold text-violet-600 whitespace-nowrap">{row.extra_units}</td>
                                                {canSeePayment && <td className="px-5 py-4 text-sm text-right text-slate-500 whitespace-nowrap">{(row.ot_rate || 0).toFixed(2)}</td>}
                                                {canSeePayment && <td className="px-5 py-4 text-sm text-right font-bold text-emerald-600 whitespace-nowrap">{(row.extra_payment || 0).toFixed(2)}</td>}
                                            </tr>
                                        );
                                    }
                                })}
                            </tbody>
                            {otType === 'staff_outsource' && payrollData.length > 0 && (
                                <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                                    <tr>
                                        <td colSpan={siteFilter
                                                ? (viewMode === 'detailed' ? 7 : 2)
                                                : (viewMode === 'detailed' ? 8 : 3)}
                                            className="px-5 py-3 text-sm font-bold text-slate-700">Grand Total</td>
                                        {viewMode === 'detailed' && (
                                            <td className="px-5 py-3 text-sm font-bold text-right text-slate-900">
                                                {totalOutsourceHoursWorked.toFixed(2)} hrs
                                            </td>
                                        )}
                                        {viewMode === 'summary' && (
                                            <>
                                                <td className="px-5 py-3 text-sm font-bold text-right text-slate-900">
                                                    {payrollData.reduce((s, r) => s + (Number(r.days_attended) || 0), 0)}
                                                </td>
                                                <td className="px-5 py-3 text-sm font-bold text-right text-slate-900">
                                                    {totalOutsourceHoursWorked.toFixed(2)} hrs
                                                </td>
                                            </>
                                        )}
                                        <td className="px-5 py-3 text-sm font-bold text-right text-blue-700">
                                            {totalOutsourceExtraHours.toFixed(2)} hrs
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                            {canSeePayment && otType !== 'staff_outsource' && payrollData.length > 0 && (
                                <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                                    <tr>
                                        <td colSpan={otType === 'time_based' && viewMode === 'detailed' && siteFilter ? 7 : (siteFilter ? 2 : 3)}
                                            className="px-5 py-3 text-sm font-bold text-slate-700">
                                            Grand Total
                                        </td>
                                        {otType === 'time_based' && viewMode === 'detailed' && siteFilter && (
                                            <td className="px-5 py-3 text-sm font-bold text-right text-slate-900">{payrollData.reduce((s, r) => s + (Number(r.extra_hours) || 0), 0).toFixed(1)}</td>
                                        )}
                                        {otType === 'time_based' && !(viewMode === 'detailed' && siteFilter) && (
                                            <td className="px-5 py-3 text-sm font-bold text-right text-slate-900">{payrollData.reduce((s, r) => s + (Number(r.total_extra_hours) || 0), 0).toFixed(2)}</td>
                                        )}
                                        {otType === 'target_based' && (
                                            <>
                                                <td className="px-5 py-3 text-sm font-bold text-right text-slate-900">{payrollData.reduce((s, r) => s + (Number(r.SUM_COUNT || r.sum_count) || 0), 0)}</td>
                                                <td className="px-5 py-3 text-sm font-bold text-right text-violet-600">{payrollData.reduce((s, r) => s + (Number(r.extra_units) || 0), 0)}</td>
                                            </>
                                        )}
                                        <td className="px-5 py-3 text-sm font-bold text-right text-slate-500">—</td>
                                        <td className="px-5 py-3 text-sm font-bold text-right text-emerald-700">{totalPayment.toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}
            </div>

            {/* Poya Days Modal */}
            {showPoyaPanel && canSeePayment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowPoyaPanel(false); setEditingPoya(null); setAutoPreview([]); }} />

                    {/* Modal box */}
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

                        {/* Modal header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-orange-50">
                            <div className="flex items-center gap-2">
                                <Moon className="w-5 h-5 text-orange-500" />
                                <span className="font-bold text-slate-800">Poya Day Management</span>
                                <span className="text-xs text-slate-400 hidden sm:inline">— full-day OT (same as Sunday)</span>
                            </div>
                            <button onClick={() => { setShowPoyaPanel(false); setEditingPoya(null); setAutoPreview([]); }}
                                className="p-1.5 hover:bg-orange-100 rounded-lg transition-colors text-slate-500 hover:text-slate-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Scrollable body */}
                        <div className="overflow-y-auto flex-1 p-5 space-y-5">

                            {/* Manual add form */}
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Add Manually</p>
                                <div className="flex flex-wrap items-end gap-3">
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Date</label>
                                        <input type="date" value={newPoyaDate} onChange={e => setNewPoyaDate(e.target.value)}
                                            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-orange-400 focus:border-transparent" />
                                    </div>
                                    <div className="flex-1 min-w-[140px]">
                                        <label className="block text-xs text-slate-500 mb-1">Description (optional)</label>
                                        <input type="text" value={newPoyaDesc} onChange={e => setNewPoyaDesc(e.target.value)}
                                            placeholder="e.g. Vesak Poya"
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-orange-400 focus:border-transparent" />
                                    </div>
                                    <button onClick={addPoyaDay} disabled={!newPoyaDate}
                                        className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all active:scale-95">
                                        <Plus className="w-4 h-4" /> Add
                                    </button>
                                </div>
                            </div>

                            {/* Auto-detect */}
                            <div className="border-t border-slate-100 pt-4">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                                    Auto-Detect from Full Moon Calendar
                                </p>
                                <div className="flex flex-wrap items-end gap-3">
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Year</label>
                                        <input type="number" value={autoYear} onChange={e => { setAutoYear(Number(e.target.value)); setAutoPreview([]); }}
                                            min={2020} max={2040}
                                            className="w-28 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-orange-400 focus:border-transparent" />
                                    </div>
                                    <button onClick={generateAutoPreview}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl transition-all active:scale-95">
                                        <Sparkles className="w-4 h-4" /> Calculate {autoYear}
                                    </button>
                                </div>

                                {autoPreview.length > 0 && (
                                    <div className="mt-3 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-semibold text-slate-600">{autoPreview.length} dates found:</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => setSelectedAuto(new Set(autoPreview.filter(p => !p.exists).map(p => p.date)))}
                                                    className="text-xs text-indigo-600 hover:underline">Select New</button>
                                                <span className="text-slate-300">|</span>
                                                <button onClick={() => setSelectedAuto(new Set())}
                                                    className="text-xs text-slate-400 hover:underline">Clear All</button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {autoPreview.map(p => (
                                                <label key={p.date}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all
                                                        ${p.exists ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                                                        : selectedAuto.has(p.date) ? 'bg-orange-50 border-orange-300'
                                                        : 'bg-white border-slate-200 hover:border-orange-200'}`}>
                                                    <input type="checkbox"
                                                        checked={selectedAuto.has(p.date)}
                                                        disabled={p.exists}
                                                        onChange={() => !p.exists && toggleAutoSelect(p.date)}
                                                        className="w-3.5 h-3.5 accent-orange-500" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-bold text-slate-700">{p.date}</p>
                                                        <p className="text-xs text-slate-400 truncate">{p.description}</p>
                                                    </div>
                                                    {p.exists && <Check className="w-3 h-3 text-emerald-500 shrink-0" />}
                                                </label>
                                            ))}
                                        </div>
                                        {selectedAuto.size > 0 && (
                                            <button onClick={bulkAddPoyaDays} disabled={bulkAdding}
                                                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-all active:scale-95">
                                                <Moon className="w-4 h-4" />
                                                {bulkAdding ? 'Adding...' : `Add ${selectedAuto.size} Poya Days`}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {poyaMsg && (
                                <div className={`px-4 py-2.5 rounded-xl text-sm font-medium ${poyaMsg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'}`}>
                                    {poyaMsg.text}
                                </div>
                            )}

                            {/* Poya days list */}
                            <div className="border-t border-slate-100 pt-4">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Saved Poya Days</p>
                                {poyaDays.length === 0 ? (
                                    <p className="text-sm text-slate-400 text-center py-6">No Poya days added yet</p>
                                ) : (
                                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                                        <table className="min-w-full divide-y divide-slate-100">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Day</th>
                                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                                                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 bg-white">
                                                {poyaDays.map((p: any) => {
                                                    const d = new Date(p.POYA_DATE);
                                                    const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
                                                    const isEditing = editingPoya?.ID === p.ID;
                                                    return (
                                                        <tr key={p.ID} className={`transition-colors ${isEditing ? 'bg-orange-50' : 'hover:bg-slate-50/60'}`}>
                                                            <td className="px-4 py-3">
                                                                {isEditing
                                                                    ? <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                                                                        className="px-2 py-1 bg-white border border-orange-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-orange-400 focus:border-transparent w-36" />
                                                                    : <span className="text-sm font-mono text-slate-700">{p.POYA_DATE}</span>}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">{dayName}</span>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                {isEditing
                                                                    ? <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)}
                                                                        placeholder="e.g. Vesak Poya"
                                                                        className="w-full px-2 py-1 bg-white border border-orange-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-orange-400 focus:border-transparent" />
                                                                    : <span className="text-sm text-slate-500">{p.DESCRIPTION || '—'}</span>}
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                {isEditing ? (
                                                                    <div className="flex items-center justify-end gap-1">
                                                                        <button onClick={saveEditPoya}
                                                                            className="px-2.5 py-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors">
                                                                            Save
                                                                        </button>
                                                                        <button onClick={() => setEditingPoya(null)}
                                                                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                                                            <X className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center justify-end gap-1">
                                                                        <button onClick={() => openEditPoya(p)}
                                                                            className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                                                            <Pencil className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <button onClick={() => deletePoyaDay(p.ID)}
                                                                            className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                )}
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
                    </div>
                </div>
            )}

            {/* Payroll Saved History Panel */}
            {showPayrollHistory && (
                <div className="space-y-4">
                    <div className="card p-5">
                        <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                            <History className="w-4 h-4 text-indigo-600" />
                            Saved Payroll History
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">History From</label>
                                <input type="date" value={histDateFrom} onChange={e => setHistDateFrom(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">History To</label>
                                <input type="date" value={histDateTo} onChange={e => setHistDateTo(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Site No</label>
                                <input type="text" value={histSiteNo} onChange={e => setHistSiteNo(e.target.value)}
                                    placeholder="e.g. S001"
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                            </div>
                        </div>
                    </div>

                    {histLoading ? (
                        <div className="card p-6 space-y-3">
                            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
                        </div>
                    ) : payrollHistory.length === 0 ? (
                        <div className="card py-12 text-center">
                            <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-semibold text-slate-500">No saved payroll history found</p>
                        </div>
                    ) : (() => {
                        const batchMap = new Map<string, any[]>();
                        payrollHistory.forEach((r: any) => {
                            const key = r.BATCH_ID;
                            if (!batchMap.has(key)) batchMap.set(key, []);
                            batchMap.get(key)!.push(r);
                        });
                        return Array.from(batchMap.entries()).map(([batchId, rows]) => {
                            const first = rows[0];
                            const totalPayment = rows.reduce((s: number, r: any) => s + (Number(r.EXTRA_PAYMENT) || 0), 0);
                            const totalUnitsH = rows.reduce((s: number, r: any) => s + (Number(r.EXTRA_UNITS) || 0), 0);
                            return (
                                <div key={batchId} className="card overflow-hidden">
                                    <div className="bg-indigo-600 px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
                                        <span className="text-white font-bold text-sm">{first.SITE_NO} — {first.SITE_NAME}</span>
                                        <span className="text-indigo-200 text-xs">{first.DATE_FROM} → {first.DATE_TO}</span>
                                        <span className="text-indigo-200 text-xs">Saved: {first.SAVED_AT}</span>
                                        <span className="text-indigo-100 text-xs font-semibold">{rows.length} staff</span>
                                        <span className="ml-auto text-white font-bold text-sm">Total: {totalPayment.toFixed(2)}</span>
                                        <span className="text-indigo-200 text-xs">Extra Units: {totalUnitsH}</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-slate-100">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">EPF</th>
                                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff</th>
                                                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Count</th>
                                                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Target</th>
                                                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Extra Units</th>
                                                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate</th>
                                                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-600 uppercase tracking-wider">Payment</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {rows.map((r: any) => (
                                                    <tr key={r.ID} className="hover:bg-slate-50/60 transition-colors">
                                                        <td className="px-4 py-3 text-xs text-slate-500 font-mono">{r.EPF_NUMBER || '-'}</td>
                                                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{r.STAFF_NAME}</td>
                                                        <td className="px-4 py-3 text-sm text-right text-slate-900">{r.SUM_COUNT}</td>
                                                        <td className="px-4 py-3 text-sm text-right text-slate-500">{r.TARGET_COUNT}</td>
                                                        <td className="px-4 py-3 text-sm text-right font-bold text-violet-600">{r.EXTRA_UNITS}</td>
                                                        <td className="px-4 py-3 text-sm text-right text-slate-500">{Number(r.EXTRA_UNIT_RATE).toFixed(4)}</td>
                                                        <td className="px-4 py-3 text-sm text-right font-bold text-emerald-600">{Number(r.EXTRA_PAYMENT).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        });
                    })()}
                </div>
            )}
        </div>
    );
};


export default Payroll;
