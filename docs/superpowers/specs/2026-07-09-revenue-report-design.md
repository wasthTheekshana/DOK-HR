# Revenue Report — Design

**Date:** 2026-07-09
**Status:** Approved by user

## Purpose

A report that reproduces the manually maintained `docs/JULY.xlsx` workbook inside the app: for a selected date range and set of sites, show each selected task type's total count multiplied by its unit price, per-site revenue totals, and a grand total — with an on-screen table, a bar chart (like the workbook's Sheet1 summary), and a downloadable two-sheet Excel file.

## Decisions (confirmed with user)

- **Multiple sites** selectable at once (with "All sites" option), not single-site.
- Lives as a **new "Revenue Report" tab** in the existing Reports page.
- **One total count per task for the whole range** — no per-day columns.
- Chart is a **bar chart** (Recharts), one bar per site showing total revenue.
- Excel export has **two sheets**: Detail (like the JULY sheet) and Summary (like Sheet1).
- **Skip** "Project Resources count", "No. of Stations", and "Commencement date" columns — the app has no stations concept; keep the report to counts × price × revenue.
- Tasks with **zero count in the range still appear** as rows with 0 count / 0 value (matches the JULY template), but unselected sites/tasks are excluded entirely.

## Backend

**Route:** `GET /api/tasks/revenue-report` (added to `server/src/routes/taskRoutes.ts`), restricted to `admin` and `system_admin` via `requireRole` — it exposes invoice prices, same sensitivity as the weekly operation report.

**Query params:**

| Param | Required | Format | Meaning |
|---|---|---|---|
| `date_from` | yes | `yyyy-MM-dd` | Range start (inclusive) |
| `date_to` | yes | `yyyy-MM-dd` | Range end (inclusive) |
| `site_ids` | no | comma-separated integers | Omitted = all active sites |
| `task_names` | no | comma-separated names | Omitted = all task types of the selected sites; matched case-insensitively and trimmed |

**Implementation:** one SQL aggregation in `taskController.ts`, using the same join the invoice generator uses (`invoiceController.ts` — `site_task_types stt LEFT JOIN tasks t ON t.site_id = stt.site_id AND LOWER(TRIM(t.task_description)) = LOWER(TRIM(stt.task_name)) AND t.task_date BETWEEN :date_from AND :date_to`), grouped by site and task name. Counts are summed with `COALESCE(t.count, 0)` so numbers always match invoices. For `staff_outsource` sites, the count is instead the task row count (`COUNT(t.id)`), matching invoice generation.

**Response:**

```json
{
  "date_from": "2026-07-01",
  "date_to": "2026-07-09",
  "lines": [
    { "site_id": 1, "site_no": "S001", "site_name": "Coseway", "task_name": "Scanning",
      "total_count": 3962, "unit_price": 2.4, "line_total": 9508.8 }
  ],
  "summary": [
    { "site_id": 1, "site_name": "Coseway", "total_revenue": 9508.8 }
  ],
  "grand_total": 114344.75
}
```

- `line_total = total_count × unit_price` (price null → 0).
- `summary` = lines grouped per site; `grand_total` = sum of all line totals.
- `summary` and `grand_total` are computed in the controller from the line rows (no second query).

## Frontend

New tab `revenue_report` in `client/src/pages/Reports.tsx`, following the existing tab pattern (state per tab, loading spinner, empty state).

**Access:** the feature is for `admin` and `system_admin` only — the tab button is rendered only for those roles (using the page's current-user role, same as other role-gated UI), and the endpoint independently enforces the same restriction server-side.

**Filters row:**
1. **Date From / Date To** — defaults: first day of current month → today.
2. **Sites multi-select** — checkbox dropdown of active sites with "All sites" toggle; populated from the page's existing `GET /sites` fetch (which already includes each site's `task_types` with prices).
3. **Tasks multi-select** — union of task types of the currently selected sites, labeled `TaskName — Rs price`; recomputed when site selection changes; "All tasks" default. Selecting a task means: include that task name (case-insensitive) wherever it exists among the selected sites.
4. **Generate** button — validates `date_from ≤ date_to` (inline error message, no request otherwise) then calls the endpoint.

**Results area:**
- **Detail table** — Project | Task | Total Count | Unit Price (Rs) | Total Value (Rs); site name rendered once per site group; bold **Grand Total** row at the bottom; numbers with thousand separators, 2-decimal currency.
- **Summary table** — Project | Total Revenue + total row (mirrors Sheet1).
- **Bar chart** — Recharts `BarChart`, one bar per site (x = site name, y = total revenue), tooltip with formatted currency.
- **Download Excel** button — disabled until a report has been generated.

## Excel export

Client-side via the already-installed `xlsx` package (same as every other Reports export). File name: `Revenue-Report_<date_from>_<date_to>.xlsx`.

- **Sheet "Detail":** header `Project Name | Task | Total Count | Unit Price | Total Value`; one row per line; final row `Grand Total` with the sum in the Total Value column.
- **Sheet "Summary":** header `Projects | Total Revenue`; one row per site; final `Total` row.

## Edge cases

- `date_from > date_to` → client-side validation message; endpoint also returns 400.
- Site with no configured task types → contributes no rows.
- Unit price null/0 → treated as 0; row still shown.
- No sites match filters → empty `lines`, `grand_total` 0; UI shows empty state.

## Testing

- **Backend (Jest):** endpoint filters by `site_ids` and `task_names`; zero-count task types still returned; `line_total`/`summary`/`grand_total` math; date-range boundaries inclusive; invalid dates → 400; role restriction enforced.
- **Frontend:** manual verification of tab flow (filter → generate → table/chart → Excel download) against known data.
