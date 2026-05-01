-- WARNING: Run ONLY after confirming all data is in PostgreSQL
-- DROP in reverse FK order
DROP TABLE temporary_assignments  CASCADE CONSTRAINTS PURGE;
DROP TABLE profit_amount          CASCADE CONSTRAINTS PURGE;
DROP TABLE cost_varient           CASCADE CONSTRAINTS PURGE;
DROP TABLE payroll_saved_records  CASCADE CONSTRAINTS PURGE;
DROP TABLE custom_ot_records      CASCADE CONSTRAINTS PURGE;
DROP TABLE poya_days              CASCADE CONSTRAINTS PURGE;
DROP TABLE attendance             CASCADE CONSTRAINTS PURGE;
DROP TABLE tasks                  CASCADE CONSTRAINTS PURGE;
DROP TABLE site_task_types        CASCADE CONSTRAINTS PURGE;
DROP TABLE users                  CASCADE CONSTRAINTS PURGE;
DROP TABLE sites                  CASCADE CONSTRAINTS PURGE;

-- Verify: should return no rows
SELECT table_name FROM user_tables
WHERE table_name IN ('SITES','USERS','SITE_TASK_TYPES','TASKS','ATTENDANCE',
    'POYA_DAYS','CUSTOM_OT_RECORDS','PAYROLL_SAVED_RECORDS','COST_VARIENT','PROFIT_AMOUNT','TEMPORARY_ASSIGNMENTS')
ORDER BY table_name;
