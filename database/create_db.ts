import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Client } = pg;

async function ensureDatabaseExists(): Promise<void> {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl || !rawUrl.startsWith('postgres')) {
        // Jika bukan postgres (misal mysql), lewati
        return;
    }

    try {
        const url = new URL(rawUrl);
        const dbName = url.pathname.replace(/^\//, '');

        if (!dbName) {
            return;
        }

        // Konek ke database default 'postgres' untuk mengecek & membuat database target
        const adminUrl = new URL(rawUrl);
        adminUrl.pathname = '/postgres';

        const client = new Client({ connectionString: adminUrl.toString() });

        await client.connect();
        const check = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);

        if (check.rowCount === 0) {
            console.log(`Database "${dbName}" belum ada. Membuat database "${dbName}" otomatis...`);
            await client.query(`CREATE DATABASE "${dbName}"`);
            console.log(`[OK] Database "${dbName}" berhasil dibuat!`);
        } else {
            console.log(`[OK] Database "${dbName}" siap.`);
        }

        await client.end();
    } catch (err: any) {
        console.warn(`[WARN] Gagal membuat database otomatis: ${err.message}. Melanjutkan ke migrasi...`);
    }
}

ensureDatabaseExists();
