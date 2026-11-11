import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Muat Konfigurasi
const configPath = path.join(__dirname, 'config.json');
let config = {
  tiktokUsername: 'xolt.san',
  commandPrefix: '!play',
  commandAliases: ['!request', '!sr', '!lagu'],
  revokePrefix: '!revoke',
  revokeAliases: ['!cancel', '!batal'],
  skipPrefix: '!skip',
  skipAliases: ['!next', '!lewati'],
  allowViewerSkip: true,
  skipVotesNeeded: 2,
  cooldownSeconds: 60,
  maxQueueLength: 25,
  port: 3456
};

if (fs.existsSync(configPath)) {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = { ...config, ...JSON.parse(raw) };
  } catch (e) {
    console.error('[Config] Gagal membaca config.json:', e);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('[Config] Gagal menyimpan config.json:', e);
  }
}

// State Pemutar Musik & Antrean
let nowPlaying = null;
let queue = [];
let userCooldowns = new Map();
let chatLogs = [];
let latestToast = null;
let latestToastMessage = '';
let tiktokConnected = false;
let tiktokConnection = null;
let lastTikTokStatus = 'idle'; // idle | checking | waiting | connecting | connected | error
let lastTikTokMessage = '';
let autoLiveWatcher = null;
let skipVotes = new Set();
const hostAliases = new Set(['host', 'streamer', 'admin', 'system']);

function registerHostUsername(username) {
  if (!username) return;
  const clean = String(username).replace(/^@/, '').toLowerCase().trim();
  hostAliases.add(clean);
  hostAliases.add(clean.replace(/[^a-z0-9]/g, ''));
  if (clean.includes('.')) {
    clean.split('.').forEach(part => {
      if (part.length > 1) hostAliases.add(part);
    });
  }
}

function isUserHost(user, isModerator = false) {
  if (isModerator) return true;
  if (!user) return false;
  const clean = String(user).replace(/^@/, '').toLowerCase().trim();
  if (hostAliases.has(clean)) return true;
  if (hostAliases.has(clean.replace(/[^a-z0-9]/g, ''))) return true;
  const configuredHost = (config.tiktokUsername || '').replace(/^@/, '').toLowerCase().trim();
  if (configuredHost) {
    if (clean === configuredHost) return true;
    if (configuredHost.includes('.') && clean === configuredHost.split('.')[0]) return true;
    if (clean.includes('.') && configuredHost === clean.split('.')[0]) return true;
    if (clean.startsWith(configuredHost) || configuredHost.startsWith(clean)) return true;
  }
  return false;
}

if (config.tiktokUsername) {
  registerHostUsername(config.tiktokUsername);
}

// ============================================================================
// 1. PENCARIAN YOUTUBE MUSIC CEPAT (NATIVE TANPA API KEY)
// ============================================================================
async function searchYouTube(query) {
  try {
    const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
    if (!match) return null;

    const data = JSON.parse(match[1]);
    const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
    
    for (const c of contents) {
      if (c.videoRenderer) {
        const vr = c.videoRenderer;
        const videoId = vr.videoId;
        const title = vr.title?.runs?.[0]?.text || '';
        const artist = vr.ownerText?.runs?.[0]?.text || '';
        const duration = vr.lengthText?.simpleText || '0:00';
        const thumbnails = vr.thumbnail?.thumbnails || [];
        const thumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : '';

        return {
          id: videoId,
          title,
          artist,
          duration,
          thumbnail
        };
      }
    }
  } catch (err) {
    console.error('[Search] Error mencari lagu:', err);
  }
  return null;
}

// ============================================================================
// 2. LOGIKA ANTREAN LAGU, SKIP & REVOKE
// ============================================================================
async function handleSongRequest(query, requestedBy = 'Host') {
  if (!query || query.trim().length === 0) {
    return { success: false, error: 'Judul lagu tidak boleh kosong' };
  }

  if (queue.length >= config.maxQueueLength) {
    return { success: false, error: `Antrean penuh (maksimal ${config.maxQueueLength} lagu)` };
  }

  console.log(`[Request] Mencari: "${query}" dari @${requestedBy}`);
  const song = await searchYouTube(query);
  if (!song) {
    return { success: false, error: 'Lagu tidak ditemukan di YouTube' };
  }

  song.requestedBy = requestedBy;
  song.addedAt = Date.now();

  if (!nowPlaying) {
    nowPlaying = song;
    skipVotes.clear();
    console.log(`[Now Playing] Memutar: ${song.title} - ${song.artist}`);
  } else {
    queue.push(song);
    console.log(`[Queue] Ditambahkan ke antrean (${queue.length}): ${song.title}`);
  }

  latestToast = Date.now();
  latestToastMessage = `🎵 Req @${requestedBy}: ${song.title}`;

  return { success: true, song };
}

