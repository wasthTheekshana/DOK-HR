# Oracle → PostgreSQL Migration
## DOK-HR System — Complete Record

**Date:** 2026-04-29  
**From:** Oracle XE (`localhost:1521/XEPDB1`, user: `system`)  
**To:** PostgreSQL 15 Docker container (`dokcrm_postgres`) → database `dok_hr`  
**Status:** Completed ✓

---

## Overview

DOK-HR was originally built on Oracle XE. This document records everything done to migrate all data and rewrite the entire Node.js backend to run on PostgreSQL — from the first `CREATE DATABASE` command to the final working system.

**Tables migrated (10 of 11):**
```
sites · users · site_task_types · tasks · attendance
poya_days · custom_ot_records · payroll_saved_records
cost_varient · profit_amount
```
> `temporary_assignments` had no data in Oracle — skipped, schema created empty.

---

## Part 1: Environment Setup

### Step 1.1 — Verify Docker container is running

The `dokcrm_postgres` Docker container already existed for another system. We reused it by creating a separate database inside it.

```powershell
docker ps | grep dokcrm_postgres
```

### Step 1.2 — Create the `dok_hr` database

```powershell
docker exec -it dokcrm_postgres psql -U dokcrm -c "CREATE DATABASE dok_hr;"
```

Verified it worked:
```powershell
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "SELECT current_database();"
# Output: dok_hr
```

### Step 1.3 — Connection details used throughout

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dok_hr
DB_USER=dokcrm
DB_PASSWORD=dokcrm@local123
```

---

## Part 2: Export Data from Oracle

We used **Oracle SQL Developer CSV export** (not ora2pg) because ora2pg was difficult to configure on Windows with Docker.

### Why ora2pg failed

| Problem | Cause |
|---|---|
| `ora2pg` not recognized on host | It runs inside Docker, not on the Windows host |
| `ORA-12505: TNS listener` error | Used `sid=XEPDB1` but XEPDB1 is a service name, not a SID |
| `localhost` unreachable from container | On Windows Docker Desktop, `localhost` inside container = the container itself, not the host |
| Output files not created | Docker image writes to internal container path, not the mapped `/data` volume |

**Solution:** Switched to CSV export via Oracle SQL Developer.

### The export queries

Opened Oracle SQL Developer, ran each query, right-clicked the result → **Export → CSV**. Used explicit `SELECT` columns (not `SELECT *`) and `TO_CHAR()` on all date/timestamp columns to avoid format issues.

Files saved to `D:\Project\DOK-HR\csv_export\`.

```sql
-- sites.csv
SELECT id, site_no, name, supervisor_id, daily_target, ot_type, service_type, site_type,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at,
       TO_CHAR(updated_at,'YYYY-MM-DD HH24:MI:SS') AS updated_at
FROM sites;

-- users.csv
SELECT id, epf_number, name, password, role, status, site_id, inactivation_requested,
       basic_salary, ot_percentage, fix_salary,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at,
       TO_CHAR(updated_at,'YYYY-MM-DD HH24:MI:SS') AS updated_at
FROM users;

-- site_task_types.csv
SELECT id, site_id, task_name, invoice_price,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM site_task_types;

-- tasks.csv
SELECT id, site_id, staff_id,
       TO_CHAR(task_date,'YYYY-MM-DD') AS task_date,
       in_time, out_time, count, ot_type, invoice_price, task_description, target, pay_unit_price,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at,
       TO_CHAR(updated_at,'YYYY-MM-DD HH24:MI:SS') AS updated_at
FROM tasks;

-- attendance.csv
SELECT id, site_id, staff_id,
       TO_CHAR(attendance_date,'YYYY-MM-DD') AS attendance_date,
       in_time, out_time,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at,
       TO_CHAR(updated_at,'YYYY-MM-DD HH24:MI:SS') AS updated_at
FROM attendance;

-- poya_days.csv
SELECT id,
       TO_CHAR(poya_date,'YYYY-MM-DD') AS poya_date,
       description,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM poya_days;

-- custom_ot_records.csv
SELECT id, batch_id, site_no, site_name, staff_id, epf_number, staff_name,
       TO_CHAR(date_from,'YYYY-MM-DD') AS date_from,
       TO_CHAR(date_to,'YYYY-MM-DD') AS date_to,
       calculation_type, custom_percentage, total_extra_hours, total_adjusted_hours,
       ot_rate, total_payment,
       TO_CHAR(saved_at,'YYYY-MM-DD HH24:MI:SS') AS saved_at,
       saved_by
