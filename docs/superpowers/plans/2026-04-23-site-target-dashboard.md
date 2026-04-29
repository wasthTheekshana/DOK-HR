# Site Daily Target Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the task-derived `total_target` with `sites.daily_target * working_days_in_period`, hide the Total OT Paid KPI card, and update the All Sites chart to show grouped Actual vs Target bars.

**Architecture:** Backend computes `working_days` from the request date range (`round(days * 22/30)`), multiplies each site's `daily_target` to produce `total_target`, and returns it on the existing field. Frontend consumes the same field names — no frontend logic changes needed for the KPI values. The All Sites chart is replaced in-place.

**Tech Stack:** TypeScript, Express, Oracle DB (oracledb), React, Recharts

---

## File Map

| File | What changes |
|------|-------------|
| `server/src/controllers/analyticsController.ts` | Add `s.daily_target` to base query, compute `workingDays`, replace task-derived `total_target` with `daily_target * workingDays` |
| `server/src/tests/siteTargetAnalytics.test.ts` | New test file — unit tests for the working-days calculation and target mapping |
| `client/src/pages/Dashboard.tsx` | Remove Total OT Paid card, fix grid cols 6→5, replace All Sites chart |

---

## Task 1: Backend — working days helper + unit test

**Files:**
- Create: `server/src/tests/siteTargetAnalytics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/siteTargetAnalytics.test.ts`:

```ts
/// <reference types="jest" />

// Pure helper — no DB needed
function computeWorkingDays(from: string, to: string): number {
    const msPerDay = 86_400_000;
    const daysInRange = Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay) + 1;
    return Math.max(1, Math.round(daysInRange * 22 / 30));
}

describe('computeWorkingDays', () => {
    it('returns 22 for a full calendar month (~30 days)', () => {
        expect(computeWorkingDays('2026-04-01', '2026-04-30')).toBe(22);
    });

    it('returns 66 for ~3 months (90 days)', () => {
        expect(computeWorkingDays('2026-01-01', '2026-03-31')).toBe(66);
    });

    it('returns at least 1 for a single day', () => {
        expect(computeWorkingDays('2026-04-23', '2026-04-23')).toBe(1);
    });

    it('returns 132 for ~6 months (180 days)', () => {
        expect(computeWorkingDays('2026-01-01', '2026-06-30')).toBe(132);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx jest siteTargetAnalytics --no-coverage
```

Expected: FAIL — `computeWorkingDays is not defined` (function not in scope yet, just in test file)

Actually the function is defined inside the test file for now — tests should **pass** at this step since the function is self-contained. Run and confirm all 4 pass before moving on.

Expected output:
```
PASS src/tests/siteTargetAnalytics.test.ts
  computeWorkingDays
    ✓ returns 22 for a full calendar month (~30 days)
    ✓ returns 66 for ~3 months (90 days)
    ✓ returns at least 1 for a single day
    ✓ returns 132 for ~6 months (180 days)
```

- [ ] **Step 3: Commit**

```bash
cd server
git add src/tests/siteTargetAnalytics.test.ts
git commit -m "test: add working-days calculation tests"
```

---

## Task 2: Backend — update `getSiteAnalytics` to use `daily_target`

**Files:**
- Modify: `server/src/controllers/analyticsController.ts:409-509`

- [ ] **Step 1: Add `s.daily_target` to the base site query and compute `workingDays`**

In `analyticsController.ts`, locate the `getSiteAnalytics` function (around line 409). Find the base site query (the first `execute<any>` call in the `Promise.all`). Replace:

```ts
execute<any>(
    `SELECT s.id as site_id, s.name as site_name, s.site_no,
        COUNT(CASE WHEN u.role = 'staff' AND u.status = 'active' THEN u.id END) as active_staff,
        COUNT(CASE WHEN u.role = 'staff' THEN u.id END) as total_staff,
        COUNT(CASE WHEN u.role = 'supervisor' THEN u.id END) as supervisor_count,
        NVL(SUM(CASE WHEN u.role = 'staff' AND u.status = 'active' THEN u.basic_salary END), 0) as total_salary
     FROM sites s
     LEFT JOIN users u ON u.site_id = s.id
     GROUP BY s.id, s.name, s.site_no
     ORDER BY s.site_no`,
    []
),
```

