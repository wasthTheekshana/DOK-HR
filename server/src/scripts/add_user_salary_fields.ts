
import { execute } from '../db/dbUtils';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

const addSalaryFields = async () => {
    try {
        console.log('Adding basic_salary and ot_percentage columns to users table...');

        try {
            await execute(`ALTER TABLE users ADD basic_salary NUMBER(12,2) DEFAULT 0`);
            console.log('Added basic_salary column.');
        } catch (err: any) {
            if (err.message && err.message.includes('ORA-01430')) {
                console.log('basic_salary column already exists.');
            } else {
                console.error('Error adding basic_salary column:', err);
            }
        }

        try {
            await execute(`ALTER TABLE users ADD ot_percentage NUMBER(5,2) DEFAULT 0`);
            console.log('Added ot_percentage column.');
        } catch (err: any) {
            if (err.message && err.message.includes('ORA-01430')) {
                console.log('ot_percentage column already exists.');
            } else {
                console.error('Error adding ot_percentage column:', err);
            }
        }

        console.log('Migration completed.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

addSalaryFields();
