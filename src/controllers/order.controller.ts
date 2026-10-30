import type { Request, Response } from 'express';
import { query } from '../config/db.ts';
import { sendMetaEvent } from '../services/meta.service.ts';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const VALID_ORDER_STATUSES = ['pending_payment', 'paid', 'processing', 'shipped', 'completed', 'canceled'];

/**
 * Helper untuk men-generate nomor pesanan unik
 * Format: ORD-YYYYMMDD-XXXXXX (contoh: ORD-20261028-481923)
 */
function generateOrderNumber(): string {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const random = Math.floor(100000 + Math.random() * 900000);
    return `ORD-${yyyy}${mm}${dd}-${random}`;
}

/**
 * POST /api/orders/checkout (Customer)
 * Melakukan checkout keranjang belanja: memotong stok secara atomic, mengunci harga, menerapkan diskon kupon
 */
export async function checkoutOrder(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Autentikasi diperlukan untuk melakukan checkout.' });
            return;
        }

        const { items, shipping_address, courier = 'JNE', courier_service = 'REG', shipping_cost = 0, coupon_code } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            res.status(400).json({ success: false, message: 'Keranjang belanja tidak boleh kosong.' });
            return;
        }

        if (!shipping_address || !shipping_address.trim()) {
            res.status(400).json({ success: false, message: 'Alamat pengiriman wajib diisi.' });
            return;
        }

        // 1. Ekstrak seluruh ID produk untuk validasi batch (1 kueri tunggal yang efisien)
        const productIds: number[] = [];
        for (const item of items) {
            const productId = parseInt(item.product_id);
            const quantity = parseInt(item.quantity);
            if (!productId || !quantity || quantity <= 0) {
                res.status(400).json({ success: false, message: 'Data produk atau kuantiti tidak valid.' });
                return;
            }
            productIds.push(productId);
        }

        const placeholders = productIds.map((_, i) => `$${i + 1}`).join(', ');
        const productsResult = await query(
            `SELECT id, name, price, stock, is_active FROM products WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
            productIds
        );

        const productMap = new Map<number, any>();
        for (const prod of productsResult.rows) {
            productMap.set(prod.id, prod);
        }

        let subtotal = 0;
        const validatedItems: Array<{
            product_id: number;
            name: string;
            price: number;
            quantity: number;
            stock: number;
        }> = [];

        for (const item of items) {
            const productId = parseInt(item.product_id);
            const quantity = parseInt(item.quantity);
            const product = productMap.get(productId);

            if (!product || !product.is_active) {
                res.status(400).json({ success: false, message: `Produk dengan ID ${productId} tidak ditemukan atau sedang tidak aktif.` });
                return;
            }

            if (product.stock < quantity) {
                res.status(400).json({
                    success: false,
                    message: `Stok untuk '${product.name}' tidak mencukupi (tersisa: ${product.stock}, diminta: ${quantity}).`,
                });
                return;
            }

            subtotal += product.price * quantity;
            validatedItems.push({
                product_id: product.id,
                name: product.name,
                price: product.price,
                quantity,
                stock: product.stock,
            });
        }

        // 2. Validasi Kupon Diskon (jika ada)
        let discountAmount = 0;
        let appliedCouponCode: string | null = null;

        if (coupon_code && coupon_code.trim()) {
            const cleanCode = coupon_code.trim().toUpperCase();
            const couponResult = await query(
                'SELECT * FROM coupons WHERE UPPER(code) = $1 AND is_active = true',
                [cleanCode]
            );

            if (couponResult.rowCount > 0) {
                const coupon = couponResult.rows[0];

                // Cek minimal belanja
                const minPurchaseOk = !coupon.min_purchase || subtotal >= coupon.min_purchase;

                // Cek valid days
                let dayOk = true;
                if (coupon.valid_days) {
                    let allowedDays: string[] = [];
                    if (Array.isArray(coupon.valid_days)) allowedDays = coupon.valid_days;
                    else if (typeof coupon.valid_days === 'string') {
                        try { allowedDays = JSON.parse(coupon.valid_days); } catch { allowedDays = []; }
                    }

                    if (allowedDays.length > 0) {
                        const todayName = DAYS_OF_WEEK[new Date().getDay()];
                        dayOk = allowedDays.some(d => d.toLowerCase() === todayName.toLowerCase());
                    }
                }

                if (minPurchaseOk && dayOk) {
                    appliedCouponCode = coupon.code;
                    if (coupon.discount_type === 'percentage') {
                        discountAmount = Math.round((subtotal * coupon.discount_value) / 100);
                    } else {
                        discountAmount = coupon.discount_value;
                    }
                    if (discountAmount > subtotal) discountAmount = subtotal;
                }
            }
        }

        // 3. Hitung Grand Total
        const numShippingCost = Math.max(0, Number(shipping_cost) || 0);
        const grandTotal = Math.max(0, subtotal - discountAmount) + numShippingCost;

        // 4. Generate Nomor Pesanan Unik (Dibatasi 5 percobaan untuk cegah infinite loop)
        let orderNumber = generateOrderNumber();
        let attempts = 0;
        while (attempts < 5) {
            const check = await query('SELECT id FROM orders WHERE order_number = $1', [orderNumber]);
            if (check.rowCount === 0) break;
            orderNumber = generateOrderNumber();
            attempts++;
        }

        // 5. Simpan Pesanan ke Tabel orders
        await query(
            `INSERT INTO orders (
                user_id, order_number, subtotal, shipping_cost, discount_amount, grand_total,
                shipping_address, courier, courier_service, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                userId,
                orderNumber,
                subtotal,
                numShippingCost,
                discountAmount,
                grandTotal,
                shipping_address.trim(),
                courier.trim(),
                courier_service.trim(),
                'pending_payment',
            ]
        );

        const newOrderResult = await query('SELECT * FROM orders WHERE order_number = $1', [orderNumber]);
        const orderId = newOrderResult.rows[0].id;

        // 6. Simpan Detail Item & Potong Stok secara Atomic (Cegah Race Condition / Stok Minus)
        const deductedItems: Array<{ product_id: number; quantity: number }> = [];
        let stockFailed = false;
        let failedProductName = '';

        for (const item of validatedItems) {
            // Atomic update: hanya kurangi stok jika stok saat ini masih mencukupi
            const stockUpdateResult = await query(
                'UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND stock >= $1',
                [item.quantity, item.product_id]
            );

            if (stockUpdateResult.rowCount === 0) {
                stockFailed = true;
                failedProductName = item.name;
                break;
            }

            deductedItems.push({ product_id: item.product_id, quantity: item.quantity });

            await query(
                `INSERT INTO order_items (order_id, product_id, quantity, price_at_checkout)
                 VALUES ($1, $2, $3, $4)`,
                [orderId, item.product_id, item.quantity, item.price]
            );
        }

        // Jika salah satu item gagal karena stok habis saat race condition, lakukan Rollback
        if (stockFailed) {
            for (const item of deductedItems) {
                await query('UPDATE products SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
                    item.quantity,
                    item.product_id,
                ]);
            }
            await query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
            await query('DELETE FROM orders WHERE id = $1', [orderId]);

            res.status(409).json({
                success: false,
                message: `Stok untuk '${failedProductName}' baru saja habis dibeli oleh pelanggan lain. Pesanan dibatalkan, silakan cek kembali keranjang belanja Anda.`,
            });
            return;
        }

        const createdOrder = newOrderResult.rows[0];

        // Trigger Meta Conversions API (InitiateCheckout) secara asynchronous (non-blocking)
        sendMetaEvent({
            eventName: 'InitiateCheckout',
            eventId: createdOrder.order_number,
            userData: {
                email: req.user?.email,
                clientIp: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
                clientUserAgent: req.headers['user-agent'] || undefined,
            },
            customData: {
                currency: 'IDR',
                value: grandTotal,
                order_id: createdOrder.order_number,
                num_items: validatedItems.length,
                content_ids: validatedItems.map(i => i.product_id),
                content_type: 'product',
            },
        }).catch(err => console.error('[Meta CAPI Checkout Error]:', err));

        res.status(201).json({
            success: true,
            message: 'Pesanan berhasil dibuat. Silakan lakukan pembayaran.',
            data: {
                order: createdOrder,
                items: validatedItems.map(i => ({
                    product_id: i.product_id,
                    name: i.name,
                    price_at_checkout: i.price,
                    quantity: i.quantity,
                    total_price: i.price * i.quantity,
                })),
                applied_coupon: appliedCouponCode,
            },
        });
    } catch (error) {
        console.error('Checkout order error:', error);
        res.status(500).json({ success: false, message: 'Gagal memproses checkout pesanan.' });
    }
}

