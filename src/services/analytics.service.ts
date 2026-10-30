import { BetaAnalyticsDataClient } from '@google-analytics/data';

/**
 * Interface response data analitik realtime
 */
export interface RealtimeAnalyticsData {
    activeUsers30Min: number;
    countries: Array<{ country: string; activeUsers: number }>;
    cities: Array<{ city: string; activeUsers: number }>;
    is_mock: boolean;
    property_id?: string;
}

/**
 * Interface response data grafik & ringkasan analitik
 */
export interface OverviewAnalyticsData {
    periodDays: number;
    summary: {
        totalUsers: number;
        sessions: number;
        pageViews: number;
        averageSessionDurationSeconds: number;
        averageSessionDurationFormatted: string;
        bounceRate: number; // Persentase pengunjung yang langsung keluar (misal: 38.5%)
        engagementRate: number; // Persentase pengunjung yang berinteraksi aktif (misal: 61.5%)
    };
    chart: Array<{
        date: string;
        formattedDate: string;
        activeUsers: number;
        sessions: number;
        pageViews: number;
    }>;
    topPages: Array<{
        path: string;
        title: string;
        pageViews: number;
    }>;
    topCities: Array<{
        city: string;
        activeUsers: number;
        percentage: number;
    }>;
    topSources: Array<{
        source: string;
        sessions: number;
    }>;
    is_mock: boolean;
    property_id?: string;
}

/**
 * Helper memformat durasi detik ke format menit dan detik
 */
