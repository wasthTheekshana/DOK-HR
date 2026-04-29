import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import { calculateTimeBasedExtra, calculateTimeBasedPayment, calculateTargetBasedExtra, calculateTargetBasedPayment, getDayType } from '../utils/payrollUtils';
import { AuthRequest } from '../middleware/authMiddleware';

const DEFAULT_OUT_TIME = '17:00';
const DEFAULT_IN_TIME  = '08:30';
const DAYS_IN_PERIOD = Number(process.env.DAYS_IN_PERIOD) || 22;
const EXTRA_UNIT_RATE = Number(process.env.EXTRA_UNIT_RATE) || 0.5;

export const getPayroll = async (req: Request, res: Response) => {
    const { site_no, date_from, date_to, ot_type, view_mode } = req.query;

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
            // Aggregated by staff
            // Summing target from sites table (fixed daily target * DAYS_IN_PERIOD)
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
                const totalTarget = dailyTarget * DAYS_IN_PERIOD;
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
              AND s.ot_type != 'staff_outsource'
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

            // Different calculation for 90% staff vs custom OT staff
            if (otPercentage === 90) {
                // 90% staff: Direct formula Extra Hours * 150
                calculationType = '90% Fixed';
                adjustedExtraHours = extraHours; // No adjustment for 90% staff
                extraPayment = extraHours * 150;
                otRate = 150; // Fixed rate for 90% staff
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
        for (const record of records) {
            await execute(
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
        for (const record of records) {
            await execute(
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