With:

```ts
execute<any>(
    `SELECT s.id as site_id, s.name as site_name, s.site_no,
        s.daily_target,
        COUNT(CASE WHEN u.role = 'staff' AND u.status = 'active' THEN u.id END) as active_staff,
        COUNT(CASE WHEN u.role = 'staff' THEN u.id END) as total_staff,
        COUNT(CASE WHEN u.role = 'supervisor' THEN u.id END) as supervisor_count,
        NVL(SUM(CASE WHEN u.role = 'staff' AND u.status = 'active' THEN u.basic_salary END), 0) as total_salary
     FROM sites s
     LEFT JOIN users u ON u.site_id = s.id
     GROUP BY s.id, s.name, s.site_no, s.daily_target
     ORDER BY s.site_no`,
    []
),
```

- [ ] **Step 2: Compute `workingDays` after parsing the date range**

In `getSiteAnalytics`, just after the `from` / `to` variables are defined (around line 411), add:

```ts
const msPerDay    = 86_400_000;
const daysInRange = Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay) + 1;
const workingDays = Math.max(1, Math.round(daysInRange * 22 / 30));
```

- [ ] **Step 3: Remove `total_target` from the task summary query**

In the second `execute<any>` (the site task summary), remove the `total_target` line. Replace:

```ts
execute<any>(
    `SELECT t.site_id,
        COUNT(t.id) as task_records,
        NVL(SUM(t.count), 0) as total_units,
        NVL(SUM(CASE WHEN t.ot_type = 'target_based' THEN t.target ELSE 0 END), 0) as total_target,
        COUNT(DISTINCT t.staff_id) as active_workers
     FROM tasks t
     WHERE t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
       AND t.task_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
     GROUP BY t.site_id`,
    { d_from: from, d_to: to }
),
```

With:

```ts
execute<any>(
    `SELECT t.site_id,
        COUNT(t.id) as task_records,
        NVL(SUM(t.count), 0) as total_units,
        COUNT(DISTINCT t.staff_id) as active_workers
     FROM tasks t
     WHERE t.task_date >= TO_DATE(:d_from, 'YYYY-MM-DD')
       AND t.task_date <= TO_DATE(:d_to, 'YYYY-MM-DD')
     GROUP BY t.site_id`,
    { d_from: from, d_to: to }
),
```

- [ ] **Step 4: Update the site-mapping loop to use `daily_target * workingDays`**

In the `sites` mapping (around line 480), replace:

```ts
const totalUnits = Number(task.TOTAL_UNITS) || 0;
const totalTarget = Number(task.TOTAL_TARGET) || 0;
```

With:

```ts
const totalUnits    = Number(task.TOTAL_UNITS) || 0;
const dailyTarget   = Number(r.DAILY_TARGET)   || 0;
const totalTarget   = dailyTarget * workingDays;
```

And in the returned object, add `daily_target` and keep `total_target`:

```ts
return {
    site_id: r.SITE_ID,
    site_name: r.SITE_NAME,
    site_no: r.SITE_NO,
    daily_target: dailyTarget,
    active_staff: Number(r.ACTIVE_STAFF) || 0,
    total_staff: Number(r.TOTAL_STAFF) || 0,
    supervisor_count: Number(r.SUPERVISOR_COUNT) || 0,
    total_salary: Number(r.TOTAL_SALARY) || 0,
    task_records: Number(task.TASK_RECORDS) || 0,
    total_units: totalUnits,
    total_target: totalTarget,
    time_ot_payment: Math.round(timeOT * 100) / 100,
    target_ot_payment: Math.round(targetOT * 100) / 100,
    ot_payment: Math.round((timeOT + targetOT) * 100) / 100,
    active_workers: Number(task.ACTIVE_WORKERS) || 0,
    attendance_count: Number(attend.ATTENDANCE_COUNT) || 0,
    unique_attendees: Number(attend.UNIQUE_ATTENDEES) || 0,
    achievement_pct: totalTarget > 0 ? Math.round(totalUnits / totalTarget * 1000) / 10 : null
};
```

