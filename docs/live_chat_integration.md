# Panduan Integrasi Real-Time Live Chat (Socket.io) - Rays Autocare

Dokumen ini menjelaskan arsitektur, cara kerja, dan panduan integrasi sistem **Web Live Chat Realtime** berbasis **Socket.io** dan **REST API** pada `backend-rays` untuk tim **Frontend (Web Pengunjung)** dan **Admin CMS Dashboard**.

---

## 1. Arsitektur & Teknologi

* **Library:** `socket.io` (v4+) & `socket.io-client`.
* **Database:** PostgreSQL (Lokal) / MySQL (Hostinger) pada tabel `conversations` dan `messages`.
* **Port / URL WebSocket:** `http://localhost:3001` (sama dengan port server Express).
* **Keunggulan:**
  * 100% Gratis & mandiri (tidak ada biaya bulanan pihak ketiga).
  * Data obrolan tersimpan aman di database Rays Autocare.
  * Realtime instan dengan fallback REST API.

---

## 2. Event Realtime Socket.IO

### A. Untuk Pengunjung Web (Customer Widget)
```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

// 1. Bergabung ke room obrolan setelah mendapatkan conversationId dari POST /api/chat/start
socket.emit('client:join_conversation', { conversationId: 12 });

// 2. Mengirim pesan chat realtime
socket.emit('client:send_message', {
  conversationId: 12,
  messageText: 'Halo admin, apakah coating ready?',
  senderType: 'customer' // 'customer' | 'admin'
});

// 3. Menerima pesan masuk secara realtime (baik dari CS atau balasan server)
socket.on('server:new_message', (data: { message: any; conversationId: number }) => {
  console.log('Pesan baru:', data.message);
  // Tambahkan data.message ke state daftar chat di layar
});

// 4. Mengirim & Menerima status "Sedang Mengetik..."
socket.emit('client:typing', { conversationId: 12, senderType: 'customer', isTyping: true });

socket.on('server:typing', (data: { conversationId: number; senderType: string; isTyping: boolean }) => {
  if (data.senderType === 'admin') {
    // Tampilkan teks: "Admin CS sedang mengetik..."
  }
});
```

---

### B. Untuk Admin CMS Dashboard (Halaman CS Live Chat)
```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

// 1. Admin bergabung ke room monitoring global
socket.emit('admin:join_dashboard');

// 2. Menerima notifikasi ada percakapan baru dibuka oleh customer
socket.on('server:conversation_created', (data: { conversation: any }) => {
  // Mainkan suara notifikasi lonceng "ting!"
  // Tambahkan percakapan baru ke puncak daftar inbox CS
});

// 3. Menerima update pesan terbaru pada daftar percakapan
socket.on('server:conversation_updated', (data: any) => {
  // Update preview pesan terakhir & naikkan obrolan ke urutan paling atas
});

// 4. Saat admin mengklik salah satu chat untuk membalas:
socket.emit('client:join_conversation', { conversationId: selectedId });

// 5. Admin mengirim balasan:
socket.emit('client:send_message', {
  conversationId: selectedId,
  messageText: 'Selamat siang kak, Nano Ceramic Coating ready ya!',
  senderType: 'admin'
});
```

---

## 3. Dokumentasi REST API

Semua endpoint dapat diuji melalui Postman Collection pada folder **13. Real-Time Web Live Chat**.

| Endpoint | Method | Role | Deskripsi |
| :--- | :--- | :--- | :--- |
| `/api/chat/start` | `POST` | Public | Memulai sesi chat baru (menerima `guest_name`, `phone_number`, `guest_email`, `initial_message`) |
| `/api/chat/conversations/:id/messages` | `GET` | Public / Admin | Mengambil riwayat seluruh pesan lama dari suatu sesi obrolan |
| `/api/chat/conversations/:id/messages` | `POST` | Public / Admin | HTTP fallback untuk mengirim pesan jika websocket terputus |
| `/api/chat/admin/conversations` | `GET` | Admin / Super Admin | Mengambil daftar seluruh inbox percakapan (lengkap dengan jumlah unread dan pesan terakhir) |
| `/api/chat/admin/conversations/:id/status` | `PATCH` | Admin / Super Admin | Mengubah status obrolan menjadi `'resolved'` atau `'open'` |
