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

jest.mock('../db/dbUtils', () => {
    const execute = jest.fn();
    return {
        execute,
        withTransaction: jest.fn(async (fn: any) => fn(execute)),
    };
});

import stageRoutes from '../routes/stageRoutes';
import { execute } from '../db/dbUtils';

const mockExecute = execute as jest.Mock;

const app = express();
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
    if ((global as any).testUser) (req as any).user = (global as any).testUser;
    next();
});
app.use('/api/milestone-stages', stageRoutes);

describe('Milestone stages access control', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 1, role: 'project_manager' };
    });

    test('admin cannot access stage routes (PM-exclusive)', async () => {
        (global as any).testUser = { id: 2, role: 'admin' };
        const res = await request(app).get('/api/milestone-stages');
        expect(res.status).toBe(403);
    });

    test('project_manager can list stages', async () => {
        mockExecute.mockResolvedValueOnce({ rows: [{ ID: 1, NAME: 'To Do', SORT_ORDER: 0, IS_DONE: false }] });
        const res = await request(app).get('/api/milestone-stages');
        expect(res.status).toBe(200);
        expect(res.body[0].NAME).toBe('To Do');
    });
});

describe('createStage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 1, role: 'project_manager' };
    });

    test('appends the new stage after the current max sort_order', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ MAX_ORDER: 2 }] })
            .mockResolvedValueOnce({ rows: [{ ID: 4 }] });

        const res = await request(app).post('/api/milestone-stages').send({ name: 'Blocked' });

        expect(res.status).toBe(201);
        const insertCall = mockExecute.mock.calls[1];
        expect(insertCall[1]).toMatchObject({ name: 'Blocked', sort_order: 3 });
    });

    test('rejects an empty name', async () => {
        const res = await request(app).post('/api/milestone-stages').send({ name: '' });
        expect(res.status).toBe(400);
    });
});

describe('updateStage promoting is_done', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 1, role: 'project_manager' };
    });

    test('promoting a stage to done demotes the previous done-stage in the same transaction', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [] }) // demote previous done-stage
            .mockResolvedValueOnce({ rows: [] }); // promote this stage

        const res = await request(app).put('/api/milestone-stages/5').send({ is_done: true });

        expect(res.status).toBe(200);
        expect(mockExecute.mock.calls[0][0]).toMatch(/is_done = false WHERE is_done = true/);
        expect(mockExecute.mock.calls[1][0]).toMatch(/is_done\s*=\s*true/);
    });

    test('rejects is_done: false directly', async () => {
        const res = await request(app).put('/api/milestone-stages/5').send({ is_done: false });
        expect(res.status).toBe(400);
    });
});

describe('deleteStage guards', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 1, role: 'project_manager' };
    });

    test('blocks deleting the current done-stage', async () => {
        mockExecute.mockResolvedValueOnce({ rows: [{ IS_DONE: true }] });
        const res = await request(app).delete('/api/milestone-stages/3');
        expect(res.status).toBe(409);
    });

    test('blocks deleting a stage that still has milestones assigned', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ IS_DONE: false }] })
            .mockResolvedValueOnce({ rows: [{ COUNT: 2 }] });
        const res = await request(app).delete('/api/milestone-stages/3');
        expect(res.status).toBe(409);
    });

    test('deletes a stage that is unused and not the done-stage', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ IS_DONE: false }] })
            .mockResolvedValueOnce({ rows: [{ COUNT: 0 }] })
            .mockResolvedValueOnce({ rows: [] });
        const res = await request(app).delete('/api/milestone-stages/3');
        expect(res.status).toBe(200);
    });
});
