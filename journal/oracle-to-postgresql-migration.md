# Oracle → PostgreSQL Migration Plan
## DOK-HR System — Zero Data Loss, Full Functionality

> **Rule:** Never delete Oracle data until PostgreSQL is verified, tested, and live in production.
> Both databases run in parallel until final cutover.

---

## Overview

| Item | Detail |
|---|---|
| **From** | Oracle XE (`localhost:1521/XEPDB1`) |
| **To** | PostgreSQL 15 in Docker (`localhost:5432`) |
| **Docker container** | `dokcrm_postgres` |
| **New database** | `dok_hr` (separate from `dokcrm`) |
| **DB User** | `dokcrm` (reuse existing Docker user) |
| **DB Password** | `dokcrm@local123` |
| **Tables to migrate** | 11 tables (DOK-HR tables only, not all Oracle tables) |
| **Tools needed** | ora2pg or Oracle SQL Developer (CSV), psql via Docker, Node.js |
| **Estimated time** | 2–3 weeks (data migration: 1 day, code changes: 1–2 weeks, testing: 3–5 days) |

**The 11 DOK-HR tables:**
```
users · sites · site_task_types · tasks · attendance
poya_days · custom_ot_records · payroll_saved_records
cost_varient · profit_amount · temporary_assignments
```

---

## Phase 1: Prepare Your Environment

### Step 1.1 — Verify Docker PostgreSQL is running

```bash
docker ps | grep dokcrm_postgres
```

### Step 1.2 — Create the `dok_hr` database inside the existing container

The `dokcrm` database already exists for another system. Create a separate `dok_hr` database:

```bash
docker exec -it dokcrm_postgres psql -U dokcrm -c "CREATE DATABASE dok_hr;"
```

Verify it was created:
```bash
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "SELECT current_database();"
```

You should see `dok_hr` as the output.

### Step 1.3 — Your .env connection details (for later)

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dok_hr
DB_USER=dokcrm
DB_PASSWORD=dokcrm@local123
```

### Step 1.4 — Install ora2pg (optional — skip if using CSV method)

**On Windows (using Strawberry Perl):**
```bash
# Install Strawberry Perl from https://strawberryperl.com/
cpan install DBD::Oracle
cpan install ora2pg
```

**Alternative (Docker image):**
```bash
docker pull georgmoser/ora2pg
```

**Or skip ora2pg entirely and use the CSV method in Phase 2B — it is simpler on Windows.**

---

## Phase 2A: Migrate Data Using ora2pg (Recommended)

### Step 2A.1 — Configure ora2pg for DOK-HR tables only

Create `ora2pg.conf`. The `TABLES` line restricts export to only the 11 DOK-HR tables:

```ini
ORACLE_DSN      dbi:Oracle:host=localhost;sid=XEPDB1;port=1521
ORACLE_USER     system
ORACLE_PWD      wasath123
SCHEMA          SYSTEM

PG_DSN          dbi:Pg:dbname=dok_hr;host=localhost;port=5432
PG_USER         dokcrm
PG_PWD          dokcrm@local123

TYPE            TABLE

# Export ONLY these 11 tables — ignores all other Oracle tables
TABLES          users sites site_task_types tasks attendance poya_days custom_ot_records payroll_saved_records cost_varient profit_amount temporary_assignments
```

### Step 2A.2 — Export schema (DDL) for the 11 tables only

```bash
ora2pg -c ora2pg.conf -t TABLE -o oracle_schema.sql
```

ora2pg auto-converts:
- `NUMBER` → `INTEGER` or `NUMERIC`
- `VARCHAR2` → `VARCHAR`
- `SYSTIMESTAMP` → `CURRENT_TIMESTAMP`

Review the output file before importing.

### Step 2A.3 — Export data for the 11 tables only

```bash
ora2pg -c ora2pg.conf -t COPY -o oracle_data.sql
```

Because `TABLES` is set, only the 11 DOK-HR tables are exported.

### Step 2A.4 — Import into the `dok_hr` database

```bash
# Copy SQL files into the container
docker cp oracle_schema.sql dokcrm_postgres:/oracle_schema.sql
docker cp oracle_data.sql dokcrm_postgres:/oracle_data.sql

