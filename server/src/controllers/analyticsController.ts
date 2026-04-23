import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import { computeWorkingDays } from '../utils/analyticsUtils';

const EXTRA_UNIT_RATE = Number(process.env.EXTRA_UNIT_RATE) || 0.5;

// ─── Workforce Analytics ───────────────────────────────────────────────────

export const getWorkforceAnalytics = async (req: Request, res: Response) => {
    try {
        const [roleDistRes, statusDistRes, siteDistRes, summaryRes] = await Promise.all([
            execute<any>(
                `SELECT role, COUNT(*) as cnt FROM users GROUP BY role ORDER BY cnt DESC`,
                []
            ),
            execute<any>(
                `SELECT status, COUNT(*) as cnt FROM users GROUP BY status`,
                []
            ),
            execute<any>(
                `SELECT s.name as site_name, s.site_no,
                    COUNT(CASE WHEN u.role = 'staff' THEN 1 END) as staff_count,
                    COUNT(CASE WHEN u.role = 'supervisor' THEN 1 END) as supervisor_count
                 FROM sites s
                 LEFT JOIN users u ON u.site_id = s.id
                 GROUP BY s.name, s.site_no
                 ORDER BY staff_count DESC`,
                []
            ),
            execute<any>(
                `SELECT
                    COUNT(*) as total_employees,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_employees,
                    COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_employees,
                    COUNT(CASE WHEN role = 'supervisor' THEN 1 END) as total_supervisors,
                    COUNT(CASE WHEN role = 'staff' THEN 1 END) as total_staff,
                    COUNT(CASE WHEN role = 'admin' THEN 1 END) as total_admins
                 FROM users`,
                []
            )
        ]);

        const sitesCountRes = await execute<any>(`SELECT COUNT(*) as cnt FROM sites`, []);

        res.json({
            summary: {
                ...summaryRes.rows?.[0],
                total_sites: sitesCountRes.rows?.[0]?.CNT || 0
            },
            roleDistribution: (roleDistRes.rows || []).map((r: any) => ({
                name: r.ROLE,
                value: Number(r.CNT)
            })),
            statusDistribution: (statusDistRes.rows || []).map((r: any) => ({
                name: r.STATUS,
                value: Number(r.CNT)
            })),
            siteDistribution: (siteDistRes.rows || []).map((r: any) => ({
                site: r.SITE_NAME,
                site_no: r.SITE_NO,
                staff: Number(r.STAFF_COUNT),
                supervisors: Number(r.SUPERVISOR_COUNT)
            }))
        });
    } catch (error) {
        console.error('Analytics workforce error:', error);
        res.status(500).json({ message: 'Failed to fetch workforce analytics' });
    }
};

// ─── Task / Productivity Analytics ─────────────────────────────────────────

export const getTaskAnalytics = async (req: Request, res: Response) => {
    const { date_from, date_to } = req.query;
    const from = (typeof date_from === 'string' ? date_from : undefined) ?? new Date(new Date().setDate(1)).toISOString().slice(0, 10);
    const to = (typeof date_to === 'string' ? date_to : undefined) ?? new Date().toISOString().slice(0, 10);

    try {
        const [dailyRes, siteProductRes, topPerfRes, achieveRes] = await Promise.all([
            // Daily task count (last 30 days by default)
            execute<any>(
                `SELECT TO_CHAR(TRUNC(task_date), 'YYYY-MM-DD') as task_day, COUNT(*) as total_tasks
                 FROM tasks
                 WHERE task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND task_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY TRUNC(task_date)
                 ORDER BY TRUNC(task_date)`,
                { d_from: from, d_to: to }
            ),
            // Site productivity
            execute<any>(
                `SELECT s.name as site_name, s.site_no,
                    COUNT(t.id) as task_count,
                    NVL(SUM(t.count), 0) as total_count
                 FROM tasks t
                 JOIN sites s ON t.site_id = s.id
                 WHERE t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND t.task_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY s.name, s.site_no
                 ORDER BY task_count DESC`,
                { d_from: from, d_to: to }
            ),
            // Top 10 performers (target_based)
            execute<any>(
                `SELECT u.name as staff_name, SUM(t.count) as total_count
                 FROM tasks t
                 JOIN users u ON t.staff_id = u.id
                 WHERE t.ot_type = 'target_based'
                   AND t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND t.task_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY u.name
                 ORDER BY total_count DESC
                 FETCH FIRST 10 ROWS ONLY`,
                { d_from: from, d_to: to }
            ),
            // Target achievement
            execute<any>(
                `SELECT u.name as staff_name,
                    SUM(t.count) as actual_count,
                    SUM(t.target) as target_count,
                    CASE WHEN SUM(t.target) > 0
                         THEN ROUND(SUM(t.count) / SUM(t.target) * 100, 1)
                         ELSE 0 END as achievement_pct
                 FROM tasks t
                 JOIN users u ON t.staff_id = u.id
                 WHERE t.ot_type = 'target_based'
                   AND t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND t.task_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY u.name
                 ORDER BY achievement_pct DESC
                 FETCH FIRST 15 ROWS ONLY`,
                { d_from: from, d_to: to }
            )
        ]);

        res.json({
            dateRange: { from, to },
            dailyCount: (dailyRes.rows || []).map((r: any) => ({
                date: r.TASK_DAY,
                tasks: Number(r.TOTAL_TASKS)
            })),
            siteProductivity: (siteProductRes.rows || []).map((r: any) => ({
                site: r.SITE_NAME,
                site_no: r.SITE_NO,
                task_count: Number(r.TASK_COUNT),
                total_count: Number(r.TOTAL_COUNT)
            })),
            topPerformers: (topPerfRes.rows || []).map((r: any) => ({
                name: r.STAFF_NAME,
                count: Number(r.TOTAL_COUNT)
            })),
            targetAchievement: (achieveRes.rows || []).map((r: any) => ({
                name: r.STAFF_NAME,
                actual: Number(r.ACTUAL_COUNT),
                target: Number(r.TARGET_COUNT),
                pct: Number(r.ACHIEVEMENT_PCT)
            }))
        });
    } catch (error) {
        console.error('Analytics tasks error:', error);
        res.status(500).json({ message: 'Failed to fetch task analytics' });
    }
};

// ─── Attendance Analytics ───────────────────────────────────────────────────

