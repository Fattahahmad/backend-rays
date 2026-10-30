import { Router } from 'express';
import {
    listProducts,
    getProductBySlug,
    createProduct,
    updateProduct,
    deleteProduct,
    addProductImage,
    deleteProductImage,
    setPrimaryProductImage,
} from '../controllers/product.controller.ts';
import { authenticateToken, optionalAuthenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';

const router = Router();

// Public Routes (Katalog Toko Online & Detail Barang)
// Menggunakan optionalAuthenticateToken agar admin dapat menyertakan parameter ?show_all=true
router.get('/', optionalAuthenticateToken, listProducts);
router.get('/:slug', getProductBySlug);

// Admin CMS Routes (Manajemen Produk & Galeri Foto)
router.post('/', authenticateToken, requireRoles('admin', 'super_admin'), createProduct);
router.patch('/:id', authenticateToken, requireRoles('admin', 'super_admin'), updateProduct);
router.delete('/:id', authenticateToken, requireRoles('admin', 'super_admin'), deleteProduct);

// Admin CMS Image Management
router.post('/:id/images', authenticateToken, requireRoles('admin', 'super_admin'), addProductImage);
router.delete('/images/:imageId', authenticateToken, requireRoles('admin', 'super_admin'), deleteProductImage);
router.patch('/:id/images/:imageId/primary', authenticateToken, requireRoles('admin', 'super_admin'), setPrimaryProductImage);

export default router;
