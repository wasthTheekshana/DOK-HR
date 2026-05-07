# Tasks Page Mobile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Tasks.tsx table-based inline-edit UI with a card list + right-slide panel design across all screen sizes.

**Architecture:** Single file change (`client/src/pages/Tasks.tsx`). The `newDrafts`/`editDrafts`/`savingIds` state is replaced by a `panelState` object + individual form field states. The panel is a `fixed` element that slides in from the right via CSS transform; the main content adds `md:mr-[45%]` margin to reveal the list when the panel is open on desktop.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, lucide-react

---

## Key facts about the existing file

- **Line count:** ~814 lines
- **Auth:** `const { role, user: authUser } = useAuth()` — user ID is `authUser?.ID`
- **Fetch function:** `loadDailySheet()` — fetches both `/users` and `/tasks` then sets state
- **Keep unchanged:** `handleDeleteTask`, `deletingIds`, `loadDailySheet`, `loadSummaryData`, `downloadDailyReport`, `downloadSummaryReport`, `getSite`, `fetchSites`, summary view JSX (lines ~506–602)
- **Remove entirely:** `newDrafts`/`setNewDrafts`, `editDrafts`/`setEditDrafts`, `savingIds`/`setSavingIds`, `addNewDraft`, `updateNewDraft`, `cancelNewDraft`, `saveNewTask`, `startEditTask`, `updateEditDraft`, `cancelEditTask`, `saveEditTask`, `TaskTypeSelect` helper component, the entire grouped table JSX (lines ~619–808)
- **Description field:** The `tasks` table has no free-text notes column. The mockup's "Description" field is omitted from the implementation — `task_description` stores only the task type name.

---

### Task 1: Update imports and replace state

**Files:**
- Modify: `client/src/pages/Tasks.tsx`

- [ ] **Step 1: Update the lucide-react import line**

The current import line (line 4) must add `ArrowLeft`, `MoreVertical`, `AlertCircle` and can remove `Pencil`, `Check`, `Loader2` (no longer used). Replace line 4 with:

```typescript
import { Calendar, MapPin, Target, User as UserIcon, BarChart3, LayoutList, Clock, ChevronRight, TrendingUp, Users, Plus, Trash2, X, Download, Save, ArrowLeft, MoreVertical, AlertCircle } from 'lucide-react';
```

- [ ] **Step 2: Delete the `TaskTypeSelect` helper component**

Delete lines 9–15 (the `const TaskTypeSelect` block). It's no longer used.

- [ ] **Step 3: Add the `PanelState` type above the component**

Insert this just before `const Tasks: React.FC = () => {`:

```typescript
type PanelState =
  | null
  | { mode: 'add'; staffId: number }
  | { mode: 'edit'; task: Task };
```

- [ ] **Step 4: Replace old draft state with panel state**

Find the three state declarations on lines 33–36:
```typescript
const [newDrafts, setNewDrafts] = useState<Record<number, Array<{ _tid: string } & Partial<Task>>>>({});
const [editDrafts, setEditDrafts] = useState<Record<number, Partial<Task>>>({});
const [savingIds, setSavingIds] = useState<Set<string | number>>(new Set());
```

Replace them with:
```typescript
const [panelState, setPanelState] = useState<PanelState>(null);
const [panelError, setPanelError] = useState<string | null>(null);
const [panelSaving, setPanelSaving] = useState(false);
const [panelTaskType, setPanelTaskType] = useState('');
const [panelCount, setPanelCount] = useState(0);
const [panelDate, setPanelDate] = useState(today);
const [panelInTime, setPanelInTime] = useState('');
const [panelOutTime, setPanelOutTime] = useState('');
const [openMenuId, setOpenMenuId] = useState<number | null>(null);
```

- [ ] **Step 5: Remove `setNewDrafts({})` and `setEditDrafts({})` calls inside `loadDailySheet`**

