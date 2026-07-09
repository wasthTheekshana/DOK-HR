/// <reference types="jest" />
import {
    parseCsvIds,
    parseCsvNames,
    validateDateRange,
    buildRevenueReport,
    RevenueLineRow,
} from '../utils/revenueReportUtils';

describe('parseCsvIds', () => {
    it('returns null when the param is absent or blank', () => {
        expect(parseCsvIds(undefined)).toBeNull();
        expect(parseCsvIds(null)).toBeNull();
        expect(parseCsvIds('')).toBeNull();
        expect(parseCsvIds('   ')).toBeNull();
    });

    it('parses comma-separated integers, trimming whitespace', () => {
        expect(parseCsvIds('1,2,3')).toEqual([1, 2, 3]);
        expect(parseCsvIds(' 4 , 5 ')).toEqual([4, 5]);
    });

    it('drops non-integer and non-positive entries', () => {
        expect(parseCsvIds('1,abc,2.5,-3,0,7')).toEqual([1, 7]);
        expect(parseCsvIds('abc')).toEqual([]);
    });
});

describe('parseCsvNames', () => {
    it('returns null when the param is absent or blank', () => {
        expect(parseCsvNames(undefined)).toBeNull();
        expect(parseCsvNames('')).toBeNull();
    });

    it('trims and lowercases names, dropping empty entries', () => {
        expect(parseCsvNames(' Scanning , Data Entry ,,')).toEqual(['scanning', 'data entry']);
    });
});

describe('validateDateRange', () => {
    it('requires both dates', () => {
        expect(validateDateRange(undefined, '2026-07-09')).toBe('date_from and date_to are required');
        expect(validateDateRange('2026-07-01', undefined)).toBe('date_from and date_to are required');
    });

    it('rejects malformed dates', () => {
        expect(validateDateRange('07/01/2026', '2026-07-09')).toBe('dates must be in yyyy-MM-dd format');
        expect(validateDateRange('2026-07-01', '2026-7-9')).toBe('dates must be in yyyy-MM-dd format');
    });

    it('rejects date_from after date_to', () => {
        expect(validateDateRange('2026-07-10', '2026-07-09')).toBe('date_from must be on or before date_to');
    });

    it('accepts a valid range and a single-day range', () => {
        expect(validateDateRange('2026-07-01', '2026-07-09')).toBeNull();
        expect(validateDateRange('2026-07-09', '2026-07-09')).toBeNull();
    });
});

describe('buildRevenueReport', () => {
    const rows: RevenueLineRow[] = [
        { SITE_ID: 1, SITE_NO: 'S001', SITE_NAME: 'Coseway',  TASK_NAME: 'Scanning',   TOTAL_COUNT: '3962', UNIT_PRICE: '2.4' },
        { SITE_ID: 2, SITE_NO: 'S002', SITE_NAME: 'PLC',      TASK_NAME: 'Scanning',   TOTAL_COUNT: 0,      UNIT_PRICE: 2 },
        { SITE_ID: 2, SITE_NO: 'S002', SITE_NAME: 'PLC',      TASK_NAME: 'Data Entry', TOTAL_COUNT: 10,     UNIT_PRICE: null },
    ];

    it('maps rows to lowercase lines with line_total = count * price', () => {
        const { lines } = buildRevenueReport(rows);
        expect(lines).toEqual([
            { site_id: 1, site_no: 'S001', site_name: 'Coseway', task_name: 'Scanning',   total_count: 3962, unit_price: 2.4, line_total: 9508.8 },
            { site_id: 2, site_no: 'S002', site_name: 'PLC',     task_name: 'Scanning',   total_count: 0,    unit_price: 2,   line_total: 0 },
            { site_id: 2, site_no: 'S002', site_name: 'PLC',     task_name: 'Data Entry', total_count: 10,   unit_price: 0,   line_total: 0 },
        ]);
    });

    it('groups summary per site preserving line order', () => {
        const { summary } = buildRevenueReport(rows);
        expect(summary).toEqual([
            { site_id: 1, site_name: 'Coseway', total_revenue: 9508.8 },
            { site_id: 2, site_name: 'PLC',     total_revenue: 0 },
        ]);
    });

    it('computes grand_total as the sum of all line totals', () => {
        expect(buildRevenueReport(rows).grand_total).toBe(9508.8);
    });

    it('returns empty structures for no rows', () => {
        expect(buildRevenueReport([])).toEqual({ lines: [], summary: [], grand_total: 0 });
    });
});
