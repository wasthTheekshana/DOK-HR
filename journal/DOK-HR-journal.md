# DOK-HR — My Learning Journal

> A personal record of what I built, why I made each decision, and where I want to take this next.
> Re-read this whenever you want to remember the journey or plan the next step.

---

## 1. What Is This System?

DOK-HR is a full-stack Human Resources and Payroll Management System I built for managing multi-site labor operations. The core problem it solves is simple but painful in practice: when you have staff working across many different sites — each with different task types, pay structures, and supervisors — tracking daily work, calculating overtime accurately, and generating invoices becomes a nightmare in spreadsheets.

DOK-HR replaces that spreadsheet mess with a web application where:
- Staff can log their daily tasks (time in/out, units completed)
- Supervisors can oversee their site's workforce
- Admins can run payroll, generate invoices, and analyze performance
- System admins get a full view across all sites

There are four user roles: **system_admin**, **admin**, **supervisor**, and **staff**. Each sees a different version of the same system — tailored to what they actually need to do.

---

## 2. Why I Built This

> *Fill this in yourself — this is your story.*

- What problem were you trying to solve when you started this?
- Had you used another tool before that wasn't good enough?
- What did you most want to learn from building this?
- How long did it take you from idea to working system?

---

## 3. Tech Stack — My Choices

Every tech choice is a trade-off. Here's what I picked and why.

### Backend: Node.js + Express
I chose Node.js because it's JavaScript/TypeScript on the server, which means I only needed to learn one language for the whole stack. Express is minimal — it doesn't force any structure on you, so I could design the architecture myself. That was important for learning.

### Language: TypeScript
I used TypeScript on both the frontend and backend. At first it feels like extra work — you have to define types for everything. But once the project grew to 10+ files, TypeScript started catching bugs *before* I ran the code. A wrong property name, a missing field in a response body — TypeScript flags these instantly. I'll never go back to plain JavaScript for a project this size.

### Frontend: React 19 + Vite
React because it's the industry standard and I wanted to get fluent in it. Vite instead of Create React App because Vite is dramatically faster — the dev server starts in under a second and hot reload is instant. React 19 came with improvements to how state and effects work under the hood.

### Styling: TailwindCSS v4
Tailwind lets me write styles directly in the HTML/JSX without switching between files. It felt weird at first (`className="flex items-center gap-4 text-sm font-medium"`), but once I got used to the utility classes I could build UIs much faster than writing separate CSS files. v4 made configuration simpler.

### Database: Oracle Database
Oracle is an enterprise-grade relational database — it's what many large organizations run. I chose it because the real-world environment this system would run in already had Oracle infrastructure. Working with Oracle taught me things about SQL that MySQL/PostgreSQL hide from you — things like `MERGE` statements, sequence-based auto-increment, and connection pooling with `oracledb`.

### Authentication: JWT + bcrypt
JWT (JSON Web Tokens) for stateless authentication — the server doesn't need to remember who is logged in. The token lives in the browser and is sent with every request. `bcrypt` hashes passwords before storing them so even if the database is compromised, raw passwords are not exposed. I also built a session timeout (10-minute inactivity + 1-minute warning) on the frontend to match security requirements.

### Charts: Recharts
Recharts is a React charting library built on top of D3. I used it for the analytics dashboard — line charts, bar charts, and pie charts. It has a clean React API where you compose chart components the same way you compose UI components. That made it easy to learn.

### Export: jsPDF + SheetJS
For PDF export of invoices and payroll reports I used `jsPDF` with `jspdf-autotable` (adds table support). For Excel export I used SheetJS (`xlsx`). These run entirely in the browser — no server needed for generating files.

### Production: PM2 + Nginx
`PM2` is a process manager for Node.js — it keeps the server running, restarts it if it crashes, and manages logs. `Nginx` sits in front as a reverse proxy: it serves the React static files and forwards `/api` requests to the Node.js server on port 5001. This is a very standard production setup for full-stack JS apps.

