import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

export interface ProcessedImageResult {
    filename: string;
    relativeUrl: string;
    size: number;
    mimetype: string;
    width: number;
    height: number;
}

/**
 * Mengonversi buffer gambar dari format apa pun (JPG, PNG, BMP, TIFF, HEIC, AVIF, dll)
 * menjadi format .webp dengan kompresi teroptimasi.
 * 
 * Fitur:
 * 1. .rotate() -> Menyesuaikan orientasi EXIF kamera smartphone secara otomatis (agar foto tidak terbalik).
 * 2. .resize() -> Membatasi dimensi maksimum (default 1920x1920) agar tidak terjadi bloating dimensi.
 * 3. .webp({ quality: 80 }) -> Kompresi WebP kualitas 80% (mengurangi ukuran 70-85% dengan detail tetap tajam).
 * 4. Stripping EXIF -> Menghapus metadata geolokasi & kamera demi privasi dan ukuran ringan.
 * 5. SEO Filename -> Memberi nama file yang ramah keyword Google Image Search.
 */
export async function convertAndSaveToWebp(
    buffer: Buffer,
    folder: string = 'general',
    maxWidth: number = 1920,
    maxHeight: number = 1920,
    customBaseName?: string
): Promise<ProcessedImageResult> {
    const sanitizedFolder = folder.replace(/[^a-zA-Z0-9_\-]/g, '') || 'general';
    const targetDir = path.join(process.cwd(), 'uploads', sanitizedFolder);

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // Nama file ramah SEO jika ada customBaseName / alt text
    let namePrefix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    if (customBaseName && typeof customBaseName === 'string') {
        const cleanSlug = customBaseName
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .substring(0, 60);
        if (cleanSlug) {
            namePrefix = `${cleanSlug}-${Date.now().toString().slice(-6)}`;
        }
    }

    const filename = `${namePrefix}.webp`;
    const targetPath = path.join(targetDir, filename);

    // Proses konversi dan kompresi WebP
    const { data: processedBuffer, info } = await sharp(buffer)
        .rotate()
        .resize({
            width: maxWidth,
            height: maxHeight,
            fit: 'inside',
            withoutEnlargement: true,
        })
        .webp({ quality: 80, effort: 4 })
        .toBuffer({ resolveWithObject: true });

    fs.writeFileSync(targetPath, processedBuffer);

    return {
        filename,
        relativeUrl: `/uploads/${sanitizedFolder}/${filename}`,
        size: info.size,
        mimetype: 'image/webp',
        width: info.width,
        height: info.height,
    };
}

