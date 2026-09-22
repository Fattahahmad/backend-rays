import { Router } from 'express';
import {
    listPublishedBlogs,
    getBlogBySlug,
    listAllBlogsAdmin,
    createBlog,
    updateBlog,
    deleteBlog,
} from '../controllers/blog.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';

const router = Router();

// Public Routes (Pembaca Website & Landing Page)
router.get('/', listPublishedBlogs);
router.get('/detail/:slug', getBlogBySlug);

// Admin CMS Routes (Penerbitan & Editor WYSIWYG)
router.get('/admin/all', authenticateToken, requireRoles('admin', 'super_admin'), listAllBlogsAdmin);
router.post('/', authenticateToken, requireRoles('admin', 'super_admin'), createBlog);
router.patch('/:id', authenticateToken, requireRoles('admin', 'super_admin'), updateBlog);
router.delete('/:id', authenticateToken, requireRoles('admin', 'super_admin'), deleteBlog);

export default router;
