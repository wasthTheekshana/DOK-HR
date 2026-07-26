import { Router } from 'express';
import { getStages, createStage, updateStage, deleteStage } from '../controllers/stageController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validationMiddleware';
import { createStageSchema, updateStageSchema } from '../schemas/validationSchemas';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['project_manager']));

router.get('/', getStages);
router.post('/', validateBody(createStageSchema), createStage);
router.put('/:id', validateBody(updateStageSchema), updateStage);
router.delete('/:id', deleteStage);

export default router;
