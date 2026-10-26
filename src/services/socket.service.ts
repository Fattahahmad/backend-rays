import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { query } from '../config/db.ts';

let io: SocketIOServer | null = null;

/**
 * Inisialisasi Socket.IO Server yang terintegrasi dengan HTTP Server Express
 */
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
    io = new SocketIOServer(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
        },
    });

    io.on('connection', (socket: Socket) => {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Socket.io] Client connected: ${socket.id}`);
        }

        /**
         * 1. Admin bergabung ke room khusus 'admin_support'
         * Digunakan untuk menerima notifikasi pesan masuk dari seluruh pengunjung
         */
        socket.on('admin:join_dashboard', () => {
            socket.join('admin_support');
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[Socket.io] Admin joined room: admin_support (Socket ID: ${socket.id})`);
            }
        });

        /**
         * 2. Bergabung ke room percakapan tertentu (Pengunjung & Admin)
         * Room ID: conversation_{conversationId}
         */
        socket.on('client:join_conversation', (data: { conversationId: number | string }) => {
            const conversationId = parseInt(data.conversationId as string, 10);
            if (!conversationId) return;

            const roomName = `conversation_${conversationId}`;
            socket.join(roomName);
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[Socket.io] Socket ${socket.id} joined room ${roomName}`);
            }
        });

        /**
         * 3. Pengiriman pesan chat realtime
         */
        socket.on(
            'client:send_message',
            async (data: {
                conversationId: number | string;
                messageText: string;
                senderType: 'customer' | 'admin';
                source?: 'web_chat' | 'whatsapp';
            }) => {
                try {
                    const conversationId = parseInt(data.conversationId as string, 10);
                    const messageText = (data.messageText || '').trim();
                    const senderType = data.senderType === 'admin' ? 'admin' : 'customer';
                    const source = data.source || 'web_chat';

                    if (!conversationId || !messageText) {
                        socket.emit('server:error', { message: 'Data pesan atau conversationId tidak valid.' });
                        return;
                    }

                    // 1. Simpan pesan ke database
                    const insertMsg = await query(
                        `INSERT INTO messages (conversation_id, sender_type, source, message_text, is_read)
                         VALUES ($1, $2, $3, $4, false)
                         RETURNING *`,
                        [conversationId, senderType, source, messageText]
                    );

                    const savedMessage = insertMsg.rows[0];

                    // 2. Perbarui updated_at percakapan
                    await query(
                        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, status = $1 WHERE id = $2',
                        ['open', conversationId]
                    );

                    // Ambil ringkasan percakapan untuk notifikasi dashboard admin
                    const convRes = await query(
                        `SELECT c.*, u.name as user_name, u.email as user_email
                         FROM conversations c
                         LEFT JOIN users u ON c.user_id = u.id
                         WHERE c.id = $1`,
                        [conversationId]
                    );
                    const convData = convRes.rows[0] || {};

                    // 3. Pancarkan pesan baru ke seluruh partisipan di room percakapan
                    const roomName = `conversation_${conversationId}`;
                    io?.to(roomName).emit('server:new_message', {
                        message: savedMessage,
                        conversationId,
                    });

                    // 4. Pancarkan event pembaruan ke seluruh Admin CS di room 'admin_support'
                    io?.to('admin_support').emit('server:conversation_updated', {
                        conversation: {
                            ...convData,
                            latest_message: savedMessage.message_text,
                            latest_message_time: savedMessage.created_at,
                            latest_sender: savedMessage.sender_type,
                        },
                    });
                } catch (error: any) {
                    console.error('[Socket.io Send Message Error]:', error.message);
                    socket.emit('server:error', { message: 'Gagal mengirim pesan chat.' });
                }
            }
        );

        /**
         * 4. Indikator "Sedang Mengetik..." (Typing indicator)
         */
        socket.on(
            'client:typing',
            (data: { conversationId: number | string; senderType: 'customer' | 'admin'; isTyping: boolean }) => {
                const conversationId = parseInt(data.conversationId as string, 10);
                if (!conversationId) return;

                const roomName = `conversation_${conversationId}`;
                socket.to(roomName).emit('server:typing', {
                    conversationId,
                    senderType: data.senderType,
                    isTyping: data.isTyping,
                });
            }
        );

        /**
         * 5. Menandai pesan telah dibaca (Read receipt)
         */
        socket.on(
            'client:mark_as_read',
            async (data: { conversationId: number | string; readerType: 'customer' | 'admin' }) => {
                try {
                    const conversationId = parseInt(data.conversationId as string, 10);
                    if (!conversationId) return;

                    // Tandai pesan dari pengirim lawan sebagai sudah dibaca
                    const oppositeSender = data.readerType === 'admin' ? 'customer' : 'admin';
                    await query(
                        'UPDATE messages SET is_read = true WHERE conversation_id = $1 AND sender_type = $2 AND is_read = false',
                        [conversationId, oppositeSender]
                    );

                    const roomName = `conversation_${conversationId}`;
                    io?.to(roomName).emit('server:messages_read', {
                        conversationId,
                        readBy: data.readerType,
                    });
                } catch (err: any) {
                    console.error('[Socket.io Mark As Read Error]:', err.message);
                }
            }
        );

        socket.on('disconnect', () => {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[Socket.io] Client disconnected: ${socket.id}`);
            }
        });
    });

    return io;
}

/**
 * Getter untuk instance IO aktif (digunakan oleh REST controller jika perlu push event)
 */
export function getIo(): SocketIOServer | null {
    return io;
}
