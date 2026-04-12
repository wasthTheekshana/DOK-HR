import { Router } from 'express';
import { getUsers, getUserById, updateUser, createUser, deleteUser } from '../controllers/userController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', requireRole(['admin', 'supervisor', 'staff', 'system_admin']), getUsers);
router.get('/:id', getUserById); // Users can view themselves? For now generally available or restricts
router.post('/', requireRole(['admin', 'system_admin']), createUser);
router.patch('/:id', requireRole(['admin', 'supervisor', 'system_admin']), updateUser);
router.delete('/:id', requireRole(['admin', 'system_admin']), deleteUser);

export default router;
