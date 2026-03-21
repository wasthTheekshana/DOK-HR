import oracledb from 'oracledb';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
    user: process.env.DB_USER || 'system',
    password: process.env.DB_PASSWORD || 'your_password',
    connectString: process.env.DB_CONNECT_STRING || 'localhost:1521/XE',
};

export async function initializeDb() {
    try {
        await oracledb.createPool({
            user: dbConfig.user,
            password: dbConfig.password,
            connectString: dbConfig.connectString,
            poolMin: 2,
            poolMax: 10,
            poolIncrement: 2,
        });
        console.log('Database pool created');
    } catch (err) {
        console.error('Error creating database pool', err);
        process.exit(1);
    }
}

export async function closeDb() {
    try {
        await oracledb.getPool().close(10);
        console.log('Database pool closed');
    } catch (err) {
        console.error('Error closing database pool', err);
    }
}

export function getPool() {
    return oracledb.getPool();
}
