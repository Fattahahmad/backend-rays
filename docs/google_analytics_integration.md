# Panduan Lengkap Integrasi Google Analytics 4 (GA4) - Backend & Frontend

Dokumen ini menjelaskan secara menyeluruh arsitektur, konfigurasi, dan cara penggunaan modul **Google Analytics 4** yang telah diterapkan pada `backend-rays`, serta panduan implementasinya di sisi **Frontend (FE)** baik untuk pelacakan pengunjung maupun rendering grafik di Dashboard Admin CMS.

---

## 1. Ringkasan & Apa yang Sudah Diterapkan di Backend

Backend telah dilengkapi dengan modul **Google Analytics Data API** resmi (`@google-analytics/data`):

| Endpoint API | Metode | Hak Akses | Deskripsi & Fungsi |
| :--- | :--- | :--- | :--- |
| `/api/analytics/realtime` | `GET` | `admin`, `super_admin` | Mengambil data pengguna aktif dalam **30 menit terakhir**, serta rincian negara dan kota asal pengunjung. Cocok untuk widget kartu live. |
| `/api/analytics/overview` | `GET` | `admin`, `super_admin` | Mengambil data deret waktu harian untuk **grafik tren** (tanggal vs pengguna & pageviews), ringkasan metrik total pengunjung, top 5 halaman paling banyak dilihat, top kota, dan sumber trafik (Google, Medsos, Direct). Mendukung parameter `?days=7`, `?days=14`, atau `?days=30`. |

### Fitur Unggulan Backend (Smart Fallback Mock Data)
Jika kamu atau tim pengembang belum sempat menyiapkan kredensial Google Cloud di file `.env`, backend **tidak akan error atau crash**. Backend otomatis menyuplai **data simulasi realistis** (`is_mock: true`) sehingga tim Frontend dapat langsung membuat dan menguji grafik dashboard tanpa terhambat! Begitu kredensial diisi, backend otomatis beralih ke data live dari Google Analytics.

---

## 2. Langkah Setup Kunci Google Cloud & GA4 (Sekali Setup)

Untuk menghubungkan backend ke properti GA4 Rays Autocare secara live, ikuti 4 langkah mudah berikut:

### Langkah A: Buat Service Account di Google Cloud Console
1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Buat project baru (misal: `Rays Autocare Analytics`).
3. Pada menu pencarian atas, cari **Google Analytics Data API**, lalu klik **Enable** (Aktifkan).
4. Masuk ke menu **IAM & Admin** $\rightarrow$ **Service Accounts** $\rightarrow$ Klik **Create Service Account**.
   - Beri nama: `rays-analytics-service`.
   - Klik **Create and Continue**, lalu klik **Done**.
5. Klik pada email service account yang baru dibuat $\rightarrow$ Buka tab **Keys** $\rightarrow$ Klik **Add Key** $\rightarrow$ **Create new key** $\rightarrow$ Pilih **JSON** $\rightarrow$ Klik **Create**.
6. File `.json` akan otomatis terunduh ke komputermu. Buka file tersebut, kamu akan melihat kolom `client_email` dan `private_key`.

### Langkah B: Beri Izin Service Account di Google Analytics
1. Buka dashboard [Google Analytics](https://analytics.google.com/).
2. Di pojok kiri bawah, klik menu **Admin (Ikon Gerigi)**.
3. Pada kolom *Property*, klik **Property Access Management**.
4. Klik tombol tanda tambah biru `+` di kanan atas $\rightarrow$ Pilih **Add users**.
5. Masukkan email service account tadi (contoh: `rays-analytics-service@...iam.gserviceaccount.com`).
6. Beri hak akses (role): **Viewer** (hanya membaca, sangat aman).
7. Klik **Add**.

### Langkah C: Ambil Property ID GA4
1. Masih di menu Admin Google Analytics $\rightarrow$ Klik **Property Settings** (Detail Properti).
2. Di pojok kanan atas, kamu akan melihat **PROPERTY ID** (berupa angka 9-10 digit, contoh: `429182391`). Catat angka ini.

### Langkah D: Pasang di File `.env` Backend
Buka file `.env` di `backend-rays`, lalu tambahkan konfigurasi berikut:
```env
# Google Analytics 4 (GA4) Configuration
GA4_PROPERTY_ID=429182391
GA4_CLIENT_EMAIL=rays-analytics-service@project-name.iam.gserviceaccount.com
GA4_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```
*(Catatan: Karakter baris baru `\n` pada `private_key` tetap dipertahankan di dalam tanda petik dua).*

---

## 3. Cara Penggunaan di Frontend (FE)

Integrasi di sisi Frontend terbagi menjadi dua kebutuhan:

### A. Untuk Web Publik (Pelacakan Pengunjung & Event Kalkulator)

#### 1. Pasang Script Pelacak di `<head>` Website
Cukup letakkan script Google Tag ini di file utama web publik (misal `index.html` atau layout utama Next.js/React):

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-XXXXXXXXXX'); // Masukkan Measurement ID GA4 Rays Autocare kamu
</script>
```

#### 2. Melacak Event Saat Customer Menggunakan Kalkulator Detailing
Ketika customer selesai memilih mobil di kalkulator dan mengklik tombol **"Konsultasi via WhatsApp"**, panggil fungsi `gtag` berikut:

```javascript
// Contoh pemanggilan saat tombol 'Lanjut WhatsApp' ditekan
function onConsultWhatsAppClick(calcData) {
    if (typeof window.gtag === 'function') {
        window.gtag('event', 'lead_detailing_calculator', {
            vehicle_type: calcData.vehicleType,       // misal: 'SUV'
            vehicle_brand: calcData.brand,            // misal: 'Toyota'
            vehicle_model: calcData.model,            // misal: 'Fortuner'
            vehicle_color: calcData.color,            // misal: 'Hitam'
            vehicle_age: calcData.age,                // misal: 'Diatas 10 Tahun'
            package_chosen: calcData.packageName,     // misal: 'Signature Coating'
            estimated_price: calcData.estimatedPrice, // misal: 3500000
        });
    }

    // Lanjutkan redirect ke URL WhatsApp API
    window.open(`https://wa.me/6281234567890?text=${encodeURIComponent(calcData.message)}`, '_blank');
}
```

---

### B. Untuk Dashboard Admin CMS (Menampilkan Grafik & Angka Realtime)

Di halaman Admin CMS, frontend memanggil endpoint backend yang telah kita buat.

#### 1. Memanggil Data dari Backend
```javascript
// Mengambil data ringkasan grafik mingguan
async function getAnalyticsOverview(days = 7, adminToken) {
    const response = await fetch(`http://localhost:3001/api/analytics/overview?days=${days}`, {
        headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
        }
    });
    const result = await response.json();
    return result.data; // Berisi: summary, chart, topPages, topCities, topSources
}

