import { query } from '../src/config/db.ts';

async function checkAndTestAdmin() {
    const res = await query('SELECT id, name, email, role, is_email_verified FROM users ORDER BY id ASC');
    console.log('=== DAFTAR USER RESMI DI DATABASE ===');
    console.table(res.rows);

    console.log('\n🧪 Menguji Login Admin...');
    const testAdmin = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@raysautocare.com', password: 'Admin123!' }),
    });
    const adminData = await testAdmin.json();
    console.log('Status Login Admin:', testAdmin.status, adminData.message, 'Role:', adminData.user?.role, 'AccessToken:', !!adminData.accessToken);

    console.log('\n🧪 Menguji Login Super Admin...');
    const testSuper = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'superadmin@raysautocare.com', password: 'SuperAdmin123!' }),
    });
    const superData = await testSuper.json();
    console.log('Status Login Super Admin:', testSuper.status, superData.message, 'Role:', superData.user?.role, 'AccessToken:', !!superData.accessToken);

    process.exit(0);
}

checkAndTestAdmin().catch((err) => {
    console.error(err);
    process.exit(1);
});
