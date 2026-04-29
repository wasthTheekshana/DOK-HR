import { getPool } from './config';

// Convert Oracle-style named params (:name) to PostgreSQL positional ($1, $2, …).
// Also handles array params by replacing each :name in order with $1, $2, …
function convertParams(sql: string, params: Record<string, any> | any[]): { text: string; values: any[] } {
    if (Array.isArray(params)) {
        let idx = 0;
        const text = sql.replace(/(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g, () => `$${++idx}`);
        return { text, values: params };
    }

    const values: any[] = [];
    const seen: Record<string, number> = {};
    const text = sql.replace(/(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
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
