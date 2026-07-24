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

import kpiRoutes from '../routes/kpiRoutes';
import { execute } from '../db/dbUtils';

const mockExecute = execute as jest.Mock;

const app = express();
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
    if ((global as any).testUser) (req as any).user = (global as any).testUser;
    next();
});
app.use('/api/kpi', kpiRoutes);

describe('KPI access control', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = undefined;
    });

    test('admin cannot access KPI routes (PM-exclusive)', async () => {
        (global as any).testUser = { id: 1, role: 'admin' };
        const res = await request(app).get('/api/kpi?site_id=1&period=2026-07');
        expect(res.status).toBe(403);
    });

    test('supervisor cannot access KPI routes', async () => {
        (global as any).testUser = { id: 2, role: 'supervisor' };
        const res = await request(app).get('/api/kpi?site_id=1&period=2026-07');
        expect(res.status).toBe(403);
    });
});

describe('getKpiScores', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 1, role: 'project_manager' };
    });

    test('computes auto_score from attendance and task data, merges saved pm_score', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ ID: 10, NAME: 'Staff A' }] }) // active staff at site
            .mockResolvedValueOnce({ rows: [{ STAFF_ID: 10, ATTENDANCE_DAYS: 31 }] }) // attendance counts (July has 31 days)
            .mockResolvedValueOnce({ rows: [{ STAFF_ID: 10, TOTAL_COUNT: 100, TOTAL_TARGET: 100 }] }) // task sums
            .mockResolvedValueOnce({ rows: [] }); // saved kpi rows

        const res = await request(app).get('/api/kpi?site_id=1&period=2026-07');

        expect(res.status).toBe(200);
        expect(res.body[0].STAFF_ID).toBe(10);
        expect(res.body[0].AUTO_SCORE).toBe(100); // 100% attendance, 100% task completion
        expect(res.body[0].PM_SCORE).toBeNull();
    });
});

describe('saveKpiScore', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 1, role: 'project_manager' };
    });

    test('upserts pm_score and comments', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ ATTENDANCE_DAYS: 20 }] })
            .mockResolvedValueOnce({ rows: [{ TOTAL_COUNT: 50, TOTAL_TARGET: 100 }] })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(app).post('/api/kpi').send({
            staff_id: 10, site_id: 1, period: '2026-07', pm_score: 88, comments: 'Solid month',
        });

        expect(res.status).toBe(200);
        const lastCall = mockExecute.mock.calls[mockExecute.mock.calls.length - 1];
        expect(lastCall[0]).toContain('ON CONFLICT');
    });
});
