import type { Request, Response } from 'express';
import { query } from '../config/db.ts';
import { deleteFileIfExists } from '../utils/file.util.ts';
import { convertAndSaveToWebp } from '../utils/image.util.ts';
import {
    sanitizeArticleHtml,
    slugify,
    calculateReadingTime,
    extractExcerpt,
    extractImageUrls,
    generateArticleJsonLd,
} from '../utils/blog.util.ts';

/**
 * POST /api/blogs/admin/images (atau /api/articles/admin/images)
 * Mengunggah gambar dari editor Tiptap/WYSIWYG:
 * 1. Memvalidasi tipe MIME dan mengonversi gambar ke .webp dengan kompresi teroptimasi.
 * 2. Menghapus EXIF metadata demi keamanan dan ukuran ringan.
 * 3. Menghasilkan nama file yang SEO-friendly berdasarkan alt text.
 * 4. Menyimpan record metadata ke tabel article_media.
 * 5. Mengembalikan response dengan dimensi width & height agar tidak terjadi CLS (Cumulative Layout Shift).
 */
export async function uploadArticleImage(req: Request, res: Response): Promise<void> {
    try {
        const file = req.file;
        if (!file || !file.buffer) {
            res.status(400).json({
                success: false,
                message: 'File gambar artikel (field "image") wajib diunggah.',
            });
            return;
        }

        const altText = (req.body.alt || req.body.alt_text || '').trim();
        const userId = req.user?.id || null;

        // Gunakan alt text untuk penamaan file SEO-friendly
        const seoBaseName = altText || file.originalname.replace(/\.[^/.]+$/, '');

        // Konversi ke format .webp dengan kompresi Sharp
        const processed = await convertAndSaveToWebp(
            file.buffer,
            'articles',
            1920,
            1920,
            seoBaseName
        );

        // Generate ID format IMG-YYYY-XXXXX
        const currentYear = new Date().getFullYear();
        const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        const mediaId = `IMG-${currentYear}-${randomCode}`;

        // Simpan metadata ke tabel article_media (article_id NULL sampai artikel disimpan)
        await query(
            `INSERT INTO article_media (
                id, article_id, url, storage_key, original_name, alt_text, mime_type, width, height, size, uploaded_by
             ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                mediaId,
                processed.relativeUrl,
                processed.filename,
                file.originalname,
                altText || null,
                processed.mimetype,
                processed.width,
                processed.height,
                processed.size,
                userId,
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Gambar artikel berhasil diunggah.',
            data: {
                id: mediaId,
                url: processed.relativeUrl,
                alt: altText,
                width: processed.width,
                height: processed.height,
                size: processed.size,
                mimeType: processed.mimetype,
            },
        });
    } catch (error) {
        console.error('Upload article image error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengunggah gambar artikel.' });
    }
}

/**
 * GET /api/blogs atau /api/articles (Public)
 * Mengambil daftar artikel blog yang telah dipublikasikan (status = 'PUBLISHED' & is_published = true)
 * Mendukung filter category, tag, search, dan pagination
 */
export async function listPublishedBlogs(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search as string;
        const category = req.query.category as string;
        const tag = req.query.tag as string;

        let whereClause = "WHERE b.is_published = true AND (b.status = 'PUBLISHED' OR b.status IS NULL)";
        const params: any[] = [];
        let index = 1;

        if (search) {
            whereClause += ` AND (b.title ILIKE $${index} OR b.excerpt ILIKE $${index} OR b.focus_keyphrase ILIKE $${index})`;
            params.push(`%${search.trim()}%`);
            index++;
        }

        if (category) {
            whereClause += ` AND b.category ILIKE $${index}`;
            params.push(category.trim());
            index++;
        }

        if (tag) {
            whereClause += ` AND b.tags::text ILIKE $${index}`;
            params.push(`%${tag.trim()}%`);
            index++;
        }

        const countResult = await query(`SELECT COUNT(*) as total FROM blogs b ${whereClause}`, params);
        const total = parseInt((countResult.rows[0] as any).total) || 0;

        const sql = `
            SELECT b.id, b.title, b.slug, b.excerpt, b.image_url, b.thumbnail_url, b.thumbnail_alt,
                   b.category, b.reading_time_minutes, b.focus_keyphrase, b.tags, b.status,
                   b.created_at, b.updated_at,
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
            data: result.rows.map((row) => ({
                ...row,
                thumbnailUrl: row.thumbnail_url || row.image_url,
                readingTimeMinutes: row.reading_time_minutes || 1,
            })),
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
 * GET /api/blogs/:slug atau /api/blogs/detail/:slug atau /api/articles/:slug (Public)
 * Mengambil detail artikel lengkap beserta sanitasi konten HTML, metadata SEO, GEO (Takeaways & FAQs),
 * dan JSON-LD Structured Data Schema.org
 */
export async function getBlogBySlug(req: Request, res: Response): Promise<void> {
    try {
        const { slug } = req.params;

        const result = await query(
            `SELECT b.*,
                    u.name as author_name, u.avatar_url as author_avatar, u.role as author_role
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

        // Jika belum dipublish dan bukan admin, tolak akses pembaca umum
        const isPublic = blog.is_published && (blog.status === 'PUBLISHED' || !blog.status);
        if (!isPublic && (!req.user || !['admin', 'super_admin'].includes(req.user.role))) {
            res.status(404).json({ success: false, message: 'Artikel ini belum dipublikasikan.' });
            return;
        }

        // Hasilkan Schema.org JSON-LD siap pakai untuk SEO & GEO
        const schemaJsonLd = generateArticleJsonLd(blog);

        res.json({
            success: true,
            data: {
                ...blog,
                contentHtml: blog.content, // Alias ramah FE
                thumbnailUrl: blog.thumbnail_url || blog.image_url,
                readingTimeMinutes: blog.reading_time_minutes || 1,
                metaTitle: blog.meta_title || blog.title,
                metaDescription: blog.meta_description || blog.excerpt,
                canonicalUrl: blog.canonical_url,
                focusKeyphrase: blog.focus_keyphrase,
                keyTakeaways: blog.key_takeaways || [],
                faqs: blog.faqs || [],
                tags: blog.tags || [],
                schema_jsonld: schemaJsonLd,
            },
        });
    } catch (error) {
        console.error('Get blog by slug error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil detail artikel.' });
    }
}

/**
 * GET /api/blogs/admin/all atau /api/articles/admin (Admin / Super Admin Only)
 * Mengambil seluruh artikel (DRAFT, PUBLISHED, ARCHIVED) untuk CMS
 */
export async function listAllBlogsAdmin(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search as string;
        const status = req.query.status as string;
        const category = req.query.category as string;

        let whereClause = 'WHERE 1=1';
        const params: any[] = [];
        let index = 1;

        if (search) {
            whereClause += ` AND (b.title ILIKE $${index} OR b.slug ILIKE $${index} OR b.focus_keyphrase ILIKE $${index})`;
            params.push(`%${search.trim()}%`);
            index++;
        }

        if (status) {
            whereClause += ` AND b.status = $${index}`;
            params.push(status.trim().toUpperCase());
            index++;
        }

        if (category) {
            whereClause += ` AND b.category ILIKE $${index}`;
            params.push(category.trim());
            index++;
        }

        const countResult = await query(`SELECT COUNT(*) as total FROM blogs b ${whereClause}`, params);
        const total = parseInt((countResult.rows[0] as any).total) || 0;

        const sql = `
            SELECT b.id, b.title, b.slug, b.excerpt, b.image_url, b.thumbnail_url, b.thumbnail_alt,
                   b.category, b.reading_time_minutes, b.focus_keyphrase, b.tags, b.status, b.is_published,
                   b.created_at, b.updated_at,
                   u.name as author_name, u.email as author_email
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
            data: result.rows.map((row) => ({
                ...row,
                thumbnailUrl: row.thumbnail_url || row.image_url,
                readingTimeMinutes: row.reading_time_minutes || 1,
            })),
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
 * GET /api/blogs/admin/:id atau /api/articles/admin/:id (Admin / Super Admin Only)
 * Mengambil detail artikel berdasarkan ID untuk form editor CMS
 */
export async function getBlogByIdAdmin(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);
        if (isNaN(id)) {
            res.status(400).json({ success: false, message: 'ID artikel tidak valid.' });
            return;
        }

        const result = await query(
            `SELECT b.*,
                    u.name as author_name, u.email as author_email
             FROM blogs b
             JOIN users u ON b.author_id = u.id
             WHERE b.id = $1`,
            [id]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Artikel tidak ditemukan.' });
            return;
        }

        const blog = result.rows[0];

        // Ambil daftar gambar yang terhubung pada artikel ini
        const mediaResult = await query(
            'SELECT id, url, alt_text, width, height, size, mime_type, created_at FROM article_media WHERE article_id = $1',
            [id]
        );

        res.json({
            success: true,
            data: {
                ...blog,
                contentHtml: blog.content,
                thumbnailUrl: blog.thumbnail_url || blog.image_url,
                readingTimeMinutes: blog.reading_time_minutes || 1,
                media: mediaResult.rows,
            },
        });
    } catch (error) {
        console.error('Get blog by id admin error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data artikel.' });
    }
}

/**
 * POST /api/blogs atau /api/articles/admin (Admin / Super Admin Only)
 * Membuat artikel baru dengan sanitasi HTML, kalkulasi reading time, SEO metadata, dan relasi media
 */
export async function createBlog(req: Request, res: Response): Promise<void> {
    try {
        const authorId = req.user?.id;
        const {
            title,
            slug,
            category,
            thumbnailUrl,
            thumbnailAlt,
            readingTimeMinutes,
            metaTitle,
            metaDescription,
            canonicalUrl,
            focusKeyphrase,
            tags,
            keyTakeaways,
            faqs,
        } = req.body;

        // Mendukung field 'contentHtml' (dari FE Tiptap) maupun 'content'
        const rawContent = req.body.contentHtml || req.body.content || '';
        const cleanContent = sanitizeArticleHtml(rawContent);

        if (!title || !title.trim()) {
            res.status(400).json({ success: false, message: 'Judul artikel (title) wajib diisi.' });
            return;
        }

        if (!cleanContent || !cleanContent.trim()) {
            res.status(400).json({ success: false, message: 'Konten artikel (content / contentHtml) wajib diisi.' });
            return;
        }

        // Generate slug unik
        let baseSlug = slugify(slug || title);
        if (!baseSlug) baseSlug = 'artikel-' + Date.now();

        let finalSlug = baseSlug;
        let counter = 1;
        while (true) {
            const check = await query('SELECT id FROM blogs WHERE slug = $1', [finalSlug]);
            if (check.rowCount === 0) break;
            finalSlug = `${baseSlug}-${counter++}`;
        }

        // Excerpt otomatis jika tidak diisi
        const finalExcerpt = (req.body.excerpt || extractExcerpt(cleanContent)).trim();

        // Reading time otomatis jika tidak diisi
        const finalReadingTime = parseInt(readingTimeMinutes) || calculateReadingTime(cleanContent);

        // Thumbnail URL
        const finalThumbnail = (thumbnailUrl || req.body.image_url || null)?.trim() || null;
        const finalThumbnailAlt = (thumbnailAlt || req.body.thumbnail_alt || null)?.trim() || null;

        // Status & is_published
        let status = (req.body.status || 'PUBLISHED').toUpperCase();
        if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
            status = 'PUBLISHED';
        }
        const isPublished = req.body.is_published !== undefined
            ? Boolean(req.body.is_published)
            : status === 'PUBLISHED';

        // SEO Fields
        const finalMetaTitle = (metaTitle || req.body.meta_title || title).trim();
        const finalMetaDesc = (metaDescription || req.body.meta_description || finalExcerpt).trim();
        const finalCanonical = (canonicalUrl || req.body.canonical_url || null)?.trim() || null;
        const finalFocusKey = (focusKeyphrase || req.body.focus_keyphrase || null)?.trim() || null;
        const finalCategory = (category || null)?.trim() || null;

        // JSON fields (Tags, Takeaways, FAQs)
        const finalTags = Array.isArray(tags) ? JSON.stringify(tags) : (typeof tags === 'string' ? tags : '[]');
        const finalTakeaways = Array.isArray(keyTakeaways) ? JSON.stringify(keyTakeaways) : (typeof keyTakeaways === 'string' ? keyTakeaways : '[]');
        const finalFaqs = Array.isArray(faqs) ? JSON.stringify(faqs) : (typeof faqs === 'string' ? faqs : '[]');

        const insertResult = await query(
            `INSERT INTO blogs (
                author_id, title, slug, excerpt, content, image_url, thumbnail_url, thumbnail_alt,
                category, meta_title, meta_description, canonical_url, reading_time_minutes,
                focus_keyphrase, tags, key_takeaways, faqs, status, is_published
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
             RETURNING id`,
            [
                authorId,
                title.trim(),
                finalSlug,
                finalExcerpt,
                cleanContent,
                finalThumbnail,
                finalThumbnail,
                finalThumbnailAlt,
                finalCategory,
                finalMetaTitle,
                finalMetaDesc,
                finalCanonical,
                finalReadingTime,
                finalFocusKey,
                finalTags,
                finalTakeaways,
                finalFaqs,
                status,
                isPublished,
            ]
        );

        const newArticleId = insertResult.rows[0].id;

        // Hubungkan gambar yang ada di konten ke record article_media
        const usedImageUrls = extractImageUrls(cleanContent);
        if (finalThumbnail) {
            usedImageUrls.push(finalThumbnail);
        }

        if (usedImageUrls.length > 0) {
            await query(
                'UPDATE article_media SET article_id = $1 WHERE url = ANY($2)',
                [newArticleId, usedImageUrls]
            );
        }

        // Ambil data lengkap artikel yang baru dibuat
        const newBlogResult = await query(
            `SELECT b.*,
                    u.name as author_name
             FROM blogs b
             JOIN users u ON b.author_id = u.id
             WHERE b.id = $1`,
            [newArticleId]
        );

        res.status(201).json({
            success: true,
            message: status === 'DRAFT' ? 'Draft artikel berhasil disimpan.' : 'Artikel berhasil diterbitkan.',
            data: {
                ...newBlogResult.rows[0],
                contentHtml: newBlogResult.rows[0].content,
                thumbnailUrl: newBlogResult.rows[0].thumbnail_url || newBlogResult.rows[0].image_url,
                readingTimeMinutes: newBlogResult.rows[0].reading_time_minutes,
            },
        });
    } catch (error) {
        console.error('Create blog error:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat artikel baru.' });
    }
}

/**
 * PUT atau PATCH /api/blogs/:id atau /api/articles/admin/:id (Admin / Super Admin Only)
 * Memperbarui artikel yang sudah ada
 */
export async function updateBlog(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);
        if (isNaN(id)) {
            res.status(400).json({ success: false, message: 'ID artikel tidak valid.' });
            return;
        }

        const check = await query('SELECT * FROM blogs WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Artikel tidak ditemukan.' });
            return;
        }

        const existing = check.rows[0];
        const fields: string[] = [];
        const values: any[] = [];
        let index = 1;

        // Title & Slug
        if (req.body.title !== undefined) {
            const newTitle = req.body.title.trim();
            fields.push(`title = $${index++}`);
            values.push(newTitle);

            if (req.body.slug !== undefined) {
                let newSlug = slugify(req.body.slug || newTitle);
                const slugCheck = await query('SELECT id FROM blogs WHERE slug = $1 AND id != $2', [newSlug, id]);
                if (slugCheck.rowCount > 0) {
                    newSlug = `${newSlug}-${Date.now().toString().slice(-4)}`;
                }
                fields.push(`slug = $${index++}`);
                values.push(newSlug);
            }
        } else if (req.body.slug !== undefined) {
            let newSlug = slugify(req.body.slug);
            const slugCheck = await query('SELECT id FROM blogs WHERE slug = $1 AND id != $2', [newSlug, id]);
            if (slugCheck.rowCount > 0) {
                newSlug = `${newSlug}-${Date.now().toString().slice(-4)}`;
            }
            fields.push(`slug = $${index++}`);
            values.push(newSlug);
        }

        // Content & Sanitasi
        let updatedContent = existing.content;
        const incomingContent = req.body.contentHtml !== undefined ? req.body.contentHtml : req.body.content;
        if (incomingContent !== undefined) {
            updatedContent = sanitizeArticleHtml(incomingContent);
            fields.push(`content = $${index++}`);
            values.push(updatedContent);

            // Perbarui estimasi reading time jika content berubah
            if (req.body.readingTimeMinutes === undefined && req.body.reading_time_minutes === undefined) {
                fields.push(`reading_time_minutes = $${index++}`);
                values.push(calculateReadingTime(updatedContent));
            }
        }

        // Excerpt
        if (req.body.excerpt !== undefined) {
            fields.push(`excerpt = $${index++}`);
            values.push(req.body.excerpt.trim());
        } else if (incomingContent !== undefined && !existing.excerpt) {
            fields.push(`excerpt = $${index++}`);
            values.push(extractExcerpt(updatedContent));
        }

        // Category
        if (req.body.category !== undefined) {
            fields.push(`category = $${index++}`);
            values.push(req.body.category ? String(req.body.category).trim() : null);
        }

        // Thumbnail
        const incomingThumb = req.body.thumbnailUrl !== undefined ? req.body.thumbnailUrl : req.body.image_url;
        if (incomingThumb !== undefined) {
            const thumbVal = incomingThumb ? String(incomingThumb).trim() : null;
            fields.push(`thumbnail_url = $${index++}`);
            values.push(thumbVal);
            fields.push(`image_url = $${index++}`);
            values.push(thumbVal);

            if (existing.thumbnail_url && existing.thumbnail_url !== thumbVal) {
                deleteFileIfExists(existing.thumbnail_url);
            }
        }

        if (req.body.thumbnailAlt !== undefined || req.body.thumbnail_alt !== undefined) {
            const altVal = req.body.thumbnailAlt !== undefined ? req.body.thumbnailAlt : req.body.thumbnail_alt;
            fields.push(`thumbnail_alt = $${index++}`);
            values.push(altVal ? String(altVal).trim() : null);
        }

        // SEO Fields
        if (req.body.metaTitle !== undefined || req.body.meta_title !== undefined) {
            const metaT = req.body.metaTitle !== undefined ? req.body.metaTitle : req.body.meta_title;
            fields.push(`meta_title = $${index++}`);
            values.push(metaT ? String(metaT).trim() : null);
        }

        if (req.body.metaDescription !== undefined || req.body.meta_description !== undefined) {
            const metaD = req.body.metaDescription !== undefined ? req.body.metaDescription : req.body.meta_description;
            fields.push(`meta_description = $${index++}`);
            values.push(metaD ? String(metaD).trim() : null);
        }

        if (req.body.canonicalUrl !== undefined || req.body.canonical_url !== undefined) {
            const canUrl = req.body.canonicalUrl !== undefined ? req.body.canonicalUrl : req.body.canonical_url;
            fields.push(`canonical_url = $${index++}`);
            values.push(canUrl ? String(canUrl).trim() : null);
        }

        if (req.body.focusKeyphrase !== undefined || req.body.focus_keyphrase !== undefined) {
            const fk = req.body.focusKeyphrase !== undefined ? req.body.focusKeyphrase : req.body.focus_keyphrase;
            fields.push(`focus_keyphrase = $${index++}`);
            values.push(fk ? String(fk).trim() : null);
        }

        // JSON fields (Tags, Takeaways, FAQs)
        if (req.body.tags !== undefined) {
            const finalTags = Array.isArray(req.body.tags) ? JSON.stringify(req.body.tags) : req.body.tags;
            fields.push(`tags = $${index++}`);
            values.push(finalTags);
        }

        if (req.body.keyTakeaways !== undefined || req.body.key_takeaways !== undefined) {
            const kt = req.body.keyTakeaways !== undefined ? req.body.keyTakeaways : req.body.key_takeaways;
            const finalTakeaways = Array.isArray(kt) ? JSON.stringify(kt) : kt;
            fields.push(`key_takeaways = $${index++}`);
            values.push(finalTakeaways);
        }

        if (req.body.faqs !== undefined) {
            const finalFaqs = Array.isArray(req.body.faqs) ? JSON.stringify(req.body.faqs) : req.body.faqs;
            fields.push(`faqs = $${index++}`);
            values.push(finalFaqs);
        }

        // Status & is_published
        if (req.body.status !== undefined) {
            const newStatus = String(req.body.status).toUpperCase();
            if (['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(newStatus)) {
                fields.push(`status = $${index++}`);
                values.push(newStatus);
                fields.push(`is_published = $${index++}`);
                values.push(newStatus === 'PUBLISHED');
            }
        } else if (req.body.is_published !== undefined) {
            const isPub = Boolean(req.body.is_published);
            fields.push(`is_published = $${index++}`);
            values.push(isPub);
            fields.push(`status = $${index++}`);
            values.push(isPub ? 'PUBLISHED' : 'DRAFT');
        }

        if (fields.length === 0) {
            res.status(400).json({ success: false, message: 'Tidak ada data artikel yang diperbarui.' });
            return;
        }

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const updateSql = `UPDATE blogs SET ${fields.join(', ')} WHERE id = $${index}`;
        await query(updateSql, values);

        // Update relasi media pada konten yang diperbarui
        if (incomingContent !== undefined) {
            const usedImages = extractImageUrls(updatedContent);
            if (usedImages.length > 0) {
                await query('UPDATE article_media SET article_id = $1 WHERE url = ANY($2)', [id, usedImages]);
            }
        }

        const updatedResult = await query(
            `SELECT b.*,
                    u.name as author_name
             FROM blogs b
             JOIN users u ON b.author_id = u.id
             WHERE b.id = $1`,
            [id]
        );

        res.json({
            success: true,
            message: 'Artikel berhasil diperbarui.',
            data: {
                ...updatedResult.rows[0],
                contentHtml: updatedResult.rows[0].content,
                thumbnailUrl: updatedResult.rows[0].thumbnail_url || updatedResult.rows[0].image_url,
                readingTimeMinutes: updatedResult.rows[0].reading_time_minutes,
            },
        });
    } catch (error) {
        console.error('Update blog error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui artikel.' });
    }
}

/**
 * DELETE /api/blogs/:id atau /api/articles/admin/:id (Admin / Super Admin Only)
 * Menghapus artikel dan membersihkan gambar-gambar terkait dari server
 */
export async function deleteBlog(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);
        if (isNaN(id)) {
            res.status(400).json({ success: false, message: 'ID artikel tidak valid.' });
            return;
        }

        const check = await query('SELECT id, thumbnail_url, image_url, content FROM blogs WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Artikel tidak ditemukan.' });
            return;
        }

        // Hapus file fisik gambar yang terhubung di article_media
        const mediaCheck = await query('SELECT url FROM article_media WHERE article_id = $1', [id]);
        for (const row of mediaCheck.rows) {
            deleteFileIfExists(row.url);
        }

        // Hapus file thumbnail jika ada
        deleteFileIfExists(check.rows[0].thumbnail_url);
        deleteFileIfExists(check.rows[0].image_url);

        await query('DELETE FROM article_media WHERE article_id = $1', [id]);
        await query('DELETE FROM blogs WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Artikel dan gambar terkait berhasil dihapus.',
        });
    } catch (error) {
        console.error('Delete blog error:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus artikel.' });
    }
}
