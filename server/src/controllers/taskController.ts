import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import { getDayType, calculateTimeBasedExtra, calculateTimeBasedPayment } from '../utils/payrollUtils';

const DEFAULT_OUT_TIME_TC = '17:00';
const DEFAULT_IN_TIME_TC  = '08:30';

// ─── Attendance Sync Helper ──────────────────────────────────────────────────
async function syncAttendance(
    site_id: number,
    staff_id: number,
    task_date: string,
    ot_type: string,
    in_time: string | null,
    out_time: string | null
) {
    try {
        if (ot_type === 'time_based') {
            await execute(
                `INSERT INTO attendance (site_id, staff_id, attendance_date, in_time, out_time)
                 VALUES (:site_id, :staff_id, :att_date, :in_time, :out_time)
                 ON CONFLICT (staff_id, site_id, attendance_date) DO UPDATE
                 SET in_time = EXCLUDED.in_time, out_time = EXCLUDED.out_time, updated_at = CURRENT_TIMESTAMP`,
                { site_id, staff_id, att_date: task_date, in_time: in_time || null, out_time: out_time || null }
            );
        } else if (ot_type === 'target_based') {
            await execute(
                `INSERT INTO attendance (site_id, staff_id, attendance_date, in_time, out_time)
                 VALUES (:site_id, :staff_id, :att_date, :in_time, :out_time)
                 ON CONFLICT (staff_id, site_id, attendance_date) DO UPDATE
                 SET in_time = EXCLUDED.in_time, out_time = EXCLUDED.out_time, updated_at = CURRENT_TIMESTAMP`,
                { site_id, staff_id, att_date: task_date, in_time: in_time || null, out_time: out_time || null }
            );
        } else {
            await execute(
                `INSERT INTO attendance (site_id, staff_id, attendance_date)
                 VALUES (:site_id, :staff_id, :att_date)
                 ON CONFLICT (staff_id, site_id, attendance_date) DO NOTHING`,
                { site_id, staff_id, att_date: task_date }
            );
        }
    } catch (err) {
        console.error('syncAttendance error (non-fatal):', err);
    }
}

