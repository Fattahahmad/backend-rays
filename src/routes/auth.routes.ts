import { Router } from 'express';
import {
    register,
    verifyOtp,
    resendOtp,
    login,
    googleAuth,
    refreshToken,
    logout,
    forgotPassword,
    verifyResetOtp,
    resetPassword,
} from '../controllers/auth.controller.ts';
import { authLimiter, otpLimiter } from '../middlewares/rateLimiter.middleware.ts';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/verify-otp', otpLimiter, verifyOtp);
router.post('/resend-otp', otpLimiter, resendOtp);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleAuth);
router.post('/refresh-token', refreshToken);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.post('/forgot-password', otpLimiter, forgotPassword);
router.post('/verify-reset-otp', otpLimiter, verifyResetOtp);
router.post('/reset-password', authLimiter, resetPassword);

export default router;
