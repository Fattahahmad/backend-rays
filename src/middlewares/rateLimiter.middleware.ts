import rateLimit from 'express-rate-limit';

/**
 * Global API Rate Limiter
 * Membatasi seluruh request API publik maksimal 300 request per 15 menit per IP
 */
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: {
        success: false,
        message: 'Terlalu banyak permintaan ke server. Silakan tunggu beberapa saat.',
    },
});

/**
 * Strict Auth Rate Limiter
 * Melindungi endpoint login, register, dan reset password dari brute-force attack
 * Maksimal 15 request per 15 menit per IP
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: {
        success: false,
        message: 'Terlalu banyak percobaan login/registrasi. Demi keamanan, silakan coba kembali setelah 15 menit.',
    },
});

/**
 * OTP Request & Verification Limiter
 * Melindungi resend-otp, verify-otp, dan forgot-password dari spam email dan tebak kode OTP
 * Maksimal 6 request per 10 menit per IP
 */
export const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 menit
    max: 6,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: {
        success: false,
        message: 'Batas pengiriman/verifikasi OTP terlampaui. Silakan tunggu 10 menit sebelum mencoba lagi.',
    },
});
