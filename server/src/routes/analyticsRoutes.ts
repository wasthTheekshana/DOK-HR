import { Router } from 'express';
import {
    getWorkforceAnalytics,
    getTaskAnalytics,
    getAttendanceAnalytics,
    getPayrollAnalytics,
    getPerformanceAnalytics,
    getSiteAnalytics,
    getSiteCountTrend,
    getSitePerformanceAnalysis,
    getSiteProfitability,
    getInvoiceAnalysis,
    getSiteSnapshot,
    getTimeSitePerformance,
    getServiceMindmap,
    getServiceSiteDetail,
} from '../controllers/analyticsController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

// invoice-analysis is the one analytics endpoint the PM nav exposes; scoped precisely
// here (before the blanket admin/system_admin guard below) rather than widening it.
router.get('/invoice-analysis', requireRole(['admin', 'system_admin', 'project_manager']), getInvoiceAnalysis);

router.use(requireRole(['admin', 'system_admin']));

router.get('/workforce', getWorkforceAnalytics);
router.get('/tasks', getTaskAnalytics);
router.get('/attendance', getAttendanceAnalytics);
router.get('/payroll', getPayrollAnalytics);
router.get('/performance', getPerformanceAnalytics);
router.get('/sites', getSiteAnalytics);
router.get('/site-count-trend', getSiteCountTrend);
router.get('/site-performance', getSitePerformanceAnalysis);
router.get('/profitability', getSiteProfitability);
router.get('/site-snapshot/:site_id', getSiteSnapshot);
router.get('/time-site-performance', getTimeSitePerformance);
router.get('/service-mindmap', getServiceMindmap);
router.get('/service-site-detail/:site_id', getServiceSiteDetail);

export default router;