FROM custom_ot_records;

-- payroll_saved_records.csv
SELECT id, batch_id, site_no, site_name, staff_id, epf_number, staff_name,
       TO_CHAR(date_from,'YYYY-MM-DD') AS date_from,
       TO_CHAR(date_to,'YYYY-MM-DD') AS date_to,
       sum_count, target_count, extra_units, extra_payment, extra_unit_rate,
       TO_CHAR(saved_at,'YYYY-MM-DD HH24:MI:SS') AS saved_at,
       saved_by
FROM payroll_saved_records;

-- cost_varient.csv
SELECT id, site_id, factor_key, factor_value,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM cost_varient;

-- profit_amount.csv
SELECT id, site_id, site_no, site_name,
       TO_CHAR(date_from,'YYYY-MM-DD') AS date_from,
       TO_CHAR(date_to,'YYYY-MM-DD') AS date_to,
       cost_variant_amount, salary_ot_amount, expense_cost, invoice_price,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at,
       created_by
FROM profit_amount;
```

---

## Part 3: Create PostgreSQL Schema

Created `server/src/db/schema_postgres.sql`.

**Key Oracle → PostgreSQL type conversions:**

| Oracle | PostgreSQL |
|---|---|
| `NUMBER` | `INTEGER` or `NUMERIC(12,2)` |
| `VARCHAR2(n)` | `VARCHAR(n)` |
| `SYSTIMESTAMP` | `CURRENT_TIMESTAMP` |
| `NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY` | `INTEGER GENERATED BY DEFAULT AS IDENTITY` |
| `NUMBER(1)` | `SMALLINT` |

Loaded into the container and applied:

```powershell
docker cp server/src/db/schema_postgres.sql dokcrm_postgres:/schema_postgres.sql
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -f /schema_postgres.sql
```

---

## Part 4: Import Data

### Step 4.1 — Copy CSVs into the Docker container

```powershell
docker cp csv_export/sites.csv                 dokcrm_postgres:/sites.csv
docker cp csv_export/users.csv                 dokcrm_postgres:/users.csv
docker cp csv_export/site_task_types.csv       dokcrm_postgres:/site_task_types.csv
docker cp csv_export/tasks.csv                 dokcrm_postgres:/tasks.csv
docker cp csv_export/attendance.csv            dokcrm_postgres:/attendance.csv
docker cp csv_export/poya_days.csv             dokcrm_postgres:/poya_days.csv
docker cp csv_export/custom_ot_records.csv     dokcrm_postgres:/custom_ot_records.csv
docker cp csv_export/payroll_saved_records.csv dokcrm_postgres:/payroll_saved_records.csv
docker cp csv_export/cost_varient.csv          dokcrm_postgres:/cost_varient.csv
docker cp csv_export/profit_amount.csv         dokcrm_postgres:/profit_amount.csv
```

### Step 4.2 — Import script (`import_data.sql`)

Used a single SQL script with FK constraints temporarily disabled. This was required because `sites.supervisor_id → users` and `users.site_id → sites` form a circular dependency — neither can be imported first without violating a FK.

```sql
-- Disable FK checks for this session
SET session_replication_role = replica;

\COPY sites(id, site_no, name, supervisor_id, daily_target, ot_type, service_type, site_type, created_at, updated_at)
  FROM '/sites.csv' WITH (FORMAT csv, HEADER true);

\COPY users(id, epf_number, name, password, role, status, site_id, inactivation_requested, basic_salary, ot_percentage, fix_salary, created_at, updated_at)
  FROM '/users.csv' WITH (FORMAT csv, HEADER true);

\COPY site_task_types(id, site_id, task_name, invoice_price, created_at)
  FROM '/site_task_types.csv' WITH (FORMAT csv, HEADER true);

\COPY tasks(id, site_id, staff_id, task_date, in_time, out_time, count, ot_type, invoice_price, task_description, target, pay_unit_price, created_at, updated_at)
  FROM '/tasks.csv' WITH (FORMAT csv, HEADER true);

\COPY attendance(id, site_id, staff_id, attendance_date, in_time, out_time, created_at, updated_at)
  FROM '/attendance.csv' WITH (FORMAT csv, HEADER true);

\COPY poya_days(id, poya_date, description, created_at)
  FROM '/poya_days.csv' WITH (FORMAT csv, HEADER true);

