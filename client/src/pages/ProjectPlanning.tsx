import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { SitePortfolioEntry, SitePlan, ProjectMilestone } from '../types';
import { AlertTriangle, Users, ChevronRight, Plus, Trash2 } from 'lucide-react';

const RISK_DOT: Record<string, string> = { red: 'bg-red-500', amber: 'bg-amber-500' };

const ProjectPlanning: React.FC = () => {
    const [portfolio, setPortfolio] = useState<SitePortfolioEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState<SitePlan | null>(null);

    // New-milestone form
    const [msName, setMsName] = useState('');
    const [msDueDate, setMsDueDate] = useState('');
    const [saving, setSaving] = useState(false);

    // Site plan (headcount / dates) edit form
    const [planHeadcount, setPlanHeadcount] = useState('');
    const [planStartDate, setPlanStartDate] = useState('');
    const [planEndDate, setPlanEndDate] = useState('');
    const [savingPlan, setSavingPlan] = useState(false);

    useEffect(() => { fetchPortfolio(); }, []);

    const fetchPortfolio = async () => {
        try { const r = await api.get('/project-planning/sites'); setPortfolio(r.data); }
        catch (e) { console.error(e); } finally { setLoading(false); }
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

    const updateMilestoneStatus = async (milestone: ProjectMilestone, status: string) => {
        if (!detail) return;
        try {
            await api.put(`/project-planning/milestones/${milestone.ID}`, { status });
            await openSite(detail.ID);
            await fetchPortfolio();
        } catch (e) { console.error(e); toast.error('Failed to update milestone status'); }
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

    if (loading) return <div className="p-8 text-center text-slate-400">Loading...</div>;

    if (detail) {
        return (
            <div className="space-y-5">
                <button onClick={() => setDetail(null)} className="text-[13px] text-slate-500 hover:text-slate-700">&larr; Back to portfolio</button>
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
                    <h3 className="text-[14px] font-semibold text-slate-900 mb-4">Milestones</h3>
                    <div className="space-y-2">
                        {detail.MILESTONES.map(m => (
                            <div key={m.ID} className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-2">
                                    {m.RISK && <span className={`w-2 h-2 rounded-full ${RISK_DOT[m.RISK]}`} />}
                                    <span className="text-[13px] font-medium text-slate-800">{m.NAME}</span>
                                    <span className="text-[11px] text-slate-400">{m.DUE_DATE ?? 'no due date'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <select value={m.STATUS} onChange={e => updateMilestoneStatus(m, e.target.value)}
                                        className="text-[12px] border border-slate-200 rounded-lg px-2 py-1">
                                        <option value="not_started">Not started</option>
                                        <option value="in_progress">In progress</option>
                                        <option value="done">Done</option>
                                    </select>
                                    <button onClick={() => deleteMilestone(m.ID)} className="p-1.5 text-slate-400 hover:text-red-500">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {detail.MILESTONES.length === 0 && <p className="text-[13px] text-slate-400">No milestones yet.</p>}
                    </div>

                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                        <input value={msName} onChange={e => setMsName(e.target.value)} placeholder="Milestone name" className="form-input flex-1" />
                        <input type="date" value={msDueDate} onChange={e => setMsDueDate(e.target.value)} className="form-input w-40" />
                        <button onClick={addMilestone} disabled={saving || !msName.trim()} className="btn btn-primary">
                            <Plus className="w-4 h-4" /> Add
                        </button>
                    </div>
                </div>
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
