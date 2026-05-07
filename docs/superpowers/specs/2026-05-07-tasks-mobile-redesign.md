# Tasks Page Mobile Redesign

**Date:** 2026-05-07  
**Scope:** Replace the entire Tasks.tsx UI with a mobile-native card + slide panel design across all screen sizes.  
**Branch:** Feature branch (do not merge to main until approved)

---

## Goal

Replace the current table-based inline-edit layout with a card list + right-slide panel design that works well on both mobile and desktop. The new design matches the provided mockup: vertical stat rows, employee card list, and a dedicated form panel for adding/editing tasks.

---

## Architecture

No routing changes. No new files. All logic stays in `Tasks.tsx`.

State additions:
```typescript
type PanelState =
  | null
  | { mode: 'add'; staffId: number }
  | { mode: 'edit'; task: Task }

const [panelState, setPanelState] = useState<PanelState>(null);
const [panelError, setPanelError] = useState<string | null>(null);
const [panelSaving, setPanelSaving] = useState(false);

// Panel form fields
const [panelTaskType, setPanelTaskType] = useState('');
const [panelCount, setPanelCount] = useState<number>(0);
const [panelDate, setPanelDate] = useState(today);
const [panelInTime, setPanelInTime] = useState('');
const [panelOutTime, setPanelOutTime] = useState('');
const [panelDescription, setPanelDescription] = useState('');
```

Removed state (no longer needed):
- `newDrafts` — replaced by panel
- `editDrafts` — replaced by panel
- `savingIds` — replaced by `panelSaving`

---

## Layout

### Mobile (< 768px)
- Full-screen single column
- Panel slides in from right, covers entire screen
- Backdrop dimming behind panel when open

### Desktop (≥ 768px)
- Main list area shrinks to ~55% width when panel is open
- Panel occupies remaining ~45% on the right, fixed height, scrollable inside
- No backdrop — list stays fully interactive

---

## Components (all inside Tasks.tsx)

### 1. Stats Bar
Replaces the 3-column grid. Three full-width card rows stacked vertically, each with:
- Left: colored icon in rounded square
- Center: label (small, uppercase) + large value text + subtitle text
- Right: chevron icon

Stats: Total Staff / Recorded / OT Type (same data as before, just new layout).

### 2. Filter Row
- Site selector (full width, admin/supervisor only)
- Date picker (full width, read-only for staff/supervisor)
- Download button (full width, green, admin only)
- All stacked vertically — no side-by-side on any screen size

### 3. Employee List
Replaces the grouped table. One card row per employee:

```
┌─────────────────────────────────────────┐
│  [A]  STAFF NAME           [+Add]  [⋯] │
│       ID: EPF_NUMBER  [OT Badge]        │
└─────────────────────────────────────────┘
```

- Avatar: colored circle with first letter initial
- Name: bold, truncated
- ID + EPF number: small gray text
- OT type badge: "Time" (blue) or "Target" (violet) or "Outsource" (orange)
- Guest badge (amber) if IS_TEMP === 1
- Task count badge if employee has tasks recorded
- `[+Add Task]` button: outlined indigo, opens panel in add mode
- `[⋯]` three-dot button: opens a dropdown showing:
  - List of existing tasks (each tappable → opens edit panel)
  - Delete option per task (admin/supervisor only)
  - Staff role sees own tasks read-only, no delete

### 4. Right Slide Panel
Triggered by `panelState !== null`. CSS transition: `translateX(100%)` → `translateX(0)`.

**Panel Header:**
- Back arrow (`←`) button — closes panel
- Title: "Add Task" or "Edit Task"
- Subtitle: `STAFF_NAME (ID: EPF_NUMBER)`

**Employee Context Card:**
- Avatar, name, ID, OT type badge (read-only, visual context only)

**Form Fields:**
- **Task Type** `*` — `<select>` populated from `currentSite.TASK_TYPES`
- **Count** `*` — `<input type="number" min="0">`
- **Task Date** `*` — `<input type="date">` (locked to today for staff/supervisor)
- **In Time** + **Out Time** — side-by-side `<input type="time">`, shown only for `time_based` and `staff_outsource`
- **Description** — `<textarea maxLength={200}>` with live `{n}/200` counter below right

**Panel Footer:**
- `Save Task` — full-width indigo button; disabled + spinner while `panelSaving`
- `Cancel` — full-width white outlined button; closes panel

**Error display:** Red banner above Save button, shown when `panelError` is set.

### 5. Summary View
Kept functionally identical to current code. Restyled to match the new card aesthetic (rounded cards, consistent spacing) but no logic changes.

---

## Data Flow

### Opening panel (add mode)
```
click [+Add Task] on employee card
  → openPanel({ mode: 'add', staffId })
  → reset all panel form fields to defaults
  → panelDate = selectedDate
  → setPanelState({ mode: 'add', staffId })
```

### Opening panel (edit mode)
```
click task in [⋯] dropdown
  → openPanel({ mode: 'edit', task })
  → pre-fill form: taskType=task.TASK_DESCRIPTION, count=task.COUNT,
    date=task.TASK_DATE, inTime=task.IN_TIME, outTime=task.OUT_TIME,
    description=task.DESCRIPTION
  → setPanelState({ mode: 'edit', task })
```

### Saving (add)
```
POST /tasks { staff_id, site_id, task_description, count, task_date, in_time, out_time }
  → on success: close panel, reload tasks
  → on error: set panelError message
```

### Saving (edit)
```
PATCH /tasks/{task.ID} { task_description, count, task_date, in_time, out_time }
  → on success: close panel, reload tasks
  → on error: set panelError message
```

### Closing panel
```
back arrow | Cancel button | backdrop click (mobile)
  → setPanelState(null)
  → setPanelError(null)
```

### Delete task (from three-dot menu)
```
confirm dialog → DELETE /tasks/{taskId} → reload tasks
```

---

## Role-Based Rules (unchanged from current)

| Action | Admin | Supervisor | Staff |
|---|---|---|---|
| See all staff | ✅ | ✅ (own sites) | ❌ (own only) |
| Add task | ✅ | ✅ | ✅ (own only) |
| Edit task | ✅ | ✅ | ❌ |
| Delete task | ✅ | ✅ | ❌ |
| Change date | ✅ | ❌ (today only) | ❌ (today only) |
| Summary view | ✅ | ❌ | ❌ |

Staff sees only their own row. The `[⋯]` menu for staff shows their tasks as read-only (no edit/delete options).

---

## OT Type Visibility Rules (unchanged)

| Field | time_based | target_based | staff_outsource |
|---|---|---|---|
| Count | ✅ | ✅ | ✅ |
| In Time | ✅ | ❌ | ✅ |
| Out Time | ✅ | ❌ | ✅ |

---

## Design Tokens (Tailwind)

- Panel background: `bg-white`
- Panel shadow (desktop): `shadow-2xl border-l border-slate-100`
- Backdrop: `bg-black/40` (mobile only)
- Stat card border: `border border-slate-100 rounded-2xl`
- Employee card border: `border-b border-slate-100`
- Avatar colors: deterministic from name initial (indigo/emerald/violet/orange cycle)
- Save button: `bg-indigo-600 hover:bg-indigo-700`
- Cancel button: `border-2 border-slate-200 text-slate-600`

---

## Out of Scope

- Summary view logic changes (styling only)
- Backend API changes
- Routing/URL changes
- Other pages
