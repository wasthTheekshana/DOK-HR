# DOK-HR System — Full Technical Documentation

**Version:** Current (dev branch)
**Stack:** Node.js + Express + TypeScript (backend) · React + TypeScript + TailwindCSS (frontend) · Oracle Database

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Database Schema](#4-database-schema)
5. [Authentication & Roles](#5-authentication--roles)
6. [Backend — API Endpoints](#6-backend--api-endpoints)
7. [Payroll Calculation Logic](#7-payroll-calculation-logic)
8. [Invoice Calculation Logic](#8-invoice-calculation-logic)
9. [Analytics Logic](#9-analytics-logic)
10. [Frontend Pages & Features](#10-frontend-pages--features)
11. [Business Rules & Conditions](#11-business-rules--conditions)
12. [Environment Variables](#12-environment-variables)

---

## 1. System Overview

DOK-HR is a Human Resources and Payroll Management System designed to manage:
- Employee records and assignments across multiple work sites
- Daily task tracking (time-based and target-based)
- Overtime (OT) calculation in three modes
- Invoice generation and profitability analysis
- Role-based access for admins, supervisors, and staff

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js + Express.js |
| Backend language | TypeScript |
| Database | Oracle Database (OracleDB npm driver) |
| Frontend framework | React 19 + TypeScript |
| Styling | TailwindCSS v4 |
| Charts | Recharts (LineChart, BarChart, PieChart) |
| Date handling | date-fns |
| Export | jsPDF + jspdf-autotable, SheetJS (xlsx) |
| HTTP client | Axios |
| Auth | JWT (jsonwebtoken) |

---

## 3. Project Structure

```
DOK-HR/
├── server/
│   └── src/
│       ├── app.ts                          # Express app, route registration
│       ├── middleware/
│       │   └── authMiddleware.ts           # JWT validation, role guard
│       ├── db/
│       │   ├── dbUtils.ts                  # Oracle connection + execute helper
│       │   └── schema.sql                  # Full DB schema (DDL)
│       ├── utils/
│       │   └── payrollUtils.ts             # OT calculation pure functions
│       ├── controllers/
│       │   ├── authController.ts
│       │   ├── userController.ts
│       │   ├── siteController.ts
│       │   ├── taskController.ts
│       │   ├── attendanceController.ts
│       │   ├── payrollController.ts
│       │   ├── analyticsController.ts
│       │   └── invoiceController.ts
│       └── routes/
│           ├── authRoutes.ts
│           ├── userRoutes.ts
│           ├── siteRoutes.ts
│           ├── taskRoutes.ts
│           ├── attendanceRoutes.ts
│           ├── payrollRoutes.ts
│           ├── analyticsRoutes.ts
│           └── invoiceRoutes.ts
└── client/
    └── src/
        ├── App.tsx                         # Router (React Router v6)
        ├── types.ts                        # Shared TypeScript interfaces
        ├── services/
        │   └── api.ts                      # Axios instance + interceptors
        ├── context/
        │   └── AuthContext.tsx             # Auth state, session timeout
        ├── components/
        │   └── Layout.tsx                  # Sidebar + header shell
        └── pages/
            ├── Login.tsx
            ├── Dashboard.tsx
            ├── Users.tsx
            ├── Sites.tsx
            ├── Tasks.tsx
            ├── Attendance.tsx
            ├── Payroll.tsx
            ├── Reports.tsx
            ├── Analytics.tsx
            ├── SitePerformance.tsx
            ├── Invoices.tsx
            └── (Dashboard embeds SiteSnapshot component)
```

---

## 4. Database Schema

### 4.1 `users`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | NUMBER | PK, AUTO INCREMENT | Internal user ID |
| `epf_number` | VARCHAR2(64) | UNIQUE NOT NULL | Employee Provident Fund number — login identifier |
| `name` | VARCHAR2(200) | NOT NULL | Full name |
| `password` | VARCHAR2(255) | NOT NULL | Bcrypt-hashed password |
| `role` | VARCHAR2(20) | CHECK IN ('admin','supervisor','staff','system_admin') | Role |
| `status` | VARCHAR2(20) | DEFAULT 'active', CHECK IN ('active','inactive') | Account status |
| `site_id` | NUMBER | FK → sites.id ON DELETE SET NULL | Assigned site |
| `inactivation_requested` | NUMBER(1) | DEFAULT 0 | 0 = no, 1 = supervisor has requested deactivation |
| `basic_salary` | NUMBER(12,2) | DEFAULT 0 | Monthly base salary (Rs.) |
| `ot_percentage` | NUMBER(6,2) | DEFAULT 0 | OT percentage: 0 = standard, 90 = fixed-rate, other = custom |
| `fix_salary` | NUMBER(12,2) | DEFAULT 0 | Additional fixed monthly salary component |
| `created_at` | TIMESTAMP | DEFAULT SYSTIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | DEFAULT SYSTIMESTAMP | Last update time |

**Indexes:** Primary key on `id`, unique on `epf_number`

---

### 4.2 `sites`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | NUMBER | PK, AUTO INCREMENT | Internal site ID |
| `site_no` | VARCHAR2(64) | UNIQUE NOT NULL | Human-readable site code (e.g. "S001") |
| `name` | VARCHAR2(200) | — | Site display name |
| `supervisor_id` | NUMBER | FK → users.id ON DELETE SET NULL | Assigned supervisor |
| `task_invoice_price` | NUMBER(12,2) | DEFAULT 0 | Legacy default invoice price per task |
| `daily_target` | NUMBER | DEFAULT 0 | Daily work unit target per staff. **0 = no target (time-based sites)** |
| `ot_type` | VARCHAR2(30) | DEFAULT 'time_based', CHECK IN ('time_based','target_based','staff_outsource') | OT calculation type |
| `service_type` | VARCHAR2(50) | — | Physical \| Scanning \| Data entry \| Insurance Policy \| Staff outsource \| DMS |
| `site_type` | VARCHAR2(50) | — | Insurance \| Bank \| Hospital \| Tele \| Finance |
| `created_at` | TIMESTAMP | DEFAULT SYSTIMESTAMP | — |
| `updated_at` | TIMESTAMP | DEFAULT SYSTIMESTAMP | — |

**OT Type meanings:**
- `time_based` — OT calculated from extra hours worked after 17:00
- `target_based` — OT calculated from units produced above `daily_target`
- `staff_outsource` — Staff are outsourced; treated as `time_based` for all calculations

---

### 4.3 `site_task_types`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | NUMBER | PK, AUTO INCREMENT | — |
| `site_id` | NUMBER | FK → sites.id ON DELETE CASCADE | Parent site |
| `task_name` | VARCHAR2(200) | NOT NULL | Task type name (e.g. "Scanning", "Archiving") |
| `invoice_price` | NUMBER(12,2) | DEFAULT 0 | Price charged to client per unit of this task type |
| `created_at` | TIMESTAMP | DEFAULT SYSTIMESTAMP | — |

**Index:** `idx_stt_site` on `site_id`

---

### 4.4 `tasks`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | NUMBER | PK, AUTO INCREMENT | — |
| `site_id` | NUMBER | FK → sites.id ON DELETE CASCADE | Work site |
| `staff_id` | NUMBER | FK → users.id ON DELETE CASCADE | Staff member |
| `task_description` | VARCHAR2(1000) | — | Task type name (matches site_task_types.task_name) |
| `invoice_price` | NUMBER(12,2) | — | Invoice price used for this task entry |
| `ot_type` | VARCHAR2(20) | CHECK IN ('time_based','target_based') | Task-level OT type |
| `target` | NUMBER | — | Per-task target (legacy; usually 0) |
| `pay_unit_price` | NUMBER(12,2) | — | Unit price for staff payment |
| `task_date` | DATE | NOT NULL | Work date |
| `count` | NUMBER | — | Units completed (target-based only; NULL for time-based) |
| `in_time` | VARCHAR2(8) | — | Start time in HH24:MI format |
| `out_time` | VARCHAR2(8) | — | End time in HH24:MI format |
| `created_at` | TIMESTAMP | DEFAULT SYSTIMESTAMP | — |
| `updated_at` | TIMESTAMP | DEFAULT SYSTIMESTAMP | — |

**Important rule:** For `time_based` sites the `count` column is never filled — only `in_time`/`out_time` are used. For `target_based` sites `count` is filled; `in_time`/`out_time` may be NULL.

---

### 4.5 `attendance`

| Column | Type | Description |
|---|---|---|
| `id` | NUMBER PK | — |
| `site_id` | NUMBER FK | Work site |
| `staff_id` | NUMBER FK | Staff member |
| `attendance_date` | DATE NOT NULL | Date of attendance |
| `in_time` | VARCHAR2(8) | HH24:MI |
| `out_time` | VARCHAR2(8) | HH24:MI |
| `created_at` | TIMESTAMP | — |
| `updated_at` | TIMESTAMP | — |

---

### 4.6 `custom_ot_records`

Saved history of Custom OT % calculations (time-based staff with special OT rates).

| Column | Type | Description |
|---|---|---|
| `id` | NUMBER PK | — |
| `batch_id` | VARCHAR2(100) | Groups all rows saved in one action. Format: `{date_from}_{date_to}_{site_no}_{timestamp}` |
| `site_no` | VARCHAR2(64) | Site code at time of save |
| `site_name` | VARCHAR2(200) | Site name at time of save |
| `staff_id` | NUMBER | Staff user ID |
| `epf_number` | VARCHAR2(64) | Staff EPF at time of save |
| `staff_name` | VARCHAR2(200) | Staff name at time of save |
| `date_from` | DATE | Period start |
| `date_to` | DATE | Period end |
| `calculation_type` | VARCHAR2(50) | `'90% Fixed'` or `'Custom %'` |
| `custom_percentage` | NUMBER(6,2) | NULL for 90% Fixed rows; entered % for Custom % rows |
| `total_extra_hours` | NUMBER(12,4) | Raw extra hours (out_time − 17:00) across period |
| `total_adjusted_hours` | NUMBER(12,4) | After applying custom_percentage |
| `ot_rate` | NUMBER(12,4) | Rate per hour used |
| `total_payment` | NUMBER(14,2) | Final OT payment |
| `saved_at` | TIMESTAMP | Save timestamp |
| `saved_by` | NUMBER | FK → users.id |

**Indexes:** batch_id, (date_from, date_to), staff_id, saved_at DESC

---

### 4.7 `payroll_saved_records`

Saved history of target-based payroll calculations.

| Column | Type | Description |
|---|---|---|
| `id` | NUMBER PK | — |
| `batch_id` | VARCHAR2(100) | Format: `{date_from}_{date_to}_{site_no}_{timestamp}` |
| `site_no` | VARCHAR2(64) | Site code |
| `site_name` | VARCHAR2(200) | Site name |
| `staff_id` | NUMBER | Staff user ID |
| `epf_number` | VARCHAR2(64) | — |
| `staff_name` | VARCHAR2(200) | — |
| `date_from` | DATE | Period start |
| `date_to` | DATE | Period end |
| `sum_count` | NUMBER(12,2) | Total task units completed in period |
| `target_count` | NUMBER(12,2) | `daily_target × DAYS_IN_PERIOD` |
| `extra_units` | NUMBER(12,4) | `MAX(0, sum_count − target_count)` |
| `extra_payment` | NUMBER(14,2) | `extra_units × extra_unit_rate` |
| `extra_unit_rate` | NUMBER(12,4) | Rate at time of save (default 0.5) |
| `saved_at` | TIMESTAMP | — |
| `saved_by` | NUMBER | FK → users.id |

**Indexes:** batch_id, (date_from, date_to), site_no, saved_at DESC

---

### 4.8 `cost_varient`

Key-value cost factors per site used in invoice calculations.

| Column | Type | Description |
|---|---|---|
| `id` | NUMBER PK | — |
| `site_id` | NUMBER FK | → sites.id ON DELETE CASCADE |
| `factor_key` | VARCHAR2(200) | Cost label (e.g. "Transport", "Supplies") |
| `factor_value` | VARCHAR2(500) | Value — can be numeric (e.g. "5000") or text |
| `created_at` | TIMESTAMP | — |

**Index:** `idx_cv_site` on `site_id`

---

### 4.9 `profit_amount` (Invoices)

Monthly site-wise cost and invoice records.

| Column | Type | Description |
|---|---|---|
| `id` | NUMBER PK | — |
| `site_id` | NUMBER FK | → sites.id ON DELETE CASCADE |
| `site_no` | VARCHAR2(64) | Denormalised site code |
| `site_name` | VARCHAR2(200) | Denormalised site name |
| `date_from` | DATE | Invoice period start |
| `date_to` | DATE | Invoice period end |
| `cost_variant_amount` | NUMBER(14,2) | Sum of all numeric `cost_varient` values for the site |
| `salary_ot_amount` | NUMBER(14,2) | Staff salaries + OT payments for the period |
| `expense_cost` | NUMBER(14,2) | Additional manual expense entry |
| `invoice_price` | NUMBER(14,2) | Revenue: task counts × task type invoice prices |
| `created_at` | TIMESTAMP | — |
| `created_by` | NUMBER | FK → users.id |

**Indexes:** site_id, (date_from, date_to), created_at DESC

---

### 4.10 Database Constraints Summary

```sql
users.site_id         → sites.id  ON DELETE SET NULL
sites.supervisor_id   → users.id  ON DELETE SET NULL
tasks.site_id         → sites.id  ON DELETE CASCADE
tasks.staff_id        → users.id  ON DELETE CASCADE
attendance.site_id    → sites.id  ON DELETE CASCADE
attendance.staff_id   → users.id  ON DELETE CASCADE
site_task_types.site_id → sites.id ON DELETE CASCADE
cost_varient.site_id  → sites.id  ON DELETE CASCADE
profit_amount.site_id → sites.id  ON DELETE CASCADE
```

---

## 5. Authentication & Roles

### 5.1 Authentication Flow

1. User submits `epf_number` + `password` to `POST /api/auth/login`
2. Server validates credentials; if valid issues a JWT token
3. Client stores token in `localStorage`
4. Every subsequent request attaches `Authorization: Bearer {token}` header
5. `authMiddleware.ts` extracts and verifies the token on every protected route
6. Decoded payload (`id`, `role`) attached to `req.user`
7. `requireRole([...])` middleware checks role before handlers execute
8. On 401 response, client clears token and redirects to `/login`

**Session timeout:** 10 minutes of inactivity with a 1-minute warning modal. Timer resets on any user interaction.

### 5.2 Roles & Permissions

| Capability | staff | supervisor | admin | system_admin |
|---|:---:|:---:|:---:|:---:|
| View own profile | ✓ | ✓ | ✓ | ✓ |
| View staff list | — | ✓ (own site only) | ✓ | ✓ |
| Create users | — | — | ✓ | ✓ |
| Edit user (all fields) | — | — | ✓ | ✓ |
| Request user inactivation | — | ✓ | — | — |
| Approve inactivation | — | — | ✓ | ✓ |
| Delete users | — | — | ✓ | ✓ |
| View sites | — | ✓ (own) | ✓ | ✓ |
| Create/edit/delete sites | — | — | ✓ | ✓ |
| Enter/edit tasks | ✓ (own) | ✓ | ✓ | ✓ |
| View payroll | — | ✓ | ✓ | ✓ |
| Save payroll records | — | — | ✓ | ✓ |
| View analytics | — | — | ✓ | ✓ |
| View invoices | — | — | ✓ | ✓ |
| Save/delete invoices | — | — | ✓ | ✓ |
| System admin dashboard | — | — | — | ✓ |

**Supervisor restriction detail:** Supervisors can only update `inactivation_requested = 1` on users in their site. They cannot change `status`, `role`, `salary`, or `site_id`.

---

## 6. Backend — API Endpoints

Base URL: `http://{host}:{port}/api`

All routes except `POST /api/auth/login` and `GET /health` require a valid JWT in the `Authorization: Bearer` header.

---

### 6.1 Auth Routes — `/api/auth`

#### `POST /api/auth/login`
**Auth:** None
**Body:** `{ epf_number: string, password: string }`
**Returns:** `{ token: string, user: { id, name, role, epf_number, site_id } }`
**Errors:** 401 if credentials invalid, 400 if fields missing

---

### 6.2 User Routes — `/api/users`

#### `GET /api/users`
**Roles:** admin, supervisor, staff, system_admin
**Query params:**
- `site` — filter by site_id (number)
- `role` — filter by role string (comma-separated allowed, e.g. `"staff,supervisor"`)
- `status` — `'active'` or `'inactive'`
- `search` — partial match on `name` or `epf_number`

**Supervisor behaviour:** Only returns users whose `site_id` matches the supervisor's assigned site.
**Returns:** Array of user objects (salary fields hidden from non-admin roles).

#### `GET /api/users/:id`
**Roles:** All authenticated
**Returns:** Single user object.

#### `POST /api/users`
**Roles:** admin
**Body:**
```json
{
  "epf_number": "string",
  "name": "string",
  "password": "string",
  "role": "staff|supervisor|admin|system_admin",
  "site_id": number | null,
  "basic_salary": number,
  "ot_percentage": number,
  "fix_salary": number
}
```
**Returns:** `{ message: "User created" }`
**Validation:** EPF must be unique.

#### `PATCH /api/users/:id`
**Roles:** admin, supervisor
**Admin can update:** name, password, role, status, site_id, basic_salary, ot_percentage, fix_salary, inactivation_requested
**Supervisor can update:** `inactivation_requested` only (returns 403 for any other field)
**Returns:** `{ message: "User updated" }`

#### `DELETE /api/users/:id`
**Roles:** admin
**Returns:** `{ message: "User deleted" }`

---

### 6.3 Site Routes — `/api/sites`

#### `GET /api/sites`
**Roles:** All authenticated
**Supervisor behaviour:** Only returns site(s) they supervise.
**Returns:** Array of site objects including:
- Basic site info (id, site_no, name, ot_type, daily_target, service_type, site_type)
- `SUPERVISOR_NAME` — joined from users table
- `STAFF_COUNT` — count of active users assigned to site
- `TASK_TYPES` — array of `{ ID, TASK_NAME, INVOICE_PRICE }` from site_task_types
- `COST_FACTORS` — array of `{ ID, FACTOR_KEY, FACTOR_VALUE }` from cost_varient

#### `GET /api/sites/:id`
**Returns:** Single site with full details (same shape as above).

#### `POST /api/sites`
**Roles:** admin
**Body:**
```json
{
  "site_no": "string",
  "name": "string",
  "supervisor_id": number | null,
  "daily_target": number,
  "ot_type": "time_based|target_based|staff_outsource",
  "service_type": "string",
  "site_type": "string",
  "task_types": [{ "task_name": "string", "invoice_price": number }],
  "cost_factors": [{ "factor_key": "string", "factor_value": "string" }]
}
```
**Side effect:** If `supervisor_id` provided, updates that user's `site_id` to the new site.
**Returns:** `{ message: "Site created", id: number }`

#### `PUT /api/sites/:id`
**Roles:** admin
**Body:** Same as POST. Task types and cost factors are **replaced** (delete all existing, insert new).
**Side effect:** Supervisor's `site_id` auto-synced if `supervisor_id` changed.
**Returns:** `{ message: "Site updated" }`

#### `DELETE /api/sites/:id`
**Roles:** admin
**Cascade:** Deletes task_types, cost_factors, tasks, attendance, and profit_amount rows for the site.
**Returns:** `{ message: "Site deleted" }`

---

### 6.4 Task Routes — `/api/tasks`

#### `GET /api/tasks`
**Roles:** All authenticated
**Query params:**
- `site_id` — required (filter by site)
- `date` — filter by specific date
- `date_from`, `date_to` — date range filter
- `staff_id` — filter by staff member

**Returns:** Array of task rows ordered by `task_date DESC, name ASC`.

#### `GET /api/tasks/summary`
**Query params:** `date`, `site_id` (optional)
**Returns:** Daily summary — task counts and staff counts per site.

#### `GET /api/tasks/target-base-report`
**Query params:** `date_from`, `date_to`, `site_id` (optional)
**Returns:** Per-staff task count aggregated over date range for target-based sites.

#### `GET /api/tasks/ot-analysis-report`
**Query params:** `date_from`, `date_to`, `site_id` (optional)
**Returns:** Per-staff OT hours analysis for time-based sites with `ot_percentage != 0`.

#### `POST /api/tasks`
**Body:** `{ site_id, staff_id, task_description, invoice_price, ot_type, target, pay_unit_price, task_date, count, in_time, out_time }`
**Returns:** `{ message: "Task created" }`

#### `PATCH /api/tasks/:id`
**Body:** `{ task_description, count, pay_unit_price, invoice_price, in_time, out_time, task_date, target }`
**Note:** Does NOT update `ot_type` on edit — only creation sets it.
**Returns:** `{ message: "Task updated" }`

#### `DELETE /api/tasks/:id`
**Returns:** `{ message: "Task deleted" }`

---

### 6.5 Attendance Routes — `/api/attendance`

#### `GET /api/attendance`
**Query params:** `site_id`, `date`, `date_from`, `date_to`, `staff_id`
**Returns:** Attendance records with staff name and site name joined.

#### `POST /api/attendance`
**Body:** `{ site_id, staff_id, attendance_date, in_time, out_time }`

#### `PATCH /api/attendance/:id`
**Body:** `{ in_time, out_time }`

#### `DELETE /api/attendance/:id`

---

### 6.6 Payroll Routes — `/api/payroll`

#### `GET /api/payroll`
**Roles:** admin, supervisor, system_admin
**Query params:**
- `date_from` (required), `date_to` (required)
- `ot_type` (required): `'time_based'` or `'target_based'`
- `site_no` (optional): filter by site
- `view_mode` (optional): `'summary'` or `'detailed'`

**Time-based behaviour:**
- Fetches per-day task rows with in/out times
- Calculates extra hours and payment per row
- If no `site_no` or `view_mode = 'summary'`: aggregates by staff into summary
- If `site_no` and `view_mode = 'detailed'`: returns per-day rows

**Target-based behaviour:**
- Aggregates `SUM(count)` and `MAX(daily_target)` per staff
- If `daily_target = 0` → `extra_units = 0`, `extra_payment = 0` (no target configured)
- If `daily_target > 0` → `extra_units = MAX(0, sum_count − daily_target × DAYS_IN_PERIOD)`

#### `POST /api/payroll/calculate`
**Roles:** admin
Alias to `getPayroll` — triggers recalculation and returns same JSON.

#### `GET /api/payroll/custom-ot-report`
**Roles:** admin, system_admin
**Query params:** `date_from`, `date_to`, `site_id` (optional), `custom_percentage` (optional, 0–100)

**Behaviour:**
- Fetches ALL time-based task rows (no ot_type filter — covers all site types)
- For each task day calculates `extra_hours = out_time − 17:00`
- Two calculation branches:
  - `ot_percentage = 90` → `payment = extra_hours × 150` (fixed)
  - Any other `ot_percentage` → `adjusted_hours = extra_hours × (custom_percentage / 100)`, then standard formula
- If `custom_percentage` not supplied → `adjusted_hours = extra_hours` (no adjustment)
- Aggregates by staff into summary
- Returns ALL staff (not filtered by ot_percentage) so admin can apply % to entire site

#### `POST /api/payroll/custom-ot-save`
**Roles:** admin, system_admin
**Body:** `{ date_from, date_to, site_no, records: [...] }`
**Generates:** `batch_id = "{date_from}_{date_to}_{site_no}_{timestamp}"`
**Inserts into:** `custom_ot_records` table
**Returns:** `{ message, batch_id, count }`

#### `GET /api/payroll/custom-ot-history`
**Roles:** admin, system_admin
**Query params:** `date_from`, `date_to`, `site_no`
**Returns:** Rows from `custom_ot_records` filtered by date range and/or site.

#### `POST /api/payroll/save-target`
**Roles:** admin, system_admin
**Body:** `{ date_from, date_to, site_no, records: [...] }`
**Inserts into:** `payroll_saved_records` table
**Uses:** `EXTRA_UNIT_RATE` env variable as the saved rate
**Returns:** `{ message, batch_id, count }`

#### `GET /api/payroll/saved-history`
**Roles:** admin, system_admin
**Query params:** `date_from`, `date_to`, `site_no`
**Returns:** Rows from `payroll_saved_records`.

---

### 6.7 Analytics Routes — `/api/analytics`

**All require:** admin or system_admin role.

#### `GET /api/analytics/workforce`
**Query params:** `date_from`, `date_to`
**Returns:**
- `roleDistribution` — count by role (admin, supervisor, staff, system_admin)
- `statusBreakdown` — active vs inactive counts
- `siteDistribution` — staff count per site
- `summary` — `{ totalStaff, activeStaff, inactiveStaff, totalSites }`

#### `GET /api/analytics/tasks`
**Query params:** `date_from`, `date_to`
**Returns:**
- `dailyCounts` — task count per date
- `siteProductivity` — task count by site
- `topPerformers` — top staff by task count
- `targetAchievement` — count vs target comparison

#### `GET /api/analytics/attendance`
**Query params:** `date_from`, `date_to`
**Returns:**
- `monthlyTrend` — attendance count per month
- `avgWorkingHours` — average hours per site
- `lateStayAnalysis` — staff working beyond standard hours

#### `GET /api/analytics/payroll`
**Query params:** `date_from`, `date_to`
**Returns:** OT summary per site, total payments by site

#### `GET /api/analytics/performance`
**Query params:** `date_from`, `date_to`
**Returns:** Top performers, productivity metrics

#### `GET /api/analytics/sites`
**Returns:** Site-wise statistics (staff count, task count, OT type distribution)

#### `GET /api/analytics/site-count-trend`
**Returns:** Historical site count over time

#### `GET /api/analytics/profitability`
**Query params:** `date_from`, `date_to`
**Returns:**
- Profit/loss aggregated by `service_type`
- Profit/loss aggregated by `site_type`
- Profit/loss aggregated by `ot_type`
- Overall totals (revenue, cost, profit, margin %)

#### `GET /api/analytics/invoice-analysis`
**Query params:** `date_from`, `date_to`
**Returns:**
- Monthly invoice trend (revenue, cost, profit per month)
- Top 5 revenue sites
- Top 5 profit-margin sites
- Loss-making sites (net_profit < 0)

#### `GET /api/analytics/site-snapshot/:site_id`
**Returns full site deep-dive** (8 parallel queries):

1. **Site info** — site details + supervisor name
2. **Staff list** — all staff with EPF, role, basic_salary, fix_salary, status
3. **Task type breakdown** — per task-type: `row_count`, `total_units`
   - `time_based` sites: `total_units = COUNT(*)` (row count = staff-days)
   - `target_based` sites: `total_units = SUM(count)` (actual work units)
4. **Monthly task activity** — last 12 months: task_records, total_units, workers
5. **Invoice history** — all saved invoices with amounts
6. **Monthly invoice trend** — last 12 months revenue/cost/profit
7. **Target-based OT paid** — from `payroll_saved_records` (looked up by site_no)
8. **Time-based OT paid** — from `custom_ot_records` (looked up by site_no)

**Response includes:**
```json
{
  "site": { "id", "site_no", "name", "ot_type", "daily_target", "supervisor_name" },
  "workforce": { "staff": [...], "active": number, "inactive": number },
  "taskActivity": {
    "taskTypes": [{ "task_type", "records", "total_units" }],
    "monthlyTasks": [{ "month", "task_records", "total_units", "workers" }],
    "totalTaskRecords": number,
    "totalUnits": number,
    "isTimeBased": boolean
  },
  "invoices": [...],
  "monthlyInvoices": [...],
  "financials": {
    "totalRevenue", "totalCost", "netProfit",
    "totalSalaryOt", "totalCostVariant", "totalExpense"
  }
}
```

**`isTimeBased` flag:** `true` when `ot_type === 'time_based'` OR `daily_target === 0`.
Used by frontend to show "Staff Days" instead of "Total Units" labels.

#### `GET /api/analytics/site-performance`
**Query params:** `site_id` (required), `date_from`, `date_to`
**Returns site performance data** (3 parallel queries):

1. **Daily trend** — per-day actual count vs `site.daily_target`
2. **Staff breakdown** — per staff: sum_count, total_target, extra_units, achievement_%
   - `total_target = daily_target × COUNT(DISTINCT task_date)` (days actually worked)
   - `extra_units = MAX(0, sum_count − total_target)` **but 0 if daily_target = 0**
   - `achievement_pct = ROUND(sum_count / total_target × 100, 1)` or 0 if no target
3. **Site info** — id, site_no, name, daily_target, ot_type

**Response:**
```json
{
  "siteInfo": { "id", "site_no", "name", "daily_target", "ot_type" },
  "summary": { "totalActual", "totalTarget", "totalExtra", "avgAchievement", "staffCount" },
  "dailyTrend": [{ "date", "actual", "target" }],
  "staffBreakdown": [{ "staff_name", "epf_number", "sum_count", "total_target", "extra_units", "achievement_pct" }],
  "overperformers": [...],
  "underperformers": [...]
}
```

---

### 6.8 Invoice Routes — `/api/invoices`

**All require:** admin or system_admin role.

#### `GET /api/invoices`
**Query params:** `date_from`, `date_to`, `site_id`
**Returns:** Rows from `profit_amount` ordered by `date_from DESC`.

#### `POST /api/invoices/preview`
**Body:** `{ site_id, date_from, date_to }`
**Does NOT save to DB — only calculates and returns breakdown**

**Calculation steps:**
1. Fetch all numeric cost factors for site → `cost_variant_amount = SUM(numeric values)`
2. Fetch active staff for site → `salary_amount = SUM(basic_salary + fix_salary)`
3. Fetch time-based OT from `custom_ot_records` where `date_from >= period_start AND date_to <= period_end` → `time_ot_total`
4. Fetch target-based OT from `payroll_saved_records` with same date overlap → `target_ot_total`
5. `salary_ot_amount = salary_amount + time_ot_total + target_ot_total`
6. Fetch task counts × invoice_price per task type → `invoice_price = SUM(count × invoice_price)`

**Returns:**
```json
{
  "site": { ... },
  "dateRange": { "from", "to" },
  "costVariants": [{ "factor_key", "factor_value", "is_numeric" }],
  "costVariantAmount": number,
  "staffSalaries": [{ "name", "epf_number", "basic_salary", "fix_salary", "total" }],
  "salaryTotal": number,
  "timeOtRecords": [...],
  "timeOtTotal": number,
  "targetOtRecords": [...],
  "targetOtTotal": number,
  "salaryOtAmount": number,
  "taskLines": [{ "task_description", "count", "invoice_price", "line_total" }],
  "invoicePrice": number
}
```

#### `POST /api/invoices`
**Body:** `{ site_id, site_no, site_name, date_from, date_to, cost_variant_amount, salary_ot_amount, expense_cost, invoice_price }`
**Inserts into:** `profit_amount` table
**Returns:** `{ message: "Invoice saved", id: number }`

#### `PUT /api/invoices/:id`
**Body:** Same fields as POST (partial update allowed).
**Returns:** `{ message: "Invoice updated" }`

#### `DELETE /api/invoices/:id`
**Returns:** `{ message: "Invoice deleted" }`

---

### 6.9 Health Check

#### `GET /health`
**Auth:** None
**Returns:** `{ status: "ok", timestamp: Date }`

---

## 7. Payroll Calculation Logic

**File:** `server/src/utils/payrollUtils.ts`
**Constants (ENV-configurable):**
```
DEFAULT_OUT_TIME  = "17:00"
DAYS_IN_PERIOD    = 22
EXTRA_UNIT_RATE   = 0.5
```

---

### 7.1 Time-Based Extra Hours

```typescript
calculateTimeBasedExtra(out_time: string, default_out: string): number
```

**Steps:**
1. Parse `out_time` and `default_out` as times on a fixed reference date (2000-01-01)
2. `diff = out_time − default_out` in milliseconds
3. If `diff <= 0` → return `0` (left on time or early)
4. Convert ms → hours (divide by 3,600,000)
5. Round half-up to nearest integer hour

**Example:** Out at 19:30, default 17:00 → diff = 2.5 hrs → **rounds to 3 hrs**

---

### 7.2 Time-Based OT Payment

```typescript
calculateTimeBasedPayment(extraHours: number, basicSalary: number): { payment, rate }
```

**Formula:**
```
hourly_rate = (basic_salary / 240) × 1.5
payment     = extra_hours × hourly_rate
```

Where `240 = DAYS_IN_PERIOD × 8 hours` (one working month in hours).

**Example:** Salary Rs. 30,000, 3 extra hours:
```
hourly_rate = (30,000 / 240) × 1.5 = 187.5
payment = 3 × 187.5 = Rs. 562.50
```

---

### 7.3 90% Fixed-Rate OT

For staff with `ot_percentage = 90`:
```
payment = extra_hours × 150   (fixed rate, no salary dependency)
ot_rate = 150
```

---

### 7.4 Custom Percentage OT

For staff with any `ot_percentage` other than 90 (including 0):
```
adjusted_hours = extra_hours × (custom_percentage / 100)
payment = calculateTimeBasedPayment(adjusted_hours, basic_salary)
```

If `custom_percentage` not supplied by admin: `adjusted_hours = extra_hours`

---

### 7.5 Target-Based Extra Units

```typescript
calculateTargetBasedExtra(sumCount: number, totalTarget: number): number
```
```
extra_units = MAX(0, sum_count − total_target)
```

**Total target calculation:**
```
total_target = daily_target × DAYS_IN_PERIOD
```

**Guard condition:** If `daily_target = 0` → `extra_units = 0`, `extra_payment = 0`
(A site with no daily target configured cannot have extra units)

---

### 7.6 Target-Based Payment

```typescript
calculateTargetBasedPayment(extraUnits: number, rate: number): number
```
```
payment = extra_units × rate
rate = EXTRA_UNIT_RATE (default 0.5)
```

---

### 7.7 Site Performance Target (Analytics)

Different from payroll — uses actual days worked:
```
total_target  = daily_target × COUNT(DISTINCT task_date)   (days staff actually worked)
extra_units   = MAX(0, sum_count − total_target)           (0 if daily_target = 0)
achievement % = ROUND(sum_count / total_target × 100, 1)   (0 if total_target = 0)
```

---

## 8. Invoice Calculation Logic

**File:** `server/src/controllers/invoiceController.ts`

### 8.1 Preview Calculation (Step-by-Step)

**Input:** `site_id`, `date_from`, `date_to`

**Step 1 — Cost Variants**
```sql
SELECT factor_key, factor_value FROM cost_varient WHERE site_id = :site_id
```
- Filter only numeric `factor_value` entries
- `cost_variant_amount = SUM(numeric values)`

**Step 2 — Staff Salaries**
```sql
SELECT name, epf_number, basic_salary, fix_salary FROM users
WHERE site_id = :site_id AND status = 'active'
```
- `salary_total = SUM(basic_salary + fix_salary)` per staff member

**Step 3 — Time-Based OT (Custom OT Records)**
```sql
SELECT SUM(total_payment) FROM custom_ot_records
WHERE site_no = :site_no
  AND date_from >= :period_from
  AND date_to   <= :period_to
```
- Matches records saved within the invoice period

**Step 4 — Target-Based OT (Payroll Saved Records)**
```sql
SELECT SUM(extra_payment) FROM payroll_saved_records
WHERE site_no = :site_no
  AND date_from >= :period_from
  AND date_to   <= :period_to
```

**Step 5 — Combined Salary + OT**
```
salary_ot_amount = salary_total + time_ot_total + target_ot_total
```

**Step 6 — Invoice Revenue**
```sql
SELECT t.task_description, SUM(t.count) as total_count, MAX(t.invoice_price) as unit_price
FROM tasks t
WHERE t.site_id = :site_id
  AND t.task_date BETWEEN :date_from AND :date_to
  AND t.count IS NOT NULL AND t.count > 0
GROUP BY t.task_description
```
```
invoice_price = SUM(total_count × unit_price) for each task type
```

**Step 7 — Net Profit (calculated on frontend)**
```
net_profit = invoice_price − (cost_variant_amount + salary_ot_amount + expense_cost)
```

---

## 9. Analytics Logic

**File:** `server/src/controllers/analyticsController.ts`

### 9.1 Profitability Analysis

Groups `profit_amount` records by:
- **Service type** (`sites.service_type`)
- **Site type** (`sites.site_type`)
- **OT type** (`sites.ot_type`)

For each group:
```
net_profit  = SUM(invoice_price) − SUM(cost_variant_amount + salary_ot_amount + expense_cost)
margin_pct  = ROUND(net_profit / SUM(invoice_price) × 100, 1)  (0 if no revenue)
```

### 9.2 Invoice Analysis

Monthly trend (last 12 months):
```sql
SELECT TO_CHAR(date_from, 'YYYY-MM') as month,
       SUM(invoice_price) as revenue,
       SUM(cost_variant_amount + salary_ot_amount + expense_cost) as total_cost,
       SUM(invoice_price - (cost_variant_amount + salary_ot_amount + expense_cost)) as net_profit
FROM profit_amount
GROUP BY TO_CHAR(date_from, 'YYYY-MM')
ORDER BY month
```

Top revenue and top profit-margin sites:
- Ranked by `SUM(invoice_price)` and `net_profit / revenue × 100` respectively

Loss-making sites: `WHERE net_profit < 0`

### 9.3 Site Snapshot — isTimeBased Flag

```typescript
const isTimeBased = site.OT_TYPE === 'time_based' || Number(site.DAILY_TARGET || 0) === 0;
```

When `isTimeBased = true`:
- Task type breakdown uses `COUNT(*)` as `total_units` (row count = staff-days)
- Monthly task trend uses `COUNT(*)` as `total_units`
- Frontend displays "Staff Days" label instead of "Total Units"

When `isTimeBased = false` (target-based with daily_target > 0):
- `total_units = SUM(count)` (actual work units)
- Frontend displays "Total Units" label

---

## 10. Frontend Pages & Features

### 10.1 Authentication

**File:** `client/src/context/AuthContext.tsx`
**File:** `client/src/pages/Login.tsx`

- Login form with EPF number and password
- JWT stored in `localStorage`
- `AuthContext` exposes: `user`, `role`, `token`, `login()`, `logout()`
- **Session timeout:** 10-minute inactivity timer
  - At 1 minute remaining: warning modal appears
  - On expiry: auto-logout, token cleared, redirect to `/login`
  - Timer resets on any user interaction (mousemove, keypress, click)

**Axios interceptor:** Every request automatically attaches `Authorization: Bearer {token}`.
On 401 response → clear token, redirect to login.

---

### 10.2 Dashboard (`/`)

**File:** `client/src/pages/Dashboard.tsx`

#### Admin/Supervisor view:
- Summary KPI cards: total staff, sites, tasks today, revenue
- Quick navigation buttons

#### System Admin view (unique):

**Top section — Financial KPIs (from invoice analytics):**
- Total Revenue, Total Cost, Net Profit, Profit Margin %, Sites count

**Revenue vs Cost Chart:**
- Bar chart (last 6–12 months) — Revenue bars (blue) vs Cost bars (orange)

**Top Sites panel:**
- Top 5 highest-revenue sites with margin badges

**Monthly Trend Chart:**
- Line chart of net profit over time

**Loss-making Sites alert panel:**
- Amber warning panel listing sites with negative net profit

**Site Deep Dive — Dropdown selector:**
- Admin selects any site from dropdown
- Renders `SiteSnapshot` component with full analysis

#### SiteSnapshot Component (embedded in Dashboard):

**4 tabs: Overview | Staff | Tasks | Invoices**

**Overview tab:**
- Monthly revenue/cost/profit bar chart (last 12 months)
- Monthly task records bar chart
- Cost composition donut chart (Cost Variants, Salary+OT, Expense, Net Profit)

**Staff tab:**
- Full staff table: Name, EPF, Role, Basic Salary, Fix Salary, Status
- Active/inactive counts
- Inactive rows are dimmed (opacity 60%)

**Tasks tab:**
- 3 KPI cards:
  - Task Records (total row count)
  - Staff Days or Total Units (label depends on `isTimeBased`)
  - Task Types count
- Task Type Pie chart (by record count)
- Task type list with records count + units/days
- Monthly Task Trend line chart (records + workers)

**Invoices tab:**
- 4 KPI cards: Total Revenue, Total Cost, Net Profit, Avg Margin
- Full invoice history table with period, revenue, cost variants, salary+OT, cost, profit, margin %
- Profit cells: green if positive, red if negative

---

### 10.3 Users Page (`/users`)

**File:** `client/src/pages/Users.tsx`

**Features:**
- Searchable, filterable user list
- Filters: role (admin/supervisor/staff), status (active/inactive), site
- Search by name or EPF number

**Cards/Table per user:**
- EPF number, Name, Role badge (colour-coded), Status badge
- Salary info (BASIC_SALARY, OT_PERCENTAGE, FIX_SALARY) — admin/system_admin only
- Site assignment
- `inactivation_requested` flag shown as amber "Pending" badge

**Create/Edit modal (admin only):**
- All user fields
- Password field (hashed server-side)
- Role and status dropdowns
- Site selector

**Supervisor actions:**
- "Request Inactivation" button → sets `inactivation_requested = 1`
- Sees only users in their assigned site

**Role badge colours:**
- admin → indigo
- supervisor → violet
- staff → emerald
- system_admin → orange

---

### 10.4 Sites Page (`/sites`)

**File:** `client/src/pages/Sites.tsx`

**Features:**
- Grid of site cards showing:
  - Site No, Name, Supervisor
  - OT type badge (time_based = blue, target_based = violet, staff_outsource = orange)
  - Daily target (if > 0)
  - Service type, site type
  - Active staff count
  - Task types list with invoice prices
  - Cost factors list

**Create/Edit modal (admin only):**
- Site number and name inputs
- OT type selector (3 button options)
- Service type dropdown: Physical, Scanning, Data entry, Insurance Policy, Staff outsource, DMS
- Site type dropdown: Insurance, Bank, Hospital, Tele, Finance
- Daily target input (grayed out when ot_type = time_based or staff_outsource)
- Supervisor dropdown (only supervisors listed)
- **Dynamic task types:** Add/remove rows with task name + invoice price
- **Dynamic cost factors:** Add/remove rows with key + value

---

### 10.5 Tasks Page (`/tasks`)

**File:** `client/src/pages/Tasks.tsx`

**Features:**
- Site selector (dropdown)
- Date picker
- OT type badge (read-only, derived from site)

**Daily Sheet View:**
- Table with one row per active staff at the selected site
- Per-staff row shows:
  - Name, EPF number
  - Task type dropdown (populated from `site_task_types`)
  - For `time_based`: In Time / Out Time inputs
  - For `target_based`: Count input
  - Save button (active only when changes pending)
  - Edit/clear icons for existing task
- Color coding:
  - Unsaved draft row → blue tint
  - Saved task → neutral

**Auto-save behaviour:**
- `ot_type` saved as `time_based` for both `time_based` and `staff_outsource` sites
- Default task is "Scanning" with `ot_type` matching site

**Summary View:**
- Date range selection
- Site accordion panels
- Aggregate stats per site

---

### 10.6 Attendance Page (`/attendance`)

**File:** `client/src/pages/Attendance.tsx`

- Similar layout to Tasks page
- Records in_time/out_time in `attendance` table (separate from tasks)
- Useful for sites that need independent attendance tracking

---

### 10.7 Payroll Page (`/payroll`)

**File:** `client/src/pages/Payroll.tsx`

**Filters:**
- Site selector (auto-sets OT type based on selected site)
- Date range
- OT type (disabled — auto-set from site)
- View mode toggle: Detailed / Summary (time-based only)

**Time-Based Payroll Table:**
- Detailed: Per-day rows with in/out times, extra hours, rate, payment
- Summary: Per-staff total extra hours and payment

**Target-Based Payroll Table:**
- Per-staff: total count, total target, extra units, rate, payment

**Save Payroll button:**
- Available for target-based when site is selected
- Saves current results to `payroll_saved_records` with a `batch_id`

**Saved History panel:**
- Collapsible panel showing saved batches
- Grouped by `batch_id` with site, period, staff list, totals

**Payment columns:** Hidden for supervisor role (only admin/system_admin see Rs. amounts)

**Export to Excel:** Downloads current table as `.xlsx` file

---

### 10.8 Reports Page (`/reports`)

**File:** `client/src/pages/Reports.tsx`

**4 tabs:**

**Tab 1 — Daily Count Report:**
- Select site and date
- Shows each staff member's task count for that day
- PDF and Excel export

**Tab 2 — Salary/Target-Based Report:**
- Date range + site filter
- Per-staff count vs target comparison
- PDF and Excel export

**Tab 3 — OT Analysis Report:**
- Date range + site filter
- Shows extra hours per staff member
- Calculates payments based on salary formula
- PDF and Excel export

**Tab 4 — Custom OT % Report:**
- Site selector, date range, custom % input
- "Calculate" button fetches from `/payroll/custom-ot-report` with the entered %
- Table shows: Site, EPF, Staff, Calculation Type, Extra Hours, OT %, Adjusted Hours, Payment
- Two calculation types displayed:
  - `90% Fixed` (purple badge) — fixed Rs.150/hour
  - `Custom %` (blue badge) — custom percentage applied
- **Save to DB** button → saves to `custom_ot_records`
- **History** panel → shows saved batches from `custom_ot_records`
- PDF and Excel export

---

### 10.9 Analytics Page (`/analytics`)

**File:** `client/src/pages/Analytics.tsx`
**Access:** admin, system_admin only

**8 analytical tabs:**

1. **Workforce** — Role/status distribution pie charts, site-wise bar chart, KPI cards
2. **Productivity** — Daily task trend, site productivity ranking, top performers
3. **Attendance** — Monthly attendance trend, average hours, late-stay stats
4. **Payroll & OT** — OT payment totals by site, breakdown by OT type
5. **Site Overview** — Site stats table with staff count, task count, OT type
6. **Site Count Trend** — Line chart of active sites over time
7. **Profitability** — Revenue/cost/profit grouped by service type, site type, OT type
8. **Invoice Analysis** — Monthly invoice trend, top revenue sites, top margin sites, loss alert panel

All tabs have:
- Date range filter (period picker)
- Loading skeleton states
- Empty state illustrations
- Interactive Recharts (hover tooltips, legends)

---

### 10.10 Site Performance Page (`/site-performance`)

**File:** `client/src/pages/SitePerformance.tsx`
**Access:** admin, system_admin
**Shows:** Target-based sites only (filtered in site dropdown)

**Filters:** Site selector (target-based sites only), date range

**KPI Cards (5):**
- Staff count
- Total Count (sum of all task counts)
- Total Target (`daily_target × working days`)
- Extra Units (above target — 0 if daily_target = 0)
- Avg Achievement %

**Charts:**
- **Daily Actual vs Target** line chart — actual count line (indigo) vs target dashed line (slate)
- **Staff Count vs Target** horizontal bar chart — actual (indigo) vs target (light gray) bars
- **Achievement % Distribution** vertical bar chart — colour-coded bars:
  - Green ≥ 100%
  - Amber 80–99%
  - Red < 80%

**Tables:**
- Full staff breakdown: EPF, Name, Count, Target, Extra Units, Achievement % with mini progress bar
- Over/underperformers quick-view panels

---

### 10.11 Invoices Page (`/invoices`)

**File:** `client/src/pages/Invoices.tsx`
**Access:** admin, system_admin

**Features:**
- List all saved invoices with filters
- **Preview Invoice:** Select site + period → see full breakdown before saving
- **Save Invoice:** Commits preview to `profit_amount` table
- **Edit Invoice:** Update amounts on existing record
- **Delete Invoice:** Remove record

**Preview breakdown shows:**
- Cost factors table (key/value, numeric highlighted)
- Staff salary table (per person + total)
- Time-based OT records
- Target-based OT records
- Task lines (task type, count, unit price, total)
- Summary: Revenue, Salary+OT, Cost Variants, Expense, **Net Profit** (green/red)

**Export:** PDF (jsPDF with autotable), Excel (XLSX)

---

## 11. Business Rules & Conditions

### 11.1 OT Type Rules

| Site OT Type | How tasks are tracked | Extra calculation |
|---|---|---|
| `time_based` | `in_time` / `out_time` per day; `count` = NULL | Hours after 17:00 |
| `target_based` | `count` units per day; in/out = optional | Units above `daily_target × 22` |
| `staff_outsource` | Same as time_based (in/out); treated as `time_based` at task level | Same as time_based |

### 11.2 daily_target = 0 Rule

**Sites with `daily_target = 0` have no monthly target configured.**

- In payroll (target-based): `extra_units = 0`, `extra_payment = 0`
- In site performance: `extra_units = 0`, `achievement_pct = 0`
- In analytics/snapshot: `isTimeBased = true`, shows "Staff Days" label
- In payroll (time-based sites): `daily_target = 0` is the norm — no issue

### 11.3 Custom OT Report Inclusion

The Custom OT report includes **all staff** at the selected site, regardless of `ot_percentage` value:
- Staff with `ot_percentage = 90` → "90% Fixed" calculation (Rs. 150/hr)
- Staff with `ot_percentage = 0` or any other value → "Custom %" calculation (admin's entered %)

### 11.4 Supervisor Inactivation Flow

1. Supervisor clicks "Request Inactivation" on a staff member → `inactivation_requested = 1`
2. Record appears with amber "Pending" badge on Users page
3. Admin reviews and sets `status = 'inactive'` to complete deactivation
4. This two-step process creates an audit trail

### 11.5 Invoice OT Matching

OT records are matched to an invoice period by exact date overlap:
```
custom_ot_records:    date_from >= invoice.date_from AND date_to <= invoice.date_to
payroll_saved_records: same condition
```
Only records **fully within** the invoice period are included.

### 11.6 Staff Salary in Invoices

Only **active** staff (`status = 'active'`) for the site are included in salary calculation:
```
salary_total = SUM(basic_salary + fix_salary)  WHERE status = 'active' AND site_id = :site_id
```

### 11.7 Cost Factor Numeric Filter

`cost_varient.factor_value` is stored as VARCHAR2. Only entries that can be cast to a number are summed in invoice calculations. Text-only values (e.g., labels, notes) are displayed in the preview but excluded from the total.

### 11.8 task_type → ot_type Mapping at Task Entry

When saving a task for a `staff_outsource` site, the task's `ot_type` is stored as `'time_based'` (not `'staff_outsource'`), because the `tasks.ot_type` column only accepts `'time_based'` or `'target_based'`.

Existing legacy records may have `ot_type = 'staff_outsource'` — these are handled in queries by joining on `sites.ot_type`.

### 11.9 Batch ID Format

```
{date_from}_{date_to}_{site_no}_{unix_timestamp_ms}
e.g.  "2026-02-01_2026-02-28_S001_1740825600000"
```

---

## 12. Environment Variables

**Server (`server/.env`):**

| Variable | Default | Description |
|---|---|---|
| `DB_USER` | — | Oracle DB username |
| `DB_PASSWORD` | — | Oracle DB password |
| `DB_CONNECTION_STRING` | — | Oracle connect string (e.g. `localhost/XEPDB1`) |
| `JWT_SECRET` | — | Secret for signing JWT tokens |
| `PORT` | `3001` | Express server port |
| `DAYS_IN_PERIOD` | `22` | Working days per payroll period (used in target OT) |
| `EXTRA_UNIT_RATE` | `0.5` | Rs. per extra unit for target-based OT payment |

**Client (`client/.env`):**

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend API base URL (e.g. `http://localhost:3001/api`) |

---

*End of DOK-HR System Documentation*