/**
 * GET /api/orders/my-orders (Customer)
 * Mengambil seluruh riwayat pesanan milik customer yang sedang login
 */
export async function getMyOrders(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;

        const countResult = await query('SELECT COUNT(*) as total FROM orders WHERE user_id = $1', [userId]);
        const total = parseInt((countResult.rows[0] as any).total) || 0;

        const ordersSql = `
            SELECT o.id, o.order_number, o.subtotal, o.shipping_cost, o.discount_amount, o.grand_total,
                   o.status, o.courier, o.courier_service, o.tracking_number, o.created_at,
                   COUNT(oi.id) as total_items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.user_id = $1
            GROUP BY o.id
            ORDER BY o.id DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await query(ordersSql, [userId, limit, offset]);

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
    } catch (error) {
        console.error('Get my orders error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil riwayat pesanan.' });
    }
}

/**
 * GET /api/orders/:orderNumber (Customer / Admin)
 * Mengambil detail lengkap pesanan berdasarkan nomor pesanan
 */
export async function getOrderByNumber(req: Request, res: Response): Promise<void> {
    try {
        const { orderNumber } = req.params;
        const userId = req.user?.id;
        const userRole = req.user?.role;

        const orderResult = await query(
            `SELECT o.*, u.name as customer_name, u.email as customer_email, u.phone_number as customer_phone
             FROM orders o
             JOIN users u ON o.user_id = u.id
             WHERE o.order_number = $1`,
            [orderNumber]
        );

        if (orderResult.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
            return;
        }

        const order = orderResult.rows[0];

        // Jika customer biasa, hanya boleh melihat pesanannya sendiri
        if (userRole === 'user' && order.user_id !== userId) {
            res.status(403).json({ success: false, message: 'Anda tidak memiliki izin melihat pesanan ini.' });
            return;
        }

        // Ambil rincian item produk beserta foto primary-nya
        const itemsSql = `
            SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_checkout,
                   p.name as product_name, p.slug as product_slug,
                   (
                       SELECT pi.image_url
                       FROM product_images pi
                       WHERE pi.product_id = p.id
                       ORDER BY pi.is_primary DESC, pi.id ASC
                       LIMIT 1
                   ) as product_image
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = $1
            ORDER BY oi.id ASC
        `;

        const itemsResult = await query(itemsSql, [order.id]);

        res.json({
            success: true,
            data: {
                ...order,
                items: itemsResult.rows,
            },
        });
    } catch (error) {
        console.error('Get order by number error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil rincian pesanan.' });
    }
}

/**
 * GET /api/orders/admin/all (Admin / Super Admin Only)
 * Melihat seluruh daftar pesanan masuk untuk operasional CMS
 */
export async function listAllOrdersAdmin(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const { status, search } = req.query;

        let whereConditions: string[] = ['1=1'];
        const params: any[] = [];
        let index = 1;

        if (status) {
            whereConditions.push(`o.status = $${index++}`);
            params.push(status);
        }

        if (search) {
            whereConditions.push(`(o.order_number ILIKE $${index} OR u.name ILIKE $${index} OR u.email ILIKE $${index} OR o.tracking_number ILIKE $${index})`);
            params.push(`%${(search as string).trim()}%`);
            index++;
        }

        const whereClause = 'WHERE ' + whereConditions.join(' AND ');

        const countResult = await query(
            `SELECT COUNT(*) as total FROM orders o JOIN users u ON o.user_id = u.id ${whereClause}`,
            params
        );
        const total = parseInt((countResult.rows[0] as any).total) || 0;

        const sql = `
            SELECT o.id, o.order_number, o.user_id, o.subtotal, o.shipping_cost, o.discount_amount, o.grand_total,
                   o.status, o.courier, o.courier_service, o.tracking_number, o.created_at,
                   u.name as customer_name, u.email as customer_email, u.phone_number as customer_phone
            FROM orders o
            JOIN users u ON o.user_id = u.id
            ${whereClause}
            ORDER BY o.id DESC
            LIMIT $${index++} OFFSET $${index}
        `;
        params.push(limit, offset);

        const ordersResult = await query(sql, params);

        res.json({
            success: true,
            data: ordersResult.rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('List all orders admin error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar pesanan CMS.' });
    }
}

/**
 * PATCH /api/orders/admin/:id/shipping (Admin / Super Admin Only)
 * Memperbarui nomor resi pengiriman (tracking_number) dan memajukan status pesanan menjadi 'shipped'
 */
export async function updateOrderShipping(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);
        const { tracking_number, courier, courier_service } = req.body;

        if (!tracking_number || !tracking_number.trim()) {
            res.status(400).json({ success: false, message: 'Nomor resi (tracking_number) wajib diisi.' });
            return;
        }

        const check = await query('SELECT id, status, order_number FROM orders WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
            return;
        }

        const currentOrder = check.rows[0];

        await query(
            `UPDATE orders
             SET tracking_number = $1,
                 courier = COALESCE($2, courier),
                 courier_service = COALESCE($3, courier_service),
                 status = 'shipped',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [
                tracking_number.trim(),
                courier ? courier.trim() : null,
                courier_service ? courier_service.trim() : null,
                id,
            ]
        );

        res.json({
            success: true,
            message: `Nomor resi berhasil diinput. Status pesanan '${currentOrder.order_number}' kini menjadi 'shipped' (Dikirim).`,
            data: { id, tracking_number: tracking_number.trim(), status: 'shipped' },
        });
    } catch (error) {
        console.error('Update order shipping error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui nomor resi pengiriman.' });
    }
}

