/// <reference types="jest" />

// Pure helper — no DB needed
function computeWorkingDays(from: string, to: string): number {
    const msPerDay = 86_400_000;
    const daysInRange = Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay) + 1;
    return Math.max(1, Math.round(daysInRange * 22 / 30));
}

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

    it('returns 132 for ~6 months (180 days)', () => {
        expect(computeWorkingDays('2026-01-01', '2026-06-29')).toBe(132);
    });
});
