import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

export async function applyHostingerSchema(): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl?.startsWith('mysql://')) {
        throw new Error('DATABASE_URL MySQL wajib diisi sebelum schema dan seed dijalankan.');
    }

    const parsedUrl = new URL(databaseUrl);
    const databaseName = parsedUrl.pathname.replace(/^\//, '');

    if (!databaseName) {
        throw new Error('Nama database tidak ditemukan di DATABASE_URL.');
    }

    const schemaSql = await readFile(
        new URL('./hostinger_mysql.sql', import.meta.url),
        'utf8'
    );

    const connection = await mysql.createConnection({
        host: parsedUrl.hostname,
        port: parsedUrl.port ? Number(parsedUrl.port) : 3306,
        user: decodeURIComponent(parsedUrl.username),
        password: decodeURIComponent(parsedUrl.password),
        database: databaseName,
        multipleStatements: true,
    });

    try {
        console.log('[schema] Menerapkan hostinger_mysql.sql...');
        await connection.query(schemaSql);
        console.log('[schema] Schema MariaDB siap.');
    } finally {
        await connection.end();
    }
}

