import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { query } from '../config/db.ts';
import { recordAuditLog } from '../services/audit.service.ts';
import { sendOtpEmail, sendForgotPasswordEmail } from '../services/mail.service.ts';
import {
    addOrUpdateDeviceSession,
    rotateDeviceSession,
    removeDeviceSessionByToken,
    parseDeviceSessions,
} from '../utils/device.util.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'rays_autocare_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m'; // Access token berlaku 15 menit
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET + '_refresh_key_2026';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'; // Refresh token berlaku 7 hari
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Generate Access Token & Refresh Token pair
 */
function generateTokens(user: { id: number; email: string; role: string; name?: string }): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN as any }
    );
    const refreshToken = jwt.sign(
        {
            id: user.id,
            email: user.email,
            jti: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        },
        REFRESH_TOKEN_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES_IN as any }
    );
    return { accessToken, refreshToken };
}

function generateToken(user: { id: number; email: string; role: string; name?: string }): string {
    return generateTokens(user).accessToken;
}

/**
 * Multi-device Session Helper:
 * Mengambil daftar token valid dari JSON array sesi di kolom refresh_token
 */
function parseRefreshTokens(raw: string | null): string[] {
    return parseDeviceSessions(raw).map((s) => s.token);
}

/**
 * POST /api/auth/register
 * Registrasi manual: membuat user dengan is_email_verified = false dan mengirim kode OTP
 */
