import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';

/**
 * GET /api/assignments
 * Query params:
 *   site_id  — filter by secondary site
 *   staff_id — filter by staff member
 *   date     — only return assignments active on this date (YYYY-MM-DD)
 *   active   — if '1', only return assignments where today is within range
 */
export const getAssignments = async (req: Request, res: Response) => {
    const { site_id, staff_id, date, active } = req.query;
    try {
        let query = `
            SELECT ta.id, ta.staff_id, ta.site_id,
                   TO_CHAR(ta.start_date, 'YYYY-MM-DD') as start_date,
                   TO_CHAR(ta.end_date,   'YYYY-MM-DD') as end_date,
                   ta.note,
                   TO_CHAR(ta.created_at, 'YYYY-MM-DD HH24:MI') as created_at,
                   u.name as staff_name, u.epf_number,
                   s.site_no, s.name as site_name,
                   u.site_id as home_site_id
            FROM temporary_assignments ta
            JOIN users u ON ta.staff_id = u.id
            JOIN sites s ON ta.site_id  = s.id
            WHERE 1=1
        `;
        const params: any = {};

        if (site_id) {
            query += ` AND ta.site_id = :site_id`;
            params.site_id = Number(site_id);
        }
        if (staff_id) {
            query += ` AND ta.staff_id = :staff_id`;
            params.staff_id = Number(staff_id);
        }
        if (date) {
            query += ` AND TO_DATE(:date, 'YYYY-MM-DD') BETWEEN ta.start_date AND ta.end_date`;
            params.date = String(date);
        }
        if (active === '1') {
            query += ` AND TRUNC(SYSDATE) BETWEEN ta.start_date AND ta.end_date`;
        }

        query += ` ORDER BY ta.start_date DESC`;

        const result = await execute<any>(query, params);
        res.json(result.rows || []);
    } catch (err) {
        console.error('getAssignments error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * POST /api/assignments
 * Body: { staff_id, site_id, start_date, end_date, note? }
 */
export const createAssignment = async (req: Request, res: Response) => {
    const { staff_id, site_id, start_date, end_date, note } = req.body;
    const createdBy = (req as any).user?.id;

    if (!staff_id || !site_id || !start_date || !end_date) {
        return res.status(400).json({ message: 'staff_id, site_id, start_date, end_date are required' });
    }
    if (new Date(end_date) < new Date(start_date)) {
        return res.status(400).json({ message: 'end_date must be >= start_date' });
    }

    try {
        // Prevent assigning to their own home site
        const staffRes = await execute<any>(
            `SELECT site_id FROM users WHERE id = :id`,
            { id: Number(staff_id) }
        );
        const homeSiteId = staffRes.rows?.[0]?.SITE_ID;
        if (homeSiteId && Number(homeSiteId) === Number(site_id)) {
            return res.status(400).json({ message: 'Staff is already permanently assigned to this site' });
        }

        // Prevent overlapping assignments to the same secondary site
        const overlapRes = await execute<any>(
            `SELECT id FROM temporary_assignments
             WHERE staff_id = :staff_id AND site_id = :site_id
               AND start_date <= TO_DATE(:end_date, 'YYYY-MM-DD')
               AND end_date   >= TO_DATE(:start_date, 'YYYY-MM-DD')`,
            { staff_id: Number(staff_id), site_id: Number(site_id), start_date: String(start_date), end_date: String(end_date) }
        );
        if (overlapRes.rows && overlapRes.rows.length > 0) {
            return res.status(409).json({ message: 'An overlapping assignment to this site already exists for this staff member' });
        }

        await execute<any>(
            `INSERT INTO temporary_assignments (staff_id, site_id, start_date, end_date, note, created_by)
             VALUES (:staff_id, :site_id, TO_DATE(:start_date,'YYYY-MM-DD'), TO_DATE(:end_date,'YYYY-MM-DD'), :note, :created_by)`,
            {
                staff_id: Number(staff_id),
                site_id: Number(site_id),
                start_date: String(start_date),
                end_date: String(end_date),
                note: note || null,
                created_by: createdBy || null
            }
        );
        res.status(201).json({ message: 'Assignment created' });
    } catch (err) {
        console.error('createAssignment error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * PATCH /api/assignments/:id
 * Body: { start_date?, end_date?, note? }
 */
export const updateAssignment = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { start_date, end_date, note } = req.body;

    try {
        const existing = await execute<any>(
            `SELECT id, start_date, end_date, staff_id, site_id FROM temporary_assignments WHERE id = :id`,
            { id: Number(id) }
        );
        if (!existing.rows || existing.rows.length === 0) {
            return res.status(404).json({ message: 'Assignment not found' });
        }
        const row = existing.rows[0];

        const newStart = start_date || row.START_DATE;
        const newEnd   = end_date   || row.END_DATE;

        if (new Date(newEnd) < new Date(newStart)) {
            return res.status(400).json({ message: 'end_date must be >= start_date' });
        }

        const updates: string[] = [];
        const params: any = { id: Number(id) };

        if (start_date) { updates.push(`start_date = TO_DATE(:start_date, 'YYYY-MM-DD')`); params.start_date = String(start_date); }
        if (end_date)   { updates.push(`end_date   = TO_DATE(:end_date,   'YYYY-MM-DD')`); params.end_date   = String(end_date); }
        if (note !== undefined) { updates.push(`note = :note`); params.note = note || null; }

        if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });

        await execute<any>(
            `UPDATE temporary_assignments SET ${updates.join(', ')} WHERE id = :id`,
            params
        );
        res.json({ message: 'Assignment updated' });
    } catch (err) {
        console.error('updateAssignment error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * DELETE /api/assignments/:id
 */
export const deleteAssignment = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await execute<any>(
            `DELETE FROM temporary_assignments WHERE id = :id`,
            { id: Number(id) }
        );
        res.json({ message: 'Assignment deleted' });
    } catch (err) {
        console.error('deleteAssignment error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
