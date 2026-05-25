# Extra Units Bulk Review — Design Spec

## Goal

A dedicated page where admins can see all target-based sites' extra units for a date range, save payroll records per site, and edit or delete previously saved records — without navigating site by site.

## Architecture

New page `/extra-units` inside the existing React app. Uses two new backend endpoints (DELETE batch, PUT record) plus the existing `POST /payroll/save-target` for saving. The `payroll_saved_records` table already exists and requires no schema changes.

## Tech Stack

- React + TypeScript + Tailwind CSS (existing)
- Existing `api` service, `AuthContext`, `lucide-react`, `date-fns`
- Express + PostgreSQL (existing)
- `computeWorkingDays` utility (existing, in `server/src/utils/analyticsUtils.ts`)

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `client/src/pages/ExtraUnits.tsx` | Full page — date range picker, site rows, expand-to-staff breakdown, save/edit/delete actions |

### Modified files
| File | Change |
|------|--------|
| `client/src/App.tsx` | Add `/extra-units` route (admin + system_admin) |
| `client/src/components/Layout.tsx` | Add "Extra Units" nav item in Finance group |
| `server/src/controllers/payrollController.ts` | Add `getExtraUnitsSummary`, `deleteSavedBatch`, `updateSavedRecord` |
| `server/src/routes/payrollRoutes.ts` | Wire new endpoints |

## Page: `/extra-units`

### Access
Roles: `admin`, `system_admin` only. Same gate as `/payroll`.

### Top Controls
- `date_from` and `date_to` date inputs (default: first day of current month → today)
- "Load" button triggers fetch
- Summary strip: total sites shown, total extra units across all sites, total extra payment

### Site Row
One row per target-based active site. Columns:
| Column | Notes |
|--------|-------|
| Site name + site_no | |
| Total units | Sum of all staff task counts for date range |
| Expected units | `daily_target × working_days` (using `computeWorkingDays`) |
| Extra units | `MAX(0, total_units − expected_units)`, shown in green if > 0 |
| Payment | `extra_units × EXTRA_UNIT_RATE`, shown as Rs. amount |
| Status | **Unsaved** badge (amber) or **Saved** badge (green) with saved date |
| Actions | **Save** button if unsaved; **Edit** + **Delete** buttons if saved |

Sites with extra_units = 0 are shown but Save button is disabled.

### Expand Row
Clicking the site name / chevron expands an inline staff breakdown table:
| Column | Notes |
|--------|-------|
| Staff name | |
| EPF number | |
| Units done | `SUM(count)` for date range |
| Target | `daily_target × working_days` |
| Extra units | `MAX(0, units − target)` per staff |
| Payment | Editable input (Rs.) — pre-filled as `extra_units × EXTRA_UNIT_RATE` |

In **view mode** (unsaved or after saving), payment fields are read-only.
In **edit mode** (after clicking Edit on a saved site), payment fields become editable inputs.

### Save Flow
1. Admin clicks **Save** on an unsaved site row
2. Sends `POST /payroll/save-target` with `{ date_from, date_to, site_no, records: [...per-staff] }`
3. On success: row status badge turns green "Saved", Save button replaced with Edit + Delete

### Edit Flow
1. Admin clicks **Edit** on a saved site row
2. Staff breakdown expands with editable payment inputs
3. Admin adjusts payments, clicks **Update**
4. For each changed staff record: sends `PUT /payroll/saved-record/:id` with `{ extra_payment }`
5. On success: row collapses, stays Saved

### Delete Flow
1. Admin clicks **Delete** on a saved site row
2. Confirmation prompt: "Delete saved payroll for [site name] — [date range]?"
3. On confirm: sends `DELETE /payroll/saved-batch?site_no=X&date_from=Y&date_to=Z`
4. Removes all `payroll_saved_records` rows for that site + date range
5. Row reverts to "Unsaved" status with Save button

## Backend

### Existing endpoint reused
`POST /payroll/save-target` — unchanged, already saves per-staff records to `payroll_saved_records`.

### New: `GET /payroll/extra-units`
Query params: `date_from`, `date_to`

Returns all target-based active sites with their calculations and saved status:

```json
[
  {
    "site_id": 3,
    "site_no": "S001",
    "site_name": "Site A",
    "daily_target": 50,
    "working_days": 22,
    "expected_units": 1100,
    "total_units": 1340,
    "extra_units": 240,
    "extra_payment": 120.00,
    "saved": true,
    "saved_at": "2026-05-10 14:23",
    "batch_id": "2026-05-01_2026-05-31_S001_...",
    "staff": [
      {
        "staff_id": 12,
        "staff_name": "Nimal Perera",
        "epf_number": "1042",
        "sum_count": 320,
        "target_count": 275,
        "extra_units": 45,
        "extra_payment": 22.50,
        "saved_record_id": 88
      }
    ]
  }
]
```

SQL logic:
- Join `sites` → `tasks` → `users` for date range
- Use `computeWorkingDays(date_from, date_to)` for working_days
- Left join `payroll_saved_records` grouped by site_no + date range to determine saved status

### New: `DELETE /payroll/saved-batch`
Query params: `site_no`, `date_from`, `date_to`

```sql
DELETE FROM payroll_saved_records
WHERE site_no = :site_no
  AND date_from = :date_from
  AND date_to = :date_to
```

### New: `PUT /payroll/saved-record/:id`
Body: `{ extra_payment: number }`

```sql
UPDATE payroll_saved_records
SET extra_payment = :extra_payment
WHERE id = :id
```

## Nav

In `client/src/components/Layout.tsx`, Finance group:
```tsx
{ to: '/extra-units', label: 'Extra Units', icon: TrendingUp, roles: ['admin', 'system_admin'] }
```

## Scope — Explicitly Excluded

- Time-based and staff-outsource sites (extra units concept doesn't apply)
- Bulk save all sites in one click (each site saved individually)
- Editing units count (only payment amount is editable, not the underlying task counts)
- Exporting to PDF/Excel (out of scope for this feature)
