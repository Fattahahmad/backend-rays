import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { query } from '../src/config/db.ts';

dotenv.config();

async function seed() {
    console.log('=== [START] SEEDING DATABASE RAYS AUTOCARE ===\n');

    try {
        // -------------------------------------------------------------
        // 1. SEED PENGGUNA: SUPER ADMIN, ADMIN, & CUSTOMER DEMO
        // -------------------------------------------------------------
        console.log('1. Memeriksa & membuat akun pengguna default...');

        const defaultSeedPass = process.env.DEFAULT_SEED_PASSWORD || 'DevTesting2026!';

        const usersToSeed = [
            {
                name: process.env.SUPER_ADMIN_NAME || 'Super Administrator Rays',
                email: (process.env.SUPER_ADMIN_EMAIL || 'superadmin@raysautocare.com').toLowerCase().trim(),
                password: process.env.SUPER_ADMIN_PASSWORD || defaultSeedPass,
                role: 'super_admin',
            },
            {
                name: process.env.ADMIN_NAME || 'Admin Operasional Rays',
                email: (process.env.ADMIN_EMAIL || 'admin@raysautocare.com').toLowerCase().trim(),
                password: process.env.ADMIN_PASSWORD || defaultSeedPass,
                role: 'admin',
            },
            {
                name: process.env.DEMO_USER_NAME || 'Customer Demo',
                email: (process.env.DEMO_USER_EMAIL || 'customer@raysautocare.com').toLowerCase().trim(),
                password: process.env.DEMO_USER_PASSWORD || defaultSeedPass,
                role: 'user',
            },
        ];

        for (const u of usersToSeed) {
            const check = await query('SELECT id, email, role FROM users WHERE email = $1', [u.email]);
            const hashedPassword = await bcrypt.hash(u.password, 10);

            if (check.rowCount === 0) {
                await query(
                    `INSERT INTO users (name, email, password, role, is_email_verified)
                     VALUES ($1, $2, $3, $4, true)`,
                    [u.name, u.email, hashedPassword, u.role]
                );
                console.log(`   [+] User dibuat: ${u.email} (Role: ${u.role})`);
            } else {
                // Update password dan pastikan is_email_verified = true
                await query(
                    `UPDATE users 
                     SET name = $1, password = $2, role = $3, is_email_verified = true, updated_at = CURRENT_TIMESTAMP
                     WHERE email = $4`,
                    [u.name, hashedPassword, u.role, u.email]
                );
                console.log(`   [*] User diperbarui: ${u.email} (Role: ${u.role})`);
            }
        }

        // -------------------------------------------------------------
        // 2. SEED KATEGORI PRODUK
        // -------------------------------------------------------------
        console.log('\n2. Memeriksa kategori produk...');
        const categoriesToSeed = [
            { name: 'Car Wash & Shampoo', slug: 'car-wash-shampoo' },
            { name: 'Paint Protection & Coating', slug: 'paint-protection-coating' },
            { name: 'Interior Detailing', slug: 'interior-detailing' },
            { name: 'Towel & Microfiber', slug: 'towel-microfiber' },
        ];

        const categoryMap: Record<string, number> = {};
        for (const cat of categoriesToSeed) {
            const check = await query('SELECT id FROM categories WHERE slug = $1', [cat.slug]);
            if (check.rowCount === 0) {
                const ins = await query(
                    'INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id',
                    [cat.name, cat.slug]
                );
                categoryMap[cat.slug] = ins.rows[0].id;
                console.log(`   [+] Kategori dibuat: "${cat.name}"`);
            } else {
                categoryMap[cat.slug] = check.rows[0].id;
                console.log(`   [=] Kategori siap: "${cat.name}"`);
            }
        }

        // -------------------------------------------------------------
        // 3. SEED PRODUK KATALOG MARKETPLACE
        // -------------------------------------------------------------
        console.log('\n3. Memeriksa produk katalog marketplace...');
        const productsToSeed = [
            {
                categorySlug: 'car-wash-shampoo',
                name: 'Rays Ultra Foam pH-Neutral Shampoo (1 Liter)',
                slug: 'rays-ultra-foam-ph-neutral-shampoo-1l',
                description: 'Formula busa tebal ber-pH seimbang 7.0 yang aman untuk lapisan coating dan tidak mengikis wax.',
                price: 135000,
                weight_grams: 1100,
                stock: 45,
                image: '/uploads/products/rays_shampoo_front.jpg',
            },
            {
                categorySlug: 'paint-protection-coating',
                name: 'Rays Graphene Spray Coating 250ml',
                slug: 'rays-graphene-spray-coating-250ml',
                description: 'Proteksi kilap hydrophobic hingga 6 bulan dengan teknologi graphene murni tahan water spot.',
                price: 220000,
                weight_grams: 350,
                stock: 35,
                image: '/uploads/products/graphene_coating.jpg',
            },
            {
                categorySlug: 'towel-microfiber',
                name: 'Rays Microfiber Drying Towel 600GSM (40x60cm)',
                slug: 'rays-microfiber-drying-towel-600gsm',
                description: 'Kain microfiber serat rapat berdaya serap tinggi, tanpa serat tajam untuk mencegah swirl mark saat pengeringan.',
                price: 85000,
                weight_grams: 200,
                stock: 80,
                image: '/uploads/products/microfiber_drying.jpg',
            },
            {
                categorySlug: 'interior-detailing',
                name: 'Rays Leather & Interior Conditioner 200ml',
                slug: 'rays-leather-interior-conditioner-200ml',
                description: 'Perawatan jok kulit mobil anti UV yang mencegah retak-retak dan memberikan aroma kabin mewah.',
                price: 115000,
                weight_grams: 250,
                stock: 40,
                image: '/uploads/products/leather_cleaner.jpg',
            },
        ];

        for (const p of productsToSeed) {
            const catId = categoryMap[p.categorySlug];
            if (!catId) continue;

            const check = await query('SELECT id FROM products WHERE slug = $1', [p.slug]);
            let prodId: number;

            if (check.rowCount === 0) {
                const ins = await query(
                    `INSERT INTO products (category_id, name, slug, description, price, weight_grams, stock, is_active)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
                     RETURNING id`,
                    [catId, p.name, p.slug, p.description, p.price, p.weight_grams, p.stock]
                );
                prodId = ins.rows[0].id;
                console.log(`   [+] Produk dibuat: "${p.name}" (Rp ${p.price.toLocaleString()})`);
            } else {
                prodId = check.rows[0].id;
                console.log(`   [=] Produk siap: "${p.name}"`);
            }

            // Pasang gambar utama produk jika belum ada
            const checkImg = await query('SELECT id FROM product_images WHERE product_id = $1', [prodId]);
            if (checkImg.rowCount === 0) {
                await query(
                    `INSERT INTO product_images (product_id, image_url, is_primary)
                     VALUES ($1, $2, true)`,
                    [prodId, p.image]
                );
            }
        }

        // -------------------------------------------------------------
        // 4. SEED KUPON DISKON
        // -------------------------------------------------------------
        console.log('\n4. Memeriksa kupon diskon...');
        const couponsToSeed = [
            {
                code: 'WEDNESDAY10',
                discount_type: 'percentage',
                discount_value: 10,
                min_purchase: 100000,
                valid_days: JSON.stringify(['Wednesday']),
            },
            {
                code: 'DISKONHEMAT25K',
                discount_type: 'fixed_amount',
                discount_value: 25000,
                min_purchase: 200000,
                valid_days: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
            },
        ];

        for (const c of couponsToSeed) {
            const check = await query('SELECT id FROM coupons WHERE code = $1', [c.code]);
            if (check.rowCount === 0) {
                await query(
                    `INSERT INTO coupons (code, discount_type, discount_value, min_purchase, valid_days, is_active)
                     VALUES ($1, $2, $3, $4, $5, true)`,
                    [c.code, c.discount_type, c.discount_value, c.min_purchase, c.valid_days]
                );
                console.log(`   [+] Kupon dibuat: ${c.code}`);
            } else {
                console.log(`   [=] Kupon siap: ${c.code}`);
            }
        }

        // -------------------------------------------------------------
        // 5. SEED FAQS
        // -------------------------------------------------------------
        console.log('\n5. Memeriksa FAQ...');
        const faqsToSeed = [
            {
                question: 'Berapa lama proses pengerjaan Nano Ceramic Coating?',
                answer: 'Proses detailing dan curing coating memerlukan waktu sekitar 2 sampai 3 hari kerja tergantung kondisi cat awal kendaraan Anda.',
                category: 'detailing',
                order_index: 1,
            },
            {
                question: 'Apakah ada garansi setelah pengerjaan coating?',
                answer: 'Ya, kami menyediakan garansi kilap hingga 3 tahun dengan jadwal free maintenance berkala setiap 6 bulan.',
                category: 'garansi',
                order_index: 2,
            },
            {
                question: 'Apakah produk shampoo aman untuk mobil yang sudah dicoating?',
                answer: 'Sangat aman! Seluruh produk Rays Shampoo ber-pH seimbang 7.0 murni sehingga tidak merusak lapisan coating atau wax.',
                category: 'produk',
                order_index: 3,
            },
        ];

        for (const f of faqsToSeed) {
            const check = await query('SELECT id FROM faqs WHERE question = $1', [f.question]);
            if (check.rowCount === 0) {
                await query(
                    `INSERT INTO faqs (question, answer, category, order_index, is_active)
                     VALUES ($1, $2, $3, $4, true)`,
                    [f.question, f.answer, f.category, f.order_index]
                );
                console.log(`   [+] FAQ dibuat: "${f.question.slice(0, 40)}..."`);
            } else {
                console.log(`   [=] FAQ siap: "${f.question.slice(0, 40)}..."`);
            }
        }

        // -------------------------------------------------------------
        // 6. SEED PENGATURAN BISNIS & NOMOR WHATSAPP (CMS SETTINGS)
        // -------------------------------------------------------------
        console.log('\n6. Memeriksa pengaturan bisnis & nomor WhatsApp...');
        const settingsToSeed = [
            {
                key: 'whatsapp_number',
                value: '6281234567890',
                category: 'contact',
                description: 'Nomor WhatsApp resmi untuk tombol floating dan konsultasi reservasi detailing',
            },
            {
                key: 'workshop_address',
                value: 'Jl. Boulevard Sektor 7 No. 18, Bintaro, Tangerang Selatan',
                category: 'contact',
                description: 'Alamat fisik workshop bengkel detailing',
            },
            {
                key: 'company_email',
                value: 'info@raysautocare.com',
                category: 'contact',
                description: 'Alamat email resmi customer support',
            },
            {
                key: 'operational_hours',
                value: 'Senin - Sabtu: 08.00 - 17.00 WIB',
                category: 'general',
                description: 'Jam operasional workshop dan layanan detailing',
            },
            {
                key: 'instagram_url',
                value: 'https://instagram.com/raysautocare',
                category: 'social',
                description: 'Tautan akun resmi Instagram Rays Autocare',
            },
            {
                key: 'tiktok_url',
                value: 'https://tiktok.com/@raysautocare',
                category: 'social',
                description: 'Tautan akun resmi TikTok Rays Autocare',
            },
            {
                key: 'google_maps_url',
                value: 'https://maps.google.com/?q=Rays+Autocare+Bintaro',
                category: 'contact',
                description: 'Tautan lokasi Google Maps workshop',
            },
        ];

        for (const s of settingsToSeed) {
            const check = await query('SELECT `key` FROM settings WHERE `key` = $1', [s.key]);
            if (check.rowCount === 0) {
                await query(
                    `INSERT INTO settings (\`key\`, value, category, description, updated_at)
                     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
                    [s.key, s.value, s.category, s.description]
                );
                console.log(`   [+] Setting dibuat: ${s.key} = "${s.value}"`);
            } else {
                console.log(`   [=] Setting siap: ${s.key}`);
            }
        }

        // -------------------------------------------------------------
        // 9. SEED HERO & PROMO BANNERS
        // -------------------------------------------------------------
        console.log('9. Memeriksa & membuat banner promosi default...');
        const initialBanners = [
            {
                sort_order: 1,
                image_url: '/images/hero-detailing.jpeg',
                badge_text: 'PREMIUM DETAILING',
                title: 'ULTIMATE GRAPHENE CERAMIC COATING',
                button_show: true,
                button_text: 'BOOKING SEKARANG',
                button_url: '/services',
                is_active: true,
            },
            {
                sort_order: 2,
                image_url: '/images/hero-login.jpeg',
                badge_text: 'PROMO WEEKDAY',
                title: 'DISKON 20% INTERIOR DEEP CLEAN',
                button_show: true,
                button_text: 'LIHAT PROMO',
                button_url: '/promo',
                is_active: true,
            },
            {
                sort_order: 3,
                image_url: '/images/hero-store.jpeg',
                badge_text: 'OFFICIAL STORE',
                title: 'PRO CAR DETAILING CARE PRODUCTS',
                button_show: true,
                button_text: 'BELANJA SEKARANG',
                button_url: '/products',
                is_active: true,
            },
        ];

        for (const b of initialBanners) {
            const checkB = await query('SELECT id FROM banners WHERE title = $1', [b.title]);
            if (checkB.rowCount === 0) {
                await query(
                    `INSERT INTO banners (sort_order, image_url, badge_text, title, button_show, button_text, button_url, is_active)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [b.sort_order, b.image_url, b.badge_text, b.title, b.button_show, b.button_text, b.button_url, b.is_active]
                );
                console.log(`   [+] Banner dibuat: "${b.title}"`);
            }
        }

        // -------------------------------------------------------------
        // 10. SEED BLOG ARTIKEL & EDUKASI AUTO DETAILING
        // -------------------------------------------------------------
        console.log('10. Memeriksa & membuat artikel blog default...');
        const adminUser = await query("SELECT id FROM users WHERE role IN ('admin', 'super_admin') ORDER BY id ASC LIMIT 1");
        const authorId = adminUser.rows.length > 0 ? adminUser.rows[0].id : 1;

        const initialBlogs = [
            {
                title: 'Panduan Merawat Lapisan Nano Ceramic Coating Agar Tetap Hydrophobic & Mengkilap',
                slug: 'panduan-merawat-lapisan-nano-ceramic-coating',
                excerpt: 'Pelajari teknik mencuci 2 bucket method, pemilihan shampoo pH neutral, dan pantangan mencuci di bawah terik matahari untuk menjaga kilau coating mobil Anda.',
                image_url: '/uploads/blogs/blog-coating-care.jpg',
                is_published: true,
                content: `<h2>Mengapa Perawatan Coating Itu Krusial?</h2>
<p>Memiliki kendaraan dengan lapisan <strong>Nano Ceramic Coating</strong> memberikan kilau kaca (glass-like shine) yang memukau dan perlindungan cat dari sinar UV, jamur air (waterspot), serta swirl mark halus. Namun, coating bukanlah lapisan anti-gores permanen tanpa perawatan.</p>
<h3>1. Gunakan Teknik Mencuci 2 Bucket Method</h3>
<p>Untuk mencegah timbulnya baret halus (swirl mark), gunakan metode dua ember: satu ember berisi larutan <em>Rays Ultra Foam pH-Neutral Shampoo</em>, dan satu ember air bersih untuk membilas busa/sarung tangan cuci sebelum dicelupkan kembali.</p>
<h3>2. Hindari Shampoo dengan Wax Berat atau Detergen Keras</h3>
<p>Shampoo berbahan detergen keras dengan pH asam atau basa ekstrim dapat mengikis lapisan silika (SiO2) coating. Selalu gunakan shampoo khusus ber-pH 7 (Netral) seperti yang tersedia di Rays Autocare Store.</p>
<h3>3. Jangan Mengeringkan Mobil di Bawah Terik Matahari</h3>
<p>Tetesan air yang mengering karena panas matahari akan meninggalkan kerak mineral kalsium (waterspot). Keringkan selalu di area teduh menggunakan <em>Microfiber Drying Towel</em> dengan daya serap tinggi.</p>`,
            },
            {
                title: '5 Tanda Interior Mobil Anda Butuh Deep Cleaning & Sterilisasi Uap Panas',
                slug: '5-tanda-interior-mobil-butuh-deep-cleaning',
                excerpt: 'Mulai dari aroma apek kabin yang tak kunjung hilang, jok kulit mengilap karena minyak tubuh, hingga plafon bernoda. Kenali tanda interior butuh penanganan profesional.',
                image_url: '/uploads/blogs/blog-interior-detailing.jpg',
                is_published: true,
                content: `<h2>Kenyamanan Berkendara Dimulai Dari Kebersihan Kabin</h2>
<p>Banyak pemilik mobil hanya berfokus pada kilau eksterior, padahal 90% waktu kita dihabiskan di dalam interior kabin. Bakteri, jamur AC, dan tungau jok sering kali menjadi sumber penyakit pernapasan yang tak terlihat.</p>
<h3>1. Jok Kulit Nampak Mengkilap dan Terasa Licin</h3>
<p>Banyak yang salah mengira jok kulit yang mengilap itu bagus. Faktanya, kulit asli (Nappa / leather) memiliki tampilan <em>matte</em> elegan. Kilap yang muncul adalah akumulasi minyak keringat tubuh dan debu yang mengeras.</p>
<h3>2. Bau Apek Saat AC Pertama Kali Dinyalakan</h3>
<p>Jika hembusan AC pertama mengeluarkan aroma asam atau lembap, evaporator dan filter kabin sudah terinfeksi spora jamur yang membutuhkan <em>Nano Mist Fogging & Ozone Treatment</em>.</p>
<h3>3. Noda Plafon dan Sela-Sela Konsol Tengah</h3>
<p>Sisa tumpahan kopi, cipratan minuman manis, atau asap rokok di plafon membutuhkan pembersihan uap panas 140°C tanpa merusak lem kain plafon mobil.</p>`,
            },
            {
                title: 'Paint Protection Film (PPF) vs Ceramic Coating: Mana Pilihan Terbaik untuk Mobil Anda?',
                slug: 'ppf-vs-ceramic-coating-mana-pilihan-terbaik',
                excerpt: 'Bingung memilih antara proteksi fisik elastis TPU anti stone-chip (PPF) atau proteksi kimia kilap kristal (Ceramic Coating)? Simak komparasi mendalam kelebihan keduanya.',
                image_url: '/uploads/blogs/blog-ppf-vs-coating.jpg',
                is_published: true,
                content: `<h2>Dilema Terbesar Pemilik Mobil Baru</h2>
<p>Ketika baru saja menerima mobil impian dari dealer, pertanyaan pertama yang muncul adalah: <em>"Harus pasang PPF atau cukup Ceramic Coating saja?"</em> Keduanya memiliki teknologi dan fungsi perlindungan yang sangat berbeda.</p>
<h3>Perlindungan Fisik vs Perlindungan Kimia</h3>
<p><strong>Paint Protection Film (PPF)</strong> adalah lapisan film tebal (180-200 micron) berbahan TPU (Thermoplastic Polyurethane) yang memiliki kemampuan <em>self-healing</em> (sembuh sendiri saat terkena panas) dan melindungi cat dari kerikil jalanan (stone chips) serta goresan benda tajam.</p>
<p>Sementara <strong>Ceramic Coating</strong> adalah lapisan cair nanoteknologi silika (SiO2) yang meresap ke pori-pori pernis cat, memberikan kilap kaca basah (wet-look), perlindungan sinar UV, dan daya tolak air ekstrem (hydrophobic lotus leaf effect).</p>
<h3>Kombinasi Terbaik (The Ultimate Protection)</h3>
<p>Untuk proteksi sempurna, banyak pemilik supercars memilih mengaplikasikan PPF pada area rawan benturan (kap mesin, bumper depan, spion), lalu melapisi seluruh bodi mobil dengan Nano Ceramic Coating untuk kemudahan pencucian rutin.</p>`,
            },
        ];

        for (const blog of initialBlogs) {
            const checkBlog = await query('SELECT id FROM blogs WHERE slug = $1', [blog.slug]);
            if (checkBlog.rowCount === 0) {
                await query(
                    `INSERT INTO blogs (author_id, title, slug, excerpt, content, image_url, is_published)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [authorId, blog.title, blog.slug, blog.excerpt, blog.content, blog.image_url, blog.is_published]
                );
                console.log(`   [+] Blog dibuat: "${blog.title}"`);
            }
        }

        console.log('\n=== [SELESAI] SEEDING DATABASE BERHASIL 100% ===\n');
        console.log('Akun Super Admin, Admin, dan Customer demo siap digunakan.');
        process.exit(0);
    } catch (err: any) {
        console.error('\n[SEEDING ERROR]:', err);
        process.exit(1);
    }
}

seed();
