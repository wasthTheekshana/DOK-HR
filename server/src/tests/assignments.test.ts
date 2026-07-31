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

import assignmentRoutes from '../routes/assignmentRoutes';
import { execute } from '../db/dbUtils';

const mockExecute = execute as jest.Mock;

const app = express();
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
    if ((global as any).testUser) (req as any).user = (global as any).testUser;
    next();
});
app.use('/api/assignments', assignmentRoutes);

describe('createAssignment', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 1, role: 'admin' };
    });

    test('creates an indefinite (permanent secondary site) assignment with no end_date', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ SITE_ID: 1 }] }) // home site lookup
            .mockResolvedValueOnce({ rows: [] })                // no overlap
            .mockResolvedValueOnce({ rows: [] });                // insert

        const res = await request(app).post('/api/assignments').send({
            staff_id: 10, site_id: 2, start_date: '2026-08-01',
        });

        expect(res.status).toBe(201);
        const insertCall = mockExecute.mock.calls[2];
        expect(insertCall[1]).toMatchObject({ end_date: null });
    });

    test('rejects a dated request when end_date is before start_date', async () => {
        const res = await request(app).post('/api/assignments').send({
            staff_id: 10, site_id: 2, start_date: '2026-08-10', end_date: '2026-08-01',
        });
        expect(res.status).toBe(400);
    });

    test('still requires staff_id, site_id, and start_date', async () => {
        const res = await request(app).post('/api/assignments').send({ staff_id: 10, site_id: 2 });
        expect(res.status).toBe(400);
    });

    test('blocks a new assignment that overlaps an existing indefinite one to the same site', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ SITE_ID: 1 }] })       // home site lookup
            .mockResolvedValueOnce({ rows: [{ ID: 99 }] });           // overlap found

        const res = await request(app).post('/api/assignments').send({
            staff_id: 10, site_id: 2, start_date: '2026-09-01', end_date: '2026-09-10',
        });

        expect(res.status).toBe(409);
    });
});

describe('updateAssignment', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 1, role: 'admin' };
    });

    test('updating just the note on an indefinite assignment does not fail the date check', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ ID: 5, START_DATE: '2026-01-01', END_DATE: null, STAFF_ID: 10, SITE_ID: 2 }] })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(app).patch('/api/assignments/5').send({ note: 'updated note' });

        expect(res.status).toBe(200);
    });
});

describe('getAssignments active filter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 1, role: 'admin' };
    });

    test('active=1 treats a NULL end_date as still active', async () => {
        mockExecute.mockResolvedValueOnce({ rows: [{ ID: 1, STAFF_ID: 10, SITE_ID: 2, END_DATE: null }] });

        const res = await request(app).get('/api/assignments?active=1');

        expect(res.status).toBe(200);
        expect(mockExecute.mock.calls[0][0]).toMatch(/ta\.end_date IS NULL/);
        expect(res.body[0].END_DATE).toBeNull();
    });
});
