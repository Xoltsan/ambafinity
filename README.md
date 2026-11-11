# 🎵 Limusic TikTok Live Request & Vinyl Overlay

Sistem otomatis untuk live streaming TikTok yang memungkinkan penonton me-request lagu lewat komentar chat (`!play [judul lagu]`), otomatis mencari lagu di YouTube Music, memasukkannya ke dalam antrean (Queue), dan menampilkannya di layar streaming dengan **Overlay Piringan Hitam (Vinyl Record) & Glassmorphism Card** persis seperti referensi desain Anda.

---

## 🚀 Cara Menjalankan (1-Klik)

Cukup **klik dua kali** file berikut:
```
start.bat
```
Browser akan otomatis membuka **Dashboard Kontrol** di: `http://localhost:3456/control`.

---

## 📺 Cara Memasang di OBS Studio / TikTok Live Studio

1. Buka **OBS Studio** atau **TikTok Live Studio**.
2. Pada panel **Sources (Sumber)**, klik tombol `+` lalu pilih **Browser (Peramban)**.
3. Beri nama (misalnya: `Music Overlay`).
4. Atur pengaturannya:
   * **URL**: `http://localhost:3456/overlay`
   * **Width (Lebar)**: `500`
   * **Height (Tinggi)**: `300`
   * Centang **"Control audio via OBS"** (jika ingin suara lagu langsung masuk ke mixer OBS).
5. Klik **OK**. Overlay akan langsung muncul di layar stream Anda dengan latar belakang transparan!

---

## 📱 Perintah Chat untuk Penonton Live TikTok

1. Di Dashboard (`http://localhost:3456/control`), masukkan **Username TikTok** Anda (contoh: `@namakamu`) lalu klik **Hubungkan**.
2. Perintah yang bisa digunakan penonton di chat live:
   * **`!play [judul lagu]`** (atau `!request`, `!lagu`)
     * Mencari lagu di YouTube Music dan memasukkannya ke antrean.
     * Contoh: `!play komang raim laode`
   * **`!revoke`** (atau `!cancel`, `!batal`)
     * Membatalkan lagu yang pernah di-request oleh penonton tersebut dari antrean. Cooldown penonton otomatis di-reset sehingga bisa request lagu lain.
   * **`!skip`** (atau `!next`, `!lewati`)
     * Melewati lagu yang sedang diputar.
     * **Host / Streamer / Moderator:** Langsung men-skip lagu seketika tanpa voting.
     * **Penonton Biasa:** Sistem vote-skip (misal butuh 2 vote dari penonton berbeda agar lagu di-skip, bisa disesuaikan di `config.json`).

---

## 🎨 Kustomisasi Tema & Font (Custom Colors & Fonts)

Anda bisa mengubah tema overlay hanya dengan menambahkan parameter di URL Browser Source OBS:

| Tema | Tampilan | Contoh URL di OBS |
| :--- | :--- | :--- |
| **Default Glass Light** | Kaca frosted putih lembut (persis referensi gambar) | `http://localhost:3456/overlay` |
| **Dark Mode** | Kaca hitam elegan dengan aksen biru | `http://localhost:3456/overlay?theme=dark` |
| **TikTok Neon** | Aksen khas TikTok (Cyan & Merah Neon) | `http://localhost:3456/overlay?theme=tiktok` |
| **Custom Scale (Ukuran)** | Memperbesar/memperkecil (misal 1.2x atau 0.8x) | `http://localhost:3456/overlay?scale=1.2` |

---

## 🛡️ Fitur Keamanan Anti-Spam (Sudah Terpasang)

* **Cooldown Penonton:** Masing-masing penonton hanya bisa me-request 1 lagu setiap 60 detik (bisa diubah di `config.json`).
* **Batas Maksimal Antrean:** Maksimal 25 lagu sekaligus agar antrean tidak banjir.
* **Kontrol Streamer Penuh:** Streamer bisa melewati lagu (Skip), menghapus lagu tertentu, atau mengosongkan antrean sewaktu-waktu melalui Dashboard.

