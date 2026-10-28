import type { Request, Response } from 'express';
import { query } from '../config/db.ts';
import { deleteFileIfExists } from '../utils/file.util.ts';

/**
 * GET /api/users/profile
 * Mendapatkan data profil user yang sedang login
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id;

        const result = await query(
            'SELECT id, name, email, google_id, avatar_url, phone_number, role, is_email_verified, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
            [userId]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
            return;
        }

        res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data profil.' });
    }
}

/**
 * PATCH /api/users/profile
 * Memperbarui profil user (nama, nomor handphone/WhatsApp, avatar)
 */
export async function updateProfile(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id;
        const { name, avatar_url } = req.body;
        const phone = req.body.phone_number !== undefined ? req.body.phone_number : (req.body.phoneNumber !== undefined ? req.body.phoneNumber : req.body.phone);

        const fields: string[] = [];
        const values: any[] = [];
        let index = 1;

        if (name !== undefined) {
            fields.push(`name = $${index++}`);
            values.push(name.trim());
        }

        if (phone !== undefined) {
            fields.push(`phone_number = $${index++}`);
            values.push(phone ? String(phone).trim() : null);
        }

        if (avatar_url !== undefined) {
            const newAvatar = avatar_url ? avatar_url.trim() : null;
            fields.push(`avatar_url = $${index++}`);
            values.push(newAvatar);

            // Bersihkan file avatar lama jika diganti
            const userCheck = await query('SELECT avatar_url FROM users WHERE id = $1', [userId]);
            const oldAvatar = userCheck.rows[0]?.avatar_url;
            if (oldAvatar && oldAvatar !== newAvatar) {
                deleteFileIfExists(oldAvatar);
            }
        }

        if (fields.length === 0) {
            res.status(400).json({ success: false, message: 'Tidak ada data yang diperbarui.' });
            return;
        }

        values.push(userId);
        const updateSql = `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${index}`;

        await query(updateSql, values);

        const updatedResult = await query(
            'SELECT id, name, email, avatar_url, phone_number, role, is_email_verified FROM users WHERE id = $1',
            [userId]
        );

        res.json({
            success: true,
            message: 'Profil berhasil diperbarui.',
            data: updatedResult.rows[0],
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui profil.' });
    }
}

/**
 * GET /api/users (Admin / Super Admin Only)
 * Melihat seluruh daftar user untuk CMS
 */
export async function listUsers(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const role = req.query.role as string;
        const search = req.query.search as string;

        let whereClause = 'WHERE deleted_at IS NULL';
        const params: any[] = [];
        let paramIndex = 1;

        if (role) {
            whereClause += ` AND role = $${paramIndex++}`;
            params.push(role);
        }

        if (search) {
            whereClause += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR phone_number ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        const countResult = await query(`SELECT COUNT(*) as total FROM users ${whereClause}`, params);
        const total = parseInt((countResult.rows[0] as any).total) || 0;

        const sql = `
            SELECT id, name, email, phone_number, role, avatar_url, is_email_verified, created_at
            FROM users
            ${whereClause}
            ORDER BY id DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex}
        `;
        params.push(limit, offset);

        const usersResult = await query(sql, params);

        res.json({
            success: true,
            data: usersResult.rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('List users error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar user.' });
    }
}

/**
 * PATCH /api/users/:id/role (Super Admin Only)
 * Mengubah role user (user <-> admin <-> super_admin)
 */
export async function updateUserRole(req: Request, res: Response): Promise<void> {
    try {
        const targetUserId = parseInt(req.params.id as string);
        const { role } = req.body;

        const validRoles = ['user', 'admin', 'super_admin'];
        if (!role || !validRoles.includes(role)) {
            res.status(400).json({
                success: false,
                message: `Role tidak valid. Pilihan: ${validRoles.join(', ')}`,
            });
            return;
        }

        // Mencegah super admin mendowngrade dirinya sendiri jika satu-satunya
        if (req.user?.id === targetUserId && role !== 'super_admin') {
            res.status(400).json({
                success: false,
                message: 'Anda tidak dapat mengubah role akun Anda sendiri.',
            });
            return;
        }

        await query('UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [role, targetUserId]);

        res.json({
            success: true,
            message: `Role user berhasil diubah menjadi '${role}'.`,
        });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengubah role user.' });
    }
}

/**
 * DELETE /api/users/:id (Super Admin Only)
 * Soft delete user dari sistem
 */
export async function deleteUser(req: Request, res: Response): Promise<void> {
    try {
        const targetUserId = parseInt(req.params.id as string);

        if (req.user?.id === targetUserId) {
            res.status(400).json({
                success: false,
                message: 'Anda tidak dapat menghapus akun Anda sendiri.',
            });
            return;
        }

        const check = await query('SELECT avatar_url FROM users WHERE id = $1', [targetUserId]);
        await query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [targetUserId]);

        // Bersihkan avatar dari storage jika ada
        if (check.rows[0]?.avatar_url) {
            deleteFileIfExists(check.rows[0].avatar_url);
        }

        res.json({
            success: true,
            message: 'User berhasil dihapus (soft delete).',
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus user.' });
    }
}

/**
 * GET /api/users/dashboard (Authenticated)
 * Mengambil ringkasan data profil akun, poin kilau, counter statistik, dan pesanan aktif terakhir
 * Digunakan untuk merender halaman Akun Customer di Mobile/Web App
 */
export async function getUserDashboard(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id;

        // 1. Data User Profile
        const userRes = await query(
            'SELECT id, name, email, google_id, avatar_url, phone_number, role, is_email_verified, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
            [userId]
        );

        if (userRes.rowCount === 0) {
            res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
            return;
        }

        const user = userRes.rows[0];

        // 2. Loyalty Points (Poin Kilau) - Mock/default 1250 sesuai kebutuhan tampilan saat ini
        const loyaltyPoints = 1250;

        // 3. Counter Statistik (100% Real Database, transaksi DIY dihilangkan)
        const [activeOrdersCount, couponsCount] = await Promise.all([
            query(
                "SELECT COUNT(*) as count FROM orders WHERE user_id = $1 AND status IN ('pending_payment', 'paid', 'processing', 'shipped')",
                [userId]
            ),
            query(
                "SELECT COUNT(*) as count FROM coupons WHERE is_active = true"
            ),
        ]);

        const pesananAktifCount = parseInt(activeOrdersCount.rows[0]?.count || '0', 10);
        const kuponProdukCount = parseInt(couponsCount.rows[0]?.count || '0', 10);

        // 4. Pesanan Aktif / Sedang Dikirim
        // Diambil berdasarkan prioritas: 'shipped' (paling urgent) > 'processing' > 'paid', lalu terbaru (created_at DESC)
        const activeOrdersRes = await query(
            `SELECT o.*, p.payment_type, p.status as payment_status
             FROM orders o
             LEFT JOIN payments p ON p.order_id = o.id
             WHERE o.user_id = $1 AND o.status IN ('paid', 'processing', 'shipped')
             ORDER BY 
                 CASE o.status 
                     WHEN 'shipped' THEN 1 
                     WHEN 'processing' THEN 2 
                     WHEN 'paid' THEN 3 
                     ELSE 4 
                 END ASC,
                 o.created_at DESC
             LIMIT 5`,
            [userId]
        );

        const activeShipments: any[] = [];

        for (const ord of activeOrdersRes.rows) {
            const itemsRes = await query(
                `SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_checkout as price,
                        p.name, p.slug,
                        (
                            SELECT pi.image_url 
                            FROM product_images pi 
                            WHERE pi.product_id = p.id 
                            ORDER BY pi.is_primary DESC, pi.id ASC 
                            LIMIT 1
                        ) as image_url
                 FROM order_items oi
                 JOIN products p ON oi.product_id = p.id
                 WHERE oi.order_id = $1`,
                [ord.id]
            );

            // Tentukan status dan stepper tahapan pengiriman
            let currentStep = 1;
            let statusLabel = 'Diproses';
            if (ord.status === 'processing') {
                currentStep = 2;
                statusLabel = 'Sedang Dikemas';
            } else if (ord.status === 'shipped') {
                currentStep = 3;
                statusLabel = 'Dalam Perjalanan';
            }

            activeShipments.push({
                order_id: ord.id,
                order_number: ord.order_number,
                status: ord.status,
                status_label: statusLabel,
                courier: ord.courier ? `${ord.courier} ${ord.courier_service || ''}`.trim() : 'SiCepat Cargo',
                tracking_number: ord.tracking_number || `RAY-EXP-${ord.id}`,
                estimated_delivery: 'Hari Ini (Pkl 15:00 WIB)',
                courier_driver: 'Pak Jajang (SiCepat Express Hub Serpong)',
                stepper: {
                    current_step: currentStep,
                    steps: [
                        { key: 'diproses', label: 'DIPROSES', completed: currentStep >= 1 },
                        { key: 'dikemas', label: 'DIKEMAS', completed: currentStep >= 2 },
                        { key: 'dikirim', label: 'DIKIRIM', completed: currentStep >= 3 },
                        { key: 'diantar', label: 'DIANTAR', completed: currentStep >= 4, active: currentStep === 3 },
                    ],
                },
                items: itemsRes.rows.map(item => ({
                    id: item.id,
                    product_id: item.product_id,
                    name: item.name,
                    slug: item.slug,
                    image_url: item.image_url,
                    quantity: item.quantity,
                    unit: 'botol',
                    price: Number(item.price),
                    subtotal: Number(item.price) * item.quantity,
                })),
                subtotal: Number(ord.subtotal || 0),
                shipping_cost: Number(ord.shipping_cost || 0),
                discount_amount: Number(ord.discount_amount || 0),
                grand_total: Number(ord.grand_total || 0),
                shipping_label: ord.shipping_cost === 0 ? 'Gratis Ongkir' : `Rp ${ord.shipping_cost}`,
                payment_method: ord.payment_type ? ord.payment_type.toUpperCase().replace('_', ' ') : 'BCA Virtual Account',
                payment_status: ord.payment_status || 'settlement',
            });
        }

        // Jika user belum memiliki pesanan dan mengirimkan query ?demo=true, berikan mock untuk preview frontend
        let primaryShipment: any = activeShipments[0] || null;
        if (!primaryShipment && req.query.demo === 'true') {
            primaryShipment = {
                order_id: 101,
                order_number: 'RAY-EXP-88910283',
                status: 'shipped',
                status_label: 'Dalam Perjalanan',
                courier: 'SiCepat Cargo',
                tracking_number: 'RAY-EXP-88910283',
                estimated_delivery: 'Hari Ini (Pkl 15:00 WIB)',
                courier_driver: 'Pak Jajang (SiCepat Express Hub Serpong)',
                stepper: {
                    current_step: 3,
                    steps: [
                        { key: 'diproses', label: 'DIPROSES', completed: true },
                        { key: 'dikemas', label: 'DIKEMAS', completed: true },
                        { key: 'dikirim', label: 'DIKIRIM', completed: true },
                        { key: 'diantar', label: 'DIANTAR', completed: false, active: true },
                    ],
                },
                items: [
                    {
                        id: 1,
                        name: 'HydroGloss Ceramic Wash & Wax (946ml)',
                        image_url: '/images/products/product-1.jpg',
                        quantity: 1,
                        unit: 'botol',
                        price: 175000,
                        subtotal: 175000,
                    },
                    {
                        id: 2,
                        name: 'GlassShield Waterspot & Rain Repellent',
                        image_url: '/images/products/product-2.jpg',
                        quantity: 1,
                        unit: 'botol',
                        price: 135000,
                        subtotal: 135000,
                    },
                ],
                subtotal: 310000,
                shipping_cost: 0,
                discount_amount: 0,
                grand_total: 310000,
                shipping_label: 'Gratis Ongkir',
                payment_method: 'BCA Virtual Account',
                payment_status: 'settlement',
                is_demo: true,
            };
        }

        // 5. Pengaturan Kontak CS (WhatsApp)
        const waSetting = await query("SELECT value FROM settings WHERE key = 'whatsapp_number' LIMIT 1");
        const whatsappNumber = waSetting.rows[0]?.value || '6281234567890';

        res.json({
            success: true,
            message: 'Ringkasan dashboard akun berhasil dimuat.',
            data: {
                user,
                loyalty_points: {
                    points: loyaltyPoints,
                    formatted: loyaltyPoints.toLocaleString('id-ID'),
                    label: 'Poin Kilau',
                },
                stats: {
                    pesanan_aktif: pesananAktifCount,
                    kupon_produk: kuponProdukCount,
                },
                active_shipment: primaryShipment,
                active_shipments: activeShipments,
                total_active_shipments: activeShipments.length,
                saved_addresses: [
                    { id: 1, label: 'Rumah Maxwell', is_primary: true },
                    { id: 2, label: 'Kantor Sudirman', is_primary: false },
                ],
                support_whatsapp: whatsappNumber,
            },
        });
    } catch (error) {
        console.error('Get user dashboard error:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat ringkasan dashboard akun.' });
    }
}
