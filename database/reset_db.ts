import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Client } = pg;

async function resetDatabase(): Promise<void> {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl || !rawUrl.startsWith('postgres')) {
        console.log('Bukan database PostgreSQL, lewati reset.');
        return;
    }

    const client = new Client({ connectionString: rawUrl });

    try {
        await client.connect();
        console.log('Membersihkan seluruh schema public di PostgreSQL...');
        await client.query('DROP SCHEMA public CASCADE;');
        await client.query('CREATE SCHEMA public;');
        console.log('[OK] Database berhasil dibersihkan!');
    } catch (err: any) {
        console.error('[ERROR] Gagal mereset database:', err.message);
    } finally {
        await client.end();
    }
}

resetDatabase();
