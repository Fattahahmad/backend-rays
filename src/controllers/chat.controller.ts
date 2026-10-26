import type { Request, Response } from 'express';
import { query } from '../config/db.ts';
import { getIo } from '../services/socket.service.ts';

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
             VALUES ($1, $2, $3, $4, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING *`,
            [userId, effectiveName, effectiveEmail, effectivePhone]
        );

        const conversation = insertConv.rows[0];
        let savedInitialMessage = null;

        // 2. Jika ada pesan pembuka pertama, simpan ke tabel messages
        if (initial_message && initial_message.trim()) {
            const insertMsg = await query(
                `INSERT INTO messages (conversation_id, sender_type, source, message_text, is_read)
                 VALUES ($1, 'customer', 'web_chat', $2, false)
                 RETURNING *`,
                [conversation.id, initial_message.trim()]
            );
            savedInitialMessage = insertMsg.rows[0];
        }

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
            },
        });
    } catch (error: any) {
        console.error('Start conversation error:', error);
        res.status(500).json({ success: false, message: 'Gagal memulai sesi obrolan.' });
    }
}

/**
 * GET /api/chat/conversations/:id/messages (Public / Customer / Admin)
 * Mengambil riwayat pesan pada satu sesi percakapan tertentu
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

        // Ambil riwayat seluruh pesan diurutkan dari yang terlama ke terbaru
        const messagesRes = await query(
            `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
            [conversationId]
        );

        res.json({
            success: true,
            data: {
                conversation: convRes.rows[0],
                messages: messagesRes.rows,
            },
        });
    } catch (error: any) {
        console.error('Get conversation messages error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil riwayat pesan.' });
    }
}

/**
 * POST /api/chat/conversations/:id/messages (Public / Customer / Admin)
 * HTTP Fallback untuk mengirim pesan (jika websocket client sedang putus/reconnecting)
 */
export async function sendMessageHttp(req: Request, res: Response): Promise<void> {
    try {
        const conversationId = parseInt(req.params.id as string, 10);
        const { message_text, sender_type = 'customer' } = req.body;

        if (!conversationId || !message_text || !message_text.trim()) {
            res.status(400).json({ success: false, message: 'ID percakapan dan isi pesan wajib diisi.' });
            return;
        }

        const validSender = sender_type === 'admin' ? 'admin' : 'customer';

        // 1. Simpan ke database
        const insertMsg = await query(
            `INSERT INTO messages (conversation_id, sender_type, source, message_text, is_read)
             VALUES ($1, $2, 'web_chat', $3, false)
             RETURNING *`,
            [conversationId, validSender, message_text.trim()]
        );

        const savedMessage = insertMsg.rows[0];

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
        const statusFilter = (req.query.status as string) || 'all';

        let whereClause = '';
        const params: any[] = [];
        if (statusFilter === 'open' || statusFilter === 'resolved') {
            params.push(statusFilter);
            whereClause = `WHERE c.status = $${params.length}`;
        }

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
        `;

        const result = await query(sql, params);

        res.json({
            success: true,
            data: result.rows,
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

        const updateRes = await query(
            'UPDATE conversations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (updateRes.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Sesi percakapan tidak ditemukan.' });
            return;
        }

        const updated = updateRes.rows[0];

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
