import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import { getDayType, calculateTimeBasedExtra, calculateTimeBasedPayment } from '../utils/payrollUtils';
import { parseCsvIds, parseCsvNames, validateDateRange, buildRevenueReport, RevenueLineRow } from '../utils/revenueReportUtils';

const DEFAULT_OUT_TIME_TC = '17:00';
const DEFAULT_IN_TIME_TC  = '08:30';

// A supervisor's reach isn't just sites.supervisor_id — it also includes any site they've
// been given a temporary/permanent assignment to (temporary_assignments), same as the
// equivalent fix in userController.getUsers.
async function getSupervisorAccessibleSiteIds(supervisorId: number): Promise<number[]> {
    const [sitesResult, assignResult] = await Promise.all([
        execute<any>(`SELECT id FROM sites WHERE supervisor_id = :id`, { id: supervisorId }),
        execute<any>(
            `SELECT site_id FROM temporary_assignments
             WHERE staff_id = :id AND CURRENT_DATE >= start_date AND (end_date IS NULL OR CURRENT_DATE <= end_date)`,
            { id: supervisorId }
        ),
    ]);
    return Array.from(new Set([
        ...(sitesResult.rows?.map((r: any) => r.ID) || []),
        ...(assignResult.rows?.map((r: any) => r.SITE_ID) || []),
    ]));
}

