import { Request, Response } from 'express';
import { execute, withTransaction } from '../db/dbUtils';
import { calculateTimeBasedExtra, calculateTimeBasedPayment, calculateTargetBasedExtra, calculateTargetBasedPayment, getDayType } from '../utils/payrollUtils';
import { AuthRequest } from '../middleware/authMiddleware';
import { computeWorkingDays } from '../utils/analyticsUtils';

const DEFAULT_OUT_TIME = '17:00';
const DEFAULT_IN_TIME  = '08:30';
const EXTRA_UNIT_RATE = Number(process.env.EXTRA_UNIT_RATE) || 0.5;

export const getPayroll = async (req: AuthRequest, res: Response) => {
    const { site_no, date_from, date_to, ot_type, view_mode } = req.query;
    const callerRole = req.user?.role;
    const callerId   = req.user?.id;

    if (!date_from || !date_to || !ot_type) {
        return res.status(400).json({ message: 'Missing required filters' });
    }

    try {
        if (ot_type === 'time_based') {
            // Fetch poya dates in range to determine day type per row
            const poyaResult = await execute<any>(
                `SELECT TO_CHAR(poya_date, 'YYYY-MM-DD') as poya_date FROM poya_days
                 WHERE poya_date BETWEEN :date_from AND :date_to`,
                { date_from: String(date_from), date_to: String(date_to) }
            );
            const poyaDates = new Set<string>((poyaResult.rows || []).map((r: any) => r.POYA_DATE as string));

            // Group by staff+date so multiple tasks on the same day don't double-count OT.
            // Use MIN(in_time) and MAX(out_time) to capture the full shift span.
            let query = `
                SELECT t.staff_id, u.epf_number, u.name, s.site_no, s.name as site_name,
                       t.task_date, MIN(t.in_time) as in_time, MAX(t.out_time) as out_time, u.basic_salary
                FROM tasks t
                JOIN users u ON t.staff_id = u.id
                JOIN sites s ON t.site_id = s.id
                WHERE t.ot_type = 'time_based'
                AND t.task_date BETWEEN :date_from AND :date_to
                AND u.site_id = t.site_id
            `;

            const params: any = { date_from: String(date_from), date_to: String(date_to) };

            if (callerRole === 'supervisor') {
                query += ` AND s.supervisor_id = :callerId`;
                params.callerId = callerId;
            }

            if (site_no) {
                query += ` AND s.site_no = :site_no`;
                params.site_no = String(site_no);
            }

            query += ` GROUP BY t.staff_id, u.epf_number, u.name, s.site_no, s.name, t.task_date, u.basic_salary`;
            query += ` ORDER BY s.site_no, u.name, t.task_date`;

            const result = await execute<any>(query, params);
            const rows = (result.rows || []).map((row: any) => {
                const dayType = getDayType(row.TASK_DATE, poyaDates);
                const extraHours = calculateTimeBasedExtra(row.OUT_TIME, DEFAULT_OUT_TIME, row.IN_TIME, DEFAULT_IN_TIME, dayType);
                const { payment: extraPayment, rate: otRate } = calculateTimeBasedPayment(extraHours, row.BASIC_SALARY || 0);
                return {
                    ...row,
                    default_in_time: DEFAULT_IN_TIME,
                    default_out_time: DEFAULT_OUT_TIME,
                    day_type: dayType,
                    extra_hours: extraHours,
                    ot_rate: otRate,
                    extra_payment: extraPayment
                };
            });

            if (!site_no || view_mode === 'summary') {
                // Aggregate in JS for simplicity as we already calculated per-row values
                const summaryMap = new Map();
                rows.forEach((r: any) => {
                    const key = `${r.STAFF_ID}_${r.SITE_NO}`;
                    if (!summaryMap.has(key)) {
                        summaryMap.set(key, {
                            STAFF_ID: r.STAFF_ID,
                            EPF_NUMBER: r.EPF_NUMBER,
                            NAME: r.NAME,
                            SITE_NO: r.SITE_NO,
                            SITE_NAME: r.SITE_NAME,
                            BASIC_SALARY: r.BASIC_SALARY,
                            total_extra_hours: 0,
                            total_payment: 0,
                            ot_rate: r.ot_rate // Capture rate from first row (same for all rows of this staff)
                        });
                    }
                    const entry = summaryMap.get(key);
                    entry.total_extra_hours += r.extra_hours;
                    entry.total_payment += r.extra_payment;
                });
                return res.json(Array.from(summaryMap.values()));
            }

            return res.json(rows);

        } else if (ot_type === 'target_based') {
            // Aggregated by staff.
            // Target scales with the selected range (same rule as getExtraUnitsSummary),
            // not a fixed 22-day period.
            const workingDays = computeWorkingDays(String(date_from), String(date_to));
            let query = `
                SELECT t.staff_id, u.epf_number, u.name, s.site_no, s.name as site_name, SUM(t.count) as sum_count, MAX(s.daily_target) as daily_target
                FROM tasks t
                JOIN sites s ON t.site_id = s.id
                JOIN users u ON t.staff_id = u.id
                WHERE t.ot_type = 'target_based'
                AND t.task_date BETWEEN :date_from AND :date_to
                AND u.site_id = t.site_id
            `;

            const params: any = { date_from: String(date_from), date_to: String(date_to) };

            if (callerRole === 'supervisor') {
                query += ` AND s.supervisor_id = :callerId`;
                params.callerId = callerId;
            }

            if (site_no) {
                query += ` AND s.site_no = :site_no`;
                params.site_no = String(site_no);
            }

            query += ` GROUP BY t.staff_id, u.epf_number, u.name, s.site_no, s.name ORDER BY s.site_no, u.name`;

            const result = await execute<any>(query, params);
            const rows = (result.rows || []).map((row: any) => {
                const dailyTarget = Number(row.DAILY_TARGET || 0);
                // daily_target = 0 means no target is set for this site — no extra units apply
                if (dailyTarget === 0) {
                    return {
                        ...row,
                        target_count: 0,
                        extra_units: 0,
                        extra_payment: 0
                    };
                }
                const totalTarget = dailyTarget * workingDays;
                const extraUnits = calculateTargetBasedExtra(row.SUM_COUNT, totalTarget);
                const extraPayment = calculateTargetBasedPayment(extraUnits, EXTRA_UNIT_RATE);
                return {
                    ...row,
                    target_count: totalTarget,
                    extra_units: extraUnits,
                    extra_payment: extraPayment
                };
            });
            return res.json(rows);

        } else if (ot_type === 'staff_outsource') {
            const params: any = { date_from: String(date_from), date_to: String(date_to) };
            if (site_no) params.site_no = String(site_no);

            if (view_mode === 'summary') {
                // Fetch poya dates for correct day-type classification
                const poyaResultSum = await execute<any>(
                    `SELECT TO_CHAR(poya_date, 'YYYY-MM-DD') as poya_date FROM poya_days
                     WHERE poya_date BETWEEN :date_from AND :date_to`,
                    { date_from: String(date_from), date_to: String(date_to) }
                );
                const poyaDatesSum = new Set<string>((poyaResultSum.rows || []).map((r: any) => r.POYA_DATE as string));

                let sumQuery = `
                    SELECT u.id as staff_id, u.epf_number, u.name, s.site_no, s.name as site_name,
                           TO_CHAR(a.attendance_date, 'YYYY-MM-DD') as attendance_date,
                           a.in_time, a.out_time
                    FROM attendance a
                    JOIN users u ON u.id = a.staff_id
                    JOIN sites s ON s.id = a.site_id
                    WHERE s.ot_type = 'staff_outsource'
                      AND a.attendance_date BETWEEN :date_from AND :date_to
                `;
                if (callerRole === 'supervisor') sumQuery += ` AND s.supervisor_id = :callerId`;
                if (site_no) sumQuery += ` AND s.site_no = :site_no`;
                sumQuery += ` ORDER BY s.site_no, u.name, a.attendance_date`;

                const sumResult = await execute<any>(sumQuery, params);

                // Aggregate per staff using same logic as detailed view
                const summaryMap = new Map<string, any>();
                (sumResult.rows || []).forEach((row: any) => {
                    const key = `${row.STAFF_ID}_${row.SITE_NO}`;
                    if (!summaryMap.has(key)) {
                        summaryMap.set(key, {
                            STAFF_ID:     row.STAFF_ID,
                            EPF_NUMBER:   row.EPF_NUMBER,
                            NAME:         row.NAME,
                            SITE_NO:      row.SITE_NO,
                            SITE_NAME:    row.SITE_NAME,
                            days_attended:     0,
                            total_hours:       0,
                            total_extra_hours: 0,
                        });
                    }
                    const entry = summaryMap.get(key)!;
                    entry.days_attended += 1;

                    if (row.IN_TIME && row.OUT_TIME) {
                        const [oh, om] = String(row.OUT_TIME).split(':').map(Number);
                        const [ih, im] = String(row.IN_TIME).split(':').map(Number);
                        entry.total_hours += Math.round(((oh * 60 + om) - (ih * 60 + im)) / 60 * 100) / 100;
                    }

                    const dayType = getDayType(String(row.ATTENDANCE_DATE), poyaDatesSum);
                    entry.total_extra_hours += calculateTimeBasedExtra(
                        String(row.OUT_TIME), DEFAULT_OUT_TIME,
                        String(row.IN_TIME),  DEFAULT_IN_TIME,
                        dayType
                    );
                });

                return res.json(Array.from(summaryMap.values()).map(e => ({
                    ...e,
                    total_hours:       Math.round(e.total_hours * 100) / 100,
                    total_extra_hours: e.total_extra_hours,
                })));
            }

            // Detailed view — fetch poya dates so we can compute day type
            const poyaResult = await execute<any>(
                `SELECT TO_CHAR(poya_date, 'YYYY-MM-DD') as poya_date FROM poya_days
                 WHERE poya_date BETWEEN :date_from AND :date_to`,
                { date_from: String(date_from), date_to: String(date_to) }
            );
            const poyaDates = new Set<string>((poyaResult.rows || []).map((r: any) => r.POYA_DATE as string));

            let detailQuery = `
                SELECT u.id as staff_id, u.epf_number, u.name, s.site_no, s.name as site_name,
                       TO_CHAR(a.attendance_date, 'YYYY-MM-DD') as attendance_date,
                       a.in_time, a.out_time
                FROM attendance a
                JOIN users u ON u.id = a.staff_id
                JOIN sites s ON s.id = a.site_id
                WHERE s.ot_type = 'staff_outsource'
                  AND a.attendance_date BETWEEN :date_from AND :date_to
            `;
            if (callerRole === 'supervisor') detailQuery += ` AND s.supervisor_id = :callerId`;
            if (site_no) detailQuery += ` AND s.site_no = :site_no`;
            detailQuery += ` ORDER BY s.site_no, u.name, a.attendance_date`;

            const detailResult = await execute<any>(detailQuery, params);
            const rows = (detailResult.rows || []).map((row: any) => {
                const dayType = getDayType(row.ATTENDANCE_DATE, poyaDates);
                const extraHours = calculateTimeBasedExtra(row.OUT_TIME, DEFAULT_OUT_TIME, row.IN_TIME, DEFAULT_IN_TIME, dayType);
                const hoursWorked = (row.IN_TIME && row.OUT_TIME)
                    ? Math.round(((() => {
                        const [oh, om] = row.OUT_TIME.split(':').map(Number);
                        const [ih, im] = row.IN_TIME.split(':').map(Number);
                        return ((oh * 60 + om) - (ih * 60 + im)) / 60;
                    })()) * 100) / 100
                    : 0;
                return {
                    ...row,
                    day_type: dayType,
                    hours_worked: hoursWorked,
                    extra_hours: extraHours,
                    default_in_time: DEFAULT_IN_TIME,
                    default_out_time: DEFAULT_OUT_TIME,
                };
            });
            return res.json(rows);

        } else {
            return res.status(400).json({ message: 'Invalid OT type' });
        }
    } catch (err) {
        console.error('getPayroll error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const calculatePayroll = async (req: Request, res: Response) => {
    // This endpoint explicitly triggers recalculation if we were caching, 
    // but since we calculate on-the-fly in getPayroll, we can just alias it or providing a "dry-run" summary.
    // For now, let's redirect to getPayroll logic or returning success if it's just a trigger.
    // But requirements say: "server recalculation; returns JSON".
    // I already implemented logic in getPayroll. I'll make getPayroll do the heavy lifting.
    await getPayroll(req, res);
};

export const getCustomOTReport = async (req: Request, res: Response) => {
    const { site_id, date_from, date_to, custom_percentage } = req.query;

    if (!date_from || !date_to) {
        return res.status(400).json({ message: 'Missing required parameters: date_from, date_to' });
    }

    // custom_percentage is now optional
    let customPercentage: number | null = null;
    if (custom_percentage) {
        customPercentage = Number(custom_percentage);
        if (isNaN(customPercentage) || customPercentage < 0 || customPercentage > 100) {
            return res.status(400).json({ message: 'Invalid custom_percentage. Must be between 0 and 100' });
        }
    }

    try {
        // Fetch poya dates in range
        const poyaResult = await execute<any>(
            `SELECT TO_CHAR(poya_date, 'YYYY-MM-DD') as poya_date FROM poya_days
             WHERE poya_date BETWEEN :date_from AND :date_to`,
            { date_from: String(date_from), date_to: String(date_to) }
        );
        const poyaDates = new Set<string>((poyaResult.rows || []).map((r: any) => r.POYA_DATE as string));

        // Group by staff+date to avoid double-OT when staff has multiple tasks on same day
        let query = `
            SELECT t.staff_id, u.epf_number, u.name as staff_name, s.site_no, s.name as site_name,
                   t.task_date, MIN(t.in_time) as in_time, MAX(t.out_time) as out_time,
                   u.basic_salary, u.ot_percentage
            FROM tasks t
            JOIN sites s ON t.site_id = s.id
            JOIN users u ON t.staff_id = u.id
            WHERE t.task_date BETWEEN :date_from AND :date_to
              AND s.ot_type = 'time_based'
        `;

        const params: any = { date_from: String(date_from), date_to: String(date_to) };

        if (site_id) {
            query += ` AND s.id = :site_id`;
            params.site_id = Number(site_id);
        }

        query += ` GROUP BY t.staff_id, u.epf_number, u.name, s.site_no, s.name, t.task_date, u.basic_salary, u.ot_percentage`;
        query += ` ORDER BY s.site_no, u.name, t.task_date`;

        const result = await execute<any>(query, params);
        const rows = (result.rows || []).map((row: any) => {
            const dayType = getDayType(row.TASK_DATE, poyaDates);
            const extraHours = calculateTimeBasedExtra(row.OUT_TIME, DEFAULT_OUT_TIME, row.IN_TIME, DEFAULT_IN_TIME, dayType);
            const otPercentage = row.OT_PERCENTAGE || 0;

            let adjustedExtraHours: number;
            let extraPayment: number;
            let otRate: number;
            let calculationType: string;

            // Different calculation for fix-count (90%) vs custom OT staff
            if (otPercentage === 90) {
                // Fix count staff: extra hours recorded but OT payment is 0
                calculationType = 'Fix Count';
                adjustedExtraHours = extraHours;
                extraPayment = 0;
                otRate = 0;
            } else {
                // Custom OT staff: Apply custom percentage if provided
                calculationType = 'Custom %';
                adjustedExtraHours = customPercentage !== null
                    ? extraHours * (customPercentage / 100)
                    : extraHours;

                // Calculate payment with adjusted hours using standard formula
                const paymentResult = calculateTimeBasedPayment(adjustedExtraHours, row.BASIC_SALARY || 0);
                extraPayment = paymentResult.payment;
                otRate = paymentResult.rate;
            }

            return {
                staff_id: row.STAFF_ID,
                epf_number: row.EPF_NUMBER,
                staff_name: row.STAFF_NAME,
                site_no: row.SITE_NO,
                site_name: row.SITE_NAME,
                task_date: row.TASK_DATE,
                in_time: row.IN_TIME,
                out_time: row.OUT_TIME,
                basic_salary: row.BASIC_SALARY,
                original_ot_percentage: otPercentage,
                calculation_type: calculationType,
                day_type: dayType,
                extra_hours: extraHours,
                custom_percentage: otPercentage === 90 ? null : customPercentage,
                adjusted_extra_hours: adjustedExtraHours,
                ot_rate: otRate,
                extra_payment: extraPayment
            };
        });

        // Aggregate by staff for summary
        const summaryMap = new Map();
        rows.forEach((r: any) => {
            const key = `${r.staff_id}_${r.site_no}`;
            if (!summaryMap.has(key)) {
                summaryMap.set(key, {
                    staff_id: r.staff_id,
                    epf_number: r.epf_number,
                    staff_name: r.staff_name,
                    site_no: r.site_no,
                    site_name: r.site_name,
                    basic_salary: r.basic_salary,
                    original_ot_percentage: r.original_ot_percentage,
                    calculation_type: r.calculation_type,
                    custom_percentage: r.custom_percentage,
                    total_extra_hours: 0,
                    total_adjusted_extra_hours: 0,
                    total_payment: 0,
                    ot_rate: r.ot_rate
                });
            }
            const entry = summaryMap.get(key);
            entry.total_extra_hours += r.extra_hours;
            entry.total_adjusted_extra_hours += r.adjusted_extra_hours;
            entry.total_payment += r.extra_payment;
        });

        return res.json(Array.from(summaryMap.values()));
    } catch (err) {
        console.error('getCustomOTReport error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const saveCustomOTReport = async (req: AuthRequest, res: Response) => {
    const { date_from, date_to, site_no, records } = req.body;

    if (!date_from || !date_to || !records || !Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ message: 'Missing required fields: date_from, date_to, records' });
    }

    const batchId = `${date_from}_${date_to}_${site_no || 'all'}_${Date.now()}`;
    const savedBy = req.user?.id ?? null;

    try {
        // Reject duplicate saves: invoices SUM all overlapping batches, so a second
        // batch for the same site+period would double-count OT.
        const siteNos: string[] = Array.from(new Set(
            records.map((r: any) => String(r.site_no || site_no || '')).filter(Boolean)
        ));
        if (siteNos.length > 0) {
            const snParams: any = { date_from: String(date_from), date_to: String(date_to) };
            const placeholders = siteNos.map((_, i) => `:sn${i}`).join(', ');
            siteNos.forEach((sn, i) => { snParams[`sn${i}`] = sn; });
            const dup = await execute<any>(
                `SELECT DISTINCT site_no FROM custom_ot_records
                 WHERE date_from = :date_from AND date_to = :date_to
                   AND site_no IN (${placeholders})`,
                snParams
            );
            if (dup.rows && dup.rows.length > 0) {
                const dupSites = dup.rows.map((r: any) => r.SITE_NO).join(', ');
                return res.status(409).json({
                    message: `A saved OT batch already exists for this period (site: ${dupSites}). Delete the existing batch first.`,
                });
            }
        }

        await withTransaction(async (exec) => {
            for (const record of records) {
                await exec(
                    `INSERT INTO custom_ot_records (
                        batch_id, site_no, site_name, staff_id, epf_number, staff_name,
                        date_from, date_to, calculation_type, custom_percentage,
                        total_extra_hours, total_adjusted_hours, ot_rate, total_payment, saved_by
                    ) VALUES (
                        :batch_id, :site_no, :site_name, :staff_id, :epf_number, :staff_name,
                        :date_from, :date_to,
                        :calculation_type, :custom_percentage,
                        :total_extra_hours, :total_adjusted_hours, :ot_rate, :total_payment, :saved_by
                    )`,
                    {
                        batch_id: batchId,
                        site_no: record.site_no || null,
                        site_name: record.site_name || null,
                        staff_id: record.staff_id,
                        epf_number: record.epf_number || null,
                        staff_name: record.staff_name,
                        date_from: String(date_from),
                        date_to: String(date_to),
                        calculation_type: record.calculation_type || null,
                        custom_percentage: record.custom_percentage ?? null,
                        total_extra_hours: record.total_extra_hours || 0,
                        total_adjusted_hours: record.total_adjusted_extra_hours || 0,
                        ot_rate: record.ot_rate || 0,
                        total_payment: record.total_payment || 0,
                        saved_by: savedBy
                    }
                );
            }
        });

        res.json({ message: 'Saved successfully', batch_id: batchId, count: records.length });
    } catch (err) {
        console.error('saveCustomOTReport error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const saveTargetPayroll = async (req: AuthRequest, res: Response) => {
    const { date_from, date_to, site_no, records } = req.body;

    if (!date_from || !date_to || !site_no || !records || !Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ message: 'Missing required fields: date_from, date_to, site_no, records' });
    }

    const batchId = `${date_from}_${date_to}_${site_no}_${Date.now()}`;
    const savedBy = req.user?.id ?? null;

    try {
        // Reject duplicate saves — a second batch for the same site+period
        // would double-count target OT in invoices.
        const dup = await execute<any>(
            `SELECT 1 FROM payroll_saved_records
             WHERE site_no = :site_no AND date_from = :date_from AND date_to = :date_to
             LIMIT 1`,
            { site_no: String(site_no), date_from: String(date_from), date_to: String(date_to) }
        );
        if (dup.rows && dup.rows.length > 0) {
            return res.status(409).json({
                message: 'A saved batch already exists for this site and period. Delete the existing batch first.',
            });
        }

        await withTransaction(async (exec) => {
            for (const record of records) {
                await exec(
                    `INSERT INTO payroll_saved_records (
                        batch_id, site_no, site_name, staff_id, epf_number, staff_name,
                        date_from, date_to, sum_count, target_count, extra_units, extra_payment, extra_unit_rate, saved_by
                    ) VALUES (
                        :batch_id, :site_no, :site_name, :staff_id, :epf_number, :staff_name,
                        :date_from, :date_to,
                        :sum_count, :target_count, :extra_units, :extra_payment, :extra_unit_rate, :saved_by
                    )`,
                    {
                        batch_id: batchId,
                        site_no: record.SITE_NO || site_no,
                        site_name: record.SITE_NAME || null,
                        staff_id: record.STAFF_ID,
                        epf_number: record.EPF_NUMBER || null,
                        staff_name: record.NAME,
                        date_from: String(date_from),
                        date_to: String(date_to),
                        sum_count: record.SUM_COUNT || record.sum_count || 0,
                        target_count: record.target_count || 0,
                        extra_units: record.extra_units || 0,
                        extra_payment: record.extra_payment || 0,
                        extra_unit_rate: EXTRA_UNIT_RATE,
                        saved_by: savedBy
                    }
                );
            }
        });

        res.json({ message: 'Saved successfully', batch_id: batchId, count: records.length });
    } catch (err) {
        console.error('saveTargetPayroll error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getSavedPayrollHistory = async (req: Request, res: Response) => {
    const { date_from, date_to, site_no } = req.query;

    try {
        let query = `
            SELECT
                id, batch_id, site_no, site_name, staff_id, epf_number, staff_name,
                TO_CHAR(date_from, 'YYYY-MM-DD') as date_from,
                TO_CHAR(date_to, 'YYYY-MM-DD') as date_to,
                sum_count, target_count, extra_units, extra_payment, extra_unit_rate,
                TO_CHAR(saved_at, 'YYYY-MM-DD HH24:MI') as saved_at
            FROM payroll_saved_records
            WHERE 1=1
        `;

        const params: any = {};

        if (date_from && date_to) {
            query += ` AND date_from >= :date_from AND date_to <= :date_to`;
            params.date_from = String(date_from);
            params.date_to = String(date_to);
        }

        if (site_no) {
            query += ` AND site_no = :site_no`;
            params.site_no = String(site_no);
        }

        query += ` ORDER BY saved_at DESC, staff_name ASC`;

        const result = await execute<any>(query, params);
        res.json(result.rows || []);
    } catch (err) {
        console.error('getSavedPayrollHistory error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getCustomOTHistory = async (req: Request, res: Response) => {
    const { date_from, date_to, site_no } = req.query;

    try {
        let query = `
            SELECT
                id, batch_id, site_no, site_name, staff_id, epf_number, staff_name,
                TO_CHAR(date_from, 'YYYY-MM-DD') as date_from,
                TO_CHAR(date_to, 'YYYY-MM-DD') as date_to,
                calculation_type, custom_percentage,
                total_extra_hours, total_adjusted_hours, ot_rate, total_payment,
                TO_CHAR(saved_at, 'YYYY-MM-DD HH24:MI') as saved_at
            FROM custom_ot_records
            WHERE 1=1
        `;

        const params: any = {};

        if (date_from && date_to) {
            query += ` AND date_from >= :date_from AND date_to <= :date_to`;
            params.date_from = String(date_from);
            params.date_to = String(date_to);
        }

        if (site_no) {
            query += ` AND site_no = :site_no`;
            params.site_no = String(site_no);
        }

        query += ` ORDER BY saved_at DESC, staff_name ASC`;

        const result = await execute<any>(query, params);
        res.json(result.rows || []);
    } catch (err) {
        console.error('getCustomOTHistory error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getExtraUnitsSummary = async (req: Request, res: Response) => {
    const { date_from, date_to } = req.query;
    if (!date_from || !date_to) {
        return res.status(400).json({ message: 'date_from and date_to required' });
    }
    const from = String(date_from);
    const to   = String(date_to);
    const workingDays = computeWorkingDays(from, to);

    try {
        // Per-staff task counts for all target-based active sites
        const staffRes = await execute<any>(
            `SELECT
                s.id          AS site_id,
                s.site_no,
                s.name        AS site_name,
                s.daily_target,
                u.id          AS staff_id,
                u.name        AS staff_name,
                u.epf_number,
                COALESCE(SUM(COALESCE(t.count, 0)), 0) AS sum_count
             FROM sites s
             JOIN users u
               ON u.site_id = s.id
              AND u.role    = 'staff'
              AND u.status  = 'active'
             LEFT JOIN tasks t
               ON t.staff_id = u.id
              AND t.site_id  = s.id
              AND t.ot_type  = 'target_based'
              AND t.task_date >= :from
              AND t.task_date <= :to
             WHERE s.ot_type = 'target_based'
               AND s.status  = 'active'
             GROUP BY s.id, s.site_no, s.name, s.daily_target,
                      u.id, u.name, u.epf_number
             ORDER BY s.site_no, u.name`,
            { from, to }
        );

        // Saved batches for this exact date range
        const savedRes = await execute<any>(
            `SELECT
                site_no,
                MAX(batch_id)                                      AS batch_id,
                MAX(TO_CHAR(saved_at, 'YYYY-MM-DD HH24:MI'))       AS saved_at,
                SUM(extra_payment)                                  AS total_extra_payment,
                json_agg(
                    json_build_object(
                        'id',            id,
                        'staff_id',      staff_id,
                        'extra_payment', extra_payment
                    )
                )                                                   AS saved_records
             FROM payroll_saved_records
             WHERE date_from = :from
               AND date_to   = :to
             GROUP BY site_no`,
            { from, to }
        );

        // Build saved map: site_no → saved info
        const savedMap = new Map<string, any>();
        for (const row of (savedRes.rows || [])) {
            savedMap.set(String(row.SITE_NO), {
                batch_id:      row.BATCH_ID,
                saved_at:      row.SAVED_AT,
                saved_records: typeof row.SAVED_RECORDS === 'string'
                                   ? JSON.parse(row.SAVED_RECORDS)
                                   : (row.SAVED_RECORDS ?? []),
            });
        }

        // Group staff rows by site
        const siteMap = new Map<string, any>();
        for (const r of (staffRes.rows || [])) {
            const sno = String(r.SITE_NO);
            if (!siteMap.has(sno)) {
                siteMap.set(sno, {
                    site_id:      Number(r.SITE_ID),
                    site_no:      sno,
                    site_name:    r.SITE_NAME,
                    daily_target: Number(r.DAILY_TARGET) || 0,
                    working_days: workingDays,
                    staff: [],
                });
            }
            siteMap.get(sno).staff.push({
                staff_id:   Number(r.STAFF_ID),
                staff_name: r.STAFF_NAME,
                epf_number: r.EPF_NUMBER || '',
                sum_count:  Number(r.SUM_COUNT),
            });
        }

        // Compute per-site and per-staff extra units, merge saved info
        const result = Array.from(siteMap.values()).map(site => {
            const savedInfo   = savedMap.get(site.site_no);
            const savedRecMap = new Map<number, any>(
                (savedInfo?.saved_records ?? []).map((sr: any) => [Number(sr.staff_id), sr])
            );

            const targetPerStaff = site.daily_target * workingDays;

            const staff = site.staff.map((s: any) => {
                const extraUnits   = Math.max(0, s.sum_count - targetPerStaff);
                const savedRec     = savedRecMap.get(s.staff_id);
                const extraPayment = savedRec
                    ? Number(savedRec.extra_payment)
                    : Math.round(extraUnits * EXTRA_UNIT_RATE * 100) / 100;
                return {
                    staff_id:        s.staff_id,
                    staff_name:      s.staff_name,
                    epf_number:      s.epf_number,
                    sum_count:       s.sum_count,
                    target_count:    targetPerStaff,
                    extra_units:     extraUnits,
                    extra_payment:   extraPayment,
                    saved_record_id: savedRec ? Number(savedRec.id) : null,
                };
            });

            const totalUnits    = staff.reduce((s: number, r: any) => s + r.sum_count, 0);
            const expectedUnits = site.daily_target * workingDays * site.staff.length;
            const extraUnits    = staff.reduce((s: number, r: any) => s + r.extra_units, 0);
            const extraPayment  = staff.reduce((s: number, r: any) => s + r.extra_payment, 0);

            return {
                site_id:        site.site_id,
                site_no:        site.site_no,
                site_name:      site.site_name,
                daily_target:   site.daily_target,
                working_days:   workingDays,
                expected_units: expectedUnits,
                total_units:    totalUnits,
                extra_units:    extraUnits,
                extra_payment:  Math.round(extraPayment * 100) / 100,
                saved:          !!savedInfo,
                saved_at:       savedInfo?.saved_at ?? null,
                batch_id:       savedInfo?.batch_id ?? null,
                staff,
            };
        });

        res.json(result);
    } catch (err) {
        console.error('getExtraUnitsSummary error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteSavedBatch = async (req: Request, res: Response) => {
    const { site_no, date_from, date_to } = req.query;
    if (!site_no || !date_from || !date_to) {
        return res.status(400).json({ message: 'site_no, date_from and date_to required' });
    }
    try {
        await execute(
            `DELETE FROM payroll_saved_records
             WHERE site_no   = :site_no
               AND date_from = :date_from
               AND date_to   = :date_to`,
            { site_no: String(site_no), date_from: String(date_from), date_to: String(date_to) }
        );
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        console.error('deleteSavedBatch error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateSavedRecord = async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ message: 'id must be a valid number' });
    }
    const { extra_payment } = req.body;
    if (extra_payment === undefined || isNaN(Number(extra_payment))) {
        return res.status(400).json({ message: 'extra_payment must be a number' });
    }
    try {
        await execute(
            `UPDATE payroll_saved_records
             SET extra_payment = :extra_payment
             WHERE id = :id`,
            { id: Number(id), extra_payment: Number(extra_payment) }
        );
        res.json({ message: 'Updated successfully' });
    } catch (err) {
        console.error('updateSavedRecord error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
