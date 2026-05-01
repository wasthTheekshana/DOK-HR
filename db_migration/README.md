# Oracle → PostgreSQL: Copy Production Data to Local

Follow these steps in order.

---

## Step 1 — Export from Oracle SQL Developer

Open **Oracle SQL Developer** and connect to your production Oracle DB.

Open `1_oracle_export_queries.sql` — run each query one by one and export the result as CSV:

- Right-click the result grid → **Export**
- Format: **CSV**
- Make sure **Include Headers** is checked
- Save each file to: `D:\Project\DOK-HR\db_migration\csv\<table_name>.csv`

Files to create:
```
csv/sites.csv
csv/users.csv
csv/site_task_types.csv
csv/tasks.csv
csv/attendance.csv
csv/custom_ot_records.csv
csv/payroll_saved_records.csv
csv/cost_varient.csv
csv/profit_amount.csv
csv/poya_days.csv
```

> Skip `temporary_assignments.csv` if that table is empty in Oracle.

---

## Step 2 — Make sure Docker is running

```powershell
docker start dokcrm_postgres
docker ps | findstr dokcrm_postgres
```

You should see the container in the list.

---

## Step 3 — Run the import script

Open PowerShell and run:

```powershell
cd D:\Project\DOK-HR
.\db_migration\4_run_import.ps1
```

This script will:
1. Check all CSV files exist
2. Copy them into the Docker container
3. Drop and recreate the schema (clean slate)
4. Import all data
5. Reset sequences so new inserts work correctly
6. Print a row count summary

---

## Step 4 — Verify

At the end of the script you will see a table like:

```
tbl                    | rows
-----------------------+------
sites                  |   12
users                  |   47
site_task_types        |   38
tasks                  | 1842
attendance             | 1756
custom_ot_records      |  120
payroll_saved_records  |  340
cost_varient           |   24
profit_amount          |   18
poya_days              |   14
```

Compare these numbers to what Oracle shows. If they match, you are done.

---

## Step 5 — Start the server

```powershell
cd D:\Project\DOK-HR\server
npm run dev
```

Log in with your production credentials.

---

## If something goes wrong

**"missing CSV file"** — Go back to Oracle SQL Developer and export that table.

**`extra data after last expected column`** — The CSV has more columns than expected. Open the CSV, check the header row matches exactly the column names in `1_oracle_export_queries.sql`. Re-export using the explicit `SELECT` query (not `SELECT *`).

**`FK constraint violation`** — The import script uses `SET session_replication_role = replica` to disable FK checks during import. If this error appears, make sure you are running `2_import_data.sql` and not importing tables manually one by one.

**`duplicate key value violates unique constraint`** — The table already has data. Re-run `4_run_import.ps1` — it drops and recreates the schema first (clean slate).