There are two places inside `loadDailySheet` (lines ~79–80 and ~93–94) that call:
```typescript
setNewDrafts({});
setEditDrafts({});
```
Delete both pairs of those two lines.

- [ ] **Step 6: Run TypeScript check — expect errors about removed functions**

```bash
cd d:\Project\DOK-HR\client && npx tsc --noEmit 2>&1 | head -40
```

Expected: errors about `newDrafts`, `editDrafts`, `savingIds`, `addNewDraft`, etc. being referenced in JSX below. That's fine — we'll replace the JSX in later tasks.

---

### Task 2: Add panel helper functions

**Files:**
- Modify: `client/src/pages/Tasks.tsx`

Place all of these after the existing `handleDeleteTask` function (around line 349).

- [ ] **Step 1: Add `isPrivileged` constant**

After line 19 (`const isStaff = role === 'staff'`), add:

```typescript
const isPrivileged = role === 'admin' || role === 'supervisor' || role === 'system_admin';
```

- [ ] **Step 2: Add `openPanel` and `closePanel` functions**

```typescript
const openPanel = (state: NonNullable<PanelState>) => {
    setPanelError(null);
    if (state.mode === 'edit') {
        const t = state.task;
        setPanelTaskType(t.TASK_DESCRIPTION || '');
        setPanelCount(t.COUNT || 0);
        setPanelDate(String(t.TASK_DATE).slice(0, 10));
        setPanelInTime(t.IN_TIME || '');
        setPanelOutTime(t.OUT_TIME || '');
    } else {
        setPanelTaskType('');
        setPanelCount(0);
        setPanelDate(selectedDate);
        setPanelInTime('');
        setPanelOutTime('');
    }
    setPanelState(state);
};

const closePanel = () => {
    setPanelState(null);
    setPanelError(null);
};
```

- [ ] **Step 3: Add `handlePanelSave` function**

```typescript
const handlePanelSave = async () => {
    if (!panelTaskType) { setPanelError('Please select a task type'); return; }
    const site = getSite();
    if (!site) return;
    setPanelSaving(true);
    setPanelError(null);
    try {
        const siteOtType = site.OT_TYPE || 'time_based';
        const taskOtType = siteOtType === 'staff_outsource' ? 'time_based' : siteOtType;
        if (panelState?.mode === 'edit') {
            await api.patch(`/tasks/${panelState.task.ID}`, {
                task_description: panelTaskType,
                ot_type: taskOtType,
                count: Number(panelCount || 0),
                in_time: panelInTime || null,
                out_time: panelOutTime || null,
                task_date: panelDate,
            });
        } else if (panelState?.mode === 'add') {
            await api.post('/tasks', {
                site_id: site.ID,
                staff_id: panelState.staffId,
                task_date: panelDate,
                task_description: panelTaskType,
                ot_type: taskOtType,
                count: Number(panelCount || 0),
                in_time: panelInTime || null,
                out_time: panelOutTime || null,
            });
        }
        closePanel();
        await loadDailySheet();
    } catch (err: any) {
        setPanelError(err.response?.data?.message || 'Failed to save task');
    } finally {
        setPanelSaving(false);
    }
};
```

- [ ] **Step 4: Add click-outside useEffect to close the three-dot menu**

Add this after the existing `useEffect` blocks (around line 49):

```typescript
useEffect(() => {
    if (openMenuId === null) return;
    const handler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-menu]')) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
}, [openMenuId]);
```

- [ ] **Step 5: Delete all old draft helper functions**

Find and delete these functions entirely (they are no longer called):
- `addNewDraft` (and its sub-function)
- `updateNewDraft`
- `cancelNewDraft`
- `saveNewTask`
- `startEditTask`
- `updateEditDraft`
- `cancelEditTask`
- `saveEditTask`

- [ ] **Step 6: TypeScript check**

```bash
cd d:\Project\DOK-HR\client && npx tsc --noEmit 2>&1 | head -40
```

