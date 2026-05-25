import { Router } from 'express';
import {
    getInvoices, previewInvoice, saveInvoice, updateInvoice, deleteInvoice,
    bulkGenerateInvoices,
} from '../controllers/invoiceController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['admin', 'system_admin']));

router.get('/',               getInvoices);
router.post('/preview',       previewInvoice);
router.post('/bulk-generate', bulkGenerateInvoices);
router.post('/',              saveInvoice);
router.put('/:id',            updateInvoice);
router.delete('/:id',         deleteInvoice);

export default router;
