import { Request, Response } from 'express';
import { execute, withTransaction } from '../db/dbUtils';

export const getStages = async (req: Request, res: Response) => {
    try {
        const result = await execute<any>(`SELECT id, name, sort_order, is_done FROM milestone_stages ORDER BY sort_order`);
        res.json(result.rows);
    } catch (err) {
        console.error('getStages error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const createStage = async (req: Request, res: Response) => {
    const { name } = req.body;
    try {
        const maxResult = await execute<any>(`SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM milestone_stages`);
        const nextOrder = Number(maxResult.rows[0].MAX_ORDER) + 1;
        const result = await execute<any>(
            `INSERT INTO milestone_stages (name, sort_order, is_done) VALUES (:name, :sort_order, false) RETURNING id`,
            { name, sort_order: nextOrder }
        );
        res.status(201).json({ message: 'Stage created', id: result.rows[0].ID });
    } catch (err) {
        console.error('createStage error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateStage = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, sort_order, is_done } = req.body;
    try {
        if (is_done === true) {
            await withTransaction(async (exec) => {
                await exec(`UPDATE milestone_stages SET is_done = false WHERE is_done = true`);
                await exec(
                    `UPDATE milestone_stages SET
                        name       = COALESCE(:name, name),
                        sort_order = COALESCE(:sort_order, sort_order),
                        is_done    = true
                     WHERE id = :id`,
                    { name: name ?? null, sort_order: sort_order ?? null, id: Number(id) }
                );
            });
        } else {
            await execute(
                `UPDATE milestone_stages SET
                    name       = COALESCE(:name, name),
                    sort_order = COALESCE(:sort_order, sort_order)
                 WHERE id = :id`,
                { name: name ?? null, sort_order: sort_order ?? null, id: Number(id) }
            );
        }
        res.json({ message: 'Stage updated' });
    } catch (err) {
        console.error('updateStage error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteStage = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const stageResult = await execute<any>(`SELECT is_done FROM milestone_stages WHERE id = :id`, { id: Number(id) });
        if (stageResult.rows.length === 0) {
            return res.status(404).json({ message: 'Stage not found' });
        }
        if (stageResult.rows[0].IS_DONE) {
            return res.status(409).json({ message: 'Cannot delete the done-stage. Promote another stage to done first.' });
        }
        const inUseResult = await execute<any>(`SELECT COUNT(*) AS count FROM project_milestones WHERE stage_id = :id`, { id: Number(id) });
        if (Number(inUseResult.rows[0].COUNT) > 0) {
            return res.status(409).json({ message: 'Cannot delete a stage that has milestones assigned to it.' });
        }
        await execute(`DELETE FROM milestone_stages WHERE id = :id`, { id: Number(id) });
        res.json({ message: 'Stage deleted' });
    } catch (err) {
        console.error('deleteStage error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
