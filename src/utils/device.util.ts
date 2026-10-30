import type { Request } from 'express';
import jwt from 'jsonwebtoken';

export interface DeviceInfo {
    device_name: string;
    device_type: 'desktop' | 'mobile' | 'tablet';
    browser: string;
    os: string;
    ip_address: string;
}

export interface UserDeviceSession {
    id: string;
    token: string;
    device_name: string;
    device_type: 'desktop' | 'mobile' | 'tablet';
    browser: string;
    os: string;
    ip_address: string;
    last_active: string;
    created_at: string;
}

/**
 * Mengekstrak informasi perangkat (OS, Browser, Tipe Perangkat, dan IP) dari HTTP Request
 */
export function extractDeviceInfo(req: Request): DeviceInfo {
    const ua = req.headers['user-agent'] || '';

    // 1. Deteksi Sistem Operasi (OS)
    let os = 'Unknown OS';
    if (/windows phone/i.test(ua)) os = 'Windows Phone';
    else if (/win64|win32|windows/i.test(ua)) {
        if (/windows nt 10.0/i.test(ua)) os = 'Windows 11/10';
        else if (/windows nt 6.3/i.test(ua)) os = 'Windows 8.1';
        else if (/windows nt 6.1/i.test(ua)) os = 'Windows 7';
        else os = 'Windows';
    } else if (/iphone/i.test(ua)) os = 'iOS (iPhone)';
    else if (/ipad/i.test(ua)) os = 'iPadOS';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
    else if (/linux/i.test(ua)) os = 'Linux';

    // 2. Deteksi Browser
    let browser = 'Web Browser';
    if (/edg\//i.test(ua)) browser = 'Microsoft Edge';
    else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
    else if (/chrome|crios/i.test(ua)) browser = 'Google Chrome';
    else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';
    else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = 'Apple Safari';
    else if (/postmanruntime/i.test(ua)) browser = 'Postman Client';
    else if (/dart/i.test(ua) || /raysapp/i.test(ua)) browser = 'Rays Mobile App';

    // 3. Deteksi Tipe Perangkat
    let device_type: 'desktop' | 'mobile' | 'tablet' = 'desktop';
    if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
        device_type = 'tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
        device_type = 'mobile';
    }

    // 4. Deteksi IP Address
    const forwarded = req.headers['x-forwarded-for'];
    let ip_address = '127.0.0.1';
    if (typeof forwarded === 'string' && forwarded.trim()) {
        ip_address = forwarded.split(',')[0].trim();
    } else if (req.ip) {
        ip_address = req.ip;
    } else if (req.socket?.remoteAddress) {
        ip_address = req.socket.remoteAddress;
    }

    // Normalisasi IPv6 localhost
    if (ip_address === '::1' || ip_address === '::ffff:127.0.0.1') {
        ip_address = '127.0.0.1';
    }

    // Nama perangkat gabungan untuk header kartu UI
    const device_name = `${os} · ${browser}`;

    return {
        device_name,
        device_type,
        browser,
        os,
        ip_address,
    };
}

/**
 * Membaca daftar sesi perangkat aktif dari JSON kolom refresh_token
 * Otomatis membuang token yang expired > 7 hari
 */
export function parseDeviceSessions(raw: string | null): UserDeviceSession[] {
    if (!raw) return [];

    let list: any[] = [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            list = parsed;
        } else if (typeof parsed === 'string') {
            list = [parsed];
        } else {
            list = [raw];
        }
    } catch {
        list = [raw];
    }

    const now = Math.floor(Date.now() / 1000);
    const validSessions: UserDeviceSession[] = [];

    list.forEach((item, index) => {
        // Dukungan untuk sesi objek baru
        if (item && typeof item === 'object' && typeof item.token === 'string') {
            try {
                const decoded: any = jwt.decode(item.token);
                if (decoded && typeof decoded.exp === 'number' && decoded.exp <= now) {
                    return; // Expired, lewati
                }
            } catch {
                return;
            }

            validSessions.push({
                id: item.id || `sess_${Date.now()}_${index}`,
                token: item.token,
                device_name: item.device_name || 'Perangkat Aktif',
                device_type: item.device_type || 'desktop',
                browser: item.browser || 'Web Browser',
                os: item.os || 'Desktop OS',
                ip_address: item.ip_address || '127.0.0.1',
                last_active: item.last_active || new Date().toISOString(),
                created_at: item.created_at || new Date().toISOString(),
            });
            return;
        }

        // Fallback untuk token string lama (legacy)
        if (typeof item === 'string' && item.trim()) {
            try {
                const decoded: any = jwt.decode(item);
                if (decoded && typeof decoded.exp === 'number' && decoded.exp <= now) {
                    return;
                }
            } catch {
                return;
            }

            validSessions.push({
                id: `sess_legacy_${index}_${Math.random().toString(36).substring(2, 6)}`,
                token: item,
                device_name: 'Perangkat Web',
                device_type: 'desktop',
                browser: 'Web Browser',
                os: 'Desktop',
                ip_address: '127.0.0.1',
                last_active: new Date().toISOString(),
                created_at: new Date().toISOString(),
            });
        }
    });

    return validSessions;
}

