import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';

// Note: Using 'attendance' table as requested, though 'tasks' also has in/out.
// If redundancy is confusing, we assume this is purely for gate logs.
export const getAttendance = async (req: Request, res: Response) => {
    const { site_no, date_from, date_to } = req.query;
    const userRole = (req as any).user.role;
    const userId = (req as any).user.id;

    try {
        // Querying from tasks table instead of attendance
        // Aliasing task_date as attendance_date to match frontend expectation
        let query = `
        SELECT t.id, t.site_id, t.staff_id, t.task_date as attendance_date, t.in_time, t.out_time, 
               u.name as staff_name, s.site_no 
        FROM tasks t
        JOIN sites s ON t.site_id = s.id
        JOIN users u ON t.staff_id = u.id
        WHERE 1=1
      `;
        const params: any = {};

        if (userRole === 'supervisor') {
            // Filter by sites where supervisor_id matches current user
            // We can resolve this by joining sites table on supervisor_id, but here 's' is already joined
            query += ` AND s.supervisor_id = :userId`;
            params.userId = userId;
        }

        if (site_no) {
            query += ` AND s.site_no = :site_no`;
            params.site_no = String(site_no);
        }
        if (date_from) {
            query += ` AND t.task_date >= TO_DATE(:date_from, 'YYYY-MM-DD')`;
            params.date_from = String(date_from);
        }
        if (date_to) {
            query += ` AND t.task_date <= TO_DATE(:date_to, 'YYYY-MM-DD')`;
            params.date_to = String(date_to);
        }

        // Ordering by date desc
        query += ` ORDER BY t.task_date DESC`;

        const result = await execute<any>(query, params);
        res.json(result.rows || []);
    } catch (err) {
        console.error('getAttendance error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const createAttendance = async (req: Request, res: Response) => {
    // Keeping this for now, but note that reports are now driven by tasks table.
    // This might be deprecated if 'attendance' table is fully obsolete.
    const { site_id, staff_id, attendance_date, in_time, out_time } = req.body;
    try {
        await execute(
            `INSERT INTO attendance (site_id, staff_id, attendance_date, in_time, out_time)
             VALUES (:site_id, :staff_id, TO_DATE(:attendance_date, 'YYYY-MM-DD'), :in_time, :out_time)`,
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
    try {
        // Count distinct task_dates to get working days count
        let query = `
        SELECT u.name as staff_name, COUNT(DISTINCT t.task_date) as days_count, u.epf_number
        FROM tasks t
        JOIN sites s ON t.site_id = s.id
        JOIN users u ON t.staff_id = u.id
        WHERE 1=1
      `;
        const params: any = {};

        if (site_no) {
            query += ` AND s.site_no = :site_no`;
            params.site_no = String(site_no);
        }
        if (date_from) {
            query += ` AND t.task_date >= TO_DATE(:date_from, 'YYYY-MM-DD')`;
            params.date_from = String(date_from);
        }
        if (date_to) {
            query += ` AND t.task_date <= TO_DATE(:date_to, 'YYYY-MM-DD')`;
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