export async function register(req: Request, res: Response): Promise<void> {
    try {
        const { name, email, password } = req.body;
        const rawPhone = req.body.phone_number || req.body.phoneNumber || req.body.phone;
        const cleanPhone = rawPhone ? String(rawPhone).trim() : null;

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

        // Jika user sudah ada tapi belum terverifikasi, update password dan nomor handphone
        if (existingUser.rowCount > 0) {
            await query(
                `UPDATE users 
                 SET name = $1, password = $2, phone_number = COALESCE($3, phone_number) 
                 WHERE email = $4`,
                [name, hashedPassword, cleanPhone, normalizedEmail]
            );
        } else {
            await query(
                'INSERT INTO users (name, email, password, phone_number, role, is_email_verified) VALUES ($1, $2, $3, $4, $5, $6)',
                [name, normalizedEmail, hashedPassword, cleanPhone, 'user', false]
            );
        }

        // 2. Generate kode OTP 6 digit
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

        await query(
            'INSERT INTO otps (email, otp_code, type, expires_at) VALUES ($1, $2, $3, $4)',
            [normalizedEmail, otpCode, 'registration', expiresAt]
        );

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[OTP REGISTRATION] Email: ${normalizedEmail} | Kode: ${otpCode}`);
        }

        // Kirim email OTP via Nodemailer (Mailtrap di Dev / Hostinger di Prod)
        const mailResult = await sendOtpEmail(normalizedEmail, otpCode, name);
        if (!mailResult.success) {
            res.status(502).json({
                success: false,
                message: 'Akun tersimpan, tetapi email OTP gagal dikirim. Silakan coba kirim ulang OTP.',
            });
            return;
        }

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
        const email = req.body.email;
        const otpCode = req.body.otpCode || req.body.otp;

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

        const userResult = await query('SELECT id, name, email, role, phone_number, avatar_url, refresh_token FROM users WHERE email = $1', [normalizedEmail]);
        const user = userResult.rows[0];

        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

        // Simpan refresh token & metadata sesi perangkat ke database (multi-device session support)
        const updatedTokens = addOrUpdateDeviceSession(user.refresh_token, newRefreshToken, req);
        await query('UPDATE users SET refresh_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [updatedTokens, user.id]);

        res.json({
            success: true,
            message: 'Email berhasil diverifikasi!',
            token: accessToken,
            accessToken,
            refreshToken: newRefreshToken,
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
        console.error('Verify OTP error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan saat memverifikasi OTP.' });
    }
}

/**
 * POST /api/auth/resend-otp
 * Mengirim ulang kode OTP (Mendukung type: 'registration' atau 'forgot_password')
 */
export async function resendOtp(req: Request, res: Response): Promise<void> {
    try {
        const { email } = req.body;
        const type = req.body.type === 'forgot_password' ? 'forgot_password' : 'registration';

        if (!email) {
            res.status(400).json({ success: false, message: 'Email wajib diisi.' });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        const userCheck = await query('SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL', [normalizedEmail]);
        if (userCheck.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Email tidak ditemukan.' });
            return;
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        // Invalidate OTP aktif sebelumnya untuk tipe ini
        await query(
            'UPDATE otps SET is_used = true WHERE email = $1 AND type = $2 AND is_used = false',
            [normalizedEmail, type]
        );

        await query(
            'INSERT INTO otps (email, otp_code, type, expires_at) VALUES ($1, $2, $3, $4)',
            [normalizedEmail, otpCode, type, expiresAt]
        );

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[RESEND OTP ${type.toUpperCase()}] Email: ${normalizedEmail} | Kode: ${otpCode}`);
        }

        const mailResult = type === 'forgot_password'
            ? await sendForgotPasswordEmail(normalizedEmail, otpCode, userCheck.rows[0].name)
            : await sendOtpEmail(normalizedEmail, otpCode, userCheck.rows[0].name);

        if (!mailResult.success) {
            res.status(502).json({
                success: false,
                message: 'Email OTP gagal dikirim. Silakan coba kembali beberapa saat lagi.',
            });
            return;
        }

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

        const userResult = await query('SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL', [normalizedEmail]);
        if (userResult.rowCount === 0) {
            res.status(400).json({ success: false, message: 'Email atau password salah.' });
            return;
        }

        const user = userResult.rows[0];

        // Jika user hanya login via Google dan belum punya password
        if (!user.password) {
            res.status(400).json({
                success: false,
                message: 'Akun ini terdaftar via Google. Silakan login menggunakan tombol Google atau gunakan fitur Lupa Password.',
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

        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

        // Simpan refresh token & metadata sesi perangkat ke database (multi-device support)
        const updatedTokens = addOrUpdateDeviceSession(user.refresh_token, newRefreshToken, req);
        await query('UPDATE users SET refresh_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [updatedTokens, user.id]);

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
            token: accessToken,
            accessToken,
            refreshToken: newRefreshToken,
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
        const idToken = req.body.idToken || req.body.id_token || req.body.credential || req.body.token;

        if (!idToken) {
            res.status(400).json({ success: false, message: 'Google idToken (atau credential) wajib dikirimkan.' });
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

        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

        // Simpan refresh token & metadata sesi perangkat ke database (multi-device support)
        const updatedTokens = addOrUpdateDeviceSession(user.refresh_token, newRefreshToken, req);
        await query('UPDATE users SET refresh_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [updatedTokens, user.id]);

        res.json({
            success: true,
            message: 'Login Google berhasil!',
            token: accessToken,
            accessToken,
            refreshToken: newRefreshToken,
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

/**
 * POST /api/auth/refresh-token
 * Meminta Access Token baru secara otomatis menggunakan Refresh Token yang sah
 * Mendukung sesi multi-perangkat (multi-device token rotation)
 */
export async function refreshToken(req: Request, res: Response): Promise<void> {
    try {
        const tokenFromReq = req.body?.refreshToken || req.body?.token || req.headers['x-refresh-token'];

        if (!tokenFromReq) {
            res.status(400).json({ success: false, message: 'Refresh token wajib disertakan.' });
            return;
        }

        // 1. Verifikasi cryptographic signature refresh token
        let decoded: any = null;
        try {
            decoded = jwt.verify(tokenFromReq, REFRESH_TOKEN_SECRET);
        } catch {
            res.status(401).json({
                success: false,
                message: 'Refresh token tidak valid atau sudah kedaluwarsa. Silakan login kembali.',
            });
            return;
        }

        // 2. Cek apakah refresh token ini cocok dengan yang aktif di database
        const userResult = await query(
            'SELECT id, name, email, role, phone_number, avatar_url, refresh_token FROM users WHERE id = $1 AND deleted_at IS NULL',
            [decoded.id]
        );

        if (userResult.rowCount === 0) {
            res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
            return;
        }

        const user = userResult.rows[0];

        // Validasi keberadaan token aktif untuk multi-device
        const activeTokens = parseRefreshTokens(user.refresh_token);
        if (!activeTokens.includes(tokenFromReq)) {
            res.status(403).json({
                success: false,
                message: 'Sesi login telah berakhir atau Anda telah logout di perangkat ini. Silakan login kembali.',
            });
            return;
        }

        // 3. Terbitkan access token baru & refresh token baru (token rotation)
        const tokens = generateTokens(user);

        // Rotasi token & perbarui waktu aktif sesi perangkat ini
        const updatedTokens = rotateDeviceSession(user.refresh_token, tokenFromReq, tokens.refreshToken, req);
        await query('UPDATE users SET refresh_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [updatedTokens, user.id]);

        res.json({
            success: true,
            message: 'Token berhasil diperbarui.',
            token: tokens.accessToken,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar_url: user.avatar_url,
                phone_number: user.phone_number,
            },
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui token.' });
    }
}

/**
 * POST /api/auth/logout
 * Menghandle proses logout user:
 * 1. Menghapus sesi refresh token dari database user (hanya sesi perangkat ini jika token disertakan)
 * 2. Mencatat audit log aktivitas logout
 * 3. Membersihkan HTTP cookies jika diset
 */
export async function logout(req: Request, res: Response): Promise<void> {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        let authUser: any = null;

        if (token) {
            try {
                authUser = jwt.verify(token, JWT_SECRET);
            } catch {
                // Abaikan jika token expired, user tetap boleh logout
            }
        }

        const incomingRefreshToken = req.body?.refreshToken || req.headers['x-refresh-token'];

        // Jika ada user ID terautentikasi
        if (authUser?.id) {
            if (incomingRefreshToken) {
                // Hapus token perangkat ini saja agar perangkat lain tidak terputus
                const uRes = await query('SELECT refresh_token FROM users WHERE id = $1', [authUser.id]);
                if (uRes.rowCount > 0) {
                    const newTokens = removeDeviceSessionByToken(uRes.rows[0].refresh_token, incomingRefreshToken);
                    await query('UPDATE users SET refresh_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newTokens, authUser.id]);
                }
            } else {
                // Logout total semua perangkat jika tidak ada refresh token spesifik yang dikirimkan
                await query('UPDATE users SET refresh_token = NULL WHERE id = $1', [authUser.id]);
            }

            recordAuditLog({
                userId: authUser.id,
                action: 'USER_LOGOUT',
                entityType: 'auth',
                entityId: authUser.id,
                description: `${authUser.name || authUser.email} (${authUser.role}) logout dari sistem`,
                details: { email: authUser.email, role: authUser.role },
                req,
            });
        } else if (incomingRefreshToken) {
            // Jika access token sudah expired tetapi user menyertakan refreshToken
            try {
                const decoded: any = jwt.verify(incomingRefreshToken, REFRESH_TOKEN_SECRET);
                if (decoded?.id) {
                    const uRes = await query('SELECT refresh_token FROM users WHERE id = $1', [decoded.id]);
                    if (uRes.rowCount > 0) {
                        const newTokens = removeDeviceSessionByToken(uRes.rows[0].refresh_token, incomingRefreshToken);
                        await query('UPDATE users SET refresh_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newTokens, decoded.id]);
                    }
                }
            } catch {
                // Abaikan jika token rusak
            }
        }

        // Hapus auth cookies jika digunakan
        res.clearCookie('token');
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');

        res.json({
            success: true,
            message: 'Logout berhasil. Sesi telah diakhiri dan token telah dinonaktifkan.',
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, message: 'Gagal memproses logout.' });
    }
}

/**
 * POST /api/auth/forgot-password
 * Mengirimkan kode OTP 6 digit untuk reset kata sandi ke email pengguna
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
    try {
        const { email } = req.body;
        if (!email) {
            res.status(400).json({ success: false, message: 'Email wajib diisi.' });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        // 1. Cek keberadaan user
        const userResult = await query('SELECT id, name, email FROM users WHERE email = $1 AND deleted_at IS NULL', [normalizedEmail]);
        if (userResult.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Email tidak ditemukan di sistem.' });
            return;
        }

        const user = userResult.rows[0];

        // 2. Nonaktifkan OTP forgot_password sebelumnya yang belum digunakan
        await query(
            'UPDATE otps SET is_used = true WHERE email = $1 AND type = $2 AND is_used = false',
            [normalizedEmail, 'forgot_password']
        );

        // 3. Generate kode OTP 6 digit baru
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

        await query(
            'INSERT INTO otps (email, otp_code, type, expires_at) VALUES ($1, $2, $3, $4)',
            [normalizedEmail, otpCode, 'forgot_password', expiresAt]
        );

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[FORGOT PASSWORD OTP] Email: ${normalizedEmail} | Kode: ${otpCode}`);
        }

        // Kirim email notifikasi OTP reset kata sandi
        const mailResult = await sendForgotPasswordEmail(normalizedEmail, otpCode, user.name);
        if (!mailResult.success) {
            res.status(502).json({
                success: false,
                message: 'Email reset kata sandi gagal dikirim. Silakan coba kembali beberapa saat lagi.',
            });
            return;
        }

        res.json({
            success: true,
            message: 'Kode OTP untuk reset kata sandi telah dikirimkan ke email Anda.',
            data: {
                email: normalizedEmail,
                debugOtp: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
            },
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'Gagal memproses permintaan reset password.' });
    }
}

/**
 * POST /api/auth/verify-reset-otp
 * Memvalidasi kode OTP sebelum user menginput password baru (opsional untuk step-by-step UI)
 */
export async function verifyResetOtp(req: Request, res: Response): Promise<void> {
    try {
        const { email } = req.body;
        const otpCode = req.body.otpCode || req.body.otp;

        if (!email || !otpCode) {
            res.status(400).json({ success: false, message: 'Email dan kode OTP wajib diisi.' });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        const otpResult = await query(
            'SELECT id FROM otps WHERE email = $1 AND otp_code = $2 AND type = $3 AND is_used = false AND expires_at > CURRENT_TIMESTAMP ORDER BY id DESC LIMIT 1',
            [normalizedEmail, otpCode, 'forgot_password']
        );

        if (otpResult.rowCount === 0) {
            res.status(400).json({
                success: false,
                message: 'Kode OTP tidak valid atau sudah kedaluwarsa.',
            });
            return;
        }

        res.json({
            success: true,
            message: 'Kode OTP valid. Silakan lanjutkan memasukkan kata sandi baru.',
        });
    } catch (error) {
        console.error('Verify reset OTP error:', error);
        res.status(500).json({ success: false, message: 'Gagal memverifikasi kode OTP.' });
    }
}

/**
 * POST /api/auth/reset-password
 * Memvalidasi OTP dan menyimpan password baru
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
    try {
        const { email, password } = req.body;
        const otpCode = req.body.otpCode || req.body.otp;

        if (!email || !otpCode || !password) {
            res.status(400).json({ success: false, message: 'Email, kode OTP, dan kata sandi baru wajib diisi.' });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({ success: false, message: 'Kata sandi minimal terdiri dari 6 karakter.' });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        // 1. Validasi OTP forgot_password yang masih aktif
        const otpResult = await query(
            'SELECT id FROM otps WHERE email = $1 AND otp_code = $2 AND type = $3 AND is_used = false AND expires_at > CURRENT_TIMESTAMP ORDER BY id DESC LIMIT 1',
            [normalizedEmail, otpCode, 'forgot_password']
        );

        if (otpResult.rowCount === 0) {
            res.status(400).json({
                success: false,
                message: 'Kode OTP tidak valid atau sudah kedaluwarsa. Silakan minta kode baru.',
            });
            return;
        }

        // 2. Hash password baru
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Update password user, reset refresh token (mematikan semua sesi lama demi keamanan), dan set is_email_verified = true
        await query(
            'UPDATE users SET password = $1, refresh_token = NULL, is_email_verified = true WHERE email = $2',
            [hashedPassword, normalizedEmail]
        );

        // 4. Tandai OTP sudah digunakan
        await query('UPDATE otps SET is_used = true WHERE id = $1', [otpResult.rows[0].id]);

        recordAuditLog({
            userId: 0,
            action: 'RESET_PASSWORD',
            entityType: 'auth',
            entityId: 0,
            description: `Kata sandi akun ${normalizedEmail} berhasil direset via OTP`,
            details: { email: normalizedEmail },
            req,
        });

        res.json({
            success: true,
            message: 'Kata sandi berhasil direset! Silakan login menggunakan kata sandi baru Anda.',
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, message: 'Gagal mereset kata sandi.' });
    }
}
