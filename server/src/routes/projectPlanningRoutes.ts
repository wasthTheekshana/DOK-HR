import { Router } from 'express';
import { getSitesPortfolio, updateSitePlan, updateSiteStage } from '../controllers/projectPlanningController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validationMiddleware';
import { updateSitePlanSchema, updateSiteStageSchema } from '../schemas/validationSchemas';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['project_manager']));

router.get('/sites', getSitesPortfolio);
router.put('/sites/:id', validateBody(updateSitePlanSchema), updateSitePlan);
router.put('/sites/:id/stage', validateBody(updateSiteStageSchema), updateSiteStage);

export default router;
