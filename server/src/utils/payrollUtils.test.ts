
import { describe, test, expect } from '@jest/globals';
import { calculateTimeBasedExtra, calculateTargetBasedExtra, calculateTargetBasedPayment, calculateTimeBasedPayment } from './payrollUtils';

describe('Payroll Calculations', () => {
    describe('Time Based OT', () => {
        const DEFAULT_OUT = '17:00';

        test('should return exact decimal 2.5 for 2h 30m OT', () => {
            // 19:30 - 17:00 = 150m = 2.5h
            expect(calculateTimeBasedExtra('19:30', DEFAULT_OUT)).toBe(2.5);
        });

        test('should return exact decimal 2.4 for 2h 24m OT', () => {
            // 19:24 - 17:00 = 144m = 2.4h
            expect(calculateTimeBasedExtra('19:24', DEFAULT_OUT)).toBe(2.4);
        });

        test('should return exact decimal 2.9 for 2h 54m OT', () => {
            // 19:54 - 17:00 = 174m = 2.9h
            expect(calculateTimeBasedExtra('19:54', DEFAULT_OUT)).toBe(2.9);
        });

        test('should return 0 if out time is before default out', () => {
            expect(calculateTimeBasedExtra('16:00', DEFAULT_OUT)).toBe(0);
        });

        test('should return exact decimal 0.5 for 30m OT', () => {
            // 17:30 - 17:00 = 30m = 0.5h
            expect(calculateTimeBasedExtra('17:30', DEFAULT_OUT)).toBe(0.5);
        });

        test('should calculate payment using floored hours (2.9h pays as 2h)', () => {
            // Basic = 24000, Rate = (24000/240)*1.5 = 150, floor(2.9)=2 → 300
            const result = calculateTimeBasedPayment(2.9, 24000);
            expect(result.payment).toBe(300);
            expect(result.rate).toBe(150);
        });

        test('should calculate payment correctly for whole hours', () => {
            // Basic = 24000, Rate = 150, 2h → 300
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
