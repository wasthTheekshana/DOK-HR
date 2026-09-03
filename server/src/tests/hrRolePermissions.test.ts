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
    execute: jest.fn().mockResolvedValue({ rows: [] }),
    withTransaction: jest.fn(async (fn: any) => fn(jest.fn().mockResolvedValue({ rows: [{ ID: 1 }] }))),
}));

import siteRoutes from '../routes/siteRoutes';
import userRoutes from '../routes/userRoutes';
import attendanceRoutes from '../routes/attendanceRoutes';
import { execute } from '../db/dbUtils';

const mockExecute = execute as jest.Mock;

const app = express();
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
    if ((global as any).testUser) (req as any).user = (global as any).testUser;
    next();
});
app.use('/api/sites', siteRoutes);
app.use('/api/users', userRoutes);
app.use('/api/attendance', attendanceRoutes);

const asHr = () => { (global as any).testUser = { id: 1, role: 'hr', site_id: null }; };

describe('hr role permission wiring', () => {
    beforeEach(() => {
        (global as any).testUser = undefined;
        mockExecute.mockReset();
        mockExecute.mockResolvedValue({ rows: [] });
    });

    test('can view sites', async () => {
        asHr();
        const res = await request(app).get('/api/sites');
        expect(res.status).toBe(200);
    });

    test('can view a single site', async () => {
        asHr();
        mockExecute.mockResolvedValueOnce({ rows: [{ ID: 1, SITE_NO: 'S1', NAME: 'Site 1' }] });
        const res = await request(app).get('/api/sites/1');
        expect(res.status).toBe(200);
    });

    test('can view team (users)', async () => {
        asHr();
        const res = await request(app).get('/api/users');
        expect(res.status).toBe(200);
    });

    test('can view attendance', async () => {
        asHr();
        const res = await request(app).get('/api/attendance');
        expect(res.status).toBe(200);
    });

    test('can view attendance report', async () => {
        asHr();
        const res = await request(app).get('/api/attendance/report');
        expect(res.status).toBe(200);
    });

    test('cannot create a site', async () => {
        asHr();
        const res = await request(app).post('/api/sites').send({ site_no: 'S1', name: 'Site 1' });
        expect(res.status).toBe(403);
    });

    test('cannot update a site', async () => {
        asHr();
        const res = await request(app).put('/api/sites/1').send({ name: 'Renamed' });
        expect(res.status).toBe(403);
    });

    test('cannot delete a site', async () => {
        asHr();
        const res = await request(app).delete('/api/sites/1');
        expect(res.status).toBe(403);
    });

    test('cannot create a user', async () => {
        asHr();
        const res = await request(app).post('/api/users').send({ epf_number: 'E1', name: 'New', password: 'secret1', role: 'staff' });
        expect(res.status).toBe(403);
    });

    test('cannot update a user', async () => {
        asHr();
        const res = await request(app).patch('/api/users/10').send({ site_id: 2 });
        expect(res.status).toBe(403);
    });

    test('cannot delete a user', async () => {
        asHr();
        const res = await request(app).delete('/api/users/10');
        expect(res.status).toBe(403);
    });

    test('cannot mark attendance', async () => {
        asHr();
        const res = await request(app).post('/api/attendance').send({ site_id: 1, staff_id: 1, attendance_date: '2026-09-03' });
        expect(res.status).toBe(403);
    });
});
