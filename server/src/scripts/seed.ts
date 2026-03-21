import { initializeDb, closeDb } from '../db/config';
import { execute } from '../db/dbUtils';
import { hashPassword } from '../utils/authUtils';
import fs from 'fs';
import path from 'path';

async function seed() {
    try {
        await initializeDb();
        console.log('Seeding Database...');

        // 1. Clean up (Drop Tables)
        console.log('Cleaning existing schema...');
        const tables = [
            'profit_amount', 'cost_varient', 'payroll_saved_records',
            'custom_ot_records', 'site_task_types', 'attendance',
            'tasks', 'sites', 'users',
        ];
        for (const table of tables) {
            try {
                await execute(`DROP TABLE ${table} CASCADE CONSTRAINTS`);
                console.log(`Dropped table ${table}`);
            } catch (err: any) {
                if (err.errorNum === 942) {
                    console.log(`Table ${table} does not exist (skipping drop)`);
                } else {
                    throw err;
                }
            }
        }

        // 2. Create Schema
        console.log('Creating schema...');
        const schemaPath = path.join(__dirname, '../db/schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        // Split by semicolon and filter empty lines
        // Note: This simple split might break if semicolons are in strings, but for this DDL it's fine.
        const statements = schemaSql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            try {
                // Remove comments
                const cleanParams = statement.replace(/--.*$/gm, '');
                if (cleanParams.trim()) {
                    await execute(cleanParams);
                }
            } catch (err: any) {
                console.error('Error executing schema statement:', err); // statement
                throw err;
            }
        }
        console.log('Schema created successfully.');

        console.log('Inserting seed data...');

        // Create Users (Admin, Supervisor, Staff)
        const password = await hashPassword('password123');

        // Admin
        await execute(
            `INSERT INTO users (epf_number, name, password, role, status) VALUES ('ADMIN001', 'System Admin', :pw, 'admin', 'active')`,
            { pw: password }
        );
        // Supervisor
        await execute(
            `INSERT INTO users (epf_number, name, password, role, status) VALUES ('SUP001', 'John Supervisor', :pw, 'supervisor', 'active')`,
            { pw: password }
        );
        // Staff
        await execute(
            `INSERT INTO users (epf_number, name, password, role, status) VALUES ('EMP001', 'Jane Worker', :pw, 'staff', 'active')`,
            { pw: password }
        );
        await execute(
            `INSERT INTO users (epf_number, name, password, role, status) VALUES ('EMP002', 'Bob Builder', :pw, 'staff', 'active')`,
            { pw: password }
        );

        // Get User IDs
        const usersRes = await execute<any>(`SELECT id, role, epf_number FROM users`);
        const admin = usersRes.rows?.find((u: any) => u.ROLE === 'admin');
        const sup = usersRes.rows?.find((u: any) => u.ROLE === 'supervisor');
        const staff1 = usersRes.rows?.find((u: any) => u.EPF_NUMBER === 'EMP001');
        const staff2 = usersRes.rows?.find((u: any) => u.EPF_NUMBER === 'EMP002');

        // Create Site
        await execute(
            `INSERT INTO sites (site_no, name, supervisor_id, task_invoice_price, daily_target, ot_type) VALUES ('SITE-001', 'Alpha Warehouse', :supId, 1000, 10, 'time_based')`,
            { supId: sup.ID }
        );

        const sitesRes = await execute<any>(`SELECT id FROM sites WHERE site_no = 'SITE-001'`);
        const siteId = sitesRes.rows?.[0].ID;

        // Update Users with Site
        await execute(`UPDATE users SET site_id = :siteId WHERE role = 'supervisor' OR role = 'staff'`, { siteId });

        // Create Tasks (Payroll Data)
        // 1. Time Based Task
        await execute(
            `INSERT INTO tasks (site_id, staff_id, task_description, invoice_price, ot_type, pay_unit_price, task_date, in_time, out_time) 
         VALUES (:siteId, :staffId, 'Regular Shift', 1000, 'time_based', 100, TO_DATE('2026-01-10', 'YYYY-MM-DD'), '08:30', '19:30')`,
            { siteId, staffId: staff1.ID }
        );

        // 2. Target Based Task
        await execute(
            `INSERT INTO tasks (site_id, staff_id, task_description, invoice_price, ot_type, target, task_date, count) 
         VALUES (:siteId, :staffId, 'Assembly', 200, 'target_based', 10, TO_DATE('2026-01-12', 'YYYY-MM-DD'), 15)`,
            { siteId, staffId: staff2.ID }
        );

        console.log('Seeding complete!');

    } catch (err) {
        console.error('Seeding error:', err);
    } finally {
        await closeDb();
    }
}

seed();
