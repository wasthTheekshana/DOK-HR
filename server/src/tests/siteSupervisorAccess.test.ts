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

import siteRoutes from '../routes/siteRoutes';
import { execute } from '../db/dbUtils';

const mockExecute = execute as jest.Mock;

const app = express();
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
    if ((global as any).testUser) (req as any).user = (global as any).testUser;
    next();
});
app.use('/api/sites', siteRoutes);

// getSupervisorAccessibleSiteIds always issues 2 queries (managed sites, then active
// temp/permanent assignments) before the endpoint's own query.
const mockAccessibleSites = (managedSiteIds: number[], assignedSiteIds: number[]) => {
    mockExecute
        .mockResolvedValueOnce({ rows: managedSiteIds.map(id => ({ ID: id })) })
        .mockResolvedValueOnce({ rows: assignedSiteIds.map(id => ({ SITE_ID: id })) });
};

describe('getSites: supervisor site access includes temp/permanent assignments', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).testUser = { id: 5, role: 'supervisor' };
    });

    test('includes a site the supervisor is only temp-assigned to, not just their managed site', async () => {
        mockAccessibleSites([10], [20]);
        mockExecute
            .mockResolvedValueOnce({ rows: [{ ID: 20, SITE_NO: 'S20', NAME: 'Site 20' }] }) // main query
            .mockResolvedValueOnce({ rows: [] }) // site_task_types
            .mockResolvedValueOnce({ rows: [] }); // cost_varient

        const res = await request(app).get('/api/sites');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        const mainQueryCall = mockExecute.mock.calls[2];
        expect(mainQueryCall[0]).toContain('s.id IN');
        expect(mainQueryCall[1]).toMatchObject({ ssid0: 10, ssid1: 20 });
    });

    test('returns an empty list when the supervisor has no managed or assigned sites', async () => {
        mockAccessibleSites([], []);

        const res = await request(app).get('/api/sites');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});
