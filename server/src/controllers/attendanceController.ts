import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';

export const getAttendance = async (req: Request, res: Response) => {
    const { site_no, date_from, date_to } = req.query;
    const userRole = (req as any).user.role;
    const userId = (req as any).user.id;

    try {
        let query = `
        SELECT a.id, a.site_id, a.staff_id, TO_CHAR(a.attendance_date, 'YYYY-MM-DD') as attendance_date, a.in_time, a.out_time,
               u.name as staff_name, s.site_no, s.name as site_name, s.ot_type
        FROM attendance a
        JOIN sites s ON a.site_id = s.id
        JOIN users u ON a.staff_id = u.id
        WHERE 1=1
      `;
        const params: any = {};

        if (userRole === 'supervisor') {
            query += ` AND s.supervisor_id = :userId`;
            params.userId = userId;
        } else if (userRole === 'staff') {
            query += ` AND a.staff_id = :userId`;
            params.userId = userId;
        }

        if (site_no) {
            query += ` AND s.site_no = :site_no`;
            params.site_no = String(site_no);
        }
        if (date_from) {
            query += ` AND a.attendance_date >= :date_from`;
            params.date_from = String(date_from);
        }
        if (date_to) {
            query += ` AND a.attendance_date <= :date_to`;
            params.date_to = String(date_to);
        }

        query += ` ORDER BY a.attendance_date DESC`;

        const result = await execute<any>(query, params);
        res.json(result.rows || []);
    } catch (err) {
        console.error('getAttendance error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const createAttendance = async (req: Request, res: Response) => {
    const { site_id, staff_id, attendance_date, in_time, out_time } = req.body;
    const userRole = (req as any).user.role;
    const userId   = (req as any).user.id;
    try {
        // Supervisors can only record attendance for their own sites
        if (userRole === 'supervisor') {
            const siteCheck = await execute<any>(
                `SELECT 1 FROM sites WHERE id = :site_id AND supervisor_id = :userId`,
                { site_id, userId }
            );
            if (!siteCheck.rows || siteCheck.rows.length === 0) {
                return res.status(403).json({ message: 'Forbidden: you can only record attendance for your own sites' });
            }
        }

        // Upsert — re-submitting the same staff/site/date updates times instead of erroring
        await execute(
            `INSERT INTO attendance (site_id, staff_id, attendance_date, in_time, out_time)
             VALUES (:site_id, :staff_id, :attendance_date, :in_time, :out_time)
             ON CONFLICT (staff_id, site_id, attendance_date) DO UPDATE
             SET in_time = EXCLUDED.in_time, out_time = EXCLUDED.out_time, updated_at = CURRENT_TIMESTAMP`,
            { site_id, staff_id, attendance_date, in_time, out_time }
        );
        res.status(201).json({ message: 'Attendance recorded' });
    } catch (err) {
        console.error('createAttendance error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getAttendanceReport = async (req: Request, res: Response) => {
    const { site_no, date_from, date_to } = req.query;
    const userRole = (req as any).user.role;
    const userId   = (req as any).user.id;
    try {
        let query = `
        SELECT u.name as staff_name,
               COUNT(DISTINCT a.attendance_date) as days_count,
               u.epf_number
        FROM attendance a
        JOIN sites s ON a.site_id = s.id
        JOIN users u ON a.staff_id = u.id
        WHERE 1=1
      `;
        const params: any = {};

        if (userRole === 'supervisor') {
            query += ` AND s.supervisor_id = :userId`;
            params.userId = userId;
        } else if (userRole === 'staff') {
            query += ` AND a.staff_id = :userId`;
            params.userId = userId;
        }

        if (site_no) {
            query += ` AND s.site_no = :site_no`;
            params.site_no = String(site_no);
        }
        if (date_from) {
            query += ` AND a.attendance_date >= :date_from`;
            params.date_from = String(date_from);
        }
        if (date_to) {
            query += ` AND a.attendance_date <= :date_to`;
            params.date_to = String(date_to);
        }

        query += ` GROUP BY u.name, u.epf_number ORDER BY u.name`;

        const result = await execute<any>(query, params);
        res.json(result.rows || []);
    } catch (err) {
        console.error('getAttendanceReport error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
