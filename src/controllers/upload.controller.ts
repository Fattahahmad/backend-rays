import type { Request, Response } from 'express';

/**
 * POST /api/upload/single
 * Mengunggah 1 file gambar ke server lokal
 */
export async function uploadSingleFile(req: Request, res: Response): Promise<void> {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, message: 'Tidak ada file gambar yang dikirimkan.' });
            return;
        }

        const folder = (req.query.folder as string) || 'general';
        const sanitizedFolder = folder.replace(/[^a-zA-Z0-9_\-]/g, '');
        const relativeUrl = `/uploads/${sanitizedFolder}/${req.file.filename}`;

        res.status(201).json({
            success: true,
            message: 'File gambar berhasil diunggah.',
            data: {
                url: relativeUrl,
                filename: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype,
            },
        });
    } catch (error: any) {
        console.error('Upload single file error:', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal mengunggah file.' });
    }
}

/**
 * POST /api/upload/multiple
 * Mengunggah hingga 5 file gambar sekaligus (berguna untuk galeri foto produk)
 */
export async function uploadMultipleFiles(req: Request, res: Response): Promise<void> {
    try {
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) {
            res.status(400).json({ success: false, message: 'Tidak ada file gambar yang dikirimkan.' });
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
            message: `${uploadedData.length} file gambar berhasil diunggah.`,
            data: uploadedData,
        });
    } catch (error: any) {
        console.error('Upload multiple files error:', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal mengunggah file.' });
    }
}
