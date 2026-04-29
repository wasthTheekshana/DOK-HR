# Oracle → PostgreSQL Data Migration Log
## DOK-HR — Completed Steps

**Date:** 2026-04-29
**From:** Oracle XE (`localhost:1521/XEPDB1`)
**To:** PostgreSQL 15 Docker container (`dokcrm_postgres`) → database `dok_hr`

---

## What We Did

### Step 1 — Created a new PostgreSQL database inside the existing Docker container

```powershell
docker exec -it dokcrm_postgres psql -U dokcrm -c "CREATE DATABASE dok_hr;"
```

Created `dok_hr` as a separate database. The existing `dokcrm` database was not touched.

---

### Step 2 — Exported 10 tables from Oracle as CSV

Opened **Oracle SQL Developer**, ran explicit SELECT queries with `TO_CHAR()` for all date/timestamp columns, and exported each result as CSV to `D:\Project\DOK-HR\csv_export\`.

Queries used (explicit columns + formatted dates):

```sql
SELECT id, site_no, name, supervisor_id, daily_target, ot_type, service_type, site_type,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS'), TO_CHAR(updated_at,'YYYY-MM-DD HH24:MI:SS') FROM sites;

SELECT id, epf_number, name, password, role, status, site_id, inactivation_requested,
       basic_salary, ot_percentage, fix_salary,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS'), TO_CHAR(updated_at,'YYYY-MM-DD HH24:MI:SS') FROM users;

SELECT id, site_id, task_name, invoice_price, TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') FROM site_task_types;

SELECT id, site_id, staff_id, TO_CHAR(task_date,'YYYY-MM-DD'), in_time, out_time, count,
       ot_type, invoice_price, task_description, target, pay_unit_price,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS'), TO_CHAR(updated_at,'YYYY-MM-DD HH24:MI:SS') FROM tasks;

SELECT id, site_id, staff_id, TO_CHAR(attendance_date,'YYYY-MM-DD'), in_time, out_time,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS'), TO_CHAR(updated_at,'YYYY-MM-DD HH24:MI:SS') FROM attendance;

SELECT id, TO_CHAR(poya_date,'YYYY-MM-DD'), description, TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') FROM poya_days;

SELECT id, batch_id, site_no, site_name, staff_id, epf_number, staff_name,
       TO_CHAR(date_from,'YYYY-MM-DD'), TO_CHAR(date_to,'YYYY-MM-DD'),
       calculation_type, custom_percentage, total_extra_hours, total_adjusted_hours,
       ot_rate, total_payment, TO_CHAR(saved_at,'YYYY-MM-DD HH24:MI:SS'), saved_by FROM custom_ot_records;

SELECT id, batch_id, site_no, site_name, staff_id, epf_number, staff_name,
       TO_CHAR(date_from,'YYYY-MM-DD'), TO_CHAR(date_to,'YYYY-MM-DD'),
       sum_count, target_count, extra_units, extra_payment, extra_unit_rate,
       TO_CHAR(saved_at,'YYYY-MM-DD HH24:MI:SS'), saved_by FROM payroll_saved_records;

SELECT id, site_id, factor_key, factor_value, TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') FROM cost_varient;

SELECT id, site_id, site_no, site_name, TO_CHAR(date_from,'YYYY-MM-DD'), TO_CHAR(date_to,'YYYY-MM-DD'),
       cost_variant_amount, salary_ot_amount, expense_cost, invoice_price,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS'), created_by FROM profit_amount;
```

> `temporary_assignments` had no data — skipped.

---

### Step 3 — Created PostgreSQL schema in dok_hr

Schema file: `server/src/db/schema_postgres.sql`

```powershell
docker cp server/src/db/schema_postgres.sql dokcrm_postgres:/schema_postgres.sql
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -f /schema_postgres.sql
```

---

### Step 4 — Copied CSVs into the Docker container

```powershell
docker cp csv_export/sites.csv               dokcrm_postgres:/sites.csv
docker cp csv_export/users.csv               dokcrm_postgres:/users.csv
docker cp csv_export/site_task_types.csv     dokcrm_postgres:/site_task_types.csv
docker cp csv_export/tasks.csv               dokcrm_postgres:/tasks.csv
docker cp csv_export/attendance.csv          dokcrm_postgres:/attendance.csv
docker cp csv_export/poya_days.csv           dokcrm_postgres:/poya_days.csv
docker cp csv_export/custom_ot_records.csv   dokcrm_postgres:/custom_ot_records.csv
docker cp csv_export/payroll_saved_records.csv dokcrm_postgres:/payroll_saved_records.csv
docker cp csv_export/cost_varient.csv        dokcrm_postgres:/cost_varient.csv
docker cp csv_export/profit_amount.csv       dokcrm_postgres:/profit_amount.csv
```

---

### Step 5 — Imported data using a single script with FK checks disabled

Created `import_data.sql`:

```sql
SET session_replication_role = replica;