# Create schema in dok_hr
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -f /oracle_schema.sql

# Import data into dok_hr
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -f /oracle_data.sql
```

---

## Phase 2B: Migrate Data Manually via CSV (Simpler on Windows)

Use this if ora2pg is difficult to set up. It is 100% reliable and gives you full control.

### Step 2B.1 — Export each of the 11 tables from Oracle as CSV

Open **Oracle SQL Developer**. Run each query below, then right-click the result → **Export** → **CSV** → save with the exact filename shown.

**Important:** Use `TO_CHAR` for all date/timestamp columns so they export cleanly.

```sql
-- users.csv
SELECT id, epf_number, name, password, role, status, site_id,
       inactivation_requested, basic_salary, ot_percentage, fix_salary,
       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
       TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at
FROM users;

-- sites.csv
SELECT id, site_no, name, supervisor_id, daily_target, ot_type,
       service_type, site_type,
       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
       TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at
FROM sites;

-- site_task_types.csv
SELECT id, site_id, task_type, invoice_price,
       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM site_task_types;

-- tasks.csv
SELECT id, site_id, staff_id,
       TO_CHAR(task_date, 'YYYY-MM-DD') AS task_date,
       in_time, out_time, count, ot_type, invoice_price,
       task_description, target, extra_payment,
       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
       TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at
FROM tasks;

-- attendance.csv
SELECT id, site_id, staff_id,
       TO_CHAR(attendance_date, 'YYYY-MM-DD') AS attendance_date,
       in_time, out_time,
       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
       TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at
FROM attendance;

-- poya_days.csv
SELECT id,
       TO_CHAR(poya_date, 'YYYY-MM-DD') AS poya_date,
       description,
       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM poya_days;

-- custom_ot_records.csv
SELECT id, site_id, month, data,
       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM custom_ot_records;

-- payroll_saved_records.csv
SELECT id, site_id, month, data,
       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM payroll_saved_records;

-- cost_varient.csv
SELECT id, site_id, key, value,
       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM cost_varient;

-- profit_amount.csv
SELECT id, site_id, month, invoice_amount, cost_amount,
       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM profit_amount;

-- temporary_assignments.csv
SELECT id, staff_id, site_id,
       TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
       TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM temporary_assignments;
```

You should now have 11 CSV files saved locally.

### Step 2B.2 — Create the PostgreSQL schema in `dok_hr`

```bash
# Copy schema file into the container
docker cp schema_postgres.sql dokcrm_postgres:/schema_postgres.sql

# Run it against dok_hr (not dokcrm)
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -f /schema_postgres.sql
```

### Step 2B.3 — Copy all 11 CSV files into the container

```bash
docker cp users.csv               dokcrm_postgres:/users.csv
docker cp sites.csv               dokcrm_postgres:/sites.csv
docker cp site_task_types.csv     dokcrm_postgres:/site_task_types.csv
docker cp tasks.csv               dokcrm_postgres:/tasks.csv
docker cp attendance.csv          dokcrm_postgres:/attendance.csv
docker cp poya_days.csv           dokcrm_postgres:/poya_days.csv
docker cp custom_ot_records.csv   dokcrm_postgres:/custom_ot_records.csv
docker cp payroll_saved_records.csv dokcrm_postgres:/payroll_saved_records.csv
docker cp cost_varient.csv        dokcrm_postgres:/cost_varient.csv
docker cp profit_amount.csv       dokcrm_postgres:/profit_amount.csv
docker cp temporary_assignments.csv dokcrm_postgres:/temporary_assignments.csv
```

### Step 2B.4 — Import each CSV into `dok_hr`

**Import order matters** — import parent tables before child tables (foreign key dependencies):

```bash
# 1. sites first (no dependencies)
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "\COPY sites FROM '/sites.csv' WITH (FORMAT csv, HEADER true);"

# 2. users (depends on sites)
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "\COPY users FROM '/users.csv' WITH (FORMAT csv, HEADER true);"

