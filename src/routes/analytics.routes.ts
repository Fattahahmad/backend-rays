import { Router } from 'express';
import { getRealtime, getOverview, trackMetaEvent } from '../controllers/analytics.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';

const router = Router();

// ========================================================================
// Public / Client Tracking Routes (Meta Conversions API Proxy)
// Digunakan oleh Frontend untuk meneruskan event seperti klik WhatsApp (Lead)
// ========================================================================
router.post('/meta-event', trackMetaEvent);

// ========================================================================
// Admin CMS Analytics Routes (Hanya Admin & Super Admin)
// ========================================================================
router.get('/realtime', authenticateToken, requireRoles('admin', 'super_admin'), getRealtime);
router.get('/overview', authenticateToken, requireRoles('admin', 'super_admin'), getOverview);

export default router;