function nextTrack(cause = null) {
  skipVotes.clear();
  if (queue.length > 0) {
    nowPlaying = queue.shift();
    console.log(`[Next] Sekarang memutar: ${nowPlaying.title} (Sisa antrean: ${queue.length})`);
    if (cause) {
      latestToast = Date.now();
      latestToastMessage = `⏭️ ${cause} -> Memutar: ${nowPlaying.title}`;
    }
  } else {
    nowPlaying = null;
    console.log('[Queue] Antrean selesai, tidak ada lagu berikutnya');
    if (cause) {
      latestToast = Date.now();
      latestToastMessage = `⏭️ ${cause} -> Antrean selesai`;
    }
  }
}

function handleRevoke(user, query = '') {
  user = String(user).replace(/^@/, '').trim();
  const isHost = isUserHost(user);
  
  let targetIndex = -1;

  if (isHost && !query) {
    if (queue.length > 0) {
      targetIndex = queue.length - 1;
    }
  } else {
    for (let i = queue.length - 1; i >= 0; i--) {
      const qItem = queue[i];
      const matchesUser = isHost || (qItem.requestedBy && qItem.requestedBy.toLowerCase() === user.toLowerCase());
      if (matchesUser) {
        if (!query) {
          targetIndex = i;
          break;
        } else if (qItem.title.toLowerCase().includes(query.toLowerCase()) || qItem.artist.toLowerCase().includes(query.toLowerCase())) {
          targetIndex = i;
          break;
        }
      }
    }
  }

  if (targetIndex !== -1) {
    const removed = queue.splice(targetIndex, 1)[0];
    userCooldowns.delete(user.toLowerCase());
    console.log(`[Revoke] ❌ @${user} membatalkan antrean: "${removed.title}"`);
    
    latestToast = Date.now();
    latestToastMessage = `❌ @${user} membatalkan: ${removed.title}`;
    return { success: true, removed };
  } else {
    console.log(`[Revoke] Tidak ada antrean dari @${user} yang bisa dibatalkan`);
    return { success: false, error: 'Tidak ada lagu di antrean yang bisa dibatalkan' };
  }
}

function handleSkip(user, isModerator = false) {
  user = String(user).replace(/^@/, '').trim();
  const isHost = isUserHost(user, isModerator);

  if (!nowPlaying) {
    return { success: false, error: 'Tidak ada lagu yang sedang diputar' };
  }

  if (isHost) {
    console.log(`[Skip] ⏭️ Lagu diskip langsung oleh host/moderator: @${user}`);
    nextTrack(`Diskip oleh @${user}`);
    return { success: true, message: `Lagu diskip oleh @${user}` };
  }

  if (!config.allowViewerSkip) {
    return { success: false, error: 'Hanya host/moderator yang dapat men-skip lagu' };
  }

  const votesNeeded = config.skipVotesNeeded || 2;
  skipVotes.add(user.toLowerCase());

  console.log(`[Vote Skip] @${user} memberikan vote skip (${skipVotes.size}/${votesNeeded})`);
  
  if (skipVotes.size >= votesNeeded) {
    console.log(`[Vote Skip] Target vote terpenuhi (${skipVotes.size}/${votesNeeded}), melewati lagu!`);
    nextTrack(`Vote skip terpenuhi (${skipVotes.size}/${votesNeeded})`);
    return { success: true, message: 'Vote skip terpenuhi, lagu dilewati!' };
  } else {
    latestToast = Date.now();
    latestToastMessage = `🗳️ Vote skip: ${skipVotes.size}/${votesNeeded} (oleh @${user})`;
    return { success: true, message: `Vote skip tercatat (${skipVotes.size}/${votesNeeded})` };
  }
}

