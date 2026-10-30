import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { query } from '../config/db.ts';
import { recordAuditLog } from '../services/audit.service.ts';
import { deleteFileIfExists } from '../utils/file.util.ts';

/**
 * Mendapatkan full URL absolut untuk asset backend jika path diawali dengan /uploads
 */
export function getFullImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
    if (url.startsWith('/uploads')) {
        return `${baseUrl}${url}`;
    }
    return url;
}

/**
 * Otomatis mendeteksi Base64 Data URI, menyimpannya sebagai file di uploads/banners/,
 * dan mengembalikan path relatif yang bersih (/uploads/banners/banner-b64-xxx.jpg)
 */
export function handleBase64Image(dataString: string): string {
    if (!dataString || typeof dataString !== 'string') return dataString;
    const matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        return dataString; // Bukan base64, kembalikan URL/string aslinya
    }

    try {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');

        // Validasi ukuran maksimal 2MB
        if (buffer.length > 2 * 1024 * 1024) {
            const sizeInMb = (buffer.length / (1024 * 1024)).toFixed(2);
            const err: any = new Error(`Ukuran gambar Base64 (${sizeInMb}MB) melebihi batas maksimal 2MB.`);
            err.statusCode = 400;
            throw err;
        }

        let ext = '.jpg';
        if (mimeType.includes('png')) ext = '.png';
        else if (mimeType.includes('webp')) ext = '.webp';
        else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';

        const filename = `banner-b64-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const targetDir = path.join(process.cwd(), 'uploads', 'banners');
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const filePath = path.join(targetDir, filename);
        fs.writeFileSync(filePath, buffer);

        return `/uploads/banners/${filename}`;
    } catch (err: any) {
        if (err.statusCode === 400) {
            throw err;
        }
        console.error('Gagal memproses file Base64 image:', err);
        return dataString;
    }
}

/**
 * Format baris data database menjadi format JSON standar CMS Banner
 */
export function formatBanner(b: any) {
    return {
        id: b.id,
        order: b.sort_order,
        imageUrl: b.image_url,
        fullImageUrl: getFullImageUrl(b.image_url),
        badgeText: b.badge_text,
        title: b.title,
        button: {
            show: b.button_show ?? true,
            text: b.button_text || 'LIHAT PROMO',
            url: b.button_url || '/promo',
        },
        isActive: b.is_active,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
    };
}

/**
 * Helper untuk mem-parsing data button dari request body
 * Mendukung nested object { button: { show, text, url } } maupun string JSON atau flat fields
 */
function parseButtonData(reqBody: any) {
    let show = true;
    let text = 'LIHAT PROMO';
    let url = '/promo';

    if (reqBody.button) {
        let btn = reqBody.button;
        if (typeof btn === 'string') {
            try {
                btn = JSON.parse(btn);
            } catch {
                btn = {};
            }
        }
        if (btn.show !== undefined) show = Boolean(btn.show);
        if (btn.text !== undefined) text = String(btn.text).trim();
        if (btn.url !== undefined) url = String(btn.url).trim();
    } else {
        const rawShow = reqBody.button_show ?? reqBody.buttonShow;
        const rawText = reqBody.button_text ?? reqBody.buttonText;
        const rawUrl = reqBody.button_url ?? reqBody.buttonUrl;

        if (rawShow !== undefined) show = rawShow === 'true' || rawShow === true;
        if (rawText !== undefined) text = String(rawText).trim();
        if (rawUrl !== undefined) url = String(rawUrl).trim();
    }

    return { show, text, url };
}

/**
 * GET /api/banners (Public)
 * Mengambil daftar banner promosi & hero slider yang aktif
 */
export async function getPublicBanners(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 10;
        const offset = (page - 1) * limit;

        const countResult = await query(
            'SELECT COUNT(*) as total FROM banners WHERE is_active = true AND deleted_at IS NULL'
        );
        const total = parseInt((countResult.rows[0] as any).total, 10) || 0;

        const result = await query(
            `SELECT * FROM banners 
             WHERE is_active = true AND deleted_at IS NULL 
             ORDER BY sort_order ASC, id ASC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.json({
            success: true,
            message: 'Daftar banner aktif berhasil diambil.',
            data: result.rows.map(formatBanner),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error: any) {
        console.error('Error fetching public banners:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data banner.' });
    }
}