/**
 * PATCH /api/orders/admin/:id/status (Admin / Super Admin Only)
 * Mengubah status pesanan secara manual (dilengkapi auto-restock stok barang jika dibatalkan)
 */
export async function updateOrderStatus(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);
        const { status } = req.body;

        if (!status || !VALID_ORDER_STATUSES.includes(status)) {
            res.status(400).json({
                success: false,
                message: `Status pesanan tidak valid. Pilihan: ${VALID_ORDER_STATUSES.join(', ')}`,
            });
            return;
        }

        const check = await query('SELECT id, status, order_number FROM orders WHERE id = $1', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
            return;
        }

        const currentOrder = check.rows[0];

        // Mencegah menghidupkan kembali pesanan yang sudah dibatalkan
        if (currentOrder.status === 'canceled') {
            res.status(400).json({
                success: false,
                message: 'Pesanan yang telah dibatalkan tidak dapat diaktifkan kembali.',
            });
            return;
        }

        // Jika dibatalkan dan status sebelumnya bukan canceled, kembalikan stok barang (Auto-Restock)
        if (status === 'canceled') {
            const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [id]);
            for (const item of items.rows) {
                await query('UPDATE products SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
                    item.quantity,
                    item.product_id,
                ]);
            }
        }

        await query('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, id]);

        // Jika status diubah menjadi 'paid', trigger Meta Conversions API 'Purchase'
        if (status === 'paid' && currentOrder.status !== 'paid') {
            query(
                `SELECT o.grand_total, o.order_number, u.email 
                 FROM orders o 
                 LEFT JOIN users u ON o.user_id = u.id 
                 WHERE o.id = $1`,
                [id]
            ).then(res => {
                if (res.rowCount && res.rowCount > 0) {
                    const od = res.rows[0];
                    sendMetaEvent({
                        eventName: 'Purchase',
                        eventId: od.order_number,
                        userData: {
                            email: od.email,
                        },
                        customData: {
                            currency: 'IDR',
                            value: od.grand_total,
                            order_id: od.order_number,
                        },
                    }).catch(err => console.error('[Meta CAPI Purchase Error]:', err));
                }
            }).catch(err => console.error('[Meta CAPI Fetch Order Detail Error]:', err));
        }

        res.json({
            success: true,
            message: `Status pesanan '${currentOrder.order_number}' berhasil diubah menjadi '${status}'.`,
            data: { id, status },
        });
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui status pesanan.' });
    }
}

