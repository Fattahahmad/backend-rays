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
        // 1. Konversi operator ILIKE ke LIKE untuk MySQL (karena MySQL utf8mb4 case-insensitive secara default)
        let mysqlSql = sql.replace(/\bILIKE\b/gi, 'LIKE');

        // 2. Deteksi dan hilangkan klausa RETURNING yang tidak didukung MySQL
        const hasReturning = /\s+RETURNING\s+.*$/i.test(mysqlSql);
        if (hasReturning) {
            mysqlSql = mysqlSql.replace(/\s+RETURNING\s+.*$/i, '');
        }

        // 3. Konversi placeholder $1, $2, dst ke ? untuk MySQL
        mysqlSql = mysqlSql.replace(/\$\d+/g, '?');
        const [results] = await mysqlPool.execute(mysqlSql, params);

        if (Array.isArray(results)) {
            return {
                rows: results as T[],
                rowCount: results.length,
            };
        }

        // Untuk operasi INSERT / UPDATE / DELETE di MySQL
        const header = results as mysql.ResultSetHeader;

        // Jika query aslinya meminta RETURNING * pada INSERT, ambil record barunya via insertId
        if (hasReturning && header.insertId) {
            const tableMatch = mysqlSql.match(/INSERT\s+INTO\s+([`\w]+)/i);
            if (tableMatch) {
                const tableName = tableMatch[1].replace(/`/g, '');
                const [fetchRows] = await mysqlPool.execute(`SELECT * FROM ${tableName} WHERE id = ?`, [header.insertId]);
                return {
                    rows: (fetchRows as any[]) as T[],
                    rowCount: (fetchRows as any[]).length,
                };
            }
        }

        return {
            rows: [] as T[],
            rowCount: header.affectedRows,
        };
    }

    if (pgPool) {
        // Backticks are used for MySQL reserved identifiers (for example `key`).
        // Convert them to PostgreSQL identifier quotes when using PostgreSQL.
        const pgSql = sql.replace(/`([^`]+)`/g, '"$1"');
        const result = await pgPool.query<T>(pgSql, params);
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
