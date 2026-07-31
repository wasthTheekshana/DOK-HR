/// <reference types="jest" />
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';

// Mock authMiddleware BEFORE importing routes
jest.mock('../middleware/authMiddleware', () => ({
    authenticateToken: (req: Request, res: Response, next: NextFunction) => next(),
    requireRole: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        if (user && roles.includes(user.role)) {
            next();
        } else {
            res.status(403).json({ message: 'Forbidden' });
        }
    }
}));

// Mock dbUtils
jest.mock('../db/dbUtils', () => ({
    execute: jest.fn()
}));

// Import items after mocks
import userRoutes from '../routes/userRoutes';
import { execute } from '../db/dbUtils';

const mockExecute = execute as jest.Mock;

const app = express();
app.use(express.json());

// Middleware to inject test user
app.use((req: Request, res: Response, next: NextFunction) => {
    if ((global as any).testUser) {
        (req as any).user = (global as any).testUser;
    }
    next();
});

app.use('/api/users', userRoutes);

describe('User Access Control', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = undefined;
    });

    test('Staff users can access /api/users and see users from their site', async () => {
        (global as any).testUser = { id: 1, role: 'staff', site_id: 101 };

        mockExecute.mockResolvedValue({
            rows: [
                { ID: 2, NAME: 'Colleague', SITE_ID: 101 }
            ]
        });

        const res = await request(app).get('/api/users');

        expect(res.status).toBe(200);
        // Verify allow staff
        expect(res.body).toHaveLength(1);

        // Verify site_id filtering parameter was passed
        const calls = mockExecute.mock.calls;
        const lastCall = calls[0];
        const sql = lastCall[0];
        const params = lastCall[1];

        expect(sql).toContain('AND site_id = :site_id_filter');
        expect(params).toHaveProperty('site_id_filter', 101);
    });

    test('Staff users cannot see users without a site_id', async () => {
        (global as any).testUser = { id: 2, role: 'staff' }; // No site_id

        const res = await request(app).get('/api/users');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
        expect(mockExecute).not.toHaveBeenCalled();
    });

    test('Admins can access /api/users without site restriction', async () => {
        (global as any).testUser = { id: 3, role: 'admin' };

        mockExecute.mockResolvedValue({
            rows: [
                { ID: 1, NAME: 'User 1', SITE_ID: 101 },
                { ID: 2, NAME: 'User 2', SITE_ID: 102 }
            ]
        });

        const res = await request(app).get('/api/users');

        expect(res.status).toBe(200);

        const calls = mockExecute.mock.calls;
        const lastCall = calls[0];
        const sql = lastCall[0];

        expect(sql).not.toContain('AND site_id = :site_id_filter');
    });
});

describe('Supervisor site access includes temp/permanent assignments', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = undefined;
    });

    test('sees users from a site they are only temp-assigned to, not just their managed site', async () => {
        (global as any).testUser = { id: 5, role: 'supervisor' };
        mockExecute
            .mockResolvedValueOnce({ rows: [{ ID: 10 }] })        // sites they manage
            .mockResolvedValueOnce({ rows: [{ SITE_ID: 20 }] })   // active temp/permanent assignment
            .mockResolvedValueOnce({ rows: [{ ID: 99, NAME: 'Helper', SITE_ID: 20 }] }); // main query

        const res = await request(app).get('/api/users?site=20');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].SITE_ID).toBe(20);

        const mainQueryCall = mockExecute.mock.calls[2];
        expect(mainQueryCall[0]).toContain('site_id IN');
        expect(mainQueryCall[1]).toMatchObject({ sid0: 10, sid1: 20 });
    });

    test('returns an empty list when the supervisor has no managed or assigned sites', async () => {
        (global as any).testUser = { id: 6, role: 'supervisor' };
        mockExecute
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get('/api/users');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});
