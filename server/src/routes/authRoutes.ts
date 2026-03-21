import { Router } from 'express';
import { login, register } from '../controllers/authController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.post('/login', login);
router.post('/register', authenticateToken, requireRole(['admin']), register);

export default router;
