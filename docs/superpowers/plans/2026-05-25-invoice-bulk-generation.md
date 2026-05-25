# Invoice Bulk Generation & Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bulk invoice generation (one click for all sites), date-range filtering on the invoice list, and This Month / Last Month / Custom date presets on the Invoice Analysis page.

**Architecture:** Three backend changes (new `bulkGenerateInvoices` endpoint, `getInvoices` date filter, `getInvoiceAnalysis` date params) and two frontend changes (`Invoices.tsx` for bulk modal + filter, `InvoiceAnalysis.tsx` for preset tabs). The bulk endpoint reuses an extracted `computePreview` helper to avoid duplicating the existing preview logic.

**Tech Stack:** React 18 + TypeScript + Tailwind + lucide-react + date-fns (client); Express + PostgreSQL + `execute()` named params (server).

---

## File Map

| Action | Path |
|--------|------|
| Modify | `server/src/controllers/invoiceController.ts` |
| Modify | `server/src/routes/invoiceRoutes.ts` |
| Modify | `server/src/controllers/analyticsController.ts` |
| Modify | `client/src/pages/Invoices.tsx` |
| Modify | `client/src/pages/InvoiceAnalysis.tsx` |

---

## Codebase facts (read before coding)

**`execute()` uses named params:** `:paramName` syntax. Returns `{ rows: any[] }` with **uppercase** column names from the DB driver.

**`profit_amount` columns:** `id, site_id, site_no, site_name, date_from, date_to, cost_variant_amount, salary_ot_amount, expense_cost, invoice_price, created_at, created_by`

**Existing `previewInvoice`** (lines 29-212 of `invoiceController.ts`) contains all the calculation logic — cost variants, staff salaries, OT amounts, task lines. It takes `site_id`, `date_from`, `date_to` from `req.body` and returns a preview JSON. This logic will be extracted into a `computePreview(siteId, dateFrom, dateTo)` helper so both `previewInvoice` and `bulkGenerateInvoices` can share it.

**`getInvoiceAnalysis`** (lines 786-936 of `analyticsController.ts`) runs 4 parallel queries on `profit_amount` with no WHERE clause. All 4 need an optional date filter added.

**`AuthRequest`** pattern: `(req as any).user.id` is used in `saveInvoice` and should be used in `bulkGenerateInvoices` for `created_by`.

---

## Task 1: Backend — invoice controller, routes, analytics

**Files:**
- Modify: `server/src/controllers/invoiceController.ts`
- Modify: `server/src/routes/invoiceRoutes.ts`
- Modify: `server/src/controllers/analyticsController.ts`

- [ ] **Step 1: Extract `computePreview` helper in invoiceController.ts**

Read `server/src/controllers/invoiceController.ts` first. Then add this function **before** `export const previewInvoice` (i.e. after the `DEFAULT_OUT_TIME` constant on line 6):

