# Spesifikasi & Blueprint: Kalkulator Layanan Auto Detailing (Rays Autocare)

Dokumen ini mencatat seluruh rancangan logika, struktur harga, dan tahapan kalkulator interaktif berdasarkan desain Figma resmi Rays Autocare. Disimpan sebagai acuan teknis saat daftar lengkap master mobil (*car database*) sudah siap.

---

## 1. Konsep Utama & Alur Sistem
* **Tidak Ada Transaksi di Database**: Reservasi layanan detailing tidak disimpan di database backend.
* **Integrasi WhatsApp**: Tombol akhir kalkulator langsung membuka tautan resmi WhatsApp (`wa.me`) dengan format teks yang sudah terisi otomatis sesuai pilihan customer di kalkulator.
* **Sistem Perhitungan**: Menggunakan sistem *Base Price + Surcharges (Faktor Koreksi Cat)*.

---

## 2. Rincian 6 Langkah Kalkulator (Berdasarkan Figma)

### Step 01: Merek & Kategori Mobil (Ukuran Kendaraan)
* **Pilihan Merek Populer**: Toyota, Honda, Mitsubishi, Hyundai, BMW, Mercedes, Porsche, Lainnya.
* **Input Teks Model (Opsional)**: `Cth: Honda HR-V 1.5 RS Turbo 2022 / Toyota Fortuner VRZ`.
* **Kategori Ukuran & Biaya Tambahan**:
  1. **Small Car** (*Base Rate* / +Rp 0):
     * *Contoh*: Brio, Yaris, Jazz, Raize, Mazda 2, Ignis, Mini Cooper, Ioniq 5.
  2. **Medium Car** (+Rp 150.000):
     * *Contoh*: Civic, Corolla Altis, HR-V, CX-5, Seri 3, C-Class, Creta.
  3. **Large Car** (+Rp 300.000):
     * *Contoh*: Fortuner, Pajero Sport, Alphard, Land Cruiser, Seri 7, S-Class.
  4. **Supercar / Exotic** (+Rp 600.000):
     * *Special Handling Master Detailing*.
     * *Contoh*: Porsche 911, Ferrari, Lamborghini, Aston Martin, GT-R.
  > *(Catatan: Daftar master mobil lengkap akan diisi saat data dari klien sudah tersedia).*

---

### Step 02: Tahun / Usia Kendaraan (Faktor Koreksi Cat & Oksidasi)
1. **2017 – 2026 (Baru s/d Remaja) [< 10 Tahun]**: **+Rp 0 (Standar)**
   * *Keterangan*: Kondisi cat relatif baru, oksidasi ringan hingga sedang. Penanganan standar *dual-action micro-cut*.
2. **2007 – 2016 (Kendaraan Dewasa) [10 – 19 Tahun]**: **+Rp 150.000**
   * *Keterangan*: Oksidasi membandel, swirl marks akumulatif, waterspot kaca tebal. Memerlukan *compound heavy-cut multi-stage*.
3. **< 2006 (Klasik / Retro / Koleksi) [20+ Tahun]**: **+Rp 350.000**
   * *Keterangan*: *Single-stage paint* atau cat tua rapuh. Memerlukan *glaze* khusus non-abrasif dan penanganan ultra-hati-hati oleh *master tech*.

---

### Step 03: Warna Cat Mobil (Tingkat Kesulitan Koreksi & Refleksi)
1. **Solid Black / Dark**: **+Rp 150.000 (Tingkat Sulit)**
   * *Warna*: Hitam pekat, Midnight Blue.
   * *Penanganan*: Memerlukan *finishing* ekstra *micro-cut jeweling* untuk menghilangkan bayangan hologram.
2. **Metallic / Pearl**: **Rp 0 (Standar)**
   * *Warna*: Abu-abu gelap metallic, Merah candy, Biru metallic, Pearl White.
3. **Light Colors**: **Rp 0 (Standar)**
   * *Warna*: Solid White, Silver, Light Gold, Cream. Fokus *de-yellowing* & waterspot.
