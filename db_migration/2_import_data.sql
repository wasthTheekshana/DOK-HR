SET session_replication_role = replica;

\copy sites(id, site_no, name, supervisor_id, daily_target, ot_type, service_type, site_type, created_at, updated_at) FROM '/csv/sites.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy users(id, epf_number, name, password, role, status, site_id, inactivation_requested, basic_salary, ot_percentage, fix_salary, created_at, updated_at) FROM '/csv/users.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy site_task_types(id, site_id, task_name, invoice_price, created_at) FROM '/csv/site_task_types.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy tasks(id, site_id, staff_id, task_date, in_time, out_time, count, ot_type, invoice_price, task_description, target, pay_unit_price, created_at, updated_at) FROM '/csv/tasks.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy attendance(id, site_id, staff_id, attendance_date, in_time, out_time, created_at, updated_at) FROM '/csv/attendance.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy custom_ot_records(id, batch_id, site_no, site_name, staff_id, epf_number, staff_name, date_from, date_to, calculation_type, custom_percentage, total_extra_hours, total_adjusted_hours, ot_rate, total_payment, saved_at, saved_by) FROM '/csv/custom_ot_records.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy payroll_saved_records(id, batch_id, site_no, site_name, staff_id, epf_number, staff_name, date_from, date_to, sum_count, target_count, extra_units, extra_payment, extra_unit_rate, saved_at, saved_by) FROM '/csv/payroll_saved_records.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy cost_varient(id, site_id, factor_key, factor_value, created_at) FROM '/csv/cost_varient.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy profit_amount(id, site_id, site_no, site_name, date_from, date_to, cost_variant_amount, salary_ot_amount, expense_cost, invoice_price, created_at, created_by) FROM '/csv/profit_amount.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy poya_days(id, poya_date, description, created_at) FROM '/csv/poya_days.csv' WITH (FORMAT csv, HEADER true, NULL '');

SET session_replication_role = DEFAULT;

SELECT 'sites' AS tbl, COUNT(*) AS rows FROM sites
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'site_task_types', COUNT(*) FROM site_task_types
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL SELECT 'attendance', COUNT(*) FROM attendance
UNION ALL SELECT 'custom_ot_records', COUNT(*) FROM custom_ot_records
UNION ALL SELECT 'payroll_saved_records', COUNT(*) FROM payroll_saved_records
UNION ALL SELECT 'cost_varient', COUNT(*) FROM cost_varient
UNION ALL SELECT 'profit_amount', COUNT(*) FROM profit_amount
UNION ALL SELECT 'poya_days', COUNT(*) FROM poya_days;