export const getTasks = async (req: Request, res: Response) => {
    const { site_no, date_from, date_to, staff_id } = req.query;
    const userRole = (req as any).user.role;
    const userId = (req as any).user.id;

    try {
        let query = `
      SELECT t.*, u.name as staff_name, s.site_no, s.name as site_name
      FROM tasks t
      JOIN sites s ON t.site_id = s.id
      JOIN users u ON t.staff_id = u.id
      WHERE 1=1
    `;
        const params: any = {};

        if (userRole === 'supervisor') {
            query += ` AND s.supervisor_id = :userId`;
            params.userId = userId;
        } else if (userRole === 'staff') {
            query += ` AND t.staff_id = :userId`;
            params.userId = userId;
        }

        if (site_no) {
            query += ` AND s.site_no = :site_no`;
            params.site_no = site_no;
        }
        if (staff_id) {
            query += ` AND t.staff_id = :staff_id`;
            params.staff_id = staff_id;
        }
        if (date_from) {
            query += ` AND t.task_date >= :date_from`;
            params.date_from = date_from;
        }
        if (date_to) {
            query += ` AND t.task_date <= :date_to`;
            params.date_to = date_to;
        }

        query += ` ORDER BY t.task_date DESC, u.name ASC`;

        const result = await execute<any>(query, params);
        res.json(result.rows || []);
    } catch (err) {
        console.error('getTasks error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const createTask = async (req: Request, res: Response) => {
    const { site_id, staff_id, task_description, invoice_price, ot_type, target, pay_unit_price, task_date, count, in_time, out_time } = req.body;
    try {
        await execute(
            `INSERT INTO tasks (site_id, staff_id, task_description, invoice_price, ot_type, target, pay_unit_price, task_date, count, in_time, out_time)
       VALUES (:site_id, :staff_id, :task_description, :invoice_price, :ot_type, :target, :pay_unit_price, :task_date, :count, :in_time, :out_time)`,
            {
                site_id, staff_id, task_description, invoice_price, ot_type, target, pay_unit_price, task_date, count,
                in_time: in_time || null, out_time: out_time || null
            }
        );
        await syncAttendance(Number(site_id), Number(staff_id), task_date, ot_type, in_time || null, out_time || null);
        res.status(201).json({ message: 'Task created' });
    } catch (err) {
        console.error('createTask error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateTask = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { task_description, count, pay_unit_price, invoice_price, in_time, out_time, task_date, target } = req.body;

    try {
        await execute(
            `UPDATE tasks
           SET task_description = :task_description,
               count = :count,
               pay_unit_price = :pay_unit_price,
               invoice_price = :invoice_price,
               in_time = :in_time,
               out_time = :out_time,
               target = :target,
               task_date = :task_date,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = :id`,
            { task_description, count, pay_unit_price, invoice_price, in_time, out_time, target, task_date, id: String(id) }
        );
        const taskRes = await execute<any>(
            `SELECT t.site_id, t.staff_id, t.ot_type FROM tasks t WHERE t.id = :id`,
            { id: String(id) }
        );
        const taskRow = taskRes.rows?.[0];
        if (taskRow && task_date) {
            await syncAttendance(
                Number(taskRow.SITE_ID),
                Number(taskRow.STAFF_ID),
                task_date,
                taskRow.OT_TYPE,
                in_time || null,
                out_time || null
            );
        }
        res.json({ message: 'Task updated' });
    } catch (err) {
        console.error('updateTask error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const bulkSaveTasks = async (req: Request, res: Response) => {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ message: 'Expected array' });

    try {
        for (const row of rows) {
            const { id, task_description, count, pay_unit_price, invoice_price, in_time, out_time, task_date } = row;
            if (!id) continue;
            const taskRes = await execute<any>(
                `SELECT site_id, staff_id, ot_type FROM tasks WHERE id = :id`,
                { id }
            );
            const taskRow = taskRes.rows?.[0];
            await execute(
                `UPDATE tasks
                 SET task_description = :task_description,
                     count = :count,
                     pay_unit_price = :pay_unit_price,
                     invoice_price = :invoice_price,
                     in_time = :in_time,
                     out_time = :out_time,
                     task_date = :task_date,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = :id`,
                { task_description, count, pay_unit_price, invoice_price, in_time, out_time, task_date, id }
            );
            if (taskRow && task_date) {
                await syncAttendance(
                    Number(taskRow.SITE_ID),
                    Number(taskRow.STAFF_ID),
                    task_date,
                    taskRow.OT_TYPE,
                    in_time || null,
                    out_time || null
                );
            }
        }
        res.json({ message: 'Bulk update complete' });
    } catch (err) {
        console.error('bulkSave error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteTask = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await execute(`DELETE FROM tasks WHERE id = :id`, { id: Number(id) });
        res.json({ message: 'Task deleted' });
    } catch (err) {
        console.error('deleteTask error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getDailyCountReport = async (req: Request, res: Response) => {
    const { date, site_id } = req.query;

    if (!date) {
        return res.status(400).json({ message: 'date is required' });
    }

    try {
        let query = `
            SELECT
                t.id,
                t.task_description,
                t.ot_type,
                t.in_time,
                t.out_time,
                t.invoice_price,
                t.pay_unit_price,
                t.task_date,
                (t.count) AS task_count,
                (t.target) AS task_target,
                u.name AS staff_name,
                s.site_no,
                s.name AS site_name
            FROM tasks t
            JOIN sites s ON t.site_id = s.id
            JOIN users u ON t.staff_id = u.id
            WHERE t.task_date = :task_date_param
        `;

        const params: any = { task_date_param: String(date) };

        if (site_id) {
            query += ` AND t.site_id = :site_id`;
            params.site_id = Number(site_id);
        }

        query += ` ORDER BY s.name, u.name, t.task_description`;

        const result = await execute<any>(query, params);
        res.json(result.rows || []);
    } catch (err: any) {
        console.error('getDailyCountReport error:', err?.message || err);
        res.status(500).json({ message: 'Server error', detail: err?.message });
    }
};

export const getTaskSummary = async (req: Request, res: Response) => {
    const { date, date_to, site_id } = req.query;

    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: 'date is required (YYYY-MM-DD)' });
    }
    if (date_to && typeof date_to === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(date_to)) {
        return res.status(400).json({ message: 'date_to must be YYYY-MM-DD' });
    }

    try {
        const dateFrom = date;
        const dateTo = date_to ? String(date_to) : dateFrom;

        let query = `
            SELECT t.id, t.site_id, t.staff_id, t.ot_type, t.target,
                   t.task_description, t.count, t.in_time, t.out_time,
                   t.invoice_price, t.pay_unit_price,
                   TO_CHAR(t.task_date, 'YYYY-MM-DD') as task_date,
                   u.name as staff_name, s.site_no, s.name as site_name, s.ot_type as site_ot_type
            FROM tasks t
            JOIN sites s ON t.site_id = s.id
            JOIN users u ON t.staff_id = u.id
            WHERE t.task_date BETWEEN :dateFrom AND :dateTo
        `;

        const params: any = { dateFrom, dateTo };

        if (site_id) {
            query += ` AND t.site_id = :site_id`;
            params.site_id = Number(site_id);
        }

        query += ` ORDER BY s.name, u.name, t.task_date`;

        const result = await execute<any>(query, params);
        const tasks = result.rows || [];

        const siteMap = new Map<string, any>();

        tasks.forEach((task: any) => {
            const siteKey = task.SITE_NO;
            if (!siteMap.has(siteKey)) {
                siteMap.set(siteKey, {
                    site_no: task.SITE_NO,
                    site_name: task.SITE_NAME,
                    site_ot_type: task.SITE_OT_TYPE,
                    staff_ids: new Set(),
                    total_count: 0,
                    total_hours: 0,
                    tasks: []
                });
            }

            const siteData = siteMap.get(siteKey);
            siteData.staff_ids.add(task.STAFF_ID);
            siteData.tasks.push(task);

            if (task.COUNT) {
                siteData.total_count += Number(task.COUNT) || 0;
            }

            if ((task.SITE_OT_TYPE === 'time_based' || task.SITE_OT_TYPE === 'staff_outsource') && task.IN_TIME && task.OUT_TIME) {
                const inTime = task.IN_TIME.split(':');
                const outTime = task.OUT_TIME.split(':');
                const inMinutes = parseInt(inTime[0]) * 60 + parseInt(inTime[1]);
                const outMinutes = parseInt(outTime[0]) * 60 + parseInt(outTime[1]);
                const hours = (outMinutes - inMinutes) / 60;
                if (hours > 0) {
                    siteData.total_hours += hours;
                }
            }
        });

        const aggregatedData = Array.from(siteMap.values()).map(site => ({
            ...site,
            total_staff: site.staff_ids.size,
            staff_ids: undefined
        }));

        res.json(aggregatedData);
    } catch (err) {
        console.error('getTaskSummary error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getTargetBaseReport = async (req: Request, res: Response) => {
    const { site_id, date_from, date_to } = req.query;

    if (!date_from || !date_to) {
        return res.status(400).json({ message: 'date_from and date_to are required' });
    }

    try {
        let query = `
            SELECT
                s.site_no,
                s.name as site_name,
                u.name as staff_name,
                SUM(t.count) as total_count
            FROM tasks t
            JOIN users u ON t.staff_id = u.id
            JOIN sites s ON t.site_id = s.id
            WHERE t.task_date BETWEEN :date_from AND :date_to
        `;

        const params: any = {
            date_from: String(date_from),
            date_to: String(date_to)
        };

        if (site_id) {
            query += ` AND t.site_id = :site_id`;
            params.site_id = Number(site_id);
        }

        query += ` GROUP BY s.id, s.site_no, s.name, u.id, u.name ORDER BY s.name, u.name`;

        const result = await execute<any>(query, params);
        res.json(result.rows || []);
    } catch (err) {
        console.error('getTargetBaseReport error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getOTAnalysisReport = async (req: Request, res: Response) => {
    const { site_id, date_from, date_to } = req.query;

    if (!date_from || !date_to) {
        return res.status(400).json({ message: 'date_from and date_to are required' });
    }

    try {
        // Fetch poya dates so getDayType can classify each record correctly
        const poyaResult = await execute<any>(
            `SELECT TO_CHAR(poya_date, 'YYYY-MM-DD') as poya_date FROM poya_days
             WHERE poya_date BETWEEN :date_from AND :date_to`,
            { date_from: String(date_from), date_to: String(date_to) }
        );
        const poyaDates = new Set<string>((poyaResult.rows || []).map((r: any) => String(r.POYA_DATE)));

        // One row per staff+date (min in_time / max out_time) to avoid double-counting OT on multi-task days
        let query = `
            SELECT
                s.site_no,
                s.name as site_name,
                u.id as staff_id,
                u.name as staff_name,
                COALESCE(u.ot_percentage, 0) as ot_percentage,
                COALESCE(u.basic_salary, 0) as basic_salary,
                TO_CHAR(t.task_date, 'YYYY-MM-DD') as task_date,
                MIN(t.in_time)  as in_time,
                MAX(t.out_time) as out_time
            FROM tasks t
            JOIN users u ON t.staff_id = u.id
            JOIN sites s ON t.site_id = s.id
            WHERE t.task_date BETWEEN :date_from AND :date_to
              AND t.out_time IS NOT NULL
              AND s.ot_type = 'time_based'
        `;

        const params: any = {
            date_from: String(date_from),
            date_to: String(date_to)
        };

        if (site_id) {
            query += ` AND s.id = :site_id`;
            params.site_id = Number(site_id);
        }

        query += ` GROUP BY s.site_no, s.name, u.id, u.name, u.ot_percentage, u.basic_salary, t.task_date`;
        query += ` ORDER BY s.name, u.name, t.task_date`;

        const result = await execute<any>(query, params);
        const rows = result.rows || [];

        const staffMap = new Map<string, any>();

        const accumulate = (staffId: number, siteNo: string, entry: any, extraHours: number) => {
            const key = `${staffId}_${siteNo}`;
            if (!staffMap.has(key)) staffMap.set(key, { ...entry, TOTAL_EXTRA_HRS: 0 });
            staffMap.get(key)!.TOTAL_EXTRA_HRS += extraHours;
        };

        // Time-based sites only — from tasks table
        rows.forEach((row: any) => {
            const dayType = getDayType(String(row.TASK_DATE), poyaDates);
            const extraHours = calculateTimeBasedExtra(
                String(row.OUT_TIME), DEFAULT_OUT_TIME_TC,
                row.IN_TIME ? String(row.IN_TIME) : undefined, DEFAULT_IN_TIME_TC,
                dayType
            );
            accumulate(Number(row.STAFF_ID), String(row.SITE_NO), {
                SITE_NO:       row.SITE_NO,
                SITE_NAME:     row.SITE_NAME,
                STAFF_NAME:    row.STAFF_NAME,
                OT_PERCENTAGE: Number(row.OT_PERCENTAGE) || 0,
                BASIC_SALARY:  Number(row.BASIC_SALARY)  || 0,
                IS_OUTSOURCE:  false,
            }, extraHours);
        });

        // Staff-outsource sites — from attendance table
        let attQuery = `
            SELECT
                s.site_no,
                s.name as site_name,
                u.id as staff_id,
                u.name as staff_name,
                COALESCE(u.basic_salary, 0) as basic_salary,
                TO_CHAR(a.attendance_date, 'YYYY-MM-DD') as attendance_date,
                a.in_time, a.out_time
            FROM attendance a
            JOIN users u ON u.id = a.staff_id
            JOIN sites s ON s.id = a.site_id
            WHERE s.ot_type = 'staff_outsource'
              AND a.attendance_date BETWEEN :date_from AND :date_to
              AND a.in_time IS NOT NULL AND a.out_time IS NOT NULL
        `;
        if (site_id) attQuery += ` AND s.id = :site_id`;
        attQuery += ` ORDER BY s.site_no, u.name, a.attendance_date`;

        const attResult = await execute<any>(attQuery, params);
        (attResult.rows || []).forEach((row: any) => {
            const dayType = getDayType(String(row.ATTENDANCE_DATE), poyaDates);
            const extraHours = calculateTimeBasedExtra(
                String(row.OUT_TIME), DEFAULT_OUT_TIME_TC,
                String(row.IN_TIME),  DEFAULT_IN_TIME_TC,
                dayType
            );
            accumulate(Number(row.STAFF_ID), String(row.SITE_NO), {
                SITE_NO:       row.SITE_NO,
                SITE_NAME:     row.SITE_NAME,
                STAFF_NAME:    row.STAFF_NAME,
                OT_PERCENTAGE: 0,
                BASIC_SALARY:  Number(row.BASIC_SALARY) || 0,
                IS_OUTSOURCE:  true,
            }, extraHours);
        });

        const aggregatedData = Array.from(staffMap.values()).map((entry: any) => {
            // 90% = fix count: hours tracked but no OT payment
            const isOT = !entry.IS_OUTSOURCE && entry.OT_PERCENTAGE > 0 && entry.OT_PERCENTAGE !== 90;
            const { payment, rate: otRate } = isOT
                ? calculateTimeBasedPayment(entry.TOTAL_EXTRA_HRS, entry.BASIC_SALARY)
                : { payment: 0, rate: 0 };
            return {
                SITE_NO:         entry.SITE_NO,
                SITE_NAME:       entry.SITE_NAME,
                STAFF_NAME:      entry.STAFF_NAME,
                OT_PERCENTAGE:   entry.OT_PERCENTAGE,
                TOTAL_EXTRA_HRS: Number(entry.TOTAL_EXTRA_HRS.toFixed(2)),
                OT_RATE:         Number(otRate.toFixed(2)),
                PAYMENT:         Number(payment.toFixed(2)),
                IS_OT:           isOT,
                IS_OUTSOURCE:    entry.IS_OUTSOURCE,
            };
        });

        res.json(aggregatedData);
    } catch (err) {
        console.error('getOTAnalysisReport error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
