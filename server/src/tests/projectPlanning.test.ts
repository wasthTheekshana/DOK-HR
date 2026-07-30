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
            .mockResolvedValueOnce({ rows: [{ ID: 1, SITE_NO: 'S1', NAME: 'Site 1', PLANNED_HEADCOUNT: 10, ACTUAL_HEADCOUNT: 8, STAGE_ID: 1, STAGE_NAME: 'To Do', STAGE_IS_DONE: false, STAGE_SORT_ORDER: 0 }] })
            .mockResolvedValueOnce({ rows: [] }) // kpi averages for all sites
            .mockResolvedValueOnce({ rows: [] }); // monthly target-based task counts

        const res = await request(app).get('/api/project-planning/sites');

        expect(res.status).toBe(200);
        expect(res.body[0].UNDERSTAFFED).toBe(true);
        expect(res.body[0].RISK).toBeNull();
        expect(res.body[0].STAGE_NAME).toBe('To Do');
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

describe('Deadline risk computed on getSitesPortfolio', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 1, role: 'project_manager' };
    });

    test('overdue planned end date marks the site red', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ ID: 5, SITE_NO: 'S5', NAME: 'Site 5', PLANNED_HEADCOUNT: null, ACTUAL_HEADCOUNT: 3, PLANNED_END_DATE: '2020-01-01', STAGE_ID: 1, STAGE_NAME: 'To Do', STAGE_IS_DONE: false, STAGE_SORT_ORDER: 0 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get('/api/project-planning/sites');

        expect(res.status).toBe(200);
        expect(res.body[0].RISK).toBe('red');
        expect(res.body[0].UNDERSTAFFED).toBe(false);
    });

    test('a site in the done stage is never at risk, even past its end date', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ ID: 6, SITE_NO: 'S6', NAME: 'Site 6', PLANNED_HEADCOUNT: null, ACTUAL_HEADCOUNT: 3, PLANNED_END_DATE: '2020-01-01', STAGE_ID: 3, STAGE_NAME: 'Done', STAGE_IS_DONE: true, STAGE_SORT_ORDER: 0 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get('/api/project-planning/sites');

        expect(res.status).toBe(200);
        expect(res.body[0].RISK).toBeNull();
    });
});

describe('Monthly target-based achievement on getSitesPortfolio', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 1, role: 'project_manager' };
    });

    test('target-based site below its monthly target gets a low percentage', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ ID: 7, SITE_NO: 'S7', NAME: 'Site 7', PLANNED_HEADCOUNT: null, ACTUAL_HEADCOUNT: 2, OT_TYPE: 'target_based', DAILY_TARGET: 10, STAGE_ID: 1, STAGE_NAME: 'To Do', STAGE_IS_DONE: false, STAGE_SORT_ORDER: 0 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ SITE_ID: 7, ACTUAL_COUNT: 55 }] }); // 55 / (10*22) = 25%

        const res = await request(app).get('/api/project-planning/sites');

        expect(res.status).toBe(200);
        expect(res.body[0].MONTHLY_TARGET_PCT).toBe(25);
    });

    test('time-based site has no monthly target percentage', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ ID: 8, SITE_NO: 'S8', NAME: 'Site 8', PLANNED_HEADCOUNT: null, ACTUAL_HEADCOUNT: 2, OT_TYPE: 'time_based', DAILY_TARGET: 0, STAGE_ID: 1, STAGE_NAME: 'To Do', STAGE_IS_DONE: false, STAGE_SORT_ORDER: 0 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get('/api/project-planning/sites');

        expect(res.status).toBe(200);
        expect(res.body[0].MONTHLY_TARGET_PCT).toBeNull();
    });
});

describe('updateSiteStage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 1, role: 'project_manager' };
    });

    test('moves a site to a new stage', async () => {
        mockExecute.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).put('/api/project-planning/sites/5/stage').send({ stage_id: 2, stage_sort_order: 0 });

        expect(res.status).toBe(200);
        expect(mockExecute.mock.calls[0][1]).toMatchObject({ stage_id: 2, stage_sort_order: 0 });
    });

    test('rejects an empty body', async () => {
        const res = await request(app).put('/api/project-planning/sites/5/stage').send({});
        expect(res.status).toBe(400);
    });
});
