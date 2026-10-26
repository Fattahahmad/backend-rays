# Panduan Lengkap Pelacakan: Google Analytics 4 (GA4) & Meta Pixel + Conversions API (CAPI)

Dokumen ini adalah acuan resmi arsitektur pelacakan data pengunjung, durasi kunjungan, lokasi kota, serta pelacakan konversi iklan Meta (Facebook & Instagram) untuk ekosistem **Rays Autocare**.

---

## 1. Perbedaan & Pembagian Peran GA4 vs Meta Pixel

| Aspek | Google Analytics 4 (GA4) | Meta Pixel & Conversions API (CAPI) |
| :--- | :--- | :--- |
| **Fokus Utama** | **Research & Analitik Perilaku Pengunjung** | **Periklanan, Retargeting & Pengukuran Konversi** |
| **Data yang Dikumpulkan** | - Jumlah pengunjung aktif & live<br>- Durasi rata-rata di web (*session duration*)<br>- Sampai mana scroll/baca halaman (*engagement*)<br>- Kota/Provinsi asal (Jakarta, Bandung, dll)<br>- Halaman & produk terpopuler | - Pengunjung yang melihat produk (*ViewContent*)<br>- Pengunjung yang memasukkan produk ke cart (*AddToCart*)<br>- Pembeli yang berhasil membayar (*Purchase*)<br>- Calon customer yang klik tombol WhatsApp (*Lead*) |
| **Akses di Admin CMS** | **Ditarik langsung ke Admin CMS Rays** via Google Analytics Data API untuk grafik & tabel interaktif. | **Diolah di Meta Ads Manager** untuk mengoptimalkan algoritma iklan Facebook/Instagram Ads & rekomendasi produk dinamis. |
| **Proteksi Ad-Blocker** | Frontend Script (`gtag.js`) | **Dual Tracking:** Browser Pixel + Backend Server-to-Server (CAPI). Kebal dari ad-blocker & iOS privacy! |

---

## 2. Google Analytics 4 (GA4): Data Research & Rekomendasi Produk

Backend Rays Autocare menyediakan 2 endpoint untuk dashboard Admin CMS:

### A. Endpoint Realtime
- **URL:** `GET /api/analytics/realtime`
- **Akses:** Bearer Token (`admin`, `super_admin`)
- **Fungsi:** Menampilkan pengunjung live dalam 30 menit terakhir dan kota asalnya.

### B. Endpoint Overview & Tren
- **URL:** `GET /api/analytics/overview?days=7` (bisa `14`, `30`, `90`)
- **Akses:** Bearer Token (`admin`, `super_admin`)
- **Contoh Respons JSON:**
```json
{
  "success": true,
  "message": "Data ringkasan analitik (7 hari terakhir) berhasil diambil.",
  "data": {
    "periodDays": 7,
    "summary": {
      "totalUsers": 720,
      "sessions": 937,
      "pageViews": 2015,
      "averageSessionDurationSeconds": 154,
      "averageSessionDurationFormatted": "2 menit 34 detik",
      "bounceRate": 36.5,
      "engagementRate": 63.5
    },
    "topCities": [
      { "city": "Jakarta", "activeUsers": 324, "percentage": 45 },
      { "city": "Surabaya", "activeUsers": 144, "percentage": 20 },
      { "city": "Bandung", "activeUsers": 108, "percentage": 15 },
      { "city": "Tangerang", "activeUsers": 72, "percentage": 10 },
      { "city": "Semarang", "activeUsers": 72, "percentage": 10 }
    ],
    "topPages": [
      { "path": "/", "title": "Home - Bengkel Detailing & Autocare", "pageViews": 806 },
      { "path": "/kalkulator", "title": "Kalkulator Detailing", "pageViews": 504 },
      { "path": "/produk", "title": "Katalog Produk", "pageViews": 403 }
    ],
    "chart": [
      { "date": "20261001", "formattedDate": "01/10", "activeUsers": 110, "sessions": 143, "pageViews": 308 }
    ],
    "is_mock": false
  }
}
```

---

## 3. Meta Pixel & Meta Conversions API (CAPI)

Meta Conversions API (CAPI) memungkinkan pengiriman data interaksi langsung dari server backend ke server Meta via HTTPS POST. Ini menghasilkan data konversi yang jauh lebih presisi (akurasi 99%+).

### A. Alur Dual Tracking (Browser Pixel + Server CAPI)

1. **Frontend (Browser):**
   - Menjalankan script Meta Pixel `fbq`.
   - Mengirim event standar saat customer berinteraksi di browser.
2. **Backend (Server-Side CAPI):**
   - Saat customer **Checkout Keranjang Belanja** $\rightarrow$ Backend otomatis memicu event `InitiateCheckout`.
   - Saat pesanan **Berhasil Dibayar / Diubah ke `paid`** $\rightarrow$ Backend otomatis memicu event `Purchase`.
   - Saat customer menekan **Konsultasi WhatsApp** $\rightarrow$ Frontend memanggil endpoint proxy backend `POST /api/analytics/meta-event` dengan event `Lead`.
