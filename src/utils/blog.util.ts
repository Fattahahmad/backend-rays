import sanitizeHtml from 'sanitize-html';

/**
 * Konfigurasi sanitasi HTML untuk editor Tiptap / WYSIWYG
 * Menjaga elemen kaya teks, heading, gambar, dan tabel tetap utuh,
 * sekaligus membuang script, iframe berbahaya, dan inline event handlers (XSS).
 */
export function sanitizeArticleHtml(rawHtml: string): string {
    if (!rawHtml || typeof rawHtml !== 'string') return '';

    return sanitizeHtml(rawHtml, {
        allowedTags: [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'p', 'br', 'hr',
            'b', 'i', 'strong', 'em', 'strike', 's', 'del', 'u', 'sub', 'sup',
            'a', 'ul', 'ol', 'nl', 'li',
            'blockquote', 'pre', 'code',
            'img', 'figure', 'figcaption',
            'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
            'div', 'span',
        ],
        allowedAttributes: {
            a: ['href', 'name', 'target', 'rel', 'title', 'class'],
            img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'class', 'style'],
            '*': ['class', 'id', 'data-*'],
            th: ['scope', 'colspan', 'rowspan'],
            td: ['colspan', 'rowspan'],
        },
        allowedSchemes: ['http', 'https', 'data', 'mailto'],
        transformTags: {
            // Pastikan setiap link eksternal memiliki rel noopener noreferrer
            a: (tagName, attribs) => {
                if (attribs.href && !attribs.href.startsWith('/') && !attribs.href.startsWith('#')) {
                    attribs.rel = 'noopener noreferrer';
                }
                return { tagName, attribs };
            },
            // Pastikan setiap tag img memiliki loading="lazy" dan decoding="async" jika belum ada
            img: (tagName, attribs) => {
                if (!attribs.loading) {
                    attribs.loading = 'lazy';
                }
                if (!attribs.decoding) {
                    attribs.decoding = 'async';
                }
                return { tagName, attribs };
            },
        },
    });
}

/**
 * Helper untuk membuat URL slug yang rapi dan SEO-friendly
 */
export function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')        // Ganti spasi dengan -
        .replace(/[^\w\-]+/g, '')    // Hapus karakter non-alfanumerik
        .replace(/\-\-+/g, '-')      // Ganti ganda - dengan tunggal
        .replace(/^-+/, '')          // Pangkas - di awal
        .replace(/-+$/, '');         // Pangkas - di akhir
}

/**
 * Menghitung estimasi waktu membaca artikel dalam hitungan menit
 * Rata-rata kecepatan membaca adalah ~200 kata per menit
 */
export function calculateReadingTime(contentHtml: string): number {
    if (!contentHtml) return 1;
    const plainText = contentHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = plainText.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
}

/**
 * Mengekstrak teks ringkasan (excerpt) otomatis dari konten HTML jika excerpt kosong
 */
export function extractExcerpt(contentHtml: string, maxLength = 160): string {
    if (!contentHtml) return '';
    const plainText = contentHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (plainText.length <= maxLength) return plainText;
    return plainText.substring(0, maxLength).trim() + '...';
}

/**
 * Mengekstrak seluruh URL gambar yang digunakan di dalam konten HTML artikel
 */
export function extractImageUrls(contentHtml: string): string[] {
    if (!contentHtml) return [];
    const urls: string[] = [];
    const regex = /<img[^>]+src=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(contentHtml)) !== null) {
        if (match[1]) {
            urls.push(match[1]);
        }
    }
    return Array.from(new Set(urls));
}

export interface FaqItem {
    question: string;
    answer: string;
}

/**
 * Menghasilkan Schema.org JSON-LD lengkap untuk optimasi SEO dan GEO (AI Overviews)
 */
export function generateArticleJsonLd(article: {
    title: string;
    slug: string;
    meta_description?: string | null;
    excerpt?: string | null;
    thumbnail_url?: string | null;
    created_at: string | Date;
    updated_at: string | Date;
    author_name: string;
    author_avatar?: string | null;
    category?: string | null;
    tags?: any;
    faqs?: any;
    canonical_url?: string | null;
}): Record<string, any> {
    const siteUrl = process.env.CLIENT_URL || 'https://raysautocare.com';
    const articleUrl = article.canonical_url || `${siteUrl}/blog/${article.slug}`;

    const tagsList = Array.isArray(article.tags)
        ? article.tags
        : (typeof article.tags === 'string' ? JSON.parse(article.tags || '[]') : []);

    const faqsList: FaqItem[] = Array.isArray(article.faqs)
        ? article.faqs
        : (typeof article.faqs === 'string' ? JSON.parse(article.faqs || '[]') : []);

    const schema: Record<string, any> = {
        '@context': 'https://schema.org',
        '@graph': [
            // 1. TechArticle / Article Schema
            {
                '@type': 'TechArticle',
                '@id': `${articleUrl}#article`,
                isPartOf: {
                    '@type': 'WebPage',
                    '@id': articleUrl,
                    url: articleUrl,
                    name: article.title,
                },
                headline: article.title,
                description: article.meta_description || article.excerpt || article.title,
                image: article.thumbnail_url ? [article.thumbnail_url] : undefined,
                datePublished: new Date(article.created_at).toISOString(),
                dateModified: new Date(article.updated_at).toISOString(),
                author: {
                    '@type': 'Person',
                    name: article.author_name || 'Rays Auto Care Editorial Team',
                    image: article.author_avatar || undefined,
                },
                publisher: {
                    '@type': 'Organization',
                    name: 'Rays Auto Care',
                    url: siteUrl,
                    logo: {
                        '@type': 'ImageObject',
                        url: `${siteUrl}/images/logo.png`,
                    },
                },
                mainEntityOfPage: articleUrl,
                articleSection: article.category || 'Otomotif & Auto Detailing',
                keywords: tagsList.join(', '),
                inLanguage: 'id-ID',
            },
            // 2. BreadcrumbList Schema
            {
                '@type': 'BreadcrumbList',
                '@id': `${articleUrl}#breadcrumb`,
                itemListElement: [
                    {
                        '@type': 'ListItem',
                        position: 1,
                        name: 'Beranda',
                        item: siteUrl,
                    },
                    {
                        '@type': 'ListItem',
                        position: 2,
                        name: 'Blog',
                        item: `${siteUrl}/blog`,
                    },
                    {
                        '@type': 'ListItem',
                        position: 3,
                        name: article.title,
                        item: articleUrl,
                    },
                ],
            },
        ],
    };

    // 3. Tambahkan FAQPage Schema jika artikel memiliki FAQ (Sangat disukai AI Search & Google Rich Snippets)
    if (faqsList.length > 0) {
        schema['@graph'].push({
            '@type': 'FAQPage',
            '@id': `${articleUrl}#faq`,
            mainEntity: faqsList.map((faq) => ({
                '@type': 'Question',
                name: faq.question,
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: faq.answer,
                },
            })),
        });
    }

    return schema;
}

