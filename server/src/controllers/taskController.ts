import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import oracledb from 'oracledb';

// ─── Attendance Sync Helper ──────────────────────────────────────────────────
// Auto-records one attendance row per staff+site+date when a task is saved.
// time_based: upserts with in_time/out_time (updates if row already exists)
// target_based/staff_outsource: inserts only if row doesn't exist (no times yet)
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
                `MERGE INTO attendance a
                 USING (SELECT :staff_id AS staff_id, :site_id AS site_id,
                               TO_DATE(:att_date, 'YYYY-MM-DD') AS attendance_date FROM DUAL) src
                 ON (a.staff_id = src.staff_id AND a.site_id = src.site_id
                     AND TRUNC(a.attendance_date) = src.attendance_date)
                 WHEN NOT MATCHED THEN
                   INSERT (site_id, staff_id, attendance_date, in_time, out_time)
                   VALUES (src.site_id, src.staff_id, src.attendance_date, :in_time, :out_time)
                 WHEN MATCHED THEN
                   UPDATE SET a.in_time = :in_time, a.out_time = :out_time, a.updated_at = SYSTIMESTAMP`,
                { staff_id, site_id, att_date: task_date, in_time: in_time || null, out_time: out_time || null }
            );
        } else {
            // target_based / staff_outsource: record presence only, no in/out times for now
            await execute(
                `MERGE INTO attendance a
                 USING (SELECT :staff_id AS staff_id, :site_id AS site_id,
                               TO_DATE(:att_date, 'YYYY-MM-DD') AS attendance_date FROM DUAL) src
                 ON (a.staff_id = src.staff_id AND a.site_id = src.site_id
                     AND TRUNC(a.attendance_date) = src.attendance_date)
                 WHEN NOT MATCHED THEN
                   INSERT (site_id, staff_id, attendance_date)
                   VALUES (src.site_id, src.staff_id, src.attendance_date)`,
                { staff_id, site_id, att_date: task_date }
            );
        }
    } catch (err) {
        // Attendance sync failure must not fail the task operation
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
            query += ` AND t.task_date >= TO_DATE(:date_from, 'YYYY-MM-DD')`;
            params.date_from = date_from;
        }
        if (date_to) {
            query += ` AND t.task_date <= TO_DATE(:date_to, 'YYYY-MM-DD')`;
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
       VALUES (:site_id, :staff_id, :task_description, :invoice_price, :ot_type, :target, :pay_unit_price, TO_DATE(:task_date, 'YYYY-MM-DD'), :count, :in_time, :out_time)`,
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
               task_date = TO_DATE(:task_date, 'YYYY-MM-DD'),
               updated_at = SYSTIMESTAMP
           WHERE id = :id`,
            { task_description, count, pay_unit_price, invoice_price, in_time, out_time, target, task_date, id: String(id) }
        );
        // Sync attendance for updated task
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