/**
 * GET /api/banners/admin (Admin CMS)
 * Mengambil semua banner (aktif maupun tidak aktif) untuk tabel CMS Admin
 */
export async function getAdminBanners(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search as string;

        let whereClause = 'WHERE deleted_at IS NULL';
        const params: any[] = [];
        let index = 1;

        if (search) {
            whereClause += ` AND (title ILIKE $${index} OR badge_text ILIKE $${index})`;
            params.push(`%${search.trim()}%`);
            index++;
        }

        const countResult = await query(`SELECT COUNT(*) as total FROM banners ${whereClause}`, params);
        const total = parseInt((countResult.rows[0] as any).total, 10) || 0;

        params.push(limit, offset);
        const result = await query(
            `SELECT * FROM banners 
             ${whereClause} 
             ORDER BY sort_order ASC, id ASC
             LIMIT $${index++} OFFSET $${index}`,
            params
        );

        res.json({
            success: true,
            message: 'Daftar seluruh banner berhasil diambil.',
            data: result.rows.map(formatBanner),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error: any) {
        console.error('Error fetching admin banners:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data banner admin.' });
    }
}

/**
 * GET /api/banners/:id (Public & Admin)
 * Mengambil detail satu banner berdasarkan ID
 */
export async function getBannerById(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const bannerId = parseInt(String(id), 10);
        if (isNaN(bannerId)) {
            res.status(400).json({ success: false, message: 'ID banner harus berupa angka yang valid.' });
            return;
        }

        const result = await query('SELECT * FROM banners WHERE id = $1 AND deleted_at IS NULL', [bannerId]);

        if (result.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Banner tidak ditemukan.' });
            return;
        }

        res.json({
            success: true,
            data: formatBanner(result.rows[0]),
        });
    } catch (error: any) {
        console.error('Error fetching banner by ID:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data banner.' });
    }
}

/**
 * POST /api/banners/admin (Admin CMS)
 * Membuat banner promosi baru (mendukung file upload atau imageUrl string)
 */
