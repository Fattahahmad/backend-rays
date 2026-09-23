import multer from 'multer';
import path from 'path';
import fs from 'fs';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
        const folder = (req.query.folder as string) || 'general';
        const sanitizedFolder = folder.replace(/[^a-zA-Z0-9_\-]/g, '');
        const targetDir = path.join(process.cwd(), 'uploads', sanitizedFolder);

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        cb(null, targetDir);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueSuffix}${ext}`);
    },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Format file tidak didukung! Hanya diperbolehkan: JPG, JPEG, PNG, dan WEBP.'));
    }
};

export const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter,
});