// Simplified bulk save - iterates. Better would be `executeMany` but `execute` helper is simple.
// For enterprise perf, use executeMany. I'll implement loop for now for simplicity in MVP.
export const bulkSaveTasks = async (req: Request, res: Response) => {
    const rows = req.body; // Array of items with ID and fields to update
    if (!Array.isArray(rows)) return res.status(400).json({ message: 'Expected array' });

    try {
        for (const row of rows) {
            const { id, task_description, count, pay_unit_price, invoice_price, in_time, out_time, task_date } = row;
            if (!id) continue;
            // Fetch task before update to get site/staff/ot_type
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
                     task_date = TO_DATE(:task_date, 'YYYY-MM-DD'),
                     updated_at = SYSTIMESTAMP
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
            WHERE TRUNC(t.task_date) = TO_DATE(:task_date_param, 'YYYY-MM-DD')
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
        console.error('getDailyCountReport errorNum:', err?.errorNum);
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
        // Support both single date and date range
        const dateFrom = date;
        const dateTo = date_to ? String(date_to) : dateFrom;

        let query = `
            SELECT t.*, u.name as staff_name, s.site_no, s.name as site_name, s.ot_type as site_ot_type
            FROM tasks t
            JOIN sites s ON t.site_id = s.id
            JOIN users u ON t.staff_id = u.id
            WHERE t.task_date BETWEEN TO_DATE(:dateFrom, 'YYYY-MM-DD') AND TO_DATE(:dateTo, 'YYYY-MM-DD')
        `;

        const params: any = { dateFrom, dateTo };

        if (site_id) {
            query += ` AND t.site_id = :site_id`;
            params.site_id = Number(site_id);
        }

        query += ` ORDER BY s.name, u.name, t.task_date`;

        const result = await execute<any>(query, params);
        const tasks = result.rows || [];

        // Calculate aggregations per site
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

            // Aggregate counts for both target-based and time-based/staff_outsource
            if (task.COUNT) {
                siteData.total_count += Number(task.COUNT) || 0;
            }

            // Calculate hours for time-based and staff_outsource
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

        // Convert to array and add staff count
        const aggregatedData = Array.from(siteMap.values()).map(site => ({
            ...site,
            total_staff: site.staff_ids.size,
            staff_ids: undefined // Remove Set from response
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
            WHERE TRUNC(t.task_date) BETWEEN TO_DATE(:date_from, 'YYYY-MM-DD') AND TO_DATE(:date_to, 'YYYY-MM-DD')
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
        let query = `
            SELECT
                s.id as site_id,
                s.site_no,
                s.name as site_name,
                u.id as staff_id,
                u.name as staff_name,
                NVL(u.ot_percentage, 0) as ot_percentage,
                NVL(u.basic_salary, 0) as basic_salary,
                t.out_time
            FROM tasks t
            JOIN users u ON t.staff_id = u.id
            JOIN sites s ON t.site_id = s.id
            WHERE TRUNC(t.task_date) BETWEEN TO_DATE(:date_from, 'YYYY-MM-DD') AND TO_DATE(:date_to, 'YYYY-MM-DD')
            AND t.out_time IS NOT NULL
        `;

        const params: any = {
            date_from: String(date_from),
            date_to: String(date_to)
        };

        if (site_id) {
            query += ` AND t.site_id = :site_id`;
            params.site_id = Number(site_id);
        }

        query += ` ORDER BY s.name, u.name`;

        const result = await execute<any>(query, params);
        const rows = result.rows || [];

        // Calculate extra hours for each row (time after 17:00)
        const DEFAULT_OUT_TIME = '17:00';
        const staffMap = new Map();

        rows.forEach((row: any) => {
            const outTime = row.OUT_TIME;
            let extraHours = 0;

            if (outTime) {
                const [outH, outM] = outTime.split(':').map(Number);
                const [defH, defM] = DEFAULT_OUT_TIME.split(':').map(Number);

                const outDate = new Date(2000, 0, 1, outH, outM);
                const defDate = new Date(2000, 0, 1, defH, defM);

                const diffMs = outDate.getTime() - defDate.getTime();
                if (diffMs > 0) {
                    extraHours = diffMs / (1000 * 60 * 60); // Convert to hours
                }
            }

            if (!staffMap.has(row.STAFF_ID)) {
                staffMap.set(row.STAFF_ID, {
                    SITE_NO: row.SITE_NO,
                    SITE_NAME: row.SITE_NAME,
                    STAFF_NAME: row.STAFF_NAME,
                    OT_PERCENTAGE: Number(row.OT_PERCENTAGE) || 0,
                    BASIC_SALARY: Number(row.BASIC_SALARY) || 0,
                    TOTAL_EXTRA_HRS: 0
                });
            }

            const entry = staffMap.get(row.STAFF_ID);
            entry.TOTAL_EXTRA_HRS += extraHours;
        });

        const aggregatedData = Array.from(staffMap.values()).map((entry: any) => {
            const isOT = entry.OT_PERCENTAGE > 0;
            // OT hourly rate = (basic_salary / 240) * (ot_percentage / 100)
            const otRate = isOT ? (entry.BASIC_SALARY / 240) * (entry.OT_PERCENTAGE / 100) : 0;
            const payment = entry.TOTAL_EXTRA_HRS * otRate;
            return {
                SITE_NO: entry.SITE_NO,
                SITE_NAME: entry.SITE_NAME,
                STAFF_NAME: entry.STAFF_NAME,
                OT_PERCENTAGE: entry.OT_PERCENTAGE,
                TOTAL_EXTRA_HRS: Number(entry.TOTAL_EXTRA_HRS.toFixed(2)),
                OT_RATE: Number(otRate.toFixed(2)),
                PAYMENT: Number(payment.toFixed(2)),
                IS_OT: isOT
            };
        });

        res.json(aggregatedData);
    } catch (err) {
        console.error('getOTAnalysisReport error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
