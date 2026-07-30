import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { SitePortfolioEntry, MilestoneStage } from '../types';
import { AlertTriangle, Users, Settings, ArrowUp, ArrowDown, Trash2, X, Clock, TrendingDown } from 'lucide-react';

const RISK_DOT: Record<string, string> = { red: 'bg-red-500', amber: 'bg-amber-500' };

// Cycled by column position so the board reads left-to-right; a done stage always gets the green theme.
const COLUMN_THEMES = [
    { bg: 'bg-indigo-50/60', border: 'border-indigo-100', header: 'text-indigo-700', chip: 'bg-indigo-100 text-indigo-700' },
    { bg: 'bg-sky-50/60', border: 'border-sky-100', header: 'text-sky-700', chip: 'bg-sky-100 text-sky-700' },
    { bg: 'bg-violet-50/60', border: 'border-violet-100', header: 'text-violet-700', chip: 'bg-violet-100 text-violet-700' },
    { bg: 'bg-amber-50/60', border: 'border-amber-100', header: 'text-amber-700', chip: 'bg-amber-100 text-amber-700' },
    { bg: 'bg-rose-50/60', border: 'border-rose-100', header: 'text-rose-700', chip: 'bg-rose-100 text-rose-700' },
    { bg: 'bg-teal-50/60', border: 'border-teal-100', header: 'text-teal-700', chip: 'bg-teal-100 text-teal-700' },
];
const DONE_THEME = { bg: 'bg-emerald-50/60', border: 'border-emerald-100', header: 'text-emerald-700', chip: 'bg-emerald-100 text-emerald-700' };

const columnTheme = (stage: MilestoneStage, index: number) => stage.IS_DONE ? DONE_THEME : COLUMN_THEMES[index % COLUMN_THEMES.length];

function daysLeftBadge(plannedEndDate: string | null, isDoneStage: boolean): { label: string; className: string } | null {
    if (!plannedEndDate || isDoneStage) return null;
    const end = new Date(plannedEndDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((end.getTime() - today.getTime()) / 86400000);

    if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, className: 'bg-red-100 text-red-700' };
    if (diffDays === 0) return { label: 'Due today', className: 'bg-red-100 text-red-700' };
    if (diffDays <= 7) return { label: `${diffDays}d left`, className: 'bg-amber-100 text-amber-700' };
    return { label: `${diffDays}d left`, className: 'bg-emerald-100 text-emerald-700' };
}

function targetPctClassName(pct: number): string {
    if (pct < 50) return 'bg-red-100 text-red-700';
    if (pct < 100) return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
}

