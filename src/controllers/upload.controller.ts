import type { Request, Response } from 'express';
import { deleteFileIfExists } from '../utils/file.util.ts';
import { convertAndSaveToWebp } from '../utils/image.util.ts';

/**
 * POST /api/upload/single
 * Mengunggah 1 file gambar, otomatis dikonversi dan dikompresi ke format .webp (kualitas 80%).
 * Jika parameter old_url disertakan, file lama tersebut otomatis dihapus dari storage.
 */
export async function uploadSingleFile(req: Request, res: Response): Promise<void> {
    try {
        if (!req.file || !req.file.buffer) {
            res.status(400).json({ success: false, message: 'Tidak ada file yang dikirimkan atau file kosong.' });
            return;
        }

        const folder = (req.query.folder as string) || 'general';
        const processed = await convertAndSaveToWebp(req.file.buffer, folder);

        // Jika request mengirimkan old_url (misal saat mengganti file di form edit)
        const oldUrl = (req.query.old_url as string) || (req.query.oldUrl as string) || req.body?.old_url || req.body?.oldUrl;
        let oldFileDeleted = false;
        if (oldUrl) {
            oldFileDeleted = deleteFileIfExists(oldUrl);
        }

        res.status(201).json({
            success: true,
            message: oldFileDeleted 
                ? 'File berhasil diunggah dan dikonversi ke WebP, serta file lama telah digantikan.' 
                : 'File berhasil diunggah dan dikonversi ke format WebP teroptimasi.',
            data: {
                url: processed.relativeUrl,
                filename: processed.filename,
                size: processed.size,
                mimetype: processed.mimetype,
                old_file_deleted: oldFileDeleted,
            },
        });
    } catch (error: any) {
        console.error('Upload single file error:', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal mengunggah file.' });
    }
}

/**
 * PUT or POST /api/upload/replace
 * Mengunggah file baru (dikonversi ke .webp) sekaligus menghapus file lama yang digantikan dari storage
 */
export async function replaceUploadedFile(req: Request, res: Response): Promise<void> {
    try {
        if (!req.file || !req.file.buffer) {
            res.status(400).json({ success: false, message: 'Tidak ada file baru yang dikirimkan atau file kosong.' });
            return;
        }

        const oldUrl = (req.query.old_url as string) || (req.query.oldUrl as string) || req.body?.old_url || req.body?.oldUrl;
        let oldFileDeleted = false;
        if (oldUrl) {
            oldFileDeleted = deleteFileIfExists(oldUrl);
        }

        const folder = (req.query.folder as string) || 'general';
        const processed = await convertAndSaveToWebp(req.file.buffer, folder);

        res.json({
            success: true,
            message: 'File berhasil diperbarui ke format WebP dan file lama telah dibersihkan dari storage.',
            data: {
                url: processed.relativeUrl,
                filename: processed.filename,
                size: processed.size,
                mimetype: processed.mimetype,
                old_file_deleted: oldFileDeleted,
            },
        });
    } catch (error: any) {
        console.error('Replace uploaded file error:', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal mengganti file.' });
    }
}

/**
 * POST /api/upload/multiple
 * Mengunggah hingga 5 file gambar sekaligus (seluruhnya dikonversi ke format .webp teroptimasi)
 */
export async function uploadMultipleFiles(req: Request, res: Response): Promise<void> {
    try {
        const rawFiles = req.files;
        const files: Express.Multer.File[] = Array.isArray(rawFiles)
            ? rawFiles
            : (rawFiles ? Object.values(rawFiles).flat() : []);

        if (!files || files.length === 0) {
            res.status(400).json({ success: false, message: 'Tidak ada file yang dikirimkan.' });
            return;
        }

        const validFiles = files.filter(f => Boolean(f && f.buffer));
        if (validFiles.length === 0) {
            res.status(400).json({ success: false, message: 'File yang dikirimkan tidak valid.' });
            return;
        }

        const folder = (req.query.folder as string) || 'general';

        const uploadedData = await Promise.all(
            validFiles.map(async file => {
                const processed = await convertAndSaveToWebp(file.buffer, folder);
                return {
                    url: processed.relativeUrl,
                    filename: processed.filename,
                    size: processed.size,
                    mimetype: processed.mimetype,
                };
            })
        );

        res.status(201).json({
            success: true,
            message: `${uploadedData.length} file berhasil diunggah dan dikonversi ke WebP teroptimasi.`,
            data: uploadedData,
        });
    } catch (error: any) {
        console.error('Upload multiple files error:', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal mengunggah file.' });
    }
}

/**
 * DELETE /api/upload (Authenticated / Admin)
 * Menghapus file gambar/dokumen yang telah diunggah dari storage
 */
export async function deleteUploadedFile(req: Request, res: Response): Promise<void> {
    try {
        const fileUrl = (req.query.url as string) || req.body?.url;
        if (!fileUrl) {
            res.status(400).json({ success: false, message: 'Parameter url file wajib disertakan.' });
            return;
        }

        const deleted = deleteFileIfExists(fileUrl);
        if (deleted) {
            res.json({ success: true, message: 'File berhasil dihapus dari storage.' });
        } else {
            res.status(404).json({ success: false, message: 'File tidak ditemukan di storage atau tidak dapat dihapus.' });
        }
    } catch (error: any) {
        console.error('Delete uploaded file error:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus file.' });
    }
}
