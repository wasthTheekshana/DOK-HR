import React, { useEffect, useState } from 'react';
import api from '../services/api';
import type { Site, InvoiceRecord, InvoicePreview, InvoiceCostFactor } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
    FileText, Plus, Trash2, X, Calculator, ChevronRight,
    Building2, Calendar, DollarSign, Users, Package, TrendingUp, Save,
    Pencil, FileDown, FileSpreadsheet, Loader2,
} from 'lucide-react';

const fmt  = (n: number) => `Rs. ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; accent: string; children: React.ReactNode }> = ({ title, icon, accent, children }) => (
    <div className={`border-l-4 ${accent} bg-white rounded-2xl shadow-sm overflow-hidden`}>
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
            {icon}
            <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
        </div>
        <div className="p-5">{children}</div>
    </div>
);

interface EditFields { cost_variant_amount: string; salary_ot_amount: string; expense_cost: string; invoice_price: string; }

const Invoices: React.FC = () => {
    const [invoices, setInvoices]     = useState<InvoiceRecord[]>([]);
    const [sites, setSites]           = useState<Site[]>([]);
    const [loading, setLoading]       = useState(true);

    // ── Generate modal ──
    const [isModalOpen, setIsModalOpen]     = useState(false);
    const [selectedSiteId, setSelectedSiteId] = useState('');
    const [dateFrom, setDateFrom]           = useState('');
    const [dateTo, setDateTo]               = useState('');
    const [calculating, setCalculating]     = useState(false);
    const [preview, setPreview]             = useState<InvoicePreview | null>(null);
    const [editedVariants,  setEditedVariants]  = useState<{ key: string; value: string }[]>([]);
    const [additionalCosts, setAdditionalCosts] = useState<{ key: string; value: string }[]>([]);
    const [saving, setSaving]               = useState(false);

    // ── Edit modal ──
    const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null);
    const [editFields, setEditFields]         = useState<EditFields>({ cost_variant_amount: '', salary_ot_amount: '', expense_cost: '', invoice_price: '' });
    const [editSaving, setEditSaving]         = useState(false);

    // ── Report loading ──
    const [reportLoading, setReportLoading] = useState<{ id: number; type: 'pdf' | 'excel' } | null>(null);

    useEffect(() => { fetchInvoices(); fetchSites(); }, []);

    const fetchInvoices = async () => {
        try { const r = await api.get('/invoices'); setInvoices(r.data); }
        catch (e) { console.error(e); }
        finally { setLoading(false); }
    };
    const fetchSites = async () => {
        try { const r = await api.get('/sites'); setSites(r.data); }
        catch (e) { console.error(e); }
    };

    // ── Generate modal handlers ──
    const openModal = () => {
        setSelectedSiteId(''); setDateFrom(''); setDateTo('');
        setPreview(null);
        setEditedVariants([]); setAdditionalCosts([]);
        setIsModalOpen(true);
    };

    const handleCalculate = async () => {
        if (!selectedSiteId || !dateFrom || !dateTo) { alert('Please select a site and date range.'); return; }
        if (dateFrom > dateTo) { alert('Date From must be before Date To.'); return; }
        setCalculating(true); setPreview(null);
        try {
            const r = await api.post('/invoices/preview', { site_id: Number(selectedSiteId), date_from: dateFrom, date_to: dateTo });
            const data = r.data;
            setPreview(data);
            setEditedVariants(
                data.cost_factors.map((f: InvoiceCostFactor) => ({
                    key:   f.key,
                    value: f.numeric ? String(f.amount) : f.value,
                }))
            );
            setAdditionalCosts([]);
        } catch (err: any) { alert(err.response?.data?.message || 'Calculation failed'); }
        finally { setCalculating(false); }
    };

    const handleSave = async () => {
        if (!preview) return;
        for (const row of additionalCosts) {
            if (!row.key.trim()) { alert('Each additional cost must have a name.'); return; }
            const n = parseFloat(row.value);
            if (isNaN(n) || n < 0) { alert('Each additional cost must have a valid amount (≥ 0).'); return; }
        }
        setSaving(true);
        try {
            const allVariants = [
                ...editedVariants,
                ...additionalCosts.map(r => ({ key: r.key.trim(), value: r.value })),
            ];
            await api.post('/invoices', {
                site_id:          preview.site.ID,
                site_no:          preview.site.SITE_NO,
                site_name:        preview.site.NAME,
                date_from:        preview.date_from,
                date_to:          preview.date_to,
                cost_variants:    allVariants,
                salary_ot_amount: preview.salary_ot_amount,
                invoice_price:    preview.total_invoice_price,
            });
            setIsModalOpen(false); fetchInvoices();
        } catch (err: any) { alert(err.response?.data?.message || 'Failed to save invoice'); }
        finally { setSaving(false); }
    };

    // ── Edit handlers ──
    const openEdit = (inv: InvoiceRecord) => {
        setEditingInvoice(inv);
        setEditFields({
            cost_variant_amount: String(inv.COST_VARIANT_AMOUNT || 0),
            salary_ot_amount:    String(inv.SALARY_OT_AMOUNT    || 0),
            expense_cost:        String(inv.EXPENSE_COST        || 0),
            invoice_price:       String(inv.INVOICE_PRICE       || 0),
        });
    };

    const handleEditSave = async () => {
        if (!editingInvoice) return;
        setEditSaving(true);
        try {
            await api.put(`/invoices/${editingInvoice.ID}`, {
                cost_variant_amount: Number(editFields.cost_variant_amount) || 0,
                salary_ot_amount:    Number(editFields.salary_ot_amount)    || 0,
                expense_cost:        Number(editFields.expense_cost)        || 0,
                invoice_price:       Number(editFields.invoice_price)       || 0,
            });
            setEditingInvoice(null); fetchInvoices();
        } catch (err: any) { alert(err.response?.data?.message || 'Failed to update'); }
        finally { setEditSaving(false); }
    };

    // ── Delete handler ──
    const handleDelete = async (id: number) => {
        if (!confirm('Delete this invoice record? This cannot be undone.')) return;
        try { await api.delete(`/invoices/${id}`); fetchInvoices(); }
        catch (err: any) { alert(err.response?.data?.message || 'Failed'); }
    };

    // ── Report handlers ──
    const handleReport = async (inv: InvoiceRecord, type: 'pdf' | 'excel') => {
        setReportLoading({ id: inv.ID, type });
        try {
            const r = await api.post('/invoices/preview', { site_id: inv.SITE_ID, date_from: inv.DATE_FROM, date_to: inv.DATE_TO });
            const data: InvoicePreview = r.data;
            if (type === 'pdf') generatePDF(inv, data);
            else generateExcel(inv, data);
        } catch { alert('Failed to generate report. Please try again.'); }
        finally { setReportLoading(null); }
    };

    const generatePDF = (inv: InvoiceRecord, data: InvoicePreview) => {
        const doc = new jsPDF();
        const pw = doc.internal.pageSize.getWidth();

        // Header banner
        doc.setFillColor(67, 56, 202);
        doc.rect(0, 0, pw, 44, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(255, 255, 255);
        doc.text('DOK Systems — Invoice Report', 14, 16);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.text(`Site: ${inv.SITE_NO} — ${inv.SITE_NAME}`, 14, 27);
        doc.text(`Period: ${inv.DATE_FROM}  to  ${inv.DATE_TO}`, 14, 34);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, pw - 14, 34, { align: 'right' });
        doc.setTextColor(0, 0, 0);

        let y = 52;
        const getY = () => ((doc as any).lastAutoTable?.finalY ?? y) + 8;

        const sectionTitle = (title: string, r: number, g: number, b: number) => {
            if (y > 240) { doc.addPage(); y = 16; }
            doc.setFillColor(r, g, b);
            doc.rect(14, y, pw - 28, 8, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
            doc.text(title, 17, y + 5.5);
            doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
            y += 10;
        };

        // 1. Cost Variant Factors
        sectionTitle('1. Cost Variant Factors', 180, 100, 20);
        autoTable(doc, {
            startY: y,
            head: [['Factor', 'Value', 'Amount (Rs.)']],
            body: data.cost_factors.length > 0
                ? data.cost_factors.map(f => [f.key, f.value, f.numeric ? fmtN(f.amount) : '—'])
                : [['No cost factors defined', '', '']],
            foot: [['', 'Total Cost Variants', fmtN(data.cost_variant_total)]],
            theme: 'striped',
            headStyles: { fillColor: [217, 119, 6] },
            footStyles: { fillColor: [254, 243, 199], textColor: [120, 53, 15], fontStyle: 'bold' },
            columnStyles: { 2: { halign: 'right' } },
            margin: { left: 14, right: 14 },
        });
        y = getY();

        // 2. Staff Salaries
        sectionTitle('2. Staff Salaries (Basic + Fix)', 109, 40, 217);
        autoTable(doc, {
            startY: y,
            head: [['Staff', 'Basic (Rs.)', 'Fix (Rs.)', 'Total (Rs.)']],
            body: data.staff_salaries.length > 0
                ? data.staff_salaries.map(s => [s.NAME, fmtN(s.BASIC_SALARY), fmtN(s.FIX_SALARY), fmtN(s.TOTAL_SALARY)])
                : [['No active staff assigned', '', '', '']],
            foot: [['', '', 'Total Salaries', fmtN(data.total_salary)]],
            theme: 'striped',
            headStyles: { fillColor: [109, 40, 217] },
            footStyles: { fillColor: [237, 233, 254], textColor: [76, 29, 149], fontStyle: 'bold' },
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
            margin: { left: 14, right: 14 },
        });
        y = getY();

        // 3. OT Payments
        sectionTitle('3. OT Payments in Period', 14, 116, 144);
        autoTable(doc, {
            startY: y,
            body: [
                ['Time-Based OT',      fmtN(data.ot_time_based)],
                ['Target-Based OT',    fmtN(data.ot_target_based)],
                ['Total OT',           fmtN(data.total_ot)],
                ['Salary + OT Combined', fmtN(data.salary_ot_amount)],
            ],
            theme: 'plain',
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 100 }, 1: { halign: 'right' } },
            margin: { left: 14, right: 14 },
        });
        y = getY();

        // 4. Task Calculation
        sectionTitle('4. Invoice Price — Task Calculation', 4, 120, 87);
        autoTable(doc, {
            startY: y,
            head: [['Task Type', 'Count', 'Unit Price (Rs.)', 'Line Total (Rs.)']],
            body: data.task_lines.length > 0
                ? data.task_lines.map(t => [t.TASK_NAME, Number(t.TOTAL_COUNT).toLocaleString(), fmtN(t.UNIT_PRICE), fmtN(t.LINE_TOTAL)])
                : [['No task types defined', '', '', '']],
            foot: [['', '', 'Total Invoice Price', fmtN(data.total_invoice_price)]],
            theme: 'striped',
            headStyles: { fillColor: [4, 120, 87] },
            footStyles: { fillColor: [209, 250, 229], textColor: [6, 78, 59], fontStyle: 'bold' },
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
            margin: { left: 14, right: 14 },
        });
        y = getY();

        // 5. Summary (saved amounts)
        sectionTitle('5. Summary (Saved Amounts)', 51, 65, 85);
        autoTable(doc, {
            startY: y,
            body: [
                ['Cost Variant Amount',   fmtN(inv.COST_VARIANT_AMOUNT)],
                ['Salary + OT Amount',    fmtN(inv.SALARY_OT_AMOUNT)],
                ['Expense Cost',          fmtN(inv.EXPENSE_COST)],
                ['Invoice Price (Tasks)', fmtN(inv.INVOICE_PRICE)],
            ],
            theme: 'grid',
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 110 }, 1: { halign: 'right' } },
            margin: { left: 14, right: 14 },
        });

        doc.save(`Invoice_${inv.SITE_NO}_${inv.DATE_FROM}_${inv.DATE_TO}.pdf`);
    };

    const generateExcel = (inv: InvoiceRecord, data: InvoicePreview) => {
        const rows: any[][] = [
            ['DOK Systems — Invoice Report'],
            [],
            ['Site:',     `${inv.SITE_NO} — ${inv.SITE_NAME}`],
            ['Period:',   `${inv.DATE_FROM} to ${inv.DATE_TO}`],
            ['Generated:', new Date().toLocaleDateString()],
            [],
            ['1. COST VARIANT FACTORS'],
            ['Factor', 'Value', 'Amount (Rs.)'],
            ...data.cost_factors.map(f => [f.key, f.value, f.numeric ? f.amount : '—']),
            ['', 'Total Cost Variants', data.cost_variant_total],
            [],
            ['2. STAFF SALARIES'],
            ['Staff', 'Basic (Rs.)', 'Fix (Rs.)', 'Total (Rs.)'],
            ...data.staff_salaries.map(s => [s.NAME, s.BASIC_SALARY, s.FIX_SALARY, s.TOTAL_SALARY]),
            ['', '', 'Total Salaries', data.total_salary],
            [],
            ['3. OT PAYMENTS'],
            ['Time-Based OT',        data.ot_time_based],
            ['Target-Based OT',      data.ot_target_based],
            ['Total OT',             data.total_ot],
            ['Salary + OT Combined', data.salary_ot_amount],
            [],
            ['4. INVOICE PRICE — TASK CALCULATION'],
            ['Task Type', 'Count', 'Unit Price (Rs.)', 'Line Total (Rs.)'],
            ...data.task_lines.map(t => [t.TASK_NAME, t.TOTAL_COUNT, t.UNIT_PRICE, t.LINE_TOTAL]),
            ['', '', 'Total Invoice Price', data.total_invoice_price],
            [],
            ['5. SUMMARY (SAVED AMOUNTS)'],
            ['Cost Variant Amount',   inv.COST_VARIANT_AMOUNT],
            ['Salary + OT Amount',    inv.SALARY_OT_AMOUNT],
            ['Expense Cost',          inv.EXPENSE_COST],
            ['Invoice Price (Tasks)', inv.INVOICE_PRICE],
        ];

        const ws = XLSX.utils.aoa_to_sheet(rows);
        // Set column widths
        ws['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Invoice Report');
        XLSX.writeFile(wb, `Invoice_${inv.SITE_NO}_${inv.DATE_FROM}_${inv.DATE_TO}.xlsx`);
    };

    const totalInvoiceValue = invoices.reduce((s, inv) => s + Number(inv.INVOICE_PRICE || 0), 0);

    if (loading) return (
        <div className="space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />)}
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">Invoices</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Site-wise monthly cost &amp; invoice records</p>
                </div>
                <button onClick={openModal}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all shadow-sm text-sm">
                    <Plus className="w-4 h-4" /> Generate Invoice
                </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Records',      value: String(invoices.length),                                                                          color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Total Invoice Value', value: fmt(totalInvoiceValue),                                                                          color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Total Salary + OT',  value: fmt(invoices.reduce((s, i) => s + Number(i.SALARY_OT_AMOUNT    || 0), 0)), color: 'text-violet-600', bg: 'bg-violet-50' },
                    { label: 'Total Cost Variants', value: fmt(invoices.reduce((s, i) => s + Number(i.COST_VARIANT_AMOUNT || 0), 0)), color: 'text-amber-600',  bg: 'bg-amber-50' },
                ].map(c => (
                    <div key={c.label} className={`${c.bg} rounded-2xl p-4`}>
                        <p className="text-xs font-semibold text-slate-500 mb-1">{c.label}</p>
                        <p className={`text-lg font-black ${c.color} truncate`}>{c.value}</p>
                    </div>
                ))}
            </div>

            {/* Invoices Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date Range</th>
                                <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Cost Variant</th>
                                <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Salary + OT</th>
                                <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Expense</th>
                                <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Invoice Price</th>
                                <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {invoices.map(inv => {
                                const isLoadingPDF   = reportLoading?.id === inv.ID && reportLoading?.type === 'pdf';
                                const isLoadingXLSX  = reportLoading?.id === inv.ID && reportLoading?.type === 'excel';
                                const anyLoading     = reportLoading?.id === inv.ID;
                                return (
                                    <tr key={inv.ID} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <div>
                                                <p className="text-sm font-bold text-slate-900">{inv.SITE_NO}</p>
                                                <p className="text-xs text-slate-400">{inv.SITE_NAME}</p>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-1.5 text-sm text-slate-600">
                                                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                <span>{inv.DATE_FROM}</span>
                                                <ChevronRight className="w-3 h-3 text-slate-300" />
                                                <span>{inv.DATE_TO}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-right hidden md:table-cell">
                                            <span className="text-sm text-amber-700 font-medium">{fmt(inv.COST_VARIANT_AMOUNT)}</span>
                                        </td>
                                        <td className="px-5 py-3.5 text-right hidden md:table-cell">
                                            <span className="text-sm text-violet-700 font-medium">{fmt(inv.SALARY_OT_AMOUNT)}</span>
                                        </td>
                                        <td className="px-5 py-3.5 text-right hidden lg:table-cell">
                                            <span className="text-sm text-slate-600">{fmt(inv.EXPENSE_COST)}</span>
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            <span className="text-sm font-bold text-emerald-700">{fmt(inv.INVOICE_PRICE)}</span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {/* Edit */}
                                                <button onClick={() => openEdit(inv)} title="Edit amounts"
                                                    className="p-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors">
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                {/* PDF */}
                                                <button onClick={() => !anyLoading && handleReport(inv, 'pdf')} title="Download PDF report"
                                                    disabled={anyLoading}
                                                    className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg transition-colors disabled:opacity-50">
                                                    {isLoadingPDF
                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        : <FileDown className="w-3.5 h-3.5" />}
                                                </button>
                                                {/* Excel */}
                                                <button onClick={() => !anyLoading && handleReport(inv, 'excel')} title="Download Excel report"
                                                    disabled={anyLoading}
                                                    className="p-1.5 bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 rounded-lg transition-colors disabled:opacity-50">
                                                    {isLoadingXLSX
                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        : <FileSpreadsheet className="w-3.5 h-3.5" />}
                                                </button>
                                                {/* Delete */}
                                                <button onClick={() => handleDelete(inv.ID)} title="Delete"
                                                    className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-500 rounded-lg transition-colors">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {invoices.length === 0 && (
                    <div className="py-14 text-center">
                        <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-slate-400 text-sm font-medium">No invoices yet. Generate your first invoice.</p>
                    </div>
                )}
            </div>

            {/* ── Edit Modal ── */}
            {editingInvoice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditingInvoice(null)} />
                    <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-base font-black text-slate-900">Edit Invoice</h2>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {editingInvoice.SITE_NO} — {editingInvoice.SITE_NAME} &nbsp;|&nbsp;
                                    {editingInvoice.DATE_FROM} → {editingInvoice.DATE_TO}
                                </p>
                            </div>
                            <button onClick={() => setEditingInvoice(null)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                                <X className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {([
                                { key: 'cost_variant_amount', label: 'Cost Variant Amount', color: 'text-amber-700' },
                                { key: 'salary_ot_amount',    label: 'Salary + OT Amount',  color: 'text-violet-700' },
                                { key: 'expense_cost',        label: 'Expense Cost',         color: 'text-slate-700' },
                                { key: 'invoice_price',       label: 'Invoice Price (Tasks)', color: 'text-emerald-700' },
                            ] as { key: keyof EditFields; label: string; color: string }[]).map(f => (
                                <div key={f.key}>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">{f.label} (Rs.)</label>
                                    <input
                                        type="number" min="0" step="0.01"
                                        value={editFields[f.key]}
                                        onChange={e => setEditFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                                        onKeyDown={e => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()}
                                        className={`form-input w-full px-3.5 py-2.5 font-semibold ${f.color}`}
                                    />
                                </div>
                            ))}

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setEditingInvoice(null)}
                                    className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm">
                                    Cancel
                                </button>
                                <button onClick={handleEditSave} disabled={editSaving}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold rounded-xl transition-colors text-sm">
                                    {editSaving
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                                        : <><Save className="w-4 h-4" /> Save Changes</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Generate Invoice Modal ── */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
                    <div className="relative bg-slate-100 w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[96vh] flex flex-col"
                        onClick={e => e.stopPropagation()}>

                        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
                            <div>
                                <h2 className="text-lg font-black text-slate-900">Generate Invoice</h2>
                                <p className="text-xs text-slate-400 mt-0.5">Select site and date range to calculate costs</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 p-5 space-y-4">
                            {/* Filters */}
                            <div className="bg-white rounded-2xl p-4 shadow-sm">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Site *</label>
                                        <select value={selectedSiteId} onChange={e => { setSelectedSiteId(e.target.value); setPreview(null); }}
                                            className="form-input w-full px-3.5 py-2.5">
                                            <option value="">Select site…</option>
                                            {sites.map(s => <option key={s.ID} value={s.ID}>{s.SITE_NO} — {s.NAME}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date From *</label>
                                        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreview(null); }}
                                            className="form-input w-full px-3.5 py-2.5" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date To *</label>
                                        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreview(null); }}
                                            className="form-input w-full px-3.5 py-2.5" />
                                    </div>
                                </div>
                                <button onClick={handleCalculate} disabled={calculating || !selectedSiteId || !dateFrom || !dateTo}
                                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm">
                                    {calculating
                                        ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Calculating…</>
                                        : <><Calculator className="w-4 h-4" /> Calculate</>}
                                </button>
                            </div>

                            {preview && (
                                <>
                                    <div className="bg-indigo-600 text-white rounded-2xl px-5 py-3.5 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Building2 className="w-5 h-5 opacity-80" />
                                            <div>
                                                <p className="font-bold text-sm">{preview.site.SITE_NO} — {preview.site.NAME}</p>
                                                <p className="text-indigo-200 text-xs">{preview.date_from} → {preview.date_to}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-indigo-200">Total Invoice</p>
                                            <p className="font-black text-lg">{fmt(preview.total_invoice_price)}</p>
                                        </div>
                                    </div>

                                    <SectionCard title="Cost Variant Factors" accent="border-amber-400"
                                        icon={<Package className="w-4 h-4 text-amber-500" />}>
                                        {preview.cost_factors.length === 0
                                            ? <p className="text-slate-400 text-sm">No cost factors defined for this site.</p>
                                            : (
                                                <table className="w-full text-sm">
                                                    <thead><tr className="border-b border-slate-100">
                                                        <th className="pb-2 text-left text-xs font-semibold text-slate-500">Factor</th>
                                                        <th className="pb-2 text-left text-xs font-semibold text-slate-500">Value</th>
                                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Amount</th>
                                                    </tr></thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                        {preview.cost_factors.map((f, i) => (
                                                            <tr key={i}>
                                                                <td className="py-2 text-slate-700 font-medium">{f.key}</td>
                                                                <td className="py-2 text-slate-500">{f.value}</td>
                                                                <td className="py-2 text-right font-semibold text-amber-700">{f.numeric ? fmt(f.amount) : '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                    <tfoot><tr className="border-t-2 border-amber-200">
                                                        <td colSpan={2} className="pt-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Total Cost Variants</td>
                                                        <td className="pt-2.5 text-right font-black text-amber-700">{fmt(preview.cost_variant_total)}</td>
                                                    </tr></tfoot>
                                                </table>
                                            )}
                                    </SectionCard>

                                    <SectionCard title="Staff Salaries (Basic + Fix)" accent="border-violet-400"
                                        icon={<Users className="w-4 h-4 text-violet-500" />}>
                                        {preview.staff_salaries.length === 0
                                            ? <p className="text-slate-400 text-sm">No active staff assigned to this site.</p>
                                            : (
                                                <table className="w-full text-sm">
                                                    <thead><tr className="border-b border-slate-100">
                                                        <th className="pb-2 text-left text-xs font-semibold text-slate-500">Staff</th>
                                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Basic</th>
                                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Fix</th>
                                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Total</th>
                                                    </tr></thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                        {preview.staff_salaries.map((s, i) => (
                                                            <tr key={i}>
                                                                <td className="py-2 text-slate-700 font-medium">{s.NAME}</td>
                                                                <td className="py-2 text-right text-slate-500">{fmt(s.BASIC_SALARY)}</td>
                                                                <td className="py-2 text-right text-slate-500">{fmt(s.FIX_SALARY)}</td>
                                                                <td className="py-2 text-right font-semibold text-violet-700">{fmt(s.TOTAL_SALARY)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                    <tfoot><tr className="border-t-2 border-violet-200">
                                                        <td colSpan={3} className="pt-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Total Salaries</td>
                                                        <td className="pt-2.5 text-right font-black text-violet-700">{fmt(preview.total_salary)}</td>
                                                    </tr></tfoot>
                                                </table>
                                            )}
                                    </SectionCard>

                                    <SectionCard title="OT Payments in Period" accent="border-cyan-400"
                                        icon={<TrendingUp className="w-4 h-4 text-cyan-500" />}>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                                <span className="text-sm text-slate-600">Time-Based OT</span>
                                                <span className="text-sm font-semibold text-cyan-700">{fmt(preview.ot_time_based)}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                                <span className="text-sm text-slate-600">Target-Based OT</span>
                                                <span className="text-sm font-semibold text-cyan-700">{fmt(preview.ot_target_based)}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-1">
                                                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Total OT</span>
                                                <span className="font-black text-cyan-700">{fmt(preview.total_ot)}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t-2 border-violet-200">
                                                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Salary + OT Combined</span>
                                                <span className="font-black text-violet-700">{fmt(preview.salary_ot_amount)}</span>
                                            </div>
                                        </div>
                                    </SectionCard>

                                    <SectionCard title="Invoice Price — Task Calculation" accent="border-emerald-400"
                                        icon={<DollarSign className="w-4 h-4 text-emerald-500" />}>
                                        {preview.task_lines.length === 0
                                            ? <p className="text-slate-400 text-sm">No task types defined. Add Task Types &amp; Prices in Site settings first.</p>
                                            : (
                                                <table className="w-full text-sm">
                                                    <thead><tr className="border-b border-slate-100">
                                                        <th className="pb-2 text-left text-xs font-semibold text-slate-500">Task Type</th>
                                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Count</th>
                                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Unit Price</th>
                                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Line Total</th>
                                                    </tr></thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                        {preview.task_lines.map((t, i) => (
                                                            <tr key={i} className={Number(t.TOTAL_COUNT) === 0 ? 'opacity-40' : ''}>
                                                                <td className="py-2 text-slate-700 font-medium">{t.TASK_NAME}</td>
                                                                <td className="py-2 text-right text-slate-500">{Number(t.TOTAL_COUNT).toLocaleString()}</td>
                                                                <td className="py-2 text-right text-slate-500">{fmt(t.UNIT_PRICE)}</td>
                                                                <td className="py-2 text-right font-semibold text-emerald-700">{fmt(t.LINE_TOTAL)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                    <tfoot><tr className="border-t-2 border-emerald-200">
                                                        <td colSpan={3} className="pt-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Total Invoice Price</td>
                                                        <td className="pt-2.5 text-right font-black text-emerald-700">{fmt(preview.total_invoice_price)}</td>
                                                    </tr></tfoot>
                                                </table>
                                            )}
                                    </SectionCard>

                                    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                                        <div>
                                            {/* TODO Task 6: replace with editable cost variants UI */}
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                                            {[
                                                { label: 'Cost Variants', val: preview.cost_variant_total, color: 'text-amber-700' },
                                                { label: 'Salary + OT',   val: preview.salary_ot_amount,  color: 'text-violet-700' },
                                                { label: 'Expense',       val: 0, color: 'text-slate-700' },
                                                { label: 'Invoice Price', val: preview.total_invoice_price, color: 'text-emerald-700' },
                                            ].map(c => (
                                                <div key={c.label} className="bg-slate-50 rounded-xl p-3 text-center">
                                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">{c.label}</p>
                                                    <p className={`text-sm font-black ${c.color}`}>{fmt(c.val)}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <button onClick={handleSave} disabled={saving}
                                            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl transition-colors text-sm">
                                            {saving
                                                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                                                : <><Save className="w-4 h-4" /> Save Invoice Record</>}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Invoices;
