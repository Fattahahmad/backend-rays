import type { Request, Response } from 'express';
import { query } from '../config/db.ts';
import { deleteFileIfExists } from '../utils/file.util.ts';

function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

/**
 * GET /api/products (Public)
 * Mengambil daftar produk untuk etalase marketplace
 * Mendukung filter: category_id, category_slug, search, in_stock, sort, dan pagination
 */
export async function listProducts(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 12;
        const offset = (page - 1) * limit;

        const { category_id, category_slug, search, in_stock, sort } = req.query;

        let whereConditions = ['p.deleted_at IS NULL'];
        const params: any[] = [];
        let index = 1;

        // Default publik: hanya produk aktif
        // Jika admin mengakses endpoint ini dengan ?show_all=true dan berstatus admin, tampilkan semua
        const showAll = req.query.show_all === 'true' && req.user && ['admin', 'super_admin'].includes(req.user.role);
        if (!showAll) {
            whereConditions.push('p.is_active = true');
        }

        if (category_id) {
            whereConditions.push(`p.category_id = $${index++}`);
            params.push(parseInt(category_id as string));
        }

        if (category_slug) {
            whereConditions.push(`c.slug = $${index++}`);
            params.push((category_slug as string).trim().toLowerCase());
        }

        if (search) {
            whereConditions.push(`p.name ILIKE $${index++}`);
            params.push(`%${(search as string).trim()}%`);
        }

        if (in_stock === 'true') {
            whereConditions.push('p.stock > 0');
        }

        const whereClause = 'WHERE ' + whereConditions.join(' AND ');

        // Pengurutan (Sorting)
        let orderByClause = 'ORDER BY p.id DESC';
        if (sort === 'price_asc') {
            orderByClause = 'ORDER BY p.price ASC, p.id DESC';
        } else if (sort === 'price_desc') {
            orderByClause = 'ORDER BY p.price DESC, p.id DESC';
        } else if (sort === 'name_asc') {
            orderByClause = 'ORDER BY p.name ASC';
        }

        // Hitung total produk
        const countSql = `
            SELECT COUNT(*) as total
            FROM products p
            JOIN categories c ON p.category_id = c.id
            ${whereClause}
        `;
        const countResult = await query(countSql, params);
        const total = parseInt((countResult.rows[0] as any).total) || 0;

        // Query data produk beserta foto cover utama
        const selectSql = `
            SELECT p.id, p.category_id, p.name, p.slug, p.description, p.price, p.weight_grams, p.stock, p.is_active, p.created_at,
                   c.name as category_name, c.slug as category_slug,
                   (
                       SELECT pi.image_url
                       FROM product_images pi
                       WHERE pi.product_id = p.id
                       ORDER BY pi.is_primary DESC, pi.id ASC
                       LIMIT 1
                   ) as primary_image
            FROM products p
            JOIN categories c ON p.category_id = c.id
            ${whereClause}
            ${orderByClause}
            LIMIT $${index++} OFFSET $${index}
        `;
        params.push(limit, offset);

        const productsResult = await query(selectSql, params);

        res.json({
            success: true,
            data: productsResult.rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('List products error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil katalog produk.' });
    }
}

/**
 * GET /api/products/:slug (Public)
 * Mengambil detail lengkap produk berdasarkan slug, termasuk galeri seluruh foto
 */
export async function getProductBySlug(req: Request, res: Response): Promise<void> {
    try {
        const { slug } = req.params;

        const productResult = await query(
            `SELECT p.id, p.category_id, p.name, p.slug, p.description, p.price, p.weight_grams, p.stock, p.is_active, p.created_at,
                    c.name as category_name, c.slug as category_slug
             FROM products p
             JOIN categories c ON p.category_id = c.id
             WHERE p.slug = $1 AND p.deleted_at IS NULL`,
            [slug]
        );

        if (productResult.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
            return;
        }

        const product = productResult.rows[0];

        // Ambil galeri gambar produk
        const imagesResult = await query(
            `SELECT id, image_url, is_primary
             FROM product_images
             WHERE product_id = $1
             ORDER BY is_primary DESC, id ASC`,
            [product.id]
        );

        res.json({
            success: true,
            data: {
                ...product,
                images: imagesResult.rows,
            },
        });
    } catch (error) {
        console.error('Get product by slug error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil detail produk.' });
    }
}