export const getAttendanceAnalytics = async (req: Request, res: Response) => {
    const { date_from, date_to } = req.query;
    const from = (typeof date_from === 'string' ? date_from : undefined) ?? new Date(new Date().setMonth(new Date().getMonth() - 6, 1)).toISOString().slice(0, 10);
    const to = (typeof date_to === 'string' ? date_to : undefined) ?? new Date().toISOString().slice(0, 10);

    try {
        const [monthlyRes, siteMonthlyRes, avgHoursRes, lateStayRes] = await Promise.all([
            // Monthly attendance trend — from attendance table
            execute<any>(
                `SELECT TO_CHAR(a.attendance_date, 'YYYY-MM') as month,
                    COUNT(*) as attendance_count
                 FROM attendance a
                 WHERE a.attendance_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND a.attendance_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY TO_CHAR(a.attendance_date, 'YYYY-MM')
                 ORDER BY month`,
                { d_from: from, d_to: to }
            ),
            // Site-wise monthly attendance trend — from attendance table
            execute<any>(
                `SELECT TO_CHAR(a.attendance_date, 'YYYY-MM') as month,
                    s.site_no,
                    COUNT(*) as attendance_count
                 FROM attendance a
                 JOIN sites s ON a.site_id = s.id
                 WHERE a.attendance_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND a.attendance_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY TO_CHAR(a.attendance_date, 'YYYY-MM'), s.site_no
                 ORDER BY month, s.site_no`,
                { d_from: from, d_to: to }
            ),
            // Average working hours per employee (only where in/out times exist — time_based sites)
            execute<any>(
                `SELECT u.name as staff_name,
                    ROUND(AVG(
                        CASE WHEN a.in_time IS NOT NULL AND a.out_time IS NOT NULL
                        THEN (TO_NUMBER(SUBSTR(a.out_time, 1, 2)) + TO_NUMBER(SUBSTR(a.out_time, 4, 2))/60)
                           - (TO_NUMBER(SUBSTR(a.in_time, 1, 2)) + TO_NUMBER(SUBSTR(a.in_time, 4, 2))/60)
                        ELSE NULL END
                    ), 2) as avg_hours
                 FROM attendance a
                 JOIN users u ON a.staff_id = u.id
                 WHERE a.attendance_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND a.attendance_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY u.name
                 HAVING AVG(
                    CASE WHEN a.in_time IS NOT NULL AND a.out_time IS NOT NULL
                    THEN (TO_NUMBER(SUBSTR(a.out_time, 1, 2)) + TO_NUMBER(SUBSTR(a.out_time, 4, 2))/60)
                       - (TO_NUMBER(SUBSTR(a.in_time, 1, 2)) + TO_NUMBER(SUBSTR(a.in_time, 4, 2))/60)
                    ELSE NULL END
                 ) IS NOT NULL
                 ORDER BY avg_hours DESC
                 FETCH FIRST 15 ROWS ONLY`,
                { d_from: from, d_to: to }
            ),
            // Late stay analysis (out_time >= 17:00)
            execute<any>(
                `SELECT u.name as staff_name, COUNT(*) as late_count
                 FROM attendance a
                 JOIN users u ON a.staff_id = u.id
                 WHERE a.out_time IS NOT NULL
                   AND TO_NUMBER(SUBSTR(a.out_time, 1, 2)) >= 17
                   AND a.attendance_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND a.attendance_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY u.name
                 ORDER BY late_count DESC
                 FETCH FIRST 15 ROWS ONLY`,
                { d_from: from, d_to: to }
            )
        ]);

        // Pivot site-wise monthly attendance into { month, SITE_A: count, ... }
        const siteMonthMap = new Map<string, any>();
        const siteSet = new Set<string>();
        (siteMonthlyRes.rows || []).forEach((r: any) => {
            const month = r.MONTH;
            const siteNo = String(r.SITE_NO);
            const count = Number(r.ATTENDANCE_COUNT);
            siteSet.add(siteNo);
            if (!siteMonthMap.has(month)) siteMonthMap.set(month, { month });
            siteMonthMap.get(month)![siteNo] = count;
        });
        const attendSites = Array.from(siteSet).sort();
        const attendSiteTrend = Array.from(siteMonthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

        res.json({
            dateRange: { from, to },
            monthlyTrend: (monthlyRes.rows || []).map((r: any) => ({
                month: r.MONTH,
                count: Number(r.ATTENDANCE_COUNT)
            })),
            siteMonthlyTrend: { sites: attendSites, trend: attendSiteTrend },
            avgWorkingHours: (avgHoursRes.rows || []).map((r: any) => ({
                name: r.STAFF_NAME,
                hours: Number(r.AVG_HOURS)
            })),
            lateStay: (lateStayRes.rows || []).map((r: any) => ({
                name: r.STAFF_NAME,
                count: Number(r.LATE_COUNT)
            }))
        });
    } catch (error) {
        console.error('Analytics attendance error:', error);
        res.status(500).json({ message: 'Failed to fetch attendance analytics' });
    }
};

// ─── Payroll Analytics ──────────────────────────────────────────────────────

export const getPayrollAnalytics = async (req: Request, res: Response) => {
    const { date_from, date_to } = req.query;
    const from = (typeof date_from === 'string' ? date_from : undefined) ?? new Date(new Date().setMonth(new Date().getMonth() - 6, 1)).toISOString().slice(0, 10);
    const to = (typeof date_to === 'string' ? date_to : undefined) ?? new Date().toISOString().slice(0, 10);

    try {
        const [summaryRes, monthlyOTRes, sitePayrollRes, targetOTRes, timeOTRes] = await Promise.all([
            // Salary summary
            execute<any>(
                `SELECT
                    NVL(SUM(CASE WHEN status = 'active' THEN basic_salary END), 0) as total_basic_salary,
                    NVL(SUM(CASE WHEN status = 'active' AND role = 'staff' THEN basic_salary END), 0) as staff_basic,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count
                 FROM users`,
                []
            ),
            // Monthly OT payment trend (target-based from tasks, time-based from custom_ot_records via saved_at month)
            execute<any>(
                `SELECT TO_CHAR(t.task_date, 'YYYY-MM') as month,
                    ROUND(NVL(SUM(
                        CASE WHEN t.ot_type = 'target_based'
                        THEN GREATEST(0, NVL(t.count,0) - NVL(t.target,0)) * :extra_rate1
                        ELSE 0 END
                    ), 0), 2) as ot_payment,
                    COUNT(DISTINCT t.staff_id) as staff_count
                 FROM tasks t
                 WHERE t.ot_type = 'target_based'
                   AND t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND t.task_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY TO_CHAR(t.task_date, 'YYYY-MM')
                 ORDER BY month`,
                { d_from: from, d_to: to, extra_rate1: EXTRA_UNIT_RATE }
            ),
            // Payroll by site (basic salary)
            execute<any>(
                `SELECT s.name as site_name, s.site_no,
                    NVL(SUM(u.basic_salary), 0) as total_salary,
                    COUNT(u.id) as staff_count
                 FROM sites s
                 LEFT JOIN users u ON u.site_id = s.id AND u.status = 'active' AND u.role = 'staff'
                 GROUP BY s.name, s.site_no
                 ORDER BY total_salary DESC`,
                []
            ),
            // Target-based OT: SUM(extra_payment) per site from payroll_saved_records
            execute<any>(
                `SELECT site_no, MAX(site_name) as site_name,
                    ROUND(NVL(SUM(extra_payment), 0), 2) as target_ot_payment,
                    COUNT(DISTINCT staff_id) as target_staff
                 FROM payroll_saved_records
                 WHERE date_from >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND date_to <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY site_no`,
                { d_from: from, d_to: to }
            ),
            // Time-based OT: SUM(total_payment) per site from custom_ot_records
            execute<any>(
                `SELECT site_no, MAX(site_name) as site_name,
                    ROUND(NVL(SUM(total_payment), 0), 2) as time_ot_payment,
                    COUNT(DISTINCT staff_id) as time_staff
                 FROM custom_ot_records
                 WHERE date_from >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND date_to <= TO_DATE(:d_to, 'YYYY-MM-DD')
                   AND site_no IS NOT NULL
                 GROUP BY site_no`,
                { d_from: from, d_to: to }
            )
        ]);

        const summary = summaryRes.rows?.[0] || {};
        const totalBasic = Number(summary.TOTAL_BASIC_SALARY) || 0;

        // Merge target-based and time-based OT by site_no
        const targetOTMap = new Map((targetOTRes.rows || []).map((r: any) => [String(r.SITE_NO), r]));
        const timeOTMap = new Map((timeOTRes.rows || []).map((r: any) => [String(r.SITE_NO), r]));
        const allSiteNos = new Set([...targetOTMap.keys(), ...timeOTMap.keys()]);

        const siteOTRows = Array.from(allSiteNos).map(siteNo => {
            const targetRow = (targetOTMap.get(siteNo) as any) || {};
            const timeRow = (timeOTMap.get(siteNo) as any) || {};
            const timeOT = Number(timeRow.TIME_OT_PAYMENT) || 0;
            const targetOT = Number(targetRow.TARGET_OT_PAYMENT) || 0;
            return {
                site_no: siteNo,
                site_name: targetRow.SITE_NAME || timeRow.SITE_NAME || siteNo,
                time_ot_payment: Math.round(timeOT * 100) / 100,
                target_ot_payment: Math.round(targetOT * 100) / 100,
                total_ot_payment: Math.round((timeOT + targetOT) * 100) / 100,
                time_staff: Number(timeRow.TIME_STAFF) || 0,
                target_staff: Number(targetRow.TARGET_STAFF) || 0
            };
        }).sort((a, b) => String(a.site_no).localeCompare(String(b.site_no)));

        const grandTimeOT = siteOTRows.reduce((s, r) => s + r.time_ot_payment, 0);
        const grandTargetOT = siteOTRows.reduce((s, r) => s + r.target_ot_payment, 0);
        const grandTotalOT = Math.round((grandTimeOT + grandTargetOT) * 100) / 100;

        res.json({
            dateRange: { from, to },
            summary: {
                total_basic_salary: totalBasic,
                total_ot_paid: grandTotalOT,
                time_based_ot_total: Math.round(grandTimeOT * 100) / 100,
                target_based_ot_total: Math.round(grandTargetOT * 100) / 100,
                total_payroll_cost: Math.round((totalBasic + grandTotalOT) * 100) / 100,
                active_employees: Number(summary.ACTIVE_COUNT) || 0
            },
            payrollBreakdown: [
                { name: 'Basic Salary', value: Math.round(totalBasic) },
                { name: 'Time-based OT', value: Math.round(grandTimeOT) },
                { name: 'Target-based OT', value: Math.round(grandTargetOT) }
            ],
            monthlyTrend: (monthlyOTRes.rows || []).map((r: any) => ({
                month: r.MONTH,
                ot_payment: Math.round(Number(r.OT_PAYMENT) * 100) / 100,
                staff_count: Number(r.STAFF_COUNT)
            })),
            sitePayroll: (sitePayrollRes.rows || []).map((r: any) => ({
                site: r.SITE_NAME,
                site_no: r.SITE_NO,
                total_salary: Number(r.TOTAL_SALARY),
                staff_count: Number(r.STAFF_COUNT)
            })),
            siteOTBreakdown: siteOTRows,
            otGrandTotal: { time_ot: Math.round(grandTimeOT * 100) / 100, target_ot: Math.round(grandTargetOT * 100) / 100, total: grandTotalOT }
        });
    } catch (error) {
        console.error('Analytics payroll error:', error);
        res.status(500).json({ message: 'Failed to fetch payroll analytics' });
    }
};

// ─── Site-Wise Analytics ─────────────────────────────────────────────────────

export const getSiteAnalytics = async (req: Request, res: Response) => {
    const { date_from, date_to } = req.query;
    const from = (typeof date_from === 'string' ? date_from : undefined) ?? new Date(new Date().setDate(1)).toISOString().slice(0, 10);
    const to = (typeof date_to === 'string' ? date_to : undefined) ?? new Date().toISOString().slice(0, 10);

    try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            return res.status(400).json({ message: 'Invalid date range' });
        }
        const workingDays = computeWorkingDays(from, to);
        const [siteBaseRes, siteTaskRes, siteAttendRes, timeOTRes, targetOTRes] = await Promise.all([
            // Site base info: staff counts + salary (no date filter)
            execute<any>(
                `SELECT s.id as site_id, s.name as site_name, s.site_no,
                    s.daily_target,
                    COUNT(CASE WHEN u.role = 'staff' AND u.status = 'active' THEN u.id END) as active_staff,
                    COUNT(CASE WHEN u.role = 'staff' THEN u.id END) as total_staff,
                    COUNT(CASE WHEN u.role = 'supervisor' THEN u.id END) as supervisor_count,
                    NVL(SUM(CASE WHEN u.role = 'staff' AND u.status = 'active' THEN u.basic_salary END), 0) as total_salary
                 FROM sites s
                 LEFT JOIN users u ON u.site_id = s.id
                 GROUP BY s.id, s.name, s.site_no, s.daily_target
                 ORDER BY s.site_no`,
                []
            ),
            // Site task summary for the selected period (units, target, workers — no OT calc)
            execute<any>(
                `SELECT t.site_id,
                    COUNT(t.id) as task_records,
                    NVL(SUM(t.count), 0) as total_units,
                    COUNT(DISTINCT t.staff_id) as active_workers
                 FROM tasks t
                 WHERE t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND t.task_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY t.site_id`,
                { d_from: from, d_to: to }
            ),
            // Attendance by site — derived from tasks table
            execute<any>(
                `SELECT t.site_id,
                    COUNT(t.id) as attendance_count,
                    COUNT(DISTINCT t.staff_id) as unique_attendees
                 FROM tasks t
                 WHERE t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND t.task_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY t.site_id`,
                { d_from: from, d_to: to }
            ),
            // Time-based OT: SUM(total_payment) per site from custom_ot_records
            execute<any>(
                `SELECT site_no, ROUND(NVL(SUM(total_payment), 0), 2) as time_ot
                 FROM custom_ot_records
                 WHERE date_from >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND date_to <= TO_DATE(:d_to, 'YYYY-MM-DD')
                   AND site_no IS NOT NULL
                 GROUP BY site_no`,
                { d_from: from, d_to: to }
            ),
            // Target-based OT: SUM(extra_payment) per site from payroll_saved_records
            execute<any>(
                `SELECT site_no, ROUND(NVL(SUM(extra_payment), 0), 2) as target_ot
                 FROM payroll_saved_records
                 WHERE date_from >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND date_to <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY site_no`,
                { d_from: from, d_to: to }
            )
        ]);

        // Build lookup maps
        const taskMap = new Map((siteTaskRes.rows || []).map((r: any) => [r.SITE_ID, r]));
        const attendMap = new Map((siteAttendRes.rows || []).map((r: any) => [r.SITE_ID, r]));
        const timeOTMap = new Map((timeOTRes.rows || []).map((r: any) => [String(r.SITE_NO), Number(r.TIME_OT) || 0]));
        const targetOTMap = new Map((targetOTRes.rows || []).map((r: any) => [String(r.SITE_NO), Number(r.TARGET_OT) || 0]));

        const sites = (siteBaseRes.rows || []).map((r: any) => {
            const task = (taskMap.get(r.SITE_ID) as any) || {};
            const attend = (attendMap.get(r.SITE_ID) as any) || {};
            const siteNo = String(r.SITE_NO);
            const totalUnits    = Number(task.TOTAL_UNITS)    || 0;
            const dailyTarget   = Number(r.DAILY_TARGET)      || 0;
            const activeWorkers = Number(task.ACTIVE_WORKERS) || 0;
            const totalTarget   = dailyTarget * 22 * activeWorkers;
            const extraUnits    = totalUnits > totalTarget ? totalUnits - totalTarget : 0;
            const timeOT = timeOTMap.get(siteNo) || 0;
            const targetOT = targetOTMap.get(siteNo) || 0;
            return {
                site_id: r.SITE_ID,
                site_name: r.SITE_NAME,
                site_no: r.SITE_NO,
                daily_target: dailyTarget,
                active_staff: Number(r.ACTIVE_STAFF) || 0,
                total_staff: Number(r.TOTAL_STAFF) || 0,
                supervisor_count: Number(r.SUPERVISOR_COUNT) || 0,
                total_salary: Number(r.TOTAL_SALARY) || 0,
                task_records: Number(task.TASK_RECORDS) || 0,
                total_units: totalUnits,
                total_target: totalTarget,
                extra_units: extraUnits,
                time_ot_payment: Math.round(timeOT * 100) / 100,
                target_ot_payment: Math.round(targetOT * 100) / 100,
                ot_payment: Math.round((timeOT + targetOT) * 100) / 100,
                active_workers: activeWorkers,
                attendance_count: Number(attend.ATTENDANCE_COUNT) || 0,
                unique_attendees: Number(attend.UNIQUE_ATTENDEES) || 0,
                achievement_pct: totalTarget > 0 ? Math.round(totalUnits / totalTarget * 1000) / 10 : null
            };
        });

        res.json({ dateRange: { from, to }, sites });
    } catch (error) {
        console.error('Analytics site error:', error);
        res.status(500).json({ message: 'Failed to fetch site analytics' });
    }
};

