import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { query } from '../config/db.ts';
import { recordAuditLog } from '../services/audit.service.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'rays_autocare_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Generate JWT token untuk autentikasi user
 */
function generateToken(user: { id: number; email: string; role: string; name?: string }): string {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN as any }
    );
}

/**
 * POST /api/auth/register
 * Registrasi manual: membuat user dengan is_email_verified = false dan mengirim kode OTP
 */
export async function register(req: Request, res: Response): Promise<void> {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            res.status(400).json({ success: false, message: 'Nama, email, dan password wajib diisi.' });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        // 1. Cek apakah email sudah terdaftar
        const existingUser = await query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
        if (existingUser.rowCount > 0 && existingUser.rows[0].is_email_verified) {
            res.status(400).json({ success: false, message: 'Email sudah terdaftar. Silakan login.' });
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Jika user sudah ada tapi belum terverifikasi, update passwordnya
        if (existingUser.rowCount > 0) {
            await query(
                'UPDATE users SET name = $1, password = $2 WHERE email = $3',
                [name, hashedPassword, normalizedEmail]
            );
        } else {
            await query(
                'INSERT INTO users (name, email, password, role, is_email_verified) VALUES ($1, $2, $3, $4, $5)',
                [name, normalizedEmail, hashedPassword, 'user', false]
            );
        }

        // 2. Generate kode OTP 6 digit
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

        await query(
            'INSERT INTO otps (email, otp_code, type, expires_at) VALUES ($1, $2, $3, $4)',
            [normalizedEmail, otpCode, 'registration', expiresAt]
        );

        console.log(`[OTP REGISTRATION] Email: ${normalizedEmail} | Kode: ${otpCode}`);

        res.status(201).json({
            success: true,
            message: 'Registrasi berhasil. Kode OTP telah dikirimkan ke email Anda.',
            data: {
                email: normalizedEmail,
                // Dikirim untuk kemudahan testing lokal (dapat disembunyikan di production)
                debugOtp: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
            },
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat registrasi.' });
    }
}

/**
 * POST /api/auth/verify-otp
 * Memverifikasi kode OTP dan mengaktifkan akun user
 */
export async function verifyOtp(req: Request, res: Response): Promise<void> {
    try {
        const { email, otpCode } = req.body;

        if (!email || !otpCode) {
            res.status(400).json({ success: false, message: 'Email dan kode OTP wajib diisi.' });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        // 1. Validasi OTP yang masih berlaku dan belum digunakan
        const otpResult = await query(
            'SELECT * FROM otps WHERE email = $1 AND otp_code = $2 AND is_used = false AND expires_at > CURRENT_TIMESTAMP ORDER BY id DESC LIMIT 1',
            [normalizedEmail, otpCode]
        );

        if (otpResult.rowCount === 0) {
            res.status(400).json({
                success: false,
                message: 'Kode OTP tidak valid atau sudah kedaluwarsa.',
            });
            return;
        }

        // 2. Tandai OTP telah digunakan
        await query('UPDATE otps SET is_used = true WHERE id = $1', [otpResult.rows[0].id]);

        // 3. Update status email_verified pada tabel users
        await query('UPDATE users SET is_email_verified = true WHERE email = $1', [normalizedEmail]);

        const userResult = await query('SELECT id, name, email, role, phone_number, avatar_url FROM users WHERE email = $1', [normalizedEmail]);
        const user = userResult.rows[0];

        const token = generateToken(user);

        res.json({
            success: true,
            message: 'Email berhasil diverifikasi!',
            token,
            user,
            needsPhone: !user.phone_number,
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat memverifikasi OTP.' });
    }
}

/**
 * POST /api/auth/resend-otp
 * Mengirim ulang kode OTP
 */
export async function resendOtp(req: Request, res: Response): Promise<void> {
    try {
        const { email } = req.body;
        if (!email) {
            res.status(400).json({ success: false, message: 'Email wajib diisi.' });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        const userCheck = await query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
        if (userCheck.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Email tidak ditemukan.' });
            return;
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await query(
            'INSERT INTO otps (email, otp_code, type, expires_at) VALUES ($1, $2, $3, $4)',
            [normalizedEmail, otpCode, 'registration', expiresAt]
        );

        console.log(`[RESEND OTP] Email: ${normalizedEmail} | Kode: ${otpCode}`);

        res.json({
            success: true,
            message: 'Kode OTP baru telah dikirimkan ke email Anda.',
            debugOtp: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
        });
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengirim ulang OTP.' });
    }
}

/**
 * POST /api/auth/login
 * Login manual dengan email & password
 */
export async function login(req: Request, res: Response): Promise<void> {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        const userResult = await query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
        if (userResult.rowCount === 0) {
            res.status(400).json({ success: false, message: 'Email atau password salah.' });
            return;
        }

        const user = userResult.rows[0];

        // Jika user hanya login via Google dan belum punya password
        if (!user.password) {
            res.status(400).json({
                success: false,
                message: 'Akun ini terdaftar via Google. Silakan login menggunakan tombol Google.',
            });
            return;
        }

        // Cek password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            res.status(400).json({ success: false, message: 'Email atau password salah.' });
            return;
        }

        // Cek apakah email sudah diverifikasi
        if (!user.is_email_verified) {
            res.status(403).json({
                success: false,
                message: 'Email Anda belum diverifikasi. Silakan lakukan verifikasi OTP terlebih dahulu.',
                needsVerification: true,
                email: user.email,
            });
            return;
        }

        const token = generateToken(user);

        // Catat audit log jika yang login adalah admin / super_admin
        if (['admin', 'super_admin'].includes(user.role)) {
            recordAuditLog({
                userId: user.id,
                action: 'ADMIN_LOGIN',
                entityType: 'auth',
                entityId: user.id,
                description: `${user.name} (${user.role}) berhasil login ke sistem via Email & Password`,
                details: { email: user.email, role: user.role, method: 'manual' },
                req,
            });
        }

        res.json({
            success: true,
            message: 'Login berhasil!',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar_url: user.avatar_url,
                phone_number: user.phone_number,
            },
            needsPhone: !user.phone_number,
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat login.' });
    }
}

/**
 * POST /api/auth/google
 * Login & Register otomatis via Google OAuth (ID Token)
 */
export async function googleAuth(req: Request, res: Response): Promise<void> {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            res.status(400).json({ success: false, message: 'Google idToken wajib dikirimkan.' });
            return;
        }

        // 1. Verifikasi ID Token dari Google
        let googlePayload;
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            googlePayload = ticket.getPayload();
        } catch (verifyErr) {
            console.error('Google token verification failed:', verifyErr);
            res.status(400).json({ success: false, message: 'Token Google tidak valid atau kedaluwarsa.' });
            return;
        }

        if (!googlePayload || !googlePayload.email) {
            res.status(400).json({ success: false, message: 'Profil Google tidak memiliki email.' });
            return;
        }

        const { sub: googleId, email, name, picture: avatarUrl } = googlePayload;
        const normalizedEmail = email.toLowerCase();

        // 2. Cek apakah user sudah terdaftar berdasarkan google_id atau email
        const existingUser = await query(
            'SELECT * FROM users WHERE google_id = $1 OR email = $2',
            [googleId, normalizedEmail]
        );

        let user;

        if (existingUser.rowCount > 0) {
            user = existingUser.rows[0];

            // Update google_id & avatar jika sebelumnya belum tersinkron
            await query(
                'UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), is_email_verified = true WHERE id = $3',
                [googleId, avatarUrl, user.id]
            );
        } else {
            // User baru -> Google email otomatis terverifikasi (is_email_verified = true)
            await query(
                'INSERT INTO users (name, email, google_id, avatar_url, role, is_email_verified) VALUES ($1, $2, $3, $4, $5, $6)',
                [name || 'Google User', normalizedEmail, googleId, avatarUrl, 'user', true]
            );

            const newUserResult = await query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
            user = newUserResult.rows[0];
        }

        const token = generateToken(user);

        // Catat audit log jika yang login adalah admin / super_admin
        if (['admin', 'super_admin'].includes(user.role)) {
            recordAuditLog({
                userId: user.id,
                action: 'ADMIN_LOGIN',
                entityType: 'auth',
                entityId: user.id,
                description: `${user.name} (${user.role}) berhasil login ke sistem via Google OAuth`,
                details: { email: user.email, role: user.role, method: 'google' },
                req,
            });
        }

        res.json({
            success: true,
            message: 'Login Google berhasil!',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar_url: user.avatar_url || avatarUrl,
                phone_number: user.phone_number,
            },
            needsPhone: !user.phone_number,
        });
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat autentikasi Google.' });
    }
}
