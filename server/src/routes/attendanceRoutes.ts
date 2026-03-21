import { Router } from 'express';
import { getAttendance, createAttendance, getAttendanceReport } from '../controllers/attendanceController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getAttendance);
router.get('/report', getAttendanceReport);
router.post('/', requireRole(['admin', 'supervisor']), createAttendance);

export default router;
