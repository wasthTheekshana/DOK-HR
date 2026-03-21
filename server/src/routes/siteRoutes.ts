import { Router } from 'express';
import { getSites, getSiteById, createSite, updateSite, deleteSite } from '../controllers/siteController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getSites);
router.get('/:id', getSiteById);
router.post('/', requireRole(['admin']), createSite);
router.put('/:id', requireRole(['admin']), updateSite);
router.delete('/:id', requireRole(['admin']), deleteSite);

export default router;
