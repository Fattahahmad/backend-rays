import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.ts';
import { getIo } from '../services/socket.service.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'rays_autocare_secret_key_2026';

/**
 * Helper untuk memvalidasi hak akses percakapan (Mencegah IDOR)
 */
function checkConversationAccess(req: Request, conversation: any): boolean {
    // 1. Admin & Super Admin selalu diizinkan
    if (req.user && ['admin', 'super_admin'].includes(req.user.role)) {
        return true;
    }

    // 2. Jika user terdaftar dan ID user cocok
    if (req.user && conversation.user_id && req.user.id === conversation.user_id) {
        return true;
    }

    // 3. Jika user terdaftar dan email cocok
    if (req.user && conversation.guest_email && req.user.email.toLowerCase() === conversation.guest_email.toLowerCase()) {
        return true;
    }

    // 4. Jika menyertakan chat_token yang sah untuk percakapan ini
    const token = (req.headers['x-chat-token'] as string) || (req.query.chat_token as string) || (req.body?.chat_token as string);
    if (token) {
        try {
            const decoded: any = jwt.verify(token, JWT_SECRET);
            if (decoded && decoded.conversationId === conversation.id) {
                return true;
            }
        } catch {
            return false;
        }
    }

    return false;
}

/**
 * POST /api/chat/start (Public / Authenticated)
 * Memulai sesi percakapan obrolan baru dari widget chat di website
 */
export async function startConversation(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id || null;
        const { guest_name, phone_number, guest_email, initial_message } = req.body;

        const effectiveName = guest_name ? guest_name.trim() : (req.user?.name || 'Tamu Pengunjung');
        const effectiveEmail = guest_email ? guest_email.trim().toLowerCase() : (req.user?.email || null);
        const effectivePhone = phone_number ? phone_number.trim() : null;

        // 1. Buat percakapan baru di database
        const insertConv = await query(
            `INSERT INTO conversations (user_id, guest_name, guest_email, phone_number, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [userId, effectiveName, effectiveEmail, effectivePhone]
        );

        let conversationId = insertConv.rows[0]?.id;
        if (!conversationId) {
            const lastConv = await query('SELECT * FROM conversations ORDER BY id DESC LIMIT 1');
            conversationId = lastConv.rows[0].id;
        }

        const convFetch = await query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
        const conversation = convFetch.rows[0];

        let savedInitialMessage = null;

        // 2. Jika ada pesan pembuka pertama, simpan ke tabel messages
        if (initial_message && initial_message.trim()) {
            await query(
                `INSERT INTO messages (conversation_id, sender_type, source, message_text, is_read)
                 VALUES ($1, 'customer', 'web_chat', $2, false)`,
                [conversation.id, initial_message.trim()]
            );
            const msgFetch = await query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 1', [conversation.id]);
            savedInitialMessage = msgFetch.rows[0];
        }

        // Terbitkan token akses obrolan khusus sesi ini (untuk keamanan tamu)
        const chatToken = jwt.sign(
            { conversationId: conversation.id, email: effectiveEmail },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // 3. Beri notifikasi ke dashboard Admin CMS via Socket.io
        const io = getIo();
        if (io) {
            io.to('admin_support').emit('server:conversation_created', {
                conversation: {
                    ...conversation,
                    latest_message: savedInitialMessage ? savedInitialMessage.message_text : 'Obrolan baru dimulai.',
                    latest_message_time: conversation.created_at,
                    latest_sender: 'customer',
                    unread_count: savedInitialMessage ? 1 : 0,
                },
            });
        }

        res.status(201).json({
            success: true,
            message: 'Sesi obrolan berhasil dibuat.',
            data: {
                conversation,
                initial_message: savedInitialMessage,
                chat_token: chatToken,
            },
        });
    } catch (error: any) {
        console.error('Start conversation error:', error);
        res.status(500).json({ success: false, message: 'Gagal memulai sesi obrolan.' });
    }
}

/**
 * GET /api/chat/conversations/:id/messages (Public / Customer / Admin)
 * Mengambil riwayat pesan pada satu sesi percakapan tertentu (Terlindungi dari IDOR)
 */
export async function getConversationMessages(req: Request, res: Response): Promise<void> {
    try {
        const conversationId = parseInt(req.params.id as string, 10);
        if (!conversationId) {
            res.status(400).json({ success: false, message: 'ID percakapan tidak valid.' });
            return;
        }

        // Ambil info percakapan
        const convRes = await query(
            `SELECT c.*, u.name as user_name, u.email as user_email
             FROM conversations c
             LEFT JOIN users u ON c.user_id = u.id
             WHERE c.id = $1`,
            [conversationId]
        );

        if (convRes.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Sesi percakapan tidak ditemukan.' });
            return;
        }

        const conversation = convRes.rows[0];

        // Validasi Otorisasi (Cegah IDOR membaca chat orang lain)
        if (!checkConversationAccess(req, conversation)) {
            res.status(403).json({
                success: false,
                message: 'Akses ditolak: Anda tidak memiliki izin untuk melihat riwayat percakapan ini.',
            });
            return;
        }

        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : (req.query.all === 'true' ? 1000 : 50);
        const offset = (page - 1) * limit;

        const countMsg = await query('SELECT COUNT(*) as total FROM messages WHERE conversation_id = $1', [conversationId]);
        const total = parseInt((countMsg.rows[0] as any).total, 10) || 0;

        // Ambil riwayat pesan diurutkan dari yang terlama ke terbaru dengan pagination
        const messagesRes = await query(
            `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
            [conversationId, limit, offset]
        );

        res.json({
            success: true,
            data: {
                conversation,
                messages: messagesRes.rows,
            },
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error: any) {
        console.error('Get conversation messages error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil riwayat pesan.' });
    }
}

