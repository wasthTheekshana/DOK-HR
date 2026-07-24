import React, { useEffect, useState } from 'react';
import api from '../services/api';
import type { Site, StaffKpiScore, KpiHistoryPoint } from '../types';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { Award } from 'lucide-react';

const currentPeriod = () => new Date().toISOString().slice(0, 7);

const StaffKpi: React.FC = () => {
    const [sites, setSites] = useState<Site[]>([]);
    const [siteId, setSiteId] = useState<number | ''>('');
    const [period, setPeriod] = useState(currentPeriod());
    const [scores, setScores] = useState<StaffKpiScore[]>([]);
    const [history, setHistory] = useState<Record<number, KpiHistoryPoint[]>>({});
    const [saving, setSaving] = useState<number | null>(null);

    useEffect(() => { fetchSites(); }, []);
    useEffect(() => { if (siteId) fetchScores(); }, [siteId, period]);

    const fetchSites = async () => {
        try { const r = await api.get('/sites'); setSites(r.data); if (r.data[0]) setSiteId(r.data[0].ID); }
        catch (e) { console.error(e); }
    };

    const fetchScores = async () => {
        try {
            const r = await api.get(`/kpi?site_id=${siteId}&period=${period}`);
            setScores(r.data);
            r.data.forEach((s: StaffKpiScore) => fetchHistory(s.STAFF_ID));
        } catch (e) { console.error(e); }
    };

    const fetchHistory = async (staffId: number) => {
        try {
            const r = await api.get(`/kpi/history?staff_id=${staffId}&site_id=${siteId}&limit=6`);
            setHistory(h => ({ ...h, [staffId]: r.data }));
        } catch (e) { console.error(e); }
    };

    const saveScore = async (staffId: number, pmScore: number, comments: string) => {
        setSaving(staffId);
        try {
            await api.post('/kpi', { staff_id: staffId, site_id: siteId, period, pm_score: pmScore, comments });
            await fetchScores();
        } catch (e) { console.error(e); } finally { setSaving(null); }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <select value={siteId} onChange={e => setSiteId(Number(e.target.value))} className="form-input w-56">
                    {sites.map(s => <option key={s.ID} value={s.ID}>{s.NAME}</option>)}
                </select>
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="form-input w-40" />
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-[13px]">
                    <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                        <tr>
                            <th className="text-left px-4 py-3">Staff</th>
                            <th className="text-left px-4 py-3">Auto Score</th>
                            <th className="text-left px-4 py-3">PM Score</th>
                            <th className="text-left px-4 py-3">Comments</th>
                            <th className="text-left px-4 py-3">Trend</th>
                            <th className="text-left px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {scores.map(s => (
                            <ScoreRow key={s.STAFF_ID} score={s} history={history[s.STAFF_ID] || []}
                                saving={saving === s.STAFF_ID} onSave={(pm, comments) => saveScore(s.STAFF_ID, pm, comments)} />
                        ))}
                        {scores.length === 0 && (
                            <tr><td colSpan={6} className="text-center py-8 text-slate-400">No active staff at this site.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ScoreRow: React.FC<{
    score: StaffKpiScore; history: KpiHistoryPoint[]; saving: boolean; onSave: (pmScore: number, comments: string) => void;
}> = ({ score, history, saving, onSave }) => {
    const [pmScore, setPmScore] = useState(score.PM_SCORE ?? score.AUTO_SCORE);
    const [comments, setComments] = useState(score.COMMENTS ?? '');

    return (
        <tr className="border-t border-slate-100">
            <td className="px-4 py-3 font-medium text-slate-800">{score.STAFF_NAME}</td>
            <td className="px-4 py-3 text-slate-500">{score.AUTO_SCORE.toFixed(1)}</td>
            <td className="px-4 py-3">
                <input type="number" min={0} max={100} value={pmScore} onChange={e => setPmScore(Number(e.target.value))}
                    className="form-input w-20" />
            </td>
            <td className="px-4 py-3">
                <input value={comments} onChange={e => setComments(e.target.value)} className="form-input w-48" />
            </td>
            <td className="px-4 py-3 w-24">
                <ResponsiveContainer width="100%" height={32}>
                    <LineChart data={history}>
                        <Line type="monotone" dataKey="SCORE" stroke="#6366f1" strokeWidth={2} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </td>
            <td className="px-4 py-3">
                <button onClick={() => onSave(pmScore, comments)} disabled={saving} className="btn btn-primary btn-sm">
                    <Award className="w-3.5 h-3.5" /> Save
                </button>
            </td>
        </tr>
    );
};

export default StaffKpi;
