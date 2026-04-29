import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import { AuthRequest } from '../middleware/authMiddleware';

export const getPoyaDays = async (req: Request, res: Response) => {
    const { year } = req.query;
    try {
        let query = `SELECT id, TO_CHAR(poya_date, 'YYYY-MM-DD') as poya_date, description FROM poya_days`;
        const params: any = {};
        if (year) {
            query += ` WHERE EXTRACT(YEAR FROM poya_date) = :year`;
            params.year = Number(year);
        }
        query += ` ORDER BY poya_date`;
        const result = await execute<any>(query, params);
        res.json(result.rows || []);
    } catch (err) {
        console.error('getPoyaDays error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const addPoyaDay = async (req: AuthRequest, res: Response) => {
    const { poya_date, description } = req.body;
    if (!poya_date) return res.status(400).json({ message: 'poya_date is required (YYYY-MM-DD)' });
    try {
        await execute(
            `INSERT INTO poya_days (poya_date, description, created_by)
             VALUES (:poya_date, :description, :created_by)`,
            { poya_date, description: description || null, created_by: req.user?.id ?? null }
        );
        res.json({ message: 'Poya day added' });
    } catch (err: any) {
        if (err?.code === '23505') {
            return res.status(409).json({ message: 'This date is already marked as a Poya day' });
        }
        console.error('addPoyaDay error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updatePoyaDay = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { poya_date, description } = req.body;
    if (!poya_date) return res.status(400).json({ message: 'poya_date is required (YYYY-MM-DD)' });
    try {
        await execute(
            `UPDATE poya_days SET poya_date = :poya_date, description = :description WHERE id = :id`,
            { poya_date, description: description || null, id: Number(id) }
        );
        res.json({ message: 'Poya day updated' });
    } catch (err: any) {
        if (err?.code === '23505') return res.status(409).json({ message: 'Another Poya day already exists on that date' });
        console.error('updatePoyaDay error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deletePoyaDay = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
        await execute(`DELETE FROM poya_days WHERE id = :id`, { id: Number(id) });
        res.json({ message: 'Poya day removed' });
    } catch (err) {
        console.error('deletePoyaDay error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
