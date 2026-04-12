import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import oracledb from 'oracledb';

// GET /api/invoices — list all saved invoice records
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

// POST /api/invoices/preview — calculate invoice breakdown without saving
export const previewInvoice = async (req: Request, res: Response) => {
    const { site_id, date_from, date_to } = req.body;
    if (!site_id || !date_from || !date_to) {
        return res.status(400).json({ message: 'site_id, date_from, date_to are required' });
    }

    try {
        // 1. Site info
        const siteResult = await execute<any>(
            `SELECT id, site_no, name, ot_type FROM sites WHERE id = :id`,
            [String(site_id)]
        );
        if (!siteResult.rows || siteResult.rows.length === 0) {
            return res.status(404).json({ message: 'Site not found' });
        }
        const site = siteResult.rows[0];
        const siteNo: string = site.SITE_NO;
        // staff_outsource sites: no OT — invoice uses basic + fix salary only
        const isStaffOutsource: boolean = site.OT_TYPE === 'staff_outsource';

        // 2. Cost variants — fetch all factors, sum numeric ones
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

        // 3. Staff salaries (basic_salary + fix_salary) for active staff at site
        const salaryResult = await execute<any>(
            `SELECT id, name,
                    NVL(basic_salary, 0) as basic_salary,
                    NVL(fix_salary, 0)   as fix_salary,
                    NVL(basic_salary, 0) + NVL(fix_salary, 0) as total_salary
             FROM users
             WHERE site_id = :site_id AND status = 'active'
             ORDER BY name`,
            { site_id: Number(site_id) }
        );
        const staffSalaries = salaryResult.rows || [];
        const totalSalary = staffSalaries.reduce((s: number, u: any) => s + Number(u.TOTAL_SALARY || 0), 0);

        // 4. OT — skipped entirely for staff_outsource sites
        let otTimeBased = 0;
        let otTargetBased = 0;

        if (!isStaffOutsource) {
            // 4a. Time-based OT from custom_ot_records (date range overlap)
            const otTimeResult = await execute<any>(
                `SELECT NVL(SUM(cor.total_payment), 0) as ot_total
                 FROM custom_ot_records cor
                 WHERE cor.site_no = :site_no
                   AND cor.date_from <= TO_DATE(:date_to,   'YYYY-MM-DD')
                   AND cor.date_to   >= TO_DATE(:date_from, 'YYYY-MM-DD')`,
                { site_no: siteNo, date_from, date_to }
            );
            otTimeBased = Number(otTimeResult.rows?.[0]?.OT_TOTAL || 0);

            // 4b. Target-based OT from payroll_saved_records (date range overlap)
            const otTargetResult = await execute<any>(
                `SELECT NVL(SUM(extra_payment), 0) as ot_total
                 FROM payroll_saved_records
                 WHERE site_no = :site_no
                   AND date_from <= TO_DATE(:date_to,   'YYYY-MM-DD')
                   AND date_to   >= TO_DATE(:date_from, 'YYYY-MM-DD')`,
                { site_no: siteNo, date_from, date_to }
            );
            otTargetBased = Number(otTargetResult.rows?.[0]?.OT_TOTAL || 0);
        }

        const totalOT = otTimeBased + otTargetBased;

        // 5. Invoice price: drive from site_task_types, LEFT JOIN tasks.
        //    staff_outsource behaves like time_based for task row counting.
        const taskResult = await execute<any>(
            `SELECT
                stt.task_name,
                NVL(COUNT(t.id), 0)            as row_count,
                NVL(SUM(NVL(t.count, 0)), 0)   as sum_count,
                stt.invoice_price               as unit_price
             FROM site_task_types stt
             LEFT JOIN tasks t
                ON  t.site_id  = stt.site_id
               AND  LOWER(TRIM(t.task_description)) = LOWER(TRIM(stt.task_name))
               AND  t.task_date >= TO_DATE(:date_from, 'YYYY-MM-DD')
               AND  t.task_date <= TO_DATE(:date_to,   'YYYY-MM-DD')
             WHERE stt.site_id = :site_id
             GROUP BY stt.task_name, stt.invoice_price
             ORDER BY stt.task_name`,
            { site_id: Number(site_id), date_from, date_to }
        );
        // staff_outsource: count task rows (headcount per task)
        // time_based and target_based: sum the count column (actual units done)
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
        });
    } catch (err) {
        console.error('previewInvoice error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// POST /api/invoices — save an invoice record
export const saveInvoice = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { site_id, site_no, site_name, date_from, date_to,
            cost_variant_amount, salary_ot_amount, expense_cost, invoice_price } = req.body;

    if (!site_id || !date_from || !date_to) {
        return res.status(400).json({ message: 'site_id, date_from, date_to are required' });
    }

    try {
        const result = await execute<any>(
            `INSERT INTO profit_amount
                (site_id, site_no, site_name, date_from, date_to,
                 cost_variant_amount, salary_ot_amount, expense_cost, invoice_price, created_by)
             VALUES
                (:site_id, :site_no, :site_name,
                 TO_DATE(:date_from, 'YYYY-MM-DD'), TO_DATE(:date_to, 'YYYY-MM-DD'),
                 :cost_variant_amount, :salary_ot_amount, :expense_cost, :invoice_price, :created_by)
             RETURNING id INTO :id`,
            {
                site_id: Number(site_id),
                site_no: site_no || '',
                site_name: site_name || '',
                date_from,
                date_to,
                cost_variant_amount: Number(cost_variant_amount) || 0,
                salary_ot_amount: Number(salary_ot_amount) || 0,
                expense_cost: Number(expense_cost) || 0,
                invoice_price: Number(invoice_price) || 0,
                created_by: userId,
                id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
            }
        );
        const newId = result.outBinds?.id?.[0];
        res.status(201).json({ message: 'Invoice saved', id: newId });
    } catch (err) {
        console.error('saveInvoice error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// PUT /api/invoices/:id — update saved amounts
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

// DELETE /api/invoices/:id
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
