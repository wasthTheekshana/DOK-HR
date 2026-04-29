# Site Daily Target — Dashboard Design

**Date:** 2026-04-23
**Branch:** dev_v2

## Summary

Replace the current task-based `total_target` (sum of `tasks.target` column) with a site-level monthly target derived from `sites.daily_target * working_days_in_period`. Update the System Admin CEO dashboard KPI strip, achievement calculation, and the All Sites chart accordingly.

---

## 1. Backend — `server/src/controllers/analyticsController.ts`

### Function: `getAnalyticsSites`

**Change 1 — Add `daily_target` to the base site query**

In the existing `SELECT` on the `sites` table, add `s.daily_target`:

```sql
SELECT s.id AS site_id,
       s.name AS site_name,
       s.site_no,
       s.daily_target,        -- ADD THIS
       COUNT(CASE WHEN u.role = 'staff' THEN u.id END) AS active_staff,
       COUNT(CASE WHEN u.role = 'staff' THEN u.id END) AS total_staff,
       COUNT(CASE WHEN u.role = 'supervisor' THEN u.id END) AS supervisor_count,
       NVL(SUM(CASE WHEN u.role = 'staff' AND u.status = 'active' THEN u.basic_salary END), 0) AS total_salary
FROM sites s
LEFT JOIN users u ON u.site_id = s.id
GROUP BY s.id, s.name, s.site_no, s.daily_target
ORDER BY s.site_no
```

**Change 2 — Compute working days in the request date range (JS, not SQL)**

After parsing `from` and `to` from query params:

```ts
const msPerDay    = 86_400_000;
const daysInRange = Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay) + 1;
const workingDays = Math.max(1, Math.round(daysInRange * 22 / 30));
```

Formula: `22 working days per 30 calendar days`, minimum 1.

**Change 3 — Replace `total_target` per site**

In the site-mapping loop, replace the task-derived target:

```ts
const dailyTarget   = Number(r.DAILY_TARGET) || 0;
const monthlyTarget = dailyTarget * workingDays;   // replaces SUM(tasks.target)
```

Return both fields on the site object:
- `daily_target: dailyTarget` — raw daily target for tooltip use
- `total_target: monthlyTarget` — period-scaled target (same field name as before)

**Change 4 — Recompute `achievement_pct`**

```ts
achievement_pct: monthlyTarget > 0
    ? Math.round(totalUnits / monthlyTarget * 1000) / 10
    : null
```

**Remove** the `NVL(SUM(CASE WHEN t.ot_type = 'target_based' THEN t.target ELSE 0 END), 0) AS total_target` line from the task summary query — it is no longer used as the target source.

---

## 2. Frontend KPI Strip — `client/src/pages/Dashboard.tsx`

### Remove "Total OT Paid" card

- Delete the last entry in the KPI array: `{ label: 'Total OT Paid', ... }`
- Change the grid class from `lg:grid-cols-6` to `lg:grid-cols-5`
- The 5 remaining cards: Total Sites, Active Workers, Actual Units, Target Units, Achievement

### No logic changes needed

`totalTarget` already sums `site.total_target` — it will automatically reflect the new backend value. `companyAchievement` already computes `totalUnits / totalTarget * 100` — no change needed.

---

## 3. Frontend "ALL SITES — TARGET vs ACHIEVEMENT" Chart — `client/src/pages/Dashboard.tsx`

### Replace single achievement-% bar with grouped Actual vs Target bars

**Data source:** All sites where `total_target > 0` (i.e., `daily_target > 0`).

**Chart type:** `BarChart` with `barCategoryGap` grouping — two bars per site.

**Data shape:**
```ts
sitesData
  .filter((s: any) => s.total_target > 0)
  .map((s: any) => ({
    name:        s.site_no,
    site_name:   s.site_name,
    target:      s.total_target,
    actual:      s.total_units,
    achievement: s.achievement_pct,
  }))
```

**Bars:**
- `target` — slate colour (`#cbd5e1`), label "Target"
- `actual` — dynamic fill per cell: green (`#10b981`) if `≥100%`, amber (`#f59e0b`) if `≥80%`, red (`#ef4444`) otherwise

**Tooltip:** shows Site name, Actual, Target, Achievement %

**Empty state:** "No sites with daily targets configured" (when no site has `daily_target > 0`)

---

## 4. Data Flow

```
sites.daily_target (DB)
       ↓
getAnalyticsSites (backend)
  workingDays = round(daysInRange * 22/30)
  total_target = daily_target * workingDays
  achievement_pct = total_units / total_target * 100
       ↓
/analytics/sites API response: { sites: [{ total_target, total_units, achievement_pct, daily_target, ... }] }
       ↓
Dashboard.tsx (frontend)
  KPI: Target Units = sum(total_target)
  KPI: Achievement = totalUnits / totalTarget * 100
  Chart: grouped bars actual vs target per site
```

---

## 5. No DB Schema Changes

`sites.daily_target` already exists. No migrations required.

---

## 6. Files Changed

| File | Change |
|------|--------|
| `server/src/controllers/analyticsController.ts` | Add `daily_target` to query, compute `workingDays`, replace task-based target |
| `client/src/pages/Dashboard.tsx` | Remove OT card, fix grid cols, update All Sites chart |
