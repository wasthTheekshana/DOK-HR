# Revenue Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Revenue Report" tab in the Reports page: pick a date range + sites + task types, see per-task counts × unit price with per-site and grand totals, a bar chart of revenue per site, and a two-sheet Excel download — reproducing the manually maintained `docs/JULY.xlsx` workbook.

**Architecture:** One new backend endpoint `GET /api/tasks/revenue-report` runs a single SQL aggregation (same `site_task_types` ⟕ `tasks` name-matching join the invoice generator uses in `server/src/controllers/invoiceController.ts:130-146`). Pure computation (param parsing, date validation, line/summary/grand-total math) lives in a new util module so it can be unit-tested without a DB, matching the existing test style (`server/src/tests/*.test.ts` test pure functions only). The frontend tab is a new self-contained component `client/src/components/RevenueReportTab.tsx` wired into `Reports.tsx` (which is already 1136 lines — new tab goes in its own file).

**Tech Stack:** Express + `execute()` from `server/src/db/dbUtils.ts` (Postgres, `:name` params, **UPPERCASE row keys**), Jest + ts-jest, React + Tailwind, Recharts (`BarChart`), `xlsx` (client-side export), `date-fns`, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-07-09-revenue-report-design.md`

## Global Constraints

- Access is `admin` and `system_admin` only. The Reports page route is already gated to exactly these roles (`client/src/App.tsx:65`, `ADMIN_ROLES = ['admin', 'system_admin']`), so the tab needs no extra client gating — but the endpoint MUST have `requireRole(['admin', 'system_admin'])`.
- DB rows returned by `execute()` have **UPPERCASE keys** (`row.SITE_ID`, not `row.site_id`). JSON responses to the client for this feature use lowercase keys per the spec.
- SQL params use `:name` binding (converted to `$n` by `dbUtils.ts`); IN-lists are built as numbered placeholders (`:sid0, :sid1, …`) exactly like `siteController.ts:46-47`.
- Counts are summed with `COALESCE(t.count, 0)`; null unit price → 0. Task types with zero count in the range still produce rows (0 count, 0 value).
- Task-name matching is always `LOWER(TRIM(...))` on both sides.
- No new npm dependencies on either side.
- Currency displayed with thousand separators and 2 decimals.
- Dates are `yyyy-MM-dd` strings, range inclusive on both ends.

---

### Task 1: Backend revenue-report utils (pure functions, TDD)

**Files:**
- Create: `server/src/utils/revenueReportUtils.ts`
- Test: `server/src/tests/revenueReport.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (used by Task 2):
  - `parseCsvIds(raw: unknown): number[] | null` — `null` when the param is absent/blank; otherwise positive integers parsed from a comma-separated string (invalid entries dropped, so the result can be `[]`).
  - `parseCsvNames(raw: unknown): string[] | null` — `null` when absent/blank; otherwise trimmed, **lowercased**, non-empty names (can be `[]`).
  - `validateDateRange(dateFrom: unknown, dateTo: unknown): string | null` — error message, or `null` when valid.
  - `buildRevenueReport(rows: RevenueLineRow[]): { lines: RevenueLine[]; summary: RevenueSummaryRow[]; grand_total: number }`
  - Types `RevenueLineRow` (UPPERCASE keys, as SQL returns), `RevenueLine`, `RevenueSummaryRow` (lowercase keys, as the API responds).

- [ ] **Step 1: Write the failing tests**

Create `server/src/tests/revenueReport.test.ts`:

