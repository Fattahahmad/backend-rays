import nodemailer from 'nodemailer';

/**
 * Interface hasil pengiriman email
 */
export interface SendEmailResult {
    success: boolean;
    simulated?: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Membuat transporter Nodemailer berdasarkan environment variables SMTP
 * Kompatibel 100% untuk Mailtrap (Dev) dan Hostinger (Production)
 */
function createTransporter() {
    const isProduction = process.env.NODE_ENV === 'production';
    const host = (process.env.SMTP_HOST || (isProduction ? 'smtp.hostinger.com' : 'sandbox.smtp.mailtrap.io')).trim();
    const port = Number(process.env.SMTP_PORT || (isProduction ? 465 : 2525));
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;

    // Jika kredensial belum diisi, kembalikan null (akan otomatis menggunakan simulator)
    if (!user || !pass) {
        return null;
    }

    if (!Number.isInteger(port) || port <= 0) {
        throw new Error('SMTP_PORT tidak valid. Gunakan 465 untuk SSL atau 587 untuk STARTTLS.');
    }

    const isSecure = port === 465;

    return nodemailer.createTransport({
        host,
        port,
        secure: isSecure,
        requireTLS: !isSecure,
        auth: {
            user,
            pass,
        },
        tls: {
            minVersion: 'TLSv1.2',
            servername: host,
        },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
        logger: process.env.SMTP_DEBUG === 'true',
        debug: process.env.SMTP_DEBUG === 'true',
    });
}

function getSenderAddress() {
    const address = process.env.SMTP_USER?.trim();
    const configuredFrom = process.env.SMTP_FROM?.trim();
    const normalizedFrom = configuredFrom?.replace(/^(["'])(.*)\1$/, '$2');

    if (!address) {
        return undefined;
    }

    // SMTP_FROM may include a display name, for example:
    // "Rays Autocare <support@raysautocare.id>".
    // Keep SMTP_USER as the safe fallback so the sender remains authenticated.
    return normalizedFrom || {
        name: 'Rays Autocare',
        address,
    };
}

function logMailError(context: string, err: any): void {
    console.error(`[Mail Service Error] ${context}:`, {
        message: err?.message,
        code: err?.code,
        command: err?.command,
        responseCode: err?.responseCode,
        response: err?.response,
    });
}

/**
 * Mengirimkan Email Kode OTP Verifikasi Pendaftaran
 */
export async function sendOtpEmail(toEmail: string, otpCode: string, userName?: string): Promise<SendEmailResult> {
    const transporter = createTransporter();
    const fromAddress = getSenderAddress();
    const name = userName || 'Pelanggan Setia';

    // JIKA KREDENSIAL SMTP BELUM DIISI:
    // Jalankan mode simulasi (cetak di console), tidak akan error atau crash
    if (!transporter) {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Mail Simulator] Email OTP untuk ${toEmail}: ${otpCode} (SMTP_USER/PASS belum diatur di .env)`);
        }
        return process.env.NODE_ENV === 'production'
            ? { success: false, simulated: false, error: 'SMTP_USER atau SMTP_PASS belum diatur.' }
            : { success: true, simulated: true };
    }

    // Template Email HTML Premium Rays Autocare
    const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Kode Verifikasi Rays Autocare</title>
        <style>
            body { margin: 0; padding: 0; background-color: #0e1117; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff; }
            .container { max-width: 580px; margin: 40px auto; background-color: #161b22; border-radius: 12px; border: 1px solid #30363d; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            .header { background: linear-gradient(135deg, #e63946 0%, #9b111e 100%); padding: 32px 24px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; color: #ffffff; font-weight: 800; }
            .header p { margin: 6px 0 0; font-size: 13px; color: rgba(255,255,255,0.85); letter-spacing: 1px; }
            .content { padding: 36px 32px; text-align: center; }
            .greeting { font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 12px; }
            .message { font-size: 14px; line-height: 1.6; color: #8b949e; margin-bottom: 28px; }
            .otp-box { background-color: #0d1117; border: 2px dashed #e63946; border-radius: 10px; padding: 20px; margin: 0 auto 28px; max-width: 280px; letter-spacing: 8px; font-size: 32px; font-weight: 800; color: #ff4d5a; text-shadow: 0 0 10px rgba(230,57,70,0.3); }
            .warning { font-size: 12px; color: #f0883e; background-color: rgba(240,136,62,0.1); border-radius: 6px; padding: 10px 16px; display: inline-block; margin-bottom: 24px; }
            .footer { background-color: #0d1117; padding: 20px 24px; text-align: center; border-top: 1px solid #30363d; font-size: 12px; color: #6e7681; }
            .footer a { color: #e63946; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>RAYS AUTOCARE</h1>
                <p>PREMIUM AUTO DETAILING & MARKETPLACE</p>
            </div>
            <div class="content">
                <div class="greeting">Halo, ${name}!</div>
                <div class="message">
                    Terima kasih telah bergabung dengan <strong>Rays Autocare</strong>. Gunakan kode OTP 6-digit di bawah ini untuk memverifikasi alamat email Anda dan menyelesaikan pendaftaran akun:
                </div>
                <div class="otp-box">${otpCode}</div>
                <div class="warning">
                    ⚠️ Kode verifikasi ini berlaku selama <strong>5 menit</strong>. Jangan berikan kode ini kepada siapa pun, termasuk staf Rays Autocare.
                </div>
                <div style="font-size: 12px; color: #8b949e;">
                    Jika Anda tidak merasa melakukan pendaftaran di Rays Autocare, Anda dapat mengabaikan email ini.
                </div>
            </div>
            <div class="footer">
                &copy; 2026 Rays Autocare. Jl. Boulevard Sektor 7 No. 18, Bintaro, Tangerang Selatan.<br>
                Official Workshop & Auto Detailing Care.
            </div>
        </div>
    </body>
    </html>
    `;

    try {
        const info = await transporter.sendMail({
            from: fromAddress,
            to: toEmail,
            subject: `[Rays Autocare] Kode OTP Verifikasi Anda: ${otpCode}`,
            text: `Halo ${name}, kode OTP verifikasi akun Rays Autocare Anda adalah: ${otpCode}. Kode berlaku selama 5 menit.`,
            html: htmlTemplate,
        });

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Mail Service] Email OTP berhasil dikirim ke ${toEmail} (Message ID: ${info.messageId})`);
        }

        return {
            success: true,
            simulated: false,
            messageId: info.messageId,
        };
    } catch (err: any) {
        logMailError('Gagal mengirim email OTP', err);
        return {
            success: false,
            error: err.message,
        };
    }
}

/**
 * Mengirimkan Email Kode OTP Reset Password
 */
export async function sendForgotPasswordEmail(toEmail: string, otpCode: string, userName?: string): Promise<SendEmailResult> {
    const transporter = createTransporter();
    const fromAddress = getSenderAddress();
    const name = userName || 'Pelanggan Setia';

    if (!transporter) {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Mail Simulator] Email Reset Password untuk ${toEmail}: ${otpCode} (SMTP_USER/PASS belum diatur di .env)`);
        }
        return process.env.NODE_ENV === 'production'
            ? { success: false, simulated: false, error: 'SMTP_USER atau SMTP_PASS belum diatur.' }
            : { success: true, simulated: true };
    }

    const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Password - Rays Autocare</title>
        <style>
            body { margin: 0; padding: 0; background-color: #0e1117; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff; }
            .container { max-width: 580px; margin: 40px auto; background-color: #161b22; border-radius: 12px; border: 1px solid #30363d; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            .header { background: linear-gradient(135deg, #e63946 0%, #9b111e 100%); padding: 32px 24px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; color: #ffffff; font-weight: 800; }
            .header p { margin: 6px 0 0; font-size: 13px; color: rgba(255,255,255,0.85); letter-spacing: 1px; }
            .content { padding: 36px 32px; text-align: center; }
            .greeting { font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 12px; }
            .message { font-size: 14px; line-height: 1.6; color: #8b949e; margin-bottom: 28px; }
            .otp-box { background-color: #0d1117; border: 2px dashed #e63946; border-radius: 10px; padding: 20px; margin: 0 auto 28px; max-width: 280px; letter-spacing: 8px; font-size: 32px; font-weight: 800; color: #ff4d5a; text-shadow: 0 0 10px rgba(230,57,70,0.3); }
            .warning { font-size: 12px; color: #f0883e; background-color: rgba(240,136,62,0.1); border-radius: 6px; padding: 10px 16px; display: inline-block; margin-bottom: 24px; }
            .footer { background-color: #0d1117; padding: 20px 24px; text-align: center; border-top: 1px solid #30363d; font-size: 12px; color: #6e7681; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>RAYS AUTOCARE</h1>
                <p>RESET KATA SANDI AKUN</p>
            </div>
            <div class="content">
                <div class="greeting">Halo, ${name}!</div>
                <div class="message">
                    Kami menerima permintaan untuk mereset kata sandi akun Rays Autocare Anda. Gunakan kode OTP 6-digit di bawah ini untuk mengonfirmasi reset kata sandi:
                </div>
                <div class="otp-box">${otpCode}</div>
                <div class="warning">
                    ⚠️ Kode verifikasi ini berlaku selama <strong>5 menit</strong>. Jangan bagikan kode ini kepada siapa pun!
                </div>
                <div style="font-size: 12px; color: #8b949e;">
                    Jika Anda tidak meminta perubahan kata sandi ini, abaikan email ini. Akun Anda tetap aman.
                </div>
            </div>
            <div class="footer">
                &copy; 2026 Rays Autocare. Jl. Boulevard Sektor 7 No. 18, Bintaro, Tangerang Selatan.<br>
                Official Workshop & Auto Detailing Care.
            </div>
        </div>
    </body>
    </html>
    `;

    try {
        const info = await transporter.sendMail({
            from: fromAddress,
            to: toEmail,
            subject: `[Rays Autocare] Kode OTP Reset Kata Sandi: ${otpCode}`,
            text: `Halo ${name}, kode OTP reset kata sandi akun Rays Autocare Anda adalah: ${otpCode}. Kode berlaku selama 5 menit.`,
            html: htmlTemplate,
        });

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Mail Service] Email Reset Password berhasil dikirim ke ${toEmail} (Message ID: ${info.messageId})`);
        }

        return {
            success: true,
            simulated: false,
            messageId: info.messageId,
        };
    } catch (err: any) {
        logMailError('Gagal mengirim email reset password', err);
        return {
            success: false,
            error: err.message,
        };
    }
}
