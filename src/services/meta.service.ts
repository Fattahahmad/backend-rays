import crypto from 'crypto';

/**
 * Interface data pengguna untuk Meta Conversions API (CAPI)
 * Meta mewajibkan hashing SHA-256 untuk data sensitif seperti email dan nomor telepon.
 */
export interface MetaUserData {
    email?: string | null;
    phone?: string | null;
    clientIp?: string | null;
    clientUserAgent?: string | null;
    fbp?: string | null; // Cookie _fbp dari browser (Meta Click / Browser Identifier)
    fbc?: string | null; // Cookie _fbc dari browser (Meta Click ID)
}

/**
 * Interface data transaksi / produk untuk Meta CAPI
 */
export interface MetaCustomData {
    currency?: string;
    value?: number;
    content_name?: string;
    content_category?: string;
    content_ids?: Array<string | number>;
    content_type?: 'product' | 'product_group';
    order_id?: string;
    num_items?: number;
    [key: string]: any;
}

/**
 * Parameter pengiriman event ke Meta CAPI
 */
export interface SendMetaEventParams {
    eventName: 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase' | 'Lead' | 'CompleteRegistration' | string;
    eventId?: string; // ID unik (misal nomor order atau UUID) untuk deduplikasi dengan Pixel di browser
    eventSourceUrl?: string;
    userData?: MetaUserData;
    customData?: MetaCustomData;
}

/**
 * Helper hashing SHA-256 sesuai standarisasi Meta Conversions API
 */
export function hashSha256(value?: string | null): string | undefined {
    if (!value) return undefined;
    const clean = value.trim().toLowerCase();
    if (!clean) return undefined;
    return crypto.createHash('sha256').update(clean).digest('hex');
}

/**
 * Helper normalisasi nomor telepon Indonesia (misal: 0812345 -> 62812345)
 */
export function normalizePhone(phone?: string | null): string | undefined {
    if (!phone) return undefined;
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
        clean = '62' + clean.slice(1);
    }
    return clean;
}

/**
 * Mengirimkan Server-Side Event ke Meta Conversions API (CAPI)
 * Endpoint Meta: https://graph.facebook.com/v19.0/{PIXEL_ID}/events
 */
export async function sendMetaEvent(params: SendMetaEventParams): Promise<{
    success: boolean;
    simulated?: boolean;
    data?: any;
    error?: string;
}> {
    const pixelId = process.env.META_PIXEL_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;
    const testEventCode = process.env.META_TEST_EVENT_CODE;

    // JIKA KREDENSIAL BELUM DISET DI .ENV:
    // Jalankan mode simulasi (mock) agar backend tetap lancar dan tidak error
    if (!pixelId || !accessToken) {
        if (process.env.NODE_ENV !== 'production') {
            console.log(
                `[Meta CAPI Simulator] Event "${params.eventName}" (Event ID: ${params.eventId || 'none'}) disimulasikan. Variabel META_PIXEL_ID atau META_ACCESS_TOKEN belum diatur di .env.`
            );
        }
        return {
            success: true,
            simulated: true,
            data: {
                event_name: params.eventName,
                event_id: params.eventId,
                status: 'simulated',
            },
        };
    }

    try {
        const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;

        const normalizedPhone = normalizePhone(params.userData?.phone);
        const hashedEmail = hashSha256(params.userData?.email);
        const hashedPhone = hashSha256(normalizedPhone);

        const eventData: any = {
            event_name: params.eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: params.eventId,
            event_source_url: params.eventSourceUrl || 'https://raysautocare.com',
            action_source: 'website',
            user_data: {
                ...(hashedEmail ? { em: [hashedEmail] } : {}),
                ...(hashedPhone ? { ph: [hashedPhone] } : {}),
                ...(params.userData?.clientIp ? { client_ip_address: params.userData.clientIp } : {}),
                ...(params.userData?.clientUserAgent ? { client_user_agent: params.userData.clientUserAgent } : {}),
                ...(params.userData?.fbp ? { fbp: params.userData.fbp } : {}),
                ...(params.userData?.fbc ? { fbc: params.userData.fbc } : {}),
            },
            custom_data: {
                currency: params.customData?.currency || 'IDR',
                ...params.customData,
            },
        };

        const body: any = {
            data: [eventData],
        };

        // Jika sedang testing di Meta Events Manager Test Events Tab
        if (testEventCode) {
            body.test_event_code = testEventCode;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const json: any = await response.json();

        if (!response.ok) {
            console.error('[Meta CAPI Error Response]:', json);
            return {
                success: false,
                error: json.error?.message || 'Meta CAPI request failed',
            };
        }

        return {
            success: true,
            simulated: false,
            data: json,
        };
    } catch (err: any) {
        console.error('[Meta CAPI Network Error]:', err.message);
        return {
            success: false,
            error: err.message,
        };
    }
}
