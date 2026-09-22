import type { Request } from 'express';
import { query } from '../config/db.ts';

export interface AuditLogParams {
    userId?: number | null;
    action: string;
    entityType: string;
    entityId?: number | null;
    description: string;
    details?: any;
    req?: Request;
}

/**
 * Menyaring kunci sensitif seperti kata sandi atau token sebelum disimpan ke audit log
 */
function sanitizeDetails(data: any): any {
    if (!data || typeof data !== 'object') return data;

    if (Array.isArray(data)) {
        return data.map(item => sanitizeDetails(item));
    }

    const sanitized: Record<string, any> = {};
    const sensitiveKeys = ['password', 'token', 'idtoken', 'authorization', 'secret', 'key'];

    for (const [key, value] of Object.entries(data)) {
        if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
            sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeDetails(value);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

/**
 * Mencatat aktivitas admin ke dalam tabel audit_logs secara asynchronous di background
 */
export async function recordAuditLog(params: AuditLogParams): Promise<void> {
    try {
        const { userId, action, entityType, entityId, description, details, req } = params;

        let ipAddress = 'unknown';
        let userAgent = 'unknown';

        if (req) {
            const forwarded = req.headers['x-forwarded-for'];
            if (typeof forwarded === 'string') {
                ipAddress = forwarded.split(',')[0].trim();
            } else if (req.socket?.remoteAddress) {
                ipAddress = req.socket.remoteAddress;
            } else if (req.ip) {
                ipAddress = req.ip;
            }

            if (req.headers['user-agent']) {
                userAgent = req.headers['user-agent'];
            }
        }

        const cleanDetails = details ? sanitizeDetails(details) : null;
        const detailsJson = cleanDetails ? JSON.stringify(cleanDetails) : null;

        await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description, details, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                userId || null,
                action.toUpperCase().trim(),
                entityType.toLowerCase().trim(),
                entityId ? Number(entityId) : null,
                description.trim(),
                detailsJson,
                ipAddress,
                userAgent,
            ]
        );
    } catch (err: any) {
        console.error('[AUDIT LOG ERROR] Gagal mencatat log aktivitas:', err.message);
    }
}