/**
 * Menambahkan sesi perangkat baru saat login
 */
export function addOrUpdateDeviceSession(
    existingRaw: string | null,
    newToken: string,
    req: Request,
    maxDevices = 5
): string {
    const sessions = parseDeviceSessions(existingRaw);
    const deviceInfo = extractDeviceInfo(req);
    const nowIso = new Date().toISOString();

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newSession: UserDeviceSession = {
        id: sessionId,
        token: newToken,
        device_name: deviceInfo.device_name,
        device_type: deviceInfo.device_type,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        ip_address: deviceInfo.ip_address,
        last_active: nowIso,
        created_at: nowIso,
    };

    sessions.push(newSession);

    // Batasi kuota maksimal perangkat (cth: 5 perangkat)
    while (sessions.length > maxDevices) {
        sessions.shift();
    }

    return JSON.stringify(sessions);
}

/**
 * Memperbarui refresh token dan waktu aktif pada sesi perangkat yang cocok saat rotasi token
 */
export function rotateDeviceSession(
    existingRaw: string | null,
    oldToken: string,
    newToken: string,
    req: Request
): string {
    const sessions = parseDeviceSessions(existingRaw);
    const deviceInfo = extractDeviceInfo(req);
    const nowIso = new Date().toISOString();

    let matched = false;
    for (const sess of sessions) {
        if (sess.token === oldToken) {
            sess.token = newToken;
            sess.last_active = nowIso;
            sess.ip_address = deviceInfo.ip_address;
            sess.device_name = deviceInfo.device_name;
            sess.browser = deviceInfo.browser;
            sess.os = deviceInfo.os;
            sess.device_type = deviceInfo.device_type;
            matched = true;
            break;
        }
    }

    if (!matched) {
        return addOrUpdateDeviceSession(existingRaw, newToken, req);
    }

    return JSON.stringify(sessions);
}

/**
 * Menghapus sesi perangkat tertentu berdasarkan refresh token (Logout perangkat ini)
 */
export function removeDeviceSessionByToken(existingRaw: string | null, tokenToRemove?: string | null): string | null {
    if (!tokenToRemove) return null;
    const sessions = parseDeviceSessions(existingRaw).filter(s => s.token !== tokenToRemove);
    return sessions.length > 0 ? JSON.stringify(sessions) : null;
}

/**
 * Menghapus sesi perangkat tertentu berdasarkan ID sesi (Kick perangkat tertentu)
 */
export function removeDeviceSessionById(existingRaw: string | null, sessionIdToRemove: string): string | null {
    const sessions = parseDeviceSessions(existingRaw).filter(s => s.id !== sessionIdToRemove);
    return sessions.length > 0 ? JSON.stringify(sessions) : null;
}

/**
 * Mengakhiri seluruh sesi selain sesi saat ini (Logout dari semua perangkat lain)
 */
export function removeAllOtherSessions(
    existingRaw: string | null,
    currentTokenOrId?: string | null
): string | null {
    const sessions = parseDeviceSessions(existingRaw);
    if (sessions.length <= 1) {
        return existingRaw;
    }

    if (currentTokenOrId) {
        // Cari satu sesi aktif yang cocok dengan ID sesi atau token yang sedang digunakan
        const matched = sessions.find(
            s => s.id === currentTokenOrId || s.token === currentTokenOrId
        );
        if (matched) {
            return JSON.stringify([matched]);
        }
    }

    // Jika token/ID sesi saat ini tidak dikirimkan, pertahankan 1 sesi paling terakhir aktif
    const mostRecent = sessions[sessions.length - 1];
    return JSON.stringify([mostRecent]);
}

/**
 * Format label aktivitas perangkat relatif ramah pengguna (contoh: "Aktif baru saja", "Aktif 5 menit yang lalu")
 */
export function formatRelativeTime(dateInput: string | Date): string {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return 'Baru saja';

    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 2) return 'Aktif baru saja';
    if (diffMin < 60) return `Aktif ${diffMin} menit yang lalu`;
    if (diffHours < 24) return `Aktif ${diffHours} jam yang lalu`;
    if (diffDays === 1) return 'Aktif kemarin';
    if (diffDays < 7) return `Aktif ${diffDays} hari yang lalu`;

    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * Format teks aktivitas login terakhir (misal: "Terakhir masuk hari ini", "Terakhir masuk kemarin")
 */
export function formatRelativeLogin(dateInput?: string | Date | null): string {
    if (!dateInput) return 'Terakhir masuk hari ini';
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return 'Terakhir masuk hari ini';

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return 'Terakhir masuk hari ini';

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isYesterday) return 'Terakhir masuk kemarin';

    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 7 && diffDays > 0) {
        return `Terakhir masuk ${diffDays} hari yang lalu`;
    }

    return `Terakhir masuk ${date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })}`;
}
