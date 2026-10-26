import { query } from '../src/config/db.ts';

async function testFullAuthFlow() {
    console.log('🧪 Memulai pengujian end-to-end: Register -> OTP -> Verify');

    const email = 'customer.vip@raysautocare.com';
    const name = 'VIP Customer';
    const password = 'Password123!';
    const phone_number = '081234567890';

    // Reset jika ada
    await query('DELETE FROM otps WHERE email = $1', [email]);
    await query('DELETE FROM users WHERE email = $1', [email]);

    // 1. Register dengan nomor handphone
    const regRes = await fetch('http://localhost:3001/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, phone_number }),
    });
    const regData = await regRes.json();
    console.log('1. Register Result:', regData.message);

    // Ambil OTP dari DB
    const otpRow = await query('SELECT otp_code FROM otps WHERE email = $1 ORDER BY id DESC LIMIT 1', [email]);
    const otpCode = otpRow.rows[0].otp_code;
    console.log(`2. Kode OTP Dihasilkan: ${otpCode}`);

    // 3. Verify OTP
    const verifyRes = await fetch('http://localhost:3001/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otpCode }),
    });
    const verifyData = await verifyRes.json();
    console.log('3. Verify OTP Response JSON:');
    console.dir(verifyData, { depth: null });

    process.exit(0);
}

testFullAuthFlow().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
