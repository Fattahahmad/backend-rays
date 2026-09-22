import { Router } from 'express';
import {
    validateCoupon,
    listCouponsAdmin,
    createCoupon,
    updateCoupon,
    deleteCoupon,
} from '../controllers/coupon.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';

const router = Router();

// Public Route (Validasi Kupon di Keranjang / Checkout)
router.post('/validate', validateCoupon);

// Admin CMS Routes
router.get('/', authenticateToken, requireRoles('admin', 'super_admin'), listCouponsAdmin);
router.post('/', authenticateToken, requireRoles('admin', 'super_admin'), createCoupon);
router.patch('/:id', authenticateToken, requireRoles('admin', 'super_admin'), updateCoupon);
router.delete('/:id', authenticateToken, requireRoles('admin', 'super_admin'), deleteCoupon);

export default router;
