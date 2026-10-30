import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import apiRouter from './routes/index.ts';
import { auditLogMiddleware } from './middlewares/audit.middleware.ts';
import { apiLimiter } from './middlewares/rateLimiter.middleware.ts';
import { initSocketServer } from './services/socket.service.ts';

const app = express();
// Hostinger injects PORT at runtime. Port 3000 is the supported local fallback.
const PORT = Number(process.env.PORT) || 3000;

// Mengaktifkan trust proxy untuk reverse proxy (Nginx, Hostinger, Cloudflare, Load Balancer)
app.set('trust proxy', 1);

// Global Security Headers (Mengizinkan pemuatan aset gambar statis lintas domain)
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS Configuration
const productionOrigins = [
    'https://raysautocare.id',
    'https://www.raysautocare.id',
    'https://admin.raysautocare.id',
];

const environmentOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

const allowedOrigins = new Set([
    ...productionOrigins,
    ...environmentOrigins,
    ...(process.env.NODE_ENV === 'production'
        ? []
        : ['http://localhost:3000', 'http://localhost:5173']),
]);

app.use(cors({
    origin(origin, callback) {
        // Requests without Origin (server-to-server, health checks, Postman) are allowed.
        if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) {
            callback(null, true);
            return;
        }

        callback(new Error(`Origin '${origin}' tidak diizinkan oleh CORS.`));
    },
    credentials: true,
}));

// Global Body Parsing Middlewares (Dibatasi 1MB untuk mencegah Memory & Payload DoS)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use(auditLogMiddleware);

// Static Uploads File Serving
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Base / Health-check Route
app.get('/', (req, res) => {
    res.json({
        name: 'Backend Rays Autocare API',
        status: 'online',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
    });
});

// API health-check so https://api.raysautocare.id/api returns a useful response.
app.get('/api', (req, res) => {
    res.json({
        success: true,
        status: 'online',
        timestamp: new Date().toISOString(),
    });
});

// Centralized API Routes dengan Rate Limiting Perlindungan Abuse
app.use('/api', apiLimiter, apiRouter);

// 404 Not Found Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route '${req.method} ${req.originalUrl}' tidak ditemukan.`,
    });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Handle PayloadTooLargeError dari body-parser
    if (err.type === 'entity.too.large' || (err as any).status === 413) {
        res.status(413).json({
            success: false,
            message: 'Ukuran data (payload) request terlalu besar. Maksimal 1MB.',
        });
        return;
    }

    // Handle JSON syntax error dari body-parser (misal payload JSON terpotong / typo syntax)
    if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
        res.status(400).json({
            success: false,
            message: 'Format JSON pada request body tidak valid atau rusak.',
            error: err.message,
        });
        return;
    }

    console.error('Unhandled Server Error:', err);
    res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan internal pada server.',
        error: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
});

// Inisialisasi HTTP Server dan Socket.io
const server = http.createServer(app);
initSocketServer(server);

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

export default app;
