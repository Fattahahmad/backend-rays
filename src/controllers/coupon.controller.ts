import type { Request, Response } from 'express';
import { query } from '../config/db.ts';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const INDO_DAYS_MAP: Record<string, string> = {
    sunday: 'Minggu',
    monday: 'Senin',
    tuesday: 'Selasa',
    wednesday: 'Rabu',
    thursday: 'Kamis',
    friday: 'Jumat',
    saturday: 'Sabtu',
};

/**
 * POST /api/coupons/validate (Public / Customer)
 * Memvalidasi kupon diskon di keranjang atau saat checkout
 * Melakukan pengecekan aktif, minimal belanja, dan batasan hari (misal Promo Weekday)
 */
export async function validateCoupon(req: Request, res: Response): Promise<void> {
    try {
        const { code, subtotal = 0 } = req.body;

        if (!code || !code.trim()) {
            res.status(400).json({ success: false, message: 'Kode kupon wajib diisi.' });
            return;
        }

        const normalizedCode = code.trim().toUpperCase();

        const couponResult = await query(
            'SELECT * FROM coupons WHERE UPPER(code) = $1 AND is_active = true',
            [normalizedCode]
        );

        if (couponResult.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Kode kupon tidak valid atau sudah tidak aktif.' });
            return;
        }

        const coupon = couponResult.rows[0];
        const numSubtotal = Number(subtotal) || 0;

        // 1. Cek Minimal Belanja
        if (coupon.min_purchase && numSubtotal > 0 && numSubtotal < coupon.min_purchase) {
            res.status(400).json({
                success: false,
                message: `Kupon '${coupon.code}' memerlukan minimal belanja Rp ${coupon.min_purchase.toLocaleString('id-ID')}.`,
            });
            return;
        }

        // 2. Cek Batasan Hari (Valid Days - Promo Weekday)
        if (coupon.valid_days) {
            let allowedDays: string[] = [];
            if (Array.isArray(coupon.valid_days)) {
                allowedDays = coupon.valid_days;
            } else if (typeof coupon.valid_days === 'string') {
                try {
                    allowedDays = JSON.parse(coupon.valid_days);
                } catch {
                    allowedDays = [];
                }
            }

            if (allowedDays.length > 0) {
                const todayIndex = new Date().getDay();
                const todayName = DAYS_OF_WEEK[todayIndex];

                const isAllowedToday = allowedDays.some(d => d.toLowerCase() === todayName.toLowerCase());

                if (!isAllowedToday) {
                    const isWeekdayOnly = allowedDays.every(d =>
                        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(d.toLowerCase())
                    ) && allowedDays.length >= 5;

                    const dayNamesInIndo = allowedDays
                        .map(d => INDO_DAYS_MAP[d.toLowerCase()] || d)
                        .join(', ');

                    const rejectMessage = isWeekdayOnly
                        ? `Kupon '${coupon.code}' khusus promo hari kerja (Senin - Jumat) dan tidak berlaku di akhir pekan.`
                        : `Kupon '${coupon.code}' hanya berlaku pada hari: ${dayNamesInIndo}.`;

                    res.status(400).json({
                        success: false,
                        message: rejectMessage,
                    });
                    return;
                }
            }
        }

        // 3. Hitung Besaran Diskon
        let discountAmount = 0;
        if (coupon.discount_type === 'percentage') {
            discountAmount = Math.round((numSubtotal * coupon.discount_value) / 100);
        } else {
            discountAmount = coupon.discount_value;
            if (numSubtotal > 0 && discountAmount > numSubtotal) {
                discountAmount = numSubtotal;
            }
        }

        res.json({
            success: true,
            message: `Kupon '${coupon.code}' berhasil digunakan!`,
            data: {
                id: coupon.id,
                code: coupon.code,
                discount_type: coupon.discount_type,
                discount_value: coupon.discount_value,
                discount_amount: discountAmount,
                min_purchase: coupon.min_purchase,
                valid_days: coupon.valid_days,
            },
        });
    } catch (error) {
        console.error('Validate coupon error:', error);
        res.status(500).json({ success: false, message: 'Gagal memvalidasi kupon diskon.' });
    }
}

/**
 * GET /api/coupons (Admin / Super Admin Only)
 * Melihat seluruh daftar kupon diskon untuk CMS
 */
export async function listCouponsAdmin(req: Request, res: Response): Promise<void> {
    try {
        const result = await query(
            'SELECT id, code, discount_type, discount_value, min_purchase, valid_days, is_active, created_at FROM coupons ORDER BY id DESC'
        );

        res.json({
            success: true,
            data: result.rows,
        });
    } catch (error) {
        console.error('List coupons error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar kupon diskon.' });
    }
}

/**
 * POST /api/coupons (Admin / Super Admin Only)
 * Membuat kupon diskon baru (mendukung persentase/flat dan hari aktif weekday)
 */