\COPY sites(id, site_no, name, supervisor_id, daily_target, ot_type, service_type, site_type, created_at, updated_at) FROM '/sites.csv' WITH (FORMAT csv, HEADER true);
\COPY users(id, epf_number, name, password, role, status, site_id, inactivation_requested, basic_salary, ot_percentage, fix_salary, created_at, updated_at) FROM '/users.csv' WITH (FORMAT csv, HEADER true);
\COPY site_task_types(id, site_id, task_name, invoice_price, created_at) FROM '/site_task_types.csv' WITH (FORMAT csv, HEADER true);
\COPY tasks(id, site_id, staff_id, task_date, in_time, out_time, count, ot_type, invoice_price, task_description, target, pay_unit_price, created_at, updated_at) FROM '/tasks.csv' WITH (FORMAT csv, HEADER true);
\COPY attendance(id, site_id, staff_id, attendance_date, in_time, out_time, created_at, updated_at) FROM '/attendance.csv' WITH (FORMAT csv, HEADER true);
\COPY poya_days(id, poya_date, description, created_at) FROM '/poya_days.csv' WITH (FORMAT csv, HEADER true);
\COPY custom_ot_records(id, batch_id, site_no, site_name, staff_id, epf_number, staff_name, date_from, date_to, calculation_type, custom_percentage, total_extra_hours, total_adjusted_hours, ot_rate, total_payment, saved_at, saved_by) FROM '/custom_ot_records.csv' WITH (FORMAT csv, HEADER true);
\COPY payroll_saved_records(id, batch_id, site_no, site_name, staff_id, epf_number, staff_name, date_from, date_to, sum_count, target_count, extra_units, extra_payment, extra_unit_rate, saved_at, saved_by) FROM '/payroll_saved_records.csv' WITH (FORMAT csv, HEADER true);
\COPY cost_varient(id, site_id, factor_key, factor_value, created_at) FROM '/cost_varient.csv' WITH (FORMAT csv, HEADER true);
\COPY profit_amount(id, site_id, site_no, site_name, date_from, date_to, cost_variant_amount, salary_ot_amount, expense_cost, invoice_price, created_at, created_by) FROM '/profit_amount.csv' WITH (FORMAT csv, HEADER true);

SET session_replication_role = DEFAULT;
```

> `session_replication_role = replica` disables FK checks for the session — required because `sites` and `users` have a circular FK dependency (sites.supervisor_id → users, users.site_id → sites).

```powershell
docker cp import_data.sql dokcrm_postgres:/import_data.sql
docker exec -it dokcrm_postgres psql -U dokcrm -d dok_hr -f /import_data.sql
```

---

## Issues Encountered & How They Were Fixed

| Issue | Cause | Fix |
|---|---|---|
| `ora2pg` not recognized | It runs inside Docker, not on host | Used `docker run georgmoser/ora2pg ora2pg ...` |
| `ORA-12505: TNS listener` | Used `sid=XEPDB1` but XEPDB1 is a service name | Changed to `service_name=XEPDB1` |
| `localhost` unreachable from container | On Windows Docker, localhost = the container | Changed to `host.docker.internal` |
| ora2pg output files not created | Docker image writes to internal path, not `/data` | Switched to CSV export via Oracle SQL Developer |
| `extra data after last expected column` | Exported with `SELECT *` — Oracle date format & extra columns | Re-exported with explicit SELECT + `TO_CHAR()` for dates |
| `FK constraint violation` on sites import | Circular FK: sites ↔ users | Used `SET session_replication_role = replica` in import script |
| Column mismatch on tasks | CSV column order different from schema | Used explicit column list in `\COPY` command |
| Missing `created_by` on poya_days | Column is NULL in Oracle, not exported | Used explicit column list excluding `created_by` |

---

## Current State

- Oracle database: **untouched, still running**
- PostgreSQL `dok_hr`: **all 10 tables imported successfully**
- Next step: update Node.js codebase to connect to PostgreSQL instead of Oracle

---

*Completed: 2026-04-29*
