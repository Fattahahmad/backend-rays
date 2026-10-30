/**
 * Utility untuk membersihkan data sensitif (password, token, OTP)
 * sebelum disimpan ke database audit logs atau output logger
 */
const SENSITIVE_KEYS = new Set([
    'password',
    'old_password',
    'oldpassword',
    'new_password',
    'newpassword',
    'confirm_password',
    'confirmpassword',
    'token',
    'accesstoken',
    'refreshtoken',
    'otp',
    'otpcode',
    'idtoken',
    'credential',
    'secret',
]);

export function sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
    }

    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase())) {
            clean[key] = '[REDACTED]';
        } else if (value && typeof value === 'object') {
            clean[key] = sanitizeObject(value);
        } else {
            clean[key] = value;
        }
    }
    return clean;
}
