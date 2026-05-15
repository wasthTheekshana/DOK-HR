# Mobile Supervisor App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first shell at `/mobile/*` so supervisors can mark attendance, submit daily task counts, and view their site summary from a phone browser.

**Architecture:** New route group inside the existing Vite/React project — shares `AuthContext`, `api` service, and all existing backend endpoints. On login a supervisor on a phone (<768 px) is redirected to `/mobile` automatically; the desktop UI is unchanged.

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + React Router v6 + date-fns + lucide-react + Recharts (all already installed).

---

## File Map

| Action | Path |
|--------|------|
| Create | `client/src/mobile/MobileLayout.tsx` |
| Create | `client/src/mobile/pages/Home.tsx` |
| Create | `client/src/mobile/pages/Attendance.tsx` |
| Create | `client/src/mobile/pages/Tasks.tsx` |
| Create | `client/src/mobile/pages/Summary.tsx` |
| Create | `client/public/manifest.json` |
| Modify | `client/index.html` |
| Modify | `client/src/App.tsx` |
| Modify | `client/src/pages/Login.tsx` |

**API facts (no new backend routes needed):**
- `GET /sites/:id` — site detail by id
- `GET /users?site=SITE_ID&role=staff&status=active` — staff roster
- `GET /attendance?site_no=X&date_from=Y&date_to=Y` — attendance records
- `POST /attendance` body: `{ site_id, staff_id, attendance_date, in_time?, out_time? }`
- `PUT /attendance/:id` body: `{ in_time?, out_time? }`
- `GET /tasks?site_no=X&date_from=Y&date_to=Y` — task records
- `POST /tasks` body: `{ site_id, site_no, staff_id, task_date, task_description, ot_type, count, target, invoice_price, pay_unit_price, in_time?, out_time? }`
- `PUT /tasks/:id` body: `{ count, in_time?, out_time? }`
- `GET /analytics/service-site-detail/:id?date_from=Y&date_to=Y` — summary data

**Type facts (from `client/src/types.ts`):**
- `User`: `{ ID, EPF_NUMBER, NAME, ROLE, STATUS, SITE_ID }`
- `Site`: `{ ID, SITE_NO, NAME, OT_TYPE, DAILY_TARGET, TASK_INVOICE_PRICE, TASK_TYPES }`
- `SiteTaskType`: `{ SITE_ID, TASK_NAME, INVOICE_PRICE }`
- `Task`: `{ ID, STAFF_ID, COUNT, TASK_DESCRIPTION, OT_TYPE, IN_TIME, OUT_TIME }`
- `Attendance`: `{ ID, STAFF_ID, IN_TIME, OUT_TIME }`
- Auth user (from `AuthContext`): `{ ID, NAME, ROLE, SITE_ID }`

---

## Task 1: MobileLayout + App.tsx routing

**Files:**
- Create: `client/src/mobile/MobileLayout.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create MobileLayout**

```tsx
// client/src/mobile/MobileLayout.tsx
import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, CheckCircle, ClipboardList, BarChart2, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

const TABS = [
    { to: '/mobile',            label: 'Home',       icon: Home,          end: true  },
    { to: '/mobile/attendance', label: 'Attendance',  icon: CheckCircle,   end: false },
    { to: '/mobile/tasks',      label: 'Tasks',       icon: ClipboardList, end: false },
    { to: '/mobile/summary',    label: 'Summary',     icon: BarChart2,     end: false },
];

