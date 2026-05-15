# Mobile Supervisor App — Design Spec

## Goal

Build a mobile-first shell at `/mobile/*` inside the existing React app so supervisors can mark attendance, submit daily task counts, and view their site summary from a phone — without changing the existing desktop UI.

## Architecture

The mobile app is a new route group inside the existing Vite/React project. It shares `AuthContext`, the `api` service layer, and all existing backend endpoints. No new server code is required.

On login, if `role === 'supervisor'` and `window.innerWidth < 768`, the app auto-redirects to `/mobile`. Desktop supervisors keep the existing UI unchanged. A "Switch to full site" link in the mobile header lets supervisors opt out on any device.

The app is installable as a PWA via `public/manifest.json` and a minimal service worker (install-only, no offline data sync).

## Tech Stack

- React + TypeScript + Tailwind CSS (existing)
- React Router v6 (existing) — new `/mobile/*` routes
- Existing `AuthContext` and `api` (`axios` instance)
- `date-fns` (existing) — date formatting
- `lucide-react` (existing) — icons
- PWA: `public/manifest.json` + `src/mobile/sw.ts` service worker

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `client/src/mobile/MobileLayout.tsx` | Bottom tab bar (Home / Attendance / Tasks / Summary), top header with site name + date, outlet for child pages |
| `client/src/mobile/pages/Home.tsx` | Today's site dashboard — staff present, units vs target, achievement ring, attendance alert |
| `client/src/mobile/pages/Attendance.tsx` | Mark present/absent per staff + optional in/out times, Save All |
| `client/src/mobile/pages/Tasks.tsx` | Staff card list with −/count/+ counters + task type selector, Save All |
| `client/src/mobile/pages/Summary.tsx` | Read-only weekly/monthly performance — achievement %, daily bar chart, staff table |
| `client/public/manifest.json` | PWA manifest — name, icons, theme colour, display: standalone |
| `client/src/mobile/sw.ts` | Minimal service worker — cache shell for installability |

### Modified files
| File | Change |
|------|--------|
| `client/src/App.tsx` | Add `/mobile/*` routes under `MobileLayout`; add redirect logic on login |
| `client/src/context/AuthContext.tsx` | Trigger redirect to `/mobile` on login when role is `supervisor` + mobile screen |

## Screens

### Home
- Loads automatically when the supervisor opens the app
- Fetches site info from `GET /sites` (supervisor's assigned site)
- Fetches today's tasks summary: total units submitted, staff count with entries
- Shows: site name, today's date, staff-present count (from attendance), units done vs daily target, achievement % as a circular ring
- Alert banner if today's attendance has not been saved yet → tapping it navigates to Attendance tab

### Attendance
- Fetches staff roster: `GET /users?site_id=X` filtered to `role=staff, status=active`
- Fetches existing records: `GET /attendance?site_id=X&date=TODAY`
- Pre-fills toggles and times if records exist (edit mode)
- Each row: staff name, EPF number, present/absent toggle
- When toggled present: in_time and out_time inputs slide in (optional, `HH:MM` format)
- Save All: loops through changed rows — `POST /attendance` for new, `PUT /attendance/:id` for existing
- Warns with a toast if navigating away with unsaved changes

### Tasks
- Date picker defaults to today; supervisor can select yesterday for backfill (backdate guard on server already enforced)
- Fetches staff roster and existing task records for selected date
- Each staff card: name, EPF, task type dropdown (if site has multiple task types), −/count/+ counter
- Counter minimum: 0; tapping − below 0 does nothing
- Save All: `POST /tasks` for new entries, `PUT /tasks/:id` for existing
- Shows a saved/unsaved indicator per card

### Summary
- Date mode selector: This Week / This Month / Last Month
- Calls `GET /analytics/service-site-detail/:site_id?date_from=&date_to=`
- Shows: achievement %, days with tasks, unique staff, total units, total hours
- Bar chart: daily units vs target (target-based sites) or daily hours (time-based)
- Staff breakdown table: name, active days, units, hours
- Read-only, no data entry

## Navigation

Fixed bottom tab bar with 4 tabs:
- **Home** — house icon
- **Attendance** — check-circle icon
- **Tasks** — clipboard icon
- **Summary** — bar-chart icon

Top header: site name (truncated) + today's date + logout icon.

Active tab highlighted in indigo. Large tap targets (min 48px height).

## PWA

`public/manifest.json`:
```json
{
  "name": "DOK Supervisor",
  "short_name": "DOK",
  "start_url": "/mobile",
  "display": "standalone",
  "theme_color": "#6366f1",
  "background_color": "#ffffff",
  "icons": [{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" }]
}
```

Service worker: caches the app shell (HTML, JS, CSS) on install. Network-first for all API calls — no offline data.

## Data Flow

All reads and writes use existing endpoints — no new backend routes.

| Screen | Read | Write |
|--------|------|-------|
| Home | `GET /sites`, `GET /tasks?site_id&date`, `GET /attendance?site_id&date` | — |
| Attendance | `GET /users?site_id`, `GET /attendance?site_id&date` | `POST /attendance`, `PUT /attendance/:id` |
| Tasks | `GET /users?site_id`, `GET /tasks?site_id&date` | `POST /tasks`, `PUT /tasks/:id` |
| Summary | `GET /analytics/service-site-detail/:id` | — |

## Redirect Logic

In `AuthContext.login()`:
```
if (role === 'supervisor' && window.innerWidth < 768) {
  navigate('/mobile');
} else {
  navigate('/');
}
```

Supervisors already logged in on desktop are not affected. The mobile header includes a "Full site →" link that navigates to `/` for supervisors who want the desktop view on a tablet.

## Scope — Explicitly Excluded

- Offline data entry (no service worker data sync)
- Push notifications
- Staff-facing mobile view (staff continue using existing pages)
- Admin / system_admin mobile view