3. **Deduplikasi Otomatis:**
   - Backend menggunakan `order_number` sebagai `event_id`. Meta secara otomatis menggabungkan event dari browser dan server sehingga tidak terjadi hitung ganda!

---

## 4. Konfigurasi Environment (`.env`)

Tambahkan variabel berikut pada file `.env` di backend:

```env
# ==============================================================
# Google Analytics 4 (GA4)
# ==============================================================
GA4_PROPERTY_ID=123456789
GA4_CLIENT_EMAIL=rays-analytics-service@project-name.iam.gserviceaccount.com
GA4_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgk...\n-----END PRIVATE KEY-----\n"

# ==============================================================
# Meta Pixel & Conversions API (CAPI)
# ==============================================================
META_PIXEL_ID=123456789012345
META_ACCESS_TOKEN=EAAG...your_meta_system_user_token_here
META_TEST_EVENT_CODE=TEST12345 # Opsional: Isi kode uji coba dari Meta Events Manager Test Events Tab
```

> **Catatan Simulator:**
> Jika `META_PIXEL_ID` atau `META_ACCESS_TOKEN` belum diisi, backend otomatis masuk ke mode simulasi (`simulated: true`) sehingga aplikasi tetap berjalan lancar tanpa error koneksi.

---

## 5. Panduan Implementasi di Frontend (React / Next.js)

### A. Pemasangan Meta Pixel di `layout.tsx` / `_document.tsx`

```tsx
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '123456789012345';

  return (
    <html lang="id">
      <head>
        <Script
          id="meta-pixel-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${PIXEL_ID}');
              fbq('track', 'PageView');
            `,
          }}
        />
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

### B. Tracking Event Saat Customer Klik Tombol "Konsultasi WhatsApp" (Lead)

Ketika pengunjung mengklik tombol WhatsApp untuk reservasi salon/detailing:

```tsx
// Komponen Tombol WhatsApp
export function WhatsAppBookingButton({ packageName, estimatedPrice }: { packageName: string; estimatedPrice: number }) {
  const handleWhatsAppClick = async () => {
    // 1. Trigger Pixel di browser
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'Lead', {
        content_name: packageName,
        value: estimatedPrice,
        currency: 'IDR',
      });
    }

    // 2. Teruskan ke Backend CAPI Proxy (Anti Ad-blocker)
    try {
      await fetch('http://localhost:3001/api/analytics/meta-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName: 'Lead',
          eventSourceUrl: window.location.href,
          customData: {
            content_name: packageName,
            value: estimatedPrice,
            currency: 'IDR',
          },
        }),
      });
    } catch (e) {
      console.error('Failed to log lead CAPI event', e);
    }

    // 3. Arahkan ke WhatsApp
    const message = encodeURIComponent(`Halo Rays Autocare, saya ingin konsultasi paket ${packageName}.`);
    window.open(`https://wa.me/6281234567890?text=${message}`, '_blank');
  };

  return (
    <button onClick={handleWhatsAppClick} className="btn-whatsapp">
      Konsultasi via WhatsApp
    </button>
  );
}
```

---

### C. Tracking Event Saat Customer Melihat Produk (`ViewContent`)

```tsx
useEffect(() => {
  if (product && typeof window !== 'undefined' && (window as any).fbq) {
    (window as any).fbq('track', 'ViewContent', {
      content_name: product.name,
      content_ids: [product.id],
      content_type: 'product',
      value: product.price,
      currency: 'IDR',
    });
  }
}, [product]);
```

---

### D. Tracking Pembelian E-Commerce (`Purchase`)
Untuk transaksi belanja produk marketplace:
- Begitu order dibuat, Backend Rays otomatis mengeksekusi `InitiateCheckout` ke Meta CAPI.
- Begitu admin mengubah status pesanan menjadi `paid` (atau pembayaran terverifikasi), Backend Rays otomatis mengirimkan event `Purchase` lengkap dengan nilai transaksi (`grand_total`), nomor order, dan data terenkripsi SHA-256.

---

## 6. Ringkasan Endpoint Terkait

| Endpoint | Method | Role | Keterangan |
| :--- | :--- | :--- | :--- |
| `/api/analytics/realtime` | `GET` | Admin / Super Admin | Pengunjung live (30 menit terakhir) & kota asal |
| `/api/analytics/overview` | `GET` | Admin / Super Admin | Tren pengunjung, durasi kunjungan rata-rata, bounce rate, top kota |
| `/api/analytics/meta-event` | `POST` | Public | Proxy pengiriman event Meta CAPI dari Frontend (Lead, WhatsApp click) |