```typescript
/// <reference types="jest" />
import {
    parseCsvIds,
    parseCsvNames,
    validateDateRange,
    buildRevenueReport,
    RevenueLineRow,
} from '../utils/revenueReportUtils';

describe('parseCsvIds', () => {
    it('returns null when the param is absent or blank', () => {
        expect(parseCsvIds(undefined)).toBeNull();
        expect(parseCsvIds(null)).toBeNull();
        expect(parseCsvIds('')).toBeNull();
        expect(parseCsvIds('   ')).toBeNull();
    });

    it('parses comma-separated integers, trimming whitespace', () => {
        expect(parseCsvIds('1,2,3')).toEqual([1, 2, 3]);
        expect(parseCsvIds(' 4 , 5 ')).toEqual([4, 5]);
    });

    it('drops non-integer and non-positive entries', () => {
        expect(parseCsvIds('1,abc,2.5,-3,0,7')).toEqual([1, 7]);
        expect(parseCsvIds('abc')).toEqual([]);
    });
});

describe('parseCsvNames', () => {
    it('returns null when the param is absent or blank', () => {
        expect(parseCsvNames(undefined)).toBeNull();
        expect(parseCsvNames('')).toBeNull();
    });

    it('trims and lowercases names, dropping empty entries', () => {
        expect(parseCsvNames(' Scanning , Data Entry ,,')).toEqual(['scanning', 'data entry']);
    });
});

describe('validateDateRange', () => {
    it('requires both dates', () => {
        expect(validateDateRange(undefined, '2026-07-09')).toBe('date_from and date_to are required');
        expect(validateDateRange('2026-07-01', undefined)).toBe('date_from and date_to are required');
    });

    it('rejects malformed dates', () => {
        expect(validateDateRange('07/01/2026', '2026-07-09')).toBe('dates must be in yyyy-MM-dd format');
        expect(validateDateRange('2026-07-01', '2026-7-9')).toBe('dates must be in yyyy-MM-dd format');
    });

    it('rejects date_from after date_to', () => {
        expect(validateDateRange('2026-07-10', '2026-07-09')).toBe('date_from must be on or before date_to');
    });

    it('accepts a valid range and a single-day range', () => {
        expect(validateDateRange('2026-07-01', '2026-07-09')).toBeNull();
        expect(validateDateRange('2026-07-09', '2026-07-09')).toBeNull();
    });
});

describe('buildRevenueReport', () => {
    const rows: RevenueLineRow[] = [
        { SITE_ID: 1, SITE_NO: 'S001', SITE_NAME: 'Coseway',  TASK_NAME: 'Scanning',   TOTAL_COUNT: '3962', UNIT_PRICE: '2.4' },
        { SITE_ID: 2, SITE_NO: 'S002', SITE_NAME: 'PLC',      TASK_NAME: 'Scanning',   TOTAL_COUNT: 0,      UNIT_PRICE: 2 },
        { SITE_ID: 2, SITE_NO: 'S002', SITE_NAME: 'PLC',      TASK_NAME: 'Data Entry', TOTAL_COUNT: 10,     UNIT_PRICE: null },
    ];

    it('maps rows to lowercase lines with line_total = count * price', () => {
        const { lines } = buildRevenueReport(rows);
        expect(lines).toEqual([
            { site_id: 1, site_no: 'S001', site_name: 'Coseway', task_name: 'Scanning',   total_count: 3962, unit_price: 2.4, line_total: 9508.8 },
            { site_id: 2, site_no: 'S002', site_name: 'PLC',     task_name: 'Scanning',   total_count: 0,    unit_price: 2,   line_total: 0 },
            { site_id: 2, site_no: 'S002', site_name: 'PLC',     task_name: 'Data Entry', total_count: 10,   unit_price: 0,   line_total: 0 },
        ]);
    });

    it('groups summary per site preserving line order', () => {
        const { summary } = buildRevenueReport(rows);
        expect(summary).toEqual([
            { site_id: 1, site_name: 'Coseway', total_revenue: 9508.8 },
            { site_id: 2, site_name: 'PLC',     total_revenue: 0 },
        ]);
    });

    it('computes grand_total as the sum of all line totals', () => {
        expect(buildRevenueReport(rows).grand_total).toBe(9508.8);
    });

    it('returns empty structures for no rows', () => {
        expect(buildRevenueReport([])).toEqual({ lines: [], summary: [], grand_total: 0 });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx jest src/tests/revenueReport.test.ts`
Expected: FAIL — `Cannot find module '../utils/revenueReportUtils'`

- [ ] **Step 3: Write the implementation**

Create `server/src/utils/revenueReportUtils.ts`:

