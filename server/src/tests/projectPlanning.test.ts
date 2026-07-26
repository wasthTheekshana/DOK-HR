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
    withTransaction: jest.fn(),
}));

import projectPlanningRoutes from '../routes/projectPlanningRoutes';
import { execute } from '../db/dbUtils';

const mockExecute = execute as jest.Mock;

const app = express();
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
    if ((global as any).testUser) (req as any).user = (global as any).testUser;
    next();
});
app.use('/api/project-planning', projectPlanningRoutes);

describe('Project Planning access control', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = undefined;
    });

    test('project_manager can list the sites portfolio', async () => {
        (global as any).testUser = { id: 1, role: 'project_manager' };
        mockExecute
            .mockResolvedValueOnce({ rows: [{ ID: 1, SITE_NO: 'S1', NAME: 'Site 1', PLANNED_HEADCOUNT: 10, ACTUAL_HEADCOUNT: 8 }] })
            .mockResolvedValueOnce({ rows: [] }) // milestones for all sites
            .mockResolvedValueOnce({ rows: [] }); // kpi averages for all sites

        const res = await request(app).get('/api/project-planning/sites');

        expect(res.status).toBe(200);
        expect(res.body[0].UNDERSTAFFED).toBe(true);
        expect(res.body[0].RISK).toBeNull();
    });

    test('admin cannot access project planning routes (PM-exclusive)', async () => {
        (global as any).testUser = { id: 2, role: 'admin' };
        const res = await request(app).get('/api/project-planning/sites');
        expect(res.status).toBe(403);
    });

    test('supervisor cannot access project planning routes', async () => {
        (global as any).testUser = { id: 3, role: 'supervisor' };
        const res = await request(app).get('/api/project-planning/sites');
        expect(res.status).toBe(403);
    });
});

describe('Milestone risk computed on getSitesPortfolio', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 1, role: 'project_manager' };
    });

    test('overdue milestone marks the site red', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ ID: 5, SITE_NO: 'S5', NAME: 'Site 5', PLANNED_HEADCOUNT: null, ACTUAL_HEADCOUNT: 3 }] })
            .mockResolvedValueOnce({ rows: [{ SITE_ID: 5, ID: 100, NAME: 'M1', DUE_DATE: '2020-01-01', IS_DONE: false, SORT_ORDER: 0 }] })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get('/api/project-planning/sites');

        expect(res.status).toBe(200);
        expect(res.body[0].RISK).toBe('red');
        expect(res.body[0].UNDERSTAFFED).toBe(false);
    });
});