\COPY custom_ot_records(id, batch_id, site_no, site_name, staff_id, epf_number, staff_name, date_from, date_to, calculation_type, custom_percentage, total_extra_hours, total_adjusted_hours, ot_rate, total_payment, saved_at, saved_by)
  FROM '/custom_ot_records.csv' WITH (FORMAT csv, HEADER true);

\COPY payroll_saved_records(id, batch_id, site_no, site_name, staff_id, epf_number, staff_name, date_from, date_to, sum_count, target_count, extra_units, extra_payment, extra_unit_rate, saved_at, saved_by)
  FROM '/payroll_saved_records.csv' WITH (FORMAT csv, HEADER true);

\COPY cost_varient(id, site_id, factor_key, factor_value, created_at)
  FROM '/cost_varient.csv' WITH (FORMAT csv, HEADER true);

\COPY profit_amount(id, site_id, site_no, site_name, date_from, date_to, cost_variant_amount, salary_ot_amount, expense_cost, invoice_price, created_at, created_by)
  FROM '/profit_amount.csv' WITH (FORMAT csv, HEADER true);

-- Re-enable FK enforcement
SET session_replication_role = DEFAULT;
```

```powershell
docker cp import_data.sql dokcrm_postgres:/import_data.sql
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -f /import_data.sql
```

### Step 4.3 — Reset identity sequences

After bulk `\COPY` import, PostgreSQL sequences still start at 1. New inserts would collide with existing IDs. Fixed by resetting each sequence to `MAX(id)`:

```sql
SELECT setval(pg_get_serial_sequence('sites',                  'id'), MAX(id)) FROM sites;
SELECT setval(pg_get_serial_sequence('users',                  'id'), MAX(id)) FROM users;
SELECT setval(pg_get_serial_sequence('site_task_types',        'id'), MAX(id)) FROM site_task_types;
SELECT setval(pg_get_serial_sequence('tasks',                  'id'), MAX(id)) FROM tasks;
SELECT setval(pg_get_serial_sequence('attendance',             'id'), MAX(id)) FROM attendance;
SELECT setval(pg_get_serial_sequence('poya_days',              'id'), MAX(id)) FROM poya_days;
SELECT setval(pg_get_serial_sequence('custom_ot_records',      'id'), MAX(id)) FROM custom_ot_records;
SELECT setval(pg_get_serial_sequence('payroll_saved_records',  'id'), MAX(id)) FROM payroll_saved_records;
SELECT setval(pg_get_serial_sequence('cost_varient',           'id'), MAX(id)) FROM cost_varient;
SELECT setval(pg_get_serial_sequence('profit_amount',          'id'), MAX(id)) FROM profit_amount;
```

---

## Part 5: Issues Encountered & How They Were Fixed

| Issue | Cause | Fix |
|---|---|---|
| `ora2pg` not recognized on host | Tool runs inside Docker, not on Windows host | Switched to CSV export via Oracle SQL Developer |
| `ORA-12505: TNS listener` | Used `sid=XEPDB1` — XEPDB1 is a service name, not a SID | Would need `service_name=XEPDB1`; not applicable after switching to CSV |
| `localhost` unreachable from inside container | On Windows Docker, container's `localhost` is the container itself | Would use `host.docker.internal`; not applicable after switch |
| `extra data after last expected column` on \COPY | Exported with `SELECT *` — extra columns and Oracle-formatted dates | Re-exported with explicit column list + `TO_CHAR()` for all dates |
| FK constraint violation when importing `sites` | Circular FK: `sites.supervisor_id → users` and `users.site_id → sites` | Used `SET session_replication_role = replica` to disable FK checks for the import session |
| Column mismatch on `tasks` table | CSV column order did not match schema column order | Used explicit column list in every `\COPY` command |
| Missing `created_by` on `poya_days` | Column is NULL in Oracle and was not exported | Used explicit column list in `\COPY`, excluding the missing column |
| Identity sequences reset to 1 after import | `\COPY` bulk insert bypasses sequence auto-increment | Ran `setval(pg_get_serial_sequence(...), MAX(id))` for all 10 tables |

---

## Part 6: Rewrite Node.js Backend

### Step 6.1 — Replace oracledb with pg

```bash
npm uninstall oracledb @types/oracledb
npm install pg @types/pg
```

Updated `tsconfig.json` to exclude `scripts/` folder (which still had Oracle-style migration scripts that would fail to compile with `pg`).

### Step 6.2 — Rewrite `db/config.ts`

Replaced the Oracle connection pool with a PostgreSQL `pg.Pool`:

```typescript
import { Pool, types } from 'pg';

