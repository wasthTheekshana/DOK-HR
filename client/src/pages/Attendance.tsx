import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Attendance, Site } from '../types';
import { format } from 'date-fns';
import { Calendar, MapPin, Clock, User, CheckCircle, FileText, ClipboardList, BarChart2, AlertCircle, Download, CalendarDays } from 'lucide-react';
import * as XLSX from 'xlsx';

const AttendancePage: React.FC = () => {
    const { role } = useAuth();
    const isStaff = role === 'staff';

    const [attendance, setAttendance] = useState<Attendance[]>([]);
    const [sites, setSites] = useState<Site[]>([]);
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState<{ STAFF_NAME: string; DAYS_COUNT: number; EPF_NUMBER: string }[]>([]);
    const [viewMode, setViewMode] = useState<'log' | 'date-report' | 'report'>('log');
    const [siteFilter, setSiteFilter] = useState('');
    const [dateFrom, setDateFrom] = useState(format(new Date(new Date().setMonth(new Date().getMonth() - 1, 1)), 'yyyy-MM-dd'));
    const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

    useEffect(() => {
        if (isStaff) return; // staff doesn't need site list
        const loadSites = async () => {
            try {
                const res = await api.get('/sites');
                setSites(res.data);
                if (res.data.length > 0) setSiteFilter(res.data[0].SITE_NO);
            } catch (error) { console.error('Failed to load sites', error); }
        };
        loadSites();
    }, [isStaff]);

    useEffect(() => {
        if (isStaff) {
            fetchAttendance();
        } else if (siteFilter) {
            if (viewMode === 'report') fetchReport();
            else fetchAttendance();
        }
    }, [siteFilter, dateFrom, dateTo, viewMode, isStaff]);

    const fetchAttendance = async () => {
        setLoading(true);
        try {
            const params: any = { date_from: dateFrom, date_to: dateTo };
            if (!isStaff && siteFilter) params.site_no = siteFilter;
            const response = await api.get('/attendance', { params });
            setAttendance(response.data);
        } catch (error) { console.error('Failed to fetch attendance', error); }
        finally { setLoading(false); }
    };

    const fetchReport = async () => {
        setLoading(true);
        try {
            const response = await api.get('/attendance/report', {
                params: { site_no: siteFilter, date_from: dateFrom, date_to: dateTo }
            });
            setReportData(response.data);
        } catch (error) { console.error('Failed to fetch report', error); }
        finally { setLoading(false); }
    };

    // ── Excel downloads ──────────────────────────────────────────────────────
    const downloadLog = () => {
        const rows = attendance.map(a => ({
            Date: format(new Date(a.ATTENDANCE_DATE), 'yyyy-MM-dd'),
            Employee: a.STAFF_NAME || '',
            'In Time': a.IN_TIME || '',
            'Out Time': a.OUT_TIME || '',
            Status: a.OT_TYPE === 'target_based'
                ? 'Complete'
                : (a.IN_TIME && a.OUT_TIME ? 'Complete' : a.IN_TIME ? 'In Progress' : 'Pending')
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Attendance Log');
        XLSX.writeFile(wb, `attendance_log_${siteFilter}_${dateFrom}_${dateTo}.xlsx`);
    };

    const downloadStaffReport = () => {
        const rows = reportData.map(r => ({
            'EPF Number': r.EPF_NUMBER,
            'Employee Name': r.STAFF_NAME,
            'Days Attended': r.DAYS_COUNT
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Staff Report');
        XLSX.writeFile(wb, `attendance_staff_report_${siteFilter}_${dateFrom}_${dateTo}.xlsx`);
    };

    const downloadDateReport = () => {
        const rows: any[] = [];
        const dateGroups = groupByDate(attendance);
        Object.entries(dateGroups)
            .sort(([a], [b]) => b.localeCompare(a))
            .forEach(([date, records]) => {
                records.forEach(a => {
                    rows.push({
                        Date: date,
                        Employee: a.STAFF_NAME || '',
                        'In Time': a.IN_TIME || '',
                        'Out Time': a.OUT_TIME || '',
                        Status: a.OT_TYPE === 'target_based'
                            ? 'Complete'
                            : (a.IN_TIME && a.OUT_TIME ? 'Complete' : a.IN_TIME ? 'In Progress' : 'Pending')
                    });
                });
            });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Date Report');
        XLSX.writeFile(wb, `attendance_date_report_${siteFilter}_${dateFrom}_${dateTo}.xlsx`);
    };

    // ── Helpers ──────────────────────────────────────────────────────────────
    const groupByDate = (records: Attendance[]) =>
        records.reduce((acc, a) => {
            const d = a.ATTENDANCE_DATE.slice(0, 10);
            if (!acc[d]) acc[d] = [];
            acc[d].push(a);
            return acc;
        }, {} as Record<string, Attendance[]>);

    const selectedSite = sites.find(s => s.SITE_NO === siteFilter);
    const completeCount = attendance.filter(a =>
        a.OT_TYPE === 'target_based' ? true : (!!a.IN_TIME && !!a.OUT_TIME)
    ).length;
    const inProgressCount = attendance.filter(a =>
        a.OT_TYPE !== 'target_based' && !!a.IN_TIME && !a.OUT_TIME
    ).length;
    const totalDays = reportData.reduce((s, r) => s + r.DAYS_COUNT, 0);
    const dateGroups = groupByDate(attendance);
    const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Attendance</h1>
                    <p className="text-sm text-slate-500 mt-0.5">View and manage attendance records</p>
                </div>
                {selectedSite && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl w-fit">
                        <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="text-sm font-semibold text-indigo-800">{selectedSite.NAME}</span>
                    </div>
                )}
            </div>

            {/* Filters & Toggle */}
            <div className="card p-5">
                <div className="flex flex-col gap-4">
                    {/* View Toggle */}
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setViewMode('log')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${viewMode === 'log' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            <ClipboardList className="w-4 h-4" /> Detailed Log
                        </button>
                        <button onClick={() => setViewMode('date-report')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${viewMode === 'date-report' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            <CalendarDays className="w-4 h-4" /> Date Report
                        </button>
                        {!isStaff && (
                            <button onClick={() => setViewMode('report' as any)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${'report' === viewMode ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                <BarChart2 className="w-4 h-4" /> Staff Summary
                            </button>
                        )}
                    </div>

                    {/* Filters */}
                    <div className={`grid grid-cols-1 gap-3 ${isStaff ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
                        {!isStaff && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Site</label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">
                                    <option value="">Select Site</option>
                                    {sites.map(s => <option key={s.ID} value={s.SITE_NO}>{s.SITE_NO} - {s.NAME}</option>)}
                                </select>
                            </div>
                        </div>
                        )}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date From</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date To</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Strip (Log + Date Report mode) */}
            {(viewMode === 'log' || viewMode === 'date-report') && !loading && attendance.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                        <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-600" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500">Total Records</p>
                            <p className="text-lg font-bold text-slate-900">{attendance.length}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500">Complete</p>
                            <p className="text-lg font-bold text-emerald-700">{completeCount}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                        <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
                            <AlertCircle className="w-4 h-4 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500">In Progress</p>
                            <p className="text-lg font-bold text-amber-700">{inProgressCount}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Stats Strip (Staff Summary mode) */}
            {viewMode === 'report' && !loading && reportData.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                        <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center">
                            <User className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500">Total Staff</p>
                            <p className="text-lg font-bold text-slate-900">{reportData.length}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
                            <Calendar className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500">Total Days</p>
                            <p className="text-lg font-bold text-slate-900">{totalDays}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Content */}
            {(isStaff || siteFilter) ? (
                <div className="card overflow-hidden">
                    {loading ? (
                        <div className="p-6 space-y-3">
                            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
                        </div>

                    ) : viewMode === 'log' ? (
                        <>
                            {/* Download bar */}
                            {attendance.length > 0 && (
                                <div className="flex justify-end px-5 py-3 border-b border-slate-100 bg-slate-50">
                                    <button onClick={downloadLog}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors">
                                        <Download className="w-4 h-4" /> Download Excel
                                    </button>
                                </div>
                            )}
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                                            {isStaff && <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>}
                                            {!isStaff && <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>}
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">In Time</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Out Time</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {attendance.length === 0 ? (
                                            <tr>
                                                <td colSpan={isStaff ? 4 : 5} className="px-6 py-16 text-center">
                                                    <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                                    <p className="text-slate-500 font-medium">No attendance records found for this period</p>
                                                </td>
                                            </tr>
                                        ) : attendance.map((att) => {
                                            const hasIn = !!att.IN_TIME;
                                            const hasOut = !!att.OUT_TIME;
                                            const isComplete = att.OT_TYPE === 'target_based' ? true : (hasIn && hasOut);
                                            return (
                                                <tr key={att.ID} className="hover:bg-slate-50/60 transition-colors">
                                                    <td className="px-5 py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-2">
                                                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                            <span className="text-sm font-medium text-slate-900">
                                                                {format(new Date(att.ATTENDANCE_DATE), 'MMM dd, yyyy')}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    {isStaff ? (
                                                        <td className="px-5 py-4 whitespace-nowrap">
                                                            <div className="flex items-center gap-1.5">
                                                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                                                <span className="text-sm font-medium text-slate-700">{att.SITE_NAME || att.SITE_NO || '—'}</span>
                                                            </div>
                                                        </td>
                                                    ) : (
                                                        <td className="px-5 py-4 whitespace-nowrap">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-600">
                                                                    {(att.STAFF_NAME || 'U').charAt(0).toUpperCase()}
                                                                </div>
                                                                <span className="text-sm font-medium text-slate-900">{att.STAFF_NAME || 'Unknown'}</span>
                                                            </div>
                                                        </td>
                                                    )}
                                                    <td className="px-5 py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-1.5">
                                                            <Clock className="w-3.5 h-3.5 text-emerald-500" />
                                                            <span className={`text-sm font-medium ${hasIn ? 'text-slate-900' : 'text-slate-300'}`}>
                                                                {att.IN_TIME || '—'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-1.5">
                                                            <Clock className="w-3.5 h-3.5 text-rose-400" />
                                                            <span className={`text-sm font-medium ${hasOut ? 'text-slate-900' : 'text-slate-300'}`}>
                                                                {att.OUT_TIME || '—'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4 whitespace-nowrap">
                                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${isComplete ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : hasIn ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
                                                            {isComplete && <CheckCircle className="w-3 h-3" />}
                                                            {isComplete ? 'Complete' : hasIn ? 'In Progress' : 'Pending'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>

                    ) : viewMode === 'date-report' ? (
                        <>
                            {/* Download bar */}
                            {attendance.length > 0 && (
                                <div className="flex justify-end px-5 py-3 border-b border-slate-100 bg-slate-50">
                                    <button onClick={downloadDateReport}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors">
                                        <Download className="w-4 h-4" /> Download Excel
                                    </button>
                                </div>
                            )}
                            {attendance.length === 0 ? (
                                <div className="px-6 py-16 text-center">
                                    <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                    <p className="text-slate-500 font-medium">No attendance records found for this period</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {sortedDates.map(date => {
                                        const records = dateGroups[date];
                                        return (
                                            <div key={date}>
                                                {/* Date header */}
                                                <div className="flex items-center justify-between px-5 py-3 bg-slate-50">
                                                    <div className="flex items-center gap-2">
                                                        <CalendarDays className="w-4 h-4 text-indigo-500" />
                                                        <span className="text-sm font-bold text-slate-800">
                                                            {format(new Date(date), 'EEEE, MMMM dd, yyyy')}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full">
                                                        {records.length} staff
                                                    </span>
                                                </div>
                                                {/* Staff rows for this date */}
                                                <div className="divide-y divide-slate-50">
                                                    {records.map(att => {
                                                        const hasIn = !!att.IN_TIME;
                                                        const hasOut = !!att.OUT_TIME;
                                                        const isComplete = att.OT_TYPE === 'target_based' ? true : (hasIn && hasOut);
                                                        return (
                                                            <div key={att.ID} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/60 transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-600">
                                                                        {(att.STAFF_NAME || 'U').charAt(0).toUpperCase()}
                                                                    </div>
                                                                    <span className="text-sm font-medium text-slate-900">{att.STAFF_NAME || 'Unknown'}</span>
                                                                </div>
                                                                <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4">
                                                                    {(att.IN_TIME || att.OUT_TIME) && (
                                                                        <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500">
                                                                            <span className="flex items-center gap-1">
                                                                                <Clock className="w-3 h-3 text-emerald-500" />
                                                                                {att.IN_TIME || '—'}
                                                                            </span>
                                                                            <span className="text-slate-300">→</span>
                                                                            <span className="flex items-center gap-1">
                                                                                <Clock className="w-3 h-3 text-rose-400" />
                                                                                {att.OUT_TIME || '—'}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${isComplete ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : hasIn ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
                                                                        {isComplete && <CheckCircle className="w-3 h-3" />}
                                                                        {isComplete ? 'Complete' : hasIn ? 'In Progress' : 'Pending'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>

                    ) : (
                        /* Staff Summary report */
                        <>
                            {reportData.length > 0 && (
                                <div className="flex justify-end px-5 py-3 border-b border-slate-100 bg-slate-50">
                                    <button onClick={downloadStaffReport}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors">
                                        <Download className="w-4 h-4" /> Download Excel
                                    </button>
                                </div>
                            )}
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">EPF Number</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee Name</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Days Attended</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {reportData.length === 0 ? (
                                            <tr>
                                                <td colSpan={3} className="px-6 py-16 text-center">
                                                    <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                                    <p className="text-slate-500 font-medium">No data found for this period</p>
                                                </td>
                                            </tr>
                                        ) : reportData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">{row.EPF_NUMBER}</td>
                                                <td className="px-5 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700">
                                                            {row.STAFF_NAME.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="text-sm font-medium text-slate-900">{row.STAFF_NAME}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 whitespace-nowrap text-right">
                                                    <span className="inline-flex items-center justify-center w-10 h-7 bg-indigo-50 text-indigo-700 text-sm font-bold rounded-lg">
                                                        {row.DAYS_COUNT}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {reportData.length > 0 && (
                                        <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                            <tr>
                                                <td className="px-5 py-3.5 text-sm font-bold text-slate-700" colSpan={2}>Total</td>
                                                <td className="px-5 py-3.5 text-right">
                                                    <span className="inline-flex items-center justify-center w-10 h-7 bg-indigo-600 text-white text-sm font-bold rounded-lg">
                                                        {totalDays}
                                                    </span>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </>
                    )}
                </div>
            ) : (
                <div className="card py-16 text-center">
                    <MapPin className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-slate-900 mb-1">Select a site</h3>
                    <p className="text-sm text-slate-500">Choose a site above to view attendance records</p>
                </div>
            )}

        </div>
    );
};

export default AttendancePage;