4. **Matte / Satin Finish**: **+Rp 200.000 (Khusus Doff)**
   * *Keterangan*: Dilarang poles abrasi; memerlukan pembersih khusus dengan pH netral.

---

### Step 04: Paket Detailing Utama (Core Services)

| Paket | Harga Dasar | Durasi | Deskripsi Singkat |
| :--- | :--- | :--- | :--- |
| **Basic Detailing** *(Entry Grade)* | Mulai Rp 350.000 | 3–4 Jam | Pembersihan komprehensif 3 Zona: Interior deep vacuum & trim wipe, Eksterior wash & high-gloss spray wax, Engine Bay degreasing ringan. |
| **Reguler Detailing** *(Deep Cleansing)* | Mulai Rp 650.000 | 5–6 Jam | Pembersihan mendalam Interior, Eksterior, Mesin + Dekontaminasi Clay Bar, Waterspot removal kaca, Undercarriage rim wash. |
| **Premium Detailing** *(Flagship Paint Restoration)* | Mulai Rp 900.000 | 1–2 Hari (Full Lab) | Restorasi total: Multi-Stage Paint Correction (hilangkan swirl mark 85–95%) + Synthetic Hydrophobic Sealant pelindung 6 bulan. |
| **Nano Burn Headlamp** *(Restorasi Mika Lampu)* | Rp 500.000 Flat | 2 Jam (Sepasang) | Penguapan aseton polimer mengembalikan mika kusam/menguning menjadi sejernih kaca baru OEM. |

> ⚠️ **ATURAN KHUSUS (DAY ONE POLICY):**
> * Jika mobil berwarna **Solid Black / Dark** ATAU usia kendaraan **10 Tahun ke atas (2016 ke bawah)**, paket **Basic Detailing TIDAK DIREKOMENDASIKAN** (diberi tanda peringatan edukasi di kalkulator).
> * Alasan: Cat hitam dan cat berusia >10 tahun memiliki oksidasi serta swirl mark yang tidak bisa diangkat hanya dengan 1-Step Polish Basic. Pelanggan diarahkan minimal memilih **Reguler Detailing (3-Step Polish)**.

---

### Step 05: Layanan Tambahan (Add-On Treatment - Opsional/Checkbox)
1. **Instant Coating**: **+Rp 300.000** *(Lapisan ceramic semprot instan untuk proteksi kilap dan water-beading ekstra).*
2. **Buka Jok Mobil**: **+Rp 200.000** *(Bongkar pasang jok depan/tengah untuk membersihkan sela rel dan kotoran tersembunyi).*
3. **Buka Karpet Dasar**: **+Rp 400.000** *(Angkat karpet peredam, cuci steam antibakteri & pengeringan oven blower).*
4. **Fogging Disinfektan**: **+Rp 150.000** *(Pengasapan ozon & antiseptik membunuh 99.9% bakteri via jalur AC).*

---

### Step 06: Lokasi Pengerjaan
1. **Home Service (Gratis Transport)**: Teknisi datang ke garasi rumah / kantor area Jabodetabek membawa genset, kompresor, dan alat lab portabel.
2. **Workshop Bintaro (Standar Lab Resmi)**: Datang langsung ke Jl. Boulevard Sektor 7 No. 18, Tangerang Selatan (Fasilitas VIP Lounge, Wi-Fi, kopi premium, CCTV monitoring).

---

## 3. Format Template Pesan WhatsApp Otomatis
```text
Halo Rays Autocare, saya ingin konsultasi pengerjaan detailing berdasarkan estimasi di website:

🚘 Data Kendaraan:
- Merek & Model: [Model Mobil]
- Kategori Ukuran: [Small / Medium / Large / Supercar]
- Tahun: [Tahun Kendaraan]
- Warna: [Warna Cat]

✨ Paket yang Dipilih:
- Layanan Utama: [Nama Paket Detailing]
- Layanan Tambahan: [Daftar Add-ons atau Tidak Ada]
- Lokasi Pengerjaan: [Home Service / Workshop Bintaro]

💰 Estimasi Biaya Kalkulator: Rp [Total Estimasi]

Mohon konfirmasi ketersediaan jadwal teknisi. Terima kasih!
```
