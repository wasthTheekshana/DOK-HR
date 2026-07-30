import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import { computeDeadlineRisk } from '../utils/kpiUtils';

export const getSitesPortfolio = async (req: Request, res: Response) => {
    try {
        const sitesResult = await execute<any>(
            `SELECT s.id, s.site_no, s.name, s.planned_start_date, s.planned_end_date, s.planned_headcount,
                    s.stage_id, s.stage_sort_order, s.ot_type, s.daily_target,
                    ms.name AS stage_name, ms.is_done AS stage_is_done,
                    COALESCE(hc.actual_headcount, 0) AS actual_headcount
             FROM sites s
             LEFT JOIN milestone_stages ms ON ms.id = s.stage_id
             LEFT JOIN (
                 SELECT site_id, COUNT(*) AS actual_headcount FROM users WHERE status = 'active' GROUP BY site_id
             ) hc ON hc.site_id = s.id
             ORDER BY s.stage_sort_order, s.site_no`
        );
        const sites = sitesResult.rows || [];
        const siteIds = sites.map((s: any) => s.ID);

        let kpiAverages: any[] = [];
        let monthlyTaskCounts: any[] = [];
        if (siteIds.length > 0) {
            const idParams = Object.fromEntries(siteIds.map((id: number, i: number) => [`sid${i}`, id]));
            const idPlaceholders = siteIds.map((_: number, i: number) => `:sid${i}`).join(', ');

            const currentPeriod = new Date().toISOString().slice(0, 7);
            const kpiResult = await execute<any>(
                `SELECT site_id, AVG(COALESCE(pm_score, auto_score)) AS avg_kpi
                 FROM staff_kpi_scores WHERE site_id IN (${idPlaceholders}) AND period = :currentPeriod
                 GROUP BY site_id`,
                { ...idParams, currentPeriod }
            );
            kpiAverages = kpiResult.rows || [];

            const monthlyResult = await execute<any>(
                `SELECT site_id, COALESCE(SUM(COALESCE(count, 0)), 0) AS actual_count
                 FROM tasks
                 WHERE site_id IN (${idPlaceholders}) AND ot_type = 'target_based'
                   AND task_date >= date_trunc('month', CURRENT_DATE)
                   AND task_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
                 GROUP BY site_id`,
                idParams
            );
            monthlyTaskCounts = monthlyResult.rows || [];
        }

        const today = new Date();
        const WORKING_DAYS_PER_MONTH = 22;
        const portfolio = sites.map((site: any) => {
            const kpiRow = kpiAverages.find((k: any) => k.SITE_ID === site.ID);
            const dailyTarget = Number(site.DAILY_TARGET) || 0;
            const isTargetBased = site.OT_TYPE === 'target_based' && dailyTarget > 0;
            const monthlyTarget = dailyTarget * WORKING_DAYS_PER_MONTH;
            const monthlyRow = monthlyTaskCounts.find((m: any) => m.SITE_ID === site.ID);
            const monthlyActual = monthlyRow ? Number(monthlyRow.ACTUAL_COUNT) : 0;

            return {
                ID: site.ID,
                SITE_NO: site.SITE_NO,
                NAME: site.NAME,
                PLANNED_START_DATE: site.PLANNED_START_DATE,
                PLANNED_END_DATE: site.PLANNED_END_DATE,
                PLANNED_HEADCOUNT: site.PLANNED_HEADCOUNT,
                ACTUAL_HEADCOUNT: site.ACTUAL_HEADCOUNT,
                UNDERSTAFFED: site.PLANNED_HEADCOUNT != null && site.ACTUAL_HEADCOUNT < site.PLANNED_HEADCOUNT,
                STAGE_ID: site.STAGE_ID,
                STAGE_NAME: site.STAGE_NAME,
                STAGE_SORT_ORDER: site.STAGE_SORT_ORDER,
                AVERAGE_KPI: kpiRow ? Number(kpiRow.AVG_KPI) : null,
                RISK: computeDeadlineRisk(site.PLANNED_END_DATE, !!site.STAGE_IS_DONE, today),
                MONTHLY_TARGET_PCT: isTargetBased ? Math.round((monthlyActual / monthlyTarget) * 100) : null,
            };
        });

        res.json(portfolio);
    } catch (err) {
        console.error('getSitesPortfolio error:', err);
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

export const updateSiteStage = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { stage_id, stage_sort_order } = req.body;
    try {
        await execute(
            `UPDATE sites SET
                stage_id         = COALESCE(:stage_id, stage_id),
                stage_sort_order = COALESCE(:stage_sort_order, stage_sort_order),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = :id`,
            {
                stage_id: stage_id ?? null,
                stage_sort_order: stage_sort_order ?? null,
                id: Number(id),
            }
        );
        res.json({ message: 'Site stage updated' });
    } catch (err) {
        console.error('updateSiteStage error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
