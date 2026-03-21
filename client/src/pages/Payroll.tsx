import React, { useEffect, useState } from 'react';
import api from '../services/api';
import type { Site } from '../types';
import { format } from 'date-fns';
import { MapPin, FileText, Download, Calendar, Clock, Target, TrendingUp, DollarSign, Users, Save, History, ChevronDown, ChevronUp } from 'lucide-react';
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

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Payroll</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Calculate overtime and performance payments</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
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
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
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
                            </select>
                        </div>
                    </div>
                </div>

                {otType === 'time_based' && (
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
                    {otType === 'time_based' && (
                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                                <Clock className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Total Hours</p>
                                <p className="text-xl font-bold text-slate-900">{totalHours.toFixed(1)}</p>
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
                            <p className="text-sm font-bold text-slate-900">{otType === 'time_based' ? 'Time Based' : 'Target'}</p>
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
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
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
                                {otType === 'time_based' ? (
                                    (viewMode === 'detailed' && siteFilter) ? (
                                        <tr>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">EPF No</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">In / Out</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Def. In</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Def. Out</th>
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
                                    if (otType === 'time_based' && viewMode === 'detailed' && siteFilter) {
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-4 text-sm text-slate-500 font-mono whitespace-nowrap">{row.EPF_NUMBER || '-'}</td>
                                                <td className="px-5 py-4 text-sm font-semibold text-slate-900 whitespace-nowrap">{row.NAME}</td>
                                                <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">{safeFormatDate(row.TASK_DATE || row.task_date)}</td>
                                                <td className="px-5 py-4 whitespace-nowrap">
                                                    <div className="flex flex-col gap-0.5 text-xs">
                                                        <span className="text-emerald-600 font-medium">In: {row.IN_TIME || '-'}</span>
                                                        <span className="text-rose-500 font-medium">Out: {row.OUT_TIME || '-'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-sm text-right text-slate-500 whitespace-nowrap font-mono">{row.default_in_time || DEFAULT_IN_TIME}</td>
                                                <td className="px-5 py-4 text-sm text-right text-slate-500 whitespace-nowrap font-mono">{row.default_out_time || DEFAULT_OUT_TIME}</td>
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
                            {canSeePayment && payrollData.length > 0 && (
                                <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                                    <tr>
                                        <td colSpan={otType === 'time_based' && viewMode === 'detailed' && siteFilter ? 5 : otType === 'time_based' ? (siteFilter ? 3 : 4) : (siteFilter ? 4 : 5)}
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

            {/* Payroll Saved History Panel */}
            {showPayrollHistory && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
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
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-3">
                            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
                        </div>
                    ) : payrollHistory.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-12 text-center">
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
                                <div key={batchId} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
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
