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
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Format gambar tidak didukung! Hanya diperbolehkan JPG, PNG, atau WEBP.'));
        }
    },
});

// ==========================================
// PUBLIC ROUTES
// ==========================================

// GET /api/banners -> Mengambil banner aktif untuk carousel/hero website
router.get('/', getPublicBanners);

// GET /api/banners/:id -> Mengambil detail 1 banner
router.get('/:id', getBannerById);

// ==========================================
// ADMIN CMS ROUTES (Harus Login Admin / Super Admin)
// ==========================================
router.use('/admin', authenticateToken, requireRoles('admin', 'super_admin'));

// GET /api/banners/admin -> Tabel semua banner untuk admin
router.get('/admin', getAdminBanners);

// POST /api/banners/admin -> Tambah banner baru (bisa upload file 'image' atau kirim imageUrl)
router.post('/admin', uploadBanner.single('image'), createBanner);

// PUT /api/banners/admin/:id -> Edit banner (bisa upload file 'image' baru atau update teks)
router.put('/admin/:id', uploadBanner.single('image'), updateBanner);

// PATCH /api/banners/admin/:id/status -> Toggle status aktif/nonaktif
router.patch('/admin/:id/status', toggleBannerStatus);

// PATCH /api/banners/admin/reorder -> Ubah urutan slide (drag and drop)
router.patch('/admin/reorder', reorderBanners);

// DELETE /api/banners/admin/:id -> Hapus banner (soft delete)
router.delete('/admin/:id', deleteBanner);

export default router;
