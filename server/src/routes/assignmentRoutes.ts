import { Router } from 'express';
import { getAssignments, createAssignment, updateAssignment, deleteAssignment } from '../controllers/assignmentController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

const MANAGER_ROLES = ['admin', 'system_admin', 'supervisor'];

router.get('/',       authenticateToken, getAssignments);
router.post('/',      authenticateToken, requireRole(MANAGER_ROLES), createAssignment);
router.patch('/:id',  authenticateToken, requireRole(MANAGER_ROLES), updateAssignment);
router.delete('/:id', authenticateToken, requireRole(MANAGER_ROLES), deleteAssignment);

export default router;
