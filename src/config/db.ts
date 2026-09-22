import dotenv from 'dotenv';
import pg from 'pg';
import mysql from 'mysql2/promise';

dotenv.config();

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/rays_autocare';
const isMysql = databaseUrl.startsWith('mysql://') || process.env.DATABASE_DIALECT === 'mysql';

// PostgreSQL Pool
let pgPool: pg.Pool | null = null;
if (!isMysql) {
    pgPool = new Pool({
        connectionString: databaseUrl,
    });

    pgPool.on('error', (err) => {
        console.error('Unexpected error on idle PostgreSQL client', err);
    });
}

// MySQL Pool
let mysqlPool: mysql.Pool | null = null;
if (isMysql) {
    mysqlPool = mysql.createPool(databaseUrl);
}

export interface QueryResult<T = any> {
    rows: T[];
    rowCount: number;
}

/**
 * Dual-database query adapter.
 * Gunakan placeholder PostgreSQL standard ($1, $2, $3).
 * Jika runtime berjalan di MySQL (Hostinger), placeholder otomatis dikonversi ke '?'.
 */
export async function query<T extends pg.QueryResultRow = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    if (isMysql && mysqlPool) {
        // Konversi $1, $2, dst ke ? untuk MySQL
        const mysqlSql = sql.replace(/\$\d+/g, '?');
        const [results] = await mysqlPool.execute(mysqlSql, params);

        if (Array.isArray(results)) {
            return {
                rows: results as T[],
                rowCount: results.length,
            };
        }

        // Untuk operasi INSERT / UPDATE / DELETE di MySQL
        const header = results as mysql.ResultSetHeader;
        return {
            rows: [] as T[],
            rowCount: header.affectedRows,
        };
    }

    if (pgPool) {
        const result = await pgPool.query<T>(sql, params);
        return {
            rows: result.rows,
            rowCount: result.rowCount ?? 0,
        };
    }

    throw new Error('Database pool belum diinisialisasi.');
}

export default {
    query,
};
