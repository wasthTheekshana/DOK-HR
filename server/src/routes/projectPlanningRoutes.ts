import { Router } from 'express';
import {
    getSitesPortfolio, getSitePlan, updateSitePlan,
    createMilestone, updateMilestone, deleteMilestone,
    assignTaskToMilestone,
} from '../controllers/projectPlanningController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validationMiddleware';
import { updateSitePlanSchema, createMilestoneSchema, updateMilestoneSchema, assignMilestoneSchema } from '../schemas/validationSchemas';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['project_manager']));

router.get('/sites', getSitesPortfolio);
router.get('/sites/:id', getSitePlan);
router.put('/sites/:id', validateBody(updateSitePlanSchema), updateSitePlan);
router.post('/sites/:siteId/milestones', validateBody(createMilestoneSchema), createMilestone);
router.put('/milestones/:id', validateBody(updateMilestoneSchema), updateMilestone);
router.delete('/milestones/:id', deleteMilestone);
router.put('/tasks/:taskId/milestone', validateBody(assignMilestoneSchema), assignTaskToMilestone);

export default router;
