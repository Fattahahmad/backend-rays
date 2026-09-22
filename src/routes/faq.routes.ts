import { Router } from 'express';
import {
    getFaqs,
    getAllFaqsAdmin,
    createFaq,
    updateFaq,
    deleteFaq,
} from '../controllers/faq.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';

const router = Router();

// Public Route (Accordion Landing Page)
router.get('/', getFaqs);

// Admin CMS Routes
router.get('/all', authenticateToken, requireRoles('admin', 'super_admin'), getAllFaqsAdmin);
router.post('/', authenticateToken, requireRoles('admin', 'super_admin'), createFaq);
router.patch('/:id', authenticateToken, requireRoles('admin', 'super_admin'), updateFaq);
router.delete('/:id', authenticateToken, requireRoles('admin', 'super_admin'), deleteFaq);

export default router;