### Testing: Jest + Supertest
`Jest` for the test runner, `Supertest` for making HTTP requests to the Express app in tests. I wrote integration tests that hit the actual API endpoints and checked the responses.

---

## 4. Architecture

### The Big Picture

DOK-HR is a **monolithic full-stack application** — one codebase, two folders:

```
/server   →  Node.js + Express API (port 5001)
/client   →  React SPA (served by Nginx on port 8082)
```

In production, Nginx receives all traffic on port 8082. Requests to `/api/*` are forwarded to the Node.js server. Everything else serves the React `index.html`.

### Why a Monolith?

I could have split this into microservices (separate services for payroll, attendance, invoices...) but I didn't. The reason: **a monolith is simpler to build, deploy, and debug when you're one developer**. Microservices add distributed systems problems — network latency between services, distributed tracing, separate deployments. None of that overhead was worth it for this project.

### Backend: MVC Pattern

I organized the server into the classic MVC layers:

```
routes/        →  URL mapping (which function handles which endpoint)
controllers/   →  Business logic (the actual work)
middleware/    →  Cross-cutting concerns (auth checks, error handling)
db/            →  Database connection and query helper
utils/         →  Pure functions (payroll calculations, JWT helpers)
```

The key insight I learned: **keep controllers thin and utils pure**. My `payrollUtils.ts` has functions like `getDayType()` and `calculateTimeBasedExtra()` that are pure functions — they take inputs and return outputs with no side effects. This makes them trivially easy to test.

### Frontend: Component Architecture

The React app uses:
- **Pages** — one file per screen (Dashboard, Tasks, Payroll, etc.)
- **Components** — reusable UI pieces (Layout, Modal, SessionTimeoutModal)
- **Context** — `AuthContext` holds the logged-in user and token globally
- **Hooks** — custom hooks for data fetching
- **Services** — `api.ts` is a single Axios instance that adds the JWT token to every request automatically

### API Design

REST API with JWT authentication. Every request (except login) must include `Authorization: Bearer <token>` in the header. The `authMiddleware` validates the token and attaches the user to the request. Role guards then check if that user is allowed to access that specific endpoint.

---

## 5. Database Design

### The 11 Tables

| Table | What it stores |
|---|---|
| `users` | Every person in the system — their name, EPF number, role, salary, site |
| `sites` | Work locations — name, supervisor, OT type, service type, daily target |
| `site_task_types` | The types of work done at each site (Scanning, Archiving, etc.) with invoice prices |
| `tasks` | Daily work entries — who worked where, when, how many units |
| `attendance` | Presence records, auto-synced from task entries |
| `poya_days` | Holiday dates managed by admin (treated as Sundays for OT) |
| `custom_ot_records` | History of saved custom OT% payroll calculations |
| `payroll_saved_records` | History of saved target-based payroll calculations |
| `cost_varient` | Key-value cost factors per site (transport, meals, etc.) |
| `profit_amount` | Monthly site-wise invoice and cost records |
| `site_assignments` | Which staff are assigned to which sites |

### Key Design Decisions

**Attendance auto-sync from tasks.** When a task entry is saved, a SQL `MERGE` statement automatically creates or updates the attendance record for that day. Staff don't enter attendance separately — it comes from their work. This eliminated an entire category of data entry errors.

**Separate history tables for payroll.** `custom_ot_records` and `payroll_saved_records` store snapshots of payroll calculations when an admin saves them. This is an audit trail — even if task data changes later, the saved payroll record reflects what was calculated at that point in time.

**ON DELETE SET NULL for site references.** If a site is deleted, the `site_id` on user records becomes NULL rather than deleting the users. Users outlive sites — this prevents accidental data loss.

**Oracle MERGE for upserts.** Standard SQL doesn't have a clean upsert. Oracle's `MERGE` statement handles "insert if not exists, update if exists" in a single atomic operation. I used this for attendance sync.

---

## 6. Key Features I Built

### Payroll OT Calculation (the hardest part)

There are three overtime calculation modes:

