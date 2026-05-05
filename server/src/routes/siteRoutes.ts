import { Router } from 'express';
import { getSites, getSiteById, createSite, updateSite, patchSiteStatus, deleteSite } from '../controllers/siteController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validationMiddleware';
import { createSiteSchema, updateSiteSchema } from '../schemas/validationSchemas';

const router = Router();

router.use(authenticateToken);

router.get('/', getSites);
router.get('/:id', getSiteById);
router.post('/', requireRole(['admin', 'system_admin']), validateBody(createSiteSchema), createSite);
router.put('/:id', requireRole(['admin', 'system_admin']), validateBody(updateSiteSchema), updateSite);
router.patch('/:id/status', requireRole(['admin', 'system_admin']), patchSiteStatus);
router.delete('/:id', requireRole(['admin', 'system_admin']), deleteSite);

export default router;