# 3. Everything else (depends on users + sites)
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "\COPY site_task_types FROM '/site_task_types.csv' WITH (FORMAT csv, HEADER true);"
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "\COPY tasks FROM '/tasks.csv' WITH (FORMAT csv, HEADER true);"
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "\COPY attendance FROM '/attendance.csv' WITH (FORMAT csv, HEADER true);"
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "\COPY poya_days FROM '/poya_days.csv' WITH (FORMAT csv, HEADER true);"
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "\COPY custom_ot_records FROM '/custom_ot_records.csv' WITH (FORMAT csv, HEADER true);"
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "\COPY payroll_saved_records FROM '/payroll_saved_records.csv' WITH (FORMAT csv, HEADER true);"
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "\COPY cost_varient FROM '/cost_varient.csv' WITH (FORMAT csv, HEADER true);"
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "\COPY profit_amount FROM '/profit_amount.csv' WITH (FORMAT csv, HEADER true);"
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "\COPY temporary_assignments FROM '/temporary_assignments.csv' WITH (FORMAT csv, HEADER true);"
```

### Step 2B.5 — Reset identity sequences after CSV import

PostgreSQL sequences reset to 1 after a bulk import. Fix them so new inserts get correct IDs:

```bash
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "
SELECT setval(pg_get_serial_sequence('sites', 'id'), MAX(id)) FROM sites;
SELECT setval(pg_get_serial_sequence('users', 'id'), MAX(id)) FROM users;
SELECT setval(pg_get_serial_sequence('site_task_types', 'id'), MAX(id)) FROM site_task_types;
SELECT setval(pg_get_serial_sequence('tasks', 'id'), MAX(id)) FROM tasks;
SELECT setval(pg_get_serial_sequence('attendance', 'id'), MAX(id)) FROM attendance;
SELECT setval(pg_get_serial_sequence('poya_days', 'id'), MAX(id)) FROM poya_days;
SELECT setval(pg_get_serial_sequence('custom_ot_records', 'id'), MAX(id)) FROM custom_ot_records;
SELECT setval(pg_get_serial_sequence('payroll_saved_records', 'id'), MAX(id)) FROM payroll_saved_records;
SELECT setval(pg_get_serial_sequence('cost_varient', 'id'), MAX(id)) FROM cost_varient;
SELECT setval(pg_get_serial_sequence('profit_amount', 'id'), MAX(id)) FROM profit_amount;
SELECT setval(pg_get_serial_sequence('temporary_assignments', 'id'), MAX(id)) FROM temporary_assignments;
"
```

---

## Phase 3: Rewrite the PostgreSQL Schema

Create `server/src/db/schema_postgres.sql`. Key type conversions from Oracle:

| Oracle | PostgreSQL |
|---|---|
| `NUMBER` | `INTEGER` or `NUMERIC(12,2)` |
| `VARCHAR2(n)` | `VARCHAR(n)` |
| `SYSTIMESTAMP` | `CURRENT_TIMESTAMP` |
| `NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY` | `INTEGER GENERATED BY DEFAULT AS IDENTITY` |

```sql
-- PostgreSQL Schema for DOK-HR
-- Run against: dok_hr database

