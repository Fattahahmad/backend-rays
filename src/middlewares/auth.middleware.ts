import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthUser } from '../types/auth.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'rays_autocare_secret_key_2026';

/**
 * Middleware untuk memverifikasi JWT token dari header Authorization: Bearer <token>
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        res.status(401).json({
            success: false,
            message: 'Akses ditolak: Token autentikasi tidak ditemukan.',
        });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({
            success: false,
            message: 'Akses ditolak: Token tidak valid atau sudah kedaluwarsa.',
        });
    }
}

/**
 * Middleware untuk memverifikasi token opsional
 * Jika header Authorization dikirimkan dan sah, req.user akan diisi.
 * Jika tidak dikirimkan, request tetap dilanjutkan sebagai tamu publik.
 */
export function optionalAuthenticateToken(req: Request, _res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
        req.user = decoded;
    } catch {
        // Token tidak valid atau kedaluwarsa, abaikan dan lanjut sebagai publik
    }
    next();
}

/**
 * Middleware Role-Based Access Control (RBAC).
 * Membatasi akses endpoint hanya untuk role tertentu (misal: 'admin', 'super_admin').
 */
export function requireRoles(...allowedRoles: Array<'user' | 'admin' | 'super_admin'>) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Autentikasi diperlukan sebelum memeriksa izin akses.',
            });
            return;
        }

        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                message: 'Forbidden: Anda tidak memiliki izin untuk mengakses resource ini.',
            });
            return;
        }

        next();
    };
}