**Time-based OT** — For staff paid by the hour. Extra time is calculated from in/out times:
- Weekday: OT before 08:30 or after 17:00
- Saturday: OT before 08:30 or after 12:00
- Sunday / Poya day: The entire shift is OT

**Target-based OT** — For staff paid per unit. OT kicks in when total monthly units exceed `daily_target × 22`. Units above that threshold earn at the OT rate.

**Custom OT%** — An admin override. Either 90% fixed or a custom percentage. Used for special cases.

The day-type logic (is today a poya? a Sunday? a Saturday?) lives in `payrollUtils.ts` as pure functions, which made it very testable.

### Role-Based Access

Four roles with completely different views:
- **Staff** — can only see and enter their own tasks for today
- **Supervisor** — sees their site's staff, can enter tasks for anyone at their site
- **Admin** — manages users, sites, runs payroll, generates invoices
- **System Admin** — everything an admin can do, plus cross-site analytics

Role enforcement happens at two levels: the API (middleware rejects unauthorized requests) and the UI (pages show/hide features based on role).

### Attendance Auto-Sync

Every time a task is saved, the `syncAttendance()` helper runs a MERGE into the attendance table. Staff never manually enter attendance. This was a deliberate design choice — in an environment where people forget to clock in, tying attendance to task completion removes the problem entirely.

### Invoice & Profitability

For each site and month:
- **Revenue** = sum of (task count × invoice price per task type)
- **Cost** = staff wages + OT + cost variants (transport, meals, etc.)
- **Profit** = Revenue − Cost

Results export to PDF (formatted invoice) or Excel (raw data for accounting).

### Session Timeout

A 10-minute inactivity timer runs in the browser. At 9 minutes, a warning modal appears: "Your session will expire in 1 minute." If the user doesn't interact, they're logged out. This was built using `useEffect` with event listeners for mouse movement and keyboard input resetting the timer.

---

## 7. Challenges & What I Learned

> *Fill these in as you reflect on the build. The goal is to remember the hard lessons.*

**The hardest part was...**

**A bug that took the longest to fix was...**

**Something I built in a way I'm proud of...**

**Something I would architect differently next time...**

**The thing that surprised me most about building a full-stack system was...**

**What I learned about TypeScript that I didn't know before...**

**What I learned about SQL/Oracle that surprised me...**

**What I now understand about authentication that I didn't before...**

---

## 8. What I Want to Add Next

These are features that would genuinely improve the system — not just nice-to-haves. For each one I've written why it matters.

| Feature | Why it matters |
|---|---|
| **Mobile app (React Native)** | Staff currently need a browser to log tasks. A mobile app means they can log work from a phone on-site, which is more realistic for physical labor environments. |
| **Leave management module** | There's currently no way to track leave, sick days, or half-days. Payroll calculations don't account for absences properly. This is a significant gap. |
| **Email/SMS notifications** | Admins have no automated way to notify staff that payroll has been processed or a task was flagged. Push notifications would make the system proactive. |
| **Real-time dashboard (WebSockets)** | The current dashboard is a snapshot — you have to refresh. With WebSockets, attendance and task counts could update live, which is useful for supervisors monitoring a site. |
| **Audit log** | If a payroll record changes, who changed it? Right now there's no way to know. An audit log (who did what, when) is essential for any financial system. |
| **Advanced report filters** | The reports page currently has limited filtering. Cross-filtering by site + staff + date range with exportable results would make it much more useful for management. |
| **Multi-tenancy** | Right now the system supports one company. Adding company isolation would let this system serve multiple clients from one deployment — a significant architectural challenge but the path to a real product. |

---

## 9. Resources

> *Add links, books, articles, and tools that helped you build this.*

- **Node.js / Express docs:**
- **TypeScript handbook:**
- **React docs:**
- **Oracle oracledb npm package:**
- **JWT explained:**
- **Tailwind CSS docs:**
- **Recharts docs:**
- **PM2 docs:**
- **Books I read:**
- **Courses I took:**
- **Stack Overflow answers that saved me:**

---

*Last updated: 2026-04-17*
