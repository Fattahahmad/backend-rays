import type { Request, Response } from 'express';
import { query } from '../config/db.ts';

/**
 * GET /api/faqs (Public)
 * Mengambil daftar FAQ aktif untuk accordion di landing page
 */
export async function getFaqs(req: Request, res: Response): Promise<void> {
    try {
        const { category } = req.query;

        let sql = 'SELECT id, question, answer, category, order_index FROM faqs WHERE is_active = true';
        const params: any[] = [];

        if (category) {
            sql += ' AND category = $1';
            params.push(category);
        }

        sql += ' ORDER BY order_index ASC, id ASC';

        const result = await query(sql, params);

        res.json({
            success: true,
            data: result.rows,
        });
    } catch (error) {
        console.error('Get FAQs error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data FAQ.' });
    }
}

/**
 * GET /api/faqs/all (Admin / Super Admin Only)
 * Mengambil seluruh FAQ termasuk yang non-aktif untuk tabel CMS
 */
export async function getAllFaqsAdmin(req: Request, res: Response): Promise<void> {
    try {
        const result = await query(
            'SELECT id, question, answer, category, order_index, is_active, created_at, updated_at FROM faqs ORDER BY order_index ASC, id ASC'
        );

        res.json({
            success: true,
            data: result.rows,
        });
    } catch (error) {
        console.error('Get all FAQs admin error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data FAQ untuk CMS.' });
    }
}

/**
 * POST /api/faqs (Admin / Super Admin Only)
 * Menambah FAQ baru ke sistem
 */
export async function createFaq(req: Request, res: Response): Promise<void> {
    try {
        const { question, answer, category = 'general', order_index = 0, is_active = true } = req.body;

        if (!question || !answer) {
            res.status(400).json({ success: false, message: 'Pertanyaan (question) dan jawaban (answer) wajib diisi.' });
            return;
        }

        await query(
            'INSERT INTO faqs (question, answer, category, order_index, is_active) VALUES ($1, $2, $3, $4, $5)',
            [question.trim(), answer.trim(), category.trim(), Number(order_index) || 0, Boolean(is_active)]
        );

        const latestFaq = await query(
            'SELECT id, question, answer, category, order_index, is_active, created_at FROM faqs ORDER BY id DESC LIMIT 1'
        );

        res.status(201).json({
            success: true,
            message: 'FAQ berhasil ditambahkan.',
            data: latestFaq.rows[0],
        });
    } catch (error) {
        console.error('Create FAQ error:', error);
        res.status(500).json({ success: false, message: 'Gagal menambahkan FAQ baru.' });
    }
}

/**
 * PATCH /api/faqs/:id (Admin / Super Admin Only)
 * Mengubah konten FAQ, urutan, atau status aktif
 */
export async function updateFaq(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);
        const { question, answer, category, order_index, is_active } = req.body;

        const check = await query('SELECT id FROM faqs WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'FAQ tidak ditemukan.' });
            return;
        }

        const fields: string[] = [];
        const values: any[] = [];
        let index = 1;

        if (question !== undefined) {
            fields.push(`question = $${index++}`);
            values.push(question.trim());
        }

        if (answer !== undefined) {
            fields.push(`answer = $${index++}`);
            values.push(answer.trim());
        }

        if (category !== undefined) {
            fields.push(`category = $${index++}`);
            values.push(category.trim());
        }

        if (order_index !== undefined) {
            fields.push(`order_index = $${index++}`);
            values.push(Number(order_index));
        }

        if (is_active !== undefined) {
            fields.push(`is_active = $${index++}`);
            values.push(Boolean(is_active));
        }

        if (fields.length === 0) {
            res.status(400).json({ success: false, message: 'Tidak ada data FAQ yang diperbarui.' });
            return;
        }

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const updateSql = `UPDATE faqs SET ${fields.join(', ')} WHERE id = $${index}`;
        await query(updateSql, values);

        const updatedResult = await query('SELECT * FROM faqs WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'FAQ berhasil diperbarui.',
            data: updatedResult.rows[0],
        });
    } catch (error) {
        console.error('Update FAQ error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui FAQ.' });
    }
}

/**
 * DELETE /api/faqs/:id (Admin / Super Admin Only)
 * Menghapus FAQ dari database
 */
export async function deleteFaq(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);

        const check = await query('SELECT id FROM faqs WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'FAQ tidak ditemukan.' });
            return;
        }

        await query('DELETE FROM faqs WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'FAQ berhasil dihapus.',
        });
    } catch (error) {
        console.error('Delete FAQ error:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus FAQ.' });
    }
}
