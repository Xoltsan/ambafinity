# ⚡ AmbaFinity - TikTok Live Pusat Interaksi & Vinyl Music Suite

Toolkit lengkap dan otomatis untuk **TikTok Live Streaming** yang menggabungkan fitur **Pusat Interaksi (Alert, SFX, Indonesian TTS, Keystroke Game Automation, Spin Roulette)** ala IndoFinity serta **Music Request Bot & OBS Vinyl Overlay** piringan hitam berputar persis referensi desain Anda.

Semuanya berjalan **100% lokal, cepat, tanpa butuh cookie (`sessionid`), dan tanpa API Key!**

---

## ✨ Fitur Unggulan AmbaFinity

### 1. ⚡ Pusat Interaksi (Interaction Center)
Kelola dan otomatisasi respons aktivitas penonton live TikTok Anda:
* **Pemicu (Triggers):**
  * 🎁 **Gift TikTok:** Deteksi kiriman gift spesifik (*Rose, TikTok, Whale, Donut, Singa, dll*) atau berdasarkan jumlah koin.
  * ❤️ **Like / Tap Layar:** Trigger aksi setiap kelipatan jumlah like tertentu (misal per 50 like).
  * 🌟 **Follow Streamer:** Alert sambutan otomatis saat ada follower baru.
  * 📢 **Share Siaran:** Notifikasi terima kasih saat penonton membagikan siaran.
  * 💬 **Komentar Chat:** Trigger aksi dari kata kunci chat (contoh: `!jump`, `!spin`).
* **Aksi (Actions):**
  * 📺 **Alert Visual & Animasi:** Kartu notifikasi pop-up transparan di OBS lengkap dengan gambar/GIF animasi, judul menyala, dan durasi kustom.
  * 🔊 **Sound Effect (SFX):** Efek suara bawaan (*Bell, Fanfare, Pop, Ting Ting*) tanpa butuh file MP3 eksternal.
  * 🗣️ **Text-to-Speech (TTS):** Membacakan nama dan pesan penonton dalam Bahasa Indonesia secara otomatis.
  * ⌨️ **Keystroke Game Automation:** Menekan tombol keyboard di PC (*SPACE, W, A, S, D, F, dll*) secara otomatis saat penonton mengirim gift atau mengetik perintah — sangat cocok untuk streaming game interaktif Minecraft, Roblox, GTA, dll.
  * 🎡 **Spin Roulette (Roda Keberuntungan):** Menampilkan roda keberuntungan animasi di layar stream yang berputar dan memilih hadiah secara acak.
* **Sakelar Master (Safety Switches):** Matikan/nyalakan fitur dengan 1-klik: *Semua Interaksi, Keystroke, Webhook, OBS, Minecraft, Win/Lose, Spin Roulette*.
* **Panel Simulator:** Tombol uji coba 1-klik untuk mencoba pengiriman gift, like, follow, share, atau chat tiruan kapan saja sebelum live dimulai.

---

### 2. 🎵 Music Request & Vinyl Overlay Hub
* Penonton bisa me-request lagu lewat chat live:
  * `!play [judul lagu]` (atau `!request`, `!sr`)
  * `!revoke` (membatalkan lagu yang pernah di-request penonton dari antrean)
  * `!skip` (host langsung lewati lagu seketika; penonton vote-skip)
* **Piringan Hitam Berputar (Rotating Vinyl Record):**
  * Cover album berputar halus di tengah piringan vinyl 3D.
  * Gelombang suara equalizer animasi (*Sound Waveform Bars*).
  * Kartu sekunder **UP NEXT** menampilkan lagu berikutnya dalam antrean.
  * Dilengkapi tombol pengaktif suara otomatis (*Autoplay Unblocker*).

---

## 🚀 Cara Menjalankan (1-Klik)

Cukup **klik dua kali** file berikut:
```
start.bat
```
Browser akan otomatis membuka **Dashboard Kontrol** di:
* Dashboard Kontrol & Pusat Interaksi: `http://localhost:3456/control`
* Link Overlay Browser Source OBS: `http://localhost:3456/overlay`

---

## 📺 Cara Memasang di OBS Studio / TikTok Live Studio

1. Buka **OBS Studio** atau **TikTok Live Studio**.
2. Pada panel **Sources (Sumber)**, klik tombol `+` lalu pilih **Browser (Peramban)**.
3. Masukkan URL:
   * **URL**: `http://localhost:3456/overlay`
   * **Width (Lebar)**: `500` (atau `1920` jika ingin full-screen overlay)
   * **Height (Tinggi)**: `300` (atau `1080` untuk full-screen)
   * Centang **"Control audio via OBS"** (jika ingin suara audio/TTS dikontrol lewat mixer OBS).
4. Di panel **Audio Mixer OBS**, klik kanan pada source Browser → **Advanced Audio Properties** → Ubah ke **"Monitor and Output"** (supaya suara masuk ke streaming dan terdengar di headset kamu).
5. Klik **OK**. Overlay vinyl dan alert interaksi sudah siap menghiasi live stream Anda!

---

## ⚙️ Kustomisasi Tema & Ukuran Overlay

| Tema | Tampilan | Contoh URL di OBS |
| :--- | :--- | :--- |
| **Default Glass Light** | Kaca frosted putih lembut | `http://localhost:3456/overlay` |
| **Dark Mode** | Kaca hitam elegan dengan aksen biru | `http://localhost:3456/overlay?theme=dark` |
| **TikTok Neon** | Khas TikTok (Cyan & Merah Neon) | `http://localhost:3456/overlay?theme=tiktok` |
| **Custom Scale (Ukuran)** | Memperbesar/memperkecil (misal 1.2x atau 0.8x) | `http://localhost:3456/overlay?scale=1.2` |
