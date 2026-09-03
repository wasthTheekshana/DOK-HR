# HR Role — Design Spec

**Goal:** Add a new `hr` role that can view Sites, Team, and Attendance — company-wide, read-only — and nothing else. No changes to existing tables' data or columns; the only schema change is widening the `users.role` check constraint.

**Architecture:** Follows the same pattern used for `project_manager` ([2026-07-24-project-manager-role-design.md](2026-07-24-project-manager-role-design.md)): add the role string to the DB constraint, the Zod schema, and the relevant `requireRole` arrays / frontend route guards. No new tables, no new backend logic — `Sites` and `Attendance` `GET` routes already have no role restriction (any authenticated role can read them), and existing role-based query filtering in `siteController`/`attendanceController`/`userController` only special-cases `supervisor` and `staff` — every other role (including the new `hr`) already falls through to the unfiltered, company-wide branch. Read-only is achieved simply by never adding `'hr'` to any mutation route's `requireRole` list or any frontend "show edit/delete button" role check.

**Tech Stack:** PostgreSQL, Express + TypeScript, React 18 + TypeScript + Tailwind CSS, Lucide React icons.

---

## Roles & Permissions

| Area | staff | supervisor | admin | system_admin | project_manager | **hr** |
|---|---|---|---|---|---|---|
| Sites: view (all sites) | — | own site | ✅ | ✅ | ✅ | ✅ |
| Sites: create/edit/delete | — | — | ✅ | ✅ | ✅ | ❌ |
| Team: view | — | own site | ✅ | ✅ | ✅ | ✅ (no salary/OT/fix-salary columns — same restriction non-admin viewers already have) |
| Team: create/edit/delete | — | own site (limited) | ✅ | ✅ | edit only | ❌ |
| Attendance: view | ✅ own | ✅ own site | ✅ | ✅ | ✅ | ✅ |
| Attendance: mark/edit | ✅ own | ✅ own site | ✅ | — | — | ❌ |
| Dashboard | ✅ (staff view) | ✅ | ✅ | ✅ (financial view) | ✅ (project view) | redirected to `/sites`, no dashboard view |
| Everything else (Tasks, Payroll, Invoices, Analytics, Reports, Extra Units, Project Planning, KPI, Service Analysis) | — | — | mostly ✅ | mostly ✅ | some | ❌ |

Key decisions:
- HR is scoped to exactly three read-only areas: Sites, Team, Attendance. No write access anywhere.
- Data scope is company-wide (all sites), not per-site — matching how admin/system_admin/project_manager already see everything (only `supervisor` and `staff` are scoped to their own site in the existing controllers).
- HR does not see payroll figures (Basic Salary / OT% / Fix Salary) on the Team page — those columns are already gated to `admin`/`system_admin` only, and HR is not added to that gate.
- HR has no Dashboard view. Since Dashboard is an unguarded route today (any authenticated role lands there), HR is redirected to `/sites` instead of building a new dashboard branch for a role that isn't shown dashboard-style data anyway.
- HR accounts are created through the existing Team page "Add Member" flow (like Staff/Supervisor/Admin), not DB-only like System Admin/Project Manager — HR is expected to be a regularly-used role.

---

## Database Schema

Single additive change — no existing rows or columns modified.

```sql
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin','supervisor','staff','system_admin','project_manager','hr'));
```
(In `server/src/db/config.ts`, alongside the existing migration block pattern used for `project_manager`.)

---

## Backend

### Modified Files

- **`server/src/db/config.ts`** — widen the `users_role_check` constraint (above).
- **`server/src/schemas/validationSchemas.ts`** — add `'hr'` to the role `z.enum` in both `createUserSchema` and `updateUserSchema`.
- **`server/src/routes/userRoutes.ts`** — add `'hr'` to the `requireRole([...])` array on `GET /users` (currently `['admin', 'supervisor', 'staff', 'system_admin', 'project_manager']`). No other route in this file gets `'hr'` added — `POST`/`PATCH`/`DELETE` stay as-is, so HR cannot create, edit, or delete users.
- **`server/src/routes/siteRoutes.ts`** — no change needed. `GET /` and `GET /:id` already have no `requireRole` guard (any authenticated role can read). Mutation routes (`POST`/`PUT`/`PATCH`/`DELETE`) are not touched, so HR stays blocked from them by the existing allow-list.
- **`server/src/routes/attendanceRoutes.ts`** — no change needed. `GET /` and `GET /report` already have no `requireRole` guard. `POST /` (mark attendance) is not touched, so HR stays blocked.

### Verified: no controller-level filtering breaks