Expected: errors only about JSX referencing the removed functions — fine, we fix those next.

---

### Task 3: Rewrite the return JSX — wrapper, header, filters

**Files:**
- Modify: `client/src/pages/Tasks.tsx` (the `return (` block, lines ~366–460)

- [ ] **Step 1: Replace the outer wrapper and header**

Find `return (` and the `<div className="space-y-5">` that follows. Replace from `return (` down to and including the closing `</div>` of the header card (`</div>` after the filter block, around line 460) with:

```tsx
return (
    <div className="relative">
        {/* Main content — shifts left on desktop when panel is open */}
        <div className={`space-y-4 transition-all duration-300 ${panelState ? 'md:mr-[45%]' : ''}`}>

            {/* Header card */}
            <div className="card p-5 space-y-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-[17px] font-bold text-slate-900 tracking-tight">Daily Tasks</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {isStaff ? 'Add your tasks for today' : 'Manage tasks for all employees'}
                        </p>
                    </div>
                    {role === 'admin' && (
                        <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                            <button onClick={() => setViewMode('daily')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${viewMode === 'daily' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                <LayoutList className="w-3.5 h-3.5" /> Daily
                            </button>
                            <button onClick={() => setViewMode('summary')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${viewMode === 'summary' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                <BarChart3 className="w-3.5 h-3.5" /> Summary
                            </button>
                        </div>
                    )}
                </div>

                {viewMode === 'daily' ? (
                    <div className="space-y-3">
                        {!isStaff && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Site</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">
                                        {role === 'admin' && <option value="ALL">All Sites</option>}
                                        {sites.map(s => <option key={s.ID} value={s.SITE_NO}>{s.NAME}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="date" value={selectedDate}
                                    onChange={isStaff || role === 'supervisor' ? undefined : e => setSelectedDate(e.target.value)}
                                    min={isStaff || role === 'supervisor' ? today : undefined}
                                    max={isStaff || role === 'supervisor' ? today : undefined}
                                    readOnly={isStaff || role === 'supervisor'}
                                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                            </div>
                        </div>
                        {role === 'admin' && (
                            <button onClick={downloadDailyReport}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors">
                                <Download className="w-4 h-4" /> Download
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">From Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="date" value={summaryDateFrom} onChange={e => setSummaryDateFrom(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">To Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="date" value={summaryDateTo} onChange={e => setSummaryDateTo(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                            </div>
                        </div>
                        <button onClick={downloadSummaryReport}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors">
                            <Download className="w-4 h-4" /> Download Summary
                        </button>
                    </div>
                )}
            </div>
```

- [ ] **Step 2: TypeScript check**

```bash
cd d:\Project\DOK-HR\client && npx tsc --noEmit 2>&1 | head -40
```

---

### Task 4: Add vertical stats bar

**Files:**
- Modify: `client/src/pages/Tasks.tsx`

- [ ] **Step 1: Replace the existing stats grid with vertical card rows**

Find the old stats bar (`<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">` with three cards, around line 463). Delete that entire block and replace with:

```tsx
            {/* Stats bar — daily mode, site selected */}
            {viewMode === 'daily' && !loading && currentSite && (
                <div className="space-y-3">
                    {([
                        {
                            icon: Users,
                            label: 'Total Staff',
                            value: String(totalUsers),
                            sub: 'Active employees',
                            bg: 'bg-indigo-50',
                            color: 'text-indigo-600',
                        },
                        {
                            icon: TrendingUp,
                            label: 'Recorded',
                            value: String(recordedCount),
                            sub: 'Tasks recorded',
                            bg: 'bg-emerald-50',
                            color: 'text-emerald-600',
                        },
                        {
                            icon: currentSite.OT_TYPE === 'time_based' ? Clock : Target,
                            label: 'OT Type',
                            value: currentSite.OT_TYPE === 'time_based' ? 'Time' : currentSite.OT_TYPE === 'target_based' ? 'Target' : 'Outsource',
                            sub: 'Overtime tracking',
                            bg: currentSite.OT_TYPE === 'time_based' ? 'bg-blue-50' : 'bg-violet-50',
                            color: currentSite.OT_TYPE === 'time_based' ? 'text-blue-600' : 'text-violet-600',
                        },
                    ] as const).map((stat) => {
                        const Icon = stat.icon;
                        return (
                            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4">
                                <div className={`w-11 h-11 ${stat.bg} rounded-xl flex items-center justify-center shrink-0`}>
                                    <Icon className={`w-5 h-5 ${stat.color}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                                    <p className="text-2xl font-black text-slate-900 leading-tight">{stat.value}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{stat.sub}</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                            </div>
                        );
                    })}
                </div>
            )}
