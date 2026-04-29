# Invoice Cost Variant Edit & Additional Costs Design

**Date:** 2026-04-23
**Branch:** dev_v2

## Summary

During invoice generation, allow users to:
1. Edit existing cost variant values inline — changes are saved permanently to `cost_varient` on "Save Invoice"
2. Add multiple named "additional cost" rows — also saved permanently to `cost_varient` on "Save Invoice"
3. The Cost Variant Total auto-recalculates in real time as values change
4. All changes (edits + new rows) are committed atomically when the invoice is saved

---

## 1. Frontend — `client/src/pages/Invoices.tsx`

### New state

Add three new state variables alongside the existing `expenseCost` (which is removed):

```ts
// Replace: const [expenseCost, setExpenseCost] = useState('');
// With:
const [editedVariants, setEditedVariants]   = useState<{ key: string; value: string }[]>([]);
const [additionalCosts, setAdditionalCosts] = useState<{ key: string; value: string }[]>([]);
```

- `editedVariants` — mirrors `preview.cost_factors`, pre-filled with current values. Only numeric factors are editable; non-numeric factors are displayed as read-only labels.
- `additionalCosts` — starts empty each time a preview is calculated; user adds rows here.

### Initialise on preview load

In `handleCalculate`, after `setPreview(r.data)`, initialise both states:

```ts
setPreview(r.data);
setEditedVariants(r.data.cost_factors.map((f: any) => ({ key: f.key, value: String(f.amount || f.value) })));
setAdditionalCosts([]);
```

Also reset both in `openModal` (alongside existing resets):
```ts
setEditedVariants([]);
setAdditionalCosts([]);
```

### Derived total

Compute inside the render, replacing `preview.cost_variant_total`:

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

### Cost Variant Factors section (editable table)

Replace the read-only `<td>{f.value}</td>` cell with a number input for numeric factors:

```tsx
<td className="py-1.5 pr-2">
    {/* factor name — always read-only */}
    <span className="text-slate-700 font-medium">{v.key}</span>
</td>
<td className="py-1.5 pr-2">
    {/* value input — editable for numeric, label for text */}
    {/* f.numeric from original preview.cost_factors tells us which are numeric */}
    {preview.cost_factors[i]?.numeric ? (
        <input
            type="number" min="0" step="1"
            value={v.value}
            onChange={e => setEditedVariants(prev =>
                prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x)
            )}
            className="form-input w-full px-2 py-1 text-sm"
        />
    ) : (
        <span className="text-slate-400 text-sm">{v.value}</span>
    )}
</td>
<td className="py-1.5 text-right font-semibold text-amber-700">
    {preview.cost_factors[i]?.numeric ? fmt(parseFloat(v.value) || 0) : '—'}
</td>
```

Footer shows `computedCostVariantTotal` instead of `preview.cost_variant_total`.

### Additional Costs section

Add a new `SectionCard` below Cost Variant Factors:

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

### Summary strip & Save

- Remove the single `expenseCost` input block entirely
- Update the "Cost Variants" summary card value from `preview.cost_variant_total` to `computedCostVariantTotal`
- Remove the "Expense" summary card (no longer needed)
- Grid changes from `grid-cols-4` to `grid-cols-3` (Cost Variants, Salary + OT, Invoice Price)

### Updated `handleSave`

```ts
const handleSave = async () => {
    if (!preview) return;
    // Validate additional costs: each row needs a non-empty name and valid amount
    for (const row of additionalCosts) {
        if (!row.key.trim()) { alert('Each additional cost must have a name.'); return; }
        if (isNaN(parseFloat(row.value)) || parseFloat(row.value) < 0) {
            alert('Each additional cost must have a valid amount.'); return;
        }
    }
    setSaving(true);
    try {
        const allVariants = [
            ...editedVariants,
            ...additionalCosts.map(r => ({ key: r.key.trim(), value: r.value })),
        ];
        await api.post('/invoices', {
            site_id: preview.site.ID,
            site_no: preview.site.SITE_NO,
            site_name: preview.site.NAME,
            date_from: preview.date_from,
            date_to: preview.date_to,
            cost_variants: allVariants,
            salary_ot_amount: preview.salary_ot_amount,
            invoice_price: preview.total_invoice_price,
        });
        setIsModalOpen(false); fetchInvoices();
    } catch (err: any) { alert(err.response?.data?.message || 'Failed to save invoice'); }
    finally { setSaving(false); }
};
```

Note: `cost_variant_amount` and `expense_cost` are no longer sent from the frontend — the backend recomputes `cost_variant_amount` from the submitted variants.

---

## 2. Backend — `server/src/controllers/invoiceController.ts`

### Updated `saveInvoice`

Accept `cost_variants` in the request body and upsert each into `cost_varient` before saving the invoice:

```ts
export const saveInvoice = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const {
        site_id, site_no, site_name, date_from, date_to,
        cost_variants,         // Array<{ key: string; value: string }>
        salary_ot_amount,
        invoice_price,
    } = req.body;

    if (!site_id || !date_from || !date_to) {
        return res.status(400).json({ message: 'site_id, date_from, date_to are required' });
    }

    const variants: { key: string; value: string }[] = Array.isArray(cost_variants) ? cost_variants : [];

    // Recompute cost_variant_amount server-side
    const cost_variant_amount = variants.reduce((s, v) => {
        const n = parseFloat(v.value);
        return s + (isNaN(n) ? 0 : n);
    }, 0);

    try {
        // 1. Upsert each cost variant into cost_varient table
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

        // 2. Insert invoice record
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
                site_id: Number(site_id),
                site_no:               site_no   || '',
                site_name:             site_name || '',
                date_from,
                date_to,
                cost_variant_amount:   Math.round(cost_variant_amount * 100) / 100,
                salary_ot_amount:      Number(salary_ot_amount) || 0,
                invoice_price:         Number(invoice_price)    || 0,
                created_by:            userId,
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

No changes to `previewInvoice`, `updateInvoice`, `deleteInvoice`, or `getInvoices`.

---

## 3. Data Flow

```
User edits cost variant value in table
    ↓ setEditedVariants (local state)
    ↓ computedCostVariantTotal recalculates live

User clicks "+ Add Cost", fills name + amount
    ↓ setAdditionalCosts (local state)
    ↓ computedCostVariantTotal recalculates live

User clicks "Save Invoice Record"
    ↓ Validates additional cost rows (name required, amount ≥ 0)
    ↓ POST /api/invoices { site_id, cost_variants: [...editedVariants, ...additionalCosts], ... }
    ↓ Backend upserts each variant into cost_varient (UPDATE if exists, INSERT if new)
    ↓ Backend recomputes cost_variant_amount from submitted variants
    ↓ Backend inserts into profit_amount
    ↓ Modal closes, invoice list refreshes
```

---

## 4. No DB Schema Changes

`cost_varient` and `profit_amount` tables are unchanged. New rows are inserted into `cost_varient` for additional costs; existing rows are updated for edited variants.

---

## 5. Files Changed

| File | Change |
|------|--------|
| `client/src/pages/Invoices.tsx` | New state, editable variant table, additional costs section, updated handleSave |
| `server/src/controllers/invoiceController.ts` | `saveInvoice` — upsert cost variants before saving invoice |
