import { getPool } from './config';

// Regex matches either a single-quoted SQL string literal (group 1) or a :name param (group 2).
// Literals are returned unchanged so colons inside format strings like 'HH24:MI' are never replaced.
const PARAM_RE = /('(?:[^']|'')*')|(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g;

function convertParams(sql: string, params: Record<string, any> | any[]): { text: string; values: any[] } {
    if (Array.isArray(params)) {
        let idx = 0;
        const text = sql.replace(PARAM_RE, (match, literal) => literal ? match : `$${++idx}`);
        return { text, values: params };
    }

    const values: any[] = [];
    const seen: Record<string, number> = {};
    const text = sql.replace(PARAM_RE, (match, literal, name) => {
        if (literal) return match;
        if (!(name in seen)) {
            seen[name] = values.length + 1;
            values.push(params[name] ?? null);
        }
        return `$${seen[name]}`;
    });
    return { text, values };
}

// Return column names in UPPERCASE to match Oracle's OUT_FORMAT_OBJECT behaviour.
// All existing controller code accesses row.ID, row.SITE_NO etc. — this preserves that.
function uppercaseRows<T>(rows: any[]): T[] {
    return rows.map(row => {
        const upper: Record<string, any> = {};
        for (const key of Object.keys(row)) {
            upper[key.toUpperCase()] = row[key];
        }
        return upper as T;
    });
}

export async function execute<T = any>(
    sql: string,
    params: Record<string, any> | any[] = []
): Promise<{ rows: T[] }> {
    const pool = getPool();
    const client = await pool.connect();
    try {
        const { text, values } = convertParams(sql, params);
        const result = await client.query(text, values.length > 0 ? values : undefined);
        return { rows: uppercaseRows<T>(result.rows) };
    } catch (err) {
        console.error('Database execute error:', err);
        throw err;
    } finally {
        client.release();
    }
}

export type TxExecutor = <T = any>(sql: string, params?: Record<string, any> | any[]) => Promise<{ rows: T[] }>;

// Runs all queries issued via the provided executor on ONE connection inside a
// transaction. Any throw rolls everything back — use for multi-statement writes
// (e.g. delete + re-insert) that must not be left half-applied.
export async function withTransaction<R>(fn: (exec: TxExecutor) => Promise<R>): Promise<R> {
    const pool = getPool();
    const client = await pool.connect();
    const exec: TxExecutor = async <T = any>(sql: string, params: Record<string, any> | any[] = []) => {
        const { text, values } = convertParams(sql, params);
        const result = await client.query(text, values.length > 0 ? values : undefined);
        return { rows: uppercaseRows<T>(result.rows) };
    };
    try {
        await client.query('BEGIN');
        const out = await fn(exec);
        await client.query('COMMIT');
        return out;
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* connection may be gone */ }
        console.error('Database transaction error:', err);
        throw err;
    } finally {
        client.release();
    }
}
