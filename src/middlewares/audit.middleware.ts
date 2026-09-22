import type { Request, Response, NextFunction } from 'express';
import { recordAuditLog } from '../services/audit.service.ts';

const MUTATION_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

/**
 * Middleware untuk merekam secara otomatis seluruh aktivitas mutasi data yang dilakukan oleh Admin & Super Admin
 */
export function auditLogMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!MUTATION_METHODS.includes(req.method)) {
        return next();
    }

    res.on('finish', () => {
        // Hanya catat jika request berhasil (status < 400) dan dilakukan oleh akun admin / super_admin
        if (res.statusCode < 400 && req.user && ['admin', 'super_admin'].includes(req.user.role)) {
            const pathParts = req.originalUrl.split('?')[0].split('/').filter(Boolean);
            // pathParts contoh: ['api', 'products', '12']
            const moduleName = pathParts[1] || 'system';
            const entityType = moduleName.replace(/s$/, ''); // products -> product, categories -> categorie -> category

            let actionVerb = 'MUTATE';
            if (req.method === 'POST') actionVerb = 'CREATE';
            else if (req.method === 'PATCH' || req.method === 'PUT') actionVerb = 'UPDATE';
            else if (req.method === 'DELETE') actionVerb = 'DELETE';

            const action = `${actionVerb}_${entityType.toUpperCase()}`;

            // Cari kemungkinan entity ID dari parameter URL
            const potentialId = pathParts.find((part, idx) => idx > 1 && /^\d+$/.test(part));
            const entityId = potentialId ? parseInt(potentialId) : null;

            const adminName = req.user.name || req.user.email;
            const description = `${adminName} (${req.user.role}) melakukan ${req.method} pada ${req.originalUrl}`;

            recordAuditLog({
                userId: req.user.id,
                action,
                entityType,
                entityId,
                description,
                details: {
                    method: req.method,
                    url: req.originalUrl,
                    body: req.body,
                    params: req.params,
                    query: req.query,
                    statusCode: res.statusCode,
                },
                req,
            });
        }
    });

    next();
}
