import type { Request, Response } from 'express';
import { fetchRealtimeAnalytics, fetchOverviewAnalytics } from '../services/analytics.service.ts';
import { sendMetaEvent } from '../services/meta.service.ts';

/**
 * GET /api/analytics/realtime (Admin & Super Admin)
 * Mengambil jumlah pengunjung aktif dalam 30 menit terakhir beserta kota & negara asal
 */
export async function getRealtime(req: Request, res: Response): Promise<void> {
    try {
        const data = await fetchRealtimeAnalytics();
        res.json({
            success: true,
            message: 'Data analitik pengunjung realtime berhasil diambil.',
            data,
        });
    } catch (error: any) {
        console.error('Get realtime analytics controller error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data analitik realtime.',
            error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        });
    }
}

/**
 * GET /api/analytics/overview (Admin & Super Admin)
 * Mengambil data tren grafik harian, ringkasan pengunjung, top halaman, top kota, dan durasi kunjungan
 * Query: ?days=7 (default 7 hari, bisa 14, 30, dll)
 */
export async function getOverview(req: Request, res: Response): Promise<void> {
    try {
        const days = parseInt(req.query.days as string, 10) || 7;
        const data = await fetchOverviewAnalytics(days);

        res.json({
            success: true,
            message: `Data ringkasan analitik (${days} hari terakhir) berhasil diambil.`,
            data,
        });
    } catch (error: any) {
        console.error('Get overview analytics controller error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data ringkasan analitik.',
            error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        });
    }
}

/**
 * POST /api/analytics/meta-event (Public / Authenticated)
 * Menerima event dari Frontend (misal: klik WhatsApp, ViewContent, AddToCart) 
 * dan meneruskannya secara aman ke Meta Conversions API (CAPI) server-side
 */
export async function trackMetaEvent(req: Request, res: Response): Promise<void> {
    try {
        const { eventName, eventId, eventSourceUrl, userData, customData } = req.body;

        if (!eventName || typeof eventName !== 'string') {
            res.status(400).json({
                success: false,
                message: 'Nama event (eventName) wajib diisi. Contoh: Lead, ViewContent, AddToCart.',
            });
            return;
        }

        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
        const clientUserAgent = req.headers['user-agent'] || undefined;

        const result = await sendMetaEvent({
            eventName,
            eventId: eventId || undefined,
            eventSourceUrl: eventSourceUrl || undefined,
            userData: {
                ...userData,
                clientIp: userData?.clientIp || clientIp,
                clientUserAgent: userData?.clientUserAgent || clientUserAgent,
            },
            customData,
        });

        res.json({
            success: true,
            message: `Event Meta CAPI "${eventName}" berhasil diproses.`,
            data: result,
        });
    } catch (error: any) {
        console.error('Track Meta event controller error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengirim event ke Meta Conversions API.',
            error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        });
    }
}

