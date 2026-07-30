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
import taskRoutes from '../routes/taskRoutes';
import payrollRoutes from '../routes/payrollRoutes';
import invoiceRoutes from '../routes/invoiceRoutes';
import analyticsRoutes from '../routes/analyticsRoutes';
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
app.use('/api/tasks', taskRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/analytics', analyticsRoutes);

const asPM = () => { (global as any).testUser = { id: 1, role: 'project_manager', site_id: null }; };

describe('project_manager permission wiring', () => {
    beforeEach(() => {
        (global as any).testUser = undefined;
        mockExecute.mockReset();
        mockExecute.mockResolvedValue({ rows: [] });
    });

    test('can create a site', async () => {
        asPM();
        const res = await request(app).post('/api/sites').send({ site_no: 'S1', name: 'Site 1' });
        expect(res.status).toBe(201);
    });

    test('cannot assign an admin account as a site supervisor when creating a site', async () => {
        asPM();
        mockExecute.mockResolvedValueOnce({ rows: [{ ROLE: 'admin' }] }); // supervisor_id target-role lookup
        const res = await request(app).post('/api/sites').send({ site_no: 'S2', name: 'Site 2', supervisor_id: 99 });
        expect(res.status).toBe(403);
    });

    test('cannot assign an admin account as a site supervisor when updating a site', async () => {
        asPM();
        mockExecute.mockResolvedValueOnce({ rows: [{ ROLE: 'system_admin' }] }); // supervisor_id target-role lookup
        const res = await request(app).put('/api/sites/5').send({ name: 'Site 5', supervisor_id: 99 });
        expect(res.status).toBe(403);
    });

    test('can update a staff record (site/salary reassignment)', async () => {
        asPM();
        const res = await request(app).patch('/api/users/10').send({ site_id: 2 });
        expect(res.status).toBe(200);
        // Must actually apply the change, not silently no-op it (userController.ts has its
        // own isStaffManager check independent of the route's requireRole guard).
        expect(res.body.message).toBe('User updated');
    });

    test('cannot modify an admin account (blocked before any field is applied)', async () => {
        asPM();
        mockExecute.mockResolvedValueOnce({ rows: [{ ROLE: 'admin' }] }); // target-role lookup
        const res = await request(app).patch('/api/users/2').send({ site_id: 5 });
        expect(res.status).toBe(403);
    });

    test('cannot reset another user\'s password (only status/site_id/salary are staff management)', async () => {
        asPM();
        const res = await request(app).patch('/api/users/10').send({ password: 'newpass123', site_id: 2 });
        expect(res.status).toBe(200);
        // site_id must still apply, but password must be silently dropped, not persisted.
        const updateCall = mockExecute.mock.calls.find((c: any[]) => String(c[0]).includes('UPDATE users SET'));
        expect(updateCall).toBeDefined();
        expect(updateCall![0]).toContain('site_id');
        expect(updateCall![0]).not.toContain('password');
    });

    test('cannot create a new user login account', async () => {
        asPM();
        const res = await request(app).post('/api/users').send({
            epf_number: 'EPF999', name: 'New Hire', password: 'secret123', role: 'staff',
        });
        expect(res.status).toBe(403);
    });

    test('cannot delete a user account', async () => {
        asPM();
        const res = await request(app).delete('/api/users/10');
        expect(res.status).toBe(403);
    });

    test('can view the daily-summary task report', async () => {
        asPM();
        const res = await request(app).get('/api/tasks/daily-summary?date=2026-07-24');
        expect(res.status).toBe(200);
    });

    test('cannot create a task entry (daily ops stay with supervisor/staff)', async () => {
        asPM();
        const res = await request(app).post('/api/tasks').send({ site_id: 1, staff_id: 1, task_date: '2026-07-24' });
        expect(res.status).toBe(403);
    });

    test('cannot view payroll (Finance nav removed for PM)', async () => {
        asPM();
        const res = await request(app).get('/api/payroll?date_from=2026-07-01&date_to=2026-07-24&ot_type=time_based');
        expect(res.status).toBe(403);
    });

    test('cannot view extra-units summary (Finance nav removed for PM)', async () => {
        asPM();
        const res = await request(app).get('/api/payroll/extra-units?date_from=2026-07-01&date_to=2026-07-24');
        expect(res.status).toBe(403);
    });

    test('can view the weekly operation / target-base reports (Reports page kept for PM)', async () => {
        asPM();
        const res = await request(app).get('/api/tasks/target-base-report?date_from=2026-07-01&date_to=2026-07-24');
        expect(res.status).toBe(200);
    });

    test('can view custom OT report (used by the Reports page)', async () => {
        asPM();
        const res = await request(app).get('/api/payroll/custom-ot-report?date_from=2026-07-01&date_to=2026-07-24');
        expect(res.status).toBe(200);
    });

    test('can view invoices', async () => {
        asPM();
        const res = await request(app).get('/api/invoices');
        expect(res.status).toBe(200);
    });

    test('can view invoice analysis', async () => {
        asPM();
        const res = await request(app).get('/api/analytics/invoice-analysis?date_from=2026-07-01&date_to=2026-07-24');
        expect(res.status).toBe(200);
    });

    test('cannot view other admin-only analytics (e.g. site-count-trend)', async () => {
        asPM();
        const res = await request(app).get('/api/analytics/site-count-trend');
        expect(res.status).toBe(403);
    });
});
