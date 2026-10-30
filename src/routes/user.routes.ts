import { Router, type Request, type Response, type NextFunction } from 'express';
import {
    getProfile,
    getUserDashboard,
    updateProfile,
    changePassword,
    getSecurityOverview,
    listDeviceSessions,
    logoutOtherSessions,
    revokeDeviceSession,
    listUsers,
    updateUserByAdmin,
    updateUserRole,
    deleteUser,
} from '../controllers/user.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';
import { upload } from '../config/multer.ts';

const router = Router();

// Middleware upload avatar
const handleAvatarUpload = (req: any, res: any, next: NextFunction) => {
    upload.single('avatar')(req, res, (err: any) => {
        if (err) {
            res.status(400).json({
                success: false,
                message: err.message || 'Format atau ukuran file avatar tidak valid (maksimal 2MB, format gambar: JPG, JPEG, PNG, WEBP, GIF, BMP, TIFF, HEIC, AVIF).',
            });
            return;
        }
        next();
    });
};

// Endpoint untuk user yang sedang login
router.get('/profile', authenticateToken, getProfile);
router.get('/dashboard', authenticateToken, getUserDashboard);
router.patch('/profile', authenticateToken, handleAvatarUpload, updateProfile);
router.patch('/change-password', authenticateToken, changePassword);

// Endpoint Keamanan Akun & Manajemen Sesi Perangkat
router.get('/security-overview', authenticateToken, getSecurityOverview);
router.get('/sessions', authenticateToken, listDeviceSessions);
router.post('/sessions/logout-others', authenticateToken, logoutOtherSessions);
router.delete('/sessions/:id', authenticateToken, revokeDeviceSession);

// Endpoint CMS khusus Admin & Super Admin
router.get('/', authenticateToken, requireRoles('admin', 'super_admin'), listUsers);
router.patch('/:id', authenticateToken, requireRoles('admin', 'super_admin'), handleAvatarUpload, updateUserByAdmin);

// Endpoint khusus Super Admin
router.patch('/:id/role', authenticateToken, requireRoles('super_admin'), updateUserRole);
router.delete('/:id', authenticateToken, requireRoles('super_admin'), deleteUser);

export default router;