/**
 * POST /api/chat/conversations/:id/messages (Public / Customer / Admin)
 * HTTP Fallback untuk mengirim pesan (Terlindungi dari Privilege Escalation)
 */
export async function sendMessageHttp(req: Request, res: Response): Promise<void> {
    try {
        const conversationId = parseInt(req.params.id as string, 10);
        const { message_text, sender_type = 'customer' } = req.body;

        if (!conversationId || !message_text || !message_text.trim()) {
            res.status(400).json({ success: false, message: 'ID percakapan dan isi pesan wajib diisi.' });
            return;
        }

        const convRes = await query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
        if (convRes.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Sesi percakapan tidak ditemukan.' });
            return;
        }

        const conversation = convRes.rows[0];

        // Validasi Otorisasi (Cegah IDOR mengirim pesan ke obrolan milik orang lain)
        if (!checkConversationAccess(req, conversation)) {
            res.status(403).json({
                success: false,
                message: 'Akses ditolak: Anda tidak memiliki izin mengirim pesan ke percakapan ini.',
            });
            return;
        }

        // Cegah Privilege Escalation: Hanya admin terautentikasi yang boleh mengaku sebagai 'admin'
        let validSender: 'customer' | 'admin' = 'customer';
        if (sender_type === 'admin') {
            if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
                res.status(403).json({
                    success: false,
                    message: 'Akses ditolak: Anda tidak memiliki wewenang untuk mengirim pesan sebagai staf admin.',
                });
                return;
            }
            validSender = 'admin';
        }

        // 1. Simpan ke database
        await query(
            `INSERT INTO messages (conversation_id, sender_type, source, message_text, is_read)
             VALUES ($1, $2, 'web_chat', $3, false)`,
            [conversationId, validSender, message_text.trim()]
        );

        const fetchSaved = await query(
            'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 1',
            [conversationId]
        );
        const savedMessage = fetchSaved.rows[0];

        // 2. Perbarui waktu percakapan
        await query(
            'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, status = $1 WHERE id = $2',
            ['open', conversationId]
        );

        // 3. Emit via Socket.io
        const io = getIo();
        if (io) {
            const roomName = `conversation_${conversationId}`;
            io.to(roomName).emit('server:new_message', {
                message: savedMessage,
                conversationId,
            });
            io.to('admin_support').emit('server:conversation_updated', {
                conversationId,
                latest_message: savedMessage.message_text,
                latest_sender: savedMessage.sender_type,
            });
        }

        res.status(201).json({
            success: true,
            message: 'Pesan berhasil dikirim.',
            data: savedMessage,
        });
    } catch (error: any) {
        console.error('Send message HTTP error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengirim pesan obrolan.' });
    }
}

