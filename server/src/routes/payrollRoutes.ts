import { Router } from 'express';
import {
    getPayroll, calculatePayroll, getCustomOTReport, saveCustomOTReport,
    getCustomOTHistory, saveTargetPayroll, getSavedPayrollHistory,
    getExtraUnitsSummary, deleteSavedBatch, updateSavedRecord,
} from '../controllers/payrollController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/',                 requireRole(['admin', 'system_admin', 'project_manager']), getPayroll);
router.post('/calculate',       requireRole(['admin', 'project_manager']),                 calculatePayroll);
router.get('/custom-ot-report', requireRole(['admin', 'system_admin', 'project_manager']), getCustomOTReport);
router.post('/custom-ot-save',  requireRole(['admin', 'system_admin', 'project_manager']), saveCustomOTReport);
router.get('/custom-ot-history',requireRole(['admin', 'system_admin', 'project_manager']), getCustomOTHistory);
router.post('/save-target',     requireRole(['admin', 'system_admin', 'project_manager']), saveTargetPayroll);
router.get('/saved-history',    requireRole(['admin', 'system_admin', 'project_manager']), getSavedPayrollHistory);
router.get('/extra-units',      requireRole(['admin', 'system_admin', 'project_manager']), getExtraUnitsSummary);
router.delete('/saved-batch',   requireRole(['admin', 'system_admin', 'project_manager']), deleteSavedBatch);
router.put('/saved-record/:id', requireRole(['admin', 'system_admin', 'project_manager']), updateSavedRecord);

export default router;