```ts
async function computePreview(siteId: number, dateFrom: string, dateTo: string) {
    const siteResult = await execute<any>(
        `SELECT id, site_no, name, ot_type FROM sites WHERE id = :id`,
        [String(siteId)]
    );
    if (!siteResult.rows || siteResult.rows.length === 0) {
        throw new Error(`Site ${siteId} not found`);
    }
    const site = siteResult.rows[0];
    const siteNo: string = site.SITE_NO;
    const isStaffOutsource: boolean = site.OT_TYPE === 'staff_outsource';

    const cvResult = await execute<any>(
        `SELECT factor_key, factor_value FROM cost_varient WHERE site_id = :site_id ORDER BY id`,
        { site_id: siteId }
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
        { site_id: siteId }
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
            { site_no: siteNo, date_from: dateFrom, date_to: dateTo }
        );
        otTimeBased = Number(otTimeResult.rows?.[0]?.OT_TOTAL || 0);

        const otTargetResult = await execute<any>(
            `SELECT COALESCE(SUM(extra_payment), 0) as ot_total
             FROM payroll_saved_records
             WHERE site_no = :site_no
               AND date_from <= :date_to
               AND date_to   >= :date_from`,
            { site_no: siteNo, date_from: dateFrom, date_to: dateTo }
        );
        otTargetBased = Number(otTargetResult.rows?.[0]?.OT_TOTAL || 0);
    }

    const totalOT = otTimeBased + otTargetBased;

    let outsourceOtHours = 0;
    if (isStaffOutsource) {
        try {
            const poyaResult = await execute<any>(
                `SELECT TO_CHAR(poya_date, 'YYYY-MM-DD') as poya_date FROM poya_days WHERE poya_date BETWEEN :date_from AND :date_to`,
                { date_from: dateFrom, date_to: dateTo }
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
                { site_id: siteId, date_from: dateFrom, date_to: dateTo }
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
                { site_id: siteId, date_from: dateFrom, date_to: dateTo }
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
            COALESCE(COUNT(t.id), 0)               as row_count,
            COALESCE(SUM(COALESCE(t.count, 0)), 0) as sum_count,
            stt.invoice_price                      as unit_price
         FROM site_task_types stt
         LEFT JOIN tasks t
            ON  t.site_id  = stt.site_id
           AND  LOWER(TRIM(t.task_description)) = LOWER(TRIM(stt.task_name))
           AND  t.task_date >= :date_from
           AND  t.task_date <= :date_to
         WHERE stt.site_id = :site_id
         GROUP BY stt.task_name, stt.invoice_price
         ORDER BY stt.task_name`,
        { site_id: siteId, date_from: dateFrom, date_to: dateTo }
    );
    const taskLines = (taskResult.rows || []).map((row: any) => {
        const totalCount = isStaffOutsource ? Number(row.ROW_COUNT || 0) : Number(row.SUM_COUNT || 0);
        const unitPrice  = Number(row.UNIT_PRICE || 0);
        return {
            TASK_NAME:   row.TASK_NAME,
            TOTAL_COUNT: totalCount,
            UNIT_PRICE:  unitPrice,
            LINE_TOTAL:  totalCount * unitPrice,
        };
    });
    const totalInvoicePrice = taskLines.reduce((s: number, t: any) => s + t.LINE_TOTAL, 0);

    return {
        site,
        date_from: dateFrom,
        date_to:   dateTo,
        cost_factors:         costFactors,
        cost_variant_total:   costVariantTotal,
        staff_salaries:       staffSalaries,
        total_salary:         totalSalary,
        ot_time_based:        otTimeBased,
        ot_target_based:      otTargetBased,
        total_ot:             totalOT,
        salary_ot_amount:     totalSalary + totalOT,
        task_lines:           taskLines,
        total_invoice_price:  totalInvoicePrice,
        outsource_staff_lines: outsourceStaffLines,
        outsource_ot_hours:   outsourceOtHours,
    };
}
```

- [ ] **Step 2: Refactor `previewInvoice` to use `computePreview`**

Replace the entire `previewInvoice` function body (lines 29-212) with:

```ts
export const previewInvoice = async (req: Request, res: Response) => {
    const { site_id, date_from, date_to } = req.body;
    if (!site_id || !date_from || !date_to) {
        return res.status(400).json({ message: 'site_id, date_from, date_to are required' });
    }
    try {
        const result = await computePreview(Number(site_id), String(date_from), String(date_to));
        res.json({
            site: { ID: result.site.ID, SITE_NO: result.site.SITE_NO, NAME: result.site.NAME, OT_TYPE: result.site.OT_TYPE },
            date_from: result.date_from,
            date_to:   result.date_to,
            cost_factors:          result.cost_factors,
            cost_variant_total:    result.cost_variant_total,
            staff_salaries:        result.staff_salaries,
            total_salary:          result.total_salary,
            ot_time_based:         result.ot_time_based,
            ot_target_based:       result.ot_target_based,
            total_ot:              result.total_ot,
            salary_ot_amount:      result.salary_ot_amount,
            task_lines:            result.task_lines,
            total_invoice_price:   result.total_invoice_price,
            outsource_staff_lines: result.outsource_staff_lines,
            outsource_ot_hours:    result.outsource_ot_hours,
        });
    } catch (err) {
        console.error('previewInvoice error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
```

- [ ] **Step 3: Add `bulkGenerateInvoices` to invoiceController.ts**

Append after `previewInvoice`:

```ts
export const bulkGenerateInvoices = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { date_from, date_to } = req.body;
    if (!date_from || !date_to) {
        return res.status(400).json({ message: 'date_from and date_to are required' });
    }

    try {
        const sitesRes = await execute<any>(
            `SELECT id, site_no, name FROM sites WHERE status = 'active' ORDER BY site_no`,
            {}
        );
        const sites = sitesRes.rows || [];

        const skipped: string[] = [];
        let generated = 0;

        for (const site of sites) {
            const siteId   = Number(site.ID);
            const siteNo   = String(site.SITE_NO);
            const siteName = String(site.NAME);

            const existing = await execute<any>(
                `SELECT id FROM profit_amount
                 WHERE site_id   = :site_id
                   AND date_from = :date_from
                   AND date_to   = :date_to`,
                { site_id: siteId, date_from: String(date_from), date_to: String(date_to) }
            );
            if (existing.rows && existing.rows.length > 0) {
                skipped.push(siteName);
                continue;
            }

            try {
                const preview = await computePreview(siteId, String(date_from), String(date_to));
                await execute(
                    `INSERT INTO profit_amount
                        (site_id, site_no, site_name, date_from, date_to,
                         cost_variant_amount, salary_ot_amount, expense_cost, invoice_price, created_by)
                     VALUES
                        (:site_id, :site_no, :site_name, :date_from, :date_to,
                         :cost_variant_amount, :salary_ot_amount, 0, :invoice_price, :created_by)`,
                    {
                        site_id:             siteId,
                        site_no:             siteNo,
                        site_name:           siteName,
                        date_from:           String(date_from),
                        date_to:             String(date_to),
                        cost_variant_amount: Math.round(preview.cost_variant_total    * 100) / 100,
                        salary_ot_amount:    Math.round(preview.salary_ot_amount      * 100) / 100,
                        invoice_price:       Math.round(preview.total_invoice_price   * 100) / 100,
                        created_by:          userId,
                    }
                );
                generated++;
            } catch (siteErr) {
                console.error(`bulkGenerate: failed for site ${siteNo}:`, siteErr);
                skipped.push(`${siteName} (error)`);
            }
        }

        res.json({ generated, skipped });
    } catch (err) {
        console.error('bulkGenerateInvoices error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
```

- [ ] **Step 4: Update `getInvoices` to accept date filter params**

Replace the `getInvoices` function (lines 8-27) with:

```ts
export const getInvoices = async (req: Request, res: Response) => {
    const { date_from, date_to } = req.query;
    try {
        const hasFilter = date_from && date_to;
        const whereSql  = hasFilter
            ? `WHERE pa.date_from >= :date_from AND pa.date_to <= :date_to`
            : '';
        const params: Record<string, string> = hasFilter
            ? { date_from: String(date_from), date_to: String(date_to) }
            : {};

        const result = await execute<any>(
            `SELECT pa.id, pa.site_id, pa.site_no, pa.site_name,
                    TO_CHAR(pa.date_from, 'YYYY-MM-DD') as date_from,
                    TO_CHAR(pa.date_to,   'YYYY-MM-DD') as date_to,
                    pa.cost_variant_amount, pa.salary_ot_amount,
                    pa.expense_cost, pa.invoice_price,
                    pa.created_at, u.name as created_by_name
             FROM profit_amount pa
             LEFT JOIN users u ON pa.created_by = u.id
             ${whereSql}
             ORDER BY pa.created_at DESC`,
            params
        );
        res.json(result.rows || []);
    } catch (err) {
        console.error('getInvoices error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
```

- [ ] **Step 5: Wire `POST /bulk-generate` in invoiceRoutes.ts**

Read `server/src/routes/invoiceRoutes.ts`. Replace with:

```ts
import { Router } from 'express';
import {
    getInvoices, previewInvoice, saveInvoice, updateInvoice, deleteInvoice,
    bulkGenerateInvoices,
} from '../controllers/invoiceController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['admin', 'system_admin']));

router.get('/',                 getInvoices);
router.post('/preview',         previewInvoice);
router.post('/bulk-generate',   bulkGenerateInvoices);
router.post('/',                saveInvoice);
router.put('/:id',              updateInvoice);
router.delete('/:id',           deleteInvoice);

export default router;
```

- [ ] **Step 6: Add date filter to `getInvoiceAnalysis` in analyticsController.ts**

Read `server/src/controllers/analyticsController.ts` lines 786-936. Replace the `getInvoiceAnalysis` function with:

```ts
export const getInvoiceAnalysis = async (req: Request, res: Response) => {
    try {
        const { date_from, date_to } = req.query;
        const hasFilter = date_from && date_to;

        // Default to current month when no params provided
        const now        = new Date();
        const df = hasFilter ? String(date_from) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const dt = hasFilter ? String(date_to)   : new Date().toISOString().slice(0, 10);

        const filterWhere   = `WHERE date_from >= :df AND date_to <= :dt`;
        const filterWherePA = `WHERE pa.date_from >= :df AND pa.date_to <= :dt`;
        const filterParams  = { df, dt };

        const [summaryRes, monthlyRes, siteRes, quarterlyRes] = await Promise.all([

            execute<any>(
                `SELECT
                    COUNT(*)                                                                        AS total_invoices,
                    COALESCE(SUM(invoice_price), 0)                                                 AS total_revenue,
                    COALESCE(SUM(cost_variant_amount + salary_ot_amount + expense_cost), 0)         AS total_cost,
                    COALESCE(SUM(invoice_price - cost_variant_amount - salary_ot_amount - expense_cost), 0) AS net_profit,
                    COALESCE(AVG(invoice_price), 0)                                                 AS avg_invoice_value,
                    COALESCE(SUM(cost_variant_amount), 0)                                           AS total_cost_variant,
                    COALESCE(SUM(salary_ot_amount),    0)                                           AS total_salary_ot,
                    COALESCE(SUM(expense_cost),        0)                                           AS total_expense,
                    COUNT(DISTINCT site_id)                                                         AS site_count
                 FROM profit_amount
                 ${filterWhere}`,
                filterParams
            ),

            execute<any>(
                `SELECT
                    TO_CHAR(date_to, 'YYYY-MM')                                                     AS month,
                    COUNT(*)                                                                        AS invoice_count,
                    COALESCE(SUM(invoice_price), 0)                                                 AS total_revenue,
                    COALESCE(SUM(cost_variant_amount + salary_ot_amount + expense_cost), 0)         AS total_cost,
                    COALESCE(SUM(invoice_price - cost_variant_amount - salary_ot_amount - expense_cost), 0) AS net_profit,
                    COALESCE(SUM(cost_variant_amount), 0)                                           AS total_cost_variant,
                    COALESCE(SUM(salary_ot_amount),    0)                                           AS total_salary_ot,
                    COALESCE(SUM(expense_cost),        0)                                           AS total_expense
                 FROM profit_amount
                 ${filterWhere}
                 GROUP BY TO_CHAR(date_to, 'YYYY-MM')
                 ORDER BY month`,
                filterParams
            ),

            execute<any>(
                `SELECT
                    pa.site_no,
                    pa.site_name,
                    COALESCE(s.service_type, 'Unset')                                               AS service_type,
                    COALESCE(s.site_type,    'Unset')                                               AS site_type,
                    COALESCE(s.ot_type,      'time_based')                                          AS ot_type,
                    COUNT(pa.id)                                                                    AS invoice_count,
                    COALESCE(SUM(pa.invoice_price), 0)                                              AS total_revenue,
                    COALESCE(SUM(pa.cost_variant_amount + pa.salary_ot_amount + pa.expense_cost), 0) AS total_cost,
                    COALESCE(SUM(pa.invoice_price - pa.cost_variant_amount - pa.salary_ot_amount - pa.expense_cost), 0) AS net_profit,
                    COALESCE(SUM(pa.cost_variant_amount), 0)                                        AS total_cost_variant,
                    COALESCE(SUM(pa.salary_ot_amount),    0)                                        AS total_salary_ot,
                    COALESCE(SUM(pa.expense_cost),        0)                                        AS total_expense,
                    MIN(TO_CHAR(pa.date_from, 'YYYY-MM-DD'))                                        AS first_invoice_date,
                    MAX(TO_CHAR(pa.date_to,   'YYYY-MM-DD'))                                        AS last_invoice_date
                 FROM profit_amount pa
                 LEFT JOIN sites s ON s.id = pa.site_id
                 ${filterWherePA}
                 GROUP BY pa.site_no, pa.site_name, s.service_type, s.site_type, s.ot_type
                 ORDER BY total_revenue DESC`,
                filterParams
            ),

            execute<any>(
                `SELECT
                    TO_CHAR(date_to, 'YYYY') || '-Q' || TO_CHAR(date_to, 'Q') AS quarter,
                    COUNT(*)                                                    AS invoice_count,
                    COALESCE(SUM(invoice_price), 0)                             AS total_revenue,
                    COALESCE(SUM(cost_variant_amount + salary_ot_amount + expense_cost), 0) AS total_cost,
                    COALESCE(SUM(invoice_price - cost_variant_amount - salary_ot_amount - expense_cost), 0) AS net_profit
                 FROM profit_amount
                 ${filterWhere}
                 GROUP BY TO_CHAR(date_to, 'YYYY') || '-Q' || TO_CHAR(date_to, 'Q')
                 ORDER BY quarter`,
                filterParams
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
                site_no:       r.SITE_NO,
                site_name:     r.SITE_NAME,
                service_type:  r.SERVICE_TYPE || 'Unset',
                site_type:     r.SITE_TYPE    || 'Unset',
                ot_type:       r.OT_TYPE      || 'time_based',
                invoice_count: Number(r.INVOICE_COUNT  || 0),
                total_revenue: rev,
                total_cost:    cost,
                net_profit:    profit,
                cost_variant:  Number(r.TOTAL_COST_VARIANT || 0),
                salary_ot:     Number(r.TOTAL_SALARY_OT    || 0),
                expense:       Number(r.TOTAL_EXPENSE      || 0),
                profit_margin: rev > 0 ? Math.round((profit / rev) * 1000) / 10 : 0,
                first_invoice: r.FIRST_INVOICE_DATE,
                last_invoice:  r.LAST_INVOICE_DATE,
            };
        });

        res.json({
            summary: {
                total_invoices:     Number(s.TOTAL_INVOICES    || 0),
                total_revenue:      totalRevenue,
                total_cost:         totalCost,
                net_profit:         netProfit,
                avg_invoice_value:  Number(s.AVG_INVOICE_VALUE || 0),
                profit_margin:      totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0,
                site_count:         Number(s.SITE_COUNT        || 0),
                total_cost_variant: cvTotal,
                total_salary_ot:    soTotal,
                total_expense:      expTotal,
                profitable_sites:   sites.filter(x => x.net_profit > 0).length,
                loss_sites:         sites.filter(x => x.net_profit < 0).length,
            },
            costStructure: [
                { name: 'Cost Variants', value: cvTotal,  pct: totalRevenue > 0 ? Math.round((cvTotal  / totalRevenue) * 1000) / 10 : 0, fill: '#f59e0b' },
                { name: 'Salary + OT',   value: soTotal,  pct: totalRevenue > 0 ? Math.round((soTotal  / totalRevenue) * 1000) / 10 : 0, fill: '#8b5cf6' },
                { name: 'Expense',       value: expTotal, pct: totalRevenue > 0 ? Math.round((expTotal / totalRevenue) * 1000) / 10 : 0, fill: '#64748b' },
                { name: 'Net Profit',    value: netProfit > 0 ? netProfit : 0,
                  pct: totalRevenue > 0 ? Math.round((Math.max(netProfit, 0) / totalRevenue) * 1000) / 10 : 0, fill: '#10b981' },
            ],
            monthlyTrend: (monthlyRes.rows || []).map((r: any) => ({
                month:         r.MONTH,
                invoice_count: Number(r.INVOICE_COUNT  || 0),
                total_revenue: Number(r.TOTAL_REVENUE  || 0),
                total_cost:    Number(r.TOTAL_COST     || 0),
                net_profit:    Number(r.NET_PROFIT     || 0),
                cost_variant:  Number(r.TOTAL_COST_VARIANT || 0),
                salary_ot:     Number(r.TOTAL_SALARY_OT    || 0),
                expense:       Number(r.TOTAL_EXPENSE      || 0),
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
```

- [ ] **Step 7: TypeScript check**

```powershell
cd d:\Project\DOK-HR\server; npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add server/src/controllers/invoiceController.ts server/src/routes/invoiceRoutes.ts server/src/controllers/analyticsController.ts
git commit -m "feat: add bulk invoice generation, date filter on list and analysis endpoints"
```

---

## Task 2: Frontend — Invoices.tsx

**Files:**
- Modify: `client/src/pages/Invoices.tsx`

- [ ] **Step 1: Add new state variables**

Read `client/src/pages/Invoices.tsx`. Find the block of `useState` declarations (around lines 29-53). Add these new state variables after the existing ones:

```tsx
// ── Bulk generate modal ──
const [bulkModalOpen, setBulkModalOpen] = useState(false);
const [bulkFrom,      setBulkFrom]      = useState('');
const [bulkTo,        setBulkTo]        = useState('');
const [bulkLoading,   setBulkLoading]   = useState(false);

// ── Invoice list date filter ──
const [filterFrom,   setFilterFrom]   = useState('');
const [filterTo,     setFilterTo]     = useState('');
const [filterActive, setFilterActive] = useState(false);
```

- [ ] **Step 2: Update `fetchInvoices` to accept date filter params**

Find the `fetchInvoices` function (look for `api.get('/invoices')`). Replace it with:

```tsx
const fetchInvoices = async (dateFrom?: string, dateTo?: string) => {
    try {
        const params: Record<string, string> = {};
        if (dateFrom && dateTo) {
            params.date_from = dateFrom;
            params.date_to   = dateTo;
        }
        const res = await api.get<InvoiceRecord[]>('/invoices', { params });
        setInvoices(res.data);
    } catch (err) {
        console.error('fetchInvoices error:', err);
    }
};
```

Also update the `useEffect` call that fetches invoices on mount — it should stay as `fetchInvoices()` (no args, loads all).

- [ ] **Step 3: Add `handleFilterSearch` and `handleFilterClear` handlers**

Add these two handlers after `fetchInvoices`:

```tsx
const handleFilterSearch = () => {
    if (!filterFrom || !filterTo) return;
    setFilterActive(true);
    fetchInvoices(filterFrom, filterTo);
};

const handleFilterClear = () => {
    setFilterFrom('');
    setFilterTo('');
    setFilterActive(false);
    fetchInvoices();
};
```

- [ ] **Step 4: Add `handleBulkGenerate` handler**

Add after `handleFilterClear`:

```tsx
const handleBulkGenerate = async () => {
    if (!bulkFrom || !bulkTo) return;
    setBulkLoading(true);
    try {
        const res = await api.post<{ generated: number; skipped: string[] }>(
            '/invoices/bulk-generate',
            { date_from: bulkFrom, date_to: bulkTo }
        );
        const { generated, skipped } = res.data;
        if (generated === 0 && skipped.length > 0) {
            toast(`0 generated — all sites already have invoices for this period.`, { icon: 'ℹ️' });
        } else if (skipped.length > 0) {
            toast.success(`${generated} invoice${generated !== 1 ? 's' : ''} generated. ${skipped.length} skipped (already exist): ${skipped.join(', ')}`);
        } else {
            toast.success(`${generated} invoice${generated !== 1 ? 's' : ''} generated.`);
        }
        setBulkModalOpen(false);
        fetchInvoices(filterActive ? filterFrom : undefined, filterActive ? filterTo : undefined);
    } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        toast.error(e.response?.data?.message ?? 'Bulk generation failed');
    } finally {
        setBulkLoading(false);
    }
};
```

- [ ] **Step 5: Add "Generate All Sites" button to the header**

Find the header section (around line 395-405). It currently has one "Generate Invoice" button. Add the "Generate All Sites" button alongside it:

Replace:
```tsx
<button onClick={openModal}
    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all shadow-sm text-sm">
    <Plus className="w-4 h-4" /> Generate Invoice
</button>
```

With:
```tsx
<div className="flex items-center gap-2">
    <button onClick={() => {
        const today = new Date().toISOString().slice(0, 10);
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
        setBulkFrom(firstOfMonth);
        setBulkTo(today);
        setBulkModalOpen(true);
    }}
        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all shadow-sm text-sm">
        <TrendingUp className="w-4 h-4" /> Generate All Sites
    </button>
    <button onClick={openModal}
        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all shadow-sm text-sm">
        <Plus className="w-4 h-4" /> Generate Invoice
    </button>
</div>
```

`TrendingUp` is already imported in `Invoices.tsx` — check the import line and add it if missing.

- [ ] **Step 6: Add date filter bar above the invoice table**

Find the summary cards section (around line 407). Add the date filter bar **between** the summary cards and the table. Insert this block after the summary cards `</div>`:

```tsx
{/* Date filter bar */}
<div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
    <div className="flex flex-wrap items-end gap-3">
        <div>
            <label className="form-label">From</label>
            <input type="date" value={filterFrom}
                onChange={e => setFilterFrom(e.target.value)}
                className="form-input" />
        </div>
        <div>
            <label className="form-label">To</label>
            <input type="date" value={filterTo}
                onChange={e => setFilterTo(e.target.value)}
                className="form-input" />
        </div>
        <button type="button" onClick={handleFilterSearch}
            disabled={!filterFrom || !filterTo}
            className="btn btn-primary flex items-center gap-2">
            <Search className="w-4 h-4" /> Search
        </button>
        {filterActive && (
            <button type="button" onClick={handleFilterClear}
                className="btn btn-ghost flex items-center gap-2 text-slate-500">
                <X className="w-4 h-4" /> Clear
            </button>
        )}
        {filterActive && (
            <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2.5 py-1 rounded-full">
                Filtered: {filterFrom} → {filterTo}
            </span>
        )}
    </div>
</div>
```

`Search` and `X` are already imported in `Invoices.tsx`.

- [ ] **Step 7: Add bulk generate modal**

Add this modal JSX right before the closing `</div>` of the main `return` block (after the existing edit modal and generate modal):

```tsx
{/* Bulk Generate Modal */}
{bulkModalOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !bulkLoading && setBulkModalOpen(false)} />
        <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <h2 className="text-[15px] font-bold text-slate-900">Generate All Sites</h2>
                </div>
                <button type="button" onClick={() => setBulkModalOpen(false)} disabled={bulkLoading}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
                <p className="text-[13px] text-slate-500">
                    Generates invoices for all active sites using calculated defaults. Sites that already have an invoice for this date range are skipped.
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="form-label">Date From</label>
                        <input type="date" value={bulkFrom}
                            onChange={e => setBulkFrom(e.target.value)}
                            className="form-input" />
                    </div>
                    <div>
                        <label className="form-label">Date To</label>
                        <input type="date" value={bulkTo}
                            onChange={e => setBulkTo(e.target.value)}
                            className="form-input" />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
                <button type="button" onClick={() => setBulkModalOpen(false)} disabled={bulkLoading}
                    className="btn btn-ghost">
                    Cancel
                </button>
                <button type="button" onClick={handleBulkGenerate}
                    disabled={bulkLoading || !bulkFrom || !bulkTo}
                    className="btn btn-primary flex items-center gap-2">
                    {bulkLoading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                        : <><TrendingUp className="w-4 h-4" /> Generate</>
                    }
                </button>
            </div>
        </div>
    </div>
)}
```

- [ ] **Step 8: TypeScript check**

```powershell
cd d:\Project\DOK-HR\client; npx tsc --noEmit
```

Expected: 0 errors. If `TrendingUp` import is missing from `Invoices.tsx`, add it to the lucide-react import line.

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/Invoices.tsx
git commit -m "feat: add bulk generate modal and date filter to Invoices page"
```

---

## Task 3: Frontend — InvoiceAnalysis.tsx

**Files:**
- Modify: `client/src/pages/InvoiceAnalysis.tsx`

- [ ] **Step 1: Add date preset state and imports**

Read `client/src/pages/InvoiceAnalysis.tsx`. At the top add `startOfMonth`, `subMonths`, `endOfMonth`, `format` to the imports:

```tsx
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
```

Add a new type and state variables inside the `InvoiceAnalysis` component, after the existing `useState` declarations (after line 28):

```tsx
type DatePreset = 'this_month' | 'last_month' | 'custom';

const [datePreset,  setDatePreset]  = useState<DatePreset>('this_month');
const [customFrom,  setCustomFrom]  = useState('');
const [customTo,    setCustomTo]    = useState('');
```

- [ ] **Step 2: Replace `useEffect` with a `fetchData` function**

Remove the existing `useEffect` (lines 30-35):
```tsx
useEffect(() => {
    api.get('/analytics/invoice-analysis')
        .then(r => setIa(r.data))
        .catch(e => console.error('invoice-analysis error', e))
        .finally(() => setLoading(false));
}, []);
```

Replace with:
```tsx
const fetchData = (df: string, dt: string) => {
    setLoading(true);
    setIa(null);
    api.get('/analytics/invoice-analysis', { params: { date_from: df, date_to: dt } })
        .then(r => setIa(r.data))
        .catch(e => console.error('invoice-analysis error', e))
        .finally(() => setLoading(false));
};

useEffect(() => {
    const now   = new Date();
    const df    = format(startOfMonth(now), 'yyyy-MM-dd');
    const dt    = format(now, 'yyyy-MM-dd');
    fetchData(df, dt);
}, []);
```

- [ ] **Step 3: Add `handlePresetChange` handler**

Add after the `fetchData` function:

```tsx
const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset === 'this_month') {
        const now = new Date();
        fetchData(format(startOfMonth(now), 'yyyy-MM-dd'), format(now, 'yyyy-MM-dd'));
    } else if (preset === 'last_month') {
        const last = subMonths(new Date(), 1);
        fetchData(format(startOfMonth(last), 'yyyy-MM-dd'), format(endOfMonth(last), 'yyyy-MM-dd'));
    }
    // 'custom' — wait for Load button
};
```

- [ ] **Step 4: Add preset tabs to the page header**

Find the page header section (around lines 102-111 — the `<div className="flex items-center gap-3">` block). Add the preset tabs **after** the page header block, before the KPI cards:

```tsx
{/* Date preset tabs */}
<div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
    <div className="flex flex-wrap items-end gap-3">
        {/* Preset buttons */}
        <div className="flex gap-1.5">
            {([
                { id: 'this_month' as const,  label: 'This Month' },
                { id: 'last_month' as const,  label: 'Last Month' },
                { id: 'custom'     as const,  label: 'Custom Range' },
            ]).map(p => (
                <button key={p.id} type="button"
                    onClick={() => handlePresetChange(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        datePreset === p.id
                            ? 'bg-green-700 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {p.label}
                </button>
            ))}
        </div>

        {/* Custom date inputs */}
        {datePreset === 'custom' && (
            <>
                <div>
                    <label className="form-label">From</label>
                    <input type="date" value={customFrom}
                        onChange={e => setCustomFrom(e.target.value)}
                        className="form-input" />
                </div>
                <div>
                    <label className="form-label">To</label>
                    <input type="date" value={customTo}
                        onChange={e => setCustomTo(e.target.value)}
                        className="form-input" />
                </div>
                <button type="button"
                    disabled={!customFrom || !customTo || loading}
                    onClick={() => fetchData(customFrom, customTo)}
                    className="btn btn-primary flex items-center gap-2">
                    {loading
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Search className="w-4 h-4" />
                    }
                    Load
                </button>
            </>
        )}
    </div>
</div>
```

`Loader2` and `Search` need to be added to the lucide-react import in `InvoiceAnalysis.tsx`:

```tsx
import {
    DollarSign, FileDown, Search, X, Loader2,
} from 'lucide-react';
```

- [ ] **Step 5: TypeScript check**

```powershell
cd d:\Project\DOK-HR\client; npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/InvoiceAnalysis.tsx
git commit -m "feat: add This Month / Last Month / Custom date presets to Invoice Analysis"
```

---

## Self-Review

**Spec coverage:**
- ✅ `POST /invoices/bulk-generate` — Task 1 step 3
- ✅ Skip existing invoices, return `{ generated, skipped }` — Task 1 step 3
- ✅ `GET /invoices` with optional date filter — Task 1 step 4
- ✅ `GET /analytics/invoice-analysis` with date params — Task 1 step 6
- ✅ "Generate All Sites" button + modal with date range — Task 2 steps 5+7
- ✅ Toast showing generated count and skipped site names — Task 2 step 4
- ✅ Date filter inputs + Search/Clear on invoice list — Task 2 step 6
- ✅ Summary cards reflect filtered results (they compute from `invoices` state which is already filtered) — covered by step 2
- ✅ This Month / Last Month / Custom preset tabs on Analysis — Task 3 steps 3+4
- ✅ Custom range waits for Load button; presets fetch immediately — Task 3 step 3

**Placeholder scan:** No TBDs. All code complete.

**Type consistency:** `bulkGenerateInvoices` response `{ generated: number, skipped: string[] }` matches `handleBulkGenerate`'s typed `api.post<{ generated: number; skipped: string[] }>`. `fetchData(df, dt)` signature matches all three callers. `computePreview` return shape matches `previewInvoice`'s re-serialisation.