// Parse bigint and numeric as JS numbers (pg returns them as strings by default)
types.setTypeParser(20,   val => parseInt(val, 10));   // bigint
types.setTypeParser(1700, val => parseFloat(val));      // numeric / decimal

let pool: Pool;

export async function initializeDb() {
    pool = new Pool({
        host:     process.env.DB_HOST     || 'localhost',
        port:     Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME     || 'dok_hr',
        user:     process.env.DB_USER     || 'dokcrm',
        password: process.env.DB_PASSWORD || '',
        max:      10,
        idleTimeoutMillis: 30000,
    });
    const client = await pool.connect();
    client.release();
}

export function getPool(): Pool { return pool; }
```

### Step 6.3 — Rewrite `db/dbUtils.ts`

Oracle's `oracledb` uses named bind parameters (`:paramName`) and returns column names in UPPERCASE. `pg` uses positional parameters (`$1, $2`) and returns lowercase column names.

To avoid rewriting every single SQL query across all controllers, we built a compatibility layer:

```typescript
// Converts :paramName → $1, $2 (preserves quoted strings unchanged)
const PARAM_RE = /('(?:[^']|'')*')|(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g;

function convertParams(sql: string, params: Record<string, any> | any[]) {
    if (Array.isArray(params)) {
        // Array mode: just replace :name tokens with $1, $2 in order
        let idx = 0;
        const text = sql.replace(PARAM_RE, (match, literal) =>
            literal ? match : `$${++idx}`
        );
        return { text, values: params };
    }
    // Named object mode: map :paramName to $N and collect values in order
    const values: any[] = [];
    const seen: Record<string, number> = {};
    const text = sql.replace(PARAM_RE, (match, literal, name) => {
        if (literal) return match;
        if (!(name in seen)) {
            seen[name] = values.length + 1;
            values.push(params[name] ?? null);
        }
        return `$${seen[name]}`;
    });
    return { text, values };
}

// Uppercase all column names to match Oracle's OUT_FORMAT_OBJECT behavior.
// All controllers reference row.ID, row.SITE_NO, etc. — this keeps them working.
function uppercaseRows<T>(rows: any[]): T[] {
    return rows.map(row => {
        const upper: Record<string, any> = {};
        for (const key of Object.keys(row)) upper[key.toUpperCase()] = row[key];
        return upper as T;
    });
}

export async function execute<T = any>(sql: string, params: Record<string, any> | any[] = []) {
    const pool = getPool();
    const client = await pool.connect();
    try {
        const { text, values } = convertParams(sql, params);
        const result = await client.query(text, values.length > 0 ? values : undefined);
        return { rows: uppercaseRows<T>(result.rows) };
    } catch (err) {
        console.error('Database execute error:', err);
        throw err;
    } finally {
        client.release();
    }
}
```

This meant **zero changes were needed in any controller** for column name references — they all continued using `row.ID`, `row.SITE_NO`, etc.

### Step 6.4 — SQL syntax changes in controllers

Every Oracle-specific SQL function was replaced with the PostgreSQL equivalent:

| Oracle syntax | PostgreSQL replacement |
|---|---|
| `TO_DATE(:param, 'YYYY-MM-DD')` | `$1::date` |
| `NVL(col, default)` | `COALESCE(col, default)` |
| `SYSDATE` | `CURRENT_DATE` |
| `SYSTIMESTAMP` | `CURRENT_TIMESTAMP` |
| `TRUNC(col)` | `DATE_TRUNC('day', col)` |
| `TRUNC(col, 'MM')` | `DATE_TRUNC('month', col)` |
| `ADD_MONTHS(d, n)` | `d + INTERVAL 'n months'` or `d + (n \|\| ' months')::interval` |
| `FETCH FIRST n ROWS ONLY` | `LIMIT n` |
| `TO_NUMBER(x)` | `x::numeric` |
| `TO_CHAR(col, 'YYYY-MM')` | `TO_CHAR(col, 'YYYY-MM')` ← same in PostgreSQL |
| `RETURNING col INTO :out` | `RETURNING col` (read from `result.rows[0]`) |
| Named bind `:paramName` | Handled automatically by `convertParams()` — no manual change needed |

### Step 6.5 — MERGE → INSERT ... ON CONFLICT

Oracle's `MERGE` has no equivalent in PostgreSQL. Replaced the attendance upsert in `taskController.ts`:

**Oracle MERGE:**
```sql
MERGE INTO attendance a
USING DUAL ON (a.staff_id = :staffId AND a.site_id = :siteId AND a.attendance_date = TO_DATE(:date,'YYYY-MM-DD'))
WHEN NOT MATCHED THEN INSERT (site_id, staff_id, attendance_date, in_time, out_time)
  VALUES (:siteId, :staffId, TO_DATE(:date,'YYYY-MM-DD'), :inTime, :outTime)
