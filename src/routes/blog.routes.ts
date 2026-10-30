import { Router, type NextFunction } from 'express';
import {
    listPublishedBlogs,
    getBlogBySlug,
    listAllBlogsAdmin,
    getBlogByIdAdmin,
    createBlog,
    updateBlog,
    deleteBlog,
    uploadArticleImage,
} from '../controllers/blog.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';
import { upload } from '../config/multer.ts';

const router = Router();

// Middleware upload gambar artikel Tiptap/WYSIWYG
const handleArticleImageUpload = (req: any, res: any, next: NextFunction) => {
    upload.single('image')(req, res, (err: any) => {
        if (err) {
            res.status(400).json({
                success: false,
                message: err.message || 'Format atau ukuran file gambar tidak valid (maksimal 2MB, format gambar: JPG, PNG, WEBP, GIF, BMP, TIFF, HEIC, AVIF).',
            });
            return;
        }
        next();
    });
};

// ==========================================
// 1. ADMIN CMS ROUTES
// ==========================================

// Upload Gambar Artikel untuk Tiptap Editor (POST /articles/admin/images)
router.post(
    '/admin/images',
    authenticateToken,
    requireRoles('admin', 'super_admin'),
    handleArticleImageUpload,
    uploadArticleImage
);

// Daftar Semua Artikel untuk CMS (Mendukung filter status DRAFT / PUBLISHED)
router.get('/admin', authenticateToken, requireRoles('admin', 'super_admin'), listAllBlogsAdmin);
router.get('/admin/all', authenticateToken, requireRoles('admin', 'super_admin'), listAllBlogsAdmin);

// Detail Artikel berdasarkan ID untuk Form Edit CMS
router.get('/admin/:id', authenticateToken, requireRoles('admin', 'super_admin'), getBlogByIdAdmin);

// Simpan Artikel Baru (POST /articles/admin atau POST /blogs)
router.post('/', authenticateToken, requireRoles('admin', 'super_admin'), createBlog);
router.post('/admin', authenticateToken, requireRoles('admin', 'super_admin'), createBlog);

// Update Artikel (PUT & PATCH /articles/admin/:id atau /blogs/:id)
router.put('/:id', authenticateToken, requireRoles('admin', 'super_admin'), updateBlog);
router.put('/admin/:id', authenticateToken, requireRoles('admin', 'super_admin'), updateBlog);
router.patch('/:id', authenticateToken, requireRoles('admin', 'super_admin'), updateBlog);
router.patch('/admin/:id', authenticateToken, requireRoles('admin', 'super_admin'), updateBlog);

// Hapus Artikel (DELETE /articles/admin/:id atau /blogs/:id)
router.delete('/:id', authenticateToken, requireRoles('admin', 'super_admin'), deleteBlog);
router.delete('/admin/:id', authenticateToken, requireRoles('admin', 'super_admin'), deleteBlog);

// ==========================================
// 2. PUBLIC ROUTES (Pembaca & Landing Page)
// ==========================================
router.get('/', listPublishedBlogs);
router.get('/detail/:slug', getBlogBySlug);
router.get('/:slug', getBlogBySlug);

export default router;
