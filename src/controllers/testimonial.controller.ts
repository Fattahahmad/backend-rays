import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.ts';
import type { AuthUser } from '../types/auth.ts';
import { deleteFileIfExists } from '../utils/file.util.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'rays_autocare_secret_key_2026';

/**
 * Helper untuk mengekstrak user jika token dikirimkan (opsional untuk submit review)
 */
function getOptionalUser(req: Request): AuthUser | null {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return null;

    try {
        return jwt.verify(token, JWT_SECRET) as AuthUser;
    } catch {
        return null;
    }
}

/**
 * GET /api/testimonials (Public)
 * Mengambil ulasan yang sudah disetujui (is_approved = true) untuk Social Proof di Landing Page
 */
export async function getApprovedTestimonials(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 10;
        const offset = (page - 1) * limit;

        const countResult = await query('SELECT COUNT(*) as total FROM testimonials WHERE is_approved = true');
        const total = parseInt((countResult.rows[0] as any).total, 10) || 0;

        const result = await query(
            `SELECT id, customer_name, car_type, avatar_url, rating, content, created_at
             FROM testimonials
             WHERE is_approved = true
             ORDER BY id DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get approved testimonials error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data ulasan pelanggan.' });
    }
}

/**
 * POST /api/testimonials (Public / Authenticated User)
 * Customer mengirimkan ulasan baru (masuk antrean moderasi: is_approved = false)
 */
export async function submitTestimonial(req: Request, res: Response): Promise<void> {
    try {
        const user = getOptionalUser(req);
        const { customer_name, car_type, avatar_url, rating, content } = req.body;

        const finalName = customer_name || user?.email?.split('@')[0] || 'Pelanggan Rays';
        const finalRating = Number(rating);

        if (!finalRating || finalRating < 1 || finalRating > 5) {
            res.status(400).json({ success: false, message: 'Rating harus bernilai angka antara 1 sampai 5.' });
            return;
        }

        if (!content || !content.trim()) {
            res.status(400).json({ success: false, message: 'Isi ulasan (content) wajib diisi.' });
            return;
        }

        await query(
            `INSERT INTO testimonials (user_id, customer_name, car_type, avatar_url, rating, content, is_approved)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                user ? user.id : null,
                finalName.trim(),
                car_type ? car_type.trim() : null,
                avatar_url ? avatar_url.trim() : null,
                finalRating,
                content.trim(),
                false, // default false agar dimoderasi admin
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Terima kasih atas ulasan Anda! Ulasan akan tampil di website setelah disetujui oleh admin.',
        });
    } catch (error) {
        console.error('Submit testimonial error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengirimkan ulasan.' });
    }
}

/**
 * GET /api/testimonials/all (Admin / Super Admin Only)
 * Melihat seluruh ulasan dengan filter status moderasi untuk panel CMS
 */
export async function getAllTestimonialsAdmin(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const status = req.query.status as string; // 'approved', 'pending', or all

        let whereClause = '';
        const params: any[] = [];
        let index = 1;

        if (status === 'approved') {
            whereClause = 'WHERE is_approved = true';
        } else if (status === 'pending') {
            whereClause = 'WHERE is_approved = false';
        }

        const countResult = await query(`SELECT COUNT(*) as total FROM testimonials ${whereClause}`);
        const total = parseInt((countResult.rows[0] as any).total) || 0;

        const sql = `
            SELECT t.id, t.user_id, t.customer_name, t.car_type, t.avatar_url, t.rating, t.content, t.is_approved, t.created_at,
                   u.email as user_email
            FROM testimonials t
            LEFT JOIN users u ON t.user_id = u.id
            ${whereClause}
            ORDER BY t.id DESC
            LIMIT $${index++} OFFSET $${index}
        `;
        params.push(limit, offset);

        const result = await query(sql, params);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get all testimonials admin error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar ulasan untuk CMS.' });
    }
}

/**
 * PATCH /api/testimonials/:id/approve (Admin / Super Admin Only)
 * Menyetujui atau membatalkan persetujuan ulasan
 */
export async function toggleApproveTestimonial(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);
        const { is_approved } = req.body;

        const check = await query('SELECT id, is_approved FROM testimonials WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Ulasan tidak ditemukan.' });
            return;
        }

        const newStatus = is_approved !== undefined ? Boolean(is_approved) : !check.rows[0].is_approved;

        await query('UPDATE testimonials SET is_approved = $1 WHERE id = $2', [newStatus, id]);

        res.json({
            success: true,
            message: newStatus ? 'Ulasan berhasil disetujui untuk tampil di website.' : 'Ulasan dinonaktifkan dari website.',
            data: { id, is_approved: newStatus },
        });
    } catch (error) {
        console.error('Toggle approve testimonial error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui status ulasan.' });
    }
}

/**
 * DELETE /api/testimonials/:id (Admin / Super Admin Only)
 * Menghapus ulasan yang tidak pantas
 */
export async function deleteTestimonial(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);

        const check = await query('SELECT id, avatar_url FROM testimonials WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Ulasan tidak ditemukan.' });
            return;
        }

        await query('DELETE FROM testimonials WHERE id = $1', [id]);

        // Bersihkan file avatar dari storage jika ada
        deleteFileIfExists(check.rows[0].avatar_url);

        res.json({
            success: true,
            message: 'Ulasan berhasil dihapus.',
        });
    } catch (error) {
        console.error('Delete testimonial error:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus ulasan.' });
    }
}
