import { Router } from 'express';
import { getPoyaDays, addPoyaDay, updatePoyaDay, deletePoyaDay } from '../controllers/poyaController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.get('/', getPoyaDays);
router.post('/', authenticateToken, addPoyaDay);
router.put('/:id', authenticateToken, updatePoyaDay);
router.delete('/:id', authenticateToken, deletePoyaDay);

export default router;
