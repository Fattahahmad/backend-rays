import { Router } from 'express';
import {
    register,
    verifyOtp,
    resendOtp,
    login,
    googleAuth,
    refreshToken,
    logout,
} from '../controllers/auth.controller.ts';

const router = Router();

router.post('/register', register);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/refresh-token', refreshToken);
router.post('/refresh', refreshToken);
router.post('/logout', logout);

export default router;