```typescript
// Pure helpers for the revenue report endpoint. Rows arrive with UPPERCASE
// keys (dbUtils uppercases Postgres columns to match Oracle behaviour);
// the API responds with lowercase keys.

export interface RevenueLineRow {
    SITE_ID: number | string;
    SITE_NO: string | null;
    SITE_NAME: string | null;
    TASK_NAME: string | null;
    TOTAL_COUNT: number | string | null;
    UNIT_PRICE: number | string | null;
}

export interface RevenueLine {
    site_id: number;
    site_no: string;
    site_name: string;
    task_name: string;
    total_count: number;
    unit_price: number;
    line_total: number;
}

export interface RevenueSummaryRow {
    site_id: number;
    site_name: string;
    total_revenue: number;
}

export function parseCsvIds(raw: unknown): number[] | null {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    return String(raw)
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => Number.isInteger(n) && n > 0);
}

export function parseCsvNames(raw: unknown): string[] | null {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    return String(raw)
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(s => s.length > 0);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateDateRange(dateFrom: unknown, dateTo: unknown): string | null {
    if (!dateFrom || !dateTo) return 'date_from and date_to are required';
    const from = String(dateFrom);
    const to = String(dateTo);
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return 'dates must be in yyyy-MM-dd format';
    if (from > to) return 'date_from must be on or before date_to';
    return null;
}

export function buildRevenueReport(rows: RevenueLineRow[]): {
    lines: RevenueLine[];
    summary: RevenueSummaryRow[];
    grand_total: number;
} {
    const lines: RevenueLine[] = rows.map(r => {
        const total_count = Number(r.TOTAL_COUNT) || 0;
        const unit_price = Number(r.UNIT_PRICE) || 0;
        return {
            site_id:    Number(r.SITE_ID) || 0,
            site_no:    String(r.SITE_NO ?? ''),
            site_name:  String(r.SITE_NAME ?? ''),
            task_name:  String(r.TASK_NAME ?? ''),
            total_count,
            unit_price,
            line_total: total_count * unit_price,
        };
    });

    const bySite = new Map<number, RevenueSummaryRow>();
    for (const line of lines) {
        const existing = bySite.get(line.site_id);
        if (existing) {
            existing.total_revenue += line.line_total;
        } else {
            bySite.set(line.site_id, {
                site_id: line.site_id,
                site_name: line.site_name,
                total_revenue: line.line_total,
            });
        }
    }
    const summary = Array.from(bySite.values());
    const grand_total = summary.reduce((sum, s) => sum + s.total_revenue, 0);

    return { lines, summary, grand_total };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest src/tests/revenueReport.test.ts`
Expected: PASS — 13 tests

- [ ] **Step 5: Run the full server test suite**

