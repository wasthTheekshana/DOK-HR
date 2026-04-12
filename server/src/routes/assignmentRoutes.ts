import { Router } from 'express';
import { getAssignments, createAssignment, updateAssignment, deleteAssignment } from '../controllers/assignmentController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.get('/',     authenticateToken, getAssignments);
router.post('/',    authenticateToken, createAssignment);
router.patch('/:id', authenticateToken, updateAssignment);
router.delete('/:id', authenticateToken, deleteAssignment);

export default router;
