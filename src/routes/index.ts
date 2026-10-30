import { Router } from 'express';
import authRoutes from './auth.routes.ts';
import userRoutes from './user.routes.ts';
import faqRoutes from './faq.routes.ts';
import testimonialRoutes from './testimonial.routes.ts';
import blogRoutes from './blog.routes.ts';
import categoryRoutes from './category.routes.ts';
import productRoutes from './product.routes.ts';
import couponRoutes from './coupon.routes.ts';
import auditRoutes from './audit.routes.ts';
import uploadRoutes from './upload.routes.ts';
import orderRoutes from './order.routes.ts';
import analyticsRoutes from './analytics.routes.ts';
import chatRoutes from './chat.routes.ts';
import settingRoutes from './setting.routes.ts';
import bannerRoutes from './banner.routes.ts';

const apiRouter = Router();

// Master API Routes Registration
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/faqs', faqRoutes);
apiRouter.use('/testimonials', testimonialRoutes);
apiRouter.use('/blogs', blogRoutes);
apiRouter.use('/articles', blogRoutes); // Alias rute ramah frontend (/api/articles/admin/images, dll)
apiRouter.use('/categories', categoryRoutes);
apiRouter.use('/products', productRoutes);
apiRouter.use('/coupons', couponRoutes);
apiRouter.use('/audit-logs', auditRoutes);
apiRouter.use('/upload', uploadRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/analytics', analyticsRoutes);
apiRouter.use('/chat', chatRoutes);
apiRouter.use('/settings', settingRoutes);
apiRouter.use('/banners', bannerRoutes);

export default apiRouter;
