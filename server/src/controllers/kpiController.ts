import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import { computeAutoScore, daysInMonth } from '../utils/kpiUtils';

export const getKpiScores = async (req: Request, res: Response) => {
    const { site_id, period } = req.query;
    if (!site_id || !period) {
        return res.status(400).json({ message: 'site_id and period are required' });
    }
    try {
        const staffResult = await execute<any>(
            `SELECT id, name FROM users WHERE site_id = :site_id AND status = 'active'`,
            { site_id: Number(site_id) }
        );
        const staff = staffResult.rows || [];
        const staffIds = staff.map((s: any) => s.ID);
        if (staffIds.length === 0) return res.json([]);

        const idParams = Object.fromEntries(staffIds.map((id: number, i: number) => [`sid${i}`, id]));
        const idPlaceholders = staffIds.map((_: number, i: number) => `:sid${i}`).join(', ');
        const periodLike = `${period}%`;

        const attendanceResult = await execute<any>(
            `SELECT staff_id, COUNT(DISTINCT attendance_date) AS attendance_days
             FROM attendance
             WHERE staff_id IN (${idPlaceholders}) AND site_id = :site_id AND TO_CHAR(attendance_date, 'YYYY-MM') = :period
             GROUP BY staff_id`,
            { ...idParams, site_id: Number(site_id), period: String(period) }
        );
        const attendanceByStaff = attendanceResult.rows || [];

        const taskResult = await execute<any>(
            `SELECT staff_id, COALESCE(SUM(count), 0) AS total_count, COALESCE(SUM(target), 0) AS total_target
             FROM tasks
             WHERE staff_id IN (${idPlaceholders}) AND site_id = :site_id AND TO_CHAR(task_date, 'YYYY-MM') = :period AND target IS NOT NULL
             GROUP BY staff_id`,
            { ...idParams, site_id: Number(site_id), period: String(period) }
        );
        const taskByStaff = taskResult.rows || [];

        const savedResult = await execute<any>(
            `SELECT staff_id, pm_score, comments FROM staff_kpi_scores
             WHERE staff_id IN (${idPlaceholders}) AND site_id = :site_id AND period = :period`,
            { ...idParams, site_id: Number(site_id), period: String(period) }
        );
        const savedByStaff = savedResult.rows || [];

        const daysInPeriod = daysInMonth(String(period));

        const scores = staff.map((s: any) => {
            const attendance = attendanceByStaff.find((a: any) => a.STAFF_ID === s.ID);
            const tasks = taskByStaff.find((t: any) => t.STAFF_ID === s.ID);
            const saved = savedByStaff.find((k: any) => k.STAFF_ID === s.ID);

            const autoScore = computeAutoScore({
                attendanceDays: attendance ? Number(attendance.ATTENDANCE_DAYS) : 0,
                daysInPeriod,
                taskCount: tasks ? Number(tasks.TOTAL_COUNT) : 0,
                taskTarget: tasks ? Number(tasks.TOTAL_TARGET) : 0,
            });

            return {
                STAFF_ID: s.ID,
                STAFF_NAME: s.NAME,
                AUTO_SCORE: autoScore,
                PM_SCORE: saved ? Number(saved.PM_SCORE) : null,
                COMMENTS: saved ? saved.COMMENTS : null,
            };
        });

        res.json(scores);
    } catch (err) {
        console.error('getKpiScores error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const saveKpiScore = async (req: Request, res: Response) => {
    const { staff_id, site_id, period, pm_score, comments } = req.body;
    const scoredBy = (req as any).user.id;
    try {
        const attendanceResult = await execute<any>(
            `SELECT COUNT(DISTINCT attendance_date) AS attendance_days
             FROM attendance WHERE staff_id = :staff_id AND site_id = :site_id AND TO_CHAR(attendance_date, 'YYYY-MM') = :period`,
            { staff_id, site_id, period }
        );
        const taskResult = await execute<any>(
            `SELECT COALESCE(SUM(count), 0) AS total_count, COALESCE(SUM(target), 0) AS total_target
             FROM tasks WHERE staff_id = :staff_id AND site_id = :site_id AND TO_CHAR(task_date, 'YYYY-MM') = :period AND target IS NOT NULL`,
            { staff_id, site_id, period }
        );

        const autoScore = computeAutoScore({
            attendanceDays: Number(attendanceResult.rows[0]?.ATTENDANCE_DAYS ?? 0),
            daysInPeriod: daysInMonth(period),
            taskCount: Number(taskResult.rows[0]?.TOTAL_COUNT ?? 0),
            taskTarget: Number(taskResult.rows[0]?.TOTAL_TARGET ?? 0),
        });

        await execute(
            `INSERT INTO staff_kpi_scores (staff_id, site_id, period, auto_score, pm_score, comments, scored_by)
             VALUES (:staff_id, :site_id, :period, :auto_score, :pm_score, :comments, :scored_by)
             ON CONFLICT (staff_id, site_id, period)
             DO UPDATE SET auto_score = :auto_score, pm_score = :pm_score, comments = :comments, scored_by = :scored_by`,
            { staff_id, site_id, period, auto_score: autoScore, pm_score, comments: comments ?? null, scored_by: scoredBy }
        );

        res.json({ message: 'KPI score saved' });
    } catch (err) {
        console.error('saveKpiScore error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getKpiLeaderboard = async (req: Request, res: Response) => {
    // No period given -> all-time average across every month a staff member was scored.
    // A period given -> ranks by that single month's score instead.
    const period = typeof req.query.period === 'string' && req.query.period ? req.query.period : null;
    try {
        const result = await execute<any>(
            `SELECT u.id AS staff_id, u.name AS staff_name, s.name AS site_name, s.site_no,
                    AVG(COALESCE(k.pm_score, k.auto_score)) AS avg_score,
                    COUNT(k.id) AS months_scored
             FROM staff_kpi_scores k
             JOIN users u ON u.id = k.staff_id
             LEFT JOIN sites s ON s.id = u.site_id
             WHERE u.status = 'active'
               AND (:period::text IS NULL OR k.period = :period)
             GROUP BY u.id, u.name, s.name, s.site_no
             ORDER BY avg_score DESC`,
            { period }
        );
        const leaderboard = (result.rows || []).map((r: any) => ({
            STAFF_ID: r.STAFF_ID,
            STAFF_NAME: r.STAFF_NAME,
            SITE_NAME: r.SITE_NAME,
            SITE_NO: r.SITE_NO,
            AVG_SCORE: Number(r.AVG_SCORE),
            MONTHS_SCORED: Number(r.MONTHS_SCORED),
        }));
        res.json(leaderboard);
    } catch (err) {
        console.error('getKpiLeaderboard error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getKpiHistory = async (req: Request, res: Response) => {
    const { staff_id, site_id, limit } = req.query;
    if (!staff_id || !site_id) {
        return res.status(400).json({ message: 'staff_id and site_id are required' });
    }
    try {
        const result = await execute<any>(
            `SELECT period, COALESCE(pm_score, auto_score) AS score
             FROM staff_kpi_scores
             WHERE staff_id = :staff_id AND site_id = :site_id
             ORDER BY period DESC
             LIMIT :limit`,
            { staff_id: Number(staff_id), site_id: Number(site_id), limit: Number(limit) || 6 }
        );
        res.json((result.rows || []).reverse());
    } catch (err) {
        console.error('getKpiHistory error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