```

- [ ] **Step 2: TypeScript check**

```bash
cd d:\Project\DOK-HR\client && npx tsc --noEmit 2>&1 | head -40
```

---

### Task 5: Replace the main content area with the employee card list

**Files:**
- Modify: `client/src/pages/Tasks.tsx`

This task replaces the entire `<div className="card overflow-hidden">` block (lines ~499–808) — the grouped table, inline editing rows, summary view, and all-sites view — with the new card list. The summary view JSX is preserved verbatim inside this new structure.

- [ ] **Step 1: Replace everything from the main content card to the end of the return**

Delete from `{/* Main Content */}` (around line 499) to the final `);` of the return. Then write:

```tsx
            {/* Main content card */}
            <div className="card overflow-hidden">
                {loading ? (
                    <div className="p-5 space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="skeleton h-16 rounded-2xl" />
                        ))}
                    </div>

                ) : viewMode === 'summary' ? (
                    /* ── Summary view — kept exactly as before ── */
                    <div className="divide-y divide-slate-100">
                        {summaryData.length === 0 ? (
                            <div className="py-16 text-center">
                                <BarChart3 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-500 font-medium">No tasks found for the selected date range</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5">
                                    <div className="bg-indigo-50 rounded-2xl p-3 text-center shadow-sm">
                                        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Sites</p>
                                        <p className="text-2xl font-bold text-indigo-900 mt-1">{summaryData.length}</p>
                                    </div>
                                    <div className="bg-emerald-50 rounded-2xl p-3 text-center shadow-sm">
                                        <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Staff</p>
                                        <p className="text-2xl font-bold text-emerald-900 mt-1">{summaryData.reduce((s: number, d: any) => s + d.total_staff, 0)}</p>
                                    </div>
                                    <div className="bg-blue-50 rounded-2xl p-3 text-center shadow-sm">
                                        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Hours</p>
                                        <p className="text-2xl font-bold text-blue-900 mt-1">{summaryData.reduce((s: number, d: any) => s + (d.total_hours || 0), 0).toFixed(1)}</p>
                                    </div>
                                    <div className="bg-orange-50 rounded-2xl p-3 text-center shadow-sm">
                                        <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">Count</p>
                                        <p className="text-2xl font-bold text-orange-900 mt-1">{summaryData.reduce((s: number, d: any) => s + (d.total_count || 0), 0)}</p>
                                    </div>
                                </div>
                                {summaryData.map((site: any) => {
                                    const isExpanded = expandedSites.has(site.site_no);
                                    const toggle = () => setExpandedSites(prev => {
                                        const n = new Set(prev);
                                        isExpanded ? n.delete(site.site_no) : n.add(site.site_no);
                                        return n;
                                    });
                                    return (
                                        <div key={site.site_no} className="border-t border-slate-100">
                                            <button onClick={toggle} className="w-full px-5 py-4 flex items-center justify-between hover:bg-indigo-50/40 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                                    <div className="text-left">
                                                        <p className="font-semibold text-slate-800">{site.site_name}</p>
                                                        <p className="text-xs text-slate-500">#{site.site_no} &middot; {site.total_staff} staff</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-right hidden sm:block">
                                                        {site.site_ot_type === 'time_based' ? (
                                                            <p className="text-sm font-semibold text-blue-600">{(site.total_hours || 0).toFixed(1)} hrs</p>
                                                        ) : (
                                                            <p className="text-sm font-semibold text-violet-600">{site.total_count} units</p>
                                                        )}
                                                    </div>
                                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${site.site_ot_type === 'time_based' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
                                                        {site.site_ot_type === 'time_based' ? 'Time' : 'Target'}
                                                    </span>
                                                </div>
                                            </button>
                                            {isExpanded && (
                                                <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/50">
                                                    <table className="min-w-full divide-y divide-slate-100">
                                                        <thead>
                                                            <tr className="bg-slate-100/60">
                                                                <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                                                                <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                                                                <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Task</th>
                                                                {site.site_ot_type === 'target_based' && <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Count</th>}
                                                                {site.site_ot_type === 'time_based' && <>
                                                                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">In</th>
                                                                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Out</th>
                                                                    <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Count</th>
                                                                </>}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100 bg-white">
                                                            {site.tasks.map((task: any, i: number) => (
                                                                <tr key={i} className="hover:bg-slate-50">
                                                                    <td className="px-5 py-3 text-sm font-medium text-slate-900">{task.STAFF_NAME}</td>
                                                                    <td className="px-5 py-3 text-sm text-slate-500">{task.TASK_DATE ? format(new Date(String(task.TASK_DATE).slice(0, 10)), 'MMM d') : '—'}</td>
                                                                    <td className="px-5 py-3 text-sm text-slate-600">{task.TASK_DESCRIPTION}</td>
                                                                    {site.site_ot_type === 'target_based' && <td className="px-5 py-3 text-sm text-right font-mono font-medium text-slate-900">{task.COUNT}</td>}
                                                                    {site.site_ot_type === 'time_based' && <>
                                                                        <td className="px-5 py-3 text-sm font-mono text-emerald-700">{task.IN_TIME || '-'}</td>
                                                                        <td className="px-5 py-3 text-sm font-mono text-orange-700">{task.OUT_TIME || '-'}</td>
                                                                        <td className="px-5 py-3 text-sm text-right font-mono font-medium text-slate-900">{task.COUNT ?? 0}</td>
                                                                    </>}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>

                ) : selectedSite === 'ALL' ? (
                    /* All-sites download panel */
                    <div className="py-16 text-center space-y-4">
                        <Download className="w-12 h-12 text-slate-200 mx-auto" />
                        <div>
                            <p className="text-slate-700 font-semibold">All Sites selected</p>
                            <p className="text-slate-400 text-sm mt-1">Click Download to export all sites' tasks for {format(new Date(selectedDate), 'MMM dd, yyyy')}</p>
                        </div>
                        <button onClick={downloadDailyReport}
                            className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors text-sm">
                            <Download className="w-4 h-4" /> Download All Sites Report
                        </button>
                    </div>

                ) : (
                    /* ── Daily employee card list ── */
                    <>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <p className="text-sm font-bold text-slate-700">Employee Tasks</p>
                            {isPrivileged && users.length > 0 && (
                                <button onClick={() => openPanel({ mode: 'add', staffId: users[0].ID })}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors">
                                    <Plus className="w-3.5 h-3.5" /> Add Task
                                </button>
                            )}
                        </div>

                        {users.length === 0 ? (
                            <div className="py-16 text-center">
                                <UserIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-500 font-medium">No employees found for this site</p>
                            </div>
                        ) : (
                            <div>
                                {users.map((user) => {
                                    const site = getSite();
                                    const siteOtType = site?.OT_TYPE || 'time_based';
                                    const isTimeBased = siteOtType === 'time_based' || siteOtType === 'staff_outsource';
                                    const userTasks = tasks.filter(t => t.STAFF_ID === user.ID);
                                    const avatarColors = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-orange-100 text-orange-700', 'bg-blue-100 text-blue-700'];
                                    const avatarColor = avatarColors[user.ID % avatarColors.length];
                                    const canAdd = isPrivileged || (isStaff && user.ID === authUser?.ID);

                                    return (
                                        <div key={user.ID} className="flex items-center gap-3 px-5 py-4 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                                            {/* Avatar */}
                                            <div className={`w-11 h-11 rounded-full ${avatarColor} flex items-center justify-center font-black text-sm shrink-0`}>
                                                {user.NAME.charAt(0).toUpperCase()}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-bold text-slate-900 truncate">{user.NAME}</p>
                                                    {user.IS_TEMP === 1 && (
                                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Guest</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                    <p className="text-xs text-slate-400">ID: {user.EPF_NUMBER}</p>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isTimeBased ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                                                        {isTimeBased ? 'Time' : 'Target'}
                                                    </span>
                                                    {userTasks.length > 0 && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600">
                                                            {userTasks.length} task{userTasks.length !== 1 ? 's' : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Add Task button */}
                                            {canAdd && (
                                                <button onClick={() => openPanel({ mode: 'add', staffId: user.ID })}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-indigo-200 text-indigo-600 text-xs font-bold rounded-xl hover:bg-indigo-50 transition-colors shrink-0">
                                                    <Plus className="w-3.5 h-3.5" /> Add Task
                                                </button>
                                            )}

                                            {/* Three-dot menu */}
                                            <div className="relative shrink-0" data-menu>
                                                <button onClick={() => setOpenMenuId(openMenuId === user.ID ? null : user.ID)}
                                                    className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                                                    <MoreVertical className="w-4 h-4 text-slate-400" />
                                                </button>
                                                {openMenuId === user.ID && (
                                                    <div className="absolute right-0 top-9 w-64 bg-white rounded-2xl border border-slate-100 shadow-xl z-20 overflow-hidden">
                                                        {userTasks.length === 0 ? (
                                                            <p className="px-4 py-4 text-sm text-slate-400 text-center">No tasks recorded</p>
                                                        ) : (
                                                            <>
                                                                <p className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50">
                                                                    Tasks ({userTasks.length})
                                                                </p>
                                                                {userTasks.map(task => (
                                                                    <div key={task.ID} className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                                                                        <div className="flex-1 min-w-0"
                                                                            onClick={() => {
                                                                                if (isPrivileged) {
                                                                                    openPanel({ mode: 'edit', task });
                                                                                    setOpenMenuId(null);
                                                                                }
                                                                            }}>
                                                                            <p className={`text-sm font-semibold text-slate-800 truncate ${isPrivileged ? 'cursor-pointer hover:text-indigo-600' : ''}`}>
                                                                                {task.TASK_DESCRIPTION}
                                                                            </p>
                                                                            <p className="text-xs text-slate-400">
                                                                                Count: {task.COUNT}{task.IN_TIME ? ` · ${task.IN_TIME}–${task.OUT_TIME}` : ''}
                                                                            </p>
                                                                        </div>
                                                                        {isPrivileged && (
                                                                            <button
                                                                                onClick={() => { handleDeleteTask(task.ID); setOpenMenuId(null); }}
                                                                                disabled={deletingIds.has(task.ID)}
                                                                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0 disabled:opacity-40">
                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>

        </div> {/* end main content wrapper with mr-[45%] */}
```

- [ ] **Step 2: TypeScript check**

```bash
cd d:\Project\DOK-HR\client && npx tsc --noEmit 2>&1 | head -40
```

---

### Task 6: Add the slide panel and close the return

**Files:**
- Modify: `client/src/pages/Tasks.tsx`

This task adds the backdrop + slide panel JSX after the main content wrapper, then closes the outer `<div className="relative">` and the return statement.

- [ ] **Step 1: Append the backdrop, panel, and closing divs**

Directly after the `</div> {/* end main content wrapper */}` from Task 5, add:

```tsx
        {/* Mobile backdrop */}
        {panelState && (
            <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={closePanel} />
        )}

        {/* Slide panel */}
        <div className={`fixed inset-y-0 right-0 z-40 w-full md:w-[45%] bg-white flex flex-col shadow-2xl border-l border-slate-100 transform transition-transform duration-300 ease-in-out ${panelState ? 'translate-x-0' : 'translate-x-full'}`}>
            {panelState && (() => {
                const staffId = panelState.mode === 'add' ? panelState.staffId : panelState.task.STAFF_ID;
                const staff = users.find(u => u.ID === staffId);
                const site = getSite();
                const siteOtType = site?.OT_TYPE || 'time_based';
                const showTimeCols = siteOtType === 'time_based' || siteOtType === 'staff_outsource';
                const isEdit = panelState.mode === 'edit';

                return (
                    <>
                        {/* Panel header */}
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                            <button onClick={closePanel}
                                className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                                <ArrowLeft className="w-5 h-5 text-slate-600" />
                            </button>
                            <div>
                                <h2 className="text-base font-black text-slate-900">{isEdit ? 'Edit Task' : 'Add Task'}</h2>
                                {staff && <p className="text-xs text-slate-400">{staff.NAME} (ID: {staff.EPF_NUMBER})</p>}
                            </div>
                        </div>

                        {/* Scrollable body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {/* Employee context card */}
                            {staff && (
                                <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                                        {staff.NAME.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">{staff.NAME}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <p className="text-xs text-slate-400">ID: {staff.EPF_NUMBER}</p>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${showTimeCols ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                                                {siteOtType === 'time_based' ? 'Time' : siteOtType === 'target_based' ? 'Target' : 'Outsource'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Header accent card */}
                            <div className="flex items-center gap-3 bg-indigo-50 rounded-2xl px-4 py-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                                    <BarChart3 className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-indigo-900">{isEdit ? 'Edit Task' : 'Add Task'}</p>
                                    <p className="text-xs text-indigo-500">{isEdit ? 'Update task details below' : 'Add a new task for this employee'}</p>
                                </div>
                            </div>

                            {/* Form */}
                            <div className="space-y-4">
                                {/* Task Type */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                                        Task Type <span className="text-red-500">*</span>
                                    </label>
                                    <select value={panelTaskType} onChange={e => setPanelTaskType(e.target.value)}
                                        className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-700 bg-white focus:outline-none focus:border-indigo-500 transition-colors">
                                        <option value="">Select Task</option>
                                        {site?.TASK_TYPES?.map(tt => (
                                            <option key={tt.TASK_NAME} value={tt.TASK_NAME}>{tt.TASK_NAME}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Count */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                                        Count <span className="text-red-500">*</span>
                                    </label>
                                    <input type="number" min="0" value={panelCount}
                                        onChange={e => setPanelCount(Number(e.target.value))}
                                        onKeyDown={e => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                                        className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors" />
                                </div>

                                {/* Task Date */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                                        Task Date <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                        <input type="date" value={panelDate}
                                            readOnly={isStaff || role === 'supervisor'}
                                            onChange={isStaff || role === 'supervisor' ? undefined : e => setPanelDate(e.target.value)}
                                            className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors" />
                                    </div>
                                </div>

                                {/* In / Out Time */}
                                {showTimeCols && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">In Time</label>
                                            <div className="relative">
                                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                                <input type="time" value={panelInTime} onChange={e => setPanelInTime(e.target.value)}
                                                    className="w-full pl-10 pr-3 py-3 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Out Time</label>
                                            <div className="relative">
                                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                                <input type="time" value={panelOutTime} onChange={e => setPanelOutTime(e.target.value)}
                                                    className="w-full pl-10 pr-3 py-3 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Error */}
                            {panelError && (
                                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                                    <p className="text-sm text-red-600">{panelError}</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-5 space-y-3 border-t border-slate-100 shrink-0">
                            <button onClick={handlePanelSave} disabled={panelSaving}
                                className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold rounded-2xl transition-colors text-sm">
                                {panelSaving ? (
                                    <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving...</>
                                ) : (
                                    <><Save className="w-4 h-4" /> {isEdit ? 'Update Task' : 'Save Task'}</>
                                )}
                            </button>
                            <button onClick={closePanel}
                                className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-colors text-sm">
                                <X className="w-4 h-4" /> Cancel
                            </button>
                        </div>
                    </>
                );
            })()}
        </div>

    </div> {/* end relative outer wrapper */}
);
```

- [ ] **Step 2: Final TypeScript check — expect zero errors**

```bash
cd d:\Project\DOK-HR\client && npx tsc --noEmit
```

Expected output: no errors. If there are errors, read the message, find the line, and fix the issue (usually a missing variable reference or wrong property name).

- [ ] **Step 3: Start the dev server and do visual verification**

```bash
cd d:\Project\DOK-HR && npm run dev
```

Open the app in a browser and check all of the following:

1. **Stats bar:** Three vertical rows (Total Staff, Recorded, OT Type) with icon, large number, subtitle, chevron
2. **Employee list:** Card rows — avatar initial circle, name, ID, OT badge, task count badge if tasks exist
3. **Add Task button per row:** Clicking opens the panel from the right with a slide animation
4. **Panel content:** Employee context card at top, form fields (Task Type dropdown, Count, Date, In/Out time if time_based), Save + Cancel buttons
5. **Panel save (add):** Fills in the form, clicks Save Task, panel closes, task count badge updates
6. **Three-dot menu:** Clicking `⋯` shows a dropdown with the employee's tasks; each task is clickable (admin/supervisor) to open edit panel
7. **Edit panel:** Opens pre-filled with existing task data; clicking Update Task saves via PATCH
8. **Delete from menu:** Trash icon in dropdown calls confirm + DELETE
9. **Desktop layout:** At ≥768px width, the panel occupies the right 45% of the screen; the list shrinks to the left
10. **Mobile layout:** At <768px, the panel covers the full screen with a dark backdrop; tapping the backdrop closes the panel
11. **Summary view:** Toggle to Summary — accordion list of sites with expand/collapse works correctly

- [ ] **Step 4: Commit**

```bash
cd d:\Project\DOK-HR && git add client/src/pages/Tasks.tsx && git commit -m "feat: redesign Tasks page with card list and slide panel"
```

---

## Self-Review

**Spec coverage:**
- ✅ Stats bar — vertical card rows (Task 4)
- ✅ Employee list — card rows with avatar, badges (Task 5)
- ✅ Three-dot menu with task list + delete (Task 5)
- ✅ Add panel with slide animation (Task 6)
- ✅ Edit panel — same component, pre-filled (Tasks 2 + 6)
- ✅ Panel form: Task Type, Count, Date, In/Out Time, OT-type visibility (Task 6)
- ✅ Role rules — isPrivileged, canAdd, read-only for staff (Tasks 2, 5, 6)
- ✅ Desktop split layout md:mr-[45%] (Task 3)
- ✅ Mobile full-screen panel + backdrop (Task 6)
- ✅ Summary view preserved and restyled (Task 5)
- ✅ No routing changes — state-driven only
- ✅ Description field omitted — no backend column exists

**Type consistency:** `PanelState` defined in Task 1; `openPanel(NonNullable<PanelState>)` in Task 2; `panelState.task.STAFF_ID`, `panelState.task.ID`, `panelState.task.TASK_DESCRIPTION`, `panelState.task.COUNT`, `panelState.task.IN_TIME`, `panelState.task.OUT_TIME` — all fields exist on the `Task` type. `authUser?.ID` matches `user: authUser` from `useAuth()`.