export function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs} detik`;
    return `${mins} menit ${secs} detik`;
}

let cachedClient: BetaAnalyticsDataClient | null = null;
let clientInitialized = false;

/**
 * Helper untuk inisialisasi client Google Analytics Data API (Singleton)
 */
function getAnalyticsClient(): { client: BetaAnalyticsDataClient | null; propertyId: string | null } {
    const propertyId = process.env.GA4_PROPERTY_ID || null;
    const clientEmail = process.env.GA4_CLIENT_EMAIL || null;
    const privateKey = process.env.GA4_PRIVATE_KEY || null;

    if (!propertyId || !clientEmail || !privateKey) {
        return { client: null, propertyId: null };
    }

    if (!clientInitialized) {
        clientInitialized = true;
        try {
            cachedClient = new BetaAnalyticsDataClient({
                credentials: {
                    client_email: clientEmail,
                    private_key: privateKey.replace(/\\n/g, '\n'),
                },
            });
        } catch (err: any) {
            console.error('[GA4 INIT ERROR] Gagal menginisialisasi Google Analytics client:', err.message);
            cachedClient = null;
        }
    }

    return { client: cachedClient, propertyId };
}

/**
 * Mengambil data pengunjung realtime (30 menit terakhir)
 * Digunakan untuk widget live pengunjung di Dashboard Admin CMS
 */
export async function fetchRealtimeAnalytics(): Promise<RealtimeAnalyticsData> {
    const { client, propertyId } = getAnalyticsClient();

    // JIKA KREDENSIAL BELUM DISET: Kembalikan data simulasi/mock yang realistis
    if (!client || !propertyId) {
        return {
            activeUsers30Min: 3,
            countries: [
                { country: 'Indonesia', activeUsers: 3 },
            ],
            cities: [
                { city: 'Jakarta', activeUsers: 2 },
                { city: 'Surabaya', activeUsers: 1 },
            ],
            is_mock: true,
        };
    }

    try {
        const [response] = await client.runRealtimeReport({
            property: `properties/${propertyId}`,
            metrics: [{ name: 'activeUsers' }],
            dimensions: [{ name: 'country' }, { name: 'city' }],
        });

        let totalActiveUsers = 0;
        const countryMap: Record<string, number> = {};
        const cityMap: Record<string, number> = {};

        if (response.rows) {
            for (const row of response.rows) {
                const country = row.dimensionValues?.[0]?.value || 'Unknown';
                const city = row.dimensionValues?.[1]?.value || 'Unknown';
                const count = parseInt(row.metricValues?.[0]?.value || '0', 10);

                totalActiveUsers += count;
                countryMap[country] = (countryMap[country] || 0) + count;
                cityMap[city] = (cityMap[city] || 0) + count;
            }
        }

        const countries = Object.entries(countryMap).map(([country, activeUsers]) => ({ country, activeUsers }));
        const cities = Object.entries(cityMap).map(([city, activeUsers]) => ({ city, activeUsers }));

        return {
            activeUsers30Min: totalActiveUsers,
            countries,
            cities,
            is_mock: false,
            property_id: propertyId,
        };
    } catch (error: any) {
        console.error('[GA4 REALTIME ERROR]:', error.message);
        // Fallback jika API gagal (misal kuota habis atau izin salah)
        return {
            activeUsers30Min: 0,
            countries: [],
            cities: [],
            is_mock: true,
        };
    }
}

/**
 * Mengambil data ringkasan analitik & grafik tren (misal 7 hari atau 30 hari terakhir)
 * Digunakan untuk grafik tren kunjungan, halaman terpopuler, dan kota asal pengunjung
 */
export async function fetchOverviewAnalytics(days: number = 7): Promise<OverviewAnalyticsData> {
    const validDays = Math.min(Math.max(days, 1), 90);
    const { client, propertyId } = getAnalyticsClient();

    // JIKA KREDENSIAL BELUM DISET: Kembalikan data mock untuk mempermudah render grafik FE
    if (!client || !propertyId) {
        const mockChart = [];
        const today = new Date();
        for (let i = validDays - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const rawDate = `${yyyy}${mm}${dd}`;
            const formatted = `${dd}/${mm}`;

            // Angka acak realistis
            const base = 80 + Math.floor(Math.random() * 60);
            mockChart.push({
                date: rawDate,
                formattedDate: formatted,
                activeUsers: base,
                sessions: Math.round(base * 1.3),
                pageViews: Math.round(base * 2.8),
            });
        }

        const totalUsers = mockChart.reduce((acc, c) => acc + c.activeUsers, 0);
        const sessions = mockChart.reduce((acc, c) => acc + c.sessions, 0);
        const pageViews = mockChart.reduce((acc, c) => acc + c.pageViews, 0);

        return {
            periodDays: validDays,
            summary: {
                totalUsers,
                sessions,
                pageViews,
                averageSessionDurationSeconds: 154,
                averageSessionDurationFormatted: formatDuration(154),
                bounceRate: 36.5,
                engagementRate: 63.5,
            },
            chart: mockChart,
            topPages: [
                { path: '/', title: 'Home - Bengkel Detailing & Autocare', pageViews: Math.round(pageViews * 0.4) },
                { path: '/kalkulator', title: 'Kalkulator Harga Detailing Kendaraan', pageViews: Math.round(pageViews * 0.25) },
                { path: '/produk', title: 'Katalog Produk Perawatan Mobil', pageViews: Math.round(pageViews * 0.2) },
                { path: '/blogs', title: 'Tips Perawatan Cat Mobil & Coating', pageViews: Math.round(pageViews * 0.1) },
                { path: '/kontak', title: 'Lokasi & Reservasi WhatsApp', pageViews: Math.round(pageViews * 0.05) },
            ],
            topCities: [
                { city: 'Jakarta', activeUsers: Math.round(totalUsers * 0.45), percentage: 45 },
                { city: 'Surabaya', activeUsers: Math.round(totalUsers * 0.20), percentage: 20 },
                { city: 'Bandung', activeUsers: Math.round(totalUsers * 0.15), percentage: 15 },
                { city: 'Tangerang', activeUsers: Math.round(totalUsers * 0.10), percentage: 10 },
                { city: 'Semarang', activeUsers: Math.round(totalUsers * 0.10), percentage: 10 },
            ],
            topSources: [
                { source: 'google / organic', sessions: Math.round(sessions * 0.5) },
                { source: 'direct / (none)', sessions: Math.round(sessions * 0.25) },
                { source: 'instagram / social', sessions: Math.round(sessions * 0.15) },
                { source: 'tiktok / social', sessions: Math.round(sessions * 0.1) },
            ],
            is_mock: true,
        };
    }

    try {
        // 1. Ambil data deret waktu harian untuk grafik
        const [timeSeriesResponse] = await client.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: `${validDays}daysAgo`, endDate: 'today' }],
            dimensions: [{ name: 'date' }],
            metrics: [
                { name: 'activeUsers' },
                { name: 'sessions' },
                { name: 'screenPageViews' },
            ],
            orderBys: [{ dimension: { orderType: 'ALPHANUMERIC', dimensionName: 'date' } }],
        });

        const chart = (timeSeriesResponse.rows || []).map(row => {
            const rawDate = row.dimensionValues?.[0]?.value || '';
            const yyyy = rawDate.slice(0, 4);
            const mm = rawDate.slice(4, 6);
            const dd = rawDate.slice(6, 8);
            return {
                date: rawDate,
                formattedDate: `${dd}/${mm}`,
                activeUsers: parseInt(row.metricValues?.[0]?.value || '0', 10),
                sessions: parseInt(row.metricValues?.[1]?.value || '0', 10),
                pageViews: parseInt(row.metricValues?.[2]?.value || '0', 10),
            };
        });

        const totalUsers = chart.reduce((acc, c) => acc + c.activeUsers, 0);
        const sessions = chart.reduce((acc, c) => acc + c.sessions, 0);
        const pageViews = chart.reduce((acc, c) => acc + c.pageViews, 0);

        // 2. Ambil metrik agregat durasi & bounce rate
        const [summaryResponse] = await client.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: `${validDays}daysAgo`, endDate: 'today' }],
            metrics: [
                { name: 'averageSessionDuration' },
                { name: 'bounceRate' },
            ],
        });

        let avgDuration = 0;
        let bounceRate = 0;
        if (summaryResponse.rows && summaryResponse.rows[0]) {
            avgDuration = Math.round(parseFloat(summaryResponse.rows[0].metricValues?.[0]?.value || '0'));
            bounceRate = parseFloat((parseFloat(summaryResponse.rows[0].metricValues?.[1]?.value || '0') * 100).toFixed(1));
        }
        const engagementRate = parseFloat((100 - bounceRate).toFixed(1));

        // 3. Ambil Top 5 Halaman Terbanyak Dilihat
        const [pagesResponse] = await client.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: `${validDays}daysAgo`, endDate: 'today' }],
            dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
            metrics: [{ name: 'screenPageViews' }],
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
            limit: 5,
        });

        const topPages = (pagesResponse.rows || []).map(row => ({
            path: row.dimensionValues?.[0]?.value || '/',
            title: row.dimensionValues?.[1]?.value || 'Page',
            pageViews: parseInt(row.metricValues?.[0]?.value || '0', 10),
        }));

        // 4. Ambil Top 5 Kota Pengunjung
        const [citiesResponse] = await client.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: `${validDays}daysAgo`, endDate: 'today' }],
            dimensions: [{ name: 'city' }],
            metrics: [{ name: 'activeUsers' }],
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
            limit: 5,
        });

        const topCities = (citiesResponse.rows || []).map(row => {
            const activeUsers = parseInt(row.metricValues?.[0]?.value || '0', 10);
            const percentage = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
            return {
                city: row.dimensionValues?.[0]?.value || 'Unknown',
                activeUsers,
                percentage,
            };
        });

        // 5. Ambil Top Sumber Trafik
        const [sourcesResponse] = await client.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: `${validDays}daysAgo`, endDate: 'today' }],
            dimensions: [{ name: 'sessionSource' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 5,
        });

        const topSources = (sourcesResponse.rows || []).map(row => ({
            source: row.dimensionValues?.[0]?.value || 'direct',
            sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
        }));

        return {
            periodDays: validDays,
            summary: {
                totalUsers,
                sessions,
                pageViews,
                averageSessionDurationSeconds: avgDuration,
                averageSessionDurationFormatted: formatDuration(avgDuration),
                bounceRate,
                engagementRate,
            },
            chart,
            topPages,
            topCities,
            topSources,
            is_mock: false,
            property_id: propertyId,
        };
    } catch (error: any) {
        console.error('[GA4 OVERVIEW ERROR]:', error.message);
        throw error;
    }
}
