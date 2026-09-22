import { Router } from 'express';
import {
    getApprovedTestimonials,
    submitTestimonial,
    getAllTestimonialsAdmin,
    toggleApproveTestimonial,
    deleteTestimonial,
} from '../controllers/testimonial.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';

const router = Router();

// Public Routes (Landing Page & Review Submission)
router.get('/', getApprovedTestimonials);
router.post('/', submitTestimonial);

// Admin CMS Moderation Routes
router.get('/all', authenticateToken, requireRoles('admin', 'super_admin'), getAllTestimonialsAdmin);
router.patch('/:id/approve', authenticateToken, requireRoles('admin', 'super_admin'), toggleApproveTestimonial);
router.delete('/:id', authenticateToken, requireRoles('admin', 'super_admin'), deleteTestimonial);

export default router;
