import { Router } from 'express';
import {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
} from '../controllers/category.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';

const router = Router();

// Public Route (Filter Kategori di Etalase Toko)
router.get('/', getCategories);

// Admin CMS Routes
router.post('/', authenticateToken, requireRoles('admin', 'super_admin'), createCategory);
router.patch('/:id', authenticateToken, requireRoles('admin', 'super_admin'), updateCategory);
router.delete('/:id', authenticateToken, requireRoles('admin', 'super_admin'), deleteCategory);

export default router;