export async function createBanner(req: Request, res: Response): Promise<void> {
    try {
        const { title, badgeText, badge_text, badge } = req.body;
        const rawOrder = req.body.order ?? req.body.sort_order;
        const rawIsActive = req.body.isActive ?? req.body.is_active ?? req.body.status;

        if (!title) {
            res.status(400).json({ success: false, message: 'Judul (title) banner wajib diisi.' });
            return;
        }

        // Tentukan imageUrl: jika ada upload file fisik, gunakan path upload
        let imageUrl = '';
        if (req.file) {
            imageUrl = `/uploads/banners/${req.file.filename}`;
        } else if (req.body.imageUrl || req.body.image_url || req.body.image || req.body.url) {
            imageUrl = handleBase64Image(String(req.body.imageUrl || req.body.image_url || req.body.image || req.body.url).trim());
        }

        if (!imageUrl) {
            res.status(400).json({ success: false, message: 'Gambar banner (file upload atau imageUrl) wajib disediakan.' });
            return;
        }

        // Tentukan urutan sort_order jika tidak disediakan
        let sortOrder = 1;
        if (rawOrder !== undefined && rawOrder !== null && rawOrder !== '') {
            sortOrder = parseInt(String(rawOrder), 10) || 1;
        } else {
            const maxOrder = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM banners WHERE deleted_at IS NULL');
            sortOrder = parseInt(maxOrder.rows[0].next_order, 10);
        }

        const finalBadge = badgeText || badge_text || badge || null;
        const isActive = rawIsActive === undefined ? true : (rawIsActive === true || rawIsActive === 'true' || rawIsActive === 'active');
        const { show: btnShow, text: btnText, url: btnUrl } = parseButtonData(req.body);

        const insertResult = await query(
            `INSERT INTO banners (sort_order, image_url, badge_text, title, button_show, button_text, button_url, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [sortOrder, imageUrl, finalBadge, title.trim(), btnShow, btnText, btnUrl, isActive]
        );

        const newBanner = insertResult.rows[0];

        // Audit Log
        if (req.user) {
            recordAuditLog({
                userId: req.user.id,
                action: 'ADMIN_CREATE_BANNER',
                entityType: 'banner',
                entityId: newBanner.id,
                description: `Admin menambahkan banner promosi baru: "${newBanner.title}"`,
                details: { bannerId: newBanner.id, title: newBanner.title, order: newBanner.sort_order },
                req,
            });
        }

        res.status(201).json({
            success: true,
            message: 'Banner promosi berhasil ditambahkan.',
            data: formatBanner(newBanner),
        });
    } catch (error: any) {
        if (error.statusCode === 400 || error.message?.includes('2MB')) {
            res.status(400).json({ success: false, message: error.message });
            return;
        }
        console.error('Error creating banner:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat banner promosi.' });
    }
}

/**
 * PUT /api/banners/admin/:id (Admin CMS)
 * Memperbarui data banner promosi
 */
export async function updateBanner(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;

        const check = await query('SELECT * FROM banners WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Banner tidak ditemukan.' });
            return;
        }

        const current = check.rows[0];
        const { title, badgeText, badge_text, badge } = req.body;
        const rawOrder = req.body.order ?? req.body.sort_order;
        const rawIsActive = req.body.isActive ?? req.body.is_active ?? req.body.status;

        let imageUrl = current.image_url;
        if (req.file) {
            imageUrl = `/uploads/banners/${req.file.filename}`;
        } else if (req.body.imageUrl !== undefined || req.body.image_url !== undefined || req.body.image !== undefined || req.body.url !== undefined) {
            const rawImg = String(req.body.imageUrl ?? req.body.image_url ?? req.body.image ?? req.body.url).trim();
            imageUrl = handleBase64Image(rawImg);
        }

        // Hapus file gambar lama jika diganti dengan gambar baru
        if (imageUrl !== current.image_url) {
            deleteFileIfExists(current.image_url);
        }

        const sortOrder = rawOrder !== undefined && rawOrder !== '' ? parseInt(String(rawOrder), 10) : current.sort_order;
        const newTitle = title !== undefined ? String(title).trim() : current.title;
        const newBadge = badgeText !== undefined ? badgeText : (badge_text !== undefined ? badge_text : (badge !== undefined ? badge : current.badge_text));
        const isActive = rawIsActive !== undefined ? (rawIsActive === true || rawIsActive === 'true' || rawIsActive === 'active') : current.is_active;

        const { show: btnShow, text: btnText, url: btnUrl } = parseButtonData({
            button: req.body.button,
            button_show: req.body.button_show ?? current.button_show,
            button_text: req.body.button_text ?? current.button_text,
            button_url: req.body.button_url ?? current.button_url,
        });

        await query(
            `UPDATE banners 
             SET sort_order = $1, image_url = $2, badge_text = $3, title = $4,
                 button_show = $5, button_text = $6, button_url = $7, is_active = $8, updated_at = CURRENT_TIMESTAMP
             WHERE id = $9`,
            [sortOrder, imageUrl, newBadge, newTitle, btnShow, btnText, btnUrl, isActive, id]
        );

        const fetchUpdated = await query('SELECT * FROM banners WHERE id = $1', [id]);
        const updatedBanner = fetchUpdated.rows[0];

        // Audit Log
        if (req.user) {
            recordAuditLog({
                userId: req.user.id,
                action: 'ADMIN_UPDATE_BANNER',
                entityType: 'banner',
                entityId: updatedBanner.id,
                description: `Admin memperbarui banner ID ${id}: "${updatedBanner.title}"`,
                details: { bannerId: updatedBanner.id },
                req,
            });
        }

        res.json({
            success: true,
            message: 'Banner berhasil diperbarui.',
            data: formatBanner(updatedBanner),
        });
    } catch (error: any) {
        if (error.statusCode === 400 || error.message?.includes('2MB')) {
            res.status(400).json({ success: false, message: error.message });
            return;
        }
        console.error('Error updating banner:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui banner.' });
    }
}

/**
 * PATCH /api/banners/admin/:id/status (Admin CMS)
 * Toggle status aktif/nonaktif banner secara cepat
 */
export async function toggleBannerStatus(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const rawIsActive = req.body.isActive ?? req.body.is_active;

        const check = await query('SELECT id, title, is_active FROM banners WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Banner tidak ditemukan.' });
            return;
        }

        const newStatus = rawIsActive !== undefined ? (rawIsActive === true || rawIsActive === 'true') : !check.rows[0].is_active;

        await query(
            'UPDATE banners SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newStatus, id]
        );

        const fetchUpdated = await query('SELECT * FROM banners WHERE id = $1', [id]);

        res.json({
            success: true,
            message: `Status banner berhasil diubah menjadi ${newStatus ? 'Aktif' : 'Nonaktif'}.`,
            data: formatBanner(fetchUpdated.rows[0]),
        });
    } catch (error: any) {
        console.error('Error toggling banner status:', error);
        res.status(500).json({ success: false, message: 'Gagal mengubah status banner.' });
    }
}

/**
 * PATCH /api/banners/admin/reorder (Admin CMS)
 * Mengubah susunan urutan banner secara massal (drag and drop)
 * Payload: { items: [{ id: 1, order: 1 }, { id: 2, order: 2 }] }
 */
export async function reorderBanners(req: Request, res: Response): Promise<void> {
    try {
        const { items } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            res.status(400).json({ success: false, message: 'Array items [{ id, order }] wajib dikirimkan.' });
            return;
        }

        for (const item of items) {
            if (item.id && item.order !== undefined) {
                await query('UPDATE banners SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
                    parseInt(item.order, 10),
                    item.id,
                ]);
            }
        }

        const result = await query(
            'SELECT * FROM banners WHERE deleted_at IS NULL ORDER BY sort_order ASC, id ASC'
        );

        res.json({
            success: true,
            message: 'Urutan banner berhasil diperbarui.',
            data: result.rows.map(formatBanner),
        });
    } catch (error: any) {
        console.error('Error reordering banners:', error);
        res.status(500).json({ success: false, message: 'Gagal mengatur ulang urutan banner.' });
    }
}

/**
 * DELETE /api/banners/admin/:id (Admin CMS)
 * Menghapus banner (Soft Delete) dan membersihkan file gambar fisik dari storage
 */
export async function deleteBanner(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;

        const check = await query('SELECT id, title, image_url FROM banners WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Banner tidak ditemukan.' });
            return;
        }

        const idStr = String(id);
        await query('UPDATE banners SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [idStr]);

        // Hapus file fisik banner dari folder uploads
        deleteFileIfExists(check.rows[0].image_url);

        // Audit Log
        if (req.user) {
            recordAuditLog({
                userId: req.user.id,
                action: 'ADMIN_DELETE_BANNER',
                entityType: 'banner',
                entityId: parseInt(idStr, 10),
                description: `Admin menghapus banner ID ${idStr}: "${check.rows[0].title}"`,
                details: { bannerId: idStr },
                req,
            });
        }

        res.json({
            success: true,
            message: 'Banner berhasil dihapus.',
        });
    } catch (error: any) {
        console.error('Error deleting banner:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus banner.' });
    }
}
