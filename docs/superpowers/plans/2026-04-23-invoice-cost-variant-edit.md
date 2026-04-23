# Invoice Cost Variant Edit & Additional Costs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to edit existing cost variant values and add multiple named additional costs during invoice generation, with all changes saved permanently to the `cost_varient` table when the invoice is saved.

**Architecture:** Backend `saveInvoice` accepts a `cost_variants` array, upserts each into `cost_varient` (UPDATE if key exists for site, INSERT if new), and recomputes `cost_variant_amount` server-side. Frontend holds edits and new rows in React state during the preview, then submits them all in one `POST /api/invoices` call. The old single `expense_cost` input is removed.

**Tech Stack:** TypeScript, Express, Oracle DB (oracledb), React, Tailwind CSS

---

## File Map

| File | Change |
|------|--------|
| `server/src/controllers/invoiceController.ts` | `saveInvoice` — accept `cost_variants`, upsert into `cost_varient`, recompute amount |
| `server/src/tests/invoiceCostVariant.test.ts` | New — unit tests for saveInvoice upsert behavior |
| `client/src/pages/Invoices.tsx` | New state, editable variant table, additional costs section, updated handleSave + summary |

---

## Task 1: Backend test — saveInvoice upsert behavior

**Files:**
- Create: `server/src/tests/invoiceCostVariant.test.ts`

- [ ] **Step 1: Create the test file**

Create `d:/Project/DOK-HR/server/src/tests/invoiceCostVariant.test.ts`:

```ts
/// <reference types="jest" />
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';

jest.mock('../middleware/authMiddleware', () => ({
    authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { id: 1 };
        next();
    },
    requireRole: (_roles: string[]) => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../db/dbUtils', () => ({ execute: jest.fn() }));
jest.mock('oracledb', () => ({
    BIND_OUT: 'BIND_OUT',
    NUMBER: 'NUMBER',
}));

import invoiceRoutes from '../routes/invoiceRoutes';
import { execute } from '../db/dbUtils';

const mockExecute = execute as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/invoices', invoiceRoutes);

const BASE_BODY = {
    site_id: 10,
    site_no: 'S001',
    site_name: 'Test Site',
    date_from: '2026-04-01',
    date_to: '2026-04-30',
    salary_ot_amount: 50000,
    invoice_price: 80000,
};

describe('saveInvoice — cost_variants upsert', () => {
    beforeEach(() => { mockExecute.mockReset(); });

    it('UPDATEs an existing cost variant when the key already exists for the site', async () => {
        // SELECT returns existing row
        mockExecute.mockResolvedValueOnce({ rows: [{ ID: 5 }] });   // existence check
        mockExecute.mockResolvedValueOnce({ rows: [] });              // UPDATE
        mockExecute.mockResolvedValueOnce({ rows: [], outBinds: { id: [99] } }); // INSERT profit_amount

        const res = await request(app)
            .post('/api/invoices')
            .set('Authorization', 'Bearer test')
            .send({ ...BASE_BODY, cost_variants: [{ key: 'Rent', value: '15000' }] });

        expect(res.status).toBe(201);

        // Second execute call should be an UPDATE
        const updateCall = mockExecute.mock.calls[1];
        expect(updateCall[0]).toMatch(/UPDATE cost_varient/i);
        expect(updateCall[1]).toMatchObject({ key: 'Rent', value: '15000', site_id: 10 });
    });

    it('INSERTs a new cost variant when the key does not exist for the site', async () => {
        // SELECT returns no rows
        mockExecute.mockResolvedValueOnce({ rows: [] });              // existence check
        mockExecute.mockResolvedValueOnce({ rows: [] });              // INSERT cost_varient
        mockExecute.mockResolvedValueOnce({ rows: [], outBinds: { id: [100] } }); // INSERT profit_amount

        const res = await request(app)
            .post('/api/invoices')
            .set('Authorization', 'Bearer test')
            .send({ ...BASE_BODY, cost_variants: [{ key: 'Transport', value: '3000' }] });

        expect(res.status).toBe(201);

        const insertCall = mockExecute.mock.calls[1];
        expect(insertCall[0]).toMatch(/INSERT INTO cost_varient/i);
        expect(insertCall[1]).toMatchObject({ key: 'Transport', value: '3000', site_id: 10 });
    });

    it('computes cost_variant_amount server-side as sum of numeric values', async () => {
        // Two variants: 15000 + 3000 = 18000
        mockExecute.mockResolvedValueOnce({ rows: [{ ID: 1 }] }); // Rent exists
        mockExecute.mockResolvedValueOnce({ rows: [] });            // UPDATE Rent
        mockExecute.mockResolvedValueOnce({ rows: [] });            // Transport not exists
        mockExecute.mockResolvedValueOnce({ rows: [] });            // INSERT Transport
        mockExecute.mockResolvedValueOnce({ rows: [], outBinds: { id: [101] } }); // profit_amount

        const res = await request(app)
            .post('/api/invoices')
            .set('Authorization', 'Bearer test')
            .send({
                ...BASE_BODY,
                cost_variants: [
                    { key: 'Rent',      value: '15000' },
                    { key: 'Transport', value: '3000'  },
                ],
            });

        expect(res.status).toBe(201);

        // Last execute call = INSERT into profit_amount — verify cost_variant_amount
        const profitCall = mockExecute.mock.calls[mockExecute.mock.calls.length - 1];
        expect(profitCall[1].cost_variant_amount).toBe(18000);
    });

    it('skips variants with empty keys', async () => {
        mockExecute.mockResolvedValueOnce({ rows: [], outBinds: { id: [102] } }); // profit_amount only

        const res = await request(app)
            .post('/api/invoices')
            .set('Authorization', 'Bearer test')
            .send({ ...BASE_BODY, cost_variants: [{ key: '', value: '5000' }] });

        expect(res.status).toBe(201);
        // Only 1 execute call: the profit_amount INSERT (no upsert for empty key)
        expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('sets expense_cost to 0 regardless of any submitted value', async () => {
        mockExecute.mockResolvedValueOnce({ rows: [], outBinds: { id: [103] } });

        await request(app)
            .post('/api/invoices')
            .set('Authorization', 'Bearer test')
            .send({ ...BASE_BODY, cost_variants: [] });

        const profitCall = mockExecute.mock.calls[0];
        expect(profitCall[1].expense_cost).toBeUndefined(); // expense_cost is hardcoded 0 in SQL
        // The SQL string should hardcode 0 for expense_cost
        expect(profitCall[0]).toMatch(/,\s*0,\s*:invoice_price/);
    });

    it('returns 400 when site_id is missing', async () => {
        const res = await request(app)
            .post('/api/invoices')
            .set('Authorization', 'Bearer test')
            .send({ date_from: '2026-04-01', date_to: '2026-04-30' });

        expect(res.status).toBe(400);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "d:/Project/DOK-HR/server" && npx jest invoiceCostVariant --no-coverage
```

