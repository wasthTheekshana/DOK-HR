// Pure helpers for the revenue report endpoint. Rows arrive with UPPERCASE
// keys (dbUtils uppercases Postgres columns to match Oracle behaviour);
// the API responds with lowercase keys.

export interface RevenueLineRow {
    SITE_ID: number | string;
    SITE_NO: string | null;
    SITE_NAME: string | null;
    TASK_NAME: string | null;
    TOTAL_COUNT: number | string | null;
    UNIT_PRICE: number | string | null;
}

export interface RevenueLine {
    site_id: number;
    site_no: string;
    site_name: string;
    task_name: string;
    total_count: number;
    unit_price: number;
    line_total: number;
}

export interface RevenueSummaryRow {
    site_id: number;
    site_name: string;
    total_revenue: number;
}

export function parseCsvIds(raw: unknown): number[] | null {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    return String(raw)
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => Number.isInteger(n) && n > 0);
}

export function parseCsvNames(raw: unknown): string[] | null {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    return String(raw)
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(s => s.length > 0);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateDateRange(dateFrom: unknown, dateTo: unknown): string | null {
    if (!dateFrom || !dateTo) return 'date_from and date_to are required';
    const from = String(dateFrom);
    const to = String(dateTo);
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return 'dates must be in yyyy-MM-dd format';
    if (from > to) return 'date_from must be on or before date_to';
    return null;
}

export function buildRevenueReport(rows: RevenueLineRow[]): {
    lines: RevenueLine[];
    summary: RevenueSummaryRow[];
    grand_total: number;
} {
    const lines: RevenueLine[] = rows.map(r => {
        const total_count = Number(r.TOTAL_COUNT) || 0;
        const unit_price = Number(r.UNIT_PRICE) || 0;
        return {
            site_id:    Number(r.SITE_ID) || 0,
            site_no:    String(r.SITE_NO ?? ''),
            site_name:  String(r.SITE_NAME ?? ''),
            task_name:  String(r.TASK_NAME ?? ''),
            total_count,
            unit_price,
            line_total: total_count * unit_price,
        };
    });

    const bySite = new Map<number, RevenueSummaryRow>();
    for (const line of lines) {
        const existing = bySite.get(line.site_id);
        if (existing) {
            existing.total_revenue += line.line_total;
        } else {
            bySite.set(line.site_id, {
                site_id: line.site_id,
                site_name: line.site_name,
                total_revenue: line.line_total,
            });
        }
    }
    const summary = Array.from(bySite.values());
    const grand_total = summary.reduce((sum, s) => sum + s.total_revenue, 0);

    return { lines, summary, grand_total };
}
