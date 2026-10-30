import fs from 'fs';
import path from 'path';

const migrationsDir = path.resolve('database/migrations');
const outputFile = path.resolve('database/hostinger_mysql.sql');

export function convertPostgresToMysql(): void {
    if (!fs.existsSync(migrationsDir)) {
        console.error(`Folder ${migrationsDir} tidak ditemukan!`);
        return;
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    const enumsMap: Record<string, string> = {};
    const upSqlStatements: string[] = [];

    // Phase 1: Ekstrak enums dari create-enums atau file lainnya
    for (const file of files) {
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        const upPart = content.split(/--\s*Down Migration/i)[0].replace(/--\s*Up Migration/i, '');

        // Cari pola: CREATE TYPE enum_name AS ENUM ('val1', 'val2', ...);
        const enumMatches = upPart.matchAll(/CREATE\s+TYPE\s+(\w+)\s+AS\s+ENUM\s*\(([^)]+)\);/gi);
        for (const match of enumMatches) {
            const enumName = match[1];
            const enumValues = match[2];
            enumsMap[enumName] = `ENUM(${enumValues.trim()})`;
        }
    }

    // Phase 2: Convert UP migrations ke MySQL
    for (const file of files) {
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        const upPart = content.split(/--\s*Down Migration/i)[0].replace(/--\s*Up Migration/i, '').trim();

        // Lewati jika isinya hanya CREATE TYPE (karena di MySQL enum dideklarasikan inline pada kolom)
        const strippedEnums = upPart.replace(/CREATE\s+TYPE\s+\w+\s+AS\s+ENUM\s*\([^)]+\);/gi, '').trim();
        if (!strippedEnums) {
            continue;
        }

        let mysqlSql = strippedEnums;

        // 1. Ganti tipe enum kustom ke ENUM(...) inline
        for (const [enumName, enumDef] of Object.entries(enumsMap)) {
            // Cocokkan kolom dengan tipe enum tersebut: misal "role user_role" -> "role ENUM(...)"
            const regex = new RegExp(`(\\b\\w+\\s+)${enumName}\\b`, 'gi');
            mysqlSql = mysqlSql.replace(regex, `$1${enumDef}`);
        }

        // 2. Ganti SERIAL PRIMARY KEY -> INT AUTO_INCREMENT PRIMARY KEY
        mysqlSql = mysqlSql.replace(/SERIAL\s+PRIMARY\s+KEY/gi, 'INT AUTO_INCREMENT PRIMARY KEY');

        // 3. Ganti TIMESTAMP WITH TIME ZONE -> TIMESTAMP
        mysqlSql = mysqlSql.replace(/TIMESTAMP\s+WITH\s+TIME\s+ZONE/gi, 'TIMESTAMP');

        // 4. Update updated_at agar auto update di MySQL jika ada
        mysqlSql = mysqlSql.replace(/updated_at\s+TIMESTAMP\s+DEFAULT\s+CURRENT_TIMESTAMP/gi, 'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

        // 5. Ganti JSONB -> JSON
        mysqlSql = mysqlSql.replace(/\bJSONB\b/gi, 'JSON');

        // 6. Ganti INTEGER -> INT
        mysqlSql = mysqlSql.replace(/\bINTEGER\b/gi, 'INT');

        // 7. Ganti sintaks ALTER COLUMN ... TYPE ... -> MODIFY COLUMN ... (Sintaks MySQL)
        mysqlSql = mysqlSql.replace(/ALTER\s+COLUMN\s+(\w+)\s+TYPE\s+(\w+)/gi, 'MODIFY COLUMN $1 $2');

        // 8. Hapus casting PostgreSQL seperti ::JSON, ::jsonb, ::text
        mysqlSql = mysqlSql.replace(/::\w+/g, '');

        // 9. Format default JSON array untuk MySQL 8 / MariaDB: DEFAULT ('[]')
        mysqlSql = mysqlSql.replace(/DEFAULT\s+'\[\]'/gi, "DEFAULT ('[]')");

        // 10. Normalisasi CREATE INDEX (Hapus IF NOT EXISTS untuk kompatibilitas MySQL)
        mysqlSql = mysqlSql.replace(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/gi, 'CREATE INDEX');

        // 11. Tambahkan IF NOT EXISTS dan ENGINE=InnoDB khusus pada CREATE TABLE
        mysqlSql = mysqlSql.replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\)\s*;/gi, (_match, tableName, tableBody) => {
            return `CREATE TABLE IF NOT EXISTS ${tableName} (${tableBody}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
        });

        upSqlStatements.push(`-- Source: ${file}\n` + mysqlSql);
    }

    const finalOutput = [
        '-- ========================================================================',
        '-- AUTO-GENERATED FOR HOSTINGER MYSQL / MARIADB',
        `-- Generated at: ${new Date().toISOString()}`,
        '-- ========================================================================',
        '',
        'SET FOREIGN_KEY_CHECKS = 0;',
        '',
        upSqlStatements.join('\n\n'),
        '',
        'SET FOREIGN_KEY_CHECKS = 1;',
        ''
    ].join('\n');

    fs.writeFileSync(outputFile, finalOutput, 'utf-8');
    console.log(`[OK] Sukses mengekspor ${files.length} migrasi ke MySQL: ${outputFile}`);
}

convertPostgresToMysql();
