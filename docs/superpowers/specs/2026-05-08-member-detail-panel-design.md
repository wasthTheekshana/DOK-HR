# Member Detail Slide-Over Panel — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a read-only slide-over panel to the Team (Users) page that shows a member's full profile and all their assigned sites when the "View" button is clicked.

**Architecture:** A `viewingUser` state variable holds the selected `User | null`. When set, a fixed right-side panel renders over the table with a backdrop. Site data is derived from the already-loaded `sites` state (no extra API call for permanent/supervisor sites); temporary assignments are fetched from `/api/assignments?staff_id=X&active=1` when the panel opens.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, existing `api` service, existing `Site` / `User` types.

---

## Trigger

- A **View** button (eye icon, `Eye` from lucide-react) is added to each row's Actions column, before the existing Edit button.
- Clicking View sets `viewingUser` to that user and opens the panel.
- Clicking a View button while the panel is already open replaces the current member without closing.
- An × button in the panel header closes it (`setViewingUser(null)`).
- Clicking the dark backdrop also closes it.

---

## Panel Layout

- Fixed right-side slide-over, width `w-[420px]`, full viewport height, `z-50`.
- Semi-transparent dark backdrop (`bg-black/40`) covers the rest of the page.
- Panel slides in from the right (CSS `translate-x` transition).
- Internal layout: scrollable content area with three sections separated by dividers.

---

## Panel Sections

### 1. Header
- Large role-coloured avatar circle with role icon (reuses `getRoleConfig` already in Users.tsx).
- Member name (`text-xl font-bold`).
- Role badge (reuses existing badge style).
- × close button top-right.

### 2. Profile
- EPF Number (monospace, copyable label).
- Status badge (Active / Inactive / Flagged — reuses existing badge logic).
- **Salary fields** (visible only when `currentUserRole` is `admin` or `system_admin`):
  - Basic Salary
  - OT Percentage
  - Fix Salary
- If all three salary fields are 0 / null, show a neutral "—" rather than "0".

### 3. Assigned Sites
- Section heading "Assigned Sites".
- **Loading state**: small spinner while temp assignments are being fetched.
- **Empty state**: neutral message "No site assigned" if no sites found.
- Each site renders as a compact card showing:
  - Site name (`font-semibold`)
  - Site number (monospace, smaller)
  - Tag pill: one of **Home** (slate), **Manages** (indigo), or **Temp** (amber)

#### Site data logic (client-side, no extra API calls for permanent/supervisor):

| Member role | Source | Tag |
|---|---|---|
| `staff` | `sites.find(s => s.ID === user.SITE_ID)` | Home |
| `supervisor` | `sites.filter(s => s.SUPERVISOR_ID === user.ID)` | Manages |
| `admin` / `system_admin` | `sites.find(s => s.ID === user.SITE_ID)` if set | Home |

#### Temporary assignments (all roles):
- Fetched via `GET /api/assignments?staff_id={user.ID}&active=1` when panel opens.
- Each returned assignment: look up site name from `sites` state by `ta.SITE_ID`.
- Rendered as additional site cards tagged **Temp**.
- Fetch errors are silently swallowed (no crash, just no temp cards shown).

---

## State & Data Flow

```
Users.tsx
  ├── existing: users[], sites[], loading
  ├── new: viewingUser: User | null          → controls panel visibility
  ├── new: panelTempSites: TempSite[]        → temp assignments for viewed user
  ├── new: panelTempLoading: boolean         → spinner inside panel sites section
  └── new: fetchPanelTempSites(userId)       → called when viewingUser changes
```

`fetchPanelTempSites` is called inside a `useEffect` that watches `viewingUser`. It clears `panelTempSites`, sets `panelTempLoading = true`, fetches, then sets results and clears loading.

---

## Roles & Visibility

| Viewer role | Sees salary section | Sees View button |
|---|---|---|
| `admin` / `system_admin` | Yes | Yes |
| `supervisor` | No | Yes |
| `staff` | No | No (staff cannot view the Users page at all — route-guarded) |

---

## Error Handling

- Temp assignments fetch failure: silently ignored — panel shows permanent sites only.
- If `sites` state is empty (unlikely, loaded on mount): site cards show site ID as fallback.

---

## Files Changed

- **Modify:** `client/src/pages/Users.tsx`
  - Add `viewingUser`, `panelTempSites`, `panelTempLoading` state
  - Add `fetchPanelTempSites` function + `useEffect` watcher
  - Add View button to each row's Actions column
  - Add slide-over panel JSX at bottom of return (before closing `</div>`)
  - Add backdrop `<div>` that closes panel on click
