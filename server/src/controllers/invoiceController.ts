import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import { getDayType, calculateTimeBasedExtra } from '../utils/payrollUtils';

const DEFAULT_IN_TIME  = '08:30';
const DEFAULT_OUT_TIME = '17:00';

export const getInvoices = async (req: Request, res: Response) => {
    try {
        const result = await execute<any>(
            `SELECT pa.id, pa.site_id, pa.site_no, pa.site_name,
                    TO_CHAR(pa.date_from, 'YYYY-MM-DD') as date_from,
                    TO_CHAR(pa.date_to,   'YYYY-MM-DD') as date_to,
                    pa.cost_variant_amount, pa.salary_ot_amount,
                    pa.expense_cost, pa.invoice_price,
                    pa.created_at, u.name as created_by_name
             FROM profit_amount pa
             LEFT JOIN users u ON pa.created_by = u.id
             ORDER BY pa.created_at DESC`,
            {}
        );
        res.json(result.rows || []);
    } catch (err) {
        console.error('getInvoices error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const previewInvoice = async (req: Request, res: Response) => {
    const { site_id, date_from, date_to } = req.body;
    if (!site_id || !date_from || !date_to) {
        return res.status(400).json({ message: 'site_id, date_from, date_to are required' });
    }

    try {
        const siteResult = await execute<any>(
            `SELECT id, site_no, name, ot_type FROM sites WHERE id = :id`,
            [String(site_id)]
        );
        if (!siteResult.rows || siteResult.rows.length === 0) {
            return res.status(404).json({ message: 'Site not found' });
        }
        const site = siteResult.rows[0];
        const siteNo: string = site.SITE_NO;
        const isStaffOutsource: boolean = site.OT_TYPE === 'staff_outsource';

        const cvResult = await execute<any>(
            `SELECT factor_key, factor_value FROM cost_varient WHERE site_id = :site_id ORDER BY id`,
            { site_id: Number(site_id) }
        );
        const costFactors = (cvResult.rows || []).map((f: any) => {
            const num = parseFloat(f.FACTOR_VALUE);
            const isNum = !isNaN(num) && String(f.FACTOR_VALUE).trim() !== '';
            return { key: f.FACTOR_KEY, value: f.FACTOR_VALUE, numeric: isNum, amount: isNum ? num : 0 };
        });
        const costVariantTotal = costFactors.reduce((s: number, f: any) => s + f.amount, 0);

        const salaryResult = await execute<any>(
            `SELECT id, name,
                    COALESCE(basic_salary, 0) as basic_salary,
                    COALESCE(fix_salary, 0)   as fix_salary,
                    COALESCE(basic_salary, 0) + COALESCE(fix_salary, 0) as total_salary
             FROM users
             WHERE site_id = :site_id AND status = 'active'
             ORDER BY name`,
            { site_id: Number(site_id) }
        );
        const staffSalaries = salaryResult.rows || [];
        const totalSalary = staffSalaries.reduce((s: number, u: any) => s + Number(u.TOTAL_SALARY || 0), 0);

        let otTimeBased = 0;
        let otTargetBased = 0;

        if (!isStaffOutsource) {
            const otTimeResult = await execute<any>(
                `SELECT COALESCE(SUM(cor.total_payment), 0) as ot_total
                 FROM custom_ot_records cor
                 WHERE cor.site_no = :site_no
                   AND cor.date_from <= :date_to
                   AND cor.date_to   >= :date_from`,
                { site_no: siteNo, date_from, date_to }
            );
            otTimeBased = Number(otTimeResult.rows?.[0]?.OT_TOTAL || 0);

            const otTargetResult = await execute<any>(
                `SELECT COALESCE(SUM(extra_payment), 0) as ot_total
                 FROM payroll_saved_records
                 WHERE site_no = :site_no
                   AND date_from <= :date_to
                   AND date_to   >= :date_from`,
                { site_no: siteNo, date_from, date_to }
            );
            otTargetBased = Number(otTargetResult.rows?.[0]?.OT_TOTAL || 0);
        }

        const totalOT = otTimeBased + otTargetBased;

        // Extra OT hours for outsource sites: use same logic as payroll (getDayType + calculateTimeBasedExtra)
        let outsourceOtHours = 0;
        if (isStaffOutsource) {
            try {
                const poyaResult = await execute<any>(
                    `SELECT TO_CHAR(poya_date, 'YYYY-MM-DD') as poya_date FROM poya_days WHERE poya_date BETWEEN :date_from AND :date_to`,
                    { date_from, date_to }
                );
                const poyaDates = new Set<string>((poyaResult.rows || []).map((r: any) => String(r.POYA_DATE)));

                const attResult = await execute<any>(
                    `SELECT TO_CHAR(attendance_date, 'YYYY-MM-DD') as attendance_date, in_time, out_time
                     FROM attendance
                     WHERE site_id = :site_id
                       AND attendance_date >= :date_from
                       AND attendance_date <= :date_to
                       AND in_time IS NOT NULL
                       AND out_time IS NOT NULL`,
                    { site_id: Number(site_id), date_from, date_to }
                );

                outsourceOtHours = (attResult.rows || []).reduce((sum: number, row: any) => {
                    const dayType = getDayType(String(row.ATTENDANCE_DATE), poyaDates);
                    const extra = calculateTimeBasedExtra(
                        String(row.OUT_TIME), DEFAULT_OUT_TIME,
                        String(row.IN_TIME),  DEFAULT_IN_TIME,
                        dayType
                    );
                    return sum + extra;
                }, 0);
            } catch (otErr) {
                console.error('outsource OT hours fetch error (non-fatal):', otErr);
            }
        }

        let outsourceStaffLines: { ID: number; NAME: string; ATTEND_COUNT: number }[] = [];
        if (isStaffOutsource) {
            try {
                const attResult = await execute<any>(
                    `SELECT u.id, u.name,
                            COUNT(DISTINCT a.attendance_date) as attend_count
                     FROM users u
                     LEFT JOIN attendance a
                            ON  a.staff_id = u.id
                           AND  a.site_id  = :site_id
                           AND  a.attendance_date >= :date_from
                           AND  a.attendance_date <= :date_to
                     WHERE u.site_id = :site_id AND u.status = 'active'
                     GROUP BY u.id, u.name
                     ORDER BY u.name`,
                    { site_id: Number(site_id), date_from, date_to }
                );
                outsourceStaffLines = (attResult.rows || []).map((r: any) => ({
                    ID:           Number(r.ID)           || 0,
                    NAME:         String(r.NAME          || ''),
                    ATTEND_COUNT: Number(r.ATTEND_COUNT  || 0),
                }));
            } catch (attErr) {
                console.error('outsource attendance fetch error (non-fatal):', attErr);
            }
        }

        const taskResult = await execute<any>(
            `SELECT
                stt.task_name,
                COALESCE(COUNT(t.id), 0)            as row_count,
                COALESCE(SUM(COALESCE(t.count, 0)), 0) as sum_count,
                stt.invoice_price                   as unit_price
             FROM site_task_types stt
             LEFT JOIN tasks t
                ON  t.site_id  = stt.site_id
               AND  LOWER(TRIM(t.task_description)) = LOWER(TRIM(stt.task_name))
               AND  t.task_date >= :date_from
               AND  t.task_date <= :date_to
             WHERE stt.site_id = :site_id
             GROUP BY stt.task_name, stt.invoice_price
             ORDER BY stt.task_name`,
            { site_id: Number(site_id), date_from, date_to }
        );
        const taskLines = (taskResult.rows || []).map((row: any) => {
            const totalCount = isStaffOutsource
                ? Number(row.ROW_COUNT || 0)
                : Number(row.SUM_COUNT || 0);
            const unitPrice  = Number(row.UNIT_PRICE || 0);
            return {
                TASK_NAME:   row.TASK_NAME,
                TOTAL_COUNT: totalCount,
                UNIT_PRICE:  unitPrice,
                LINE_TOTAL:  totalCount * unitPrice,
            };
        });
        const totalInvoicePrice = taskLines.reduce((s: number, t: any) => s + t.LINE_TOTAL, 0);

        res.json({
            site: { ID: site.ID, SITE_NO: site.SITE_NO, NAME: site.NAME, OT_TYPE: site.OT_TYPE },
            date_from,
            date_to,
            cost_factors: costFactors,
            cost_variant_total: costVariantTotal,
            staff_salaries: staffSalaries,
            total_salary: totalSalary,
            ot_time_based: otTimeBased,
            ot_target_based: otTargetBased,
            total_ot: totalOT,
            salary_ot_amount: totalSalary + totalOT,
            task_lines: taskLines,
            total_invoice_price: totalInvoicePrice,
            outsource_staff_lines: outsourceStaffLines,
            outsource_ot_hours: outsourceOtHours,
        });
    } catch (err) {
        console.error('previewInvoice error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const saveInvoice = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const {
        site_id, site_no, site_name, date_from, date_to,
        cost_variants,
        salary_ot_amount,
        invoice_price,
    } = req.body;

    if (!site_id || !date_from || !date_to) {
        return res.status(400).json({ message: 'site_id, date_from, date_to are required' });
    }

    const variants: { key: string; value: string }[] =
        Array.isArray(cost_variants) ? cost_variants : [];

    const cost_variant_amount = variants.reduce((s, v) => {
        const n = parseFloat(v.value);
        return s + (isNaN(n) ? 0 : n);
    }, 0);

    try {
        for (const variant of variants) {
            const key   = String(variant.key).trim();
            const value = String(variant.value).trim();
            if (!key) continue;

            const existing = await execute<any>(
                `SELECT id FROM cost_varient WHERE site_id = :site_id AND factor_key = :key`,
                { site_id: Number(site_id), key }
            );

            if (existing.rows && existing.rows.length > 0) {
                await execute(
                    `UPDATE cost_varient SET factor_value = :value WHERE site_id = :site_id AND factor_key = :key`,
                    { site_id: Number(site_id), key, value }
                );
            } else {
                await execute(
                    `INSERT INTO cost_varient (site_id, factor_key, factor_value) VALUES (:site_id, :key, :value)`,
                    { site_id: Number(site_id), key, value }
                );
            }
        }

        const result = await execute<any>(
            `INSERT INTO profit_amount
                (site_id, site_no, site_name, date_from, date_to,
                 cost_variant_amount, salary_ot_amount, expense_cost, invoice_price, created_by)
             VALUES
                (:site_id, :site_no, :site_name,
                 :date_from, :date_to,
                 :cost_variant_amount, :salary_ot_amount, 0, :invoice_price, :created_by)
             RETURNING id`,
            {
                site_id:             Number(site_id),
                site_no:             site_no   || '',
                site_name:           site_name || '',
                date_from,
                date_to,
                cost_variant_amount: Math.round(cost_variant_amount * 100) / 100,
                salary_ot_amount:    Number(salary_ot_amount) || 0,
                invoice_price:       Number(invoice_price)    || 0,
                created_by:          userId,
            }
        );
        const newId = result.rows?.[0]?.ID;
        res.status(201).json({ message: 'Invoice saved', id: newId });
    } catch (err) {
        console.error('saveInvoice error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateInvoice = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { cost_variant_amount, salary_ot_amount, expense_cost, invoice_price } = req.body;
    try {
        await execute(
            `UPDATE profit_amount SET
                cost_variant_amount = :cost_variant_amount,
                salary_ot_amount    = :salary_ot_amount,
                expense_cost        = :expense_cost,
                invoice_price       = :invoice_price
             WHERE id = :id`,
            {
                cost_variant_amount: Number(cost_variant_amount) || 0,
                salary_ot_amount:    Number(salary_ot_amount)    || 0,
                expense_cost:        Number(expense_cost)        || 0,
                invoice_price:       Number(invoice_price)       || 0,
                id:                  String(id),
            }
        );
        res.json({ message: 'Invoice updated' });
    } catch (err) {
        console.error('updateInvoice error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteInvoice = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await execute(`DELETE FROM profit_amount WHERE id = :id`, [String(id)]);
        res.json({ message: 'Invoice deleted' });
    } catch (err) {
        console.error('deleteInvoice error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
