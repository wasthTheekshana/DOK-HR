/// <reference types="jest" />
import { describe, test, expect } from '@jest/globals';
import { createUserSchema, updateUserSchema } from './validationSchemas';

describe('role enum includes project_manager', () => {
    test('createUserSchema accepts project_manager', () => {
        const result = createUserSchema.safeParse({
            epf_number: 'EPF001',
            name: 'Jane PM',
            password: 'secret123',
            role: 'project_manager',
        });
        expect(result.success).toBe(true);
    });

    test('updateUserSchema accepts project_manager', () => {
        const result = updateUserSchema.safeParse({ role: 'project_manager' });
        expect(result.success).toBe(true);
    });
});

describe('role enum includes hr', () => {
    test('createUserSchema accepts hr', () => {
        const result = createUserSchema.safeParse({
            epf_number: 'EPF002',
            name: 'Jane HR',
            password: 'secret123',
            role: 'hr',
        });
        expect(result.success).toBe(true);
    });

    test('updateUserSchema accepts hr', () => {
        const result = updateUserSchema.safeParse({ role: 'hr' });
        expect(result.success).toBe(true);
    });
});
