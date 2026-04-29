import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

let pool: Pool;

export async function initializeDb() {
    pool = new Pool({
        host:     process.env.DB_HOST     || 'localhost',
        port:     Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME     || 'dok_hr',
        user:     process.env.DB_USER     || 'dokcrm',
        password: process.env.DB_PASSWORD || '',
        max:      10,
        idleTimeoutMillis: 30000,
    });

    try {
        const client = await pool.connect();
        client.release();
        console.log('Database pool created');
    } catch (err) {
        console.error('Error creating database pool', err);
        process.exit(1);
    }
}

export async function closeDb() {
    if (pool) {
        await pool.end();
        console.log('Database pool closed');
    }
}

export function getPool(): Pool {
    return pool;
}
