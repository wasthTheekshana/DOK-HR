import { Request, Response } from 'express';
import { execute, withTransaction } from '../db/dbUtils';
import { computeMilestoneRisk, worstRisk } from '../utils/kpiUtils';

export const getSitesPortfolio = async (req: Request, res: Response) => {
    try {
        const sitesResult = await execute<any>(
            `SELECT s.id, s.site_no, s.name, s.planned_start_date, s.planned_end_date, s.planned_headcount,
                    COALESCE(hc.actual_headcount, 0) AS actual_headcount
             FROM sites s
             LEFT JOIN (
                 SELECT site_id, COUNT(*) AS actual_headcount FROM users WHERE status = 'active' GROUP BY site_id
             ) hc ON hc.site_id = s.id
             ORDER BY s.site_no`
        );
        const sites = sitesResult.rows || [];
        const siteIds = sites.map((s: any) => s.ID);

        let milestones: any[] = [];
        let kpiAverages: any[] = [];
        if (siteIds.length > 0) {
            const idParams = Object.fromEntries(siteIds.map((id: number, i: number) => [`sid${i}`, id]));
            const idPlaceholders = siteIds.map((_: number, i: number) => `:sid${i}`).join(', ');

            const milestonesResult = await execute<any>(
                `SELECT pm.id, pm.site_id, pm.name, pm.due_date, pm.sort_order, pm.stage_id, ms.name AS stage_name, ms.is_done
                 FROM project_milestones pm
                 JOIN milestone_stages ms ON ms.id = pm.stage_id
                 WHERE pm.site_id IN (${idPlaceholders}) ORDER BY pm.site_id, pm.sort_order`,
                idParams
            );
            milestones = milestonesResult.rows || [];

            const currentPeriod = new Date().toISOString().slice(0, 7);
            const kpiResult = await execute<any>(
                `SELECT site_id, AVG(COALESCE(pm_score, auto_score)) AS avg_kpi
                 FROM staff_kpi_scores WHERE site_id IN (${idPlaceholders}) AND period = :currentPeriod
                 GROUP BY site_id`,
                { ...idParams, currentPeriod }
            );
            kpiAverages = kpiResult.rows || [];
        }

        const today = new Date();
        const portfolio = sites.map((site: any) => {
            const siteMilestones = milestones.filter((m: any) => m.SITE_ID === site.ID);
            const doneCount = siteMilestones.filter((m: any) => m.IS_DONE).length;
            const currentStage = siteMilestones.find((m: any) => !m.IS_DONE) || siteMilestones[siteMilestones.length - 1] || null;
            const risks = siteMilestones.map((m: any) => computeMilestoneRisk(m.DUE_DATE, m.IS_DONE, today));
            const kpiRow = kpiAverages.find((k: any) => k.SITE_ID === site.ID);

            return {
                ID: site.ID,
                SITE_NO: site.SITE_NO,
                NAME: site.NAME,
                PLANNED_START_DATE: site.PLANNED_START_DATE,
                PLANNED_END_DATE: site.PLANNED_END_DATE,
                PLANNED_HEADCOUNT: site.PLANNED_HEADCOUNT,
                ACTUAL_HEADCOUNT: site.ACTUAL_HEADCOUNT,
                UNDERSTAFFED: site.PLANNED_HEADCOUNT != null && site.ACTUAL_HEADCOUNT < site.PLANNED_HEADCOUNT,
                CURRENT_STAGE: currentStage ? currentStage.STAGE_NAME : null,
                MILESTONE_PROGRESS_PCT: siteMilestones.length > 0 ? Math.round((doneCount / siteMilestones.length) * 100) : 0,
                AVERAGE_KPI: kpiRow ? Number(kpiRow.AVG_KPI) : null,
                RISK: worstRisk(risks),
            };
        });

        res.json(portfolio);
    } catch (err) {
        console.error('getSitesPortfolio error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getSitePlan = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const siteResult = await execute<any>(
            `SELECT id, site_no, name, planned_start_date, planned_end_date, planned_headcount FROM sites WHERE id = :id`,
            { id: Number(id) }
        );
        if (!siteResult.rows || siteResult.rows.length === 0) {
            return res.status(404).json({ message: 'Site not found' });
        }

        const milestonesResult = await execute<any>(
            `SELECT pm.id, pm.site_id, pm.name, pm.description, pm.due_date, pm.sort_order, pm.stage_id, ms.name AS stage_name, ms.is_done
             FROM project_milestones pm
             JOIN milestone_stages ms ON ms.id = pm.stage_id
             WHERE pm.site_id = :id ORDER BY pm.sort_order`,
            { id: Number(id) }
        );
        const today = new Date();
        const milestones = (milestonesResult.rows || []).map((m: any) => ({
            ...m,
            RISK: computeMilestoneRisk(m.DUE_DATE, m.IS_DONE, today),
        }));

        res.json({ ...siteResult.rows[0], MILESTONES: milestones });
    } catch (err) {
        console.error('getSitePlan error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateSitePlan = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { planned_start_date, planned_end_date, planned_headcount } = req.body;
    try {
        await execute(
            `UPDATE sites SET
                planned_start_date = COALESCE(:planned_start_date, planned_start_date),
                planned_end_date   = COALESCE(:planned_end_date, planned_end_date),
                planned_headcount  = COALESCE(:planned_headcount, planned_headcount),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = :id`,
            {
                planned_start_date: planned_start_date ?? null,
                planned_end_date: planned_end_date ?? null,
                planned_headcount: planned_headcount ?? null,
                id: Number(id),
            }
        );
        res.json({ message: 'Site plan updated' });
    } catch (err) {
        console.error('updateSitePlan error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const createMilestone = async (req: Request, res: Response) => {
    const { siteId } = req.params;
    const { name, description, due_date, stage_id, sort_order } = req.body;
    const userId = (req as any).user.id;
    try {
        let resolvedStageId = stage_id;
        if (!resolvedStageId) {
            const defaultStage = await execute<any>(`SELECT id FROM milestone_stages ORDER BY sort_order ASC LIMIT 1`);
            resolvedStageId = defaultStage.rows[0]?.ID ?? null;
        }
        const result = await execute<any>(
            `INSERT INTO project_milestones (site_id, name, description, due_date, stage_id, sort_order, created_by)
             VALUES (:site_id, :name, :description, :due_date, :stage_id, :sort_order, :created_by)
             RETURNING id`,
            {
                site_id: Number(siteId),
                name,
                description: description ?? null,
                due_date: due_date ?? null,
                stage_id: resolvedStageId,
                sort_order: sort_order ?? 0,
                created_by: userId,
            }
        );
        res.status(201).json({ message: 'Milestone created', id: result.rows[0].ID });
    } catch (err) {
        console.error('createMilestone error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateMilestone = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description, due_date, stage_id, sort_order } = req.body;
    try {
        await execute(
            `UPDATE project_milestones SET
                name        = COALESCE(:name, name),
                description = COALESCE(:description, description),
                due_date    = COALESCE(:due_date, due_date),
                stage_id    = COALESCE(:stage_id, stage_id),
                sort_order  = COALESCE(:sort_order, sort_order)
             WHERE id = :id`,
            {
                name: name ?? null,
                description: description ?? null,
                due_date: due_date ?? null,
                stage_id: stage_id ?? null,
                sort_order: sort_order ?? null,
                id: Number(id),
            }
        );
        res.json({ message: 'Milestone updated' });
    } catch (err) {
        console.error('updateMilestone error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteMilestone = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await execute(`DELETE FROM project_milestones WHERE id = :id`, { id: Number(id) });
        res.json({ message: 'Milestone deleted' });
    } catch (err) {
        console.error('deleteMilestone error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const assignTaskToMilestone = async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const { milestone_id } = req.body;
    try {
        await execute(
            `UPDATE tasks SET milestone_id = :milestone_id, updated_at = CURRENT_TIMESTAMP WHERE id = :id`,
            { milestone_id: milestone_id ?? null, id: Number(taskId) }
        );
        res.json({ message: 'Task milestone assignment updated' });
    } catch (err) {
        console.error('assignTaskToMilestone error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
