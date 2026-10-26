import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

// Load .env explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    console.log('=====================================================');
    console.log('🚀 RAYS AUTOCARE - SMTP EMAIL TRANSMISSION TEST');
    console.log('=====================================================\n');

    const host = process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io';
    const port = parseInt(process.env.SMTP_PORT || '2525', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const fromAddress = process.env.SMTP_FROM || '"Rays Autocare" <no-reply@raysautocare.com>';
    const targetEmail = 'fattah.ahmad04@gmail.com';

    console.log(`📡 SMTP Target Host : ${host}:${port}`);
    console.log(`👤 SMTP User        : ${user ? `${user.substring(0, 4)}...${user.substring(user.length - 2)}` : '(BELUM DIISI / KOSONG)'}`);
    console.log(`🔑 SMTP Pass        : ${pass ? '********' : '(BELUM DIISI / KOSONG)'}`);
    console.log(`📨 Sender Address   : ${fromAddress}`);
    console.log(`🎯 Recipient Target : ${targetEmail}\n`);

    if (!user || !pass) {
        console.error('❌ PERINGATAN: Variabel SMTP_USER atau SMTP_PASS di file .env masih kosong!');
        console.error('👉 Pastikan Anda sudah mengisi Username & Password dari Mailtrap Sandbox di file .env');
        console.error('👉 Jangan lupa tekan CTRL + S untuk menyimpan file .env sebelum menjalankan test kembali.\n');
        process.exit(1);
    }

    const isSecure = port === 465;
    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: isSecure,
        auth: {
            user,
            pass,
        },
    });

    console.log('⏳ Memverifikasi koneksi ke SMTP server...');
    try {
        await transporter.verify();
        console.log('✅ Handshake SMTP Berhasil! Server siap mengirim email.\n');
    } catch (verifyErr: any) {
        console.error('❌ Gagal melakukan handshake dengan SMTP server:');
        console.error(verifyErr.message);
        process.exit(1);
    }

    // Template HTML Super Mewah / Jaw-dropping
    const htmlEmail = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>VIP Concierge - Rays Autocare</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #080a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f0f3f6; -webkit-font-smoothing: antialiased;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #080a0f; padding: 40px 10px;">
            <tr>
                <td align="center">
                    <!-- Main Card -->
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 620px; background-color: #0e121a; border-radius: 16px; border: 1px solid #1f2735; overflow: hidden; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85);">
                        
                        <!-- Header Banner -->
                        <tr>
                            <td style="background: radial-gradient(circle at 50% 0%, #300c11 0%, #120507 70%, #0e121a 100%); padding: 48px 30px 32px; text-align: center; border-bottom: 1px solid #2a1519;">
                                <div style="display: inline-block; padding: 6px 16px; border-radius: 100px; background: rgba(230, 57, 70, 0.15); border: 1px solid #e63946; color: #ff6b77; font-size: 11px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 20px;">
                                    ★ PRIVATE FOUNDER'S CIPHER ★
                                </div>
                                <h1 style="margin: 0; font-size: 32px; font-weight: 900; letter-spacing: 5px; color: #ffffff; text-transform: uppercase; text-shadow: 0 0 25px rgba(230,57,70,0.6);">
                                    RAYS AUTOCARE
                                </h1>
                                <p style="margin: 8px 0 0; font-size: 13px; color: #a0aec0; letter-spacing: 3px; text-transform: uppercase;">
                                    The Atelier of Automotive Perfection & Detailing
                                </p>
                            </td>
                        </tr>

                        <!-- Body Content -->
                        <tr>
                            <td style="padding: 36px 36px 20px;">
                                <p style="font-size: 14px; text-transform: uppercase; letter-spacing: 2px; color: #e63946; font-weight: 700; margin: 0 0 8px;">
                                    CONFIDENTIAL TRANSMISSION
                                </p>
                                <h2 style="font-size: 24px; color: #ffffff; font-weight: 700; margin: 0 0 16px; letter-spacing: 0.5px;">
                                    Salam Kehormatan, Fattah Ahmad.
                                </h2>
                                <p style="font-size: 15px; line-height: 1.7; color: #94a3b8; margin: 0 0 24px;">
                                    Sistem transmisi email <strong style="color: #ffffff;">Rays Autocare Core Engine</strong> telah resmi terhubung secara sinkron melalui protokol SMTP berkecepatan tinggi. Anda menerima transmisi ini sebagai verifikasi bahwa kanal komunikasi digital workshop premium kami telah beroperasi penuh pada frekuensi optimal.
                                </p>

                                <!-- VIP Card Mockup -->
                                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                                    <tr>
                                        <td style="background: linear-gradient(135deg, #181d28 0%, #11151f 100%); border-radius: 14px; border: 1px solid #2d3748; padding: 24px; position: relative; box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);">
                                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                                <tr>
                                                    <td>
                                                        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 700;">PASSPORT TIER</span><br>
                                                        <span style="font-size: 18px; font-weight: 800; color: #f8fafc; letter-spacing: 1px;">TITANIUM FOUNDER CONNOISSEUR</span>
                                                    </td>
                                                    <td align="right">
                                                        <span style="font-size: 26px;">🏎️</span>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td colspan="2" style="padding-top: 20px;">
                                                        <div style="font-family: 'Courier New', monospace; font-size: 15px; color: #e63946; font-weight: 700; letter-spacing: 4px;">
                                                            RAYS-VIP-0001-OCT26
                                                        </div>
                                                        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
                                                            HOLDER: FATTAH AHMAD &bull; WORKSHOP: BINTARO HQ
                                                        </div>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>

                                <!-- Three Pillars of Excellence -->
                                <p style="font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 700; margin: 0 0 14px;">
                                    ARSITEKTUR PERAWATAN SUPERCARS & EXOTICS:
                                </p>

                                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                                    <tr>
                                        <td style="background-color: #121722; padding: 14px 18px; border-radius: 10px; border-left: 3px solid #e63946; margin-bottom: 10px;">
                                            <div style="font-size: 14px; font-weight: 700; color: #ffffff;">✨ Graphene Matrix 10H Ceramic Coating</div>
                                            <div style="font-size: 12px; color: #8899a6; margin-top: 4px; line-height: 1.5;">Perlindungan cat molekuler ekstrem anti-swirl, hydrophobic lotus-effect abadi, serta kilau kaca kristal tak tertandingi.</div>
                                        </td>
                                    </tr>
                                    <tr><td height="10"></td></tr>
                                    <tr>
                                        <td style="background-color: #121722; padding: 14px 18px; border-radius: 10px; border-left: 3px solid #e63946; margin-bottom: 10px;">
                                            <div style="font-size: 14px; font-weight: 700; color: #ffffff;">🛋️ Interior Luxury Atelier & Nano Mist Detox</div>
                                            <div style="font-size: 12px; color: #8899a6; margin-top: 4px; line-height: 1.5;">Restorasi serat Alcantara & kulit Nappa asli dengan pembersihan uap 140°C serta dekontaminasi bakteri sterilisasi kabin.</div>
                                        </td>
                                    </tr>
                                    <tr><td height="10"></td></tr>
                                    <tr>
                                        <td style="background-color: #121722; padding: 14px 18px; border-radius: 10px; border-left: 3px solid #e63946;">
                                            <div style="font-size: 14px; font-weight: 700; color: #ffffff;">⚡ Live Telemetry & Direct WhatsApp Concierge</div>
                                            <div style="font-size: 12px; color: #8899a6; margin-top: 4px; line-height: 1.5;">Integrasi real-time Web Socket & konsultasi privat langsung ke detailer bersertifikat internasional tanpa perantara.</div>
                                        </td>
                                    </tr>
                                </table>

                                <!-- CTA Action Button -->
                                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                                    <tr>
                                        <td align="center">
                                            <a href="https://raysautocare.com" target="_blank" style="display: inline-block; padding: 16px 38px; background: linear-gradient(135deg, #e63946 0%, #a0101d 100%); color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; border-radius: 8px; box-shadow: 0 8px 25px rgba(230,57,70,0.5);">
                                                KUNJUNGI ATELIER DIGITAL RAYS
                                            </a>
                                        </td>
                                    </tr>
                                </table>

                                <!-- Diagnostic Telemetry Info -->
                                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #090c12; border-radius: 8px; border: 1px solid #1c2331; padding: 14px 18px; margin-bottom: 10px;">
                                    <tr>
                                        <td style="font-family: 'Courier New', monospace; font-size: 11px; color: #526071; line-height: 1.6;">
                                            [TELEMETRY REPORT]<br>
                                            STATUS     : 200 OK (VERIFIED HIGH-PRIORITY DISPATCH)<br>
                                            PROTOCOL   : SMTP TLS 1.3 / NODEMAILER<br>
                                            ENVIRONMENT: ${process.env.NODE_ENV || 'development'}<br>
                                            HOST_NODE  : ${host} (PORT ${port})
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #07090e; padding: 24px 30px; text-align: center; border-top: 1px solid #1a202c; font-size: 12px; color: #4a5568; line-height: 1.6;">
                                <strong>RAYS AUTOCARE WORKSHOP & DETAILING ATELIER</strong><br>
                                Jl. Boulevard Sektor 7 No. 18, Bintaro, Tangerang Selatan, Banten.<br>
                                &copy; 2026 Rays Autocare Indonesia. All Rights Reserved.
                            </td>
                        </tr>

                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;

    console.log('🚀 Mengirimkan Executive VIP Dossier ke ' + targetEmail + '...');

    const sendResult = await transporter.sendMail({
        from: fromAddress,
        to: targetEmail,
        subject: '👑 [RAYS AUTOCARE] Executive VIP Access & Detailing Atelier Dossier',
        text: `Salam Kehormatan Fattah Ahmad,\n\nTransmisi verifikasi SMTP Rays Autocare telah berhasil terhubung ke server.\nVIP ID: RAYS-VIP-0001-OCT26\nStatus: 200 OK.\n\nRays Autocare Detailing Atelier.`,
        html: htmlEmail,
    });

    console.log('\n=====================================================');
    console.log('🎉 TRANSMISI EMAIL BERHASIL DIKIRIMKAN!');
    console.log('=====================================================');
    console.log(`✉️ Message ID   : ${sendResult.messageId}`);
    console.log(`📥 Target Email : ${targetEmail}`);
    console.log('🌐 Buka Dashboard Mailtrap Anda di browser:');
    console.log('   Menu "Sandboxes" -> "My Inbox"');
    console.log('   Email VIP Dossier dengan visual mewah sudah mendarat di sana!');
    console.log('=====================================================\n');
}

main().catch((err) => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