// ─── Site-Wise Daily Count Trend ────────────────────────────────────────────

export const getSiteCountTrend = async (req: Request, res: Response) => {
    const { date_from, date_to } = req.query;
    const from = (typeof date_from === 'string' ? date_from : undefined) ?? new Date(new Date().setDate(1)).toISOString().slice(0, 10);
    const to = (typeof date_to === 'string' ? date_to : undefined) ?? new Date().toISOString().slice(0, 10);

    try {
        const result = await execute<any>(
            `SELECT TO_CHAR(t.task_date, 'YYYY-MM-DD') as task_date,
                    s.site_no,
                    NVL(SUM(NVL(t.count, 0)), 0) as total_count
             FROM tasks t
             JOIN sites s ON t.site_id = s.id
             WHERE t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
               AND t.task_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
             GROUP BY TO_CHAR(t.task_date, 'YYYY-MM-DD'), s.site_no
             ORDER BY task_date, s.site_no`,
            { d_from: from, d_to: to }
        );

        // Pivot rows into { date, SITE_A: count, SITE_B: count, ... }
        const dateMap = new Map<string, any>();
        const siteSet = new Set<string>();

        (result.rows || []).forEach((r: any) => {
            const date = r.TASK_DATE;
            const siteNo = String(r.SITE_NO);
            const count = Number(r.TOTAL_COUNT);
            siteSet.add(siteNo);
            if (!dateMap.has(date)) dateMap.set(date, { date });
            dateMap.get(date)![siteNo] = count;
        });

        const sites = Array.from(siteSet).sort();
        const trend = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        res.json({ dateRange: { from, to }, sites, trend });
    } catch (error) {
        console.error('Analytics site count trend error:', error);
        res.status(500).json({ message: 'Failed to fetch site count trend' });
    }
};

