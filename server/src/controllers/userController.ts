import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import { hashPassword } from '../utils/authUtils';

export const getUsers = async (req: Request, res: Response) => {
    const { site, role, status, search, date } = req.query;
    const userRole = (req as any).user.role;
    const userSiteId = (req as any).user.site_id;

    try {
        let query = `SELECT id, epf_number, name, role, status, site_id, inactivation_requested, basic_salary, ot_percentage, fix_salary, created_at FROM users WHERE 1=1`;
        const params: any = {};

        if (userRole === 'supervisor') {
            const sitesResult = await execute<any>(`SELECT id FROM sites WHERE supervisor_id = :id`, [String((req as any).user.id)]);
            const supervisedSiteIds = sitesResult.rows?.map((r: any) => r.ID) || [];

            if (supervisedSiteIds.length > 0) {
                const siteIdsStr = supervisedSiteIds.join(',');
                query += ` AND site_id IN (${siteIdsStr})`;
            } else {
                return res.json([]);
            }
        } else if (userRole === 'staff') {
            if (userSiteId) {
                query += ` AND site_id = :site_id_filter`;
                params.site_id_filter = userSiteId;
            } else {
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
                const roles = roleStr.split(',').map(r => r.trim());
                const rolePlaceholders = roles.map((_, i) => `:role${i}`).join(', ');
                query += ` AND role IN (${rolePlaceholders})`;
                roles.forEach((r, i) => { params[`role${i}`] = r; });
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
        let users = (result.rows || []).map((u: any) => ({ ...u, IS_TEMP: 0 }));

        // When fetching for a specific site + date, also include temp-assigned staff active on that date.
        // These staff are helpers from another site — mark them IS_TEMP: 1 so frontend can badge them.
        if (site && date) {
            const tempResult = await execute<any>(
                `SELECT u.id, u.epf_number, u.name, u.role, u.status, u.site_id,
                        u.inactivation_requested, u.basic_salary, u.ot_percentage, u.fix_salary, u.created_at
                 FROM temporary_assignments ta
                 JOIN users u ON ta.staff_id = u.id
                 WHERE ta.site_id = :site_id
                   AND TO_DATE(:date_val, 'YYYY-MM-DD') BETWEEN ta.start_date AND ta.end_date
                   AND u.status = 'active'`,
                { site_id: Number(site), date_val: String(date) }
            );
            const tempStaff = (tempResult.rows || []).map((u: any) => ({ ...u, IS_TEMP: 1 }));

            // Merge: avoid duplicates (permanent staff already in list stay as IS_TEMP: 0)
            const existingIds = new Set(users.map((u: any) => u.ID));
            for (const ts of tempStaff) {
                if (!existingIds.has(ts.ID)) {
                    users.push(ts);
                }
            }
        }

        res.json(users);
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
    const callerId = String((req as any).user.id);
    const targetId = String(id);
    const isSelf = callerId === targetId;
    const isPrivileged = userRole === 'admin' || userRole === 'system_admin';

    // Supervisor Restriction
    if (userRole === 'supervisor') {
        if (status || site_id || role) {
            return res.status(403).json({ message: 'Supervisors can only flag users for inactivation' });
        }
        if (inactivation_requested === undefined) {
            return res.json({ message: 'No allowed changes' });
        }
    }

    try {
        let updates: string[] = [];
        const params: any = { id: targetId };

        // Admin / system_admin fields
        if (isPrivileged) {
            if (status) {
                updates.push('status = :status');
                params.status = status;
                // When explicitly setting inactive, clear the supervisor flag
                if (status === 'inactive') {
                    updates.push('inactivation_requested = 0');
                }
            }
            if (site_id !== undefined)               { updates.push('site_id = :site_id');             params.site_id = site_id; }
            if (role)                                { updates.push('role = :role');                   params.role = role; }
            if (req.body.basic_salary !== undefined) { updates.push('basic_salary = :basic_salary');   params.basic_salary = req.body.basic_salary; }
            if (req.body.ot_percentage !== undefined){ updates.push('ot_percentage = :ot_percentage'); params.ot_percentage = req.body.ot_percentage; }
            if (req.body.fix_salary !== undefined)   { updates.push('fix_salary = :fix_salary');       params.fix_salary = req.body.fix_salary; }
            if (req.body.epf_number) {
                // Duplicate check: make sure no other user already holds this EPF
                const dupCheck = await execute<any>(
                    `SELECT id FROM users WHERE epf_number = :epf AND id != :id`,
                    { epf: req.body.epf_number, id: targetId }
                );
                if (dupCheck.rows && dupCheck.rows.length > 0) {
                    return res.status(409).json({ message: 'EPF number already in use by another employee' });
                }
                updates.push('epf_number = :epf_number');
                params.epf_number = req.body.epf_number;
            }
        }

        // Name: privileged users or self
        if (req.body.name && (isPrivileged || isSelf)) {
            updates.push('name = :name');
            params.name = req.body.name;
        }

        // Password: privileged users can reset anyone's; self can change own
        if (req.body.password && (isPrivileged || isSelf)) {
            const hashed = await hashPassword(req.body.password);
            updates.push('password = :password');
            params.password = hashed;
        }

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
