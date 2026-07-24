import { Router } from 'express';
import { getKpiScores, saveKpiScore, getKpiHistory } from '../controllers/kpiController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validationMiddleware';
import { saveKpiScoreSchema } from '../schemas/validationSchemas';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['project_manager']));

router.get('/history', getKpiHistory);
router.get('/', getKpiScores);
router.post('/', validateBody(saveKpiScoreSchema), saveKpiScore);

export default router;
