/// <reference types="jest" />
import { computeWorkingDays } from '../utils/analyticsUtils';

describe('computeWorkingDays', () => {
    it('returns 22 for a full calendar month (~30 days)', () => {
        expect(computeWorkingDays('2026-04-01', '2026-04-30')).toBe(22);
    });

    it('returns 66 for ~3 months (90 days)', () => {
        expect(computeWorkingDays('2026-01-01', '2026-03-31')).toBe(66);
    });

    it('returns at least 1 for a single day', () => {
        expect(computeWorkingDays('2026-04-23', '2026-04-23')).toBe(1);
    });

    it('returns 132 for exactly 180 days', () => {
        expect(computeWorkingDays('2026-01-01', '2026-06-29')).toBe(132);
    });
});