WHEN MATCHED THEN UPDATE SET in_time = :inTime, out_time = :outTime, updated_at = SYSTIMESTAMP;
```

**PostgreSQL replacement:**
```sql
INSERT INTO attendance (site_id, staff_id, attendance_date, in_time, out_time)
VALUES ($1, $2, $3::date, $4, $5)
ON CONFLICT (staff_id, site_id, attendance_date)
DO UPDATE SET
  in_time    = EXCLUDED.in_time,
  out_time   = EXCLUDED.out_time,
  updated_at = CURRENT_TIMESTAMP;
```

Required adding `UNIQUE (staff_id, site_id, attendance_date)` to the attendance table in `schema_postgres.sql`.

### Step 6.6 — RETURNING INTO → RETURNING

Oracle used `RETURNING id INTO :outVar` with an `oracledb.BIND_OUT` parameter:

```typescript
// Oracle pattern
const result = await execute(
    `INSERT INTO sites (...) VALUES (:...) RETURNING id INTO :id`,
    { ..., id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }
);
const newId = result.outBinds.id[0];
```

PostgreSQL returns the value in `result.rows[0]`:

```typescript
// PostgreSQL pattern
const result = await execute(
    `INSERT INTO sites (...) VALUES (:...) RETURNING id`,
    { ... }
);
const newId = result.rows[0].ID;
```

Changed in `siteController.ts`, `userController.ts`, and `invoiceController.ts`.

### Step 6.7 — Update `.env`

Removed Oracle connection string, added PostgreSQL variables:

```env
# Removed:
# DB_CONNECT_STRING=localhost:1521/XEPDB1
# DB_USER=system
# DB_PASSWORD=wasath123

# Added:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dok_hr
DB_USER=dokcrm
DB_PASSWORD=dokcrm@local123
JWT_SECRET=supersecretkey_change_this_in_production
```

---

## Part 7: Security & Validation Added During Migration

While rewriting the backend, additional hardening was applied:

- **Rate limiting** — `express-rate-limit` added: 5 login attempts per 15 min, 120 general requests/min, 30 heavy-endpoint requests/min
- **Zod validation** — request body validation on all write endpoints (create user, create site, create attendance, login)
- **Input validation on login** — `validateBody(loginSchema)` ensures both `epf_number` and `password` are present before reaching the controller
- **bcrypt** — passwords hashed with `bcrypt` (salt rounds: 10); login uses `bcrypt.compare()`
- **JWT** — 1-day expiry tokens; `verifyToken` called on every protected route

---

## Part 8: Final State

After migration the system runs entirely on PostgreSQL with no Oracle dependency.

**What was removed:**
- `oracledb` npm package
- Oracle connection string from `.env`
- Oracle-specific SQL (`TO_DATE`, `NVL`, `SYSDATE`, `MERGE`, `RETURNING INTO`, `FETCH FIRST ROWS`)
- `ora2pg.conf`
- Oracle `schema.sql` (DDL)
- `csv_export/` directory (data already in PostgreSQL)
- `import_data.sql` (migration complete)
- `oracle_schema.sql` (generated by ora2pg, no longer needed)
- All debug/migration scripts (`add_column.ts`, `fix_column.ts`, `debug_task_dates.ts`, etc.)

**What replaced them:**
- `pg` npm package (`Pool`, `types.setTypeParser`)
- `server/src/db/config.ts` — PostgreSQL pool
- `server/src/db/dbUtils.ts` — `convertParams()` + `uppercaseRows()` compatibility layer
- `server/src/db/schema_postgres.sql` — canonical schema
- `server/.env` — PostgreSQL connection variables

**To set up a fresh environment:**
```bash
# 1. Start PostgreSQL container
docker start dokcrm_postgres

# 2. Create database (first time only)
docker exec -it dokcrm_postgres psql -U dokcrm -c "CREATE DATABASE dok_hr;"

# 3. Install dependencies
cd server && npm install

# 4. Seed database with test data
npm run seed
# → Creates tables + test users: ADMIN001, SUP001, EMP001, EMP002 (password: password123)

# 5. Start server
npm run dev
```

---

*Migration completed: 2026-04-29*  
*Documentation written: 2026-05-01*
