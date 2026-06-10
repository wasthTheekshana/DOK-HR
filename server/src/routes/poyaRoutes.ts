import { Router } from 'express';
import { getPoyaDays, addPoyaDay, updatePoyaDay, deletePoyaDay } from '../controllers/poyaController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.get('/', getPoyaDays);
router.post('/', authenticateToken, requireRole(['admin', 'system_admin']), addPoyaDay);
router.put('/:id', authenticateToken, requireRole(['admin', 'system_admin']), updatePoyaDay);
router.delete('/:id', authenticateToken, requireRole(['admin', 'system_admin']), deletePoyaDay);

export default router;