`siteController.getSites`, `attendanceController.getAttendance`/`getAttendanceReport`, and `userController.getUsers` each only special-case `if (userRole === 'supervisor')` and `else if (userRole === 'staff')` for scoping results to "own site" — every other role (admin, system_admin, project_manager, and now hr) already falls through to the unfiltered, company-wide query branch. No controller changes required for the "all sites" data-scope requirement.

---

## Frontend

### `client/src/types.ts`
Add `'hr'` to the `ROLE` union type:
```typescript
ROLE: 'admin' | 'supervisor' | 'staff' | 'system_admin' | 'project_manager' | 'hr';
```

### `client/src/App.tsx`
- Add a new constant, kept separate from `PM_MANAGER_ROLES` so HR's access can't silently leak into other routes that currently share that array:
  ```typescript
  const SITE_TEAM_VIEW_ROLES = [...PM_MANAGER_ROLES, 'hr'];
  ```
- Use it on the `sites` and `users` routes only:
  ```typescript
  <Route path="sites" element={<RoleProtectedRoute allowedRoles={SITE_TEAM_VIEW_ROLES}><Sites /></RoleProtectedRoute>} />
  <Route path="users" element={<RoleProtectedRoute allowedRoles={SITE_TEAM_VIEW_ROLES}><Users /></RoleProtectedRoute>} />
  ```
- `attendance` route is already unguarded — no change needed, HR reaches it automatically.
- Add a redirect for HR's Dashboard landing: the index route wraps `<Dashboard />` in a small role check — if `role === 'hr'`, render `<Navigate to="/sites" replace />` instead of `<Dashboard />`.

### `client/src/components/Layout.tsx`
- Add `'hr'` to the `roles` array for the `Sites`, `Team` (`/users`), and `Attendance` nav items only. Do **not** add to Dashboard, Daily Tasks, Task Summary, Payroll, Extra Units, Invoices, Invoice Analysis, Reports, Analytics, Target Performance, Time Site Analysis, Service Analysis, Project Planning, or Staff KPI.
- Add an `hr` entry to the `roleBadge` map: `{ label: 'HR', cls: 'bg-pink-500/10 text-pink-400' }`.
- Add an `hr` branch to the topbar role-pill `className`/label switch (matching the existing `admin`/`system_admin`/`supervisor`/`project_manager` pattern) using pink styling (`bg-pink-50 text-pink-600 border border-pink-100`).

### `client/src/pages/Users.tsx`
- Role picker in the Add/Edit Member modal: change `['staff', 'supervisor', 'admin']` to `['staff', 'supervisor', 'admin', 'hr']`, and widen the grid from `grid-cols-3` to `grid-cols-2 sm:grid-cols-4` to fit the fourth button.
- `getRoleConfig`: add a case for `'hr'` (e.g. `{ bg: 'bg-pink-100', text: 'text-pink-700', icon: Contact }`, importing `Contact` from `lucide-react`).
- `filterButtons`: add `{ key: 'hr', label: 'HR' }` so admin can filter the Team list by HR role, matching the existing Admins/Supervisors/Staff filters.
- No change to the salary-column gates (`['admin', 'system_admin'].includes(currentUserRole ?? '')`) — HR stays excluded from seeing Basic Salary / OT% / Fix Salary, matching the permission table above.

---

## File Map

| Action | Path |
|---|---|
| Modify | `server/src/db/config.ts` — role check constraint |
| Modify | `server/src/schemas/validationSchemas.ts` — add `hr` to role enum (create + update) |
| Modify | `server/src/routes/userRoutes.ts` — add `hr` to `GET /users` role list |
| Modify | `client/src/types.ts` — add `hr` to `ROLE` union |
| Modify | `client/src/App.tsx` — `SITE_TEAM_VIEW_ROLES` constant, sites/users routes, Dashboard→Sites redirect for hr |
| Modify | `client/src/components/Layout.tsx` — nav roles, role badge, topbar pill |
| Modify | `client/src/pages/Users.tsx` — role picker, `getRoleConfig`, `filterButtons` |

---

## What This Does NOT Do

- Does not give HR write access to Sites, Team, or Attendance — every mutation route/UI control stays gated to its existing role list, with `'hr'` never added.
- Does not give HR access to Payroll, Invoices, Invoice Analysis, Analytics, Target/Time Site Performance, Service Analysis, Reports, Tasks, Task Summary, Project Planning, or Staff KPI.
- Does not show HR the Basic Salary / OT% / Fix Salary columns on the Team page.
- Does not build a new Dashboard view for HR — HR is redirected to `/sites` instead.
- Does not scope HR to specific sites — access is company-wide, matching admin/system_admin/project_manager's existing (unfiltered) data scope.
- Does not change any existing role's permissions or any existing table's data.
