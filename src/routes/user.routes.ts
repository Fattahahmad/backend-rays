import { Router } from 'express';
import {
    getProfile,
    getUserDashboard,
    updateProfile,
    listUsers,
    updateUserRole,
    deleteUser,
} from '../controllers/user.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';

const router = Router();

// Endpoint untuk user yang sedang login
router.get('/profile', authenticateToken, getProfile);
router.get('/dashboard', authenticateToken, getUserDashboard);
router.patch('/profile', authenticateToken, updateProfile);

// Endpoint CMS khusus Admin & Super Admin
router.get('/', authenticateToken, requireRoles('admin', 'super_admin'), listUsers);

// Endpoint khusus Super Admin
router.patch('/:id/role', authenticateToken, requireRoles('super_admin'), updateUserRole);
router.delete('/:id', authenticateToken, requireRoles('super_admin'), deleteUser);

export default router;