const MobileLayout: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => { logout(); navigate('/login'); };

    return (
        <div className="flex flex-col h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
                <div className="min-w-0">
                    <p className="text-[11px] font-medium opacity-75 uppercase tracking-wider">DOK Supervisor</p>
                    <p className="text-[15px] font-bold truncate">{user?.NAME}</p>
                </div>
                <div className="flex items-center gap-3">
                    <p className="text-[12px] opacity-75">{format(new Date(), 'EEE, d MMM')}</p>
                    <button
                        onClick={handleLogout}
                        className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                        aria-label="Sign out"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* Full-site escape hatch */}
            <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-1.5 flex justify-end">
                <button
                    onClick={() => navigate('/')}
                    className="text-[11px] text-indigo-600 font-semibold hover:underline"
                >
                    Full site →
                </button>
            </div>

            {/* Page content */}
            <main className="flex-1 overflow-y-auto">
                <div className="pb-20">
                    <Outlet />
                </div>
            </main>

            {/* Bottom tab bar */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20">
                <div className="flex items-center">
                    {TABS.map(tab => (
                        <NavLink
                            key={tab.to}
                            to={tab.to}
                            end={tab.end}
                            className={({ isActive }) => cn(
                                'flex-1 flex flex-col items-center py-2 gap-0.5 min-h-[56px] justify-center transition-colors',
                                isActive ? 'text-indigo-600' : 'text-slate-400'
                            )}
                        >
                            {({ isActive }) => (
                                <>
                                    <div className={cn('p-1.5 rounded-xl', isActive && 'bg-indigo-50')}>
                                        <tab.icon className="w-5 h-5" />
                                    </div>
                                    <span className="text-[10px] font-semibold">{tab.label}</span>
                                </>
                            )}
                        </NavLink>
                    ))}
                </div>
            </nav>
        </div>
    );
};

