import { Router } from 'express';
import {
    startConversation,
    getConversationMessages,
    sendMessageHttp,
    listAdminConversations,
    updateConversationStatus,
} from '../controllers/chat.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';

const router = Router();

// ========================================================================
// Client / Public Web Chat Routes
// ========================================================================
router.post('/start', startConversation);
router.get('/conversations/:id/messages', getConversationMessages);
router.post('/conversations/:id/messages', sendMessageHttp);

// ========================================================================
// Admin CMS Live Chat Management Routes (Admin & Super Admin)
// ========================================================================
router.get('/admin/conversations', authenticateToken, requireRoles('admin', 'super_admin'), listAdminConversations);
router.patch('/admin/conversations/:id/status', authenticateToken, requireRoles('admin', 'super_admin'), updateConversationStatus);

export default router;
