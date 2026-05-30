# Invoice Bulk Generation & Search — Design Spec

## Goal

Three enhancements to the existing invoice workflow:
1. Generate invoices for all active sites in one click (bulk generation with skip-existing logic)
2. Filter the invoice list by date range
3. Add This Month / Last Month / Custom date presets to the Invoice Analysis page

## Architecture

All changes are modifications to existing files. No new pages, no schema changes. One new backend endpoint (`POST /invoices/bulk-generate`) and two modified endpoints (`GET /invoices`, `GET /analytics/invoice-analysis`). The bulk generation reuses the existing `previewInvoice` logic server-side.

## Tech Stack

- React + TypeScript + Tailwind CSS (existing)
- Existing `api` service, `AuthContext`, `lucide-react`, `date-fns`
- Express + PostgreSQL (existing)
- Existing `previewInvoice` logic in `server/src/controllers/invoiceController.ts`

## File Structure

### Modified files

| File | Change |
|------|--------|
| `client/src/pages/Invoices.tsx` | Add "Generate All Sites" button + modal; add date range filter inputs |
| `client/src/pages/InvoiceAnalysis.tsx` | Add This Month / Last Month / Custom preset tabs |
| `server/src/controllers/invoiceController.ts` | Add `bulkGenerateInvoices`; update `getInvoices` to accept date params |
| `server/src/routes/invoiceRoutes.ts` | Wire `POST /invoices/bulk-generate` |
| `server/src/controllers/analyticsController.ts` | Update `getInvoiceAnalysis` to accept `date_from` / `date_to` params |

---

## Feature 1: Bulk Invoice Generation

### UI — `Invoices.tsx`

A **"Generate All Sites"** button sits in the top controls area alongside the existing "New Invoice" button. Clicking it opens a small confirmation modal containing:
- `date_from` and `date_to` date inputs (default: first day of current month → today)
- **"Generate"** button (primary) and **"Cancel"** button

On confirm, the modal shows a loading spinner while the request is in flight. On success, a toast message shows the result and the invoice list reloads:
- Success: *"12 invoices generated. 3 skipped (already exist): Site A, Site B, Site C"*
- All skipped: *"0 generated — all sites already have invoices for this period."*
- Partial: *"5 invoices generated."* (when nothing was skipped)

### Backend — `POST /invoices/bulk-generate`

**Request body:** `{ date_from: string, date_to: string }`

**Logic:**
1. Fetch all active sites from `sites` table
2. For each site, check `profit_amount` for an existing record where `site_id = X AND date_from = :date_from AND date_to = :date_to`
3. Sites with an existing record are added to the `skipped` list (by `site_name`)
4. For each remaining site, call the internal `previewInvoice` logic to compute all cost components
5. Save each result to `profit_amount` using the same insert logic as `saveInvoice`, with `created_by = req.user.id`
6. Return `{ generated: number, skipped: string[] }`

**Response:**
```json
{ "generated": 12, "skipped": ["Site A", "Site B", "Site C"] }
```

**Error handling:** If any individual site's preview fails (e.g. missing cost_varient config), that site is added to `skipped` with an error note; processing continues for the remaining sites. The endpoint never returns 500 unless the sites query itself fails.

### Access

Role: `admin`, `system_admin` — same as existing invoice endpoints.

---

## Feature 2: Invoice List Date Filter

### UI — `Invoices.tsx`

Two date inputs (**From** / **To**) and a **"Search"** button are added above the invoice table. A **"Clear"** button appears when a filter is active. Clicking Search re-fetches with the date params; Clear removes the filter and reloads all invoices.

The existing four summary cards (Total Records, Total Invoice Value, Total Salary+OT, Total Cost Variants) reflect the **filtered** results, not all-time totals.

On page load, no filter is applied — all invoices load as before.

### Backend — `GET /invoices`

Gains two optional query params: `date_from` and `date_to`.

When provided, adds a WHERE condition filtering rows where the invoice's date range overlaps the search range:
```sql
AND date_from >= :date_from AND date_to <= :date_to
```

When omitted, returns all invoices unchanged (existing behaviour preserved).

---

## Feature 3: Invoice Analysis Date Presets

### UI — `InvoiceAnalysis.tsx`

Three tab buttons are added at the top of the page:
- **This Month** — first day of current month → today
- **Last Month** — first day → last day of previous month  
- **Custom** — reveals two date inputs (From / To) with a "Load" button

Default tab on page load: **This Month**.

Switching tabs re-fetches data immediately (except Custom, which waits for the Load button). All existing charts, KPI cards, and tables respond to the active period.

### Backend — `GET /analytics/invoice-analysis`

Gains two optional query params: `date_from` and `date_to`.

When omitted, defaults to the current month (first day of current month → today) — preserving existing behaviour for any other callers.

When provided, all queries in `getInvoiceAnalysis` use the supplied date range instead of the hardcoded current-month logic.

---

## Scope — Explicitly Excluded

- Editing individual invoices during bulk generation (bulk always saves with calculated defaults)
- Bulk delete
- Exporting filtered invoice list to PDF/Excel (existing per-invoice export is unchanged)
- Analysis page chart redesign (only date filtering is added)
