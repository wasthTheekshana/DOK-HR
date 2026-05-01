import { Router } from 'express';
import { getSites, getSiteById, createSite, updateSite, deleteSite } from '../controllers/siteController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validationMiddleware';
import { createSiteSchema, updateSiteSchema } from '../schemas/validationSchemas';

const router = Router();

router.use(authenticateToken);

router.get('/', getSites);
router.get('/:id', getSiteById);
router.post('/', requireRole(['admin']), validateBody(createSiteSchema), createSite);
router.put('/:id', requireRole(['admin']), validateBody(updateSiteSchema), updateSite);
router.delete('/:id', requireRole(['admin']), deleteSite);

export default router;
