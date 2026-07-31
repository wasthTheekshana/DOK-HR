/// <reference types="jest" />
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';

jest.mock('../middleware/authMiddleware', () => ({
    authenticateToken: (req: Request, res: Response, next: NextFunction) => next(),
    requireRole: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        if (user && roles.includes(user.role)) next();
        else res.status(403).json({ message: 'Forbidden' });
    }
}));

jest.mock('../db/dbUtils', () => ({
    execute: jest.fn(),
}));

import taskRoutes from '../routes/taskRoutes';
import { execute } from '../db/dbUtils';

const mockExecute = execute as jest.Mock;

const app = express();
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
    if ((global as any).testUser) (req as any).user = (global as any).testUser;
    next();
});
app.use('/api/tasks', taskRoutes);

// getSupervisorAccessibleSiteIds always issues 2 queries (managed sites, then active
// temp/permanent assignments) before the endpoint's own main query.
const mockAccessibleSites = (managedSiteIds: number[], assignedSiteIds: number[]) => {
    mockExecute
        .mockResolvedValueOnce({ rows: managedSiteIds.map(id => ({ ID: id })) })
        .mockResolvedValueOnce({ rows: assignedSiteIds.map(id => ({ SITE_ID: id })) });
};

describe('getTasks: supervisor site access includes temp/permanent assignments', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 5, role: 'supervisor' };
    });

    test('includes tasks from a site the supervisor is only temp-assigned to', async () => {
        mockAccessibleSites([10], [20]);
        mockExecute.mockResolvedValueOnce({ rows: [{ ID: 1, SITE_ID: 20 }] });

        const res = await request(app).get('/api/tasks?site_no=SITE20');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        const mainQueryCall = mockExecute.mock.calls[2];
        expect(mainQueryCall[0]).toContain('s.id IN');
        expect(mainQueryCall[1]).toMatchObject({ ssid0: 10, ssid1: 20 });
    });

    test('returns an empty list when the supervisor has no managed or assigned sites', async () => {
        mockAccessibleSites([], []);

        const res = await request(app).get('/api/tasks');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

describe('getDailyCountReport: supervisor site access includes temp/permanent assignments', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 5, role: 'supervisor' };
    });

    test('includes counts from a site the supervisor is only temp-assigned to', async () => {
        mockAccessibleSites([10], [20]);
        mockExecute.mockResolvedValueOnce({ rows: [{ SITE_NO: 'SITE20' }] });

        const res = await request(app).get('/api/tasks/summary?date=2026-07-30');

        expect(res.status).toBe(200);
        const mainQueryCall = mockExecute.mock.calls[2];
        expect(mainQueryCall[0]).toContain('s.id IN');
        expect(mainQueryCall[1]).toMatchObject({ ssid0: 10, ssid1: 20 });
    });
});

describe('getTaskSummary: supervisor site access includes temp/permanent assignments', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 5, role: 'supervisor' };
    });

    test('includes tasks from a site the supervisor is only temp-assigned to', async () => {
        mockAccessibleSites([10], [20]);
        mockExecute.mockResolvedValueOnce({ rows: [{ SITE_NO: 'SITE20', SITE_NAME: 'Site 20', STAFF_ID: 1, COUNT: 5 }] });

        const res = await request(app).get('/api/tasks/daily-summary?date=2026-07-30');

        expect(res.status).toBe(200);
        const mainQueryCall = mockExecute.mock.calls[2];
        expect(mainQueryCall[0]).toContain('s.id IN');
        expect(mainQueryCall[1]).toMatchObject({ ssid0: 10, ssid1: 20 });
    });
});
