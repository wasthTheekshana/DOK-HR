import { Router } from 'express';
import { getTasks, createTask, updateTask, deleteTask, bulkSaveTasks, getTaskSummary, getTargetBaseReport, getOTAnalysisReport, getDailyCountReport, getWeeklyOperationReport, getRevenueReport } from '../controllers/taskController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);


router.get('/weekly-operation-report', requireRole(['admin', 'system_admin', 'project_manager']), getWeeklyOperationReport);
router.get('/revenue-report', requireRole(['admin', 'system_admin', 'project_manager']), getRevenueReport);
router.get('/ot-analysis-report', requireRole(['admin', 'project_manager']), getOTAnalysisReport);
router.get('/target-base-report', requireRole(['admin', 'project_manager']), getTargetBaseReport);
router.get('/daily-summary', requireRole(['admin', 'system_admin', 'supervisor', 'project_manager']), getTaskSummary);
router.get('/summary', requireRole(['admin', 'supervisor', 'project_manager']), getDailyCountReport);
router.get('/', getTasks);
router.post('/', requireRole(['admin', 'supervisor', 'staff']), createTask);
router.patch('/bulk-save', requireRole(['admin', 'supervisor', 'staff']), bulkSaveTasks);
router.patch('/:id', requireRole(['admin', 'supervisor', 'staff']), updateTask);
router.delete('/:id', requireRole(['admin', 'supervisor']), deleteTask);

export default router;
