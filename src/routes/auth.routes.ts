import { Router } from 'express';
import {
    register,
    verifyOtp,
    resendOtp,
    login,
    googleAuth,
} from '../controllers/auth.controller.ts';

const router = Router();

router.post('/register', register);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/login', login);
router.post('/google', googleAuth);

export default router;