export async function createCoupon(req: Request, res: Response): Promise<void> {
    try {
        const { code, discount_type, discount_value, min_purchase = 0, valid_days, is_active = true } = req.body;

        if (!code || !discount_type || discount_value === undefined) {
            res.status(400).json({
                success: false,
                message: 'Kode kupon (code), jenis diskon (discount_type), dan nilai diskon (discount_value) wajib diisi.',
            });
            return;
        }

        const validTypes = ['percentage', 'fixed_amount'];
        if (!validTypes.includes(discount_type)) {
            res.status(400).json({
                success: false,
                message: `discount_type tidak valid. Pilihan: ${validTypes.join(', ')}`,
            });
            return;
        }

        const numValue = Number(discount_value);
        if (discount_type === 'percentage' && (numValue <= 0 || numValue > 100)) {
            res.status(400).json({ success: false, message: 'Diskon persentase harus antara 1% sampai 100%.' });
            return;
        }

        const normalizedCode = code.trim().toUpperCase();

        const checkExisting = await query('SELECT id FROM coupons WHERE UPPER(code) = $1', [normalizedCode]);
        if (checkExisting.rowCount > 0) {
            res.status(400).json({ success: false, message: `Kode kupon '${normalizedCode}' sudah ada.` });
            return;
        }

        const daysJson = valid_days ? JSON.stringify(valid_days) : null;

        await query(
            `INSERT INTO coupons (code, discount_type, discount_value, min_purchase, valid_days, is_active)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                normalizedCode,
                discount_type,
                numValue,
                Number(min_purchase) || 0,
                daysJson,
                Boolean(is_active),
            ]
        );

        const newCoupon = await query('SELECT * FROM coupons WHERE code = $1', [normalizedCode]);

        res.status(201).json({
            success: true,
            message: 'Kupon diskon berhasil dibuat.',
            data: newCoupon.rows[0],
        });
    } catch (error) {
        console.error('Create coupon error:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat kupon diskon.' });
    }
}

/**
 * PATCH /api/coupons/:id (Admin / Super Admin Only)
 * Memperbarui info kupon diskon atau status aktif
 */
export async function updateCoupon(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);
        const { code, discount_type, discount_value, min_purchase, valid_days, is_active } = req.body;

        const check = await query('SELECT id, code FROM coupons WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Kupon diskon tidak ditemukan.' });
            return;
        }

        const fields: string[] = [];
        const values: any[] = [];
        let index = 1;

        if (code !== undefined) {
            const cleanCode = code.trim().toUpperCase();
            const codeCheck = await query('SELECT id FROM coupons WHERE UPPER(code) = $1 AND id != $2', [cleanCode, id]);
            if (codeCheck.rowCount > 0) {
                res.status(400).json({ success: false, message: `Kode kupon '${cleanCode}' sudah digunakan.` });
                return;
            }
            fields.push(`code = $${index++}`);
            values.push(cleanCode);
        }

        if (discount_type !== undefined) {
            const validTypes = ['percentage', 'fixed_amount'];
            if (!validTypes.includes(discount_type)) {
                res.status(400).json({ success: false, message: `discount_type harus salah satu dari: ${validTypes.join(', ')}` });
                return;
            }
            fields.push(`discount_type = $${index++}`);
            values.push(discount_type);
        }

        if (discount_value !== undefined) {
            fields.push(`discount_value = $${index++}`);
            values.push(Number(discount_value));
        }

        if (min_purchase !== undefined) {
            fields.push(`min_purchase = $${index++}`);
            values.push(Number(min_purchase));
        }

        if (valid_days !== undefined) {
            fields.push(`valid_days = $${index++}`);
            values.push(valid_days ? JSON.stringify(valid_days) : null);
        }

        if (is_active !== undefined) {
            fields.push(`is_active = $${index++}`);
            values.push(Boolean(is_active));
        }

        if (fields.length === 0) {
            res.status(400).json({ success: false, message: 'Tidak ada data kupon yang diperbarui.' });
            return;
        }

        values.push(id);
        await query(`UPDATE coupons SET ${fields.join(', ')} WHERE id = $${index}`, values);

        const updated = await query('SELECT * FROM coupons WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Kupon diskon berhasil diperbarui.',
            data: updated.rows[0],
        });
    } catch (error) {
        console.error('Update coupon error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui kupon diskon.' });
    }
}

/**
 * DELETE /api/coupons/:id (Admin / Super Admin Only)
 * Menghapus kupon diskon dari sistem
 */
export async function deleteCoupon(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);

        const check = await query('SELECT id, code FROM coupons WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Kupon diskon tidak ditemukan.' });
            return;
        }

        await query('DELETE FROM coupons WHERE id = $1', [id]);

        res.json({
            success: true,
            message: `Kupon '${check.rows[0].code}' berhasil dihapus.`,
        });
    } catch (error) {
        console.error('Delete coupon error:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus kupon diskon.' });
    }
}
