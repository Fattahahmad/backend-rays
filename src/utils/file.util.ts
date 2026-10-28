import fs from 'fs';
import path from 'path';

/**
 * Menghapus file fisik dari folder storage lokal (uploads/...)
 * Dilengkapi proteksi Path Traversal dan tidak akan menghapus asset default di luar uploads/
 *
 * @param fileUrl Path relatif atau URL file (misal: '/uploads/banners/banner-123.jpg')
 * @returns boolean true jika file berhasil dihapus, false jika dilewati/gagal
 */
export function deleteFileIfExists(fileUrl: string | null | undefined): boolean {
    if (!fileUrl || typeof fileUrl !== 'string') {
        return false;
    }

    try {
        let cleanPath = fileUrl.trim();

        // Ambil path jika dikirimkan full URL (misal: http://localhost:3001/uploads/...)
        if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
            try {
                const parsed = new URL(cleanPath);
                cleanPath = parsed.pathname;
            } catch {
                return false;
            }
        }

        // HANYA hapus file yang berada di folder /uploads/
        // Asset bawaan seperti /images/... tidak boleh dihapus
        if (!cleanPath.startsWith('/uploads/')) {
            return false;
        }

        // Bersihkan leading slash untuk resolve path
        const relativeFilePath = cleanPath.replace(/^\/+/, '');
        const uploadsRoot = path.resolve(process.cwd(), 'uploads');
        const absoluteTarget = path.resolve(process.cwd(), relativeFilePath);

        // Proteksi Keamanan: Cegah Path Traversal (harus berada di dalam root folder uploads)
        if (!absoluteTarget.startsWith(uploadsRoot)) {
            console.warn(`[Security Alert] Percobaan path traversal dicegah: ${fileUrl}`);
            return false;
        }

        // Cek dan hapus file jika ada
        if (fs.existsSync(absoluteTarget)) {
            const stat = fs.statSync(absoluteTarget);
            if (stat.isFile()) {
                fs.unlinkSync(absoluteTarget);
                console.log(`[Storage Cleanup] File lama berhasil dihapus: ${cleanPath}`);
                return true;
            }
        }
    } catch (err) {
        console.error(`[Storage Cleanup Error] Gagal menghapus file ${fileUrl}:`, err);
    }

    return false;
}
