import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import { hashPassword } from '../utils/authUtils';

export const getUsers = async (req: Request, res: Response) => {
    const { site, role, status, search } = req.query;
    const userRole = (req as any).user.role;
    const userSiteId = (req as any).user.site_id; // Assuming linked in token or we fetch

    try {
        let query = `SELECT id, epf_number, name, role, status, site_id, inactivation_requested, basic_salary, ot_percentage, fix_salary, created_at FROM users WHERE 1=1`;
        const params: any = {};

        // Supervisor Restriction: Can only see users in their site (or sites they supervise - need logic)
        // Usually supervisor is assigned to a site. If user.site_id is their "operating site".
        // Or if we check sites table for sites where supervisor_id = user.id.
        // Let's assume for now we look up sites where they are supervisor.

        if (userRole === 'supervisor') {
            // Find sites supervised by this user
            const sitesResult = await execute<any>(`SELECT id FROM sites WHERE supervisor_id = :id`, [String((req as any).user.id)]);
            const supervisedSiteIds = sitesResult.rows?.map((r: any) => r.ID) || [];

            if (supervisedSiteIds.length > 0) {
                const siteIdsStr = supervisedSiteIds.join(',');
                query += ` AND site_id IN (${siteIdsStr})`;
            } else {
                return res.json([]);
            }
        } else if (userRole === 'staff') {
            // Staff can only see users in their own site
            if (userSiteId) {
                query += ` AND site_id = :site_id_filter`;
                params.site_id_filter = userSiteId;
            } else {
                // specific case: staff without site_id (shouldn't happen ideally but handle safely)
                return res.json([]);
            }
        }

        if (site) {
            query += ` AND site_id = :site`;
            params.site = site;
        }
        if (role) {
            const roleStr = String(role);
            if (roleStr.includes(',')) {
                // Multiple roles
                const roles = roleStr.split(',').map(r => r.trim());
                // Create placeholders :role0, :role1, etc.
                const rolePlaceholders = roles.map((_, i) => `:role${i}`).join(', ');
                query += ` AND role IN (${rolePlaceholders})`;
                roles.forEach((r, i) => {
                    params[`role${i}`] = r;
                });
            } else {
                query += ` AND role = :role`;
                params.role = role;
            }
        }
        if (status) {
            query += ` AND status = :status`;
            params.status = status;
        }
        if (search) {
            query += ` AND (LOWER(name) LIKE LOWER(:search) OR LOWER(epf_number) LIKE LOWER(:search))`;
            params.search = `%${search}%`;
        }

        const result = await execute<any>(query, params);
        res.json(result.rows || []);
    } catch (err) {
        console.error('getUsers error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getUserById = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const result = await execute<any>(
            `SELECT id, epf_number, name, role, status, site_id, inactivation_requested, basic_salary, ot_percentage, fix_salary, created_at FROM users WHERE id = :id`,
            [String(id)]
        );
        if (!result.rows || result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('getUserById error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const createUser = async (req: Request, res: Response) => {
    const { epf_number, name, password, role, site_id } = req.body;

    if (!password) return res.status(400).json({ message: 'Password is required' });

    try {
        const hashedPassword = await hashPassword(password);

        // Check if user exists
        const checkUser = await execute<any>(
            `SELECT id FROM users WHERE epf_number = :epf_number`,
            [epf_number]
        );

        if (checkUser.rows && checkUser.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        await execute(
            `INSERT INTO users (epf_number, name, password, role, site_id, basic_salary, ot_percentage, fix_salary)
       VALUES (:epf_number, :name, :password, :role, :site_id, :basic_salary, :ot_percentage, :fix_salary)`,
            {
                epf_number,
                name,
                password: hashedPassword,
                role,
                site_id: site_id || null,
                basic_salary: req.body.basic_salary || 0,
                ot_percentage: req.body.ot_percentage || 0,
                fix_salary: req.body.fix_salary || 0
            }
        );
        res.status(201).json({ message: 'User created' });
    } catch (err) {
        console.error('createUser error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, site_id, role, inactivation_requested } = req.body;
    const userRole = (req as any).user.role;

    // Supervisor Restriction
    if (userRole === 'supervisor') {
        // Can ONLY update inactivation_requested
        if (status || site_id || role) {
            return res.status(403).json({ message: 'Supervisors can only flag users for inactivation' });
        }
        if (inactivation_requested === undefined) {
            return res.json({ message: 'No allowed changes' });
        }
    }

    try {
        let updates = [];
        const params: any = { id: String(id) };

        if (status && userRole === 'admin') { updates.push('status = :status'); params.status = status; }
        if (site_id !== undefined && userRole === 'admin') { updates.push('site_id = :site_id'); params.site_id = site_id; }
        if (role && userRole === 'admin') { updates.push('role = :role'); params.role = role; }
        if (req.body.basic_salary !== undefined && userRole === 'admin') { updates.push('basic_salary = :basic_salary'); params.basic_salary = req.body.basic_salary; }
        if (req.body.ot_percentage !== undefined && userRole === 'admin') { updates.push('ot_percentage = :ot_percentage'); params.ot_percentage = req.body.ot_percentage; }
        if (req.body.fix_salary !== undefined && userRole === 'admin') { updates.push('fix_salary = :fix_salary'); params.fix_salary = req.body.fix_salary; }

        if (inactivation_requested !== undefined) {
            updates.push('inactivation_requested = :inactivation_requested');
            params.inactivation_requested = inactivation_requested;
        }

        if (updates.length === 0) return res.json({ message: 'No changes' });

        updates.push('updated_at = SYSTIMESTAMP');

        await execute(
            `UPDATE users SET ${updates.join(', ')} WHERE id = :id`,
            params
        );
        res.json({ message: 'User updated' });
    } catch (err) {
        console.error('updateUser error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await execute('DELETE FROM users WHERE id = :id', [id]);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('deleteUser error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