async function processIncomingChatMessage(user, comment, isModerator = false) {
  chatLogs.unshift({ user, message: comment, time: Date.now() });
  if (chatLogs.length > 40) chatLogs.pop();

  const lowerComment = comment.toLowerCase();

  // 1. Cek !revoke
  const revokePrefixes = [config.revokePrefix || '!revoke', ...(config.revokeAliases || ['!cancel', '!batal'])];
  let matchedRevoke = null;
  for (const rp of revokePrefixes) {
    if (lowerComment.startsWith(rp.toLowerCase())) {
      matchedRevoke = rp;
      break;
    }
  }
  if (matchedRevoke) {
    const query = comment.substring(matchedRevoke.length).trim();
    return handleRevoke(user, query);
  }

  // 2. Cek !skip
  const skipPrefixes = [config.skipPrefix || '!skip', ...(config.skipAliases || ['!next', '!lewati'])];
  let matchedSkip = null;
  for (const sp of skipPrefixes) {
    if (lowerComment.startsWith(sp.toLowerCase())) {
      matchedSkip = sp;
      break;
    }
  }
  if (matchedSkip) {
    return handleSkip(user, isModerator);
  }

  // 3. Cek !play
  const playPrefixes = [config.commandPrefix || '!play', ...(config.commandAliases || ['!request', '!sr', '!lagu'])];
  let matchedPlay = null;
  for (const p of playPrefixes) {
    if (lowerComment.startsWith(p.toLowerCase())) {
      matchedPlay = p;
      break;
    }
  }

  if (!matchedPlay) return { ignored: true };

  const songQuery = comment.substring(matchedPlay.length).trim();
  if (!songQuery) return { success: false, error: 'Judul lagu tidak boleh kosong' };

  const isHost = isUserHost(user, isModerator);
  const now = Date.now();
  const lastRequest = userCooldowns.get(user.toLowerCase()) || 0;
  const cooldownMs = (config.cooldownSeconds || 60) * 1000;

  if (!isHost && now - lastRequest < cooldownMs) {
    const waitSecs = Math.ceil((cooldownMs - (now - lastRequest)) / 1000);
    console.log(`[Cooldown] @${user} masih terkena cooldown (${waitSecs}s lagi)`);
    return { success: false, error: `Cooldown ${waitSecs}s lagi` };
  }

  userCooldowns.set(user.toLowerCase(), now);
  const result = await handleSongRequest(songQuery, user);
  if (result.success) {
    console.log(`[TikTok Live] Sukses menambah: "${result.song.title}" dari @${user}`);
  }
  return result;
}

// ============================================================================
// 3. KONEKSI TIKTOK LIVE REALTIME (v2.5.0 - ZERO COOKIE & ZERO KEY)
// ============================================================================
async function startTikTokMonitoring(username) {
  if (!username) return;

  username = username.replace(/^@/, '').trim();
  config.tiktokUsername = username;
  saveConfig();

  if (autoLiveWatcher) {
    clearInterval(autoLiveWatcher);
    autoLiveWatcher = null;
  }

  if (tiktokConnection) {
    try { tiktokConnection.disconnect(); } catch (e) {}
    tiktokConnection = null;
    tiktokConnected = false;
  }

  console.log(`[TikTok] Memeriksa status siaran @${username}...`);
  lastTikTokStatus = 'checking';
  lastTikTokMessage = `Memeriksa status siaran @${username}...`;

  try {
    const conn = new TikTokLiveConnection(username, {});
    const isLive = await conn.fetchIsLive();

    if (isLive) {
      console.log(`[TikTok] Akun @${username} sedang aktif LIVE! Menghubungkan langsung...`);
      await doConnectLive(conn, username);
    } else {
      lastTikTokStatus = 'waiting';
      lastTikTokMessage = `Akun @${username} saat ini offline. Mulai LIVE di TikTok ya, sistem akan otomatis terhubung!`;
      console.log(`[TikTok] @${username} sedang offline. Menunggu siaran live dimulai...`);

      // Polling setiap 8 detik jika belum live
      autoLiveWatcher = setInterval(async () => {
        if (tiktokConnected) return;
        try {
          const watcherConn = new TikTokLiveConnection(username, {});
          const liveCheck = await watcherConn.fetchIsLive();
          if (liveCheck) {
            console.log(`[TikTok] 🚀 Siaran LIVE terdeteksi untuk @${username}! Menghubungkan...`);
            clearInterval(autoLiveWatcher);
            autoLiveWatcher = null;
            await doConnectLive(watcherConn, username);
          }
        } catch (e) {
          // ignore polling check error
        }
      }, 8000);
    }
  } catch (err) {
    lastTikTokStatus = 'error';
    lastTikTokMessage = `Error memeriksa akun @${username}: ${err.message}`;
    console.error(`[TikTok] Error:`, err.message);
  }
}

