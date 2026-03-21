import { execute } from '../db/dbUtils';
import { initializeDb } from '../db/config';
import oracledb from 'oracledb';
import dotenv from 'dotenv';

dotenv.config();

async function reproQuery() {
    await initializeDb();
    const date = '2026-02-07';
    console.log(`Testing with date: ${date}`);
    try {
        const query = `
            SELECT t.*, u.name as staff_name, s.site_no, s.name as site_name, s.ot_type as site_ot_type
            FROM tasks t
            JOIN sites s ON t.site_id = s.id
            JOIN users u ON t.staff_id = u.id
            WHERE TRUNC(t.task_date) = TO_DATE(:queryDate, 'YYYY-MM-DD')
            ORDER BY s.name, u.name
        `;
        const result = await execute<any>(query, { queryDate: String(date) });
        console.log(`Rows found: ${result.rows?.length}`);
        if (result.rows && result.rows.length > 0) {
            console.log('First row:', result.rows[0]);
        }
    } catch (err) {
        console.error('Error executing query:', err);
    } finally {
        await oracledb.getPool().close(10);
    }
}

reproQuery();
