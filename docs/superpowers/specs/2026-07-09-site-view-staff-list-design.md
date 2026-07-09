# Site View Staff List — Design

**Date:** 2026-07-09
**Status:** Approved by user

## Purpose

The site View modal (Sites page) shows a staff *count* but not who those people are. Add a "Staff Members" section to the modal listing each person working on the site with their EPF number, including staff temporarily assigned to the site today.

## Decisions (confirmed with user)

- Scope: **active staff + temporarily assigned staff** (active on today's date), not inactive members.
- Frontend-only change — no backend work.

## Data source (existing, unchanged)

`GET /users?site=<siteId>&status=active&date=<today yyyy-MM-dd>` (`server/src/controllers/userController.ts`) already returns:
- users with `site_id = siteId` and status active (plus the site's supervisor), each with `IS_TEMP: 0`;
- users temp-assigned to the site on that date via `temporary_assignments`, merged without duplicates, each with `IS_TEMP: 1`.

Row fields used: `ID`, `EPF_NUMBER`, `NAME`, `ROLE`, `IS_TEMP`. The endpoint already enforces per-role visibility (admins see all; supervisors see their own site), so both roles get correct results with no extra gating.

## Frontend

All changes in `client/src/pages/Sites.tsx` (View Detail modal, below the Supervisor / Responsible Person rows):

- **State:** `viewStaff: any[]`, `viewStaffLoading: boolean`.
- **Fetch:** a `useEffect` keyed on `viewingSite?.ID` — when a site is opened, call the endpoint with `date = format(new Date(), 'yyyy-MM-dd')`; clear the list when the modal closes. Failures log to console and show the empty state (consistent with the page's existing error handling).
- **Render:** a "Staff Members (N)" section header, then one row per member:
  - avatar circle with name initial (same style as the Supervisor row),
  - name (bold),
  - EPF number in monospace muted text (same styling as `#SITE_NO`),
  - role label (`supervisor` / `staff` / `admin`),
  - amber **Temp** badge when `IS_TEMP === 1`.
- **States:** skeleton rows while loading; "No staff assigned" empty state; the list scrolls with the modal (no fixed height).
- Sort: supervisor first, then permanent staff A→Z, then temp staff A→Z.

## Edge cases

- Site with no staff → empty state.
- Supervisor also assigned as a temp elsewhere is unaffected — the merge in the endpoint already dedupes by user id.
- Modal reopened for a different site → refetch (effect keyed on site id).

## Testing

Manual: open a site with staff, a site with none, and a site with an active temporary assignment (verify the Temp badge); verify as both admin and supervisor logins.