export default MobileLayout;
```

- [ ] **Step 2: Wire `/mobile/*` routes in App.tsx**

Open `client/src/App.tsx`. Add these imports after the existing page imports:

```tsx
import MobileLayout from './mobile/MobileLayout';
import MobileHome from './mobile/pages/Home';
import MobileAttendance from './mobile/pages/Attendance';
import MobileTasks from './mobile/pages/Tasks';
import MobileSummary from './mobile/pages/Summary';
```

Inside the `<Routes>` block, add this route **before** the closing `</Routes>` tag:

```tsx
<Route
    path="/mobile"
    element={
        <ProtectedRoute>
            <RoleProtectedRoute allowedRoles={['supervisor']}>
                <MobileLayout />
            </RoleProtectedRoute>
        </ProtectedRoute>
    }
>
    <Route index element={<MobileHome />} />
    <Route path="attendance" element={<MobileAttendance />} />
    <Route path="tasks" element={<MobileTasks />} />
    <Route path="summary" element={<MobileSummary />} />
</Route>
```

- [ ] **Step 3: Verify TypeScript compiles**

```powershell
cd client
npx tsc --noEmit
```

Expected: no errors (the mobile page files don't exist yet — TypeScript will error on the imports; that is expected at this stage. If you want to verify only the layout, create empty stub files first).

Create empty stubs temporarily:

```powershell
New-Item -ItemType Directory -Force client\src\mobile\pages
"export default () => null;" | Out-File client\src\mobile\pages\Home.tsx -Encoding utf8
"export default () => null;" | Out-File client\src\mobile\pages\Attendance.tsx -Encoding utf8
"export default () => null;" | Out-File client\src\mobile\pages\Tasks.tsx -Encoding utf8
"export default () => null;" | Out-File client\src\mobile\pages\Summary.tsx -Encoding utf8
```

Then run: `npx tsc --noEmit` — expect 0 errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/mobile/MobileLayout.tsx client/src/App.tsx client/src/mobile/pages/
git commit -m "feat: add MobileLayout shell and /mobile/* routing"
```

---

## Task 2: Login redirect for mobile supervisors

**Files:**
- Modify: `client/src/pages/Login.tsx:31-34`

The current `handleSubmit` in Login.tsx does `navigate('/')` after `login(res.data)`. Change line 33 to redirect supervisors on phones to `/mobile`.

- [ ] **Step 1: Update the handleSubmit navigate call**

Replace this block in `client/src/pages/Login.tsx`:

```tsx
const res = await api.post('/auth/login', { epf_number: epfNumber.trim(), password });
login(res.data);
navigate('/');
```

With:

```tsx
const res = await api.post('/auth/login', { epf_number: epfNumber.trim(), password });
login(res.data);
if (res.data.user.ROLE === 'supervisor' && window.innerWidth < 768) {
    navigate('/mobile');
} else {
    navigate('/');
}
```

- [ ] **Step 2: Manual test**

Open the app in a browser, open DevTools → toggle device toolbar (Ctrl+Shift+M), pick a phone size (e.g. iPhone 12, 390px wide). Log in as a supervisor. Expected: redirects to `/mobile`. Log in as an admin. Expected: redirects to `/` (desktop dashboard).

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Login.tsx
git commit -m "feat: redirect supervisors on mobile to /mobile on login"
```

---

## Task 3: PWA Manifest

**Files:**
- Create: `client/public/manifest.json`
- Modify: `client/index.html`

- [ ] **Step 1: Create manifest.json**

```json
// client/public/manifest.json
{
  "name": "DOK Supervisor",
  "short_name": "DOK",
  "description": "DOK HR Supervisor mobile app",
  "start_url": "/mobile",
  "display": "standalone",
  "theme_color": "#6366f1",
  "background_color": "#ffffff",
  "icons": []
}
```

- [ ] **Step 2: Link manifest in index.html**

In `client/index.html`, add inside `<head>` after the existing `<link rel="icon">` line:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#6366f1" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="DOK Supervisor" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
```

- [ ] **Step 3: Verify in browser**

Open Chrome DevTools → Application tab → Manifest. Expected: manifest loads with name "DOK Supervisor", display "standalone".

- [ ] **Step 4: Commit**

```bash
git add client/public/manifest.json client/index.html
git commit -m "feat: add PWA manifest for mobile supervisor app"
```

---

## Task 4: Mobile Home page

**Files:**
- Create: `client/src/mobile/pages/Home.tsx` (replace the stub)

- [ ] **Step 1: Write the Home page**

```tsx
// client/src/mobile/pages/Home.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Site, Attendance, Task } from '../../types';
import { AlertTriangle, Users, Target, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

const MobileHome: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const today = format(new Date(), 'yyyy-MM-dd');

    const [site, setSite] = useState<Site | null>(null);
    const [presentCount, setPresentCount] = useState(0);
    const [totalStaff, setTotalStaff] = useState(0);
    const [unitsToday, setUnitsToday] = useState(0);
    const [attendanceExists, setAttendanceExists] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            if (!user?.SITE_ID) return;
            try {
                const siteRes = await api.get<Site>(`/sites/${user.SITE_ID}`);
                const siteData = siteRes.data;
                setSite(siteData);

                const [usersRes, attendRes, tasksRes] = await Promise.all([
                    api.get<any[]>(`/users`, { params: { site: user.SITE_ID, role: 'staff', status: 'active' } }),
                    api.get<Attendance[]>(`/attendance`, { params: { site_no: siteData.SITE_NO, date_from: today, date_to: today } }),
                    api.get<Task[]>(`/tasks`, { params: { site_no: siteData.SITE_NO, date_from: today, date_to: today } }),
                ]);

                setTotalStaff(usersRes.data.length);
                setPresentCount(attendRes.data.length);
                setAttendanceExists(attendRes.data.length > 0);
                setUnitsToday(tasksRes.data.reduce((s, t) => s + (Number(t.COUNT) || 0), 0));
            } catch (err) {
                console.error('MobileHome load error', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [user?.SITE_ID, today]);

    if (loading) return (
        <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    const target = site?.DAILY_TARGET ?? 0;
    const achievementPct = target > 0 ? Math.round((unitsToday / target) * 100) : null;
    const r = 36;
    const circ = 2 * Math.PI * r;
    const dash = achievementPct !== null ? Math.min(achievementPct, 150) / 150 * circ : 0;
    const ringColor = achievementPct === null ? '#94a3b8'
        : achievementPct >= 100 ? '#10b981'
        : achievementPct >= 70  ? '#6366f1'
        : '#f59e0b';

    return (
        <div className="p-4 space-y-4">
            {/* Site card */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">My Site</p>
                <p className="text-[18px] font-black text-slate-900 mt-0.5">{site?.NAME ?? '—'}</p>
                <p className="text-[12px] text-slate-400 mt-0.5">
                    {site?.SITE_NO} · {site?.OT_TYPE?.replace(/_/g, ' ')}
                </p>
            </div>

            {/* Attendance alert */}
            {!attendanceExists && (
                <button
                    onClick={() => navigate('/mobile/attendance')}
                    className="w-full flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left"
                >
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <div>
                        <p className="text-[13px] font-bold text-amber-700">Attendance not marked yet</p>
                        <p className="text-[11px] text-amber-500 mt-0.5">Tap to mark today's attendance →</p>
                    </div>
                </button>
            )}

            {/* KPI grid */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-indigo-500" />
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Present</p>
                    </div>
                    <p className="text-[28px] font-black text-slate-900">{presentCount}</p>
                    <p className="text-[11px] text-slate-400">of {totalStaff} staff</p>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-emerald-500" />
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Units</p>
                    </div>
                    <p className="text-[28px] font-black text-slate-900">{unitsToday}</p>
                    <p className="text-[11px] text-slate-400">target {target > 0 ? target : '—'}</p>
                </div>
            </div>

            {/* Achievement ring */}
            {achievementPct !== null && (
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center gap-5">
                    <svg width={90} height={90} className="-rotate-90 shrink-0">
                        <circle cx={45} cy={45} r={r} fill="none" stroke="#e2e8f0" strokeWidth={8} />
                        <circle cx={45} cy={45} r={r} fill="none" stroke={ringColor}
                            strokeWidth={8} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
                        <text x={45} y={45} textAnchor="middle" dominantBaseline="middle"
                            fontSize={16} fontWeight="900" fill={ringColor}
                            transform="rotate(90,45,45)">
                            {achievementPct}%
                        </text>
                    </svg>
                    <div>
                        <p className="text-[13px] font-bold text-slate-800">Today's Achievement</p>
                        <p className="text-[12px] text-slate-400 mt-1">{unitsToday} / {target} units</p>
                        {achievementPct >= 100 && (
                            <div className="flex items-center gap-1 mt-2">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-[11px] font-semibold text-emerald-600">Target reached!</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MobileHome;
```

- [ ] **Step 2: Manual test — open on simulated phone**

With the dev server running (`npm run dev` in `client/`), open DevTools, enable device toolbar at 390px. Navigate to `/mobile`. Log in as supervisor. Expected: site name, KPI cards, amber attendance alert if no attendance today, ring if target-based site.

- [ ] **Step 3: TypeScript check**

```powershell
cd client; npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/mobile/pages/Home.tsx
git commit -m "feat: add mobile Home dashboard page"
```

---

## Task 5: Mobile Attendance page

**Files:**
- Create: `client/src/mobile/pages/Attendance.tsx` (replace stub)

- [ ] **Step 1: Write the Attendance page**

```tsx
// client/src/mobile/pages/Attendance.tsx
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { User, Attendance, Site } from '../../types';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Save } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StaffRow {
    user: User;
    present: boolean;
    in_time: string;
    out_time: string;
    existingId: number | null;
    dirty: boolean;
}

const MobileAttendance: React.FC = () => {
    const { user: authUser } = useAuth();
    const today = format(new Date(), 'yyyy-MM-dd');

    const [rows, setRows] = useState<StaffRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [siteNo, setSiteNo] = useState('');

    useEffect(() => {
        const load = async () => {
            if (!authUser?.SITE_ID) return;
            try {
                const siteRes = await api.get<Site>(`/sites/${authUser.SITE_ID}`);
                const siteNo = siteRes.data.SITE_NO;
                setSiteNo(siteNo);

                const [usersRes, attendRes] = await Promise.all([
                    api.get<User[]>('/users', { params: { site: authUser.SITE_ID, role: 'staff', status: 'active' } }),
                    api.get<Attendance[]>('/attendance', { params: { site_no: siteNo, date_from: today, date_to: today } }),
                ]);

                const attendMap = new Map(attendRes.data.map(a => [a.STAFF_ID, a]));
                setRows(usersRes.data.map(u => {
                    const rec = attendMap.get(u.ID);
                    return {
                        user: u,
                        present: !!rec,
                        in_time: rec?.IN_TIME ?? '',
                        out_time: rec?.OUT_TIME ?? '',
                        existingId: rec?.ID ?? null,
                        dirty: false,
                    };
                }));
            } catch (err) {
                console.error('Attendance load error', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [authUser?.SITE_ID, today]);

    const update = (idx: number, patch: Partial<StaffRow>) =>
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch, dirty: true } : r));

    const handleSave = async () => {
        if (!authUser?.SITE_ID) return;
        setSaving(true);
        try {
            const dirty = rows.filter(r => r.dirty);
            await Promise.all(dirty.map(r => {
                if (r.present) {
                    const payload = {
                        site_id: authUser.SITE_ID,
                        staff_id: r.user.ID,
                        attendance_date: today,
                        in_time:  r.in_time  || undefined,
                        out_time: r.out_time || undefined,
                    };
                    return r.existingId
                        ? api.put(`/attendance/${r.existingId}`, { in_time: payload.in_time, out_time: payload.out_time })
                        : api.post('/attendance', payload);
                }
                return Promise.resolve();
            }));
            setRows(prev => prev.map(r => ({ ...r, dirty: false })));
            toast.success('Attendance saved');
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to save attendance');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    const presentCount = rows.filter(r => r.present).length;
    const isDirty = rows.some(r => r.dirty);

    return (
        <div className="p-4 space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-[15px] font-bold text-slate-900">Attendance</p>
                    <p className="text-[12px] text-slate-400">
                        {today} · {presentCount}/{rows.length} present
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all',
                        isDirty ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    )}
                >
                    {saving
                        ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        : <Save className="w-4 h-4" />
                    }
                    Save
                </button>
            </div>

            {/* Staff rows */}
            {rows.map((row, idx) => (
                <div
                    key={row.user.ID}
                    className={cn(
                        'bg-white rounded-2xl border shadow-sm transition-all',
                        row.present ? 'border-emerald-200' : 'border-slate-200'
                    )}
                >
                    {/* Name + toggle */}
                    <div className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-[14px] font-bold text-slate-900">{row.user.NAME}</p>
                            <p className="text-[11px] text-slate-400">EPF {row.user.EPF_NUMBER}</p>
                        </div>
                        <button
                            onClick={() => update(idx, { present: !row.present })}
                            className="p-1 transition-transform active:scale-90"
                        >
                            {row.present
                                ? <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                                : <XCircle className="w-8 h-8 text-slate-300" />
                            }
                        </button>
                    </div>

                    {/* Time fields — visible only when present */}
                    {row.present && (
                        <div className="flex gap-3 px-4 pb-4">
                            <div className="flex-1">
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                                    In Time <span className="normal-case font-normal">(optional)</span>
                                </label>
                                <input
                                    type="time"
                                    value={row.in_time}
                                    onChange={e => update(idx, { in_time: e.target.value })}
                                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-[14px] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                                    Out Time <span className="normal-case font-normal">(optional)</span>
                                </label>
                                <input
                                    type="time"
                                    value={row.out_time}
                                    onChange={e => update(idx, { out_time: e.target.value })}
                                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-[14px] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default MobileAttendance;
```

- [ ] **Step 2: Manual test**

Navigate to `/mobile/attendance` on simulated phone. Expected: list of staff for supervisor's site; tap a name's circle → turns green and time fields appear; tap Save → toast "Attendance saved". Reload page → toggles pre-filled with saved state.

- [ ] **Step 3: TypeScript check**

```powershell
cd client; npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/mobile/pages/Attendance.tsx
git commit -m "feat: add mobile Attendance page with present/absent toggle and time fields"
```

---

## Task 6: Mobile Tasks page

**Files:**
- Create: `client/src/mobile/pages/Tasks.tsx` (replace stub)

- [ ] **Step 1: Write the Tasks page**

```tsx
// client/src/mobile/pages/Tasks.tsx
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { User, Task, Site } from '../../types';
import { format, subDays } from 'date-fns';
import { Minus, Plus, Save, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TaskRow {
    user: User;
    count: number;
    taskName: string;
    inTime: string;
    outTime: string;
    existingId: number | null;
    dirty: boolean;
}

const MobileTasks: React.FC = () => {
    const { user: authUser } = useAuth();
    const today     = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    const [selectedDate, setSelectedDate] = useState(today);
    const [site, setSite]   = useState<Site | null>(null);
    const [rows, setRows]   = useState<TaskRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);

    useEffect(() => {
        const load = async () => {
            if (!authUser?.SITE_ID) return;
            setLoading(true);
            try {
                const siteRes = await api.get<Site>(`/sites/${authUser.SITE_ID}`);
                const siteData = siteRes.data;
                setSite(siteData);

                const [usersRes, tasksRes] = await Promise.all([
                    api.get<User[]>('/users', { params: { site: authUser.SITE_ID, role: 'staff', status: 'active' } }),
                    api.get<Task[]>('/tasks', { params: { site_no: siteData.SITE_NO, date_from: selectedDate, date_to: selectedDate } }),
                ]);

                const taskMap = new Map(tasksRes.data.map(t => [t.STAFF_ID, t]));
                const defaultTask = siteData.TASK_TYPES?.[0]?.TASK_NAME ?? '';

                setRows(usersRes.data.map(u => {
                    const t = taskMap.get(u.ID);
                    return {
                        user: u,
                        count:    t ? Number(t.COUNT) : 0,
                        taskName: t?.TASK_DESCRIPTION ?? defaultTask,
                        inTime:   t?.IN_TIME  ?? '',
                        outTime:  t?.OUT_TIME ?? '',
                        existingId: t?.ID ?? null,
                        dirty: false,
                    };
                }));
            } catch (err) {
                console.error('Tasks load error', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [authUser?.SITE_ID, selectedDate]);

    const update = (idx: number, patch: Partial<TaskRow>) =>
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch, dirty: true } : r));

    const handleSave = async () => {
        if (!authUser?.SITE_ID || !site) return;
        setSaving(true);
        try {
            const dirtyRows = rows.filter(r => r.dirty);
            await Promise.all(dirtyRows.map(r => {
                const payload = {
                    site_id:          authUser.SITE_ID!,
                    site_no:          site.SITE_NO,
                    staff_id:         r.user.ID,
                    task_date:        selectedDate,
                    task_description: r.taskName,
                    ot_type:          site.OT_TYPE ?? 'target_based',
                    count:            r.count,
                    target:           site.DAILY_TARGET ?? 0,
                    invoice_price:    site.TASK_INVOICE_PRICE ?? 0,
                    pay_unit_price:   0,
                    in_time:          r.inTime  || undefined,
                    out_time:         r.outTime || undefined,
                };
                return r.existingId
                    ? api.put(`/tasks/${r.existingId}`, { count: r.count, task_description: r.taskName, in_time: payload.in_time, out_time: payload.out_time })
                    : api.post('/tasks', payload);
            }));
            setRows(prev => prev.map(r => ({ ...r, dirty: false })));
            toast.success('Tasks saved');
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to save tasks');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    const isTimeBased = site?.OT_TYPE === 'time_based' || site?.OT_TYPE === 'staff_outsource';
    const taskTypes   = site?.TASK_TYPES ?? [];
    const isDirty     = rows.some(r => r.dirty);

    return (
        <div className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-[15px] font-bold text-slate-900">Daily Tasks</p>
                    <p className="text-[12px] text-slate-400">{site?.NAME}</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all',
                        isDirty ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    )}
                >
                    {saving
                        ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        : <Save className="w-4 h-4" />
                    }
                    Save
                </button>
            </div>

            {/* Date toggle */}
            <div className="flex gap-2">
                {([today, yesterday] as const).map(d => (
                    <button
                        key={d}
                        onClick={() => setSelectedDate(d)}
                        className={cn(
                            'flex-1 py-2 rounded-xl text-[12px] font-bold border transition-all',
                            selectedDate === d
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-500 border-slate-200'
                        )}
                    >
                        {d === today ? 'Today' : 'Yesterday'}
                    </button>
                ))}
            </div>

            {/* Staff cards */}
            {rows.map((row, idx) => (
                <div
                    key={row.user.ID}
                    className={cn(
                        'bg-white rounded-2xl border shadow-sm p-4 space-y-3',
                        row.dirty ? 'border-indigo-200' : 'border-slate-200'
                    )}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[14px] font-bold text-slate-900">{row.user.NAME}</p>
                            <p className="text-[11px] text-slate-400">EPF {row.user.EPF_NUMBER}</p>
                        </div>
                        {row.dirty && (
                            <span className="text-[10px] font-semibold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                                Unsaved
                            </span>
                        )}
                    </div>

                    {/* Task type selector — only if site has multiple types */}
                    {taskTypes.length > 1 && (
                        <div className="relative">
                            <select
                                value={row.taskName}
                                onChange={e => update(idx, { taskName: e.target.value })}
                                className="w-full appearance-none px-3 py-2.5 pr-8 border border-slate-200 rounded-xl text-[13px] font-medium bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                                {taskTypes.map(t => (
                                    <option key={t.TASK_NAME} value={t.TASK_NAME}>{t.TASK_NAME}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    )}

                    {/* Time inputs for time-based sites */}
                    {isTimeBased ? (
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">In Time</label>
                                <input
                                    type="time"
                                    value={row.inTime}
                                    onChange={e => update(idx, { inTime: e.target.value })}
                                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Out Time</label>
                                <input
                                    type="time"
                                    value={row.outTime}
                                    onChange={e => update(idx, { outTime: e.target.value })}
                                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                            </div>
                        </div>
                    ) : (
                        /* Count stepper for target-based sites */
                        <div className="flex items-center justify-between">
                            <span className="text-[12px] text-slate-500 font-medium">Units completed</span>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => update(idx, { count: Math.max(0, row.count - 1) })}
                                    className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 active:bg-slate-200 transition-colors"
                                >
                                    <Minus className="w-4 h-4" />
                                </button>
                                <input
                                    type="number"
                                    min={0}
                                    value={row.count}
                                    onChange={e => update(idx, { count: Math.max(0, Number(e.target.value)) })}
                                    className="w-14 text-center text-[18px] font-black text-indigo-600 border border-indigo-200 rounded-xl py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                                <button
                                    onClick={() => update(idx, { count: row.count + 1 })}
                                    className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white active:bg-indigo-700 transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default MobileTasks;
```

- [ ] **Step 2: Manual test**

Navigate to `/mobile/tasks`. Expected: staff cards with +/− steppers for target-based sites or time fields for time-based sites. Change a count → "Unsaved" badge appears. Tap Save → toast. Reload → count pre-filled. Switch to Yesterday → loads yesterday's data.

- [ ] **Step 3: TypeScript check**

```powershell
cd client; npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/mobile/pages/Tasks.tsx
git commit -m "feat: add mobile Tasks page with +/- counters and time-based support"
```

---

## Task 7: Mobile Summary page

**Files:**
- Create: `client/src/mobile/pages/Summary.tsx` (replace stub)

- [ ] **Step 1: Write the Summary page**

```tsx
// client/src/mobile/pages/Summary.tsx
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { format, startOfMonth, endOfMonth, startOfWeek, subMonths } from 'date-fns';
import { cn } from '../../lib/utils';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';

type DateMode = 'week' | 'month' | 'last_month';

interface SiteDetail {
    site: { ot_type: string; daily_target: number; name: string };
    summary: {
        total_units: number; days_with_tasks: number;
        unique_staff: number; total_hours: number; achievement_pct: number;
    };
    daily: { date: string; units: number; hours: number }[];
    staff: { name: string; epf_number: string; active_days: number; total_units: number; total_hours: number }[];
}

function getRange(mode: DateMode): { from: string; to: string } {
    const today = new Date();
    if (mode === 'week') return {
        from: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        to:   format(today, 'yyyy-MM-dd'),
    };
    if (mode === 'month') return {
        from: format(startOfMonth(today), 'yyyy-MM-dd'),
        to:   format(today, 'yyyy-MM-dd'),
    };
    const lm = subMonths(today, 1);
    return {
        from: format(startOfMonth(lm), 'yyyy-MM-dd'),
        to:   format(endOfMonth(lm), 'yyyy-MM-dd'),
    };
}

const MODES: { key: DateMode; label: string }[] = [
    { key: 'week',       label: 'This Week'  },
    { key: 'month',      label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
];

const MobileSummary: React.FC = () => {
    const { user: authUser } = useAuth();
    const [mode, setMode]       = useState<DateMode>('month');
    const [detail, setDetail]   = useState<SiteDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            if (!authUser?.SITE_ID) return;
            setLoading(true);
            try {
                const { from, to } = getRange(mode);
                const res = await api.get<SiteDetail>(
                    `/analytics/service-site-detail/${authUser.SITE_ID}`,
                    { params: { date_from: from, date_to: to } }
                );
                setDetail(res.data);
            } catch (err) {
                console.error('Summary load error', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [authUser?.SITE_ID, mode]);

    const isTargetBased = detail?.site.ot_type === 'target_based';

    return (
        <div className="p-4 space-y-4">
            {/* Mode selector */}
            <div className="flex gap-2">
                {MODES.map(m => (
                    <button
                        key={m.key}
                        onClick={() => setMode(m.key)}
                        className={cn(
                            'flex-1 py-2 rounded-xl text-[11px] font-bold border transition-all',
                            mode === m.key
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-500 border-slate-200'
                        )}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : detail ? (
                <>
                    {/* KPI grid */}
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { label: 'Achievement',   value: `${detail.summary.achievement_pct ?? 0}%` },
                            { label: 'Active Days',   value: detail.summary.days_with_tasks },
                            {
                                label: isTargetBased ? 'Total Units' : 'Total Hours',
                                value: isTargetBased
                                    ? detail.summary.total_units
                                    : Number(detail.summary.total_hours).toFixed(1),
                            },
                            { label: 'Unique Staff',  value: detail.summary.unique_staff },
                        ].map(k => (
                            <div key={k.label} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{k.label}</p>
                                <p className="text-[22px] font-black text-slate-900 mt-1">{k.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Daily chart */}
                    {detail.daily.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                            <p className="text-[13px] font-bold text-slate-800 mb-3">
                                {isTargetBased ? 'Daily Units vs Target' : 'Daily Hours'}
                            </p>
                            <div className="h-[160px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={detail.daily} barSize={12}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 9, fill: '#94a3b8' }}
                                            tickFormatter={d => d.slice(5)}
                                            axisLine={false} tickLine={false}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 9, fill: '#94a3b8' }}
                                            axisLine={false} tickLine={false}
                                            allowDecimals={false} width={28}
                                        />
                                        <Tooltip
                                            contentStyle={{ borderRadius: 10, fontSize: 11, border: '1px solid #e2e8f0' }}
                                            labelFormatter={d => `Date: ${d}`}
                                        />
                                        {isTargetBased && detail.site.daily_target > 0 && (
                                            <ReferenceLine y={detail.site.daily_target} stroke="#f59e0b" strokeDasharray="4 3" />
                                        )}
                                        <Bar
                                            dataKey={isTargetBased ? 'units' : 'hours'}
                                            name={isTargetBased ? 'Units' : 'Hours'}
                                            fill="#6366f1"
                                            radius={[4, 4, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Staff table */}
                    {detail.staff.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <p className="text-[13px] font-bold text-slate-800 px-4 py-3 border-b border-slate-100">
                                Staff Breakdown
                            </p>
                            <div className="divide-y divide-slate-50">
                                {detail.staff.map(s => (
                                    <div key={s.epf_number} className="flex items-center justify-between px-4 py-3">
                                        <div>
                                            <p className="text-[13px] font-semibold text-slate-800">{s.name}</p>
                                            <p className="text-[11px] text-slate-400">{s.active_days} days active</p>
                                        </div>
                                        <p className="text-[14px] font-black text-indigo-600">
                                            {isTargetBased ? s.total_units : Number(s.total_hours).toFixed(1)}
                                            <span className="text-[10px] font-semibold text-slate-400 ml-1">
                                                {isTargetBased ? 'units' : 'hrs'}
                                            </span>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center py-12 text-slate-400 text-[13px]">
                    No data available for this period
                </div>
            )}
        </div>
    );
};

export default MobileSummary;
```

- [ ] **Step 2: Manual test**

Navigate to `/mobile/summary`. Expected: 3 mode buttons, KPI grid, bar chart, staff table. Toggle between This Week / This Month / Last Month — data reloads each time.

- [ ] **Step 3: TypeScript check**

```powershell
cd client; npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Final build check**

```powershell
cd client; npm run build
```

Expected: builds successfully with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/mobile/pages/Summary.tsx
git commit -m "feat: add mobile Summary page with period selector and daily chart"
```

---

## Self-Review

**Spec coverage:**
- ✅ `/mobile/*` dedicated shell — Task 1
- ✅ Auto-redirect supervisors on mobile login — Task 2
- ✅ PWA manifest + meta tags — Task 3
- ✅ Home: site name, staff present, units, achievement ring, attendance alert — Task 4
- ✅ Attendance: toggle + optional in/out times, Save All — Task 5
- ✅ Tasks: +/- counters, task type selector, time fields for time-based, today/yesterday toggle — Task 6
- ✅ Summary: week/month/last-month, KPI cards, bar chart, staff table — Task 7
- ✅ "Full site →" link in MobileLayout header — Task 1
- ✅ Bottom tab bar with 4 tabs — Task 1
- ✅ No new backend routes — all use existing APIs

**Placeholder scan:** No TBDs. All code blocks complete.

**Type consistency:** `StaffRow`, `TaskRow` defined and used within their own files. API response types (`User`, `Site`, `Task`, `Attendance`) imported from `../../types` consistently across all mobile pages.