const ProjectPlanning: React.FC = () => {
    const [sites, setSites] = useState<SitePortfolioEntry[]>([]);
    const [stages, setStages] = useState<MilestoneStage[]>([]);
    const [loading, setLoading] = useState(true);

    // Drag-and-drop
    const [draggingSiteId, setDraggingSiteId] = useState<number | null>(null);

    // Project detail modal
    const [detailSite, setDetailSite] = useState<SitePortfolioEntry | null>(null);
    const [planHeadcount, setPlanHeadcount] = useState('');
    const [planStartDate, setPlanStartDate] = useState('');
    const [planEndDate, setPlanEndDate] = useState('');
    const [savingPlan, setSavingPlan] = useState(false);

    // Manage Stages modal
    const [stagesModalOpen, setStagesModalOpen] = useState(false);
    const [newStageName, setNewStageName] = useState('');

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [sitesRes, stagesRes] = await Promise.all([
                api.get('/project-planning/sites'),
                api.get('/milestone-stages'),
            ]);
            setSites(sitesRes.data);
            setStages(stagesRes.data);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const fetchSites = async () => {
        try {
            const r = await api.get('/project-planning/sites');
            setSites(r.data);
            if (detailSite) {
                const updated = r.data.find((s: SitePortfolioEntry) => s.ID === detailSite.ID);
                if (updated) setDetailSite(updated);
            }
        } catch (e) { console.error(e); }
    };

    const fetchStages = async () => {
        try { const r = await api.get('/milestone-stages'); setStages(r.data); }
        catch (e) { console.error(e); }
    };

    const openDetail = (site: SitePortfolioEntry) => {
        setDetailSite(site);
        setPlanHeadcount(site.PLANNED_HEADCOUNT != null ? String(site.PLANNED_HEADCOUNT) : '');
        setPlanStartDate(site.PLANNED_START_DATE ?? '');
        setPlanEndDate(site.PLANNED_END_DATE ?? '');
    };

    const saveSitePlan = async () => {
        if (!detailSite) return;
        setSavingPlan(true);
        try {
            await api.put(`/project-planning/sites/${detailSite.ID}`, {
                planned_start_date: planStartDate || null,
                planned_end_date: planEndDate || null,
                planned_headcount: planHeadcount !== '' ? Number(planHeadcount) : null,
            });
            await fetchSites();
            toast.success('Site plan updated');
        } catch (e) { console.error(e); toast.error('Failed to update site plan'); } finally { setSavingPlan(false); }
    };

    const moveSiteToStage = async (site: SitePortfolioEntry, stageId: number) => {
        if (site.STAGE_ID === stageId) return;
        const cardsInTarget = sites.filter(s => s.STAGE_ID === stageId);
        const nextSortOrder = cardsInTarget.length > 0 ? Math.max(...cardsInTarget.map(s => s.STAGE_SORT_ORDER)) + 1 : 0;

        // Optimistic update so the card moves instantly, rolled back on failure.
        const previous = sites;
        setSites(sites.map(s => s.ID === site.ID ? { ...s, STAGE_ID: stageId, STAGE_SORT_ORDER: nextSortOrder } : s));
        try {
            await api.put(`/project-planning/sites/${site.ID}/stage`, { stage_id: stageId, stage_sort_order: nextSortOrder });
            await fetchSites();
        } catch (e) {
            console.error(e);
            toast.error('Failed to move project');
            setSites(previous);
        }
    };

    const reorderSite = async (site: SitePortfolioEntry, direction: -1 | 1) => {
        const column = sites.filter(s => s.STAGE_ID === site.STAGE_ID).sort((a, b) => a.STAGE_SORT_ORDER - b.STAGE_SORT_ORDER);
        const idx = column.findIndex(s => s.ID === site.ID);
        const swapWith = column[idx + direction];
        if (!swapWith) return;
        try {
            await api.put(`/project-planning/sites/${site.ID}/stage`, { stage_sort_order: swapWith.STAGE_SORT_ORDER });
            await api.put(`/project-planning/sites/${swapWith.ID}/stage`, { stage_sort_order: site.STAGE_SORT_ORDER });
            await fetchSites();
        } catch (e) { console.error(e); toast.error('Failed to reorder projects'); }
    };

    // ── Manage Stages ──────────────────────────────────────────────────────
    const addStage = async () => {
        if (!newStageName.trim()) return;
        try {
            await api.post('/milestone-stages', { name: newStageName.trim() });
            setNewStageName('');
            await fetchStages();
        } catch (e) { console.error(e); toast.error('Failed to add stage'); }
    };

    const renameStage = async (stage: MilestoneStage, name: string) => {
        try {
            await api.put(`/milestone-stages/${stage.ID}`, { name });
            await fetchStages();
        } catch (e) { console.error(e); toast.error('Failed to rename stage'); }
    };

    const promoteDoneStage = async (stage: MilestoneStage) => {
        try {
            await api.put(`/milestone-stages/${stage.ID}`, { is_done: true });
            await Promise.all([fetchStages(), fetchSites()]);
        } catch (e) { console.error(e); toast.error('Failed to update done-stage'); }
    };

    const reorderStage = async (stage: MilestoneStage, direction: -1 | 1) => {
        const sorted = [...stages].sort((a, b) => a.SORT_ORDER - b.SORT_ORDER);
        const idx = sorted.findIndex(s => s.ID === stage.ID);
        const swapWith = sorted[idx + direction];
        if (!swapWith) return;
        try {
            await api.put(`/milestone-stages/${stage.ID}`, { sort_order: swapWith.SORT_ORDER });
            await api.put(`/milestone-stages/${swapWith.ID}`, { sort_order: stage.SORT_ORDER });
            await fetchStages();
        } catch (e) { console.error(e); toast.error('Failed to reorder stages'); }
    };

    const removeStage = async (stage: MilestoneStage) => {
        try {
            await api.delete(`/milestone-stages/${stage.ID}`);
            await fetchStages();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Failed to delete stage');
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-400">Loading...</div>;

    const sortedStages = [...stages].sort((a, b) => a.SORT_ORDER - b.SORT_ORDER);

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Project Planning</h2>
                <button onClick={() => setStagesModalOpen(true)} className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-700">
                    <Settings className="w-4 h-4" /> Manage Stages
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="flex gap-4 overflow-x-auto pb-2">
                    {sortedStages.map((stage, colIndex) => {
                        const cards = sites.filter(s => s.STAGE_ID === stage.ID).sort((a, b) => a.STAGE_SORT_ORDER - b.STAGE_SORT_ORDER);
                        const theme = columnTheme(stage, colIndex);
                        return (
                            <div key={stage.ID}
                                onDragOver={e => e.preventDefault()}
                                onDrop={() => {
                                    const s = sites.find(x => x.ID === draggingSiteId);
                                    if (s) moveSiteToStage(s, stage.ID);
                                    setDraggingSiteId(null);
                                }}
                                className={`flex-shrink-0 w-72 rounded-xl border p-3 ${theme.bg} ${theme.border}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`text-[12px] font-bold uppercase tracking-wide ${theme.header}`}>{stage.NAME}</span>
                                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${theme.chip}`}>{cards.length}</span>
                                </div>
                                <div className="space-y-2 min-h-[40px]">
                                    {cards.map((site, i) => {
                                        const dayBadge = daysLeftBadge(site.PLANNED_END_DATE, stage.IS_DONE);
                                        return (
                                        <div key={site.ID}
                                            draggable
                                            onDragStart={() => setDraggingSiteId(site.ID)}
                                            onClick={() => openDetail(site)}
                                            className={`bg-white rounded-lg border-l-4 border border-slate-200 p-3 cursor-pointer active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow ${site.RISK === 'red' ? 'border-l-red-500' : site.RISK === 'amber' ? 'border-l-amber-500' : 'border-l-slate-200'}`}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    {site.RISK && <span className={`w-2 h-2 rounded-full shrink-0 ${RISK_DOT[site.RISK]}`} />}
                                                    <span className="text-[13px] font-medium text-slate-800 truncate">{site.NAME}</span>
                                                </div>
                                                <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => reorderSite(site, -1)} disabled={i === 0} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30">
                                                        <ArrowUp className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => reorderSite(site, 1)} disabled={i === cards.length - 1} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30">
                                                        <ArrowDown className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-[11px] text-slate-400 mt-1">{site.SITE_NO}</p>
                                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                                {dayBadge && (
                                                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${dayBadge.className}`}>
                                                        <Clock className="w-3 h-3" /> {dayBadge.label}
                                                    </span>
                                                )}
                                                {site.MONTHLY_TARGET_PCT != null && (
                                                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${targetPctClassName(site.MONTHLY_TARGET_PCT)}`}>
                                                        <TrendingDown className="w-3 h-3" /> {site.MONTHLY_TARGET_PCT}% of month target
                                                    </span>
                                                )}
                                                {site.UNDERSTAFFED && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                                        <Users className="w-3 h-3" /> {site.ACTUAL_HEADCOUNT}/{site.PLANNED_HEADCOUNT}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                    {sortedStages.length === 0 && <p className="text-[13px] text-slate-400">No stages configured yet.</p>}
                </div>
            </div>

            {detailSite && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDetailSite(null)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-[16px] font-bold text-slate-900">{detailSite.NAME} <span className="text-slate-400 font-normal">({detailSite.SITE_NO})</span></h3>
                                <p className="text-[12px] text-slate-500 mt-0.5">Stage: {detailSite.STAGE_NAME ?? '—'}</p>
                            </div>
                            <button onClick={() => setDetailSite(null)}><X className="w-4 h-4 text-slate-400" /></button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            {detailSite.RISK && (
                                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-red-600">
                                    <AlertTriangle className="w-3.5 h-3.5" /> {detailSite.RISK === 'red' ? 'Planned end date overdue' : 'Planned end date due soon'}
                                </span>
                            )}
                            {(() => {
                                const dayBadge = daysLeftBadge(detailSite.PLANNED_END_DATE, stages.find(s => s.ID === detailSite.STAGE_ID)?.IS_DONE ?? false);
                                return dayBadge && (
                                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded ${dayBadge.className}`}>
                                        <Clock className="w-3 h-3" /> {dayBadge.label}
                                    </span>
                                );
                            })()}
                            {detailSite.MONTHLY_TARGET_PCT != null && (
                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded ${targetPctClassName(detailSite.MONTHLY_TARGET_PCT)}`}>
                                    <TrendingDown className="w-3 h-3" /> {detailSite.MONTHLY_TARGET_PCT}% of month target
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-[12px] mb-4">
                            <div>
                                <p className="text-slate-400">Headcount</p>
                                <p className="font-semibold text-slate-700">{detailSite.ACTUAL_HEADCOUNT} / {detailSite.PLANNED_HEADCOUNT ?? '—'}</p>
                            </div>
                            <div>
                                <p className="text-slate-400">Avg KPI</p>
                                <p className="font-semibold text-slate-700">{detailSite.AVERAGE_KPI != null ? detailSite.AVERAGE_KPI.toFixed(1) : '—'}</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-slate-100">
                            <div>
                                <label className="form-label">Planned headcount</label>
                                <input type="number" min={0} value={planHeadcount} onChange={e => setPlanHeadcount(e.target.value)}
                                    className="form-input w-32" placeholder="—" />
                            </div>
                            <div>
                                <label className="form-label">Planned start</label>
                                <input type="date" value={planStartDate} onChange={e => setPlanStartDate(e.target.value)}
                                    className="form-input w-40" />
                            </div>
                            <div>
                                <label className="form-label">Planned end</label>
                                <input type="date" value={planEndDate} onChange={e => setPlanEndDate(e.target.value)}
                                    className="form-input w-40" />
                            </div>
                            <button onClick={saveSitePlan} disabled={savingPlan} className="btn btn-primary">
                                {savingPlan ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {stagesModalOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setStagesModalOpen(false)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[15px] font-bold text-slate-900">Manage Stages</h3>
                            <button onClick={() => setStagesModalOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
                        </div>
                        <div className="space-y-2">
                            {sortedStages.map((stage, i) => (
                                <div key={stage.ID} className="flex items-center gap-2">
                                    <input defaultValue={stage.NAME} onBlur={e => e.target.value !== stage.NAME && renameStage(stage, e.target.value)}
                                        className="form-input flex-1 text-[13px]" />
                                    <button onClick={() => reorderStage(stage, -1)} disabled={i === 0} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">
                                        <ArrowUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => reorderStage(stage, 1)} disabled={i === sortedStages.length - 1} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">
                                        <ArrowDown className="w-3.5 h-3.5" />
                                    </button>
                                    <label className="flex items-center gap-1 text-[11px] text-slate-500">
                                        <input type="radio" name="done-stage" checked={stage.IS_DONE} onChange={() => promoteDoneStage(stage)} /> Done
                                    </label>
                                    <button onClick={() => removeStage(stage)} className="p-1 text-slate-400 hover:text-red-500">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                            <input value={newStageName} onChange={e => setNewStageName(e.target.value)} placeholder="New stage name" className="form-input flex-1 text-[13px]" />
                            <button onClick={addStage} disabled={!newStageName.trim()} className="btn btn-primary">
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectPlanning;
