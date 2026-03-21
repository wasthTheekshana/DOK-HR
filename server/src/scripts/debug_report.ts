import { execute } from '../db/dbUtils';
import { initializeDb, closeDb } from '../db/config';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the server directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const runDebug = async () => {
    await initializeDb();
    const date = '2026-02-08';
    const site_id_str = '21';
    const site_id_num = 21;

    console.log('--- Debugging Task Summary Query ---');

    const queryBase = `
        SELECT t.id, t.site_id, t.task_date, s.name as site_name
        FROM tasks t
        JOIN sites s ON t.site_id = s.id
        WHERE TRUNC(t.task_date) = TO_DATE(:queryDate, 'YYYY-MM-DD')
    `;

    // Test 1: No filter
    try {
        console.log('\n1. Test All Sites (No Filter):');
        const res1 = await execute<any>(queryBase, { queryDate: date });
        console.log(`Rows found: ${res1.rows.length}`);
        if (res1.rows.length > 0) {
            console.log('Sample Row:', res1.rows[0]);
            const siteIds = res1.rows.map((r: any) => r.SITE_ID);
            console.log('Site IDs present:', [...new Set(siteIds)]);
        }
    } catch (e) {
        console.error('Test 1 Failed', e);
    }

    // Test 2: Filter by String ID
    try {
        console.log(`\n2. Test Filter by String ID ('${site_id_str}'):`);
        const query2 = queryBase + ` AND t.site_id = :site_id`;
        const res2 = await execute<any>(query2, { queryDate: date, site_id: site_id_str });
        console.log(`Rows found: ${res2.rows.length}`);
    } catch (e) {
        console.error('Test 2 Failed', e);
    }

    // Test 3: Filter by Number ID
    try {
        console.log(`\n3. Test Filter by Number ID (${site_id_num}):`);
        const query3 = queryBase + ` AND t.site_id = :site_id`;
        const res3 = await execute<any>(query3, { queryDate: date, site_id: site_id_num });
        console.log(`Rows found: ${res3.rows.length}`);
    } catch (e) {
        console.error('Test 3 Failed', e);
    }

    await closeDb();
    process.exit();
};

runDebug();
