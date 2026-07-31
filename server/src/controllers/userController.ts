import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import { hashPassword } from '../utils/authUtils';
import { getSupervisorAccessibleSiteIds } from '../utils/supervisorAccess';

export const getUsers = async (req: Request, res: Response) => {
    const { site, role, status, search, date } = req.query;
    const userRole = (req as any).user.role;
    const userSiteId = (req as any).user.site_id;

    try {
        let query = `SELECT id, epf_number, name, role, status, site_id, inactivation_requested, basic_salary, ot_percentage, fix_salary, created_at FROM users WHERE 1=1`;
        const params: any = {};

        if (userRole === 'supervisor') {
            const supervisorId = (req as any).user.id;
            const accessibleSiteIds = await getSupervisorAccessibleSiteIds(supervisorId);

            if (accessibleSiteIds.length > 0) {
                const idParams = Object.fromEntries(accessibleSiteIds.map((id: number, i: number) => [`sid${i}`, id]));
                const idPlaceholders = accessibleSiteIds.map((_: number, i: number) => `:sid${i}`).join(', ');
                query += ` AND site_id IN (${idPlaceholders})`;
                Object.assign(params, idParams);
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
            query += ` AND (site_id = :site OR id = (SELECT supervisor_id FROM sites WHERE id = :site AND supervisor_id IS NOT NULL))`;
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
                   AND :date_val::date >= ta.start_date AND (ta.end_date IS NULL OR :date_val::date <= ta.end_date)
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
    const callerRole = (req as any).user.role;
    const callerId   = (req as any).user.id;
    const isPrivileged = callerRole === 'admin' || callerRole === 'system_admin';
    const isSelf = String(callerId) === String(id);

    try {
        const result = await execute<any>(
            `SELECT id, epf_number, name, role, status, site_id, inactivation_requested, basic_salary, ot_percentage, fix_salary, created_at FROM users WHERE id = :id`,
            [String(id)]
        );
        if (!result.rows || result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const user = result.rows[0];

        if (isPrivileged || isSelf) {
            return res.json(user);
        }

        if (callerRole === 'supervisor') {
            // Supervisors may view users on their own sites — without salary fields
            const siteCheck = await execute<any>(
                `SELECT 1 FROM sites WHERE supervisor_id = :callerId AND id = :siteId`,
                { callerId, siteId: user.SITE_ID }
            );
            if (siteCheck.rows && siteCheck.rows.length > 0) {
                const { BASIC_SALARY, OT_PERCENTAGE, FIX_SALARY, ...withoutSalary } = user;
                return res.json(withoutSalary);
            }
        }

        return res.status(403).json({ message: 'Forbidden' });
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

        const result = await execute<any>(
            `INSERT INTO users (epf_number, name, password, role, site_id, basic_salary, ot_percentage, fix_salary)
       VALUES (:epf_number, :name, :password, :role, :site_id, :basic_salary, :ot_percentage, :fix_salary)
       RETURNING id`,
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
        res.status(201).json({ message: 'User created', id: result.rows[0].ID });
    } catch (err: any) {
        if ((err as any)?.code === '23505') {
            return res.status(400).json({ message: 'User with this EPF number already exists' });
        }
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
    const isAdmin = userRole === 'admin' || userRole === 'system_admin';
    const isStaffManager = isAdmin || userRole === 'project_manager';

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
        // Project managers may manage staff/supervisor/project_manager accounts, but
        // not admin/system_admin accounts — staff management, not account takeover.
        if (userRole === 'project_manager' && !isSelf) {
            const targetResult = await execute<any>(`SELECT role FROM users WHERE id = :id`, { id: targetId });
            const targetRole = targetResult.rows?.[0]?.ROLE;
            if (targetRole === 'admin' || targetRole === 'system_admin') {
                return res.status(403).json({ message: 'Project managers cannot modify admin accounts' });
            }
        }

        let updates: string[] = [];
        const params: any = { id: targetId };

        // Admin / system_admin / project_manager fields
        if (isStaffManager) {
            if (status) {
                updates.push('status = :status');
                params.status = status;
                // When explicitly setting inactive, clear the supervisor flag
                if (status === 'inactive') {
                    updates.push('inactivation_requested = 0');
                }
            }
            if (site_id !== undefined)               { updates.push('site_id = :site_id');             params.site_id = site_id; }
            if (isAdmin && role)                     { updates.push('role = :role');                   params.role = role; }
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
        if (req.body.name && (isStaffManager || isSelf)) {
            updates.push('name = :name');
            params.name = req.body.name;
        }

        // Password: admin/system_admin can reset anyone's; self can change own.
        // project_manager is excluded — resetting another account's password is
        // account takeover, not staff management, even for non-admin targets.
        if (req.body.password && (isAdmin || isSelf)) {
            const hashed = await hashPassword(req.body.password);
            updates.push('password = :password');
            params.password = hashed;
        }

        if (inactivation_requested !== undefined) {
            updates.push('inactivation_requested = :inactivation_requested');
            params.inactivation_requested = inactivation_requested;
        }

        if (updates.length === 0) return res.json({ message: 'No changes' });

        updates.push('updated_at = CURRENT_TIMESTAMP');

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