CREATE TABLE sites (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  site_no         VARCHAR(50) UNIQUE NOT NULL,
  name            VARCHAR(200) NOT NULL,
  supervisor_id   INTEGER NULL,
  daily_target    NUMERIC(12,2) DEFAULT 0,
  ot_type         VARCHAR(20) DEFAULT 'time_based',
  service_type    VARCHAR(100) NULL,
  site_type       VARCHAR(100) NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id                      INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  epf_number              VARCHAR(64) UNIQUE NOT NULL,
  name                    VARCHAR(200) NOT NULL,
  password                VARCHAR(255) NOT NULL,
  role                    VARCHAR(20) CHECK (role IN ('admin', 'supervisor', 'staff', 'system_admin')) NOT NULL,
  status                  VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')) NOT NULL,
  site_id                 INTEGER NULL REFERENCES sites(id) ON DELETE SET NULL,
  inactivation_requested  SMALLINT DEFAULT 0,
  basic_salary            NUMERIC(12,2) DEFAULT 0,
  ot_percentage           NUMERIC(6,2) DEFAULT 0,
  fix_salary              NUMERIC(12,2) DEFAULT 0,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE sites ADD CONSTRAINT fk_sites_supervisor
  FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE site_task_types (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  site_id         INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  task_type       VARCHAR(100) NOT NULL,
  invoice_price   NUMERIC(12,2) DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
  id               INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  site_id          INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  staff_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
  task_date        DATE NOT NULL,
  in_time          VARCHAR(10) NULL,
  out_time         VARCHAR(10) NULL,
  count            NUMERIC(12,2) DEFAULT 0,
  ot_type          VARCHAR(20) NULL,
  invoice_price    NUMERIC(12,2) DEFAULT 0,
  task_description VARCHAR(500) NULL,
  target           NUMERIC(12,2) DEFAULT 0,
  extra_payment    NUMERIC(12,2) DEFAULT 0,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  site_id         INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  staff_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  in_time         VARCHAR(10) NULL,
  out_time        VARCHAR(10) NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (staff_id, site_id, attendance_date)
);

CREATE TABLE poya_days (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  poya_date   DATE UNIQUE NOT NULL,
  description VARCHAR(200) NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE custom_ot_records (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  site_id     INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  month       VARCHAR(7) NOT NULL,
  data        TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payroll_saved_records (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  site_id     INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  month       VARCHAR(7) NOT NULL,
  data        TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cost_varient (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  site_id     INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  key         VARCHAR(100) NOT NULL,
  value       NUMERIC(14,2) DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profit_amount (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  site_id         INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  month           VARCHAR(7) NOT NULL,
  invoice_amount  NUMERIC(14,2) DEFAULT 0,
  cost_amount     NUMERIC(14,2) DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE temporary_assignments (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  staff_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  site_id     INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_tasks_site_id       ON tasks(site_id);
CREATE INDEX idx_tasks_staff_id      ON tasks(staff_id);
CREATE INDEX idx_tasks_task_date     ON tasks(task_date);
CREATE INDEX idx_attendance_staff_site ON attendance(staff_id, site_id);
CREATE INDEX idx_attendance_date     ON attendance(attendance_date);
```

---

## Phase 4: Verify Data Integrity

Before touching any code, confirm all 11 tables transferred correctly.

### Step 4.1 — Row count check

**Run in Oracle** (SQL Developer):
```sql
SELECT 'users' AS tbl, COUNT(*) AS cnt FROM users
UNION ALL SELECT 'sites', COUNT(*) FROM sites
UNION ALL SELECT 'site_task_types', COUNT(*) FROM site_task_types
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL SELECT 'attendance', COUNT(*) FROM attendance
UNION ALL SELECT 'poya_days', COUNT(*) FROM poya_days
UNION ALL SELECT 'custom_ot_records', COUNT(*) FROM custom_ot_records
UNION ALL SELECT 'payroll_saved_records', COUNT(*) FROM payroll_saved_records
UNION ALL SELECT 'cost_varient', COUNT(*) FROM cost_varient
UNION ALL SELECT 'profit_amount', COUNT(*) FROM profit_amount
UNION ALL SELECT 'temporary_assignments', COUNT(*) FROM temporary_assignments;
```

**Run in Docker PostgreSQL (`dok_hr`):**
```bash
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "
SELECT 'users' AS tbl, COUNT(*) AS cnt FROM users
UNION ALL SELECT 'sites', COUNT(*) FROM sites
UNION ALL SELECT 'site_task_types', COUNT(*) FROM site_task_types
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL SELECT 'attendance', COUNT(*) FROM attendance
UNION ALL SELECT 'poya_days', COUNT(*) FROM poya_days
UNION ALL SELECT 'custom_ot_records', COUNT(*) FROM custom_ot_records
UNION ALL SELECT 'payroll_saved_records', COUNT(*) FROM payroll_saved_records
UNION ALL SELECT 'cost_varient', COUNT(*) FROM cost_varient
UNION ALL SELECT 'profit_amount', COUNT(*) FROM profit_amount
UNION ALL SELECT 'temporary_assignments', COUNT(*) FROM temporary_assignments;"
```

Every row count must match exactly. If any table differs, re-import that table.

### Step 4.2 — Spot check key records

```bash
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "
SELECT id, epf_number, name, role, basic_salary FROM users WHERE id = 1;
SELECT id, site_id, staff_id, task_date, count FROM tasks ORDER BY id DESC LIMIT 5;
SELECT id, name, ot_type, daily_target FROM sites LIMIT 5;"
```

Compare these values against the same query in Oracle.

### Step 4.3 — Check foreign key integrity

```bash
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -c "
SELECT 'orphan tasks (staff)' AS check, COUNT(*) FROM tasks WHERE staff_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'orphan tasks (site)', COUNT(*) FROM tasks WHERE site_id NOT IN (SELECT id FROM sites)
UNION ALL
SELECT 'orphan attendance (staff)', COUNT(*) FROM attendance WHERE staff_id NOT IN (SELECT id FROM users);"
```

All counts must be `0`. If not, there is orphaned data — investigate before proceeding.

---

## Phase 5: Update the Node.js Codebase

Only start this phase after Phase 4 passes completely.

### Step 5.1 — Replace oracledb with pg

```bash
cd server
npm uninstall oracledb @types/oracledb
npm install pg @types/pg
```

### Step 5.2 — Update .env

```env
# Remove these Oracle lines:
# DB_CONNECT_STRING=localhost:1521/XEPDB1
# DB_USER=system
# DB_PASSWORD=wasath123

# Add these PostgreSQL lines:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dok_hr
DB_USER=dokcrm
DB_PASSWORD=dokcrm@local123
```

### Step 5.3 — Rewrite db/config.ts and db/dbUtils.ts

Replace the Oracle pool with a PostgreSQL `pg.Pool`. The `execute()` function signature stays the same so all controllers continue to work — only the internals change.

**Critical difference:** Oracle returns column names UPPERCASE (`result.rows[0].NAME`). PostgreSQL returns lowercase (`result.rows[0].name`). Every property reference across all controllers must be lowercased.

### Step 5.4 — Replace Oracle SQL syntax in all controllers

| Find (Oracle) | Replace with (PostgreSQL) |
|---|---|
| `TO_DATE(:param, 'YYYY-MM-DD')` | `$1::date` |
| `NVL(col, default)` | `COALESCE(col, default)` |
| `SYSDATE` | `CURRENT_DATE` |
| `SYSTIMESTAMP` | `CURRENT_TIMESTAMP` |
| `TRUNC(col)` | `DATE_TRUNC('day', col)` |
| `TRUNC(col, 'MM')` | `DATE_TRUNC('month', col)` |
| `ADD_MONTHS(d, n)` | `d + INTERVAL 'n months'` |
| `FETCH FIRST N ROWS ONLY` | `LIMIT N` |
| `TO_NUMBER(x)` | `x::numeric` |
| `RETURNING col INTO :var` | `RETURNING col` (read from `result.rows[0]`) |
| `:bindName` | `$1, $2, $3...` (positional) |

### Step 5.5 — Rewrite the 2 MERGE statements in taskController.ts

```sql
-- Oracle MERGE → PostgreSQL INSERT ... ON CONFLICT
INSERT INTO attendance (site_id, staff_id, attendance_date, in_time, out_time)
VALUES ($1, $2, $3::date, $4, $5)
ON CONFLICT (staff_id, site_id, attendance_date)
DO UPDATE SET
  in_time    = EXCLUDED.in_time,
  out_time   = EXCLUDED.out_time,
  updated_at = CURRENT_TIMESTAMP;
```

The `UNIQUE (staff_id, site_id, attendance_date)` constraint in the schema above enables this.

### Step 5.6 — Fix RETURNING INTO in siteController.ts and invoiceController.ts

Oracle:
```typescript
`INSERT INTO sites (...) RETURNING id INTO :id`,
{ ..., id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }
// Read: result.outBinds.id[0]
```

PostgreSQL:
```typescript
`INSERT INTO sites (...) RETURNING id`,
[...values]
// Read: result.rows[0].id
```

### Step 5.7 — Convert all bind parameters from named to positional

Oracle uses `:paramName`, PostgreSQL uses `$1, $2, $3`:

```typescript
// Oracle
execute(`SELECT * FROM users WHERE id = :id AND role = :role`, { id: 1, role: 'admin' })

// PostgreSQL
execute(`SELECT * FROM users WHERE id = $1 AND role = $2`, [1, 'admin'])
```

Every SQL query in every controller needs this change.

---

## Phase 6: Test Everything

### Step 6.1 — Start the server against PostgreSQL

```bash
npm run dev
```

Watch the console — any Oracle syntax that slipped through will throw an error immediately.

### Step 6.2 — Test each module

- [ ] Login (all 4 roles: system_admin, admin, supervisor, staff)
- [ ] View dashboard (each role sees different data)
- [ ] Create a task (time-based site)
- [ ] Create a task (target-based site)
- [ ] Edit a task
- [ ] Delete a task
- [ ] Check attendance auto-sync after task save
- [ ] Run payroll — time-based OT
- [ ] Run payroll — target-based OT
- [ ] Run payroll — custom OT%
- [ ] Save payroll record
- [ ] Generate invoice
- [ ] Export PDF
- [ ] Export Excel
- [ ] View analytics charts
- [ ] Add a user
- [ ] Add a site
- [ ] Add poya day
- [ ] Session timeout (10 min inactivity)

### Step 6.3 — Run existing test suite

```bash
cd server
npm test
```

Fix any failing tests — they likely contain Oracle-specific SQL in fixtures.

---

## Phase 7: Production Cutover

Only do this after all Phase 6 tests pass.

### Step 7.1 — Final data sync

On cutover day, do a fresh export from Oracle and re-import into `dok_hr` to capture any data entered during the code migration period.

```bash
# Put the system in maintenance mode (disable logins)
# Re-run Phase 2 export and import for all 11 tables
# Re-run Phase 4 row count verification
```

### Step 7.2 — Switch production .env and restart

```bash
pm2 restart dok-hr
pm2 logs dok-hr
```

Watch logs for 10 minutes. If errors appear, roll back immediately:
```bash
# Point .env back to Oracle connection string
pm2 restart dok-hr
```

### Step 7.3 — Verify production

Log in as each role. Create a test task. Check attendance sync. Run a payroll calculation.

### Step 7.4 — Keep Oracle running for 2 weeks

Do not shut down Oracle until you are 100% confident PostgreSQL is stable. After 2 weeks with no issues, you can decommission Oracle.

---

## Summary Checklist

```
Phase 1: Environment
  [ ] Docker container dokcrm_postgres is running
  [ ] CREATE DATABASE dok_hr inside the container
  [ ] Verify connection to dok_hr works

Phase 2: Migrate data (11 tables only)
  [ ] Export 11 DOK-HR tables from Oracle (ora2pg or CSV)
  [ ] Create PostgreSQL schema in dok_hr
  [ ] Import data into dok_hr in correct order (sites → users → rest)
  [ ] Reset all 11 identity sequences

Phase 3: Verify data
  [ ] Row counts match Oracle for all 11 tables
  [ ] Spot check key records match
  [ ] Foreign key integrity check returns 0 orphans

Phase 4: Update codebase
  [ ] Replace oracledb with pg
  [ ] Update .env (DB_NAME=dok_hr, DB_USER=dokcrm)
  [ ] Rewrite db/config.ts and db/dbUtils.ts
  [ ] Replace Oracle SQL syntax in all 10 controllers
  [ ] Rewrite 2 MERGE statements in taskController.ts
  [ ] Fix RETURNING INTO in siteController + invoiceController
  [ ] Convert :bindName to $1,$2,$3 in all queries
  [ ] Lowercase all column name references

Phase 5: Test
  [ ] Server starts without SQL errors
  [ ] All 19 feature tests pass
  [ ] Test suite passes

Phase 6: Cutover
  [ ] Final data sync from Oracle
  [ ] Switch production .env to dok_hr
  [ ] Monitor PM2 logs
  [ ] Verify all features in production
  [ ] Keep Oracle running for 2 weeks
  [ ] Decommission Oracle after 2 weeks of stability
```

---

*Created: 2026-04-29*
*Updated: 2026-04-29 — separate dok_hr database, 11 DOK-HR tables only*
*Status: Ready to execute — start with Phase 1*