// Returns true when dateStr is strictly before today (local server date).
function isBackdate(dateStr: string): boolean {
    if (!dateStr) return false;
    const taskDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return taskDate < today;
}

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
            const accessibleSiteIds = await getSupervisorAccessibleSiteIds(userId);
            if (accessibleSiteIds.length === 0) return res.json([]);
            const idParams = Object.fromEntries(accessibleSiteIds.map((id, i) => [`ssid${i}`, id]));
            const idPlaceholders = accessibleSiteIds.map((_, i) => `:ssid${i}`).join(', ');
            query += ` AND s.id IN (${idPlaceholders})`;
            Object.assign(params, idParams);
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
    const userRole = (req as any).user.role;
    const userId   = (req as any).user.id;
    const { site_id, task_description, ot_type, target, pay_unit_price, task_date, count, in_time, out_time } = req.body;
    let { invoice_price } = req.body;
    // Staff can only create tasks for themselves
    const staff_id = userRole === 'staff' ? userId : req.body.staff_id;

    if (['staff', 'supervisor'].includes(userRole) && isBackdate(task_date)) {
        return res.status(400).json({ message: 'Backdating is not allowed' });
    }

    try {
        if (userRole === 'staff') {
            // Staff don't set pricing — derive it from the site's configured task types
            const priceRes = await execute<any>(
                `SELECT invoice_price FROM site_task_types
                 WHERE site_id = :site_id AND LOWER(TRIM(task_name)) = LOWER(TRIM(:task_name))`,
                { site_id: Number(site_id), task_name: String(task_description || '') }
            );
            if (priceRes.rows && priceRes.rows.length > 0) {
                invoice_price = Number(priceRes.rows[0].INVOICE_PRICE) || 0;
            }
        }

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

// Returns the task row joined with its site's supervisor, or null when not found.
async function getTaskWithSite(taskId: string | number) {
    const result = await execute<any>(
        `SELECT t.id, t.site_id, t.staff_id, t.ot_type, s.supervisor_id
         FROM tasks t JOIN sites s ON t.site_id = s.id
         WHERE t.id = :id`,
        { id: String(taskId) }
    );
    return result.rows?.[0] ?? null;
}

// True when the caller may modify this task (staff: own tasks; supervisor: own sites).
function canModifyTask(userRole: string, userId: number, taskRow: any): boolean {
    if (userRole === 'staff')      return Number(taskRow.STAFF_ID) === Number(userId);
    if (userRole === 'supervisor') return Number(taskRow.SUPERVISOR_ID) === Number(userId);
    return true; // admin / system_admin
}

// Updatable columns — only fields present in the body are written (PATCH semantics).
const TASK_UPDATE_FIELDS = ['task_description', 'count', 'pay_unit_price', 'invoice_price', 'in_time', 'out_time', 'target', 'task_date'] as const;

function buildTaskUpdate(body: any): { setSql: string; params: any } | null {
    const updates: string[] = [];
    const params: any = {};
    for (const field of TASK_UPDATE_FIELDS) {
        if (field in body) {
            updates.push(`${field} = :${field}`);
            params[field] = body[field] ?? null;
        }
    }
    if (updates.length === 0) return null;
    updates.push('updated_at = CURRENT_TIMESTAMP');
    return { setSql: updates.join(', '), params };
}

export const updateTask = async (req: Request, res: Response) => {
    const { id } = req.params;
    const userRole = (req as any).user.role;
    const userId   = (req as any).user.id;
    const { in_time, out_time, task_date } = req.body;

    if (['staff', 'supervisor'].includes(userRole) && isBackdate(task_date)) {
        return res.status(400).json({ message: 'Backdating is not allowed' });
    }

    try {
        const taskRow = await getTaskWithSite(String(id));
        if (!taskRow) return res.status(404).json({ message: 'Task not found' });
        if (!canModifyTask(userRole, userId, taskRow)) {
            return res.status(403).json({ message: 'Forbidden: you can only edit tasks on your own site' });
        }

        const update = buildTaskUpdate(req.body);
        if (!update) return res.json({ message: 'No changes' });

        await execute(
            `UPDATE tasks SET ${update.setSql} WHERE id = :id`,
            { ...update.params, id: String(id) }
        );

        if (task_date) {
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
    const userRole = (req as any).user.role;
    const userId   = (req as any).user.id;

    try {
        for (const row of rows) {
            const { id, in_time, out_time, task_date } = row;
            if (!id) continue;
            if (['staff', 'supervisor'].includes(userRole) && isBackdate(task_date)) continue;

            const taskRow = await getTaskWithSite(id);
            if (!taskRow || !canModifyTask(userRole, userId, taskRow)) continue;

            const update = buildTaskUpdate(row);
            if (!update) continue;

            await execute(
                `UPDATE tasks SET ${update.setSql} WHERE id = :id`,
                { ...update.params, id }
            );
            if (task_date) {
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
    const userRole = (req as any).user.role;
    const userId   = (req as any).user.id;
    try {
        const taskRow = await getTaskWithSite(String(id));
        if (!taskRow) return res.status(404).json({ message: 'Task not found' });
        if (!canModifyTask(userRole, userId, taskRow)) {
            return res.status(403).json({ message: 'Forbidden: you can only delete tasks on your own site' });
        }
        await execute(`DELETE FROM tasks WHERE id = :id`, { id: Number(id) });
        res.json({ message: 'Task deleted' });
    } catch (err) {
        console.error('deleteTask error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getDailyCountReport = async (req: Request, res: Response) => {
    const { date, site_id } = req.query;
    const callerRole = (req as any).user?.role;
    const callerId   = (req as any).user?.id;

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

        if (callerRole === 'supervisor') {
            const accessibleSiteIds = await getSupervisorAccessibleSiteIds(callerId);
            if (accessibleSiteIds.length === 0) return res.json([]);
            const idParams = Object.fromEntries(accessibleSiteIds.map((id, i) => [`ssid${i}`, id]));
            const idPlaceholders = accessibleSiteIds.map((_, i) => `:ssid${i}`).join(', ');
            query += ` AND s.id IN (${idPlaceholders})`;
            Object.assign(params, idParams);
        }

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
    const callerRole = (req as any).user?.role;
    const callerId   = (req as any).user?.id;

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

        if (callerRole === 'supervisor') {
            const accessibleSiteIds = await getSupervisorAccessibleSiteIds(callerId);
            if (accessibleSiteIds.length === 0) return res.json([]);
            const idParams = Object.fromEntries(accessibleSiteIds.map((id, i) => [`ssid${i}`, id]));
            const idPlaceholders = accessibleSiteIds.map((_, i) => `:ssid${i}`).join(', ');
            query += ` AND s.id IN (${idPlaceholders})`;
            Object.assign(params, idParams);
        }

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

        // Payment is floored PER DAY (same rule as getPayroll) so this report
        // and the payroll page always agree on totals.
        const accumulate = (staffId: number, siteNo: string, entry: any, extraHours: number) => {
            const key = `${staffId}_${siteNo}`;
            if (!staffMap.has(key)) staffMap.set(key, { ...entry, TOTAL_EXTRA_HRS: 0, TOTAL_PAYMENT: 0 });
            const acc = staffMap.get(key)!;
            acc.TOTAL_EXTRA_HRS += extraHours;
            acc.TOTAL_PAYMENT   += calculateTimeBasedPayment(extraHours, entry.BASIC_SALARY).payment;
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
            const payment = isOT ? entry.TOTAL_PAYMENT : 0;
            const otRate  = isOT ? calculateTimeBasedPayment(1, entry.BASIC_SALARY).rate : 0;
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

export const getWeeklyOperationReport = async (req: Request, res: Response) => {
    const { date_from, date_to } = req.query as { date_from: string; date_to: string };
    if (!date_from || !date_to) return res.status(400).json({ message: 'date_from and date_to required' });

    try {
        const from = new Date(date_from + 'T00:00:00');
        const to   = new Date(date_to   + 'T00:00:00');
        const totalDays = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;

        const [sitesRes, taskStatsRes, attStatsRes] = await Promise.all([
            execute<any>(`SELECT id, site_no, name FROM sites WHERE status = 'active' ORDER BY site_no`, {}),

            execute<any>(`
                SELECT t.site_id,
                       COUNT(DISTINCT t.task_date)                                AS days_with_tasks,
                       MIN(TO_CHAR(t.task_date, 'YYYY-MM-DD'))                    AS first_task_date,
                       COUNT(*)                                                   AS total_tasks,
                       COUNT(CASE WHEN t.in_time IS NULL OR t.out_time IS NULL THEN 1 END) AS missing_times
                FROM tasks t
                WHERE t.task_date >= :df AND t.task_date <= :dt
                GROUP BY t.site_id`,
                { df: date_from, dt: date_to }
            ),

            execute<any>(`
                SELECT a.site_id,
                       COUNT(*) AS total_att,
                       COUNT(CASE WHEN a.in_time IS NULL OR a.out_time IS NULL THEN 1 END) AS incomplete_att
                FROM attendance a
                WHERE a.attendance_date >= :df AND a.attendance_date <= :dt
                GROUP BY a.site_id`,
                { df: date_from, dt: date_to }
            ),
        ]);

        const taskMap = new Map<number, any>();
        (taskStatsRes.rows || []).forEach((r: any) => taskMap.set(Number(r.SITE_ID), r));

        const attMap = new Map<number, any>();
        (attStatsRes.rows || []).forEach((r: any) => attMap.set(Number(r.SITE_ID), r));

        const sites = (sitesRes.rows || []).map((site: any, idx: number) => {
            const siteId     = Number(site.ID);
            const ts         = taskMap.get(siteId);
            const as_        = attMap.get(siteId);

            const daysWithTasks   = ts ? Number(ts.DAYS_WITH_TASKS) : 0;
            const missingTimes    = ts ? Number(ts.MISSING_TIMES)   : 0;
            const totalTasks      = ts ? Number(ts.TOTAL_TASKS)      : 0;
            const incompleteAtt   = as_ ? Number(as_.INCOMPLETE_ATT) : 0;
            const totalAtt        = as_ ? Number(as_.TOTAL_ATT)      : 0;
            const daysMissed      = Math.max(totalDays - daysWithTasks, 0);
            const coverage        = totalDays > 0 ? daysWithTasks / totalDays : 0;

            let updateFrequency: string;
            if (daysWithTasks === 0)         updateFrequency = 'Not Updating';
            else if (coverage >= 0.9)        updateFrequency = 'Daily';
            else if (missingTimes > totalTasks * 0.3) updateFrequency = 'With Errors';
            else                             updateFrequency = 'Irregular';

            let updateAccuracy: string;
            if (daysWithTasks === 0)                          updateAccuracy = 'Other';
            else if (incompleteAtt > totalAtt * 0.3)          updateAccuracy = 'Wrong Attendance';
            else if (missingTimes > totalTasks * 0.3)         updateAccuracy = 'Wrong Date';
            else                                              updateAccuracy = 'Accurate';

            const regularSince = ts?.FIRST_TASK_DATE ? String(ts.FIRST_TASK_DATE) : '';

            let commonErrors = '';
            if (daysWithTasks === 0)         commonErrors = 'No updates in period';
            else if (incompleteAtt > 0)      commonErrors = `${incompleteAtt} attendance record(s) missing in/out time`;
            else if (daysMissed > 0)         commonErrors = `${daysMissed} day(s) without task updates`;

            return {
                index:            idx + 1,
                site_id:          siteId,
                site_no:          site.SITE_NO,
                site_name:        site.NAME,
                update_frequency: updateFrequency,
                regular_since:    regularSince,
                days_missed:      daysMissed,
                update_accuracy:  updateAccuracy,
                common_errors:    commonErrors,
                technical_issues: false,
                remarks:          '',
            };
        });

        res.json({ sites, date_from, date_to, total_days: totalDays });
    } catch (err) {
        console.error('getWeeklyOperationReport error', err);
        res.status(500).json({ message: 'Failed to generate report' });
    }
};

// ─── Revenue Report ──────────────────────────────────────────────────────────
// Counts × unit price per site task type over a date range. Uses the same
// name-matching join as invoice generation so numbers always match invoices.
export const getRevenueReport = async (req: Request, res: Response) => {
    const { date_from, date_to, site_ids, task_names } = req.query;

    const dateErr = validateDateRange(date_from, date_to);
    if (dateErr) return res.status(400).json({ message: dateErr });

    const siteIds = parseCsvIds(site_ids);
    if (siteIds !== null && siteIds.length === 0) {
        return res.status(400).json({ message: 'site_ids contains no valid ids' });
    }
    const taskNames = parseCsvNames(task_names);
    if (taskNames !== null && taskNames.length === 0) {
        return res.status(400).json({ message: 'task_names contains no valid names' });
    }

    try {
        const params: Record<string, any> = { date_from: String(date_from), date_to: String(date_to) };
        let filters = '';
        if (siteIds) {
            const placeholders = siteIds.map((id, i) => {
                params[`sid${i}`] = id;
                return `:sid${i}`;
            }).join(', ');
            filters += ` AND s.id IN (${placeholders})`;
        } else {
            filters += ` AND s.status = 'active'`;
        }
        if (taskNames) {
            const placeholders = taskNames.map((name, i) => {
                params[`tn${i}`] = name;
                return `:tn${i}`;
            }).join(', ');
            // Postgres TRIM() only strips spaces, but live task_name values carry trailing
            // tabs/newlines that JS .trim() (used client-side and in parseCsvNames) does strip.
            // Use REGEXP_REPLACE to match JS whitespace-trim semantics so the filter actually matches.
            filters += ` AND LOWER(REGEXP_REPLACE(stt.task_name, '^\\s+|\\s+$', '', 'g')) IN (${placeholders})`;
        }

        const result = await execute<RevenueLineRow>(
            `SELECT s.id                                   AS site_id,
                    s.site_no                              AS site_no,
                    s.name                                 AS site_name,
                    stt.task_name                          AS task_name,
                    CASE WHEN s.ot_type = 'staff_outsource'
                         THEN COUNT(t.id)
                         ELSE COALESCE(SUM(COALESCE(t.count, 0)), 0)
                    END                                     AS total_count,
                    COALESCE(stt.invoice_price, 0)         AS unit_price
             FROM site_task_types stt
             JOIN sites s ON s.id = stt.site_id
             LEFT JOIN tasks t
                ON  t.site_id = stt.site_id
               AND  LOWER(TRIM(t.task_description)) = LOWER(TRIM(stt.task_name))
               AND  t.task_date >= :date_from
               AND  t.task_date <= :date_to
             WHERE 1=1${filters}
             GROUP BY s.id, s.site_no, s.name, s.ot_type, stt.task_name, stt.invoice_price
             ORDER BY s.site_no, stt.task_name`,
            params
        );

        const { lines, summary, grand_total } = buildRevenueReport(result.rows || []);
        res.json({ date_from: String(date_from), date_to: String(date_to), lines, summary, grand_total });
    } catch (err) {
        console.error('getRevenueReport error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