// ─── Performance Analytics ──────────────────────────────────────────────────

export const getPerformanceAnalytics = async (req: Request, res: Response) => {
    const { date_from, date_to } = req.query;
    const from = (typeof date_from === 'string' ? date_from : undefined) ?? new Date(new Date().setDate(1)).toISOString().slice(0, 10);
    const to = (typeof date_to === 'string' ? date_to : undefined) ?? new Date().toISOString().slice(0, 10);

    try {
        const perfRes = await execute<any>(
            `SELECT u.name as staff_name,
                SUM(t.target) as total_target,
                SUM(t.count) as total_actual,
                CASE WHEN SUM(t.target) > 0
                     THEN ROUND((SUM(t.count) - SUM(t.target)) / SUM(t.target) * 100, 1)
                     ELSE NULL END as gap_pct,
                CASE WHEN SUM(t.target) > 0
                     THEN ROUND(SUM(t.count) / SUM(t.target) * 100, 1)
                     ELSE 0 END as achievement_pct
             FROM tasks t
             JOIN users u ON t.staff_id = u.id
             WHERE t.ot_type = 'target_based'
               AND t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
               AND t.task_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
             GROUP BY u.name
             ORDER BY achievement_pct DESC`,
            { d_from: from, d_to: to }
        );

        const rows = (perfRes.rows || []).map((r: any) => ({
            name: r.STAFF_NAME,
            target: Number(r.TOTAL_TARGET),
            actual: Number(r.TOTAL_ACTUAL),
            gap_pct: r.GAP_PCT !== null ? Number(r.GAP_PCT) : null,
            achievement_pct: Number(r.ACHIEVEMENT_PCT)
        }));

        const overperformers = rows.filter((r: any) => r.gap_pct !== null && r.gap_pct >= 0)
            .sort((a: any, b: any) => b.gap_pct - a.gap_pct)
            .slice(0, 5);

        const underperformers = rows.filter((r: any) => r.gap_pct !== null && r.gap_pct < 0)
            .sort((a: any, b: any) => a.gap_pct - b.gap_pct)
            .slice(0, 5);

        res.json({
            dateRange: { from, to },
            performanceData: rows.slice(0, 15),
            overperformers,
            underperformers
        });
    } catch (error) {
        console.error('Analytics performance error:', error);
        res.status(500).json({ message: 'Failed to fetch performance analytics' });
    }
};

// ─── Site Performance Analysis ───────────────────────────────────────────────

export const getSitePerformanceAnalysis = async (req: Request, res: Response) => {
    const { site_id, date_from, date_to } = req.query;
    const from = (typeof date_from === 'string' ? date_from : undefined) ?? new Date(new Date().setDate(1)).toISOString().slice(0, 10);
    const to = (typeof date_to === 'string' ? date_to : undefined) ?? new Date().toISOString().slice(0, 10);

    if (!site_id) {
        return res.status(400).json({ message: 'site_id is required' });
    }

    try {
        const [dailyRes, staffRes, siteInfoRes] = await Promise.all([
            // Daily actual vs target count for the site
            execute<any>(
                `SELECT TO_CHAR(t.task_date, 'YYYY-MM-DD') as task_date,
                    NVL(SUM(NVL(t.count, 0)), 0) as actual_count,
                    MAX(s.daily_target) as target_count
                 FROM tasks t
                 JOIN sites s ON t.site_id = s.id
                 WHERE t.site_id = :site_id
                   AND t.ot_type = 'target_based'
                   AND t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND t.task_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY TO_CHAR(t.task_date, 'YYYY-MM-DD')
                 ORDER BY task_date`,
                { site_id: Number(site_id), d_from: from, d_to: to }
            ),
            // Per-staff breakdown for the site
            execute<any>(
                `SELECT u.name as staff_name, u.epf_number,
                    NVL(SUM(NVL(t.count, 0)), 0) as sum_count,
                    MAX(s.daily_target) * 22 as total_target,
                    CASE WHEN MAX(s.daily_target) = 0 THEN 0
                         ELSE GREATEST(0, NVL(SUM(NVL(t.count, 0)), 0) - MAX(s.daily_target) * 22)
                    END as extra_units,
                    CASE WHEN MAX(s.daily_target) * 22 > 0
                         THEN ROUND(NVL(SUM(NVL(t.count, 0)), 0) / (MAX(s.daily_target) * 22) * 100, 1)
                         ELSE 0 END as achievement_pct
                 FROM tasks t
                 JOIN sites s ON t.site_id = s.id
                 JOIN users u ON t.staff_id = u.id
                 WHERE t.site_id = :site_id
                   AND t.ot_type = 'target_based'
                   AND t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND t.task_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
                 GROUP BY u.name, u.epf_number
                 ORDER BY achievement_pct DESC`,
                { site_id: Number(site_id), d_from: from, d_to: to }
            ),
            // Site info
            execute<any>(
                `SELECT id, site_no, name, daily_target, ot_type FROM sites WHERE id = :site_id`,
                { site_id: Number(site_id) }
            )
        ]);

        const siteInfo = siteInfoRes.rows?.[0] || {};
        const staffRows = (staffRes.rows || []).map((r: any) => ({
            staff_name: r.STAFF_NAME,
            epf_number: r.EPF_NUMBER || '-',
            sum_count: Number(r.SUM_COUNT),
            total_target: Number(r.TOTAL_TARGET),
            extra_units: Number(r.EXTRA_UNITS),
            achievement_pct: Number(r.ACHIEVEMENT_PCT)
        }));

        const dailyRows = (dailyRes.rows || []).map((r: any) => ({
            date: r.TASK_DATE,
            actual: Number(r.ACTUAL_COUNT),
            target: Number(r.TARGET_COUNT)
        }));

        const totalActual = staffRows.reduce((s: number, r: any) => s + r.sum_count, 0);
        const totalTarget = staffRows.reduce((s: number, r: any) => s + r.total_target, 0);
        const totalExtra = staffRows.reduce((s: number, r: any) => s + r.extra_units, 0);
        const avgAchievement = staffRows.length > 0
            ? Math.round(staffRows.reduce((s: number, r: any) => s + r.achievement_pct, 0) / staffRows.length * 10) / 10
            : 0;

        res.json({
            dateRange: { from, to },
            siteInfo: {
                id: siteInfo.ID,
                site_no: siteInfo.SITE_NO,
                name: siteInfo.NAME,
                daily_target: Number(siteInfo.DAILY_TARGET) || 0,
                ot_type: siteInfo.OT_TYPE
            },
            summary: { totalActual, totalTarget, totalExtra, avgAchievement, staffCount: staffRows.length },
            dailyTrend: dailyRows,
            staffBreakdown: staffRows,
            overperformers: staffRows.filter((r: any) => r.achievement_pct >= 100).slice(0, 10),
            underperformers: staffRows.filter((r: any) => r.achievement_pct < 100).sort((a: any, b: any) => a.achievement_pct - b.achievement_pct).slice(0, 10)
        });
    } catch (error) {
        console.error('Site performance analysis error:', error);
        res.status(500).json({ message: 'Failed to fetch site performance analysis' });
    }
};

