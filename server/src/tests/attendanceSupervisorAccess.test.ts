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

import attendanceRoutes from '../routes/attendanceRoutes';
import { execute } from '../db/dbUtils';

const mockExecute = execute as jest.Mock;

const app = express();
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
    if ((global as any).testUser) (req as any).user = (global as any).testUser;
    next();
});
app.use('/api/attendance', attendanceRoutes);

// getSupervisorAccessibleSiteIds always issues 2 queries (managed sites, then active
// temp/permanent assignments) before the endpoint's own query.
const mockAccessibleSites = (managedSiteIds: number[], assignedSiteIds: number[]) => {
    mockExecute
        .mockResolvedValueOnce({ rows: managedSiteIds.map(id => ({ ID: id })) })
        .mockResolvedValueOnce({ rows: assignedSiteIds.map(id => ({ SITE_ID: id })) });
};

describe('getAttendance: supervisor site access includes temp/permanent assignments', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 5, role: 'supervisor' };
    });

    test('includes attendance from a site the supervisor is only temp-assigned to', async () => {
        mockAccessibleSites([10], [20]);
        mockExecute.mockResolvedValueOnce({ rows: [{ ID: 1, SITE_ID: 20 }] });

        const res = await request(app).get('/api/attendance');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        const mainQueryCall = mockExecute.mock.calls[2];
        expect(mainQueryCall[0]).toContain('s.id IN');
        expect(mainQueryCall[1]).toMatchObject({ ssid0: 10, ssid1: 20 });
    });

    test('returns an empty list when the supervisor has no managed or assigned sites', async () => {
        mockAccessibleSites([], []);

        const res = await request(app).get('/api/attendance');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

describe('createAttendance: supervisor can record attendance at an assigned (not managed) site', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 5, role: 'supervisor' };
    });

    test('allows recording attendance at a temp/permanent-assigned site', async () => {
        mockAccessibleSites([10], [20]);
        mockExecute.mockResolvedValueOnce({ rows: [] }); // insert

        const res = await request(app).post('/api/attendance').send({
            site_id: 20, staff_id: 1, attendance_date: '2026-07-30', in_time: '08:00', out_time: '17:00',
        });

        expect(res.status).toBe(201);
    });

    test('still blocks recording attendance at a site with no relationship at all', async () => {
        mockAccessibleSites([10], [20]);

        const res = await request(app).post('/api/attendance').send({
            site_id: 99, staff_id: 1, attendance_date: '2026-07-30', in_time: '08:00', out_time: '17:00',
        });

        expect(res.status).toBe(403);
    });
});

describe('getAttendanceReport: supervisor site access includes temp/permanent assignments', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 5, role: 'supervisor' };
    });

    test('includes report rows from a site the supervisor is only temp-assigned to', async () => {
        mockAccessibleSites([10], [20]);
        mockExecute.mockResolvedValueOnce({ rows: [{ STAFF_NAME: 'Helper', DAYS_COUNT: 3 }] });

        const res = await request(app).get('/api/attendance/report');

        expect(res.status).toBe(200);
        const mainQueryCall = mockExecute.mock.calls[2];
        expect(mainQueryCall[0]).toContain('s.id IN');
        expect(mainQueryCall[1]).toMatchObject({ ssid0: 10, ssid1: 20 });
    });
});
