-- Run each query in Oracle SQL Developer
-- Right-click result -> Export -> CSV -> save to db_migration\csv\<table>.csv
-- Include column headers, comma delimiter

-- 1. sites.csv
SELECT id, site_no, name, supervisor_id, task_invoice_price, daily_target, ot_type, service_type, site_type,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at, TO_CHAR(updated_at,'YYYY-MM-DD HH24:MI:SS') AS updated_at
FROM sites ORDER BY id;

-- 2. users.csv
SELECT id, epf_number, name, password, role, status, site_id, inactivation_requested,
       basic_salary, ot_percentage, fix_salary,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at, TO_CHAR(updated_at,'YYYY-MM-DD HH24:MI:SS') AS updated_at
FROM users ORDER BY id;

-- 3. site_task_types.csv
SELECT id, site_id, task_name, invoice_price, TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM site_task_types ORDER BY id;

-- 4. tasks.csv
SELECT id, site_id, staff_id, TO_CHAR(task_date,'YYYY-MM-DD') AS task_date,
       in_time, out_time, count, ot_type, invoice_price, task_description, target, pay_unit_price,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at, TO_CHAR(updated_at,'YYYY-MM-DD HH24:MI:SS') AS updated_at
FROM tasks ORDER BY id;

-- 5. attendance.csv
SELECT id, site_id, staff_id, TO_CHAR(attendance_date,'YYYY-MM-DD') AS attendance_date,
       in_time, out_time,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at, TO_CHAR(updated_at,'YYYY-MM-DD HH24:MI:SS') AS updated_at
FROM attendance ORDER BY id;

-- 6. custom_ot_records.csv
SELECT id, batch_id, site_no, site_name, staff_id, epf_number, staff_name,
       TO_CHAR(date_from,'YYYY-MM-DD') AS date_from, TO_CHAR(date_to,'YYYY-MM-DD') AS date_to,
       calculation_type, custom_percentage, total_extra_hours, total_adjusted_hours,
       ot_rate, total_payment, TO_CHAR(saved_at,'YYYY-MM-DD HH24:MI:SS') AS saved_at, saved_by
FROM custom_ot_records ORDER BY id;

-- 7. payroll_saved_records.csv
SELECT id, batch_id, site_no, site_name, staff_id, epf_number, staff_name,
       TO_CHAR(date_from,'YYYY-MM-DD') AS date_from, TO_CHAR(date_to,'YYYY-MM-DD') AS date_to,
       sum_count, target_count, extra_units, extra_payment, extra_unit_rate,
       TO_CHAR(saved_at,'YYYY-MM-DD HH24:MI:SS') AS saved_at, saved_by
FROM payroll_saved_records ORDER BY id;

-- 8. cost_varient.csv
SELECT id, site_id, factor_key, factor_value, TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM cost_varient ORDER BY id;

-- 9. profit_amount.csv
SELECT id, site_id, site_no, site_name,
       TO_CHAR(date_from,'YYYY-MM-DD') AS date_from, TO_CHAR(date_to,'YYYY-MM-DD') AS date_to,
       cost_variant_amount, salary_ot_amount, expense_cost, invoice_price,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at, created_by
FROM profit_amount ORDER BY id;

-- 10. poya_days.csv
SELECT id, TO_CHAR(poya_date,'YYYY-MM-DD') AS poya_date, description,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at, created_by
FROM poya_days ORDER BY id;

-- 11. temporary_assignments.csv (skip if table is empty)
SELECT id, staff_id, site_id, TO_CHAR(start_date,'YYYY-MM-DD') AS start_date,
       TO_CHAR(end_date,'YYYY-MM-DD') AS end_date, note, created_by,
       TO_CHAR(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM temporary_assignments ORDER BY id;
