import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
    getPublicBanners,
    getAdminBanners,
    getBannerById,
    createBanner,
    updateBanner,
    toggleBannerStatus,
    reorderBanners,
    deleteBanner,
} from '../controllers/banner.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';

const router = Router();

// Konfigurasi Multer khusus untuk Banner Promosi
const bannerStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const targetDir = path.join(process.cwd(), 'uploads', 'banners');
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        cb(null, targetDir);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `banner-${uniqueSuffix}${ext}`);
    },
});

const uploadBanner = multer({
    storage: bannerStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // Maksimal 2MB
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Format gambar tidak didukung! Hanya diperbolehkan JPG, PNG, atau WEBP.'));
        }
    },
});

// Middleware Multer yang fleksibel terhadap nama field (image, file, imageUrl, banner, dll)
const flexibleUploadBanner = (req: any, res: any, next: any) => {
    uploadBanner.any()(req, res, (err: any) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success: false, message: 'Ukuran file gambar melebihi batas maksimal 2MB.' });
            }
            return res.status(400).json({ success: false, message: err.message });
        }
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
            req.file = req.files[0];
        }
        next();
    });
};

const authAdmin = [authenticateToken, requireRoles('admin', 'super_admin')];

// ==========================================
// PUBLIC ROUTES
// ==========================================

// GET /api/banners -> Mengambil banner aktif untuk carousel/hero website
router.get('/', getPublicBanners);

// ==========================================
// ADMIN CMS ROUTES
// Mendukung pola REST standar (/api/banners) dan pola dengan prefix (/api/banners/admin)
// ==========================================

// GET Tabel Admin
router.get('/admin', authAdmin, getAdminBanners);
router.get('/admin/all', authAdmin, getAdminBanners);

// POST Tambah Banner Baru (Dukung /api/banners dan /api/banners/admin)
router.post('/admin', authAdmin, flexibleUploadBanner, createBanner);
router.post('/', authAdmin, flexibleUploadBanner, createBanner);

// PATCH Urutan Banner / Drag & Drop
router.patch('/admin/reorder', authAdmin, reorderBanners);
router.patch('/reorder', authAdmin, reorderBanners);

// PATCH Toggle Status Aktif/Nonaktif
router.patch('/admin/:id/status', authAdmin, toggleBannerStatus);
router.patch('/:id/status', authAdmin, toggleBannerStatus);

// PUT & PATCH Update Banner (Dukung /api/banners/:id dan /api/banners/admin/:id)
router.put('/admin/:id', authAdmin, flexibleUploadBanner, updateBanner);
router.put('/:id', authAdmin, flexibleUploadBanner, updateBanner);
router.patch('/admin/:id', authAdmin, flexibleUploadBanner, updateBanner);
router.patch('/:id', authAdmin, flexibleUploadBanner, updateBanner);

// DELETE Hapus Banner (Dukung /api/banners/:id dan /api/banners/admin/:id)
router.delete('/admin/:id', authAdmin, deleteBanner);
router.delete('/:id', authAdmin, deleteBanner);

// ==========================================
// PUBLIC DETAIL ROUTE
// ==========================================
// GET /api/banners/:id -> Mengambil detail 1 banner (setelah seluruh rute spesifik)
router.get('/:id', getBannerById);

export default router;
