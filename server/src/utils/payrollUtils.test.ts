
import { describe, test, expect } from '@jest/globals';
import { calculateTimeBasedExtra, calculateTargetBasedExtra, calculateTargetBasedPayment, calculateTimeBasedPayment } from './payrollUtils';

describe('Payroll Calculations', () => {
    describe('Time Based OT', () => {
        const DEFAULT_OUT = '17:00';

        test('should floor 2.5 hours to 2', () => {
            // 19:30 - 17:00 = 2h 30m -> floor to 2
            expect(calculateTimeBasedExtra('19:30', DEFAULT_OUT)).toBe(2);
        });

        test('should floor 2.4 hours to 2', () => {
            // 19:24 - 17:00 = 2h 24m -> floor to 2
            expect(calculateTimeBasedExtra('19:24', DEFAULT_OUT)).toBe(2);
        });

        test('should floor 2.9 hours to 2', () => {
            // 19:54 - 17:00 = 2h 54m -> floor to 2
            expect(calculateTimeBasedExtra('19:54', DEFAULT_OUT)).toBe(2);
        });

        test('should return 0 if out time is before default out', () => {
            expect(calculateTimeBasedExtra('16:00', DEFAULT_OUT)).toBe(0);
        });

        test('should floor 0.5 hours to 0', () => {
            // 17:30 - 17:00 = 30m -> floor to 0
            expect(calculateTimeBasedExtra('17:30', DEFAULT_OUT)).toBe(0);
        });

        test('should calculate payment correctly based on basic salary', () => {
            // Basic = 24000
            // Rate = (24000 / 240) * 1.5 = 100 * 1.5 = 150
            // Extra Hours = 2
            // Expected = 300
            const result = calculateTimeBasedPayment(2, 24000);
            expect(result.payment).toBe(300);
            expect(result.rate).toBe(150);
        });

        test('should return 0 if basic salary is missing', () => {
            const result = calculateTimeBasedPayment(2, 0);
            expect(result.payment).toBe(0);
            expect(result.rate).toBe(0);
        });
    });

    describe('Target Based OT', () => {
        const TARGET = 10;
        const DAYS = 22; // Target for period = 220

        test('should return 0 if below target', () => {
            expect(calculateTargetBasedExtra(200, TARGET * DAYS)).toBe(0);
        });

        test('should return extra units if above target', () => {
            // 230 - 220 = 10
            expect(calculateTargetBasedExtra(230, TARGET * DAYS)).toBe(10);
        });

        test('should calculate payment correctly', () => {
            const extraUnits = 10;
            const rate = 0.5;
            expect(calculateTargetBasedPayment(extraUnits, rate)).toBe(5);
        });
    });
});
