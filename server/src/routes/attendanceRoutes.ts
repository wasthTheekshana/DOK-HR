import { Router } from 'express';
import { getAttendance, createAttendance, getAttendanceReport } from '../controllers/attendanceController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validationMiddleware';
import { createAttendanceSchema } from '../schemas/validationSchemas';

const router = Router();

router.use(authenticateToken);

router.get('/', getAttendance);
router.get('/report', getAttendanceReport);
router.post('/', requireRole(['admin', 'supervisor']), validateBody(createAttendanceSchema), createAttendance);

export default router;
