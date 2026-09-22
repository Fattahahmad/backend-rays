import { Router } from 'express';
import { getAuditLogs } from '../controllers/audit.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';

const router = Router();

// Endpoint Eksklusif Super Admin: Melihat Riwayat Audit Log
router.get('/', authenticateToken, requireRoles('super_admin'), getAuditLogs);

export default router;
