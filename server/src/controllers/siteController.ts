import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';

export const getSites = async (req: Request, res: Response) => {
    const userRole = (req as any).user.role;
    const userId = (req as any).user.id;
    try {
        const { status: statusFilter } = req.query;

        let query = `SELECT s.id, s.site_no, s.name, s.supervisor_id, s.task_invoice_price, s.daily_target,
              s.ot_type, s.service_type, s.site_type, s.status,
              u.name as supervisor_name,
              status_counts.staff_count
       FROM sites s
       LEFT JOIN users u ON s.supervisor_id = u.id
       LEFT JOIN (
           SELECT site_id, COUNT(*) as staff_count
           FROM users
           WHERE status = 'active'
           GROUP BY site_id
       ) status_counts ON s.id = status_counts.site_id
       WHERE 1=1`;

        const params: any = {};

        if (userRole === 'supervisor') {
            query += ` AND s.supervisor_id = :userId`;
            params.userId = userId;
        }

        if (statusFilter && (statusFilter === 'active' || statusFilter === 'inactive')) {
            query += ` AND s.status = :statusFilter`;
            params.statusFilter = statusFilter;
        }

        query += ` ORDER BY s.status ASC, s.site_no ASC`;

        const result = await execute<any>(query, params);
        const sites = result.rows || [];

        const siteIds = sites.map((s: any) => s.ID);
        if (siteIds.length > 0) {
            const idParams = Object.fromEntries(siteIds.map((id: number, i: number) => [`sid${i}`, id]));
            const idPlaceholders = siteIds.map((_: number, i: number) => `:sid${i}`).join(', ');

            const taskTypesResult = await execute<any>(
                `SELECT site_id, task_name, invoice_price FROM site_task_types WHERE site_id IN (${idPlaceholders})`,
                idParams
            );
            const taskTypes = taskTypesResult.rows || [];

            const costFactorsResult = await execute<any>(
                `SELECT site_id, factor_key, factor_value FROM cost_varient WHERE site_id IN (${idPlaceholders}) ORDER BY id`,
                idParams
            );
            const costFactors = costFactorsResult.rows || [];

            sites.forEach((site: any) => {
                site.TASK_TYPES = taskTypes.filter((t: any) => t.SITE_ID === site.ID);
                site.COST_FACTORS = costFactors.filter((c: any) => c.SITE_ID === site.ID);
            });
        }

        res.json(sites);
    } catch (err) {
        console.error('getSites error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getSiteById = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const result = await execute<any>(
            `SELECT s.*, u.name as supervisor_name
       FROM sites s
       LEFT JOIN users u ON s.supervisor_id = u.id
       WHERE s.id = :id`,
            [String(id)]
        );
        if (!result.rows || result.rows.length === 0) {
            return res.status(404).json({ message: 'Site not found' });
        }

        const site = result.rows[0];

        const taskTypesResult = await execute<any>(
            `SELECT site_id, task_name, invoice_price FROM site_task_types WHERE site_id = :id`,
            [String(id)]
        );
        (site as any).TASK_TYPES = taskTypesResult.rows || [];

        const costFactorsResult = await execute<any>(
            `SELECT site_id, factor_key, factor_value FROM cost_varient WHERE site_id = :id ORDER BY id`,
            [String(id)]
        );
        (site as any).COST_FACTORS = costFactorsResult.rows || [];

        res.json(site);
    } catch (err) {
        console.error('getSiteById error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const createSite = async (req: Request, res: Response) => {
    const { site_no, name, supervisor_id, task_invoice_price, daily_target, ot_type, status, service_type, site_type, task_types, cost_factors } = req.body;
    try {
        const siteResult = await execute<any>(
            `INSERT INTO sites (site_no, name, supervisor_id, task_invoice_price, daily_target, ot_type, status, service_type, site_type)
             VALUES (:site_no, :name, :supervisor_id, :task_invoice_price, :daily_target, :ot_type, :status, :service_type, :site_type)
             RETURNING id`,
            {
                site_no,
                name,
                supervisor_id: supervisor_id || null,
                task_invoice_price: task_invoice_price || 0,
                daily_target: daily_target || 0,
                ot_type: ot_type || 'time_based',
                status: status || 'active',
                service_type: service_type || null,
                site_type: site_type || null,
            }
        );

        const newSiteId = siteResult.rows?.[0]?.ID;

        if (newSiteId && task_types && Array.isArray(task_types) && task_types.length > 0) {
            for (const task of task_types) {
                await execute(
                    `INSERT INTO site_task_types (site_id, task_name, invoice_price) VALUES (:site_id, :task_name, :invoice_price)`,
                    { site_id: newSiteId, task_name: task.task_name, invoice_price: task.invoice_price }
                );
            }
        }

        if (newSiteId && cost_factors && Array.isArray(cost_factors) && cost_factors.length > 0) {
            for (const factor of cost_factors) {
                if (factor.key && factor.key.trim()) {
                    await execute(
                        `INSERT INTO cost_varient (site_id, factor_key, factor_value) VALUES (:site_id, :factor_key, :factor_value)`,
                        { site_id: newSiteId, factor_key: factor.key.trim(), factor_value: factor.value || '' }
                    );
                }
            }
        }

        if (newSiteId && supervisor_id) {
            await execute(
                `UPDATE users SET site_id = :site_id WHERE id = :user_id`,
                { site_id: newSiteId, user_id: supervisor_id }
            );
        }

        res.status(201).json({ message: 'Site created successfully', id: newSiteId });
    } catch (err) {
        console.error('createSite error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateSite = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, supervisor_id, task_invoice_price, daily_target, ot_type, status, service_type, site_type, task_types, cost_factors } = req.body;
    try {
        await execute(
            `UPDATE sites
             SET name = :name,
                 supervisor_id = :supervisor_id,
                 task_invoice_price = :task_invoice_price,
                 daily_target = :daily_target,
                 ot_type = :ot_type,
                 status = :status,
                 service_type = :service_type,
                 site_type = :site_type,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = :id`,
            {
                name,
                supervisor_id: supervisor_id || null,
                task_invoice_price: task_invoice_price || 0,
                daily_target: daily_target || 0,
                ot_type: ot_type || 'time_based',
                status: status || 'active',
                service_type: service_type || null,
                site_type: site_type || null,
                id: String(id)
            }
        );

        if (task_types && Array.isArray(task_types)) {
            await execute(`DELETE FROM site_task_types WHERE site_id = :id`, { id: String(id) });
            for (const task of task_types) {
                await execute(
                    `INSERT INTO site_task_types (site_id, task_name, invoice_price) VALUES (:site_id, :task_name, :invoice_price)`,
                    { site_id: Number(id), task_name: task.task_name, invoice_price: task.invoice_price }
                );
            }
        }

        if (cost_factors && Array.isArray(cost_factors)) {
            await execute(`DELETE FROM cost_varient WHERE site_id = :id`, { id: String(id) });
            for (const factor of cost_factors) {
                if (factor.key && factor.key.trim()) {
                    await execute(
                        `INSERT INTO cost_varient (site_id, factor_key, factor_value) VALUES (:site_id, :factor_key, :factor_value)`,
                        { site_id: Number(id), factor_key: factor.key.trim(), factor_value: factor.value || '' }
                    );
                }
            }
        }

        if (supervisor_id) {
            await execute(
                `UPDATE users SET site_id = :site_id WHERE id = :user_id`,
                { site_id: Number(id), user_id: supervisor_id }
            );
        }

        res.json({ message: 'Site updated successfully' });
    } catch (err) {
        console.error('updateSite error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const patchSiteStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;
    if (status !== 'active' && status !== 'inactive') {
        return res.status(400).json({ message: 'status must be active or inactive' });
    }
    try {
        await execute(
            `UPDATE sites SET status = :status, updated_at = CURRENT_TIMESTAMP WHERE id = :id`,
            { status, id: String(id) }
        );
        res.json({ message: 'Site status updated' });
    } catch (err) {
        console.error('patchSiteStatus error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteSite = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await execute(`DELETE FROM sites WHERE id = :id`, [String(id)]);
        res.json({ message: 'Site deleted successfully' });
    } catch (err) {
        console.error('deleteSite error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
