import { Router } from 'express';
import { login, register } from '../controllers/authController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validationMiddleware';
import { loginSchema } from '../schemas/validationSchemas';

const router = Router();

router.post('/login', validateBody(loginSchema), login);
router.post('/register', authenticateToken, requireRole(['admin']), register);

export default router;
