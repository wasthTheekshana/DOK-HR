import { Router } from 'express';
import { getTasks, createTask, updateTask, deleteTask, bulkSaveTasks, getTaskSummary, getTargetBaseReport, getOTAnalysisReport, getDailyCountReport } from '../controllers/taskController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);


router.get('/ot-analysis-report', requireRole(['admin']), getOTAnalysisReport);
router.get('/target-base-report', requireRole(['admin']), getTargetBaseReport);
router.get('/daily-summary', requireRole(['admin', 'system_admin']), getTaskSummary);
router.get('/summary', requireRole(['admin', 'supervisor']), getDailyCountReport);
router.get('/', getTasks);
router.post('/', requireRole(['admin', 'supervisor']), createTask);
router.patch('/bulk-save', requireRole(['admin', 'supervisor']), bulkSaveTasks);
router.patch('/:id', requireRole(['admin', 'supervisor']), updateTask);
router.delete('/:id', requireRole(['admin', 'supervisor']), deleteTask);

export default router;
