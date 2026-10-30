import type { Request, Response } from 'express';
import { query } from '../config/db.ts';
import { recordAuditLog } from '../services/audit.service.ts';

/**
 * Daftar pengaturan default jika database masih kosong
 */
const DEFAULT_SETTINGS: Record<string, { value: string; category: string; description: string }> = {
    whatsapp_number: {
        value: '6281234567890',
        category: 'contact',
        description: 'Nomor WhatsApp resmi untuk tombol floating dan konsultasi reservasi detailing',
    },
    workshop_address: {
        value: 'Jl. Boulevard Sektor 7 No. 18, Bintaro, Tangerang Selatan',
        category: 'contact',
        description: 'Alamat fisik workshop bengkel detailing',
    },
    company_email: {
        value: 'info@raysautocare.com',
        category: 'contact',
        description: 'Alamat email resmi customer support',
    },
    operational_hours: {
        value: 'Senin - Sabtu: 08.00 - 17.00 WIB',
        category: 'general',
        description: 'Jam operasional workshop dan layanan detailing',
    },
    instagram_url: {
        value: 'https://instagram.com/raysautocare',
        category: 'social',
        description: 'Tautan akun resmi Instagram Rays Autocare',
    },
    tiktok_url: {
        value: 'https://tiktok.com/@raysautocare',
        category: 'social',
        description: 'Tautan akun resmi TikTok Rays Autocare',
    },
    google_maps_url: {
        value: 'https://maps.google.com/?q=Rays+Autocare+Bintaro',
        category: 'contact',
        description: 'Tautan lokasi Google Maps workshop',
    },
};

/**
 * GET /api/settings (Public)
 * Mengambil konfigurasi bisnis aktif (Nomor WhatsApp, Kontak, Alamat, Medsos)
 * Digunakan oleh Frontend untuk Floating WhatsApp Button, Header, Footer, dan Kalkulator
 */
export async function getPublicSettings(req: Request, res: Response): Promise<void> {
    try {
        const rows = await query('SELECT `key`, value FROM settings');
        const settingsMap: Record<string, string> = {};

        // Inisialisasi dari default terlebih dahulu
        for (const [key, item] of Object.entries(DEFAULT_SETTINGS)) {
            settingsMap[key] = item.value;
        }

        // Timpa dengan data dari database jika sudah ada
        for (const row of rows.rows) {
            settingsMap[row.key] = row.value;
        }

        res.json({
            success: true,
            message: 'Pengaturan kontak dan bisnis berhasil diambil.',
            data: settingsMap,
        });
    } catch (error: any) {
        console.error('Get public settings error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil pengaturan bisnis.' });
    }
}

/**
 * GET /api/settings/admin (Admin & Super Admin)
 * Mengambil seluruh daftar pengaturan lengkap dengan metadata deskripsi dan kategori
 */
export async function getAllSettingsAdmin(req: Request, res: Response): Promise<void> {
    try {
        const rows = await query('SELECT * FROM settings ORDER BY category ASC, `key` ASC');

        // Jika tabel masih kosong sama sekali, kembalikan data default yang terstruktur
        let resultList = rows.rows;
        if (rows.rowCount === 0) {
            resultList = Object.entries(DEFAULT_SETTINGS).map(([key, item]) => ({
                key,
                value: item.value,
                category: item.category,
                description: item.description,
                updated_at: new Date().toISOString(),
            }));
        }

        res.json({
            success: true,
            data: resultList,
        });
    } catch (error: any) {
        console.error('Get admin settings error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar pengaturan admin.' });
    }
}

/**
 * PUT /api/settings/admin (Admin & Super Admin)
 * Memperbarui pengaturan bisnis (termasuk nomor WhatsApp floating) langsung dari Admin CMS
 * Request Body berupa key-value:
 * {
 *   "whatsapp_number": "6281987654321",
 *   "workshop_address": "Alamat baru...",
 *   "operational_hours": "Senin - Minggu: 08.00 - 18.00 WIB"
 * }
 */
export async function updateSettingsAdmin(req: Request, res: Response): Promise<void> {
    try {
        const settingsPayload = req.body;

        if (!settingsPayload || typeof settingsPayload !== 'object' || Object.keys(settingsPayload).length === 0) {
            res.status(400).json({
                success: false,
                message: 'Data pengaturan yang dikirim tidak valid. Format harus berupa objek key-value.',
            });
            return;
        }

        const updatedKeys: string[] = [];

        for (const [key, rawValue] of Object.entries(settingsPayload)) {
            if (rawValue === undefined || rawValue === null) continue;

            const value = String(rawValue).trim();
            const defaultItem = DEFAULT_SETTINGS[key];
            const category = defaultItem ? defaultItem.category : 'general';
            const description = defaultItem ? defaultItem.description : null;

            const existing = await query(
                'SELECT `key` FROM settings WHERE `key` = $1',
                [key]
            );

            if (existing.rowCount > 0) {
                await query(
                    `UPDATE settings
                     SET value = $1, category = $2, description = $3, updated_at = CURRENT_TIMESTAMP
                     WHERE \`key\` = $4`,
                    [value, category, description, key]
                );
            } else {
                await query(
                    `INSERT INTO settings (\`key\`, value, category, description, updated_at)
                     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
                    [key, value, category, description]
                );
            }

            updatedKeys.push(key);
        }

        // Catat ke Audit Log Surveillance
        if (req.user?.id) {
            await recordAuditLog({
                userId: req.user.id,
                action: 'UPDATE_SETTINGS',
                entityType: 'settings',
                description: `Admin memperbarui pengaturan bisnis (${updatedKeys.join(', ')})`,
                details: {
                    updatedKeys,
                    adminName: req.user.name,
                    adminEmail: req.user.email,
                },
                req,
            });
        }

        // Ambil data terbaru untuk dikembalikan ke CMS
        const latestRows = await query('SELECT `key`, value FROM settings');
        const updatedMap: Record<string, string> = {};
        for (const r of latestRows.rows) {
            updatedMap[r.key] = r.value;
        }

        res.json({
            success: true,
            message: `Berhasil memperbarui ${updatedKeys.length} pengaturan (${updatedKeys.join(', ')}).`,
            data: updatedMap,
        });
    } catch (error: any) {
        console.error('Update settings admin error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui pengaturan bisnis.' });
    }
}
