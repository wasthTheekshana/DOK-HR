import oracledb from 'oracledb';
import { getPool } from './config';

export async function execute<T>(sql: string, binds: oracledb.BindParameters = [], options: oracledb.ExecuteOptions = {}): Promise<oracledb.Result<T>> {
    let connection;
    try {
        connection = await getPool().getConnection();
        const result = await connection.execute<T>(sql, binds, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            autoCommit: true,
            ...options
        });
        return result;
    } catch (err) {
        console.error('Database execute error:', err);
        throw err;
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Error closing connection:', err);
            }
        }
    }
}
