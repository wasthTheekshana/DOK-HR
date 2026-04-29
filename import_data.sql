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