/**
 * POST /api/products (Admin / Super Admin Only)
 * Menambah produk baru ke marketplace beserta foto galeri awalnya
 */
export async function createProduct(req: Request, res: Response): Promise<void> {
    try {
        const { category_id, name, slug, description, price, weight_grams, stock = 0, is_active = true, images = [] } = req.body;

        if (!category_id || !name || price === undefined || weight_grams === undefined) {
            res.status(400).json({
                success: false,
                message: 'Kategori (category_id), nama produk, harga (price), dan berat dalam gram (weight_grams) wajib diisi.',
            });
            return;
        }

        // Cek validitas kategori
        const categoryCheck = await query('SELECT id FROM categories WHERE id = $1', [category_id]);
        if (categoryCheck.rowCount === 0) {
            res.status(400).json({ success: false, message: 'Kategori yang dipilih tidak valid.' });
            return;
        }

        const trimmedName = name.trim();
        let targetSlug = slug ? slugify(slug) : slugify(trimmedName);
        if (!targetSlug) targetSlug = 'produk-' + Date.now();

        // Pastikan slug unik
        let finalSlug = targetSlug;
        let counter = 1;
        while (true) {
            const check = await query('SELECT id FROM products WHERE slug = $1 AND deleted_at IS NULL', [finalSlug]);
            if (check.rowCount === 0) break;
            finalSlug = `${targetSlug}-${counter++}`;
        }

        // Insert Produk
        await query(
            `INSERT INTO products (category_id, name, slug, description, price, weight_grams, stock, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                category_id,
                trimmedName,
                finalSlug,
                description ? description.trim() : null,
                Number(price),
                Number(weight_grams),
                Number(stock),
                Boolean(is_active),
            ]
        );

        const newProductResult = await query('SELECT id FROM products WHERE slug = $1', [finalSlug]);
        const newProductId = newProductResult.rows[0].id;

        // Insert Galeri Gambar (jika dikirim)
        if (Array.isArray(images) && images.length > 0) {
            for (let i = 0; i < images.length; i++) {
                const img = images[i];
                const isPrimary = img.is_primary !== undefined ? Boolean(img.is_primary) : (i === 0);
                if (img.image_url) {
                    await query(
                        'INSERT INTO product_images (product_id, image_url, is_primary) VALUES ($1, $2, $3)',
                        [newProductId, img.image_url.trim(), isPrimary]
                    );
                }
            }
        }

        // Ambil data lengkap untuk response
        const completeProduct = await query(
            `SELECT p.*, c.name as category_name
             FROM products p
             JOIN categories c ON p.category_id = c.id
             WHERE p.id = $1`,
            [newProductId]
        );

        const imagesList = await query('SELECT id, image_url, is_primary FROM product_images WHERE product_id = $1', [newProductId]);

        res.status(201).json({
            success: true,
            message: 'Produk berhasil ditambahkan.',
            data: {
                ...completeProduct.rows[0],
                images: imagesList.rows,
            },
        });
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ success: false, message: 'Gagal menambahkan produk baru.' });
    }
}

/**
 * PATCH /api/products/:id (Admin / Super Admin Only)
 * Memperbarui info produk (harga, stok, berat gram, deskripsi, aktif/nonaktif)
 */
export async function updateProduct(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);
        const { category_id, name, slug, description, price, weight_grams, stock, is_active } = req.body;

        const check = await query('SELECT id, slug, name FROM products WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
            return;
        }

        const fields: string[] = [];
        const values: any[] = [];
        let index = 1;

        if (category_id !== undefined) {
            const catCheck = await query('SELECT id FROM categories WHERE id = $1', [category_id]);
            if (catCheck.rowCount === 0) {
                res.status(400).json({ success: false, message: 'Kategori tidak valid.' });
                return;
            }
            fields.push(`category_id = $${index++}`);
            values.push(category_id);
        }

        if (name !== undefined) {
            fields.push(`name = $${index++}`);
            values.push(name.trim());
        }

        if (slug !== undefined) {
            const cleanSlug = slugify(slug);
            const slugCheck = await query('SELECT id FROM products WHERE slug = $1 AND id != $2 AND deleted_at IS NULL', [cleanSlug, id]);
            if (slugCheck.rowCount > 0) {
                res.status(400).json({ success: false, message: `Slug '${cleanSlug}' sudah digunakan.` });
                return;
            }
            fields.push(`slug = $${index++}`);
            values.push(cleanSlug);
        }

        if (description !== undefined) {
            fields.push(`description = $${index++}`);
            values.push(description.trim());
        }

        if (price !== undefined) {
            fields.push(`price = $${index++}`);
            values.push(Number(price));
        }

        if (weight_grams !== undefined) {
            fields.push(`weight_grams = $${index++}`);
            values.push(Number(weight_grams));
        }

        if (stock !== undefined) {
            fields.push(`stock = $${index++}`);
            values.push(Number(stock));
        }

        if (is_active !== undefined) {
            fields.push(`is_active = $${index++}`);
            values.push(Boolean(is_active));
        }

        const hasImageUpdates = req.body.images !== undefined && Array.isArray(req.body.images);

        if (fields.length === 0 && !hasImageUpdates) {
            res.status(400).json({ success: false, message: 'Tidak ada data produk yang diperbarui.' });
            return;
        }

        if (fields.length > 0) {
            fields.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(id);

            const updateSql = `UPDATE products SET ${fields.join(', ')} WHERE id = $${index}`;
            await query(updateSql, values);
        } else {
            await query('UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
        }

        // Sinkronisasi galeri foto produk jika disertakan dalam payload
        if (hasImageUpdates) {
            const newImages: any[] = req.body.images;
            const currentImages = await query('SELECT id, image_url FROM product_images WHERE product_id = $1', [id]);

            const newUrls = new Set(
                newImages.map((img: any) => (typeof img === 'string' ? img.trim() : (img.image_url || '').trim())).filter(Boolean)
            );

            // 1. Hapus foto lama yang tidak ada lagi di daftar baru (hapus dari database dan fisik file di uploads/)
            for (const cur of currentImages.rows) {
                if (!newUrls.has(cur.image_url)) {
                    await query('DELETE FROM product_images WHERE id = $1', [cur.id]);
                    deleteFileIfExists(cur.image_url);
                }
            }

            // 2. Tambahkan gambar baru atau perbarui status is_primary
            const existingUrls = new Set(currentImages.rows.map(r => r.image_url));
            for (let i = 0; i < newImages.length; i++) {
                const img = newImages[i];
                const imgUrl = typeof img === 'string' ? img.trim() : (img.image_url || '').trim();
                const isPrimary = typeof img === 'object' && img.is_primary !== undefined ? Boolean(img.is_primary) : i === 0;

                if (imgUrl && !existingUrls.has(imgUrl)) {
                    await query(
                        'INSERT INTO product_images (product_id, image_url, is_primary) VALUES ($1, $2, $3)',
                        [id, imgUrl, isPrimary]
                    );
                } else if (imgUrl && typeof img === 'object' && img.is_primary !== undefined) {
                    await query('UPDATE product_images SET is_primary = $1 WHERE product_id = $2 AND image_url = $3', [
                        isPrimary,
                        id,
                        imgUrl,
                    ]);
                }
            }
        }

        const updated = await query('SELECT * FROM products WHERE id = $1', [id]);
        const productImages = await query(
            'SELECT id, image_url, is_primary FROM product_images WHERE product_id = $1 ORDER BY is_primary DESC, id ASC',
            [id]
        );

        res.json({
            success: true,
            message: 'Produk berhasil diperbarui.',
            data: {
                ...updated.rows[0],
                images: productImages.rows,
            },
        });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui produk.' });
    }
}

/**
 * DELETE /api/products/:id (Admin / Super Admin Only)
 * Soft-delete produk dari marketplace
 */
export async function deleteProduct(req: Request, res: Response): Promise<void> {
    try {
        const id = parseInt(req.params.id as string);

        const check = await query('SELECT id, name FROM products WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
            return;
        }

        await query('UPDATE products SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);

        // Bersihkan foto galeri produk dari storage
        const imagesResult = await query('SELECT image_url FROM product_images WHERE product_id = $1', [id]);
        for (const img of imagesResult.rows) {
            deleteFileIfExists(img.image_url);
        }
        await query('DELETE FROM product_images WHERE product_id = $1', [id]);

        res.json({
            success: true,
            message: `Produk '${check.rows[0].name}' berhasil dihapus.`,
        });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus produk.' });
    }
}

/**
 * POST /api/products/:id/images (Admin / Super Admin Only)
 * Menambahkan foto baru ke galeri produk
 */
export async function addProductImage(req: Request, res: Response): Promise<void> {
    try {
        const productId = parseInt(req.params.id as string);
        const { image_url, is_primary = false } = req.body;

        if (!image_url || !image_url.trim()) {
            res.status(400).json({ success: false, message: 'image_url wajib diisi.' });
            return;
        }

        const productCheck = await query('SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL', [productId]);
        if (productCheck.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
            return;
        }

        // Jika foto baru dijadikan foto utama, un-set primary foto lainnya
        if (is_primary) {
            await query('UPDATE product_images SET is_primary = false WHERE product_id = $1', [productId]);
        }

        await query(
            'INSERT INTO product_images (product_id, image_url, is_primary) VALUES ($1, $2, $3)',
            [productId, image_url.trim(), Boolean(is_primary)]
        );

        const images = await query(
            'SELECT id, image_url, is_primary FROM product_images WHERE product_id = $1 ORDER BY is_primary DESC, id ASC',
            [productId]
        );

        res.status(201).json({
            success: true,
            message: 'Foto berhasil ditambahkan ke galeri produk.',
            data: images.rows,
        });
    } catch (error) {
        console.error('Add product image error:', error);
        res.status(500).json({ success: false, message: 'Gagal menambahkan foto produk.' });
    }
}

/**
 * DELETE /api/products/images/:imageId (Admin / Super Admin Only)
 * Menghapus 1 foto dari galeri produk dan membersihkannya dari storage
 */
export async function deleteProductImage(req: Request, res: Response): Promise<void> {
    try {
        const imageId = parseInt(req.params.imageId as string);

        const check = await query('SELECT id, product_id, image_url FROM product_images WHERE id = $1', [imageId]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Foto tidak ditemukan.' });
            return;
        }

        await query('DELETE FROM product_images WHERE id = $1', [imageId]);

        // Hapus file fisik foto produk dari folder storage uploads
        deleteFileIfExists(check.rows[0].image_url);

        res.json({
            success: true,
            message: 'Foto berhasil dihapus dari galeri produk.',
        });
    } catch (error) {
        console.error('Delete product image error:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus foto produk.' });
    }
}

/**
 * PATCH /api/products/:id/images/:imageId/primary (Admin / Super Admin Only)
 * Menjadikan foto tertentu sebagai foto cover utama produk
 */
export async function setPrimaryProductImage(req: Request, res: Response): Promise<void> {
    try {
        const productId = parseInt(req.params.id as string);
        const imageId = parseInt(req.params.imageId as string);

        const check = await query('SELECT id FROM product_images WHERE id = $1 AND product_id = $2', [imageId, productId]);
        if (check.rowCount === 0) {
            res.status(404).json({ success: false, message: 'Foto tidak ditemukan pada produk ini.' });
            return;
        }

        // Reset semua foto menjadi bukan primary
        await query('UPDATE product_images SET is_primary = false WHERE product_id = $1', [productId]);

        // Set foto target menjadi primary
        await query('UPDATE product_images SET is_primary = true WHERE id = $1', [imageId]);

        const images = await query(
            'SELECT id, image_url, is_primary FROM product_images WHERE product_id = $1 ORDER BY is_primary DESC, id ASC',
            [productId]
        );

        res.json({
            success: true,
            message: 'Foto utama produk berhasil diperbarui.',
            data: images.rows,
        });
    } catch (error) {
        console.error('Set primary image error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui foto utama produk.' });
    }
}
