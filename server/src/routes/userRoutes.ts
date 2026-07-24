import { Router } from 'express';
import { getUsers, getUserById, updateUser, createUser, deleteUser } from '../controllers/userController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validationMiddleware';
import { createUserSchema, updateUserSchema } from '../schemas/validationSchemas';

const router = Router();

router.use(authenticateToken);

router.get('/', requireRole(['admin', 'supervisor', 'staff', 'system_admin', 'project_manager']), getUsers);
router.get('/:id', getUserById);
router.post('/', requireRole(['admin', 'system_admin']), validateBody(createUserSchema), createUser);
router.patch('/:id', requireRole(['admin', 'supervisor', 'system_admin', 'project_manager']), validateBody(updateUserSchema), updateUser);
router.delete('/:id', requireRole(['admin', 'system_admin']), deleteUser);

export default router;
