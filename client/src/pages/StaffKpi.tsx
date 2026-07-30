import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { Site, StaffKpiScore, KpiHistoryPoint, KpiLeaderboardEntry } from '../types';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { Award, Trophy, Medal, Save } from 'lucide-react';

const currentPeriod = () => new Date().toISOString().slice(0, 7);

interface EditState { pmScore: number; comments: string; }

const StaffKpi: React.FC = () => {
    const [view, setView] = useState<'score' | 'leaderboard'>('score');
    const [sites, setSites] = useState<Site[]>([]);
    const [siteId, setSiteId] = useState<number | ''>('');
    const [period, setPeriod] = useState(currentPeriod());
    const [scores, setScores] = useState<StaffKpiScore[]>([]);
    const [edits, setEdits] = useState<Record<number, EditState>>({});
    const [history, setHistory] = useState<Record<number, KpiHistoryPoint[]>>({});
    const [saving, setSaving] = useState<number | null>(null);
    const [savingAll, setSavingAll] = useState(false);
    const [leaderboard, setLeaderboard] = useState<KpiLeaderboardEntry[]>([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(true);
    const [leaderboardPeriod, setLeaderboardPeriod] = useState(''); // '' = all-time average

    useEffect(() => { fetchSites(); }, []);
    useEffect(() => { if (siteId) fetchScores(); }, [siteId, period]);
    useEffect(() => { fetchLeaderboard(); }, [leaderboardPeriod]);

    const fetchSites = async () => {
        try { const r = await api.get('/sites'); setSites(r.data); if (r.data[0]) setSiteId(r.data[0].ID); }
        catch (e) { console.error(e); }
    };

    const fetchScores = async () => {
        try {
            const r = await api.get(`/kpi?site_id=${siteId}&period=${period}`);
            setScores(r.data);
            // A staff member not yet scored by a PM (PM_SCORE null) starts from the auto score,
            // so Save/Save All has a sensible value even if the PM never touches that row.
            const nextEdits: Record<number, EditState> = {};
            r.data.forEach((s: StaffKpiScore) => {
                nextEdits[s.STAFF_ID] = { pmScore: s.PM_SCORE ?? s.AUTO_SCORE, comments: s.COMMENTS ?? '' };
            });
            setEdits(nextEdits);
            r.data.forEach((s: StaffKpiScore) => fetchHistory(s.STAFF_ID));
        } catch (e) { console.error(e); }
    };

    const fetchHistory = async (staffId: number) => {
        try {
            const r = await api.get(`/kpi/history?staff_id=${staffId}&site_id=${siteId}&limit=6`);
            setHistory(h => ({ ...h, [staffId]: r.data }));
        } catch (e) { console.error(e); }
    };

    const fetchLeaderboard = async () => {
        setLeaderboardLoading(true);
        try {
            const query = leaderboardPeriod ? `?period=${leaderboardPeriod}` : '';
            const r = await api.get(`/kpi/leaderboard${query}`);
            setLeaderboard(r.data);
        } catch (e) { console.error(e); } finally { setLeaderboardLoading(false); }
    };

    const updateEdit = (staffId: number, patch: Partial<EditState>) => {
        setEdits(prev => ({ ...prev, [staffId]: { ...prev[staffId], ...patch } }));
    };

    const saveScore = async (staffId: number) => {
        const edit = edits[staffId];
        if (!edit) return;
        setSaving(staffId);
        try {
            await api.post('/kpi', { staff_id: staffId, site_id: siteId, period, pm_score: edit.pmScore, comments: edit.comments });
            await fetchScores();
            await fetchLeaderboard();
        } catch (e) { console.error(e); toast.error('Failed to save KPI score'); } finally { setSaving(null); }
    };

    const saveAll = async () => {
        setSavingAll(true);
        try {
            const results = await Promise.allSettled(
                scores.map(s => {
                    const edit = edits[s.STAFF_ID];
                    return api.post('/kpi', { staff_id: s.STAFF_ID, site_id: siteId, period, pm_score: edit.pmScore, comments: edit.comments });
                })
            );
            const failed = results.filter(r => r.status === 'rejected').length;
            await fetchScores();
            await fetchLeaderboard();
            if (failed > 0) toast.error(`Saved ${results.length - failed} of ${results.length}, ${failed} failed`);
            else toast.success(`Saved ${results.length} score${results.length === 1 ? '' : 's'}`);
        } finally { setSavingAll(false); }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                <button onClick={() => setView('score')}
                    className={`px-3 py-1.5 rounded-md text-[13px] font-semibold transition-colors ${view === 'score' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    Score Entry
                </button>
                <button onClick={() => setView('leaderboard')}
                    className={`px-3 py-1.5 rounded-md text-[13px] font-semibold transition-colors ${view === 'leaderboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    Leaderboard
                </button>
            </div>

            {view === 'score' ? (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <select value={siteId} onChange={e => setSiteId(Number(e.target.value))} className="form-input w-56">
                                {sites.map(s => <option key={s.ID} value={s.ID}>{s.NAME}</option>)}
                            </select>
                            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="form-input w-40" />
                        </div>
                        <button onClick={saveAll} disabled={savingAll || scores.length === 0} className="btn btn-primary btn-sm">
                            <Save className="w-3.5 h-3.5" /> {savingAll ? 'Saving All...' : 'Save All'}
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-[13px]">
                            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                                <tr>
                                    <th className="text-left px-4 py-3">Staff</th>
                                    <th className="text-left px-4 py-3">Auto Score</th>
                                    <th className="text-left px-4 py-3">PM Score</th>
                                    <th className="text-left px-4 py-3">Comments</th>
                                    <th className="text-left px-4 py-3" title="Last 6 months' score history (auto or PM score, whichever was saved)">Trend</th>
                                    <th className="text-left px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {scores.map(s => (
                                    <ScoreRow key={s.STAFF_ID} score={s} edit={edits[s.STAFF_ID]} history={history[s.STAFF_ID] || []}
                                        saving={saving === s.STAFF_ID || savingAll}
                                        onChange={patch => updateEdit(s.STAFF_ID, patch)}
                                        onSave={() => saveScore(s.STAFF_ID)} />
                                ))}
                                {scores.length === 0 && (
                                    <tr><td colSpan={6} className="text-center py-8 text-slate-400">No active staff at this site.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <Leaderboard entries={leaderboard} loading={leaderboardLoading}
                    period={leaderboardPeriod} onPeriodChange={setLeaderboardPeriod} />
            )}
        </div>
    );
};

const RANK_STYLE: Record<number, { icon: React.ReactNode; row: string }> = {
    0: { icon: <Trophy className="w-4 h-4 text-amber-500" />, row: 'bg-amber-50/60' },
    1: { icon: <Medal className="w-4 h-4 text-slate-400" />, row: 'bg-slate-50' },
    2: { icon: <Medal className="w-4 h-4 text-orange-400" />, row: 'bg-orange-50/60' },
};

const Leaderboard: React.FC<{
    entries: KpiLeaderboardEntry[]; loading: boolean; period: string; onPeriodChange: (period: string) => void;
}> = ({ entries, loading, period, onPeriodChange }) => {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <button onClick={() => onPeriodChange('')}
                    className={`px-3 py-1.5 rounded-md text-[13px] font-semibold border ${period === '' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                    All Time
                </button>
                <input type="month" value={period} onChange={e => onPeriodChange(e.target.value)} className="form-input w-40" />
            </div>

            {loading ? <div className="p-8 text-center text-slate-400">Loading...</div> : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-[13px]">
                        <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                            <tr>
                                <th className="text-left px-4 py-3">Rank</th>
                                <th className="text-left px-4 py-3">Staff</th>
                                <th className="text-left px-4 py-3">Site</th>
                                <th className="text-left px-4 py-3">{period ? 'Score' : 'Avg Score'}</th>
                                <th className="text-left px-4 py-3">Months Scored</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((e, i) => {
                                const style = RANK_STYLE[i];
                                return (
                                    <tr key={e.STAFF_ID} className={`border-t border-slate-100 ${style?.row ?? ''}`}>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                                                {style?.icon} #{i + 1}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-slate-800">{e.STAFF_NAME}</td>
                                        <td className="px-4 py-3 text-slate-500">{e.SITE_NAME ?? '—'}</td>
                                        <td className="px-4 py-3 font-semibold text-slate-800">{e.AVG_SCORE.toFixed(1)}</td>
                                        <td className="px-4 py-3 text-slate-500">{e.MONTHS_SCORED}</td>
                                    </tr>
                                );
                            })}
                            {entries.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-slate-400">
                                    {period ? 'No KPI scores recorded for this month.' : 'No KPI scores recorded yet.'}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const ScoreRow: React.FC<{
    score: StaffKpiScore; edit: EditState | undefined; history: KpiHistoryPoint[]; saving: boolean;
    onChange: (patch: Partial<EditState>) => void; onSave: () => void;
}> = ({ score, edit, history, saving, onChange, onSave }) => {
    const pmScore = edit?.pmScore ?? score.PM_SCORE ?? score.AUTO_SCORE;
    const comments = edit?.comments ?? score.COMMENTS ?? '';

    return (
        <tr className="border-t border-slate-100">
            <td className="px-4 py-3 font-medium text-slate-800">{score.STAFF_NAME}</td>
            <td className="px-4 py-3 text-slate-500">{score.AUTO_SCORE.toFixed(1)}</td>
            <td className="px-4 py-3">
                <input type="number" min={0} max={100} value={pmScore} onChange={e => onChange({ pmScore: Number(e.target.value) })}
                    className="form-input w-20" />
            </td>
            <td className="px-4 py-3">
                <input value={comments} onChange={e => onChange({ comments: e.target.value })} className="form-input w-48" />
            </td>
            <td className="px-4 py-3 w-24">
                <ResponsiveContainer width="100%" height={32}>
                    <LineChart data={history}>
                        <Line type="monotone" dataKey="SCORE" stroke="#6366f1" strokeWidth={2} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </td>
            <td className="px-4 py-3">
                <button onClick={onSave} disabled={saving} className="btn btn-primary btn-sm">
                    <Award className="w-3.5 h-3.5" /> Save
                </button>
            </td>
        </tr>
    );
};

export default StaffKpi;
