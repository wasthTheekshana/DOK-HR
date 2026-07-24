import { initializeDb, closeDb } from '../db/config';
import { execute } from '../db/dbUtils';
import { hashPassword } from '../utils/authUtils';
import fs from 'fs';
import path from 'path';

async function seed() {
    try {
        await initializeDb();
        console.log('Seeding Database...');

        // 1. Drop tables in reverse FK order
        console.log('Cleaning existing schema...');
        const tables = [
            'staff_kpi_scores', 'project_milestones',
            'profit_amount', 'cost_varient', 'payroll_saved_records',
            'custom_ot_records', 'site_task_types', 'attendance',
            'tasks', 'users_assignments', 'sites', 'users',
        ];
        for (const table of tables) {
            try {
                await execute(`DROP TABLE IF EXISTS ${table} CASCADE`);
                console.log(`Dropped table ${table}`);
            } catch (err: any) {
                console.log(`Could not drop ${table}: ${err.message}`);
            }
        }

        // 2. Create Schema
        console.log('Creating schema...');
        const schemaPath = path.join(__dirname, '../db/schema_postgres.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        const statements = schemaSql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
            const cleanStatement = statement.replace(/--.*$/gm, '').trim();
            if (cleanStatement) {
                try {
                    await execute(cleanStatement);
                } catch (err: any) {
                    console.error('Error executing schema statement:', err.message);
                    throw err;
                }
            }
        }
        console.log('Schema created successfully.');

        console.log('Inserting seed data...');

        const password = await hashPassword('password123');

        await execute(
            `INSERT INTO users (epf_number, name, password, role, status) VALUES (:epf_number, :name, :pw, :role, :status)`,
            { epf_number: 'ADMIN001', name: 'System Admin', pw: password, role: 'admin', status: 'active' }
        );
        await execute(
            `INSERT INTO users (epf_number, name, password, role, status) VALUES (:epf_number, :name, :pw, :role, :status)`,
            { epf_number: 'SUP001', name: 'John Supervisor', pw: password, role: 'supervisor', status: 'active' }
        );
        await execute(
            `INSERT INTO users (epf_number, name, password, role, status) VALUES (:epf_number, :name, :pw, :role, :status)`,
            { epf_number: 'EMP001', name: 'Jane Worker', pw: password, role: 'staff', status: 'active' }
        );
        await execute(
            `INSERT INTO users (epf_number, name, password, role, status) VALUES (:epf_number, :name, :pw, :role, :status)`,
            { epf_number: 'EMP002', name: 'Bob Builder', pw: password, role: 'staff', status: 'active' }
        );

        const usersRes = await execute<any>(`SELECT id, role, epf_number FROM users`);
        const sup = usersRes.rows?.find((u: any) => u.ROLE === 'supervisor');
        const staff1 = usersRes.rows?.find((u: any) => u.EPF_NUMBER === 'EMP001');
        const staff2 = usersRes.rows?.find((u: any) => u.EPF_NUMBER === 'EMP002');

        await execute(
            `INSERT INTO sites (site_no, name, supervisor_id, task_invoice_price, daily_target, ot_type) VALUES (:site_no, :name, :supId, :price, :target, :ot_type)`,
            { site_no: 'SITE-001', name: 'Alpha Warehouse', supId: sup.ID, price: 1000, target: 10, ot_type: 'time_based' }
        );

        const sitesRes = await execute<any>(`SELECT id FROM sites WHERE site_no = 'SITE-001'`);
        const siteId = sitesRes.rows?.[0].ID;

        await execute(`UPDATE users SET site_id = :siteId WHERE role = 'supervisor' OR role = 'staff'`, { siteId });

        await execute(
            `INSERT INTO tasks (site_id, staff_id, task_description, invoice_price, ot_type, pay_unit_price, task_date, in_time, out_time)
             VALUES (:siteId, :staffId, :desc, :price, :ot_type, :unit, :task_date, :in_time, :out_time)`,
            { siteId, staffId: staff1.ID, desc: 'Regular Shift', price: 1000, ot_type: 'time_based', unit: 100, task_date: '2026-01-10', in_time: '08:30', out_time: '19:30' }
        );

        await execute(
            `INSERT INTO tasks (site_id, staff_id, task_description, invoice_price, ot_type, target, task_date, count)
             VALUES (:siteId, :staffId, :desc, :price, :ot_type, :target, :task_date, :count)`,
            { siteId, staffId: staff2.ID, desc: 'Assembly', price: 200, ot_type: 'target_based', target: 10, task_date: '2026-01-12', count: 15 }
        );

        console.log('Seeding complete!');
        console.log('');
        console.log('Test credentials:');
        console.log('  EPF Number: ADMIN001  |  Password: password123');
        console.log('  EPF Number: SUP001    |  Password: password123');
        console.log('  EPF Number: EMP001    |  Password: password123');

    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    } finally {
        await closeDb();
    }
}

seed();
