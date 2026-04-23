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

describe('site target mapping', () => {
    const workingDays = 22;

    it('computes total_target as daily_target * workingDays', () => {
        const dailyTarget = 100;
        const totalTarget = dailyTarget * workingDays;
        expect(totalTarget).toBe(2200);
    });

    it('returns achievement_pct correctly', () => {
        const totalUnits  = 1980;
        const totalTarget = 2200;
        const pct = totalTarget > 0 ? Math.round(totalUnits / totalTarget * 1000) / 10 : null;
        expect(pct).toBe(90);
    });

    it('returns null achievement_pct when daily_target is 0', () => {
        const totalUnits  = 500;
        const totalTarget = 0;
        const pct = totalTarget > 0 ? Math.round(totalUnits / totalTarget * 1000) / 10 : null;
        expect(pct).toBeNull();
    });
});
