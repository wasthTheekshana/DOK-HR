/// <reference types="jest" />
import { describe, test, expect } from '@jest/globals';
import { computeAutoScore, daysInMonth, computeDeadlineRisk, worstRisk } from './kpiUtils';

describe('daysInMonth', () => {
    test('returns 31 for a 31-day month', () => {
        expect(daysInMonth('2026-07')).toBe(31);
    });
    test('returns 28 for February in a non-leap year', () => {
        expect(daysInMonth('2026-02')).toBe(28);
    });
    test('returns 29 for February in a leap year', () => {
        expect(daysInMonth('2028-02')).toBe(29);
    });
});

describe('computeAutoScore', () => {
    test('full attendance, no task target: score equals attendance %', () => {
        const score = computeAutoScore({ attendanceDays: 20, daysInPeriod: 20, taskCount: 0, taskTarget: 0 });
        expect(score).toBe(100);
    });

    test('half attendance, no task target: score equals attendance %', () => {
        const score = computeAutoScore({ attendanceDays: 10, daysInPeriod: 20, taskCount: 0, taskTarget: 0 });
        expect(score).toBe(50);
    });

    test('blends attendance and task completion 50/50 when target present', () => {
        // attendance 100%, task completion 60% -> (100*0.5 + 60*0.5) = 80
        const score = computeAutoScore({ attendanceDays: 20, daysInPeriod: 20, taskCount: 60, taskTarget: 100 });
        expect(score).toBe(80);
    });

    test('caps task completion at 100% even if count exceeds target', () => {
        // attendance 100%, task completion capped at 100% -> (100*0.5 + 100*0.5) = 100
        const score = computeAutoScore({ attendanceDays: 20, daysInPeriod: 20, taskCount: 500, taskTarget: 100 });
        expect(score).toBe(100);
    });

    test('returns 0 when daysInPeriod is 0', () => {
        const score = computeAutoScore({ attendanceDays: 0, daysInPeriod: 0, taskCount: 0, taskTarget: 0 });
        expect(score).toBe(0);
    });
});

describe('computeDeadlineRisk', () => {
    const today = new Date('2026-07-24');

    test('done stage is never at risk', () => {
        expect(computeDeadlineRisk('2026-07-01', true, today)).toBeNull();
    });

    test('no due date is never at risk', () => {
        expect(computeDeadlineRisk(null, false, today)).toBeNull();
    });

    test('overdue, not done -> red', () => {
        expect(computeDeadlineRisk('2026-07-20', false, today)).toBe('red');
    });

    test('due within 7 days, not done -> amber', () => {
        expect(computeDeadlineRisk('2026-07-30', false, today)).toBe('amber');
    });

    test('due more than 7 days away -> not at risk', () => {
        expect(computeDeadlineRisk('2026-08-15', false, today)).toBeNull();
    });

    // pg returns DATE columns as JS Date objects (UTC midnight), not 'YYYY-MM-DD' strings.
    test('accepts a Date object (as returned by pg for DATE columns)', () => {
        expect(computeDeadlineRisk(new Date('2026-07-20T00:00:00.000Z'), false, today)).toBe('red');
        expect(computeDeadlineRisk(new Date('2026-07-30T00:00:00.000Z'), false, today)).toBe('amber');
    });
});

describe('worstRisk', () => {
    test('returns red if any risk is red', () => {
        expect(worstRisk([null, 'amber', 'red'])).toBe('red');
    });
    test('returns amber if no red but an amber exists', () => {
        expect(worstRisk([null, 'amber', null])).toBe('amber');
    });
    test('returns null if all null', () => {
        expect(worstRisk([null, null])).toBeNull();
    });
    test('returns null for an empty list', () => {
        expect(worstRisk([])).toBeNull();
    });
});
