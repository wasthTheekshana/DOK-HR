import React, { useState, useEffect } from 'react';
import api from '../services/api';
import type { Site } from '../types';
import { format } from 'date-fns';
import { FileText, Download, Printer, Filter, Calculator, Clock, ClipboardList, Target, Save, Archive } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const Reports: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'daily_count' | 'salary' | 'ot_analysis' | 'custom_ot'>('daily_count');
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [reportData, setReportData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const [targetSite, setTargetSite] = useState('');
    const [targetDateFrom, setTargetDateFrom] = useState(format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'));
    const [targetDateTo, setTargetDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [targetReportData, setTargetReportData] = useState<any[]>([]);
    const [targetLoading, setTargetLoading] = useState(false);

    const [otSite, setOtSite] = useState('');
    const [otDateFrom, setOtDateFrom] = useState(format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'));
    const [otDateTo, setOtDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [otReportData, setOtReportData] = useState<any[]>([]);
    const [otLoading, setOtLoading] = useState(false);

    const [customOtSite, setCustomOtSite] = useState('');
    const [customOtDateFrom, setCustomOtDateFrom] = useState(format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'));
    const [customOtDateTo, setCustomOtDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [customOtPercentage, setCustomOtPercentage] = useState<number | string>(100);
    const [customOtData, setCustomOtData] = useState<any[]>([]);
    const [customOtLoading, setCustomOtLoading] = useState(false);
    const [savingOT, setSavingOT] = useState(false);
    const [saveOTMessage, setSaveOTMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showOTHistory, setShowOTHistory] = useState(false);
    const [otHistory, setOtHistory] = useState<any[]>([]);
    const [otHistoryLoading, setOtHistoryLoading] = useState(false);
    const [histDateFrom, setHistDateFrom] = useState(format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'));
    const [histDateTo, setHistDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [histSiteNo, setHistSiteNo] = useState('');

    useEffect(() => {
        const loadSites = async () => {
            try {
                const res = await api.get('/sites');
                setSites(res.data);
                setSelectedSite('');
            } catch (error) { console.error('Failed to load sites', error); }
        };
        loadSites();
    }, []);

    const fetchReportData = async () => {
        if (!reportDate) return;
        setLoading(true);
        try {
            const params: any = { date: reportDate };
            if (selectedSite) params.site_id = selectedSite;
            const res = await api.get('/tasks/summary', { params });
            setReportData(res.data);
        } catch { setReportData([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { if (activeTab === 'daily_count') fetchReportData(); }, [selectedSite, reportDate, activeTab]);

    const fetchTargetBaseReport = async () => {
        if (!targetDateFrom || !targetDateTo) return;
        setTargetLoading(true);
        try {
            const params: any = { date_from: targetDateFrom, date_to: targetDateTo };
            if (targetSite) params.site_id = targetSite;
            const res = await api.get('/tasks/target-base-report', { params });
            setTargetReportData(res.data);
        } catch { setTargetReportData([]); }
        finally { setTargetLoading(false); }
    };

    useEffect(() => { if (activeTab === 'salary') fetchTargetBaseReport(); }, [targetSite, targetDateFrom, targetDateTo, activeTab]);

    const fetchOTAnalysisReport = async () => {
        if (!otDateFrom || !otDateTo) return;
        setOtLoading(true);
        try {
            const params: any = { date_from: otDateFrom, date_to: otDateTo };
            if (otSite) params.site_id = otSite;
            const res = await api.get('/tasks/ot-analysis-report', { params });
            setOtReportData(res.data);
        } catch { setOtReportData([]); }
        finally { setOtLoading(false); }
    };

    useEffect(() => { if (activeTab === 'ot_analysis') fetchOTAnalysisReport(); }, [otSite, otDateFrom, otDateTo, activeTab]);

    const exportPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18); doc.text('Daily Count Report', 14, 20);
        doc.setFontSize(10); doc.text(`Date: ${reportDate}`, 14, 30);
        const siteName = selectedSite ? sites.find(s => s.ID.toString() === selectedSite)?.NAME || 'Unknown' : 'All Sites';
        doc.text(`Site: ${siteName}`, 14, 35);
        autoTable(doc, {
            head: [['Staff', 'Task', 'Count', 'Target', 'Type', 'In', 'Out']],
            body: reportData.map(r => [r.STAFF_NAME, r.TASK_DESCRIPTION, r.TASK_COUNT || '-', r.TASK_TARGET || '-', r.OT_TYPE, r.IN_TIME || '-', r.OUT_TIME || '-']),
            startY: 45
        });
        doc.save(`daily_count_report_${reportDate}.pdf`);
    };

    const exportExcel = () => {
        const ws = XLSX.utils.json_to_sheet(reportData.map(r => ({
            'Staff Name': r.STAFF_NAME, 'Site Name': r.SITE_NAME, 'Task': r.TASK_DESCRIPTION,
            'Count': r.TASK_COUNT, 'Target': r.TASK_TARGET, 'OT Type': r.OT_TYPE,
            'In Time': r.IN_TIME, 'Out Time': r.OUT_TIME
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Daily Count');
        XLSX.writeFile(wb, `daily_count_report_${reportDate}.xlsx`);
    };

    const exportTargetPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18); doc.text('Target Base Report', 14, 20);
        doc.setFontSize(10);
        const siteName = sites.find(s => s.ID.toString() === targetSite)?.NAME || 'Unknown';
        doc.text(`Site: ${siteName}`, 14, 30);
        doc.text(`Period: ${targetDateFrom} to ${targetDateTo}`, 14, 35);
        const grand = targetReportData.reduce((s, r) => s + (Number(r.TOTAL_COUNT) || 0), 0);
        autoTable(doc, {
            head: [['Staff Name', 'Total Count']],
            body: [...targetReportData.map(r => [r.STAFF_NAME, r.TOTAL_COUNT || 0]), ['GRAND TOTAL', grand]],
            startY: 45
        });
        doc.save(`target_base_report_${targetDateFrom}_to_${targetDateTo}.pdf`);
    };

    const exportTargetExcel = () => {
        const grand = targetReportData.reduce((s, r) => s + (Number(r.TOTAL_COUNT) || 0), 0);
        const ws = XLSX.utils.json_to_sheet([
            ...targetReportData.map(r => ({ 'Staff Name': r.STAFF_NAME, 'Total Count': r.TOTAL_COUNT || 0 })),
            { 'Staff Name': 'GRAND TOTAL', 'Total Count': grand }
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Target Base');
        XLSX.writeFile(wb, `target_base_report_${targetDateFrom}_to_${targetDateTo}.xlsx`);
    };

    const exportOTPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18); doc.text('Time Base OT Analysis', 14, 20);
        doc.setFontSize(10);
        const siteName = otSite ? sites.find(s => s.ID.toString() === otSite)?.NAME || 'Unknown' : 'All Sites';
        doc.text(`Site: ${siteName}`, 14, 30);
        doc.text(`Period: ${otDateFrom} to ${otDateTo}`, 14, 35);
        const grandHrs = otReportData.reduce((s, r) => s + (Number(r.TOTAL_EXTRA_HRS) || 0), 0);
        const grandPay = otReportData.reduce((s, r) => s + (Number(r.PAYMENT) || 0), 0);
        const otStaff = otReportData.filter(r => r.IS_OT);
        const nonOtStaff = otReportData.filter(r => !r.IS_OT);
        const head = [['Staff Name', 'OT Status', 'OT %', 'Extra Hrs', 'Rate/Hr', 'Payment']];
        const body = [
            ...otStaff.map(r => [r.STAFF_NAME, 'OT', `${r.OT_PERCENTAGE}%`, (Number(r.TOTAL_EXTRA_HRS) || 0).toFixed(2), (Number(r.OT_RATE) || 0).toFixed(2), (Number(r.PAYMENT) || 0).toFixed(2)]),
            ...nonOtStaff.map(r => [r.STAFF_NAME, 'No OT', '0%', (Number(r.TOTAL_EXTRA_HRS) || 0).toFixed(2), '-', '-']),
            ['GRAND TOTAL', '', '', grandHrs.toFixed(2), '', grandPay.toFixed(2)]
        ];
        autoTable(doc, { head, body, startY: 45,
            didParseCell: (data: any) => {
                if (data.section === 'body' && data.row.index >= otStaff.length && data.row.index < otStaff.length + nonOtStaff.length) {
                    data.cell.styles.fillColor = [248, 250, 252];
                    data.cell.styles.textColor = [100, 116, 139];
                }
            }
        });
        doc.save(`ot_analysis_report_${otDateFrom}_to_${otDateTo}.pdf`);
    };

    const exportOTExcel = () => {
        const grandHrs = otReportData.reduce((s, r) => s + (Number(r.TOTAL_EXTRA_HRS) || 0), 0);
        const grandPay = otReportData.reduce((s, r) => s + (Number(r.PAYMENT) || 0), 0);
        const ws = XLSX.utils.json_to_sheet([
            ...otReportData.map(r => ({
                'Staff Name': r.STAFF_NAME,
                'OT Status': r.IS_OT ? 'OT' : 'No OT',
                'OT %': r.IS_OT ? `${r.OT_PERCENTAGE}%` : '0%',
                'Total Extra Hours': (Number(r.TOTAL_EXTRA_HRS) || 0).toFixed(2),
                'Rate / Hr': r.IS_OT ? (Number(r.OT_RATE) || 0).toFixed(2) : '-',
                'Payment': r.IS_OT ? (Number(r.PAYMENT) || 0).toFixed(2) : '-'
            })),
            { 'Staff Name': 'GRAND TOTAL', 'OT Status': '', 'OT %': '', 'Total Extra Hours': grandHrs.toFixed(2), 'Rate / Hr': '', 'Payment': grandPay.toFixed(2) }
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'OT Analysis');
        XLSX.writeFile(wb, `ot_analysis_report_${otDateFrom}_to_${otDateTo}.xlsx`);
    };

    const fetchInitialCustomOTData = async () => {
        if (!customOtDateFrom || !customOtDateTo) return;
        setCustomOtLoading(true);
        try {
            const params: any = { date_from: customOtDateFrom, date_to: customOtDateTo };
            if (customOtSite) params.site_id = customOtSite;
            const res = await api.get('/payroll/custom-ot-report', { params });
            setCustomOtData(res.data);
        } catch { setCustomOtData([]); }
        finally { setCustomOtLoading(false); }
    };

    const applyCustomPercentage = async () => {
        if (!customOtDateFrom || !customOtDateTo || !customOtPercentage) return;
        setCustomOtLoading(true);
        try {
            const params: any = { date_from: customOtDateFrom, date_to: customOtDateTo, custom_percentage: customOtPercentage };
            if (customOtSite) params.site_id = customOtSite;
            const res = await api.get('/payroll/custom-ot-report', { params });
            setCustomOtData(res.data);
        } catch { } finally { setCustomOtLoading(false); }
    };

    useEffect(() => { if (activeTab === 'custom_ot') fetchInitialCustomOTData(); }, [customOtSite, customOtDateFrom, customOtDateTo, activeTab]);

    const saveCustomOTToDb = async () => {
        if (customOtData.length === 0) return;
        setSavingOT(true);
        setSaveOTMessage(null);
        try {
            const selectedSiteObj = customOtSite ? sites.find(s => s.ID.toString() === customOtSite) : null;
            await api.post('/payroll/custom-ot-save', {
                date_from: customOtDateFrom,
                date_to: customOtDateTo,
                site_no: selectedSiteObj?.SITE_NO || null,
                records: customOtData
            });
            setSaveOTMessage({ type: 'success', text: `Saved ${customOtData.length} records successfully.` });
        } catch {
            setSaveOTMessage({ type: 'error', text: 'Failed to save. Please try again.' });
        } finally {
            setSavingOT(false);
        }
    };

    const fetchOTHistory = async () => {
        setOtHistoryLoading(true);
        try {
            const params: any = { date_from: histDateFrom, date_to: histDateTo };
            if (histSiteNo) params.site_no = histSiteNo;
            const res = await api.get('/payroll/custom-ot-history', { params });
            setOtHistory(res.data);
        } catch { setOtHistory([]); }
        finally { setOtHistoryLoading(false); }
    };

    useEffect(() => {
        if (showOTHistory && activeTab === 'custom_ot') fetchOTHistory();
    }, [showOTHistory, histDateFrom, histDateTo, histSiteNo, activeTab]);

    const exportCustomOTPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18); doc.text('Custom OT Percentage Report', 14, 20);
        doc.setFontSize(10);
        const siteName = customOtSite ? sites.find(s => s.ID.toString() === customOtSite)?.NAME || 'Unknown' : 'All Sites';
        doc.text(`Site: ${siteName}`, 14, 30);
        doc.text(`Period: ${customOtDateFrom} to ${customOtDateTo}`, 14, 35);
        doc.text(`Custom OT %: ${customOtPercentage}%`, 14, 40);
        const gH = customOtData.reduce((s, r) => s + (Number(r.total_extra_hours) || 0), 0);
        const gA = customOtData.reduce((s, r) => s + (Number(r.total_adjusted_extra_hours) || 0), 0);
        const gP = customOtData.reduce((s, r) => s + (Number(r.total_payment) || 0), 0);
        autoTable(doc, {
            head: [['Site', 'EPF No', 'Staff', 'Type', 'Extra Hrs', 'Adj. Hrs', 'Payment']],
            body: [
                ...customOtData.map(r => [r.site_no, r.epf_number || '-', r.staff_name, r.calculation_type || 'Custom %', (Number(r.total_extra_hours) || 0).toFixed(2), (Number(r.total_adjusted_extra_hours) || 0).toFixed(2), (Number(r.total_payment) || 0).toFixed(2)]),
                ['', '', 'GRAND TOTAL', '', gH.toFixed(2), gA.toFixed(2), gP.toFixed(2)]
            ],
            startY: 50
        });
        doc.save(`custom_ot_report_${customOtDateFrom}_to_${customOtDateTo}.pdf`);
    };

    const exportCustomOTExcel = () => {
        const gH = customOtData.reduce((s, r) => s + (Number(r.total_extra_hours) || 0), 0);
        const gA = customOtData.reduce((s, r) => s + (Number(r.total_adjusted_extra_hours) || 0), 0);
        const gP = customOtData.reduce((s, r) => s + (Number(r.total_payment) || 0), 0);
        const ws = XLSX.utils.json_to_sheet([
            ...customOtData.map(r => ({ 'Site': r.site_no, 'EPF Number': r.epf_number || '-', 'Staff Name': r.staff_name, 'Type': r.calculation_type || 'Custom %', 'Extra Hours': (Number(r.total_extra_hours) || 0).toFixed(2), 'Custom OT %': r.calculation_type === '90% Fixed' ? 'N/A' : customOtPercentage + '%', 'Adjusted Hours': (Number(r.total_adjusted_extra_hours) || 0).toFixed(2), 'Payment': (Number(r.total_payment) || 0).toFixed(2) })),
            { 'Site': '', 'EPF Number': '', 'Staff Name': 'GRAND TOTAL', 'Type': '', 'Extra Hours': gH.toFixed(2), 'Custom OT %': '', 'Adjusted Hours': gA.toFixed(2), 'Payment': gP.toFixed(2) }
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Custom OT');
        XLSX.writeFile(wb, `custom_ot_report_${customOtDateFrom}_to_${customOtDateTo}.xlsx`);
    };

    const tabs = [
        { id: 'daily_count' as const, label: 'Daily Count', icon: ClipboardList },
        { id: 'salary' as const, label: 'Target Base', icon: Target },
        { id: 'ot_analysis' as const, label: 'OT Analysis', icon: Clock },
        { id: 'custom_ot' as const, label: 'Custom OT %', icon: Calculator },
    ];

    const SiteSelect = ({ value, onChange }: { value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void }) => (
        <div className="relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select value={value} onChange={onChange}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all appearance-none">
                <option value="">All Sites</option>
                {sites.map(s => <option key={s.ID} value={s.ID}>{s.SITE_NO} - {s.NAME}</option>)}
            </select>
        </div>
    );

    const DateInput = ({ value, onChange }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
        <input type="date" value={value} onChange={onChange}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
    );

    const ExportButtons = ({ onPDF, onExcel, disabled }: { onPDF: () => void; onExcel: () => void; disabled: boolean }) => (
        <div className="flex gap-2">
            <button onClick={onPDF} disabled={disabled}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">PDF</span>
            </button>
            <button onClick={onExcel} disabled={disabled}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Excel</span>
            </button>
        </div>
    );

    const LoadingState = () => (
        <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
    );

    const EmptyState = () => (
        <div className="py-16 text-center">
            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No data found for the selected criteria</p>
        </div>
    );

    const FilterLabel = ({ children }: { children: React.ReactNode }) => (
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{children}</label>
    );

    return (
        <div className="space-y-5">
            {/* Header */}
            <div>
                <h1 className="text-xl font-bold text-slate-900">Reports</h1>
                <p className="text-sm text-slate-500 mt-0.5">Generate and export HR reports</p>
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all shrink-0 ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-200 hover:text-indigo-600'}`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Daily Count Report */}
            {activeTab === 'daily_count' && (
                <div className="space-y-5">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                            <div className="flex-1">
                                <FilterLabel>Site</FilterLabel>
                                <SiteSelect value={selectedSite} onChange={(e) => setSelectedSite(e.target.value)} />
                            </div>
                            <div className="flex-1">
                                <FilterLabel>Date</FilterLabel>
                                <DateInput value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                            </div>
                            <ExportButtons onPDF={exportPDF} onExcel={exportExcel} disabled={reportData.length === 0} />
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        {loading ? <LoadingState /> : reportData.length === 0 ? <EmptyState /> : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Task</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Count</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Target</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">In</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Out</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {reportData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 whitespace-nowrap">{row.STAFF_NAME}</td>
                                                <td className="px-5 py-3.5 text-sm text-slate-500 whitespace-nowrap">{row.TASK_DESCRIPTION}</td>
                                                <td className="px-5 py-3.5 text-sm text-right font-mono font-medium text-slate-900 whitespace-nowrap">{row.TASK_COUNT || '-'}</td>
                                                <td className="px-5 py-3.5 text-sm text-right font-mono text-slate-500 whitespace-nowrap">{row.TASK_TARGET || '-'}</td>
                                                <td className="px-5 py-3.5 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${row.OT_TYPE === 'time_based' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                                                        {(row.OT_TYPE || '').replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-sm text-right text-emerald-600 font-mono whitespace-nowrap">{row.IN_TIME || '-'}</td>
                                                <td className="px-5 py-3.5 text-sm text-right text-rose-500 font-mono whitespace-nowrap">{row.OUT_TIME || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Target Base Report */}
            {activeTab === 'salary' && (
                <div className="space-y-5">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                            <div>
                                <FilterLabel>Site</FilterLabel>
                                <SiteSelect value={targetSite} onChange={(e) => setTargetSite(e.target.value)} />
                            </div>
                            <div>
                                <FilterLabel>Date From</FilterLabel>
                                <DateInput value={targetDateFrom} onChange={(e) => setTargetDateFrom(e.target.value)} />
                            </div>
                            <div>
                                <FilterLabel>Date To</FilterLabel>
                                <DateInput value={targetDateTo} onChange={(e) => setTargetDateTo(e.target.value)} />
                            </div>
                            <ExportButtons onPDF={exportTargetPDF} onExcel={exportTargetExcel} disabled={targetReportData.length === 0} />
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        {targetLoading ? <LoadingState /> : targetReportData.length === 0 ? <EmptyState /> : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            {!targetSite && <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>}
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff Name</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Count</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {targetReportData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                                {!targetSite && <td className="px-5 py-3.5 text-sm text-slate-500 whitespace-nowrap">{row.SITE_NO} - {row.SITE_NAME}</td>}
                                                <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 whitespace-nowrap">{row.STAFF_NAME}</td>
                                                <td className="px-5 py-3.5 text-sm text-right font-bold text-slate-900 whitespace-nowrap">{row.TOTAL_COUNT || 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                                        <tr>
                                            {!targetSite && <td className="px-5 py-3.5" />}
                                            <td className="px-5 py-3.5 text-sm font-bold text-slate-800">Grand Total</td>
                                            <td className="px-5 py-3.5 text-sm font-bold text-right text-emerald-700">{targetReportData.reduce((s, r) => s + (Number(r.TOTAL_COUNT) || 0), 0)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* OT Analysis Report */}
            {activeTab === 'ot_analysis' && (
                <div className="space-y-5">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                            <div>
                                <FilterLabel>Site</FilterLabel>
                                <SiteSelect value={otSite} onChange={(e) => setOtSite(e.target.value)} />
                            </div>
                            <div>
                                <FilterLabel>Date From</FilterLabel>
                                <DateInput value={otDateFrom} onChange={(e) => setOtDateFrom(e.target.value)} />
                            </div>
                            <div>
                                <FilterLabel>Date To</FilterLabel>
                                <DateInput value={otDateTo} onChange={(e) => setOtDateTo(e.target.value)} />
                            </div>
                            <ExportButtons onPDF={exportOTPDF} onExcel={exportOTExcel} disabled={otReportData.length === 0} />
                        </div>
                    </div>

                    {/* Summary badges */}
                    {!otLoading && otReportData.length > 0 && (() => {
                        const otStaff = otReportData.filter(r => r.IS_OT);
                        const nonOtStaff = otReportData.filter(r => !r.IS_OT);
                        const totalPayment = otReportData.reduce((s, r) => s + (Number(r.PAYMENT) || 0), 0);
                        const totalHrs = otReportData.reduce((s, r) => s + (Number(r.TOTAL_EXTRA_HRS) || 0), 0);
                        return (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                                    <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
                                        <Clock className="w-4 h-4 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">OT Staff</p>
                                        <p className="text-xl font-bold text-emerald-700">{otStaff.length}</p>
                                    </div>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                                    <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                                        <Clock className="w-4 h-4 text-slate-500" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">No OT Staff</p>
                                        <p className="text-xl font-bold text-slate-600">{nonOtStaff.length}</p>
                                    </div>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                                    <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                                        <Clock className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">Total Extra Hrs</p>
                                        <p className="text-xl font-bold text-blue-700">{totalHrs.toFixed(1)}</p>
                                    </div>
                                </div>
                                <div className="bg-white rounded-xl border border-emerald-100 shadow-sm p-4 flex items-center gap-3">
                                    <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
                                        <Calculator className="w-4 h-4 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">Total OT Payment</p>
                                        <p className="text-xl font-bold text-emerald-700">{totalPayment.toFixed(2)}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        {otLoading ? <LoadingState /> : otReportData.length === 0 ? <EmptyState /> : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            {!otSite && <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>}
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff Name</th>
                                            <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">OT Status</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">OT %</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Extra Hrs</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate / Hr</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-emerald-600 uppercase tracking-wider">Payment</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {otReportData.map((row, idx) => (
                                            <tr key={idx} className={`transition-colors ${row.IS_OT ? 'hover:bg-emerald-50/40' : 'hover:bg-slate-50/60 bg-slate-50/30'}`}>
                                                {!otSite && (
                                                    <td className="px-5 py-3.5 text-sm text-slate-500 whitespace-nowrap">{row.SITE_NO} - {row.SITE_NAME}</td>
                                                )}
                                                <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 whitespace-nowrap">{row.STAFF_NAME}</td>
                                                <td className="px-5 py-3.5 text-center whitespace-nowrap">
                                                    {row.IS_OT ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                                                            OT
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
                                                            No OT
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3.5 text-sm text-right whitespace-nowrap">
                                                    {row.IS_OT ? (
                                                        <span className="font-semibold text-indigo-600">{row.OT_PERCENTAGE}%</span>
                                                    ) : (
                                                        <span className="text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3.5 text-sm text-right font-bold text-blue-600 whitespace-nowrap">
                                                    {(Number(row.TOTAL_EXTRA_HRS) || 0).toFixed(2)}
                                                </td>
                                                <td className="px-5 py-3.5 text-sm text-right whitespace-nowrap">
                                                    {row.IS_OT ? (
                                                        <span className="font-mono text-slate-700">{(Number(row.OT_RATE) || 0).toFixed(2)}</span>
                                                    ) : (
                                                        <span className="text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3.5 text-sm text-right whitespace-nowrap">
                                                    {row.IS_OT ? (
                                                        <span className="font-bold text-emerald-600">{(Number(row.PAYMENT) || 0).toFixed(2)}</span>
                                                    ) : (
                                                        <span className="text-slate-400">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                                        <tr>
                                            {!otSite && <td className="px-5 py-3.5" />}
                                            <td className="px-5 py-3.5 text-sm font-bold text-slate-800">Grand Total</td>
                                            <td className="px-5 py-3.5" />
                                            <td className="px-5 py-3.5" />
                                            <td className="px-5 py-3.5 text-sm font-bold text-right text-blue-700">
                                                {otReportData.reduce((s, r) => s + (Number(r.TOTAL_EXTRA_HRS) || 0), 0).toFixed(2)}
                                            </td>
                                            <td className="px-5 py-3.5" />
                                            <td className="px-5 py-3.5 text-sm font-bold text-right text-emerald-700">
                                                {otReportData.reduce((s, r) => s + (Number(r.PAYMENT) || 0), 0).toFixed(2)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Custom OT % Report */}
            {activeTab === 'custom_ot' && (
                <div className="space-y-5">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                            <div>
                                <FilterLabel>Site</FilterLabel>
                                <SiteSelect value={customOtSite} onChange={(e) => setCustomOtSite(e.target.value)} />
                            </div>
                            <div>
                                <FilterLabel>Date From</FilterLabel>
                                <DateInput value={customOtDateFrom} onChange={(e) => setCustomOtDateFrom(e.target.value)} />
                            </div>
                            <div>
                                <FilterLabel>Date To</FilterLabel>
                                <DateInput value={customOtDateTo} onChange={(e) => setCustomOtDateTo(e.target.value)} />
                            </div>
                            <div>
                                <FilterLabel>Custom OT %</FilterLabel>
                                <input type="number" min="0" max="200" step="0.1" value={customOtPercentage}
                                    onChange={(e) => setCustomOtPercentage(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                                    placeholder="e.g. 100" />
                            </div>
                            <button onClick={applyCustomPercentage}
                                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-all active:scale-95 shadow-sm">
                                <Calculator className="w-4 h-4" />
                                Calculate
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                            {customOtData.length > 0 && (
                                <>
                                    <ExportButtons onPDF={exportCustomOTPDF} onExcel={exportCustomOTExcel} disabled={false} />
                                    <button onClick={saveCustomOTToDb} disabled={savingOT}
                                        className="flex items-center gap-1.5 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                                        <Save className="w-4 h-4" />
                                        {savingOT ? 'Saving...' : 'Save to DB'}
                                    </button>
                                </>
                            )}
                            <button onClick={() => setShowOTHistory(!showOTHistory)}
                                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-95 border ${showOTHistory ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                                <Archive className="w-4 h-4" />
                                History
                            </button>
                            {saveOTMessage && (
                                <span className={`text-sm font-medium px-3 py-1.5 rounded-lg ${saveOTMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                    {saveOTMessage.text}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        {customOtLoading ? <LoadingState /> : customOtData.length === 0 ? (
                            <div className="py-16 text-center">
                                <Calculator className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-500 font-medium">Set filters and click Calculate to generate report</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">EPF No</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff</th>
                                            <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Extra Hrs</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">OT %</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Adj. Hrs</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-emerald-600 uppercase tracking-wider">Payment</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {customOtData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-3.5 text-sm text-slate-500 whitespace-nowrap font-mono">{row.site_no}</td>
                                                <td className="px-5 py-3.5 text-sm text-slate-500 whitespace-nowrap font-mono">{row.epf_number || '-'}</td>
                                                <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 whitespace-nowrap">{row.staff_name}</td>
                                                <td className="px-5 py-3.5 text-center whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${row.calculation_type === '90% Fixed' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {row.calculation_type || 'Custom %'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-sm text-right font-mono text-slate-900 whitespace-nowrap">{(Number(row.total_extra_hours) || 0).toFixed(2)}</td>
                                                <td className="px-5 py-3.5 text-sm text-right font-semibold text-blue-600 whitespace-nowrap">
                                                    {row.calculation_type === '90% Fixed' ? 'N/A' : `${customOtPercentage}%`}
                                                </td>
                                                <td className="px-5 py-3.5 text-sm text-right font-bold text-violet-600 whitespace-nowrap">{(Number(row.total_adjusted_extra_hours) || 0).toFixed(2)}</td>
                                                <td className="px-5 py-3.5 text-sm text-right font-bold text-emerald-600 whitespace-nowrap">{(Number(row.total_payment) || 0).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                                        <tr>
                                            <td colSpan={4} className="px-5 py-3.5 text-sm font-bold text-slate-800">Grand Total</td>
                                            <td className="px-5 py-3.5 text-sm font-bold text-right text-slate-900">{customOtData.reduce((s, r) => s + (Number(r.total_extra_hours) || 0), 0).toFixed(2)}</td>
                                            <td className="px-5 py-3.5" />
                                            <td className="px-5 py-3.5 text-sm font-bold text-right text-violet-700">{customOtData.reduce((s, r) => s + (Number(r.total_adjusted_extra_hours) || 0), 0).toFixed(2)}</td>
                                            <td className="px-5 py-3.5 text-sm font-bold text-right text-emerald-700">{customOtData.reduce((s, r) => s + (Number(r.total_payment) || 0), 0).toFixed(2)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* OT History Panel */}
                    {showOTHistory && (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex flex-wrap items-end gap-3">
                                <div>
                                    <FilterLabel>History From</FilterLabel>
                                    <DateInput value={histDateFrom} onChange={(e) => setHistDateFrom(e.target.value)} />
                                </div>
                                <div>
                                    <FilterLabel>History To</FilterLabel>
                                    <DateInput value={histDateTo} onChange={(e) => setHistDateTo(e.target.value)} />
                                </div>
                                <div>
                                    <FilterLabel>Site No</FilterLabel>
                                    <input type="text" value={histSiteNo} onChange={(e) => setHistSiteNo(e.target.value)}
                                        placeholder="e.g. S001"
                                        className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all" />
                                </div>
                            </div>
                            {otHistoryLoading ? <LoadingState /> : otHistory.length === 0 ? (
                                <div className="py-12 text-center">
                                    <Archive className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                    <p className="text-slate-500 font-medium">No saved OT history found</p>
                                </div>
                            ) : (
                                <div>
                                    {(() => {
                                        const batches = new Map<string, any[]>();
                                        (otHistory as any[]).forEach((r) => {
                                            if (!batches.has(r.BATCH_ID)) batches.set(r.BATCH_ID, []);
                                            batches.get(r.BATCH_ID)!.push(r);
                                        });
                                        return Array.from(batches.entries()).map(([batchId, rows]) => {
                                            const first = rows[0];
                                            const totalPayment = rows.reduce((s: number, r: any) => s + (Number(r.TOTAL_PAYMENT) || 0), 0);
                                            const totalHrs = rows.reduce((s: number, r: any) => s + (Number(r.TOTAL_EXTRA_HOURS) || 0), 0);
                                            return (
                                                <div key={batchId} className="border-b border-slate-100 last:border-0">
                                                    <div className="flex items-center gap-4 px-5 py-3 bg-indigo-50/70">
                                                        <div className="flex-1 min-w-0">
                                                            <span className="text-xs font-mono text-indigo-400">{batchId}</span>
                                                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                                                <span className="text-sm font-semibold text-slate-800">{first.SITE_NAME || first.SITE_NO || 'All Sites'}</span>
                                                                <span className="text-xs text-slate-500">{first.DATE_FROM} → {first.DATE_TO}</span>
                                                                <span className="text-xs text-slate-400">Saved: {first.SAVED_AT}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <div className="text-xs text-slate-500">{rows.length} records · {totalHrs.toFixed(2)} hrs</div>
                                                            <div className="text-sm font-bold text-emerald-700">{totalPayment.toFixed(2)}</div>
                                                        </div>
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                        <table className="min-w-full divide-y divide-slate-50">
                                                            <thead className="bg-slate-50/60">
                                                                <tr>
                                                                    <th className="px-5 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">EPF</th>
                                                                    <th className="px-5 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Staff</th>
                                                                    <th className="px-5 py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                                                                    <th className="px-5 py-2 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Extra Hrs</th>
                                                                    <th className="px-5 py-2 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Adj. Hrs</th>
                                                                    <th className="px-5 py-2 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Rate</th>
                                                                    <th className="px-5 py-2 text-right text-xs font-semibold text-emerald-500 uppercase tracking-wider">Payment</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-50">
                                                                {rows.map((r: any) => (
                                                                    <tr key={r.ID} className="hover:bg-slate-50/60 transition-colors">
                                                                        <td className="px-5 py-2.5 text-xs font-mono text-slate-400">{r.EPF_NUMBER || '-'}</td>
                                                                        <td className="px-5 py-2.5 text-sm font-medium text-slate-700">{r.STAFF_NAME}</td>
                                                                        <td className="px-5 py-2.5 text-center">
                                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${r.CALCULATION_TYPE === '90% Fixed' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                                                                                {r.CALCULATION_TYPE || 'Custom %'}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-5 py-2.5 text-xs text-right font-mono text-slate-600">{(Number(r.TOTAL_EXTRA_HOURS) || 0).toFixed(2)}</td>
                                                                        <td className="px-5 py-2.5 text-xs text-right font-mono text-violet-600">{(Number(r.TOTAL_ADJUSTED_HOURS) || 0).toFixed(2)}</td>
                                                                        <td className="px-5 py-2.5 text-xs text-right font-mono text-slate-500">{(Number(r.OT_RATE) || 0).toFixed(4)}</td>
                                                                        <td className="px-5 py-2.5 text-sm text-right font-bold text-emerald-600">{(Number(r.TOTAL_PAYMENT) || 0).toFixed(2)}</td>
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
                    )}
                </div>
            )}
        </div>
    );
};

export default Reports;