/**
 * PATCH /api/orders/:orderNumber/cancel (Customer)
 * Customer membatalkan pesanan mandiri yang masih menunggu pembayaran (pending_payment)
 */
export async function cancelMyOrder(req: Request, res: Response): Promise<void> {
    try {
        const { orderNumber } = req.params;
        const userId = req.user?.id;

        const orderResult = await query(
            'SELECT id, user_id, status, order_number FROM orders WHERE order_number = $1',
            [orderNumber]
        );

        if (orderResult.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
            return;
        }

        const order = orderResult.rows[0];

        if (order.user_id !== userId) {
            res.status(403).json({ success: false, message: 'Anda tidak memiliki hak akses membatalkan pesanan ini.' });
            return;
        }

        if (order.status !== 'pending_payment') {
            res.status(400).json({
                success: false,
                message: `Pesanan berstatus '${order.status}' tidak dapat dibatalkan mandiri. Silakan hubungi customer service kami.`,
            });
            return;
        }

        // Restock produk secara otomatis
        const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [order.id]);
        for (const item of items.rows) {
            await query('UPDATE products SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
                item.quantity,
                item.product_id,
            ]);
        }

        await query("UPDATE orders SET status = 'canceled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [order.id]);

        res.json({
            success: true,
            message: `Pesanan '${order.order_number}' berhasil dibatalkan dan stok produk telah dikembalikan.`,
            data: { order_number: order.order_number, status: 'canceled' },
        });
    } catch (error) {
        console.error('Cancel my order error:', error);
        res.status(500).json({ success: false, message: 'Gagal membatalkan pesanan.' });
    }
}