Run: `cd server && npx jest`
Expected: all suites PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add server/src/utils/revenueReportUtils.ts server/src/tests/revenueReport.test.ts
git commit -m "feat: add revenue report pure helpers with tests"
```

---

### Task 2: Backend endpoint `GET /api/tasks/revenue-report`

**Files:**
- Modify: `server/src/controllers/taskController.ts` (append new export at end of file)
- Modify: `server/src/routes/taskRoutes.ts`

**Interfaces:**
- Consumes (from Task 1): `parseCsvIds`, `parseCsvNames`, `validateDateRange`, `buildRevenueReport`, type `RevenueLineRow` from `../utils/revenueReportUtils`; `execute` from `../db/dbUtils` (already imported in `taskController.ts`).
- Produces (used by Task 3): `GET /api/tasks/revenue-report?date_from&date_to&site_ids&task_names` →
  `200 { date_from: string, date_to: string, lines: RevenueLine[], summary: RevenueSummaryRow[], grand_total: number }`
  (lowercase keys exactly as defined in Task 1), `400 { message: string }` on bad input. Roles: `admin`, `system_admin`.

- [ ] **Step 1: Add the controller function**

At the end of `server/src/controllers/taskController.ts`, add (plus the import at the top of the file, after the existing imports):

```typescript
import { parseCsvIds, parseCsvNames, validateDateRange, buildRevenueReport, RevenueLineRow } from '../utils/revenueReportUtils';
```

```typescript
// ─── Revenue Report ──────────────────────────────────────────────────────────
// Counts × unit price per site task type over a date range. Uses the same
// name-matching join as invoice generation so numbers always match invoices.
export const getRevenueReport = async (req: Request, res: Response) => {
    const { date_from, date_to, site_ids, task_names } = req.query;

    const dateErr = validateDateRange(date_from, date_to);
    if (dateErr) return res.status(400).json({ message: dateErr });

    const siteIds = parseCsvIds(site_ids);
    if (siteIds !== null && siteIds.length === 0) {
        return res.status(400).json({ message: 'site_ids contains no valid ids' });
    }
    const taskNames = parseCsvNames(task_names);
    if (taskNames !== null && taskNames.length === 0) {
        return res.status(400).json({ message: 'task_names contains no valid names' });
    }

    try {
        const params: Record<string, any> = { date_from: String(date_from), date_to: String(date_to) };
        let filters = '';
        if (siteIds) {
            const placeholders = siteIds.map((id, i) => {
                params[`sid${i}`] = id;
                return `:sid${i}`;
            }).join(', ');
            filters += ` AND s.id IN (${placeholders})`;
        } else {
            filters += ` AND s.status = 'active'`;
        }
        if (taskNames) {
            const placeholders = taskNames.map((name, i) => {
                params[`tn${i}`] = name;
                return `:tn${i}`;
            }).join(', ');
            filters += ` AND LOWER(TRIM(stt.task_name)) IN (${placeholders})`;
        }

        const result = await execute<RevenueLineRow>(
            `SELECT s.id                                   AS site_id,
                    s.site_no                              AS site_no,
                    s.name                                 AS site_name,
                    stt.task_name                          AS task_name,
                    COALESCE(SUM(COALESCE(t.count, 0)), 0) AS total_count,
                    COALESCE(stt.invoice_price, 0)         AS unit_price
             FROM site_task_types stt
             JOIN sites s ON s.id = stt.site_id
             LEFT JOIN tasks t
                ON  t.site_id = stt.site_id
               AND  LOWER(TRIM(t.task_description)) = LOWER(TRIM(stt.task_name))
               AND  t.task_date >= :date_from
               AND  t.task_date <= :date_to
             WHERE 1=1${filters}
             GROUP BY s.id, s.site_no, s.name, stt.task_name, stt.invoice_price
             ORDER BY s.site_no, stt.task_name`,
            params
        );

        const { lines, summary, grand_total } = buildRevenueReport(result.rows || []);
        res.json({ date_from: String(date_from), date_to: String(date_to), lines, summary, grand_total });
    } catch (err) {
        console.error('getRevenueReport error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
```

Notes for the implementer:
- `site_ids` omitted → all **active** sites; `site_ids` provided → exactly those ids (no status filter, matching the spec's "omitted = all active sites").
- `taskNames` are already lowercased by `parseCsvNames`, so the SQL compares `LOWER(TRIM(stt.task_name))` against them directly.
- Zero-count task types survive because `tasks` is LEFT-joined and the filters live in the join condition, not the WHERE clause.

- [ ] **Step 2: Register the route**

In `server/src/routes/taskRoutes.ts`, add `getRevenueReport` to the existing import from `../controllers/taskController`, and add this line directly after the `weekly-operation-report` route (line 10):

```typescript
router.get('/revenue-report', requireRole(['admin', 'system_admin']), getRevenueReport);
```

- [ ] **Step 3: Typecheck the server**

Run: `cd server && npx tsc --noEmit`
Expected: exit 0, no errors

- [ ] **Step 4: Run the server test suite**

Run: `cd server && npx jest`
Expected: all suites PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/taskController.ts server/src/routes/taskRoutes.ts
git commit -m "feat: add revenue report endpoint (admin/system_admin)"
```

---

### Task 3: Frontend Revenue Report tab

**Files:**
- Create: `client/src/components/RevenueReportTab.tsx`
- Modify: `client/src/pages/Reports.tsx` (tab union type at line 11, tabs array at lines 429-435, tab body after the `weekly_report` block, imports)

**Interfaces:**
- Consumes: `GET /tasks/revenue-report` from Task 2 (via `api` service, which is pre-configured with the `/api` base URL and auth header); `sites: Site[]` prop from `Reports.tsx` (each site already carries `TASK_TYPES: { SITE_ID, TASK_NAME, INVOICE_PRICE }[]` — populated by the existing `GET /sites`).
- Produces: default-exported React component `RevenueReportTab` with props `{ sites: Site[] }`.

- [ ] **Step 1: Create the tab component**

Create `client/src/components/RevenueReportTab.tsx`:

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import type { Site } from '../types';
import { format } from 'date-fns';
import { ChevronDown, Download, FileText, Play } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface RevenueLine {
    site_id: number; site_no: string; site_name: string;
    task_name: string; total_count: number; unit_price: number; line_total: number;
}
interface RevenueSummary { site_id: number; site_name: string; total_revenue: number; }
interface RevenueReport {
    date_from: string; date_to: string;
    lines: RevenueLine[]; summary: RevenueSummary[]; grand_total: number;
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCount = (n: number) => n.toLocaleString('en-US');

// Checkbox dropdown. Empty `selected` means "all".
const MultiSelect = ({ label, options, selected, onChange }: {
    label: string;
    options: { value: string; label: string }[];
    selected: string[];
    onChange: (next: string[]) => void;
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const toggle = (value: string) => {
        onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
    };

    const buttonText = selected.length === 0
        ? `All ${label}`
        : `${selected.length} of ${options.length} selected`;

    return (
        <div className="relative" ref={ref}>
            <button type="button" onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all">
                <span className="truncate">{buttonText}</span>
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
            {open && (
                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg p-2">
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm font-semibold text-slate-700">
                        <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        All {label}
                    </label>
                    <div className="border-t border-slate-100 my-1" />
                    {options.map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-600">
                            <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                            <span className="truncate">{opt.label}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

const RevenueReportTab: React.FC<{ sites: Site[] }> = ({ sites }) => {
    const [dateFrom, setDateFrom] = useState(format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'));
    const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);   // empty = all sites
    const [selectedTasks, setSelectedTasks] = useState<string[]>([]);       // lowercased names; empty = all
    const [report, setReport] = useState<RevenueReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const activeSites = useMemo(() => sites.filter(s => s.STATUS !== 'inactive'), [sites]);

    const siteOptions = useMemo(
        () => activeSites.map(s => ({ value: String(s.ID), label: `${s.SITE_NO} - ${s.NAME}` })),
        [activeSites]
    );

    // Task options = union of task types across the selected sites (all sites when none selected).
    // Key is the lowercased trimmed name; label shows the price when it is the same everywhere.
    const taskOptions = useMemo(() => {
        const scope = selectedSiteIds.length === 0
            ? activeSites
            : activeSites.filter(s => selectedSiteIds.includes(String(s.ID)));
        const byKey = new Map<string, { display: string; prices: Set<number> }>();
        for (const site of scope) {
            for (const tt of site.TASK_TYPES || []) {
                const key = tt.TASK_NAME.trim().toLowerCase();
                if (!key) continue;
                const entry = byKey.get(key) || { display: tt.TASK_NAME.trim(), prices: new Set<number>() };
                entry.prices.add(Number(tt.INVOICE_PRICE) || 0);
                byKey.set(key, entry);
            }
        }
        return Array.from(byKey.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, { display, prices }]) => ({
                value: key,
                label: prices.size === 1 ? `${display} — Rs ${fmt([...prices][0])}` : `${display} — multiple prices`,
            }));
    }, [activeSites, selectedSiteIds]);

    // Prune task selections that no longer exist for the chosen sites.
    useEffect(() => {
        const valid = new Set(taskOptions.map(o => o.value));
        setSelectedTasks(prev => prev.filter(t => valid.has(t)));
    }, [taskOptions]);

    const generate = async () => {
        setError('');
        if (!dateFrom || !dateTo) { setError('Both dates are required.'); return; }
        if (dateFrom > dateTo) { setError('Date From must be on or before Date To.'); return; }
        setLoading(true);
        try {
            const params: Record<string, string> = { date_from: dateFrom, date_to: dateTo };
            if (selectedSiteIds.length > 0) params.site_ids = selectedSiteIds.join(',');
            if (selectedTasks.length > 0) params.task_names = selectedTasks.join(',');
            const res = await api.get('/tasks/revenue-report', { params });
            setReport(res.data);
        } catch {
            setError('Failed to generate the report.');
            setReport(null);
        } finally {
            setLoading(false);
        }
    };

    const exportExcel = () => {
        if (!report) return;
        const detail: (string | number)[][] = [
            ['Project Name', 'Task', 'Total Count', 'Unit Price', 'Total Value'],
            ...report.lines.map(l => [l.site_name, l.task_name, l.total_count, l.unit_price, l.line_total]),
            ['Grand Total', '', '', '', report.grand_total],
        ];
        const summary: (string | number)[][] = [
            ['Projects', 'Total Revenue'],
            ...report.summary.map(s => [s.site_name, s.total_revenue]),
            ['Total', report.grand_total],
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), 'Detail');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');
        XLSX.writeFile(wb, `Revenue-Report_${report.date_from}_${report.date_to}.xlsx`);
    };

    const chartData = useMemo(
        () => (report?.summary || []).map(s => ({ name: s.site_name, revenue: Math.round(s.total_revenue * 100) / 100 })),
        [report]
    );

    return (
        <div className="space-y-5">
            {/* Filters */}
            <div className="card p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date From</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date To</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Sites</label>
                        <MultiSelect label="Sites" options={siteOptions} selected={selectedSiteIds} onChange={setSelectedSiteIds} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tasks</label>
                        <MultiSelect label="Tasks" options={taskOptions} selected={selectedTasks} onChange={setSelectedTasks} />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={generate} disabled={loading}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                            <Play className="w-4 h-4" />
                            Generate
                        </button>
                        <button onClick={exportExcel} disabled={!report || report.lines.length === 0}
                            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Excel</span>
                        </button>
                    </div>
                </div>
                {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
            </div>

            {loading ? (
                <div className="card p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
            ) : !report ? (
                <div className="card py-16 text-center">
                    <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">Select filters and press Generate</p>
                </div>
            ) : report.lines.length === 0 ? (
                <div className="card py-16 text-center">
                    <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No data found for the selected criteria</p>
                </div>
            ) : (
                <>
                    {/* Detail table */}
                    <div className="card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-100">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Task</th>
                                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Count</th>
                                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Unit Price (Rs)</th>
                                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Value (Rs)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {report.lines.map((line, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                            <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 whitespace-nowrap">
                                                {idx === 0 || report.lines[idx - 1].site_id !== line.site_id ? line.site_name : ''}
                                            </td>
                                            <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap">{line.task_name}</td>
                                            <td className="px-5 py-3.5 text-sm text-slate-600 text-right">{fmtCount(line.total_count)}</td>
                                            <td className="px-5 py-3.5 text-sm text-slate-600 text-right">{fmt(line.unit_price)}</td>
                                            <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 text-right">{fmt(line.line_total)}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-slate-50">
                                        <td colSpan={4} className="px-5 py-3.5 text-sm font-bold text-slate-900">Grand Total</td>
                                        <td className="px-5 py-3.5 text-sm font-bold text-slate-900 text-right">{fmt(report.grand_total)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Summary + chart */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="card overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100">
                                <h3 className="text-sm font-bold text-slate-900">Revenue by Project</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                                            <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Revenue (Rs)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {report.summary.map(s => (
                                            <tr key={s.site_id} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 whitespace-nowrap">{s.site_name}</td>
                                                <td className="px-5 py-3.5 text-sm text-slate-600 text-right">{fmt(s.total_revenue)}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-slate-50">
                                            <td className="px-5 py-3.5 text-sm font-bold text-slate-900">Total</td>
                                            <td className="px-5 py-3.5 text-sm font-bold text-slate-900 text-right">{fmt(report.grand_total)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="card p-5">
                            <h3 className="text-sm font-bold text-slate-900 mb-4">Revenue Chart</h3>
                            <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 20)}>
                                <BarChart data={chartData} layout="vertical" barSize={14} margin={{ left: 8, right: 24 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" tickFormatter={(v: number) => v.toLocaleString('en-US')} tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                                    <Tooltip formatter={(value) => [`Rs ${fmt(Number(value))}`, 'Revenue']} />
                                    <Bar dataKey="revenue" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default RevenueReportTab;
```

- [ ] **Step 2: Wire the tab into Reports.tsx**

In `client/src/pages/Reports.tsx`:

1. Add the import next to the other imports:

```tsx
import RevenueReportTab from '../components/RevenueReportTab';
import { Coins } from 'lucide-react';
```

(Or append `Coins` to the existing `lucide-react` import list on line 5 instead of a second import statement.)

2. Extend the tab union type (line 11):

```tsx
const [activeTab, setActiveTab] = useState<'daily_count' | 'salary' | 'ot_analysis' | 'custom_ot' | 'weekly_report' | 'revenue_report'>('daily_count');
```

3. Append to the `tabs` array (after the `weekly_report` entry at line 434):

```tsx
{ id: 'revenue_report' as const, label: 'Revenue Report', icon: Coins },
```

4. Add the tab body immediately after the closing of the `{activeTab === 'weekly_report' && (...)}` block:

```tsx
{activeTab === 'revenue_report' && <RevenueReportTab sites={sites} />}
```

No role check is needed here: the whole Reports route is already restricted to `admin`/`system_admin` in `client/src/App.tsx:65`.

- [ ] **Step 3: Typecheck and build the client**

Run: `cd client && npm run build`
Expected: `tsc -b` passes and Vite build completes with exit 0

- [ ] **Step 4: Commit**

```bash
git add client/src/components/RevenueReportTab.tsx client/src/pages/Reports.tsx
git commit -m "feat: add revenue report tab with table, chart and Excel export"
```

---

### Task 4: End-to-end verification

**Files:**
- None created; manual verification of Tasks 1-3 working together.

**Interfaces:**
- Consumes: the running app (server `npm run dev` in `server/`, client `npm run dev` in `client/`), an admin login.
- Produces: verified feature; any fixes found get committed.

- [ ] **Step 1: Run the full automated suite once more**

Run: `cd server && npx jest && npx tsc --noEmit`
Expected: all tests PASS, no type errors

- [ ] **Step 2: Manual smoke test**

Start the server and client dev servers, log in as an **admin**:

1. Open Reports → the **Revenue Report** tab appears after Weekly Report.
2. Pick a date range known to have task data, leave Sites/Tasks on "All", press **Generate** → detail table shows Project | Task | Total Count | Unit Price | Total Value rows (task types with no counts in range show 0), grand total row at the bottom; summary table and horizontal bar chart show one entry per site.
3. Select a single site → Tasks dropdown reduces to that site's task types (labels show `Name — Rs price`). Select one task, Generate → only that site+task appears; totals match `count × price`.
4. Cross-check one site's numbers against an invoice for the same site and range (Invoices page) — task counts and line totals must match.
5. Set Date From after Date To, press Generate → inline validation message, no request fired (check network tab).
6. Press **Excel** → file `Revenue-Report_<from>_<to>.xlsx` downloads with a `Detail` sheet (5 columns + Grand Total row) and a `Summary` sheet (2 columns + Total row); values match the screen.
7. Log in as a **supervisor** → the Reports page itself is inaccessible (redirects to `/`); calling `GET /api/tasks/revenue-report` directly with a supervisor token returns 403.

Expected: all seven checks pass.

- [ ] **Step 3: Commit any fixes found**

```bash
git add -A
git commit -m "fix: revenue report verification fixes"
```

(Skip the commit if nothing needed fixing.)
