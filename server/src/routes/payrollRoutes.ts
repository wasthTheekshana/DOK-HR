import { Router } from 'express';
import { getPayroll, calculatePayroll, getCustomOTReport, saveCustomOTReport, getCustomOTHistory, saveTargetPayroll, getSavedPayrollHistory } from '../controllers/payrollController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', requireRole(['admin', 'system_admin']), getPayroll);
router.post('/calculate', requireRole(['admin']), calculatePayroll);
router.get('/custom-ot-report', requireRole(['admin', 'system_admin']), getCustomOTReport);
router.post('/custom-ot-save', requireRole(['admin', 'system_admin']), saveCustomOTReport);
router.get('/custom-ot-history', requireRole(['admin', 'system_admin']), getCustomOTHistory);
router.post('/save-target', requireRole(['admin', 'system_admin']), saveTargetPayroll);
router.get('/saved-history', requireRole(['admin', 'system_admin']), getSavedPayrollHistory);

export default router;
