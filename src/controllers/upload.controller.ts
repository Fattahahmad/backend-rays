import type { Request, Response } from 'express';
import { deleteFileIfExists } from '../utils/file.util.ts';

/**
 * POST /api/upload/single
 * Mengunggah 1 file gambar atau dokumen ke server lokal.
 * Jika parameter old_url disertakan, file lama tersebut otomatis dihapus dari storage.
 */
export async function uploadSingleFile(req: Request, res: Response): Promise<void> {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, message: 'Tidak ada file yang dikirimkan.' });
            return;
        }

        const folder = (req.query.folder as string) || 'general';
        const sanitizedFolder = folder.replace(/[^a-zA-Z0-9_\-]/g, '');
        const relativeUrl = `/uploads/${sanitizedFolder}/${req.file.filename}`;

        // Jika request mengirimkan old_url (misal saat mengganti file di form edit)
        const oldUrl = (req.query.old_url as string) || (req.query.oldUrl as string) || req.body?.old_url || req.body?.oldUrl;
        let oldFileDeleted = false;
        if (oldUrl) {
            oldFileDeleted = deleteFileIfExists(oldUrl);
        }

        res.status(201).json({
            success: true,
            message: oldFileDeleted ? 'File berhasil diunggah dan file lama telah digantikan.' : 'File berhasil diunggah.',
            data: {
                url: relativeUrl,
                filename: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype,
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
 * Mengunggah file baru sekaligus menghapus file lama yang digantikan dari storage
 */
export async function replaceUploadedFile(req: Request, res: Response): Promise<void> {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, message: 'Tidak ada file baru yang dikirimkan.' });
            return;
        }

        const oldUrl = (req.query.old_url as string) || (req.query.oldUrl as string) || req.body?.old_url || req.body?.oldUrl;
        let oldFileDeleted = false;
        if (oldUrl) {
            oldFileDeleted = deleteFileIfExists(oldUrl);
        }

        const folder = (req.query.folder as string) || 'general';
        const sanitizedFolder = folder.replace(/[^a-zA-Z0-9_\-]/g, '');
        const relativeUrl = `/uploads/${sanitizedFolder}/${req.file.filename}`;

        res.json({
            success: true,
            message: 'File berhasil diperbarui dan file lama telah dibersihkan dari storage.',
            data: {
                url: relativeUrl,
                filename: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype,
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
 * Mengunggah hingga 5 file gambar/dokumen sekaligus
 */
export async function uploadMultipleFiles(req: Request, res: Response): Promise<void> {
    try {
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) {
            res.status(400).json({ success: false, message: 'Tidak ada file yang dikirimkan.' });
            return;
        }

        const folder = (req.query.folder as string) || 'general';
        const sanitizedFolder = folder.replace(/[^a-zA-Z0-9_\-]/g, '');

        const uploadedData = files.map(file => ({
            url: `/uploads/${sanitizedFolder}/${file.filename}`,
            filename: file.filename,
            size: file.size,
            mimetype: file.mimetype,
        }));

        res.status(201).json({
            success: true,
            message: `${uploadedData.length} file berhasil diunggah.`,
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
