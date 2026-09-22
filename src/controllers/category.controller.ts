import type { Request, Response } from 'express';
import { query } from '../config/db.ts';

function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

/**
 * GET /api/categories (Public)
 * Mengambil daftar seluruh kategori produk beserta jumlah produk aktif di dalamnya
 */
export async function getCategories(req: Request, res: Response): Promise<void> {
    try {
        const sql = `
            SELECT c.id, c.name, c.slug, c.created_at,
                   COUNT(CASE WHEN p.deleted_at IS NULL AND p.is_active = true THEN 1 END) as product_count
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id
            GROUP BY c.id
            ORDER BY c.name ASC
        `;

        const result = await query(sql);

        const data = result.rows.map(row => ({
            ...row,
            product_count: parseInt(row.product_count) || 0,
        }));

        res.json({
            success: true,
            data,
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data kategori produk.' });
    }
}

/**
 * POST /api/categories (Admin / Super Admin Only)
 * Membuat kategori produk baru
 */
export async function createCategory(req: Request, res: Response): Promise<void> {
    try {
        const { name, slug } = req.body;

        if (!name || !name.trim()) {
            res.status(400).json({ success: false, message: 'Nama kategori wajib diisi.' });
            return;
        }

        const trimmedName = name.trim();
        let targetSlug = slug ? slugify(slug) : slugify(trimmedName);
        if (!targetSlug) targetSlug = 'kategori-' + Date.now();

        const checkExisting = await query('SELECT id FROM categories WHERE slug = $1', [targetSlug]);
        if (checkExisting.rowCount > 0) {
            res.status(400).json({ success: false, message: `Slug '${targetSlug}' sudah digunakan oleh kategori lain.` });
            return;
        }

        await query('INSERT INTO categories (name, slug) VALUES ($1, $2)', [trimmedName, targetSlug]);

        const newCategory = await query('SELECT * FROM categories WHERE slug = $1', [targetSlug]);

        res.status(201).json({
            success: true,
            message: 'Kategori produk berhasil ditambahkan.',
            data: newCategory.rows[0],
        });
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ success: false, message: 'Gagal menambahkan kategori.' });
    }
}

/**
 * PATCH /api/categories/:id (Admin / Super Admin Only)
 * Mengubah nama atau slug kategori produk
 */
export async function updateCategory(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);
        const { name, slug } = req.body;

        const check = await query('SELECT id, name, slug FROM categories WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Kategori tidak ditemukan.' });
            return;
        }

        const fields: string[] = [];
        const values: any[] = [];
        let index = 1;

        if (name !== undefined) {
            fields.push(`name = $${index++}`);
            values.push(name.trim());
        }

        if (slug !== undefined) {
            const cleanSlug = slugify(slug);
            const slugCheck = await query('SELECT id FROM categories WHERE slug = $1 AND id != $2', [cleanSlug, id]);
            if (slugCheck.rowCount > 0) {
                res.status(400).json({ success: false, message: `Slug '${cleanSlug}' sudah digunakan.` });
                return;
            }
            fields.push(`slug = $${index++}`);
            values.push(cleanSlug);
        }

        if (fields.length === 0) {
            res.status(400).json({ success: false, message: 'Tidak ada data kategori yang diperbarui.' });
            return;
        }

        values.push(id);
        await query(`UPDATE categories SET ${fields.join(', ')} WHERE id = $${index}`, values);

        const updated = await query('SELECT * FROM categories WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Kategori berhasil diperbarui.',
            data: updated.rows[0],
        });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui kategori.' });
    }
}

/**
 * DELETE /api/categories/:id (Admin / Super Admin Only)
 * Menghapus kategori (dilindungi jika masih ada produk yang menggunakan kategori ini)
 */
export async function deleteCategory(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);

        const check = await query('SELECT id, name FROM categories WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Kategori tidak ditemukan.' });
            return;
        }

        // Cek apakah masih ada produk yang menggunakan kategori ini
        const productCheck = await query(
            'SELECT id FROM products WHERE category_id = $1 AND deleted_at IS NULL LIMIT 1',
            [id]
        );

        if (productCheck.rowCount > 0) {
            res.status(400).json({
                success: false,
                message: `Kategori '${check.rows[0].name}' tidak dapat dihapus karena masih digunakan oleh produk aktif. Silakan pindahkan atau hapus produk terkait terlebih dahulu.`,
            });
            return;
        }

        await query('DELETE FROM categories WHERE id = $1', [id]);

        res.json({
            success: true,
            message: `Kategori '${check.rows[0].name}' berhasil dihapus.`,
        });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus kategori.' });
    }
}