async function doConnectLive(conn, username) {
  lastTikTokStatus = 'connecting';
  lastTikTokMessage = `Menghubungkan ke live chat @${username}...`;

  try {
    const state = await conn.connect();
    tiktokConnection = conn;
    tiktokConnected = true;
    lastTikTokStatus = 'connected';
    lastTikTokMessage = `Berhasil terhubung ke live chat @${username}`;
    console.log(`[TikTok] ✅ SUKSES TERHUBUNG ke Live Room ID: ${state.roomId} (@${username})!`);

    registerHostUsername(username);
    if (state.roomInfo?.owner) {
      if (state.roomInfo.owner.unique_id) registerHostUsername(state.roomInfo.owner.unique_id);
      if (state.roomInfo.owner.nickname) registerHostUsername(state.roomInfo.owner.nickname);
    }

    conn.on(WebcastEvent.CHAT, async data => {
      const user = data.user?.uniqueId || data.user?.nickname || 'Viewer';
      const comment = data.content?.trim() || '';
      const isModerator = !!(data.user?.userRole === 1 || data.user?.isOwner || isUserHost(user));
      console.log(`[TikTok Chat] @${user}: ${comment}`);
      await processIncomingChatMessage(user, comment, isModerator);
    });

    conn.on(WebcastEvent.STREAM_END, () => {
      tiktokConnected = false;
      lastTikTokStatus = 'waiting';
      lastTikTokMessage = 'Live streaming TikTok telah berakhir';
      console.log('[TikTok] Live streaming telah berakhir');
    });

    conn.on('disconnected', () => {
      tiktokConnected = false;
      lastTikTokStatus = 'disconnected';
      lastTikTokMessage = 'Terputus dari live streaming TikTok';
      console.log('[TikTok] Terputus dari live');
    });

  } catch (err) {
    tiktokConnected = false;
    lastTikTokStatus = 'error';
    lastTikTokMessage = `Gagal menghubungkan ke live: ${err.message}`;
    console.warn(`[TikTok] ❌ Gagal terhubung ke @${username}: ${err.message}`);
  }
}

// Hubungkan otomatis jika username sudah diatur
if (config.tiktokUsername && config.tiktokUsername !== 'ganti_dengan_username_tiktok_kamu') {
  startTikTokMonitoring(config.tiktokUsername);
}

// ============================================================================
// 4. HTTP SERVER & REST API (UNTUK OVERLAY & DASHBOARD)
// ============================================================================
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Halaman Overlay OBS (/overlay)
  if (pathname === '/overlay') {
    const filePath = path.join(__dirname, 'overlay.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Gagal memuat overlay');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  // 2. Halaman Dashboard Pengontrol Streamer (/control atau /)
  if (pathname === '/control' || pathname === '/') {
    const filePath = path.join(__dirname, 'control.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Gagal memuat dashboard');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  async function readJsonBody() {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  // 3. API Status (/api/status)
  if (pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      nowPlaying,
      queue,
      tiktokConnected,
      tiktokUsername: config.tiktokUsername,
      lastTikTokStatus,
      lastTikTokMessage,
      chatLogs: chatLogs.slice(0, 20),
      latestToast,
      latestToastMessage,
      skipVotesCount: skipVotes.size,
      skipVotesNeeded: config.skipVotesNeeded || 2
    }));
    return;
  }

  // 4. API Request Lagu Manual (/api/request)
  if (pathname === '/api/request' && req.method === 'POST') {
    try {
      const data = await readJsonBody();
      const result = await handleSongRequest(data.query, data.user || 'Host');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 5. API Simulasi Chat Viewer (/api/chat/simulate)
  if (pathname === '/api/chat/simulate' && req.method === 'POST') {
    try {
      const data = await readJsonBody();
      const result = await processIncomingChatMessage(data.user || 'Viewer_Test', data.comment || '');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 6. API Lewati Lagu / Skip (/api/skip)
  if (pathname === '/api/skip' && req.method === 'POST') {
    try {
      const data = await readJsonBody();
      const result = handleSkip(data.user || 'Host', data.isModerator || false);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      nextTrack('Manual Skip');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, nowPlaying }));
    }
    return;
  }

  // 7. API Batalkan Lagu / Revoke (/api/revoke)
  if (pathname === '/api/revoke' && req.method === 'POST') {
    try {
      const data = await readJsonBody();
      const result = handleRevoke(data.user || 'Host', data.query || '');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 8. API Bersihkan Antrean (/api/clear)
  if (pathname === '/api/clear' && req.method === 'POST') {
    queue = [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // 9. API Hapus Satu Lagu dari Antrean (/api/queue/delete)
  if (pathname === '/api/queue/delete' && req.method === 'POST') {
    try {
      const data = await readJsonBody();
      if (typeof data.index === 'number' && data.index >= 0 && data.index < queue.length) {
        const removed = queue.splice(data.index, 1);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, removed }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Index tidak valid' }));
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 10. API Hubungkan ke TikTok Live (/api/tiktok/connect)
  if (pathname === '/api/tiktok/connect' && req.method === 'POST') {
    try {
      const data = await readJsonBody();
      if (data.username) {
        startTikTokMonitoring(data.username);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Username diperlukan' }));
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 404 Not Found
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const PORT = config.port || 3456;
server.listen(PORT, () => {
  console.log('================================================================');
  console.log(' 🎵 LIMUSIC TIKTOK LIVE REQUEST & VINYL OVERLAY SUITE');
  console.log('================================================================');
  console.log(` 🌐 Dashboard Kontrol : http://localhost:${PORT}/control`);
  console.log(` 📺 OBS Browser Source: http://localhost:${PORT}/overlay`);
  console.log('================================================================');
  console.log(' Menunggu aktivitas dari live stream...');
});
