import type { Request, Response } from 'express';
import { query } from '../config/db.ts';

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
            fields.push(`avatar_url = $${index++}`);
            values.push(avatar_url.trim());
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

        await query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [targetUserId]);

        res.json({
            success: true,
            message: 'User berhasil dihapus (soft delete).',
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus user.' });
    }
}
