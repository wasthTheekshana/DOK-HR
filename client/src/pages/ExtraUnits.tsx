import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { format, startOfMonth } from 'date-fns';
import {
    TrendingUp, ChevronDown, ChevronRight, Save, Pencil, Trash2,
    CheckCircle, AlertCircle, Loader2, Search,
} from 'lucide-react';
import { cn } from '../lib/utils';

/* ── Types ──────────────────────────────────────────────────────────────── */
interface StaffDetail {
    staff_id: number;
    staff_name: string;
    epf_number: string;
    sum_count: number;
    target_count: number;
    extra_units: number;
    extra_payment: number;
    saved_record_id: number | null;
}

interface SiteRow {
    site_id: number;
    site_no: string;
    site_name: string;
    daily_target: number;
    working_days: number;
    expected_units: number;
    total_units: number;
    extra_units: number;
    extra_payment: number;
    saved: boolean;
    saved_at: string | null;
    batch_id: string | null;
    staff: StaffDetail[];
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
const fmtRs = (n: number) =>
    `Rs. ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ── Component ──────────────────────────────────────────────────────────── */
const ExtraUnits: React.FC = () => {
    const today      = format(new Date(), 'yyyy-MM-dd');
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');

    const [dateFrom, setDateFrom] = useState(monthStart);
    const [dateTo,   setDateTo]   = useState(today);
    const [rows,     setRows]     = useState<SiteRow[]>([]);
    const [loading,  setLoading]  = useState(false);
    const [loaded,   setLoaded]   = useState(false);

    // Per-site UI state
    const [expanded,  setExpanded]  = useState<Set<string>>(new Set());
    const [editing,   setEditing]   = useState<Set<string>>(new Set());
    const [saving,    setSaving]    = useState<Set<string>>(new Set());
    // Edited payment amounts: siteNo → staffId → value
    const [editVals,  setEditVals]  = useState<Record<string, Record<number, number>>>({});

    /* ── Load ── */
    const handleLoad = async (preserveSite?: string) => {
        setLoading(true);
        setLoaded(false);
        try {
            const res = await api.get<SiteRow[]>('/payroll/extra-units', {
                params: { date_from: dateFrom, date_to: dateTo },
            });
            setRows(res.data);
            setExpanded(preserveSite ? new Set([preserveSite]) : new Set());
            setEditing(new Set());
            setEditVals({});
            setLoaded(true);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } };
            toast.error(e.response?.data?.message ?? 'Failed to load extra units');
        } finally {
            setLoading(false);
        }
    };

    /* ── Toggle expand ── */
    const toggleExpand = (sno: string) =>
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(sno) ? next.delete(sno) : next.add(sno);
            return next;
        });

    /* ── Save ── */
    const handleSave = async (row: SiteRow) => {
        setSaving(prev => new Set(prev).add(row.site_no));
        try {
            const records = row.staff
                .filter(s => s.extra_units > 0)
                .map(s => ({
                    SITE_NO:      row.site_no,
                    SITE_NAME:    row.site_name,
                    STAFF_ID:     s.staff_id,
                    EPF_NUMBER:   s.epf_number,
                    NAME:         s.staff_name,
                    SUM_COUNT:    s.sum_count,
                    target_count: s.target_count,
                    extra_units:  s.extra_units,
                    extra_payment: s.extra_payment,
                }));

            if (records.length === 0) {
                toast('No staff with extra units to save', { icon: '⚠️' });
                return;
            }

            await api.post('/payroll/save-target', {
                date_from: dateFrom,
                date_to:   dateTo,
                site_no:   row.site_no,
                records,
            });

            toast.success(`Saved ${records.length} records for ${row.site_name}`);
            await handleLoad(row.site_no);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } };
            toast.error(error.response?.data?.message ?? 'Save failed');
        } finally {
            setSaving(prev => { const next = new Set(prev); next.delete(row.site_no); return next; });
        }
    };

    /* ── Enter edit mode ── */
    const handleEdit = (row: SiteRow) => {
        const vals: Record<number, number> = {};
        row.staff.forEach(s => { vals[s.staff_id] = s.extra_payment; });
        setEditVals(prev => ({ ...prev, [row.site_no]: vals }));
        setEditing(prev => new Set(prev).add(row.site_no));
        setExpanded(prev => new Set(prev).add(row.site_no));
    };

    /* ── Update (save edits) ── */
    const handleUpdate = async (row: SiteRow) => {
        const vals = editVals[row.site_no] ?? {};
        const changed = row.staff.filter(
            s => s.saved_record_id !== null && vals[s.staff_id] !== s.extra_payment
        );

        if (changed.length === 0) {
            toast('No changes to save', { icon: 'ℹ️' });
            setEditing(prev => { const next = new Set(prev); next.delete(row.site_no); return next; });
            return;
        }

        setSaving(prev => new Set(prev).add(row.site_no));
        try {
            await Promise.all(
                changed.map(s =>
                    api.put(`/payroll/saved-record/${s.saved_record_id}`, {
                        extra_payment: vals[s.staff_id],
                    })
                )
            );
            toast.success(`Updated ${row.site_name}`);
            setEditing(prev => { const next = new Set(prev); next.delete(row.site_no); return next; });
            await handleLoad(row.site_no);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } };
            toast.error(error.response?.data?.message ?? 'Update failed');
        } finally {
            setSaving(prev => { const next = new Set(prev); next.delete(row.site_no); return next; });
        }
    };

    /* ── Delete ── */
    const handleDelete = async (row: SiteRow) => {
        if (!window.confirm(
            `Delete saved payroll for ${row.site_name}?\n${dateFrom} → ${dateTo}\n\nThis cannot be undone.`
        )) return;

        setSaving(prev => new Set(prev).add(row.site_no));
        try {
            await api.delete('/payroll/saved-batch', {
                params: { site_no: row.site_no, date_from: dateFrom, date_to: dateTo },
            });
            toast.success(`Deleted saved records for ${row.site_name}`);
            await handleLoad();
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } };
            toast.error(error.response?.data?.message ?? 'Delete failed');
        } finally {
            setSaving(prev => { const next = new Set(prev); next.delete(row.site_no); return next; });
        }
    };

    /* ── Derived summary ── */
    const totalExtraUnits   = rows.reduce((s, r) => s + r.extra_units, 0);
    const totalExtraPayment = rows.reduce((s, r) => s + r.extra_payment, 0);
    const savedCount        = rows.filter(r => r.saved).length;

    /* ── Render ── */
    return (
        <div className="space-y-5">
            {/* Page header */}
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-4.5 h-4.5 text-emerald-600" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                    <h1 className="text-[15px] font-bold text-slate-900">Extra Units Review</h1>
                    <p className="text-[12px] text-slate-400">Target-based sites — bulk save extra unit payroll</p>
                </div>
            </div>

            {/* Controls */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="form-label">Date From</label>
                        <input type="date" value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            className="form-input" />
                    </div>
                    <div>
                        <label className="form-label">Date To</label>
                        <input type="date" value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            className="form-input" />
                    </div>
                    <button onClick={() => handleLoad()} disabled={loading}
                        className="btn btn-primary flex items-center gap-2">
                        {loading
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Search className="w-4 h-4" />
                        }
                        Load
                    </button>
                </div>
            </div>

            {/* Summary strip */}
            {loaded && (
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label: 'Sites',         value: rows.length,                         sub: `${savedCount} saved` },
                        { label: 'Total Extra',   value: totalExtraUnits.toLocaleString(),     sub: 'units' },
                        { label: 'Total Payment', value: fmtRs(totalExtraPayment),             sub: 'extra payroll' },
                    ].map(k => (
                        <div key={k.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{k.label}</p>
                            <p className="text-[20px] font-black text-slate-900 mt-1">{k.value}</p>
                            <p className="text-[11px] text-slate-400">{k.sub}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Site rows */}
            {loaded && rows.length === 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-[13px]">
                    No target-based sites found for this period.
                </div>
            )}

            {loaded && rows.map(row => {
                const isExpanded = expanded.has(row.site_no);
                const isEditing  = editing.has(row.site_no);
                const isSaving   = saving.has(row.site_no);
                const vals       = editVals[row.site_no] ?? {};

                return (
                    <div key={row.site_no}
                        className={cn('bg-white rounded-2xl border shadow-sm overflow-hidden',
                            row.saved ? 'border-emerald-200' : 'border-slate-200'
                        )}>
                        {/* Site header row */}
                        <div className="flex items-center gap-3 px-5 py-4">
                            {/* Expand toggle */}
                            <button onClick={() => toggleExpand(row.site_no)}
                                className="p-1 text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                                {isExpanded
                                    ? <ChevronDown className="w-4 h-4" />
                                    : <ChevronRight className="w-4 h-4" />
                                }
                            </button>

                            {/* Site info */}
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(row.site_no)}>
                                <p className="text-[14px] font-bold text-slate-900 truncate">{row.site_name}</p>
                                <p className="text-[11px] text-slate-400">{row.site_no} · {row.working_days} working days · target {row.daily_target}/day</p>
                            </div>

                            {/* Metrics */}
                            <div className="hidden sm:flex items-center gap-6 text-right shrink-0">
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Total</p>
                                    <p className="text-[14px] font-bold text-slate-700">{row.total_units.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Expected</p>
                                    <p className="text-[14px] font-bold text-slate-700">{row.expected_units.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Extra</p>
                                    <p className={cn('text-[14px] font-bold',
                                        row.extra_units > 0 ? 'text-emerald-600' : 'text-slate-400'
                                    )}>{row.extra_units.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Payment</p>
                                    <p className="text-[14px] font-bold text-slate-700">{fmtRs(row.extra_payment)}</p>
                                </div>
                            </div>

                            {/* Status badge */}
                            <div className="shrink-0">
                                {row.saved ? (
                                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                                        <CheckCircle className="w-3 h-3" /> Saved
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                                        <AlertCircle className="w-3 h-3" /> Unsaved
                                    </span>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 shrink-0">
                                {!row.saved && (
                                    <button onClick={() => handleSave(row)}
                                        disabled={isSaving || row.extra_units === 0}
                                        className="btn btn-primary btn-sm flex items-center gap-1.5 text-[12px]">
                                        {isSaving
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <Save className="w-3.5 h-3.5" />
                                        }
                                        Save
                                    </button>
                                )}
                                {row.saved && !isEditing && (
                                    <>
                                        <button onClick={() => handleEdit(row)}
                                            disabled={isSaving}
                                            className="btn btn-ghost btn-sm flex items-center gap-1.5 text-[12px]">
                                            <Pencil className="w-3.5 h-3.5" /> Edit
                                        </button>
                                        <button onClick={() => handleDelete(row)}
                                            disabled={isSaving}
                                            className="btn btn-ghost btn-sm text-red-500 hover:bg-red-50 flex items-center gap-1.5 text-[12px]">
                                            {isSaving
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <Trash2 className="w-3.5 h-3.5" />
                                            }
                                            Delete
                                        </button>
                                    </>
                                )}
                                {row.saved && isEditing && (
                                    <>
                                        <button onClick={() => handleUpdate(row)}
                                            disabled={isSaving}
                                            className="btn btn-primary btn-sm flex items-center gap-1.5 text-[12px]">
                                            {isSaving
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <Save className="w-3.5 h-3.5" />
                                            }
                                            Update
                                        </button>
                                        <button onClick={() => setEditing(prev => { const n = new Set(prev); n.delete(row.site_no); return n; })}
                                            className="btn btn-ghost btn-sm text-[12px]">
                                            Cancel
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Saved-at note */}
                        {row.saved && row.saved_at && (
                            <div className="px-5 pb-2 -mt-1">
                                <p className="text-[11px] text-slate-400">Saved on {row.saved_at}</p>
                            </div>
                        )}

                        {/* Staff breakdown table */}
                        {isExpanded && (
                            <div className="border-t border-slate-100 overflow-x-auto">
                                <table className="w-full text-[12px]">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="text-left px-5 py-2.5 font-semibold text-slate-500">Staff</th>
                                            <th className="text-left px-3 py-2.5 font-semibold text-slate-500">EPF</th>
                                            <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Units Done</th>
                                            <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Target</th>
                                            <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Extra</th>
                                            <th className="text-right px-5 py-2.5 font-semibold text-slate-500">Payment (Rs.)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {row.staff.map(s => (
                                            <tr key={s.staff_id} className={cn(s.extra_units > 0 ? 'bg-emerald-50/30' : '')}>
                                                <td className="px-5 py-2.5 font-medium text-slate-800">{s.staff_name}</td>
                                                <td className="px-3 py-2.5 text-slate-500">{s.epf_number}</td>
                                                <td className="px-3 py-2.5 text-right font-bold text-slate-800">{s.sum_count.toLocaleString()}</td>
                                                <td className="px-3 py-2.5 text-right text-slate-500">{s.target_count.toLocaleString()}</td>
                                                <td className={cn('px-3 py-2.5 text-right font-bold',
                                                    s.extra_units > 0 ? 'text-emerald-600' : 'text-slate-400'
                                                )}>{s.extra_units.toLocaleString()}</td>
                                                <td className="px-5 py-2.5 text-right">
                                                    {isEditing && s.saved_record_id !== null ? (
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            step={0.01}
                                                            value={vals[s.staff_id] ?? s.extra_payment}
                                                            onChange={e => setEditVals(prev => ({
                                                                ...prev,
                                                                [row.site_no]: {
                                                                    ...(prev[row.site_no] ?? {}),
                                                                    [s.staff_id]: Number(e.target.value),
                                                                },
                                                            }))}
                                                            className="w-24 text-right px-2 py-1 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-indigo-700"
                                                        />
                                                    ) : (
                                                        <span className="font-bold text-slate-700">
                                                            {Number(s.extra_payment).toFixed(2)}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50 border-t border-slate-200">
                                        <tr>
                                            <td colSpan={4} className="px-5 py-2.5 font-bold text-slate-700">Total</td>
                                            <td className="px-3 py-2.5 text-right font-black text-emerald-600">
                                                {row.extra_units.toLocaleString()}
                                            </td>
                                            <td className="px-5 py-2.5 text-right font-black text-slate-800">
                                                {fmtRs(row.extra_payment)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default ExtraUnits;