/**
 * GET /api/chat/admin/conversations (Admin & Super Admin Only)
 * Mengambil daftar seluruh sesi percakapan untuk tampilan Inbox CS di Admin CMS
 */
export async function listAdminConversations(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 15;
        const offset = (page - 1) * limit;
        const statusFilter = (req.query.status as string) || 'all';

        let whereClause = '';
        const params: any[] = [];
        if (statusFilter === 'open' || statusFilter === 'resolved') {
            params.push(statusFilter);
            whereClause = `WHERE c.status = $${params.length}`;
        }

        const countResult = await query(`SELECT COUNT(*) as total FROM conversations c ${whereClause}`, params);
        const total = parseInt((countResult.rows[0] as any).total, 10) || 0;

        let index = params.length + 1;
        params.push(limit, offset);

        const sql = `
            SELECT 
                c.id,
                c.user_id,
                c.guest_name,
                c.guest_email,
                c.phone_number,
                c.status,
                c.created_at,
                c.updated_at,
                u.name as registered_user_name,
                u.email as registered_user_email,
                (
                    SELECT m.message_text 
                    FROM messages m 
                    WHERE m.conversation_id = c.id 
                    ORDER BY m.created_at DESC 
                    LIMIT 1
                ) as latest_message,
                (
                    SELECT m.created_at 
                    FROM messages m 
                    WHERE m.conversation_id = c.id 
                    ORDER BY m.created_at DESC 
                    LIMIT 1
                ) as latest_message_time,
                (
                    SELECT m.sender_type 
                    FROM messages m 
                    WHERE m.conversation_id = c.id 
                    ORDER BY m.created_at DESC 
                    LIMIT 1
                ) as latest_sender,
                (
                    SELECT COUNT(*)::int 
                    FROM messages m 
                    WHERE m.conversation_id = c.id 
                      AND m.sender_type = 'customer' 
                      AND m.is_read = false
                ) as unread_count
            FROM conversations c
            LEFT JOIN users u ON c.user_id = u.id
            ${whereClause}
            ORDER BY c.updated_at DESC
            LIMIT $${index++} OFFSET $${index}
        `;

        const result = await query(sql, params);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error: any) {
        console.error('List admin conversations error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar percakapan admin.' });
    }
}

/**
 * PATCH /api/chat/admin/conversations/:id/status (Admin & Super Admin Only)
 * Mengubah status percakapan ('open' atau 'resolved')
 */
export async function updateConversationStatus(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string, 10);
        const { status } = req.body;

        if (!status || !['open', 'resolved'].includes(status)) {
            res.status(400).json({ success: false, message: "Status harus berupa 'open' atau 'resolved'." });
            return;
        }

        const check = await query('SELECT id FROM conversations WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Sesi percakapan tidak ditemukan.' });
            return;
        }

        await query(
            'UPDATE conversations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [status, id]
        );

        const fetchUpdated = await query('SELECT * FROM conversations WHERE id = $1', [id]);
        const updated = fetchUpdated.rows[0];

        // Beri tahu partisipan di room
        const io = getIo();
        if (io) {
            io.to(`conversation_${id}`).emit('server:conversation_status_changed', {
                conversationId: id,
                status,
            });
        }

        res.json({
            success: true,
            message: `Status percakapan berhasil diubah menjadi '${status}'.`,
            data: updated,
        });
    } catch (error: any) {
        console.error('Update conversation status error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui status percakapan.' });
    }
}
