import { Router } from 'express';
import {
    checkoutOrder,
    getMyOrders,
    getOrderByNumber,
    cancelMyOrder,
    listAllOrdersAdmin,
    updateOrderShipping,
    updateOrderStatus,
} from '../controllers/order.controller.ts';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware.ts';

const router = Router();

// ==========================================
// Customer Order Routes (Authenticated)
// ==========================================
router.post('/checkout', authenticateToken, checkoutOrder);
router.get('/my-orders', authenticateToken, getMyOrders);
router.patch('/:orderNumber/cancel', authenticateToken, cancelMyOrder);

// ==========================================
// Admin CMS Order Routes (Admin / Super Admin)
// Note: Registered before /:orderNumber to avoid URL pattern collisions
// ==========================================
router.get('/admin', authenticateToken, requireRoles('admin', 'super_admin'), listAllOrdersAdmin);
router.get('/admin/all', authenticateToken, requireRoles('admin', 'super_admin'), listAllOrdersAdmin);
router.patch('/admin/:id/shipping', authenticateToken, requireRoles('admin', 'super_admin'), updateOrderShipping);
router.patch('/admin/:id/status', authenticateToken, requireRoles('admin', 'super_admin'), updateOrderStatus);

// ==========================================
// Detail Order Route (Customer / Admin)
// ==========================================
router.get('/:orderNumber', authenticateToken, getOrderByNumber);

export default router;
