# Site View Staff List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the staff members working on a site (name + EPF number, with Temp badges for temporary assignments) inside the Sites page View modal.

**Architecture:** Frontend-only. The existing endpoint `GET /users?site=<id>&status=active&date=<yyyy-MM-dd>` already returns the site's active staff plus the supervisor (`IS_TEMP: 0`) merged with staff temp-assigned on that date (`IS_TEMP: 1`), deduped by user id, with per-role visibility enforced server-side. The View modal in `client/src/pages/Sites.tsx` fetches on open and renders a new "Staff Members" section.

**Tech Stack:** React + TypeScript + Tailwind (existing page patterns), `api` axios service, `date-fns` `format`, `lucide-react` icons.

**Spec:** `docs/superpowers/specs/2026-07-09-site-view-staff-list-design.md`

## Global Constraints

- No backend changes; no new npm dependencies.
- User rows arrive with UPPERCASE keys: `ID`, `EPF_NUMBER`, `NAME`, `ROLE`, `IS_TEMP`.
- Scope: active staff + temp-assigned staff for TODAY only (local date, via `format(new Date(), 'yyyy-MM-dd')` — not `toISOString()`, which is UTC and wrong for Asia/Colombo).
- Sort: supervisor first, then permanent staff A→Z, then temp staff A→Z.
- Fetch failures log to console and show the empty state (matches the page's existing error handling).
- Verification is `cd client && npm run build` (tsc + vite) plus manual checks — this page has no unit tests.

---

### Task 1: Staff Members section in the Sites View modal

**Files:**
- Modify: `client/src/pages/Sites.tsx` (4 edits: one import, two state hooks + one effect, computed sort inside the modal IIFE, one JSX block)

**Interfaces:**
- Consumes: `GET /users?site=<id>&status=active&date=<yyyy-MM-dd>` via the existing `api` service → array of `{ ID, EPF_NUMBER, NAME, ROLE, STATUS, SITE_ID, IS_TEMP }` (uppercase keys, `IS_TEMP` is `0 | 1`). Existing state `viewingSite: Site | null` (set when the View modal opens, `null` when closed).
- Produces: nothing consumed by other tasks (single-task plan).

- [ ] **Step 1: Add the date-fns import**

In `client/src/pages/Sites.tsx`, after the existing imports (line 5, `import { useAuth } ...`), add:

```tsx
import { format } from 'date-fns';
```

- [ ] **Step 2: Add state + fetch effect**

Directly after the modal state declarations (after line 31, `const [editingSite, setEditingSite] = useState<Site | null>(null);`), add:

```tsx
    // View modal: staff members working on the site (incl. temp assignments today)
    const [viewStaff, setViewStaff] = useState<User[]>([]);
    const [viewStaffLoading, setViewStaffLoading] = useState(false);
```

Directly after the existing `useEffect(() => { fetchSites(); fetchSupervisors(); fetchAllUsers(); }, []);` (line 47), add:

```tsx
    useEffect(() => {
        if (!viewingSite) { setViewStaff([]); return; }
        let cancelled = false;
        const loadViewStaff = async () => {
            setViewStaffLoading(true);
            try {
                const today = format(new Date(), 'yyyy-MM-dd');
                const r = await api.get(`/users?site=${viewingSite.ID}&status=active&date=${today}`);
                if (!cancelled) setViewStaff(r.data || []);
            } catch (e) {
                console.error('Failed to load site staff', e);
                if (!cancelled) setViewStaff([]);
            } finally {
                if (!cancelled) setViewStaffLoading(false);
            }
        };
        loadViewStaff();
        return () => { cancelled = true; };
    }, [viewingSite?.ID]);
```

Note: the `User` type from `../types` is already imported in this file. If it lacks `IS_TEMP`, add `IS_TEMP?: number;` to the `User` interface in `client/src/types.ts` rather than casting.

- [ ] **Step 3: Add the Staff Members JSX section**

Inside the View Detail modal IIFE (`{viewingSite && (() => { ... })()}`, starts around line 430), first add the sorted list right after the existing `const otCfg = ...` line:

```tsx
                const staffRank = (u: User) => (u.ROLE === 'supervisor' ? 0 : (u.IS_TEMP ? 2 : 1));
                const sortedViewStaff = [...viewStaff].sort(
                    (a, b) => staffRank(a) - staffRank(b) || String(a.NAME).localeCompare(String(b.NAME))
                );
```

Then insert this JSX block immediately after the closing `</div>` of the "Supervisor + Responsible Person" grid (line 530), before the "Task Types table" block:

```tsx
                                {/* Staff Members */}
                                <div>
                                    <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                                        <UsersIcon className="w-4 h-4 text-emerald-500" />
                                        Staff Members{!viewStaffLoading && ` (${viewStaff.length})`}
                                    </h3>
                                    {viewStaffLoading ? (
                                        <div className="space-y-2">
                                            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
                                        </div>
                                    ) : viewStaff.length === 0 ? (
                                        <p className="text-sm text-slate-400 font-medium px-1">No staff assigned</p>
                                    ) : (
                                        <div className="rounded-xl border border-slate-100 divide-y divide-slate-50 overflow-hidden">
                                            {sortedViewStaff.map(u => (
                                                <div key={u.ID} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/50">
                                                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-xs shrink-0">
                                                        {String(u.NAME || '?').charAt(0)}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-bold text-slate-800 text-sm truncate">{u.NAME}</p>
                                                        <p className="text-xs font-mono text-slate-400">{u.EPF_NUMBER}</p>
                                                    </div>
                                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 shrink-0">{u.ROLE}</span>
                                                    {u.IS_TEMP === 1 && (
                                                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase rounded-full shrink-0">Temp</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
```

`UsersIcon` is already imported in this file (line 4, `Users as UsersIcon`). The `skeleton` CSS class already exists (used across the app).

- [ ] **Step 4: Build to verify**

Run: `cd client && npm run build`
Expected: `tsc -b` and Vite build complete with exit 0.

- [ ] **Step 5: Manual verification**

With the backend (`cd server && npm run dev`) and client (`cd client && npm run dev`) running, log in as admin and open the Sites page:

1. Click **View** on a site with assigned staff → "Staff Members (N)" lists each person with name + EPF number; supervisor appears first; count matches the Staff stat card above it.
2. Click **View** on a site with no staff → "No staff assigned".
3. Create a temporary assignment covering today (Assignments feature) for a staff member from another site, then view the target site → that member appears with an amber **Temp** badge; view their home site → they appear there too, without a badge.
4. Log in as a supervisor → viewing their own site still shows the list (endpoint scopes visibility server-side).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Sites.tsx client/src/types.ts
git commit -m "feat: list site staff with EPF numbers in site view modal"
```

(Include `client/src/types.ts` only if Step 2's `IS_TEMP` addition was needed.)
