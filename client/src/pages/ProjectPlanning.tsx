import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { SitePortfolioEntry, SitePlan, ProjectMilestone, MilestoneStage } from '../types';
import { AlertTriangle, Users, ChevronRight, Plus, Trash2, Settings, ArrowUp, ArrowDown, X } from 'lucide-react';

const RISK_DOT: Record<string, string> = { red: 'bg-red-500', amber: 'bg-amber-500' };

const ProjectPlanning: React.FC = () => {
    const [portfolio, setPortfolio] = useState<SitePortfolioEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState<SitePlan | null>(null);
    const [stages, setStages] = useState<MilestoneStage[]>([]);

    // New-milestone form
    const [msName, setMsName] = useState('');
    const [msDueDate, setMsDueDate] = useState('');
    const [saving, setSaving] = useState(false);

    // Site plan (headcount / dates) edit form
    const [planHeadcount, setPlanHeadcount] = useState('');
    const [planStartDate, setPlanStartDate] = useState('');
    const [planEndDate, setPlanEndDate] = useState('');
    const [savingPlan, setSavingPlan] = useState(false);

    // Drag-and-drop
    const [draggingId, setDraggingId] = useState<number | null>(null);

    // Manage Stages modal
    const [stagesModalOpen, setStagesModalOpen] = useState(false);
    const [newStageName, setNewStageName] = useState('');

    useEffect(() => { fetchPortfolio(); fetchStages(); }, []);

    const fetchPortfolio = async () => {
        try { const r = await api.get('/project-planning/sites'); setPortfolio(r.data); }
        catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const fetchStages = async () => {
        try { const r = await api.get('/milestone-stages'); setStages(r.data); }
        catch (e) { console.error(e); }
    };

    const openSite = async (siteId: number) => {
        try {
            const r = await api.get(`/project-planning/sites/${siteId}`);
            setDetail(r.data);
            setPlanHeadcount(r.data.PLANNED_HEADCOUNT != null ? String(r.data.PLANNED_HEADCOUNT) : '');
            setPlanStartDate(r.data.PLANNED_START_DATE ?? '');
            setPlanEndDate(r.data.PLANNED_END_DATE ?? '');
        } catch (e) { console.error(e); }
    };

    const addMilestone = async () => {
        if (!detail || !msName.trim()) return;
        setSaving(true);
        try {
            await api.post(`/project-planning/sites/${detail.ID}/milestones`, {
                name: msName.trim(),
                due_date: msDueDate || null,
                sort_order: detail.MILESTONES.length,
            });
            setMsName(''); setMsDueDate('');
            await openSite(detail.ID);
            await fetchPortfolio();
        } catch (e) { console.error(e); toast.error('Failed to add milestone'); } finally { setSaving(false); }
    };

    const moveMilestoneToStage = async (milestone: ProjectMilestone, stageId: number) => {
        if (!detail || milestone.STAGE_ID === stageId) return;
        // Optimistic update so the card moves instantly, rolled back on failure.
        const previous = detail;
        setDetail({
            ...detail,
            MILESTONES: detail.MILESTONES.map(m => m.ID === milestone.ID ? { ...m, STAGE_ID: stageId } : m),
        });
        try {
            await api.put(`/project-planning/milestones/${milestone.ID}`, { stage_id: stageId });
            await fetchPortfolio();
        } catch (e) {
            console.error(e);
            toast.error('Failed to move milestone');
            setDetail(previous);
        }
    };

    const deleteMilestone = async (milestoneId: number) => {
        if (!detail) return;
        try {
            await api.delete(`/project-planning/milestones/${milestoneId}`);
            await openSite(detail.ID);
            await fetchPortfolio();
        } catch (e) { console.error(e); toast.error('Failed to delete milestone'); }
    };

    const saveSitePlan = async () => {
        if (!detail) return;
        setSavingPlan(true);
        try {
            await api.put(`/project-planning/sites/${detail.ID}`, {
                planned_start_date: planStartDate || null,
                planned_end_date: planEndDate || null,
                planned_headcount: planHeadcount !== '' ? Number(planHeadcount) : null,
            });
            await openSite(detail.ID);
            await fetchPortfolio();
            toast.success('Site plan updated');
        } catch (e) { console.error(e); toast.error('Failed to update site plan'); } finally { setSavingPlan(false); }
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
            await fetchStages();
            await fetchPortfolio();
            if (detail) await openSite(detail.ID);
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

    if (detail) {
        return (
            <div className="space-y-5">
                <div className="flex items-center justify-between">
                    <button onClick={() => setDetail(null)} className="text-[13px] text-slate-500 hover:text-slate-700">&larr; Back to portfolio</button>
                    <button onClick={() => setStagesModalOpen(true)} className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-700">
                        <Settings className="w-4 h-4" /> Manage Stages
                    </button>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                    <h2 className="text-lg font-bold text-slate-900">{detail.NAME} <span className="text-slate-400 font-normal">({detail.SITE_NO})</span></h2>
                    <div className="flex flex-wrap items-end gap-3 mt-3">
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

                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[14px] font-semibold text-slate-900">Milestones</h3>
                        <div className="flex items-center gap-2">
                            <input value={msName} onChange={e => setMsName(e.target.value)} placeholder="Milestone name" className="form-input w-48" />
                            <input type="date" value={msDueDate} onChange={e => setMsDueDate(e.target.value)} className="form-input w-40" />
                            <button onClick={addMilestone} disabled={saving || !msName.trim()} className="btn btn-primary">
                                <Plus className="w-4 h-4" /> Add
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-4 overflow-x-auto pb-2">
                        {sortedStages.map(stage => {
                            const cards = detail.MILESTONES.filter(m => m.STAGE_ID === stage.ID);
                            return (
                                <div key={stage.ID}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={() => {
                                        const m = detail.MILESTONES.find(x => x.ID === draggingId);
                                        if (m) moveMilestoneToStage(m, stage.ID);
                                        setDraggingId(null);
                                    }}
                                    className="flex-shrink-0 w-64 bg-slate-50 rounded-xl border border-slate-100 p-3">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[12px] font-bold text-slate-600 uppercase tracking-wide">{stage.NAME}</span>
                                        <span className="text-[11px] text-slate-400">{cards.length}</span>
                                    </div>
                                    <div className="space-y-2 min-h-[40px]">
                                        {cards.map(m => (
                                            <div key={m.ID}
                                                draggable
                                                onDragStart={() => setDraggingId(m.ID)}
                                                className="bg-white rounded-lg border border-slate-200 p-3 cursor-grab active:cursor-grabbing shadow-sm">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-center gap-1.5">
                                                        {m.RISK && <span className={`w-2 h-2 rounded-full ${RISK_DOT[m.RISK]}`} />}
                                                        <span className="text-[13px] font-medium text-slate-800">{m.NAME}</span>
                                                    </div>
                                                    <button onClick={() => deleteMilestone(m.ID)} className="p-0.5 text-slate-300 hover:text-red-500 shrink-0">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                <p className="text-[11px] text-slate-400 mt-1">{m.DUE_DATE ?? 'no due date'}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                        {sortedStages.length === 0 && <p className="text-[13px] text-slate-400">No stages configured yet.</p>}
                    </div>
                </div>

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
                                    <Plus className="w-4 h-4" /> Add
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {portfolio.map(site => (
                <button key={site.ID} onClick={() => openSite(site.ID)}
                    className="text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="text-[14px] font-bold text-slate-900">{site.NAME}</h3>
                            <p className="text-[11px] text-slate-400">{site.SITE_NO}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>

                    {site.RISK && (
                        <div className="flex items-center gap-1.5 mt-2 text-[11px] font-medium text-red-600">
                            <AlertTriangle className="w-3.5 h-3.5" /> {site.RISK === 'red' ? 'Milestone overdue' : 'Milestone due soon'}
                        </div>
                    )}
                    {site.UNDERSTAFFED && (
                        <div className="flex items-center gap-1.5 mt-2 text-[11px] font-medium text-amber-600">
                            <Users className="w-3.5 h-3.5" /> Understaffed: {site.ACTUAL_HEADCOUNT} / {site.PLANNED_HEADCOUNT}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 mt-4 text-[12px]">
                        <div>
                            <p className="text-slate-400">Stage</p>
                            <p className="font-semibold text-slate-700">{site.CURRENT_STAGE ?? '—'}</p>
                        </div>
                        <div>
                            <p className="text-slate-400">Progress</p>
                            <p className="font-semibold text-slate-700">{site.MILESTONE_PROGRESS_PCT}%</p>
                        </div>
                        <div>
                            <p className="text-slate-400">Headcount</p>
                            <p className="font-semibold text-slate-700">{site.ACTUAL_HEADCOUNT} / {site.PLANNED_HEADCOUNT ?? '—'}</p>
                        </div>
                        <div>
                            <p className="text-slate-400">Avg KPI</p>
                            <p className="font-semibold text-slate-700">{site.AVERAGE_KPI != null ? site.AVERAGE_KPI.toFixed(1) : '—'}</p>
                        </div>
                    </div>
                </button>
            ))}
            {portfolio.length === 0 && <p className="text-slate-400 col-span-full text-center py-8">No sites found.</p>}
        </div>
    );
};

export default ProjectPlanning;
