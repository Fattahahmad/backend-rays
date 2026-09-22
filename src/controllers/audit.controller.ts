import type { Request, Response } from 'express';
import { query } from '../config/db.ts';

/**
 * GET /api/audit-logs (Super Admin Only)
 * Mengambil riwayat log audit aktivitas admin dan super admin
 * Mendukung filter: user_id, action, entity_type, search, rentang tanggal (start_date & end_date), dan pagination
 */
export async function getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const { user_id, action, entity_type, search, start_date, end_date } = req.query;

        const whereConditions: string[] = ['1=1'];
        const params: any[] = [];
        let index = 1;

        if (user_id) {
            whereConditions.push(`a.user_id = $${index++}`);
            params.push(parseInt(user_id as string));
        }

        if (action) {
            whereConditions.push(`a.action ILIKE $${index++}`);
            params.push(`%${(action as string).trim()}%`);
        }

        if (entity_type) {
            whereConditions.push(`a.entity_type ILIKE $${index++}`);
            params.push(`%${(entity_type as string).trim()}%`);
        }

        if (search) {
            whereConditions.push(`(a.description ILIKE $${index} OR a.action ILIKE $${index} OR u.name ILIKE $${index} OR u.email ILIKE $${index})`);
            params.push(`%${(search as string).trim()}%`);
            index++;
        }

        if (start_date) {
            whereConditions.push(`a.created_at >= $${index++}`);
            params.push(start_date);
        }

        if (end_date) {
            whereConditions.push(`a.created_at <= $${index++}`);
            params.push(end_date);
        }

        const whereClause = 'WHERE ' + whereConditions.join(' AND ');

        // Hitung total log
        const countSql = `
            SELECT COUNT(*) as total
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ${whereClause}
        `;
        const countResult = await query(countSql, params);
        const total = parseInt((countResult.rows[0] as any).total) || 0;

        // Ambil data log beserta profil admin pelaku
        const selectSql = `
            SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.description, a.details,
                   a.ip_address, a.user_agent, a.created_at,
                   u.name as admin_name, u.email as admin_email, u.role as admin_role, u.avatar_url as admin_avatar
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ${whereClause}
            ORDER BY a.id DESC
            LIMIT $${index++} OFFSET $${index}
        `;
        params.push(limit, offset);

        const logsResult = await query(selectSql, params);

        res.json({
            success: true,
            data: logsResult.rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data log audit.' });
    }
}
