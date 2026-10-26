import { Router } from 'express';
import {
    getPublicSettings,
    getAllSettingsAdmin,
    updateSettingsAdmin,
} from '../controllers/setting.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';

const router = Router();

// ========================================================================
// Public Route (Frontend Landing Page, Floating WhatsApp, Header, Footer)
// ========================================================================
router.get('/', getPublicSettings);

// ========================================================================
// Admin CMS Settings Management Routes (Admin & Super Admin)
// ========================================================================
router.get('/admin', authenticateToken, requireRoles('admin', 'super_admin'), getAllSettingsAdmin);
router.put('/admin', authenticateToken, requireRoles('admin', 'super_admin'), updateSettingsAdmin);

export default router;
