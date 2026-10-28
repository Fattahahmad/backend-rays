import type { Request, Response } from 'express';
import { query } from '../config/db.ts';
import { deleteFileIfExists } from '../utils/file.util.ts';

/**
 * Helper untuk membuat URL slug yang rapi dari judul artikel
 */
function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')        // Ganti spasi dengan -
        .replace(/[^\w\-]+/g, '')    // Hapus karakter non-alfanumerik
        .replace(/\-\-+/g, '-')      // Ganti ganda - dengan tunggal
        .replace(/^-+/, '')          // Pangkas - di awal
        .replace(/-+$/, '');         // Pangkas - di akhir
}

/**
 * GET /api/blogs (Public)
 * Mengambil daftar artikel blog yang telah dipublikasikan (is_published = true)
 * Cocok untuk kartu preview di landing page atau halaman list artikel
 */
export async function listPublishedBlogs(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search as string;

        let whereClause = 'WHERE b.is_published = true';
        const params: any[] = [];
        let index = 1;

        if (search) {
            whereClause += ` AND (b.title ILIKE $${index} OR b.excerpt ILIKE $${index})`;
            params.push(`%${search.trim()}%`);
            index++;
        }

        const countResult = await query(`SELECT COUNT(*) as total FROM blogs b ${whereClause}`, params);
        const total = parseInt((countResult.rows[0] as any).total) || 0;

        const sql = `
            SELECT b.id, b.title, b.slug, b.excerpt, b.image_url, b.created_at, b.updated_at,
                   u.name as author_name, u.avatar_url as author_avatar
            FROM blogs b
            JOIN users u ON b.author_id = u.id
            ${whereClause}
            ORDER BY b.id DESC
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
        console.error('List blogs error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar artikel.' });
    }
}

/**
 * GET /api/blogs/:slug (Public)
 * Mengambil detail lengkap artikel berdasarkan slug, termasuk konten HTML WYSIWYG
 */
export async function getBlogBySlug(req: Request, res: Response): Promise<void> {
    try {
        const { slug } = req.params;

        const result = await query(
            `SELECT b.id, b.title, b.slug, b.excerpt, b.content, b.image_url, b.is_published, b.created_at, b.updated_at,
                    u.name as author_name, u.avatar_url as author_avatar, u.email as author_email
             FROM blogs b
             JOIN users u ON b.author_id = u.id
             WHERE b.slug = $1`,
            [slug]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Artikel tidak ditemukan.' });
            return;
        }

        const blog = result.rows[0];

        // Jika belum dipublish dan bukan admin, tolak akses
        if (!blog.is_published && (!req.user || !['admin', 'super_admin'].includes(req.user.role))) {
            res.status(404).json({ success: false, message: 'Artikel ini belum dipublikasikan.' });
            return;
        }

        res.json({
            success: true,
            data: blog,
        });
    } catch (error) {
        console.error('Get blog by slug error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil detail artikel.' });
    }
}

/**
 * GET /api/blogs/admin/all (Admin / Super Admin Only)
 * Mengambil seluruh artikel (draft maupun published) untuk CMS
 */
export async function listAllBlogsAdmin(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const countResult = await query('SELECT COUNT(*) as total FROM blogs');
        const total = parseInt((countResult.rows[0] as any).total) || 0;

        const result = await query(
            `SELECT b.id, b.title, b.slug, b.excerpt, b.image_url, b.is_published, b.created_at, b.updated_at,
                    u.name as author_name
             FROM blogs b
             JOIN users u ON b.author_id = u.id
             ORDER BY b.id DESC
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
        console.error('List all blogs admin error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil artikel untuk CMS.' });
    }
}

/**
 * POST /api/blogs (Admin / Super Admin Only)
 * Membuat artikel baru dengan konten HTML WYSIWYG & Banner Image
 */