// Mengambil data pengunjung live 30 menit terakhir
async function getRealtimeUsers(adminToken) {
    const response = await fetch('http://localhost:3001/api/analytics/realtime', {
        headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
        }
    });
    const result = await response.json();
    return result.data; // Berisi: activeUsers30Min, countries, cities
}
```

#### 2. Contoh Komponen Tampilan (React / Next.js) dengan Chart.js
Berikut adalah contoh komponen siap pakai yang menggambar kartu realtime dan grafik tren:

```jsx
import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function AnalyticsDashboard({ token }) {
    const [realtime, setRealtime] = useState(null);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        try {
            const [rtRes, ovRes] = await Promise.all([
                fetch('http://localhost:3001/api/analytics/realtime', {
                    headers: { Authorization: `Bearer ${token}` }
                }).then(r => r.json()),
                fetch('http://localhost:3001/api/analytics/overview?days=7', {
                    headers: { Authorization: `Bearer ${token}` }
                }).then(r => r.json())
            ]);

            setRealtime(rtRes.data);
            setOverview(ovRes.data);
        } catch (err) {
            console.error('Error fetching analytics:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // Polling data realtime setiap 30 detik
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, [token]);

    if (loading) return <div>Memuat analitik pengunjung...</div>;

    // Menyiapkan dataset untuk Grafik Garis Biru (seperti di Google Analytics)
    const chartData = {
        labels: overview.chart.map(item => item.formattedDate),
        datasets: [
            {
                label: 'Pengguna Aktif',
                data: overview.chart.map(item => item.activeUsers),
                borderColor: '#0284c7', // Warna biru khas GA4
                backgroundColor: 'rgba(2, 132, 199, 0.1)',
                fill: true,
                tension: 0.35,
                borderWidth: 2,
                pointRadius: 4,
            }
        ]
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', padding: '24px' }}>
            {/* KARTU GRAFIK TREN 7 HARI */}
            <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '18px' }}>Tren Kunjungan Website (7 Hari)</h3>
                        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
                            Total Pengunjung: <strong>{overview.summary.totalUsers.toLocaleString()}</strong> | 
                            Pageviews: <strong>{overview.summary.pageViews.toLocaleString()}</strong>
                        </p>
                    </div>
                </div>
                <div style={{ height: '260px' }}>
                    <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
                </div>
            </div>

            {/* KARTU WIDGET REALTIME */}
            <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14px', textTransform: 'uppercase', color: '#64748b' }}>
                    Pengguna Aktif (30 Menit Terakhir)
                </h4>
                <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {realtime.activeUsers30Min}
                    <span style={{ width: '12px', height: '12px', background: '#22c55e', borderRadius: '50%', display: 'inline-block' }} />
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 20px' }}>Pengunjung sedang berselancar di web saat ini</p>

                <h5 style={{ margin: '0 0 8px', fontSize: '13px' }}>Asal Kota Pengunjung:</h5>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px' }}>
                    {realtime.cities.map((c, i) => (
                        <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <span>{c.city}</span>
                            <strong>{c.activeUsers} orang</strong>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
```

---

## 4. Pengujian dengan Postman

Endpoint ini sudah didaftarkan ke [postman_collection.json](file:///c:/Users/USER/Documents/backend-rays/postman_collection.json) pada folder **`12. Google Analytics (CMS Dashboard)`**:

1. **Get Realtime Active Users (30 Min)**:
   - Request: `GET {{baseUrl}}/analytics/realtime`
   - Header: `Authorization: Bearer {{accessToken}}` (Role: Admin / Super Admin)
2. **Get Overview & Trend Chart**:
   - Request: `GET {{baseUrl}}/analytics/overview?days=7`
   - Header: `Authorization: Bearer {{accessToken}}` (Role: Admin / Super Admin)