Expected: FAIL — tests fail because `saveInvoice` does not yet accept `cost_variants`.

- [ ] **Step 3: Commit the failing tests**

```bash
cd "d:/Project/DOK-HR"
git add server/src/tests/invoiceCostVariant.test.ts
git commit -m "test: add saveInvoice cost_variants upsert tests (failing)"
```

---

## Task 2: Backend — update `saveInvoice` to upsert cost variants

**Files:**
- Modify: `server/src/controllers/invoiceController.ts:160-200`

- [ ] **Step 1: Replace the `saveInvoice` function**

In `server/src/controllers/invoiceController.ts`, find the `saveInvoice` function (line 161) and replace it entirely with:

```ts
// POST /api/invoices — save an invoice record and upsert cost variants
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
                 TO_DATE(:date_from, 'YYYY-MM-DD'), TO_DATE(:date_to, 'YYYY-MM-DD'),
                 :cost_variant_amount, :salary_ot_amount, 0, :invoice_price, :created_by)
             RETURNING id INTO :id`,
            {
                site_id:              Number(site_id),
                site_no:              site_no   || '',
                site_name:            site_name || '',
                date_from,
                date_to,
                cost_variant_amount:  Math.round(cost_variant_amount * 100) / 100,
                salary_ot_amount:     Number(salary_ot_amount) || 0,
                invoice_price:        Number(invoice_price)    || 0,
                created_by:           userId,
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
```

- [ ] **Step 2: Run the tests**

```bash
cd "d:/Project/DOK-HR/server" && npx jest invoiceCostVariant --no-coverage
```

Expected:
```
PASS src/tests/invoiceCostVariant.test.ts
  saveInvoice — cost_variants upsert
    ✓ UPDATEs an existing cost variant when the key already exists for the site
    ✓ INSERTs a new cost variant when the key does not exist for the site
    ✓ computes cost_variant_amount server-side as sum of numeric values
    ✓ skips variants with empty keys
    ✓ sets expense_cost to 0 regardless of any submitted value
    ✓ returns 400 when site_id is missing
```

If the `expense_cost` test fails due to the SQL string format, adjust the regex in the test to match the exact SQL string in the implementation. The intent is that `expense_cost` is hardcoded as literal `0` in the INSERT statement.

- [ ] **Step 3: Run full backend test suite**

```bash
cd "d:/Project/DOK-HR/server" && npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 4: TypeScript check**

```bash
cd "d:/Project/DOK-HR/server" && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd "d:/Project/DOK-HR"
git add server/src/controllers/invoiceController.ts
git commit -m "feat: saveInvoice upserts cost_variants into cost_varient table"
```

---

## Task 3: Frontend — new state variables and initialization

**Files:**
- Modify: `client/src/pages/Invoices.tsx:33-96`

- [ ] **Step 1: Replace `expenseCost` state with two new states**

In `Invoices.tsx`, find line 40:
```ts
const [expenseCost, setExpenseCost]     = useState('');
```

Replace with:
```ts
const [editedVariants,  setEditedVariants]  = useState<{ key: string; value: string }[]>([]);
const [additionalCosts, setAdditionalCosts] = useState<{ key: string; value: string }[]>([]);
```

- [ ] **Step 2: Update `openModal` to reset new states**

Find `openModal` (around line 64):
```ts
const openModal = () => {
    setSelectedSiteId(''); setDateFrom(''); setDateTo('');
    setPreview(null); setExpenseCost('');
    setIsModalOpen(true);
};
```

Replace with:
```ts
const openModal = () => {
    setSelectedSiteId(''); setDateFrom(''); setDateTo('');
    setPreview(null);
    setEditedVariants([]); setAdditionalCosts([]);
    setIsModalOpen(true);
};
```

- [ ] **Step 3: Update `handleCalculate` to initialize new states from preview**

Find `handleCalculate` (around line 70). The current line:
```ts
setPreview(r.data); setExpenseCost('');
```

Replace with:
```ts
const data = r.data;
setPreview(data);
setEditedVariants(
    data.cost_factors.map((f: InvoiceCostFactor) => ({
        key:   f.key,
        value: f.numeric ? String(f.amount) : f.value,
    }))
);
setAdditionalCosts([]);
```

- [ ] **Step 4: Update `handleSave` to send `cost_variants` instead of `expense_cost`**

Find `handleSave` (around line 81). Replace the entire function with:

```ts
const handleSave = async () => {
    if (!preview) return;
    for (const row of additionalCosts) {
        if (!row.key.trim()) { alert('Each additional cost must have a name.'); return; }
        const n = parseFloat(row.value);
        if (isNaN(n) || n < 0) { alert('Each additional cost must have a valid amount (≥ 0).'); return; }
    }
    setSaving(true);
    try {
        const allVariants = [
            ...editedVariants,
            ...additionalCosts.map(r => ({ key: r.key.trim(), value: r.value })),
        ];
        await api.post('/invoices', {
            site_id:          preview.site.ID,
            site_no:          preview.site.SITE_NO,
            site_name:        preview.site.NAME,
            date_from:        preview.date_from,
            date_to:          preview.date_to,
            cost_variants:    allVariants,
            salary_ot_amount: preview.salary_ot_amount,
            invoice_price:    preview.total_invoice_price,
        });
        setIsModalOpen(false); fetchInvoices();
    } catch (err: any) { alert(err.response?.data?.message || 'Failed to save invoice'); }
    finally { setSaving(false); }
};
```

- [ ] **Step 5: TypeScript check**

```bash
cd "d:/Project/DOK-HR/client" && npx tsc --noEmit
```

Expected: no errors. If `InvoiceCostFactor` is not in scope in `Invoices.tsx`, check the import at line 3 — it should be `import type { Site, InvoiceRecord, InvoicePreview, InvoiceCostFactor } from '../types';`

- [ ] **Step 6: Commit**

```bash
cd "d:/Project/DOK-HR"
git add client/src/pages/Invoices.tsx
git commit -m "feat: replace expenseCost state with editedVariants and additionalCosts"
```

---

## Task 4: Frontend — editable cost variant table

**Files:**
- Modify: `client/src/pages/Invoices.tsx:547-573`

- [ ] **Step 1: Compute the derived total before the return**

In `Invoices.tsx`, find the line inside the `preview && (...)` block (around line 531) where JSX begins. Just before the JSX (or inside the component render but before the return), add the derived total. Put it right after the `underperformers` or relevant state declarations, or alternatively compute it inline:

Add this derived constant just before the `return (` at the bottom of the `Invoices` component function, inside the component body:

```ts
const computedCostVariantTotal =
    editedVariants.reduce((s, v) => {
        const n = parseFloat(v.value);
        return s + (isNaN(n) ? 0 : n);
    }, 0) +
    additionalCosts.reduce((s, v) => {
        const n = parseFloat(v.value);
        return s + (isNaN(n) ? 0 : n);
    }, 0);
```

- [ ] **Step 2: Replace the read-only Cost Variant Factors table with an editable one**

Find the `<SectionCard title="Cost Variant Factors"` block (around line 547). Replace the entire inner content (the `{preview.cost_factors.length === 0 ? ... : (...)}` block inside the SectionCard) with:

```tsx
{editedVariants.length === 0
    ? <p className="text-slate-400 text-sm">No cost factors defined for this site.</p>
    : (
        <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100">
                <th className="pb-2 text-left text-xs font-semibold text-slate-500">Factor</th>
                <th className="pb-2 text-left text-xs font-semibold text-slate-500">Value</th>
                <th className="pb-2 text-right text-xs font-semibold text-slate-500">Amount</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
                {editedVariants.map((v, i) => {
                    const isNumeric = preview.cost_factors[i]?.numeric ?? false;
                    const amount = isNumeric ? (parseFloat(v.value) || 0) : 0;
                    return (
                        <tr key={i}>
                            <td className="py-2 text-slate-700 font-medium">{v.key}</td>
                            <td className="py-2 pr-2">
                                {isNumeric ? (
                                    <input
                                        type="number" min="0" step="1"
                                        value={v.value}
                                        onChange={e => setEditedVariants(prev =>
                                            prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x)
                                        )}
                                        onKeyDown={e => ['e','E','+','-'].includes(e.key) && e.preventDefault()}
                                        className="form-input w-full px-2 py-1 text-sm"
                                    />
                                ) : (
                                    <span className="text-slate-400 text-sm">{v.value}</span>
                                )}
                            </td>
                            <td className="py-2 text-right font-semibold text-amber-700">
                                {isNumeric ? fmt(amount) : '—'}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
            <tfoot><tr className="border-t-2 border-amber-200">
                <td colSpan={2} className="pt-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Total Cost Variants</td>
                <td className="pt-2.5 text-right font-black text-amber-700">{fmt(computedCostVariantTotal)}</td>
            </tr></tfoot>
        </table>
    )}
```

- [ ] **Step 3: TypeScript check**

```bash
cd "d:/Project/DOK-HR/client" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "d:/Project/DOK-HR"
git add client/src/pages/Invoices.tsx
git commit -m "feat: make cost variant factors editable in invoice preview"
```

---

## Task 5: Frontend — Additional Costs section

**Files:**
- Modify: `client/src/pages/Invoices.tsx` (after Cost Variant Factors SectionCard, around line 573)

- [ ] **Step 1: Add the Additional Costs SectionCard**

Find the closing `</SectionCard>` of the Cost Variant Factors section (around line 573). Immediately after it, insert a new SectionCard:

```tsx
<SectionCard title="Additional Costs" accent="border-orange-400"
    icon={<Plus className="w-4 h-4 text-orange-500" />}>
    <div className="space-y-2">
        {additionalCosts.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
                <input
                    type="text"
                    placeholder="Cost name"
                    value={row.key}
                    onChange={e => setAdditionalCosts(prev =>
                        prev.map((x, j) => j === i ? { ...x, key: e.target.value } : x)
                    )}
                    className="form-input flex-1 px-2.5 py-1.5 text-sm"
                />
                <input
                    type="number" min="0" step="1"
                    placeholder="Amount"
                    value={row.value}
                    onChange={e => setAdditionalCosts(prev =>
                        prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x)
                    )}
                    onKeyDown={e => ['e','E','+','-'].includes(e.key) && e.preventDefault()}
                    className="form-input w-32 px-2.5 py-1.5 text-sm"
                />
                <button
                    onClick={() => setAdditionalCosts(prev => prev.filter((_, j) => j !== i))}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <X className="w-4 h-4" />
                </button>
            </div>
        ))}
        <button
            onClick={() => setAdditionalCosts(prev => [...prev, { key: '', value: '' }])}
            className="flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 font-semibold mt-1">
            <Plus className="w-3.5 h-3.5" /> Add Cost
        </button>
    </div>
</SectionCard>
```

Note: `Plus` and `X` are already imported from lucide-react (line 8 of `Invoices.tsx`).

- [ ] **Step 2: TypeScript check**

```bash
cd "d:/Project/DOK-HR/client" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "d:/Project/DOK-HR"
git add client/src/pages/Invoices.tsx
git commit -m "feat: add Additional Costs section with dynamic rows in invoice preview"
```

---

## Task 6: Frontend — update summary strip, remove expense input

**Files:**
- Modify: `client/src/pages/Invoices.tsx:657-685`

- [ ] **Step 1: Replace the expense input + summary block**

Find the `<div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">` block (around line 657) that contains the expense input and summary cards. Replace the entire block (from that div through its closing `</div>`) with:

```tsx
<div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        {[
            { label: 'Cost Variants', val: computedCostVariantTotal,      color: 'text-amber-700'  },
            { label: 'Salary + OT',   val: preview.salary_ot_amount,      color: 'text-violet-700' },
            { label: 'Invoice Price', val: preview.total_invoice_price,   color: 'text-emerald-700'},
        ].map(c => (
            <div key={c.label} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">{c.label}</p>
                <p className={`text-sm font-black ${c.color}`}>{fmt(c.val)}</p>
            </div>
        ))}
    </div>
    <button onClick={handleSave} disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl transition-colors text-sm">
        {saving
            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
            : <><Save className="w-4 h-4" /> Save Invoice Record</>}
    </button>
</div>
```

- [ ] **Step 2: TypeScript check**

```bash
cd "d:/Project/DOK-HR/client" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "d:/Project/DOK-HR"
git add client/src/pages/Invoices.tsx
git commit -m "feat: update invoice summary strip, remove single expense input"
```

---

## Task 7: Run all tests and verify

- [ ] **Step 1: Run full backend test suite**

```bash
cd "d:/Project/DOK-HR/server" && npx jest --no-coverage
```

Expected: all tests pass including `invoiceCostVariant`.

- [ ] **Step 2: Full TypeScript check on both projects**

```bash
cd "d:/Project/DOK-HR/client" && npx tsc --noEmit
cd "d:/Project/DOK-HR/server" && npx tsc --noEmit
```

Expected: no new errors in either project.

- [ ] **Step 3: Manual browser verification checklist**

Start dev servers:
```bash
# Terminal 1
cd "d:/Project/DOK-HR/server" && npm run dev

# Terminal 2
cd "d:/Project/DOK-HR/client" && npm run dev
```

Open the Invoices page and generate an invoice for a site that has cost factors. Verify:

1. **Cost Variant Factors table** — numeric rows have a number input pre-filled with the current value; non-numeric rows show as plain text
2. **Edit a value** — Cost Variant Total in the footer and "Cost Variants" summary card both update immediately
3. **Additional Costs section** — clicking "+ Add Cost" adds a row with name + amount inputs; clicking × removes it
4. **Add two rows** — e.g., "Transport" 2000 and "Fuel" 1500 — summary card total increases by 3500
5. **Save Invoice Record** — no alert, modal closes, invoice appears in the list with the correct `COST_VARIANT_AMOUNT`
6. **Re-open invoice generation for same site** — the edited variant value and the two new costs (Transport, Fuel) now appear as pre-filled rows in the Cost Variant Factors table (they were saved to `cost_varient`)
7. **Validation** — try saving with an additional cost row that has no name → alert fires, save is blocked
