import { execute } from '../db/dbUtils';
import { initializeDb } from '../db/config';
import oracledb from 'oracledb';
import dotenv from 'dotenv';

dotenv.config();

async function debugDates() {
    await initializeDb();
    try {
        const result = await execute<any>(`
            SELECT id, task_date, TO_CHAR(task_date, 'YYYY-MM-DD HH24:MI:SS') as formatted_date 
            FROM tasks 
            ORDER BY task_date DESC 
            FETCH FIRST 5 ROWS ONLY
        `);
        console.log('Recent Tasks:', result.rows);
    } catch (err) {
        console.error('Error fetching dates:', err);
    } finally {
        await oracledb.getPool().close(10);
    }
}

debugDates();
