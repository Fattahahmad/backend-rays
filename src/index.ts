import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import apiRouter from './routes/index.ts';
import { auditLogMiddleware } from './middlewares/audit.middleware.ts';
import { initSocketServer } from './services/socket.service.ts';

const app = express();
const PORT = process.env.PORT || 3001;

// Global Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// Centralized API Routes
app.use('/api', apiRouter);

// 404 Not Found Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route '${req.method} ${req.originalUrl}' tidak ditemukan.`,
    });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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