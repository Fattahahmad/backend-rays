import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { query } from '../config/db.ts';
import { deleteFileIfExists } from '../utils/file.util.ts';
import { convertAndSaveToWebp } from '../utils/image.util.ts';
import {
    extractDeviceInfo,
    parseDeviceSessions,
    removeDeviceSessionById,
    removeAllOtherSessions,
    formatRelativeTime,
    formatRelativeLogin,
} from '../utils/device.util.ts';

/**
 * Helper untuk memproses input avatar (path string, URL, atau Base64 image dikonversi ke WebP)
 */
async function processAvatarInput(avatarUrlInput?: string | null): Promise<string | null | undefined> {
    if (avatarUrlInput === undefined) return undefined;
    if (!avatarUrlInput || avatarUrlInput.trim() === '') return null;

    const trimmed = avatarUrlInput.trim();

    // Jika user/FE mengirimkan gambar dalam format Base64 (data:image/...;base64,...)
    if (trimmed.startsWith('data:image/')) {
        const matches = trimmed.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
            const buffer = Buffer.from(matches[2], 'base64');
            const processed = await convertAndSaveToWebp(buffer, 'avatars', 800, 800);
            return processed.relativeUrl;
        }
    }

    return trimmed;
}

/**
 * Helper untuk memformat data user (mengembalikan data bersih tanpa password dan refresh token mentah)
 */
export function formatUserData(_req: Request, user: any) {
    if (!user) return null;
    const { password, refresh_token, ...safeUser } = user;
    return safeUser;
}

/**
 * GET /api/users/profile
 * Mendapatkan data profil user yang sedang login beserta ringkasan status keamanan
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id;

        const result = await query(
            'SELECT id, name, email, google_id, avatar_url, phone_number, role, is_email_verified, refresh_token, created_at, updated_at FROM users WHERE id = $1 AND deleted_at IS NULL',
            [userId]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
            return;
        }

        const row = result.rows[0];
        const sessions = parseDeviceSessions(row.refresh_token);
        const lastActive = sessions.length > 0 ? sessions[sessions.length - 1].last_active : (row.updated_at || row.created_at);

        const safeUser = formatUserData(req, row);

        res.json({
            success: true,
            data: {
                ...safeUser,
                security: {
                    active_sessions_count: sessions.length,
                    active_sessions_label: sessions.length === 1 ? '1 perangkat sedang aktif' : `${sessions.length} perangkat sedang aktif`,
                    is_google_linked: Boolean(row.google_id),
                    last_login_at: lastActive,
                    last_login_text: formatRelativeLogin(lastActive),
                },
            },
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data profil.' });
    }
}

/**
 * PATCH /api/users/profile
 * Memperbarui profil user (nama, nomor handphone/WhatsApp, foto avatar)
 * Mendukung 2 cara:
 * 1. Direct File Upload via multipart/form-data (field 'avatar')
 * 2. JSON via application/json (field 'avatar_url')
 */
export async function updateProfile(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id;
        const { name } = req.body;
        let { avatar_url, remove_avatar } = req.body;
        const phone = req.body.phone_number !== undefined ? req.body.phone_number : (req.body.phoneNumber !== undefined ? req.body.phoneNumber : req.body.phone);

        // Jika user mengunggah file gambar avatar langsung via form-data
        if (req.file && req.file.buffer) {
            const folder = (req.query.folder as string) || 'avatars';
            const processed = await convertAndSaveToWebp(req.file.buffer, folder, 800, 800);
            avatar_url = processed.relativeUrl;
        } else if (avatar_url !== undefined) {
            avatar_url = await processAvatarInput(avatar_url);
        }

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

        // Hapus avatar jika remove_avatar bernilai true
        if (remove_avatar === 'true' || remove_avatar === true) {
            avatar_url = null;
        }

        if (avatar_url !== undefined || req.file || remove_avatar) {
            const newAvatar = avatar_url !== undefined ? avatar_url : null;
            fields.push(`avatar_url = $${index++}`);
            values.push(newAvatar);

            // Bersihkan file avatar lama jika diganti atau dihapus
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
            data: formatUserData(req, updatedResult.rows[0]),
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui profil.' });
    }
}