export async function createBlog(req: Request, res: Response): Promise<void> {
    try {
        const authorId = req.user?.id;
        const { title, content, excerpt, image_url, is_published = true } = req.body;

        if (!title || !title.trim()) {
            res.status(400).json({ success: false, message: 'Judul artikel (title) wajib diisi.' });
            return;
        }

        if (!content || !content.trim()) {
            res.status(400).json({ success: false, message: 'Konten artikel (HTML content) wajib diisi.' });
            return;
        }

        // Generate base slug
        let baseSlug = slugify(title);
        if (!baseSlug) baseSlug = 'artikel-' + Date.now();

        // Pastikan slug unik
        let finalSlug = baseSlug;
        let counter = 1;
        while (true) {
            const check = await query('SELECT id FROM blogs WHERE slug = $1', [finalSlug]);
            if (check.rowCount === 0) break;
            finalSlug = `${baseSlug}-${counter++}`;
        }

        // Jika excerpt tidak dikirim, otomatis buat dari potongan awal konten (tanpa tag HTML)
        let finalExcerpt = excerpt;
        if (!finalExcerpt) {
            const strippedHtml = content.replace(/<[^>]*>?/gm, '').trim();
            finalExcerpt = strippedHtml.substring(0, 160) + (strippedHtml.length > 160 ? '...' : '');
        }

        await query(
            `INSERT INTO blogs (author_id, title, slug, excerpt, content, image_url, is_published)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                authorId,
                title.trim(),
                finalSlug,
                finalExcerpt,
                content, // String HTML murni dari editor WYSIWYG
                image_url ? image_url.trim() : null,
                Boolean(is_published),
            ]
        );

        const newBlogResult = await query(
            `SELECT b.id, b.title, b.slug, b.excerpt, b.content, b.image_url, b.is_published, b.created_at,
                    u.name as author_name
             FROM blogs b
             JOIN users u ON b.author_id = u.id
             WHERE b.slug = $1`,
            [finalSlug]
        );

        res.status(201).json({
            success: true,
            message: 'Artikel berhasil diterbitkan.',
            data: newBlogResult.rows[0],
        });
    } catch (error) {
        console.error('Create blog error:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat artikel baru.' });
    }
}

/**
 * PATCH /api/blogs/:id (Admin / Super Admin Only)
 * Memperbarui artikel (judul, konten HTML WYSIWYG, gambar banner, excerpt, publish status)
 */
export async function updateBlog(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);
        const { title, content, excerpt, image_url, is_published } = req.body;

        const check = await query('SELECT id, slug, title, image_url FROM blogs WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Artikel tidak ditemukan.' });
            return;
        }

        const fields: string[] = [];
        const values: any[] = [];
        let index = 1;

        if (title !== undefined) {
            fields.push(`title = $${index++}`);
            values.push(title.trim());

            // Jika judul berubah, update slug juga
            let newSlug = slugify(title);
            if (newSlug) {
                const slugCheck = await query('SELECT id FROM blogs WHERE slug = $1 AND id != $2', [newSlug, id]);
                if (slugCheck.rowCount > 0) {
                    newSlug = `${newSlug}-${Date.now().toString().slice(-4)}`;
                }
                fields.push(`slug = $${index++}`);
                values.push(newSlug);
            }
        }

        if (content !== undefined) {
            fields.push(`content = $${index++}`);
            values.push(content); // Mendukung HTML WYSIWYG
        }

        if (excerpt !== undefined) {
            fields.push(`excerpt = $${index++}`);
            values.push(excerpt.trim());
        }

        if (image_url !== undefined) {
            const newImageUrl = image_url ? image_url.trim() : null;
            fields.push(`image_url = $${index++}`);
            values.push(newImageUrl);

            // Bersihkan file gambar lama jika diganti
            if (check.rows[0].image_url && check.rows[0].image_url !== newImageUrl) {
                deleteFileIfExists(check.rows[0].image_url);
            }
        }

        if (is_published !== undefined) {
            fields.push(`is_published = $${index++}`);
            values.push(Boolean(is_published));
        }

        if (fields.length === 0) {
            res.status(400).json({ success: false, message: 'Tidak ada data artikel yang diperbarui.' });
            return;
        }

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const updateSql = `UPDATE blogs SET ${fields.join(', ')} WHERE id = $${index}`;
        await query(updateSql, values);

        const updatedResult = await query(
            `SELECT b.id, b.title, b.slug, b.excerpt, b.content, b.image_url, b.is_published, b.created_at, b.updated_at,
                    u.name as author_name
             FROM blogs b
             JOIN users u ON b.author_id = u.id
             WHERE b.id = $1`,
            [id]
        );

        res.json({
            success: true,
            message: 'Artikel berhasil diperbarui.',
            data: updatedResult.rows[0],
        });
    } catch (error) {
        console.error('Update blog error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui artikel.' });
    }
}

/**
 * DELETE /api/blogs/:id (Admin / Super Admin Only)
 * Menghapus artikel dari database dan membersihkan gambar dari storage
 */
export async function deleteBlog(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);

        const check = await query('SELECT id, image_url FROM blogs WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Artikel tidak ditemukan.' });
            return;
        }

        await query('DELETE FROM blogs WHERE id = $1', [id]);

        // Hapus file fisik gambar artikel jika tersimpan di uploads
        deleteFileIfExists(check.rows[0].image_url);

        res.json({
            success: true,
            message: 'Artikel berhasil dihapus.',
        });
    } catch (error) {
        console.error('Delete blog error:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus artikel.' });
    }
}