- [ ] **Step 5: TypeScript compile check**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd server
git add src/controllers/analyticsController.ts
git commit -m "feat: use sites.daily_target * working_days as period target in site analytics"
```

---

## Task 3: Backend — add unit test for the controller mapping logic

**Files:**
- Modify: `server/src/tests/siteTargetAnalytics.test.ts`

- [ ] **Step 1: Add mapping test to existing test file**

Append to `server/src/tests/siteTargetAnalytics.test.ts`:

```ts
describe('site target mapping', () => {
    const workingDays = 22;

    it('computes total_target as daily_target * workingDays', () => {
        const dailyTarget = 100;
        const totalTarget = dailyTarget * workingDays;
        expect(totalTarget).toBe(2200);
    });

    it('returns achievement_pct correctly', () => {
        const totalUnits  = 1980;
        const totalTarget = 2200;
        const pct = totalTarget > 0 ? Math.round(totalUnits / totalTarget * 1000) / 10 : null;
        expect(pct).toBe(90);
    });

    it('returns null achievement_pct when daily_target is 0', () => {
        const totalUnits  = 500;
        const totalTarget = 0;
        const pct = totalTarget > 0 ? Math.round(totalUnits / totalTarget * 1000) / 10 : null;
        expect(pct).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests**

```bash
cd server && npx jest siteTargetAnalytics --no-coverage
```

Expected:
```
PASS src/tests/siteTargetAnalytics.test.ts
  computeWorkingDays
    ✓ returns 22 for a full calendar month (~30 days)
    ✓ returns 66 for ~3 months (90 days)
    ✓ returns at least 1 for a single day
    ✓ returns 132 for ~6 months (180 days)
  site target mapping
    ✓ computes total_target as daily_target * workingDays
    ✓ returns achievement_pct correctly
    ✓ returns null achievement_pct when daily_target is 0
```

- [ ] **Step 3: Commit**

```bash
cd server
git add src/tests/siteTargetAnalytics.test.ts
git commit -m "test: add site target mapping tests"
```

---

## Task 4: Frontend — remove Total OT Paid card and fix grid columns

**Files:**
- Modify: `client/src/pages/Dashboard.tsx:399-424`

- [ ] **Step 1: Remove the Total OT Paid KPI card and change grid class**

In `Dashboard.tsx`, locate the KPI strip section (around line 399). Make two changes:

**Change 1** — grid class: `lg:grid-cols-6` → `lg:grid-cols-5`:

```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
```

**Change 2** — remove the last entry in the KPI array. Delete this object entirely:

```tsx
{ label: 'Total OT Paid',  val: fmtK(totalOT),  sub: 'target + time OT',  color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',  icon: DollarSign },
```

The array should now have exactly 5 items: Total Sites, Active Workers, Actual Units, Target Units, Achievement.

- [ ] **Step 2: Remove unused `totalOT` variable**

Find and delete this line (around line 307):

```ts
const totalOT = sitesData.reduce((s: number, x: any) => s + (x.ot_payment || 0), 0);
```

- [ ] **Step 3: TypeScript compile check**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors. If `DollarSign` import is now unused, remove it from the lucide-react import line at the top of `Dashboard.tsx`.

- [ ] **Step 4: Commit**

```bash
cd client
git add src/pages/Dashboard.tsx
git commit -m "feat: remove Total OT Paid KPI card from system admin dashboard"
```

---

## Task 5: Frontend — replace All Sites chart with grouped Actual vs Target bars

**Files:**
- Modify: `client/src/pages/Dashboard.tsx:585-618`

- [ ] **Step 1: Replace the chart block**

Locate the "All Sites Achievement Overview" section (around line 585). Replace the entire inner content of the `ResponsiveContainer` (and the filter condition above it) with the following. The outer `<div>` wrapper and title `<h3>` stay the same.

Replace from the `{bizLoading ? (` line down to and including the closing `</div>` of the chart card:

```tsx
{/* All Sites Achievement Overview */}
<div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">ALL SITES &mdash; TARGET vs ACHIEVEMENT</h3>
    {bizLoading ? (
        <div className="skeleton h-44 rounded-xl" />
    ) : sitesData.filter((s: any) => s.total_target > 0).length === 0 ? (
        <div className="flex items-center justify-center h-44 text-slate-400 text-xs">No sites with daily targets configured</div>
    ) : (
        <ResponsiveContainer width="100%" height={180}>
            <BarChart
                data={[...sitesData]
                    .filter((s: any) => s.total_target > 0)
                    .map((s: any) => ({
                        name:        s.site_no,
                        site_name:   s.site_name,
                        target:      s.total_target,
                        actual:      s.total_units,
                        achievement: s.achievement_pct,
                    }))}
                barCategoryGap="30%"
                barGap={2}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                    content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        return (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
                                <p style={{ fontWeight: 700, marginBottom: 4 }}>{d?.site_name || label}</p>
                                <p style={{ color: '#6366f1' }}>Actual: {Number(d?.actual || 0).toLocaleString()}</p>
                                <p style={{ color: '#94a3b8' }}>Target: {Number(d?.target || 0).toLocaleString()}</p>
                                <p style={{ color: d?.achievement >= 100 ? '#10b981' : d?.achievement >= 80 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
                                    Achievement: {d?.achievement != null ? `${d.achievement}%` : 'N/A'}
                                </p>
                            </div>
                        );
                    }}
                />
                <Bar dataKey="target" name="Target" fill="#cbd5e1" radius={[3, 3, 0, 0]} barSize={14} />
                <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]} barSize={14}>
                    {[...sitesData]
                        .filter((s: any) => s.total_target > 0)
                        .map((s: any, i: number) => (
                            <Cell
                                key={i}
                                fill={s.achievement_pct == null ? '#94a3b8' : s.achievement_pct >= 100 ? '#10b981' : s.achievement_pct >= 80 ? '#f59e0b' : '#ef4444'}
                            />
                        ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )}
</div>
```

- [ ] **Step 2: Verify `Cell` is imported from recharts**

Check the recharts import line at the top of `Dashboard.tsx`. It should already include `Cell` (it's used in the existing chart). If not, add it:

```ts
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
```

- [ ] **Step 3: TypeScript compile check**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd client
git add src/pages/Dashboard.tsx
git commit -m "feat: replace All Sites chart with grouped actual vs target bars"
```

---

## Task 6: Run all tests and verify

- [ ] **Step 1: Run backend tests**

```bash
cd server && npx jest --no-coverage
```

Expected: all tests pass including `siteTargetAnalytics`.

- [ ] **Step 2: Start dev servers and verify in browser**

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

Open the dashboard as a system_admin user. Verify:
- KPI strip shows 5 cards (Total Sites, Active Workers, Actual Units, Target Units, Achievement) — no OT Paid card
- "Target Units" value = sum of `daily_target * workingDays` across all sites (non-zero if sites have daily_target set)
- "Achievement" card shows correct % or "N/A" if no sites have targets
- "ALL SITES — TARGET vs ACHIEVEMENT" section shows grouped bars (grey target, coloured actual) for each site with `daily_target > 0`
- Tooltip on chart shows site name, actual, target, achievement %

- [ ] **Step 3: Final commit (if any stray changes)**

```bash
git status
# If clean, nothing to do. If any minor fixes:
git add -p
git commit -m "fix: cleanup after site target dashboard implementation"
```