// ─── Site Profitability Analytics (by Service Type / Site Type / OT Type) ──

function groupBySiteKey(
    sites: any[],
    key: string
): { label: string; total_revenue: number; total_cost: number; net_profit: number; site_count: number }[] {
    const map: Record<string, any> = {};
    for (const s of sites) {
        const k = s[key] || 'Unset';
        if (!map[k]) map[k] = { label: k, total_revenue: 0, total_cost: 0, net_profit: 0, site_count: 0 };
        map[k].total_revenue += s.total_revenue;
        map[k].total_cost    += s.total_cost;
        map[k].net_profit    += s.net_profit;
        map[k].site_count++;
    }
    return Object.values(map).sort((a, b) => b.net_profit - a.net_profit);
}

export const getSiteProfitability = async (req: Request, res: Response) => {
    try {
        const result = await execute<any>(
            `SELECT
                s.id                                                                        AS site_id,
                s.site_no,
                s.name                                                                      AS site_name,
                NVL(s.service_type, 'Unset')                                                AS service_type,
                NVL(s.site_type,    'Unset')                                                AS site_type,
                NVL(s.ot_type,      'time_based')                                           AS ot_type,
                COUNT(pa.id)                                                                AS invoice_count,
                NVL(SUM(pa.invoice_price),                                              0)  AS total_revenue,
                NVL(SUM(pa.cost_variant_amount + pa.salary_ot_amount + pa.expense_cost), 0) AS total_cost,
                NVL(SUM(pa.invoice_price - pa.cost_variant_amount
                        - pa.salary_ot_amount - pa.expense_cost),                       0)  AS net_profit
             FROM sites s
             LEFT JOIN profit_amount pa ON pa.site_id = s.id
             GROUP BY s.id, s.site_no, s.name, s.service_type, s.site_type, s.ot_type
             ORDER BY net_profit DESC`,
            {}
        );

        const sites = (result.rows || []).map((r: any) => {
            const revenue = Number(r.TOTAL_REVENUE || 0);
            const cost    = Number(r.TOTAL_COST    || 0);
            const profit  = Number(r.NET_PROFIT    || 0);
            return {
                site_id:       Number(r.SITE_ID),
                site_no:       r.SITE_NO,
                site_name:     r.SITE_NAME,
                service_type:  r.SERVICE_TYPE || 'Unset',
                site_type:     r.SITE_TYPE    || 'Unset',
                ot_type:       r.OT_TYPE      || 'time_based',
                invoice_count: Number(r.INVOICE_COUNT || 0),
                total_revenue: revenue,
                total_cost:    cost,
                net_profit:    profit,
                profit_margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0,
            };
        });

        const totals = {
            total_revenue:     sites.reduce((s: number, r: any) => s + r.total_revenue, 0),
            total_cost:        sites.reduce((s: number, r: any) => s + r.total_cost,    0),
            net_profit:        sites.reduce((s: number, r: any) => s + r.net_profit,    0),
            total_sites:       sites.length,
            profitable_count:  sites.filter((s: any) => s.net_profit > 0).length,
            loss_count:        sites.filter((s: any) => s.net_profit < 0).length,
            break_even_count:  sites.filter((s: any) => s.net_profit === 0).length,
        };

        res.json({
            sites,
            totals,
            byServiceType: groupBySiteKey(sites, 'service_type'),
            bySiteType:    groupBySiteKey(sites, 'site_type'),
            byOtType:      groupBySiteKey(sites, 'ot_type'),
        });
    } catch (err) {
        console.error('getSiteProfitability error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Invoice Business Model Analysis ────────────────────────────────────────

export const getInvoiceAnalysis = async (req: Request, res: Response) => {
    try {
        const [summaryRes, monthlyRes, siteRes, quarterlyRes] = await Promise.all([

            // Overall totals + cost breakdown
            execute<any>(
                `SELECT
                    COUNT(*)                                                                        AS total_invoices,
                    NVL(SUM(invoice_price), 0)                                                      AS total_revenue,
                    NVL(SUM(cost_variant_amount + salary_ot_amount + expense_cost), 0)              AS total_cost,
                    NVL(SUM(invoice_price - cost_variant_amount - salary_ot_amount - expense_cost), 0) AS net_profit,
                    NVL(AVG(invoice_price), 0)                                                      AS avg_invoice_value,
                    NVL(SUM(cost_variant_amount), 0)                                                AS total_cost_variant,
                    NVL(SUM(salary_ot_amount),    0)                                                AS total_salary_ot,
                    NVL(SUM(expense_cost),        0)                                                AS total_expense,
                    COUNT(DISTINCT site_id)                                                         AS site_count
                 FROM profit_amount`,
                {}
            ),

            // Monthly trend
            execute<any>(
                `SELECT
                    TO_CHAR(created_at, 'YYYY-MM')                                                  AS month,
                    COUNT(*)                                                                        AS invoice_count,
                    NVL(SUM(invoice_price), 0)                                                      AS total_revenue,
                    NVL(SUM(cost_variant_amount + salary_ot_amount + expense_cost), 0)              AS total_cost,
                    NVL(SUM(invoice_price - cost_variant_amount - salary_ot_amount - expense_cost), 0) AS net_profit,
                    NVL(SUM(cost_variant_amount), 0)                                                AS total_cost_variant,
                    NVL(SUM(salary_ot_amount),    0)                                                AS total_salary_ot,
                    NVL(SUM(expense_cost),        0)                                                AS total_expense
                 FROM profit_amount
                 GROUP BY TO_CHAR(created_at, 'YYYY-MM')
                 ORDER BY month`,
                {}
            ),

            // Per-site breakdown
            execute<any>(
                `SELECT
                    pa.site_no,
                    pa.site_name,
                    NVL(s.service_type, 'Unset')                                                    AS service_type,
                    NVL(s.site_type,    'Unset')                                                    AS site_type,
                    NVL(s.ot_type,      'time_based')                                               AS ot_type,
                    COUNT(pa.id)                                                                    AS invoice_count,
                    NVL(SUM(pa.invoice_price), 0)                                                   AS total_revenue,
                    NVL(SUM(pa.cost_variant_amount + pa.salary_ot_amount + pa.expense_cost), 0)     AS total_cost,
                    NVL(SUM(pa.invoice_price - pa.cost_variant_amount - pa.salary_ot_amount - pa.expense_cost), 0) AS net_profit,
                    NVL(SUM(pa.cost_variant_amount), 0)                                             AS total_cost_variant,
                    NVL(SUM(pa.salary_ot_amount),    0)                                             AS total_salary_ot,
                    NVL(SUM(pa.expense_cost),        0)                                             AS total_expense,
                    MIN(TO_CHAR(pa.date_from, 'YYYY-MM-DD'))                                        AS first_invoice_date,
                    MAX(TO_CHAR(pa.date_to,   'YYYY-MM-DD'))                                        AS last_invoice_date
                 FROM profit_amount pa
                 LEFT JOIN sites s ON s.id = pa.site_id
                 GROUP BY pa.site_no, pa.site_name, s.service_type, s.site_type, s.ot_type
                 ORDER BY total_revenue DESC`,
                {}
            ),

            // Quarterly trend
            execute<any>(
                `SELECT
                    TO_CHAR(created_at, 'YYYY') || '-Q' || TO_CHAR(created_at, 'Q') AS quarter,
                    COUNT(*)                                                          AS invoice_count,
                    NVL(SUM(invoice_price), 0)                                        AS total_revenue,
                    NVL(SUM(cost_variant_amount + salary_ot_amount + expense_cost), 0) AS total_cost,
                    NVL(SUM(invoice_price - cost_variant_amount - salary_ot_amount - expense_cost), 0) AS net_profit
                 FROM profit_amount
                 GROUP BY TO_CHAR(created_at, 'YYYY') || '-Q' || TO_CHAR(created_at, 'Q')
                 ORDER BY quarter`,
                {}
            ),
        ]);

        const s = summaryRes.rows?.[0] || {};
        const totalRevenue = Number(s.TOTAL_REVENUE  || 0);
        const totalCost    = Number(s.TOTAL_COST     || 0);
        const netProfit    = Number(s.NET_PROFIT     || 0);
        const cvTotal      = Number(s.TOTAL_COST_VARIANT || 0);
        const soTotal      = Number(s.TOTAL_SALARY_OT    || 0);
        const expTotal     = Number(s.TOTAL_EXPENSE      || 0);

        const sites = (siteRes.rows || []).map((r: any) => {
            const rev    = Number(r.TOTAL_REVENUE || 0);
            const cost   = Number(r.TOTAL_COST    || 0);
            const profit = Number(r.NET_PROFIT    || 0);
            return {
                site_no:        r.SITE_NO,
                site_name:      r.SITE_NAME,
                service_type:   r.SERVICE_TYPE || 'Unset',
                site_type:      r.SITE_TYPE    || 'Unset',
                ot_type:        r.OT_TYPE      || 'time_based',
                invoice_count:  Number(r.INVOICE_COUNT  || 0),
                total_revenue:  rev,
                total_cost:     cost,
                net_profit:     profit,
                cost_variant:   Number(r.TOTAL_COST_VARIANT || 0),
                salary_ot:      Number(r.TOTAL_SALARY_OT    || 0),
                expense:        Number(r.TOTAL_EXPENSE      || 0),
                profit_margin:  rev > 0 ? Math.round((profit / rev) * 1000) / 10 : 0,
                first_invoice:  r.FIRST_INVOICE_DATE,
                last_invoice:   r.LAST_INVOICE_DATE,
            };
        });

        res.json({
            summary: {
                total_invoices:    Number(s.TOTAL_INVOICES    || 0),
                total_revenue:     totalRevenue,
                total_cost:        totalCost,
                net_profit:        netProfit,
                avg_invoice_value: Number(s.AVG_INVOICE_VALUE || 0),
                profit_margin:     totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0,
                site_count:        Number(s.SITE_COUNT        || 0),
                total_cost_variant: cvTotal,
                total_salary_ot:    soTotal,
                total_expense:      expTotal,
                profitable_sites:   sites.filter(x => x.net_profit > 0).length,
                loss_sites:         sites.filter(x => x.net_profit < 0).length,
            },
            // Cost structure as % of total revenue (for pie/donut)
            costStructure: [
                { name: 'Cost Variants',  value: cvTotal,      pct: totalRevenue > 0 ? Math.round((cvTotal    / totalRevenue) * 1000) / 10 : 0, fill: '#f59e0b' },
                { name: 'Salary + OT',    value: soTotal,      pct: totalRevenue > 0 ? Math.round((soTotal    / totalRevenue) * 1000) / 10 : 0, fill: '#8b5cf6' },
                { name: 'Expense',        value: expTotal,     pct: totalRevenue > 0 ? Math.round((expTotal   / totalRevenue) * 1000) / 10 : 0, fill: '#64748b' },
                { name: 'Net Profit',     value: netProfit > 0 ? netProfit : 0, pct: totalRevenue > 0 ? Math.round((Math.max(netProfit, 0) / totalRevenue) * 1000) / 10 : 0, fill: '#10b981' },
            ],
            monthlyTrend: (monthlyRes.rows || []).map((r: any) => ({
                month:          r.MONTH,
                invoice_count:  Number(r.INVOICE_COUNT  || 0),
                total_revenue:  Number(r.TOTAL_REVENUE  || 0),
                total_cost:     Number(r.TOTAL_COST     || 0),
                net_profit:     Number(r.NET_PROFIT     || 0),
                cost_variant:   Number(r.TOTAL_COST_VARIANT || 0),
                salary_ot:      Number(r.TOTAL_SALARY_OT    || 0),
                expense:        Number(r.TOTAL_EXPENSE      || 0),
            })),
            quarterlyTrend: (quarterlyRes.rows || []).map((r: any) => ({
                quarter:       r.QUARTER,
                invoice_count: Number(r.INVOICE_COUNT || 0),
                total_revenue: Number(r.TOTAL_REVENUE || 0),
                total_cost:    Number(r.TOTAL_COST    || 0),
                net_profit:    Number(r.NET_PROFIT    || 0),
            })),
            sites,
            topByRevenue: [...sites].sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 8),
            topByProfit:  [...sites].sort((a, b) => b.net_profit    - a.net_profit).slice(0, 5),
            lossSites:    [...sites].filter(x => x.net_profit < 0).sort((a, b) => a.net_profit - b.net_profit),
        });
    } catch (err) {
        console.error('getInvoiceAnalysis error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Site Snapshot (full picture for one site) ──────────────────────────────

export const getSiteSnapshot = async (req: Request, res: Response) => {
    const { site_id } = req.params;
    if (!site_id) return res.status(400).json({ message: 'site_id is required' });
    const sid = Number(site_id);

    try {
        const [
            siteRes,
            staffRes,
            taskTypeRes,
            monthlyTaskRes,
            invoiceRes,
            monthlyInvRes,
            otTargetRes,
            otTimeRes,
        ] = await Promise.all([

            // 1. Site info + supervisor
            execute<any>(
                `SELECT s.id, s.site_no, s.name, s.ot_type, s.service_type, s.site_type,
                        s.daily_target, s.task_invoice_price,
                        u.name AS supervisor_name
                 FROM sites s
                 LEFT JOIN users u ON u.id = s.supervisor_id
                 WHERE s.id = :sid`,
                { sid }
            ),

            // 2. Staff list
            execute<any>(
                `SELECT u.id, u.name, u.epf_number, u.role, u.status,
                        NVL(u.basic_salary,0) AS basic_salary,
                        NVL(u.fix_salary,0)   AS fix_salary
                 FROM users u
                 WHERE u.site_id = :sid
                 ORDER BY u.role, u.name`,
                { sid }
            ),

            // 3. Task-type breakdown (last 12 months)
            // Fetch both row_count (for time_based) and sum_count (for target_based)
            execute<any>(
                `SELECT LOWER(TRIM(t.task_description)) AS task_type,
                        COUNT(*)                          AS row_count,
                        NVL(SUM(NVL(t.count,0)),0)        AS sum_count
                 FROM tasks t
                 WHERE t.site_id  = :sid
                   AND t.task_date >= ADD_MONTHS(TRUNC(SYSDATE,'MM'), -11)
                 GROUP BY LOWER(TRIM(t.task_description))
                 ORDER BY row_count DESC`,
                { sid }
            ),

            // 4. Monthly task activity (last 12 months)
            // task_records = COUNT(*) used for time_based; sum_units = SUM(count) for target_based
            execute<any>(
                `SELECT TO_CHAR(t.task_date,'YYYY-MM')   AS month,
                        COUNT(*)                          AS task_records,
                        NVL(SUM(NVL(t.count,0)),0)        AS sum_units,
                        COUNT(DISTINCT t.staff_id)         AS workers
                 FROM tasks t
                 WHERE t.site_id  = :sid
                   AND t.task_date >= ADD_MONTHS(TRUNC(SYSDATE,'MM'), -11)
                 GROUP BY TO_CHAR(t.task_date,'YYYY-MM')
                 ORDER BY month`,
                { sid }
            ),

            // 5. Invoice history (all time, newest first)
            execute<any>(
                `SELECT pa.id, pa.date_from, pa.date_to,
                        pa.invoice_price                                                      AS revenue,
                        pa.cost_variant_amount + pa.salary_ot_amount + pa.expense_cost       AS total_cost,
                        pa.invoice_price - pa.cost_variant_amount
                            - pa.salary_ot_amount - pa.expense_cost                          AS profit,
                        pa.cost_variant_amount, pa.salary_ot_amount, pa.expense_cost,
                        pa.created_at
                 FROM profit_amount pa
                 WHERE pa.site_id = :sid
                 ORDER BY pa.created_at DESC`,
                { sid }
            ),

            // 6. Monthly invoice trend (all time)
            execute<any>(
                `SELECT TO_CHAR(pa.created_at,'YYYY-MM')                                     AS month,
                        COUNT(*)                                                              AS invoice_count,
                        NVL(SUM(pa.invoice_price),0)                                         AS revenue,
                        NVL(SUM(pa.cost_variant_amount+pa.salary_ot_amount+pa.expense_cost),0) AS cost,
                        NVL(SUM(pa.invoice_price - pa.cost_variant_amount
                            - pa.salary_ot_amount - pa.expense_cost),0)                      AS profit
                 FROM profit_amount pa
                 WHERE pa.site_id = :sid
                 GROUP BY TO_CHAR(pa.created_at,'YYYY-MM')
                 ORDER BY month`,
                { sid }
            ),

            // 7. Target-based OT paid (payroll_saved_records uses site_no, not site_id)
            execute<any>(
                `SELECT NVL(SUM(pr.extra_payment),0) AS total_ot,
                        COUNT(DISTINCT pr.staff_id)   AS staff_paid
                 FROM payroll_saved_records pr
                 WHERE pr.site_no = (SELECT site_no FROM sites WHERE id = :sid)`,
                { sid }
            ),

            // 8. Time-based OT paid (custom_ot_records uses site_no, not site_id)
            execute<any>(
                `SELECT NVL(SUM(cor.total_payment),0) AS total_ot,
                        COUNT(DISTINCT cor.staff_id)   AS staff_paid
                 FROM custom_ot_records cor
                 WHERE cor.site_no = (SELECT site_no FROM sites WHERE id = :sid)`,
                { sid }
            ),
        ]);

        const site = siteRes.rows?.[0];
        if (!site) return res.status(404).json({ message: 'Site not found' });

        // time_based sites: count column is never filled (only in_time/out_time).
        // daily_target = 0 also signals no target → use row COUNT as the unit metric.
        const isTimeBased = site.OT_TYPE === 'time_based' || Number(site.DAILY_TARGET || 0) === 0;

        const staff = (staffRes.rows || []).map((r: any) => ({
            id:           Number(r.ID),
            name:         r.NAME,
            epf_number:   r.EPF_NUMBER,
            role:         r.ROLE,
            status:       r.STATUS,
            basic_salary: Number(r.BASIC_SALARY),
            fix_salary:   Number(r.FIX_SALARY),
        }));

        const activeStaff   = staff.filter((s: any) => s.status === 'active');
        const inactiveStaff = staff.filter((s: any) => s.status !== 'active');
        const totalSalary   = activeStaff.reduce((s: number, u: any) => s + u.basic_salary, 0);

        const taskTypes = (taskTypeRes.rows || []).map((r: any) => {
            const rowCount = Number(r.ROW_COUNT || 0);
            const sumCount = Number(r.SUM_COUNT || 0);
            return {
                task_type:   r.TASK_TYPE,
                records:     rowCount,
                // time_based: each row = 1 staff-day → use row count
                // target_based: sum of the count column
                total_units: isTimeBased ? rowCount : sumCount,
            };
        });

        const monthlyTasks = (monthlyTaskRes.rows || []).map((r: any) => {
            const taskRec = Number(r.TASK_RECORDS || 0);
            const sumUnits = Number(r.SUM_UNITS || 0);
            return {
                month:        r.MONTH,
                task_records: taskRec,
                total_units:  isTimeBased ? taskRec : sumUnits,
                workers:      Number(r.WORKERS || 0),
            };
        });

        const invoices = (invoiceRes.rows || []).map((r: any) => ({
            id:                   Number(r.ID),
            date_from:            r.DATE_FROM,
            date_to:              r.DATE_TO,
            revenue:              Number(r.REVENUE),
            total_cost:           Number(r.TOTAL_COST),
            profit:               Number(r.PROFIT),
            cost_variant_amount:  Number(r.COST_VARIANT_AMOUNT),
            salary_ot_amount:     Number(r.SALARY_OT_AMOUNT),
            expense_cost:         Number(r.EXPENSE_COST),
            created_at:           r.CREATED_AT,
        }));

        const monthlyInvoices = (monthlyInvRes.rows || []).map((r: any) => ({
            month:         r.MONTH,
            invoice_count: Number(r.INVOICE_COUNT),
            revenue:       Number(r.REVENUE),
            cost:          Number(r.COST),
            profit:        Number(r.PROFIT),
        }));

        const totalRevenue  = invoices.reduce((s: number, r: any) => s + r.revenue, 0);
        const totalCost     = invoices.reduce((s: number, r: any) => s + r.total_cost, 0);
        const netProfit     = totalRevenue - totalCost;
        const profitMargin  = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;
        const avgInvoice    = invoices.length > 0 ? Math.round(totalRevenue / invoices.length) : 0;

        const targetOT = Number(otTargetRes.rows?.[0]?.TOTAL_OT || 0);
        const timeOT   = Number(otTimeRes.rows?.[0]?.TOTAL_OT   || 0);

        res.json({
            site: {
                id:               Number(site.ID),
                site_no:          site.SITE_NO,
                name:             site.NAME,
                ot_type:          site.OT_TYPE || 'time_based',
                service_type:     site.SERVICE_TYPE || '—',
                site_type:        site.SITE_TYPE    || '—',
                daily_target:     Number(site.DAILY_TARGET     || 0),
                task_invoice_price: Number(site.TASK_INVOICE_PRICE || 0),
                supervisor_name:  site.SUPERVISOR_NAME || '—',
            },
            workforce: {
                total:        staff.length,
                active:       activeStaff.length,
                inactive:     inactiveStaff.length,
                total_salary: totalSalary,
                staff,
            },
            taskActivity: {
                isTimeBased,
                taskTypes,
                monthlyTasks,
                totalTaskRecords: monthlyTasks.reduce((s: number, r: any) => s + r.task_records, 0),
                totalUnits:       monthlyTasks.reduce((s: number, r: any) => s + r.total_units, 0),
            },
            financials: {
                totalRevenue,
                totalCost,
                netProfit,
                profitMargin,
                avgInvoice,
                invoiceCount: invoices.length,
                targetOtPaid: targetOT,
                timeOtPaid:   timeOT,
                totalOtPaid:  targetOT + timeOT,
            },
            invoices,
            monthlyInvoices,
        });

    } catch (err) {
        console.error('getSiteSnapshot error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Time-Based Site Performance Analysis ────────────────────────────────────

export const getTimeSitePerformance = async (req: Request, res: Response) => {
    const { site_id, date_from, date_to } = req.query;
    const from = (typeof date_from === 'string' ? date_from : undefined) ?? new Date(new Date().setDate(1)).toISOString().slice(0, 10);
    const to   = (typeof date_to   === 'string' ? date_to   : undefined) ?? new Date().toISOString().slice(0, 10);
    if (!site_id) return res.status(400).json({ message: 'site_id is required' });

    try {
        const sid = Number(site_id);

        const [siteRes, dailyRes, staffRes, taskTypeRes, monthlyRes, otRes] = await Promise.all([

            // 1. Site info + supervisor
            execute<any>(
                `SELECT s.id, s.site_no, s.name, s.ot_type, s.service_type, s.site_type,
                        s.daily_target, u.name AS supervisor_name
                 FROM sites s LEFT JOIN users u ON u.id = s.supervisor_id
                 WHERE s.id = :sid`,
                { sid }
            ),

            // 2. Daily task records + unique workers + avg hours + total count
            execute<any>(
                `SELECT TO_CHAR(t.task_date, 'YYYY-MM-DD') AS task_date,
                        COUNT(*)                            AS task_records,
                        COUNT(DISTINCT t.staff_id)          AS unique_workers,
                        SUM(NVL(t.count, 0))                AS total_count,
                        ROUND(AVG(
                            CASE WHEN t.in_time IS NOT NULL AND t.out_time IS NOT NULL
                            THEN (TO_NUMBER(SUBSTR(t.out_time,1,2)) + TO_NUMBER(SUBSTR(t.out_time,4,2))/60)
                               - (TO_NUMBER(SUBSTR(t.in_time,1,2))  + TO_NUMBER(SUBSTR(t.in_time,4,2))/60)
                            ELSE NULL END
                        ), 2) AS avg_hours
                 FROM tasks t
                 WHERE t.site_id = :sid
                   AND t.ot_type IN ('time_based', 'staff_outsource')
                   AND t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND t.task_date <= TO_DATE(:d_to,   'YYYY-MM-DD')
                 GROUP BY TO_CHAR(t.task_date, 'YYYY-MM-DD')
                 ORDER BY task_date`,
                { sid, d_from: from, d_to: to }
            ),

            // 3. Per-staff: days worked, task records, avg hours, total count
            execute<any>(
                `SELECT u.name          AS staff_name,
                        u.epf_number,
                        COUNT(DISTINCT t.task_date)                   AS days_worked,
                        COUNT(*)                                       AS task_records,
                        SUM(NVL(t.count, 0))                          AS total_count,
                        COUNT(CASE WHEN t.in_time IS NOT NULL THEN 1 END) AS records_with_time,
                        ROUND(AVG(
                            CASE WHEN t.in_time IS NOT NULL AND t.out_time IS NOT NULL
                            THEN (TO_NUMBER(SUBSTR(t.out_time,1,2)) + TO_NUMBER(SUBSTR(t.out_time,4,2))/60)
                               - (TO_NUMBER(SUBSTR(t.in_time,1,2))  + TO_NUMBER(SUBSTR(t.in_time,4,2))/60)
                            ELSE NULL END
                        ), 2) AS avg_hours
                 FROM tasks t JOIN users u ON t.staff_id = u.id
                 WHERE t.site_id = :sid
                   AND t.ot_type IN ('time_based', 'staff_outsource')
                   AND t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND t.task_date <= TO_DATE(:d_to,   'YYYY-MM-DD')
                 GROUP BY u.name, u.epf_number
                 ORDER BY days_worked DESC, task_records DESC`,
                { sid, d_from: from, d_to: to }
            ),

            // 4. Task type / activity breakdown
            execute<any>(
                `SELECT LOWER(TRIM(t.task_description)) AS task_type,
                        COUNT(*)                        AS records,
                        COUNT(DISTINCT t.staff_id)      AS staff_count,
                        COUNT(DISTINCT t.task_date)     AS day_count
                 FROM tasks t
                 WHERE t.site_id = :sid
                   AND t.ot_type IN ('time_based', 'staff_outsource')
                   AND t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND t.task_date <= TO_DATE(:d_to,   'YYYY-MM-DD')
                 GROUP BY LOWER(TRIM(t.task_description))
                 ORDER BY records DESC`,
                { sid, d_from: from, d_to: to }
            ),

            // 5. Monthly trend
            execute<any>(
                `SELECT TO_CHAR(t.task_date, 'YYYY-MM') AS month,
                        COUNT(*)                         AS task_records,
                        COUNT(DISTINCT t.staff_id)       AS workers,
                        COUNT(DISTINCT t.task_date)      AS working_days
                 FROM tasks t
                 WHERE t.site_id = :sid
                   AND t.ot_type IN ('time_based', 'staff_outsource')
                   AND t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
                   AND t.task_date <= TO_DATE(:d_to,   'YYYY-MM-DD')
                 GROUP BY TO_CHAR(t.task_date, 'YYYY-MM')
                 ORDER BY month`,
                { sid, d_from: from, d_to: to }
            ),

            // 6. Custom OT records for this site
            execute<any>(
                `SELECT cor.staff_name, cor.epf_number,
                        TO_CHAR(cor.date_from,'YYYY-MM-DD') AS date_from,
                        TO_CHAR(cor.date_to,  'YYYY-MM-DD') AS date_to,
                        cor.total_extra_hours, cor.total_adjusted_hours,
                        cor.ot_rate, cor.total_payment,
                        cor.calculation_type,
                        TO_CHAR(cor.saved_at,'YYYY-MM-DD HH24:MI') AS saved_at
                 FROM custom_ot_records cor
                 WHERE cor.site_no = (SELECT site_no FROM sites WHERE id = :sid)
                 ORDER BY cor.saved_at DESC
                 FETCH FIRST 100 ROWS ONLY`,
                { sid }
            ),
        ]);

        const siteRow = siteRes.rows?.[0];
        if (!siteRow) return res.status(404).json({ message: 'Site not found' });

        const siteInfo = {
            id:              Number(siteRow.ID),
            site_no:         siteRow.SITE_NO,
            name:            siteRow.NAME,
            ot_type:         siteRow.OT_TYPE || 'time_based',
            service_type:    siteRow.SERVICE_TYPE || '—',
            site_type:       siteRow.SITE_TYPE    || '—',
            supervisor_name: siteRow.SUPERVISOR_NAME || '—',
        };

        const daily = (dailyRes.rows || []).map((r: any) => ({
            date:           r.TASK_DATE,
            task_records:   Number(r.TASK_RECORDS),
            unique_workers: Number(r.UNIQUE_WORKERS),
            total_count:    Number(r.TOTAL_COUNT || 0),
            avg_hours:      r.AVG_HOURS !== null && r.AVG_HOURS !== undefined ? Number(r.AVG_HOURS) : null,
        }));

        const staff = (staffRes.rows || []).map((r: any) => ({
            staff_name:        r.STAFF_NAME,
            epf_number:        r.EPF_NUMBER || '—',
            days_worked:       Number(r.DAYS_WORKED),
            task_records:      Number(r.TASK_RECORDS),
            total_count:       Number(r.TOTAL_COUNT || 0),
            records_with_time: Number(r.RECORDS_WITH_TIME || 0),
            avg_hours:         r.AVG_HOURS !== null && r.AVG_HOURS !== undefined ? Number(r.AVG_HOURS) : null,
        }));

        const taskTypes = (taskTypeRes.rows || []).map((r: any) => ({
            task_type:   r.TASK_TYPE || '(unspecified)',
            records:     Number(r.RECORDS),
            staff_count: Number(r.STAFF_COUNT),
            day_count:   Number(r.DAY_COUNT),
        }));

        const monthly = (monthlyRes.rows || []).map((r: any) => ({
            month:        r.MONTH,
            task_records: Number(r.TASK_RECORDS),
            workers:      Number(r.WORKERS),
            working_days: Number(r.WORKING_DAYS),
        }));

        const otRecords = (otRes.rows || []).map((r: any) => ({
            staff_name:           r.STAFF_NAME,
            epf_number:           r.EPF_NUMBER || '—',
            date_from:            r.DATE_FROM,
            date_to:              r.DATE_TO,
            total_extra_hours:    Number(r.TOTAL_EXTRA_HOURS    || 0),
            total_adjusted_hours: Number(r.TOTAL_ADJUSTED_HOURS || 0),
            ot_rate:              Number(r.OT_RATE              || 0),
            total_payment:        Number(r.TOTAL_PAYMENT        || 0),
            calculation_type:     r.CALCULATION_TYPE || '—',
            saved_at:             r.SAVED_AT,
        }));

        const totalTaskRecords = daily.reduce((s: number, d: any) => s + d.task_records, 0);
        const totalOtPaid      = otRecords.reduce((s: number, o: any) => s + o.total_payment, 0);
        const activeDays       = daily.length;
        const avgDailyWorkers  = activeDays > 0
            ? Math.round(daily.reduce((s: number, d: any) => s + d.unique_workers, 0) / activeDays * 10) / 10
            : 0;
        const peakDay          = daily.length > 0
            ? daily.reduce((max: any, d: any) => d.unique_workers > max.unique_workers ? d : max, daily[0])
            : null;
        const hasTimeData      = staff.some((s: any) => s.avg_hours !== null);

        res.json({
            dateRange: { from, to },
            siteInfo,
            summary: {
                totalTaskRecords,
                totalOtPaid,
                uniqueStaff:      staff.length,
                activeDays,
                avgDailyWorkers,
                peakWorkers:      peakDay?.unique_workers ?? 0,
                peakDate:         peakDay?.date ?? null,
                hasTimeData,
            },
            daily,
            staff,
            taskTypes,
            monthly,
            otRecords,
        });

    } catch (err) {
        console.error('getTimeSitePerformance error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
