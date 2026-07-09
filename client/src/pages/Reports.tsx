import React, { useState, useEffect } from 'react';
import api from '../services/api';
import type { Site } from '../types';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { FileText, Download, Printer, Filter, Calculator, Clock, ClipboardList, Target, Save, Archive, BarChart2, Coins } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import RevenueReportTab from '../components/RevenueReportTab';

const Reports: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'daily_count' | 'salary' | 'ot_analysis' | 'custom_ot' | 'weekly_report' | 'revenue_report'>('daily_count');
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

    // Weekly Report
    type WeeklyMode = 'this_week' | 'last_week' | 'custom';
    const getWeekRange = (offset: number) => {
        const base = subWeeks(new Date(), offset);
        return {
            from: format(startOfWeek(base, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
            to:   format(endOfWeek(base,   { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        };
    };
    const [weeklyMode, setWeeklyMode] = useState<WeeklyMode>('this_week');
    const [weeklyCustomFrom, setWeeklyCustomFrom] = useState(format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'));
    const [weeklyCustomTo,   setWeeklyCustomTo]   = useState(format(new Date(), 'yyyy-MM-dd'));
    const [weeklyData, setWeeklyData] = useState<any>(null);
    const [weeklyLoading, setWeeklyLoading] = useState(false);

    const weeklyDateRange = weeklyMode === 'this_week' ? getWeekRange(0)
                          : weeklyMode === 'last_week' ? getWeekRange(1)
                          : { from: weeklyCustomFrom, to: weeklyCustomTo };

    const fetchWeeklyReport = async (from: string, to: string) => {
        setWeeklyLoading(true);
        try {
            const res = await api.get('/tasks/weekly-operation-report', { params: { date_from: from, date_to: to } });
            setWeeklyData(res.data);
        } catch { setWeeklyData(null); }
        finally { setWeeklyLoading(false); }
    };

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

    useEffect(() => {
        if (activeTab === 'weekly_report') {
            fetchWeeklyReport(weeklyDateRange.from, weeklyDateRange.to);
        }
    }, [activeTab, weeklyMode, weeklyCustomFrom, weeklyCustomTo]);

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

    const chk = (selected: boolean) => selected ? '☑' : '☐';

    const exportWeeklyPDF = () => {
        if (!weeklyData) return;
        const { sites, date_from, date_to } = weeklyData;
        const doc = new jsPDF({ orientation: 'landscape' });
        const title = `DOK Operation System – Weekly Performance Analysis`;
        const period = `Period: ${date_from} to ${date_to}`;
        doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.text(title, 14, 16);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        doc.text(period, 14, 23);

        const head = [['#', 'Site No', 'Site Name', 'Update Frequency', 'Regular Since', 'Days Missed', 'Update Accuracy', 'Common Errors', 'Tech Issues', 'Remarks']];
        const freqLabel: Record<string, string> = { Daily: 'Daily ✓', Irregular: 'Irregular ✓', 'With Errors': 'With Errors ✓', 'Not Updating': 'Not Updating ✓' };
        const accLabel:  Record<string, string> = { Accurate: 'Accurate ✓', 'Wrong Date': 'Wrong Date ✓', 'Wrong Attendance': 'Wrong Attendance ✓', Other: 'Other ✓' };

        const body = (sites as any[]).map((s: any) => [
            s.index, s.site_no, s.site_name,
            freqLabel[s.update_frequency] || s.update_frequency,
            s.regular_since || '—',
            s.days_missed,
            accLabel[s.update_accuracy] || s.update_accuracy,
            s.common_errors || '—',
            s.technical_issues ? 'Yes' : 'No',
            s.remarks || '—',
        ]);

        autoTable(doc, {
            head,
            body,
            startY: 28,
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 8 }, 1: { cellWidth: 18 }, 2: { cellWidth: 42 },
                3: { cellWidth: 28 }, 4: { cellWidth: 22 }, 5: { cellWidth: 16 },
                6: { cellWidth: 28 }, 7: { cellWidth: 40 }, 8: { cellWidth: 16 }, 9: { cellWidth: 28 },
            },
            didParseCell: (data: any) => {
                if (data.section === 'body') {
                    const row = sites[data.row.index] as any;
                    if (!row) return;
                    if (row.update_frequency === 'Not Updating') {
                        data.cell.styles.textColor = [220, 38, 38];
                    } else if (row.update_frequency === 'Daily') {
                        if (data.column.index === 3) data.cell.styles.textColor = [5, 150, 105];
                    }
                }
            },
        });

        doc.save(`DOK_Weekly_Report_${date_from}_to_${date_to}.pdf`);
    };

    const exportWeeklyCSV = () => {
        if (!weeklyData) return;
        const { sites, date_from, date_to } = weeklyData;
        const headers = ['#', 'Site No', 'Site Name', 'Update Frequency', 'Regular Since (Date)',
                         'Days Missed', 'Update Accuracy', 'Common Errors', 'Technical Issues', 'Remarks'];
        const rows = (sites as any[]).map((s: any) => [
            s.index, s.site_no, `"${s.site_name}"`, s.update_frequency,
            s.regular_since || '', s.days_missed, s.update_accuracy,
            `"${s.common_errors || ''}"`, s.technical_issues ? 'Yes' : 'No', `"${s.remarks || ''}"`,
        ]);
        const csv = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `DOK_Weekly_Report_${date_from}_to_${date_to}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    const exportWeeklyExcel = () => {
        if (!weeklyData) return;
        const { sites, date_from, date_to } = weeklyData;
        const title = `DOK Operation System Data Update Progress & Performance Analysis Chart – ${date_from} to ${date_to}`;
        const globalHeader = ['#', 'Site Name', 'Update Frequency', 'Regular Since (Date)', 'Days Missed', 'Update Accuracy', 'Common Errors (if any)', 'Technical Issues', 'Remarks / Action Required'];

        const aoa: any[][] = [
            [title, '', '', '', '', '', '', '', ''],
            [],
            globalHeader,
        ];

        (sites as any[]).forEach((s: any) => {
            aoa.push([
                s.index, s.site_name, 'Update Frequency', 'Regular Since (Date)',
                'Days Missed', 'Update Accuracy', 'Common Errors (if any)', 'Technical Issues', 'Remarks / Action Required',
            ]);
            aoa.push(['', '', chk(s.update_frequency === 'Daily')      + ' Daily',        s.regular_since || '', s.days_missed, chk(s.update_accuracy === 'Accurate')           + ' Accurate',           s.common_errors || '', chk(s.technical_issues)       + ' Yes', s.remarks || '']);
            aoa.push(['', '', chk(s.update_frequency === 'Irregular')   + ' Irregular',    '', '', chk(s.update_accuracy === 'Wrong Date')          + ' Wrong Date',         '', chk(!s.technical_issues)     + ' No', '']);
            aoa.push(['', '', chk(s.update_frequency === 'With Errors') + ' With Errors',  '', '', chk(s.update_accuracy === 'Wrong Attendance')     + ' Wrong Attendance',   '', '', '']);
            aoa.push(['', '', chk(s.update_frequency === 'Not Updating')+ ' Not Updating', '', '', chk(s.update_accuracy === 'Other')               + ' Other',              '', '', '']);
        });

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [4, 28, 18, 16, 10, 18, 30, 12, 30].map(w => ({ wch: w }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Weekly Report');
        XLSX.writeFile(wb, `DOK_Weekly_Report_${date_from}_to_${date_to}.xlsx`);
    };

    const tabs = [
        { id: 'daily_count'   as const, label: 'Daily Count',    icon: ClipboardList },
        { id: 'salary'        as const, label: 'Target Base',     icon: Target },
        { id: 'ot_analysis'   as const, label: 'OT Analysis',     icon: Clock },
        { id: 'custom_ot'     as const, label: 'Custom OT %',     icon: Calculator },
        { id: 'weekly_report' as const, label: 'Weekly Report',   icon: BarChart2 },
        { id: 'revenue_report' as const, label: 'Revenue Report', icon: Coins },
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
                    <div className="card p-5">
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
                    <div className="card overflow-hidden">
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
                    <div className="card p-5">
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
                    <div className="card overflow-hidden">
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
                    <div className="card p-5">
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

                    <div className="card overflow-hidden">
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
                                            <tr key={idx} className={`transition-colors ${row.IS_OT ? 'hover:bg-emerald-50/40' : row.IS_OUTSOURCE ? 'hover:bg-violet-50/40 bg-violet-50/20' : 'hover:bg-slate-50/60 bg-slate-50/30'}`}>
                                                {!otSite && (
                                                    <td className="px-5 py-3.5 text-sm text-slate-500 whitespace-nowrap">{row.SITE_NO} - {row.SITE_NAME}</td>
                                                )}
                                                <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 whitespace-nowrap">{row.STAFF_NAME}</td>
                                                <td className="px-5 py-3.5 text-center whitespace-nowrap">
                                                    {row.IS_OUTSOURCE ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700">
                                                            Outsource
                                                        </span>
                                                    ) : row.IS_OT ? (
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
                    <div className="card p-5">
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
                    <div className="card overflow-hidden">
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
                        <div className="card overflow-hidden">
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
            {/* Weekly Operation Report */}
            {activeTab === 'weekly_report' && (
                <div className="space-y-5">
                    {/* Filters */}
                    <div className="card p-5">
                        <div className="flex flex-wrap items-end gap-4">
                            {/* Mode toggles */}
                            <div>
                                <FilterLabel>Period</FilterLabel>
                                <div className="flex gap-1.5">
                                    {([
                                        { id: 'this_week', label: 'This Week' },
                                        { id: 'last_week', label: 'Last Week' },
                                        { id: 'custom',    label: 'Custom' },
                                    ] as { id: WeeklyMode; label: string }[]).map(m => (
                                        <button key={m.id} onClick={() => setWeeklyMode(m.id)}
                                            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${weeklyMode === m.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {weeklyMode === 'custom' && (
                                <>
                                    <div>
                                        <FilterLabel>From</FilterLabel>
                                        <DateInput value={weeklyCustomFrom} onChange={(e) => setWeeklyCustomFrom(e.target.value)} />
                                    </div>
                                    <div>
                                        <FilterLabel>To</FilterLabel>
                                        <DateInput value={weeklyCustomTo} onChange={(e) => setWeeklyCustomTo(e.target.value)} />
                                    </div>
                                </>
                            )}

                            {weeklyMode !== 'custom' && (
                                <div className="flex items-end pb-0.5">
                                    <span className="text-sm font-semibold text-indigo-700 bg-indigo-50 px-3 py-2 rounded-xl">
                                        {weeklyDateRange.from} → {weeklyDateRange.to}
                                    </span>
                                </div>
                            )}

                            {/* Export buttons */}
                            {weeklyData && (weeklyData.sites || []).length > 0 && (
                                <div className="flex gap-2 ml-auto">
                                    <button onClick={exportWeeklyPDF}
                                        className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl transition-all active:scale-95">
                                        <Printer className="w-4 h-4" /><span className="hidden sm:inline">PDF</span>
                                    </button>
                                    <button onClick={exportWeeklyCSV}
                                        className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-all active:scale-95">
                                        <Download className="w-4 h-4" /><span className="hidden sm:inline">CSV</span>
                                    </button>
                                    <button onClick={exportWeeklyExcel}
                                        className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-all active:scale-95">
                                        <FileText className="w-4 h-4" /><span className="hidden sm:inline">Excel</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Summary badges */}
                    {!weeklyLoading && weeklyData && (weeklyData.sites || []).length > 0 && (() => {
                        const s = weeklyData.sites as any[];
                        const daily      = s.filter((x: any) => x.update_frequency === 'Daily').length;
                        const irregular  = s.filter((x: any) => x.update_frequency === 'Irregular').length;
                        const withErrors = s.filter((x: any) => x.update_frequency === 'With Errors').length;
                        const notUpdating= s.filter((x: any) => x.update_frequency === 'Not Updating').length;
                        return (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { label: 'Daily',       count: daily,       bg: 'bg-emerald-50', tc: 'text-emerald-700', bc: 'border-emerald-200' },
                                    { label: 'Irregular',   count: irregular,   bg: 'bg-amber-50',   tc: 'text-amber-700',   bc: 'border-amber-200' },
                                    { label: 'With Errors', count: withErrors,  bg: 'bg-orange-50',  tc: 'text-orange-700',  bc: 'border-orange-200' },
                                    { label: 'Not Updating',count: notUpdating, bg: 'bg-red-50',     tc: 'text-red-700',     bc: 'border-red-200' },
                                ].map((c, i) => (
                                    <div key={i} className={`${c.bg} border ${c.bc} rounded-xl p-4 flex items-center gap-3`}>
                                        <div>
                                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{c.label}</p>
                                            <p className={`text-2xl font-black ${c.tc}`}>{c.count}</p>
                                            <p className="text-[10px] text-slate-400">{Math.round(c.count / s.length * 100)}% of sites</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}

                    {/* Table */}
                    <div className="card overflow-hidden">
                        {weeklyLoading ? <LoadingState /> :
                         !weeklyData || (weeklyData.sites || []).length === 0 ? <EmptyState /> : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-100 text-xs">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">#</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">Site</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">Update Frequency</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">Regular Since</th>
                                            <th className="px-4 py-3 text-right font-semibold text-slate-500 uppercase tracking-wider">Days Missed</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">Update Accuracy</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">Common Errors</th>
                                            <th className="px-4 py-3 text-center font-semibold text-slate-500 uppercase tracking-wider">Tech Issues</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {(weeklyData.sites as any[]).map((row: any) => {
                                            const freqColor =
                                                row.update_frequency === 'Daily'        ? 'bg-emerald-100 text-emerald-700' :
                                                row.update_frequency === 'Irregular'    ? 'bg-amber-100 text-amber-700' :
                                                row.update_frequency === 'With Errors'  ? 'bg-orange-100 text-orange-700' :
                                                                                           'bg-red-100 text-red-700';
                                            const accColor =
                                                row.update_accuracy === 'Accurate'         ? 'bg-emerald-100 text-emerald-700' :
                                                row.update_accuracy === 'Wrong Date'       ? 'bg-amber-100 text-amber-700' :
                                                row.update_accuracy === 'Wrong Attendance' ? 'bg-orange-100 text-orange-700' :
                                                                                              'bg-slate-100 text-slate-600';
                                            const rowBg = row.update_frequency === 'Not Updating' ? 'bg-red-50/40' : '';
                                            return (
                                                <tr key={row.index} className={`hover:bg-slate-50/60 transition-colors ${rowBg}`}>
                                                    <td className="px-4 py-3 font-bold text-slate-400">{row.index}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <p className="font-bold text-slate-900">{row.site_no}</p>
                                                        <p className="text-slate-400 text-[10px]">{row.site_name}</p>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${freqColor}`}>
                                                            {row.update_frequency}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-600">{row.regular_since || '—'}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`font-bold ${row.days_missed > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{row.days_missed}</span>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${accColor}`}>
                                                            {row.update_accuracy}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate">{row.common_errors || '—'}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${row.technical_issues ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                                                            {row.technical_issues ? 'Yes' : 'No'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500">{row.remarks || '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {activeTab === 'revenue_report' && <RevenueReportTab sites={sites} />}
        </div>
    );
};

export default Reports;
