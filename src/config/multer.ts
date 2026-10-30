import multer from 'multer';

export const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/heic',
    'image/heif',
    'image/avif',
];

export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB (Diperketat untuk efisiensi penyimpanan & bandwidth)

// Menggunakan memoryStorage agar file buffer dapat langsung diproses & dikonversi ke WebP oleh sharp
const storage = multer.memoryStorage();

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
        cb(null, true);
    } else {
        cb(new Error('Format file tidak didukung! Hanya diperbolehkan format gambar asli: JPG, JPEG, PNG, WEBP, GIF, BMP, TIFF, HEIC, AVIF.'));
    }
};

export const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter,
});