/**
 * PATCH /api/users/change-password
 * Mengubah kata sandi pengguna yang sedang login
 */
export async function changePassword(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id;
        const { old_password, new_password } = req.body;

        if (!new_password || new_password.length < 6) {
            res.status(400).json({ success: false, message: 'Kata sandi baru minimal 6 karakter.' });
            return;
        }

        const userResult = await query('SELECT password, email FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
        if (userResult.rowCount === 0) {
            res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
            return;
        }

        const user = userResult.rows[0];

        // Jika user sudah memiliki password, wajibkan verifikasi old_password
        if (user.password) {
            if (!old_password) {
                res.status(400).json({ success: false, message: 'Kata sandi lama wajib diisi.' });
                return;
            }

            const isMatch = await bcrypt.compare(old_password, user.password);
            if (!isMatch) {
                res.status(400).json({ success: false, message: 'Kata sandi lama yang Anda masukkan salah.' });
                return;
            }
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(new_password, salt);

        await query('UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hashedPassword, userId]);

        res.json({
            success: true,
            message: 'Kata sandi Anda berhasil diperbarui.',
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui kata sandi.' });
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
            data: usersResult.rows.map(u => formatUserData(req, u)),
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
 * PATCH /api/users/:id (Admin & Super Admin)
 * Memperbarui data pengguna dari CMS (nama, nomor handphone, role, avatar, status verifikasi email)
 */
export async function updateUserByAdmin(req: Request, res: Response): Promise<void> {
    try {
        const targetUserId = parseInt(req.params.id as string);
        if (!targetUserId) {
            res.status(400).json({ success: false, message: 'ID user tidak valid.' });
            return;
        }

        const { name, role, is_email_verified } = req.body;
        let { avatar_url, remove_avatar } = req.body;
        const phone = req.body.phone_number !== undefined ? req.body.phone_number : (req.body.phoneNumber !== undefined ? req.body.phoneNumber : req.body.phone);

        if (req.file && req.file.buffer) {
            const folder = (req.query.folder as string) || 'avatars';
            const processed = await convertAndSaveToWebp(req.file.buffer, folder, 800, 800);
            avatar_url = processed.relativeUrl;
        } else if (avatar_url !== undefined) {
            avatar_url = await processAvatarInput(avatar_url);
        }

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

        if (role !== undefined) {
            const validRoles = ['user', 'admin', 'super_admin'];
            if (!validRoles.includes(role)) {
                res.status(400).json({ success: false, message: `Role tidak valid. Pilihan: ${validRoles.join(', ')}` });
                return;
            }
            if (req.user?.id === targetUserId && role !== 'super_admin') {
                res.status(400).json({ success: false, message: 'Anda tidak dapat mengubah role akun Anda sendiri.' });
                return;
            }
            fields.push(`role = $${index++}`);
            values.push(role);
        }

        if (is_email_verified !== undefined) {
            fields.push(`is_email_verified = $${index++}`);
            values.push(is_email_verified === true || is_email_verified === 'true');
        }

        if (remove_avatar === 'true' || remove_avatar === true) {
            avatar_url = null;
        }

        if (avatar_url !== undefined || req.file || remove_avatar) {
            const newAvatar = avatar_url !== undefined ? avatar_url : null;
            fields.push(`avatar_url = $${index++}`);
            values.push(newAvatar);

            const userCheck = await query('SELECT avatar_url FROM users WHERE id = $1', [targetUserId]);
            const oldAvatar = userCheck.rows[0]?.avatar_url;
            if (oldAvatar && oldAvatar !== newAvatar) {
                deleteFileIfExists(oldAvatar);
            }
        }

        if (fields.length === 0) {
            res.status(400).json({ success: false, message: 'Tidak ada data yang diperbarui.' });
            return;
        }

        values.push(targetUserId);
        await query(`UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${index}`, values);

        const updatedResult = await query(
            'SELECT id, name, email, phone_number, role, avatar_url, is_email_verified, created_at FROM users WHERE id = $1',
            [targetUserId]
        );

        res.json({
            success: true,
            message: 'Data user berhasil diperbarui.',
            data: formatUserData(req, updatedResult.rows[0]),
        });
    } catch (error) {
        console.error('Update user by admin error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui user.' });
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
        const waSetting = await query("SELECT value FROM settings WHERE `key` = 'whatsapp_number' LIMIT 1");
        const whatsappNumber = waSetting.rows[0]?.value || '6281234567890';

        res.json({
            success: true,
            message: 'Ringkasan dashboard akun berhasil dimuat.',
            data: {
                user: formatUserData(req, user),
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

/**
 * GET /api/users/security-overview
 * Mengambil ringkasan keamanan akun:
 * - Jumlah perangkat & sesi aktif beserta label badge
 * - Status koneksi Google OAuth
 * - Waktu & label aktivitas login terakhir
 * - Status keberadaan kata sandi manual
 */
export async function getSecurityOverview(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id;
        const result = await query(
            'SELECT id, email, google_id, password, refresh_token, created_at, updated_at FROM users WHERE id = $1 AND deleted_at IS NULL',
            [userId]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
            return;
        }

        const user = result.rows[0];
        const sessions = parseDeviceSessions(user.refresh_token);

        // Cari timestamp aktivitas login paling baru dari sesi aktif atau tanggal registrasi/update
        let lastLoginAt = user.updated_at || user.created_at;
        if (sessions.length > 0) {
            const sortedByActive = [...sessions].sort(
                (a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime()
            );
            lastLoginAt = sortedByActive[0].last_active;
        }

        const count = sessions.length;
        const activeSessionsLabel = count === 1 ? '1 perangkat sedang aktif' : `${count} perangkat sedang aktif`;

        res.json({
            success: true,
            message: 'Ringkasan keamanan akun berhasil diambil.',
            data: {
                active_sessions_count: count,
                active_sessions_label: activeSessionsLabel,
                is_active: count > 0,
                is_google_linked: Boolean(user.google_id),
                google_linked_label: user.google_id ? 'Dapat digunakan untuk login cepat' : 'Belum terhubung ke akun Google',
                last_login_at: lastLoginAt,
                last_login_text: formatRelativeLogin(lastLoginAt),
                has_password: Boolean(user.password),
            },
        });
    } catch (error) {
        console.error('Get security overview error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil ringkasan keamanan akun.' });
    }
}

/**
 * GET /api/users/sessions
 * Mengambil detail seluruh perangkat & sesi yang sedang aktif
 */
export async function listDeviceSessions(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id;
        const result = await query(
            'SELECT refresh_token FROM users WHERE id = $1 AND deleted_at IS NULL',
            [userId]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
            return;
        }

        const raw = result.rows[0].refresh_token;
        const sessions = parseDeviceSessions(raw);

        // Identifikasi sesi perangkat yang sedang digunakan saat ini (is_current)
        const incomingToken =
            (req.headers['x-refresh-token'] as string) ||
            req.body?.refreshToken ||
            (req.query?.refreshToken as string);

        const currentDevice = extractDeviceInfo(req);

        let currentSessionId: string | null = null;

        if (incomingToken) {
            const matched = sessions.find((s) => s.token === incomingToken);
            if (matched) currentSessionId = matched.id;
        }

        // Fallback pencocokan jika token refresh tidak dikirimkan langsung di header
        if (!currentSessionId && sessions.length > 0) {
            const matchedByDevice = sessions.find(
                (s) => s.ip_address === currentDevice.ip_address && s.os === currentDevice.os
            );
            if (matchedByDevice) {
                currentSessionId = matchedByDevice.id;
            } else {
                currentSessionId = sessions[sessions.length - 1].id;
            }
        }

        // Format hasil tanpa membocorkan refresh token asli
        const formatted = sessions.map((sess) => {
            const isCurrent = sess.id === currentSessionId;
            return {
                id: sess.id,
                is_current: isCurrent,
                device_name: sess.device_name,
                device_type: sess.device_type,
                browser: sess.browser,
                os: sess.os,
                ip_address: sess.ip_address,
                last_active: sess.last_active,
                last_active_label: isCurrent ? 'Perangkat ini (Aktif sekarang)' : formatRelativeTime(sess.last_active),
                created_at: sess.created_at,
            };
        });

        // Urutkan: sesi perangkat saat ini paling atas, lalu urut last_active terbaru
        formatted.sort((a, b) => {
            if (a.is_current) return -1;
            if (b.is_current) return 1;
            return new Date(b.last_active).getTime() - new Date(a.last_active).getTime();
        });

        res.json({
            success: true,
            message: 'Daftar sesi perangkat aktif berhasil diambil.',
            total_active: formatted.length,
            data: formatted,
        });
    } catch (error) {
        console.error('List device sessions error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar sesi perangkat.' });
    }
}

/**
 * POST /api/users/sessions/logout-others
 * Mengakhiri seluruh sesi di perangkat lain kecuali perangkat yang sedang digunakan
 */
export async function logoutOtherSessions(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id;
        const result = await query(
            'SELECT refresh_token FROM users WHERE id = $1 AND deleted_at IS NULL',
            [userId]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
            return;
        }

        const raw = result.rows[0].refresh_token;
        const sessions = parseDeviceSessions(raw);

        if (sessions.length <= 1) {
            res.json({
                success: true,
                message: 'Tidak ada sesi di perangkat lain yang aktif.',
                terminated_count: 0,
            });
            return;
        }

        // Cari token atau ID sesi saat ini
        const incomingToken =
            (req.headers['x-refresh-token'] as string) ||
            req.body?.refreshToken ||
            (req.query?.refreshToken as string);

        let currentTokenOrId = incomingToken;

        if (!currentTokenOrId) {
            const currentDevice = extractDeviceInfo(req);
            const matched = sessions.find(
                (s) => s.ip_address === currentDevice.ip_address && s.os === currentDevice.os
            );
            currentTokenOrId = matched ? matched.id : sessions[sessions.length - 1].id;
        }

        const newRaw = removeAllOtherSessions(raw, currentTokenOrId);
        await query('UPDATE users SET refresh_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newRaw, userId]);

        const terminatedCount = sessions.length - 1;

        res.json({
            success: true,
            message: `Berhasil keluar dari ${terminatedCount} perangkat lain. Sesi perangkat ini tetap aktif.`,
            terminated_count: terminatedCount,
        });
    } catch (error) {
        console.error('Logout other sessions error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengakhiri sesi perangkat lain.' });
    }
}

/**
 * DELETE /api/users/sessions/:id
 * Mengakhiri satu sesi perangkat tertentu berdasarkan ID sesi
 */
export async function revokeDeviceSession(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id;
        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        if (!sessionId) {
            res.status(400).json({ success: false, message: 'ID sesi perangkat wajib disertakan.' });
            return;
        }

        const result = await query(
            'SELECT refresh_token FROM users WHERE id = $1 AND deleted_at IS NULL',
            [userId]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
            return;
        }

        const raw = result.rows[0].refresh_token;
        const sessions = parseDeviceSessions(raw);
        const targetSession = sessions.find((s) => s.id === sessionId);

        if (!targetSession) {
            res.status(404).json({
                success: false,
                message: 'Sesi perangkat tidak ditemukan atau sudah berakhir sebelumnya.',
            });
            return;
        }

        const newRaw = removeDeviceSessionById(raw, sessionId);
        await query('UPDATE users SET refresh_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newRaw, userId]);

        res.json({
            success: true,
            message: `Sesi pada perangkat "${targetSession.device_name}" berhasil diakhiri.`,
        });
    } catch (error) {
        console.error('Revoke device session error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengakhiri sesi perangkat.' });
    }
}
