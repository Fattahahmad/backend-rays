# Panduan Pengelolaan Profil, Foto Avatar & Upload Media - Rays Autocare

Dokumen ini menjelaskan alur, spesifikasi teknis, dan contoh implementasi integrasi untuk tim **Frontend (Web/Mobile App)** dan **Admin CMS Dashboard** dalam mengelola profil pengguna dan foto avatar.

---

## 1. Ringkasan Endpoint

| Endpoint | Method | Role | Payload Mode | Deskripsi |
| :--- | :--- | :--- | :--- | :--- |
| `/api/users/profile` | `GET` | Authenticated | - | Mengambil data profil user yang sedang login |
| `/api/users/profile` | `PATCH` | Authenticated | `form-data` / `json` | Mengubah nama, nomor WA, dan foto profil avatar |
| `/api/users/dashboard` | `GET` | Authenticated | - | Mengambil ringkasan dashboard akun (user, poin, status pesanan) |
| `/api/users/:id` | `PATCH` | Admin / Super Admin | `form-data` / `json` | Mengubah data user lain di CMS (nama, WA, role, status email, avatar) |
| `/api/upload/single` | `POST` | Authenticated | `form-data` | Upload umum file gambar ke folder tertentu |

---

## 2. Cara Kerja Upload & Update Foto Avatar

Sistem mendukung **2 metode sekaligus (Hybrid)**, sehingga Frontend memiliki fleksibilitas penuh:

### A. Metode 1: Direct File Upload (1 Langkah — Sangat Direkomendasikan)
Frontend mengirimkan form langsung dalam 1 kali request ke `PATCH /api/users/profile`.

* **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  Content-Type: multipart/form-data
  ```
* **Form-Data Fields:**
  * `avatar`: *(File gambar dari `<input type="file" />`, mendukung format: JPG, JPEG, PNG, WEBP, GIF, BMP, TIFF, HEIC, AVIF, maksimal 2MB. Otomatis dikompres & dikonversi menjadi .webp oleh server)*
  * `name`: `Maxwell Edison` *(opsional)*
  * `phone_number`: `081234567890` *(opsional)*

**Contoh Implementasi di Frontend (React / Axios):**
```tsx
const handleUpdateProfile = async (file: File, name: string, phone: string) => {
  const formData = new FormData();
  if (file) formData.append('avatar', file);
  formData.append('name', name);
  formData.append('phone_number', phone);

  const response = await axios.patch('http://localhost:3001/api/users/profile', formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    },
  });

  console.log('Update sukses:', response.data.data);
};
```

---

### B. Metode 2: Two-Step Flow (JSON Body)
Frontend mengunggah gambar terlebih dahulu menggunakan endpoint upload, lalu mengirim path hasilnya saat tombol simpan diklik.

1. **Step 1 — Upload Gambar:**
   * **URL:** `POST /api/upload/single?folder=avatars`
   * **Respon:**
     ```json
     {
       "success": true,
       "message": "File berhasil diunggah dan dikonversi ke format WebP teroptimasi.",
       "data": {
         "url": "/uploads/avatars/1790042886175.webp",
         "filename": "1790042886175.webp",
         "size": 145230,
         "mimetype": "image/webp"
       }
     }
     ```
2. **Step 2 — Simpan ke Profil:**
   * **URL:** `PATCH /api/users/profile`
   * **Headers:** `Content-Type: application/json`
   * **Body:**
     ```json
     {
       "name": "Maxwell Edison",
       "phone_number": "081234567890",
       "avatar_url": "/uploads/avatars/1790042886175.png"
     }
     ```

---

### C. Menghapus Foto Profil (Reset ke Default)
Jika pengguna ingin mencopot foto profilnya:
* **URL:** `PATCH /api/users/profile`
* **Body (JSON):**
  ```json
  {
    "remove_avatar": true
  }
  ```
  *atau*
  ```json
  {
    "avatar_url": null
  }
  ```
*File lama di server storage akan otomatis dibersihkan secara permanen.*

---

## 3. Format Respon Server

Setiap kali data user dimuat atau diubah, server selalu mengembalikan path relatif `avatar_url` (tanpa menyertakan domain backend agar aman dan fleksibel):

```json
{
  "success": true,
  "message": "Profil berhasil diperbarui.",
  "data": {
    "id": 2,
    "name": "Maxwell Edison",
    "email": "customer@raysautocare.com",
    "phone_number": "081234567890",
    "avatar_url": "/uploads/avatars/1790042886175.png",
    "role": "user",
    "is_email_verified": true
  }
}
```

* **`avatar_url`**: Path relatif yang disimpan di database (aman jika ganti domain/port dan tidak membocorkan link internal backend).
* **Di Frontend**: FE cukup menggabungkan dengan base URL publik atau menampilkannya via proxy: `<img src={user.avatar_url} />`.

> [!NOTE]
> **Google OAuth Avatar:** Jika pengguna login menggunakan akun Google, `avatar_url` otomatis berisi URL asli dari Google (`https://lh3.googleusercontent.com/...`) tanpa terpotong atau rusak.

---

## 4. Pengelolaan User oleh Admin di CMS

Admin dan Super Admin dapat mengedit data user lain melalui:
* **URL:** `PATCH /api/users/:id`
* **Headers:** `Authorization: Bearer <adminToken>`
* **Mendukung:**
  * Form-Data dengan field `avatar` untuk mengganti foto user lain.
  * JSON body:
    ```json
    {
      "name": "Pelanggan VIP",
      "phone_number": "081288889999",
      "role": "user",
      "is_email_verified": true,
      "avatar_url": "/uploads/avatars/new-avatar.png"
    }
    ```
