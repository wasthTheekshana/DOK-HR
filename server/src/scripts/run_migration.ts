import { execute } from '../db/dbUtils';
import { initializeDb, closeDb } from '../db/config';
import fs from 'fs';
import path from 'path';

const runMigration = async () => {
    try {
        await initializeDb();

        const sqlPath = path.join(__dirname, 'migration_site_tasks.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Split by semicolon (rough split, but works for simple statements)
        const statements = sql.split(';').filter(s => s.trim().length > 0);

        for (const statement of statements) {
            console.log('Executing:', statement.substring(0, 50) + '...');
            try {
                await execute(statement);
            } catch (e: any) {
                if (e.message.includes('ORA-00955')) {
                    console.log('Table/Index already exists, skipping.');
                } else {
                    throw e;
                }
            }
        }
        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await closeDb();
    }
};

runMigration();
