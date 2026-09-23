import { Router } from 'express';
import { uploadSingleFile, uploadMultipleFiles } from '../controllers/upload.controller.ts';
import { upload } from '../config/multer.ts';
import { authenticateToken } from '../middlewares/auth.middleware.ts';

const router = Router();

// Middleware helper untuk fleksibilitas field 'file' atau 'image'
const handleSingleUpload = (req: any, res: any, next: any) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            // Coba field alternative 'image'
            upload.single('image')(req, res, (err2) => {
                if (err2) return res.status(400).json({ success: false, message: err2.message });
                next();
            });
            return;
        }
        next();
    });
};

// Middleware helper untuk multi upload 'files' atau 'images'
const handleMultipleUpload = (req: any, res: any, next: any) => {
    upload.array('images', 5)(req, res, (err) => {
        if (err) {
            upload.array('files', 5)(req, res, (err2) => {
                if (err2) return res.status(400).json({ success: false, message: err2.message });
                next();
            });
            return;
        }
        next();
    });
};

router.post('/single', authenticateToken, handleSingleUpload, uploadSingleFile);
router.post('/multiple', authenticateToken, handleMultipleUpload, uploadMultipleFiles);

export default router;
