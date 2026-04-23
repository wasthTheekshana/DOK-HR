/// <reference types="jest" />
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';

jest.mock('../middleware/authMiddleware', () => ({
    authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { id: 1 };
        next();
    },
    requireRole: (_roles: string[]) => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../db/dbUtils', () => ({ execute: jest.fn() }));
jest.mock('oracledb', () => ({
    BIND_OUT: 'BIND_OUT',
    NUMBER: 'NUMBER',
}));

import invoiceRoutes from '../routes/invoiceRoutes';
import { execute } from '../db/dbUtils';

const mockExecute = execute as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/invoices', invoiceRoutes);

const BASE_BODY = {
    site_id: 10,
    site_no: 'S001',
    site_name: 'Test Site',
    date_from: '2026-04-01',
    date_to: '2026-04-30',
    salary_ot_amount: 50000,
    invoice_price: 80000,
};

describe('saveInvoice — cost_variants upsert', () => {
    beforeEach(() => { mockExecute.mockReset(); });

    it('UPDATEs an existing cost variant when the key already exists for the site', async () => {
        mockExecute.mockResolvedValueOnce({ rows: [{ ID: 5 }] });
        mockExecute.mockResolvedValueOnce({ rows: [] });
        mockExecute.mockResolvedValueOnce({ rows: [], outBinds: { id: [99] } });

        const res = await request(app)
            .post('/api/invoices')
            .set('Authorization', 'Bearer test')
            .send({ ...BASE_BODY, cost_variants: [{ key: 'Rent', value: '15000' }] });

        expect(res.status).toBe(201);
        const updateCall = mockExecute.mock.calls[1];
        expect(updateCall[0]).toMatch(/UPDATE cost_varient/i);
        expect(updateCall[1]).toMatchObject({ key: 'Rent', value: '15000', site_id: 10 });
    });

    it('INSERTs a new cost variant when the key does not exist for the site', async () => {
        mockExecute.mockResolvedValueOnce({ rows: [] });
        mockExecute.mockResolvedValueOnce({ rows: [] });
        mockExecute.mockResolvedValueOnce({ rows: [], outBinds: { id: [100] } });

        const res = await request(app)
            .post('/api/invoices')
            .set('Authorization', 'Bearer test')
            .send({ ...BASE_BODY, cost_variants: [{ key: 'Transport', value: '3000' }] });

        expect(res.status).toBe(201);
        const insertCall = mockExecute.mock.calls[1];
        expect(insertCall[0]).toMatch(/INSERT INTO cost_varient/i);
        expect(insertCall[1]).toMatchObject({ key: 'Transport', value: '3000', site_id: 10 });
    });

    it('computes cost_variant_amount server-side as sum of numeric values', async () => {
        mockExecute.mockResolvedValueOnce({ rows: [{ ID: 1 }] });
        mockExecute.mockResolvedValueOnce({ rows: [] });
        mockExecute.mockResolvedValueOnce({ rows: [] });
        mockExecute.mockResolvedValueOnce({ rows: [] });
        mockExecute.mockResolvedValueOnce({ rows: [], outBinds: { id: [101] } });

        const res = await request(app)
            .post('/api/invoices')
            .set('Authorization', 'Bearer test')
            .send({
                ...BASE_BODY,
                cost_variants: [
                    { key: 'Rent',      value: '15000' },
                    { key: 'Transport', value: '3000'  },
                ],
            });

        expect(res.status).toBe(201);
        const profitCall = mockExecute.mock.calls[mockExecute.mock.calls.length - 1];
        expect(profitCall[1].cost_variant_amount).toBe(18000);
    });

    it('skips variants with empty keys', async () => {
        mockExecute.mockResolvedValueOnce({ rows: [], outBinds: { id: [102] } });

        const res = await request(app)
            .post('/api/invoices')
            .set('Authorization', 'Bearer test')
            .send({ ...BASE_BODY, cost_variants: [{ key: '', value: '5000' }] });

        expect(res.status).toBe(201);
        expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when site_id is missing', async () => {
        const res = await request(app)
            .post('/api/invoices')
            .set('Authorization', 'Bearer test')
            .send({ date_from: '2026-04-01', date_to: '2026-04-30' });

        expect(res.status).toBe(400);
    });
});
