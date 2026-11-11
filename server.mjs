import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 1. KONFIGURASI SISTEM & MASTER SWITCHES
// ============================================================================
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
  port: 3456,
  masterSwitches: {
    allInteractions: true,
    keystroke: true,
    webhook: true,
    obs: true,
    minecraft: true,
    winLose: true,
    spinRoulette: true
  }
};

if (fs.existsSync(configPath)) {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = { ...config, ...JSON.parse(raw) };
    if (!config.masterSwitches) {
      config.masterSwitches = {
        allInteractions: true,
        keystroke: true,
        webhook: true,
        obs: true,
        minecraft: true,
        winLose: true,
        spinRoulette: true
      };
    }
    if (!config.overlayConfig) {
      config.overlayConfig = {
        pos: 'top-left',
        x: 24,
        y: 24,
        scale: 1.0,
        locked: false
      };
    }
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

// ============================================================================
// 2. PUSAT INTERAKSI (INTERACTION CENTER ENGINE)
// ============================================================================
const interactionsPath = path.join(__dirname, 'interactions.json');
let interactions = [];

function loadInteractions() {
  if (fs.existsSync(interactionsPath)) {
    try {
      const raw = fs.readFileSync(interactionsPath, 'utf8');
      interactions = JSON.parse(raw);
    } catch (e) {
      console.error('[Interactions] Gagal membaca interactions.json:', e);
      interactions = [];
    }
  }
}

function saveInteractions() {
  try {
    fs.writeFileSync(interactionsPath, JSON.stringify(interactions, null, 2), 'utf8');
  } catch (e) {
    console.error('[Interactions] Gagal menyimpan interactions.json:', e);
  }
}

loadInteractions();

let pendingAlerts = [];
let recentAlertLogs = [];
let accumulatedLikes = 0;

function sendKeystroke(key) {
  if (!config.masterSwitches?.allInteractions || !config.masterSwitches?.keystroke) return;
  const keyMap = {
    'SPACE': '{SPACE}',
    'ENTER': '{ENTER}',
    'ESC': '{ESC}',
    'TAB': '{TAB}',
    'BACKSPACE': '{BACKSPACE}',
    'UP': '{UP}',
    'DOWN': '{DOWN}',
    'LEFT': '{LEFT}',
    'RIGHT': '{RIGHT}',
    'W': 'w',
    'A': 'a',
    'S': 's',
    'D': 'd',
    'E': 'e',
    'F': 'f',
    'Q': 'q',
    'R': 'r',
    '1': '1',
    '2': '2',
    '3': '3'
  };
  const targetKey = keyMap[String(key).toUpperCase()] || key;
  const cmd = `powershell -NoProfile -Command "$w = New-Object -ComObject Wscript.Shell; $w.SendKeys('${targetKey}')"`;
  exec(cmd, (err) => {
    if (err) console.error('[Keystroke] Error sending keystroke:', err.message);
    else console.log(`[Keystroke] ⌨️ Tombol [${key}] berhasil ditekan di sistem!`);
  });
}

function triggerInteraction(interaction, eventData = {}) {
  if (!config.masterSwitches?.allInteractions || !interaction.enabled) return null;

  if (interaction.category === 'keystroke' && !config.masterSwitches?.keystroke) return null;
  if (interaction.category === 'spin' && !config.masterSwitches?.spinRoulette) return null;
  if (interaction.category === 'webhook' && !config.masterSwitches?.webhook) return null;
  if (interaction.category === 'minecraft' && !config.masterSwitches?.minecraft) return null;

  const user = eventData.user || 'Penonton';
  const avatar = eventData.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100';
  const action = interaction.action || {};

  const diamonds = eventData.diamonds || (interaction.trigger?.minCoins || 1);

  const title = (action.title || '{user} memicu interaksi!')
    .replace(/{user}/g, user)
    .replace(/{gift}/g, eventData.giftName || 'Gift')
    .replace(/{count}/g, eventData.count || 1)
    .replace(/{coins}/g, diamonds);

  const message = (action.message || '')
    .replace(/{user}/g, user)
    .replace(/{gift}/g, eventData.giftName || 'Gift')
    .replace(/{count}/g, eventData.count || 1)
    .replace(/{coins}/g, diamonds);

  const ttsText = (action.ttsText || title)
    .replace(/{user}/g, user)
    .replace(/{gift}/g, eventData.giftName || 'Gift')
    .replace(/{count}/g, eventData.count || 1)
    .replace(/{coins}/g, diamonds);

  console.log(`[Pusat Interaksi] ⚡ "${interaction.name}" dipicu oleh @${user} (${diamonds} koin)`);

  // Eksekusi Keystroke jika ada
  if (action.type === 'keystroke' && action.key) {
    sendKeystroke(action.key);
  }

  const alertType = action.type || (interaction.category === 'jj' ? 'jj' : 'alert');

  const alertItem = {
    id: 'alert-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    timestamp: Date.now(),
    interactionId: interaction.id,
    name: interaction.name,
    category: interaction.category,
    type: alertType,
    user,
    avatar,
    title,
    message,
    media: action.media || action.videoUrl || '',
    videoUrl: action.videoUrl || action.media || '',
    sfx: action.sfx || (alertType === 'jj' ? 'jj_beat' : 'bell'),
    flash: action.flash !== false,
    shake: action.shake !== false,
    diamonds: diamonds,
    tts: !!action.tts,
    ttsText: ttsText,
    duration: action.duration || (alertType === 'jj' ? 9 : 5),
    options: action.options || []
  };

  pendingAlerts.push(alertItem);
  recentAlertLogs.unshift({
    id: alertItem.id,
    time: Date.now(),
    interactionName: interaction.name,
    user,
    details: title
  });
  if (recentAlertLogs.length > 50) recentAlertLogs.pop();

  latestToast = Date.now();
  latestToastMessage = title;

  return alertItem;
}

// ============================================================================
// 3. STATE PEMUTAR MUSIK & ANTREAN
// ============================================================================
const SERVER_START_TIME = Date.now();
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
// 4. PENCARIAN YOUTUBE MUSIC CEPAT (NATIVE TANPA API KEY)
// ============================================================================
async function searchYouTube(query) {
  try {
    // 1. Dukungan direct link YouTube jika user memasukkan URL
    const urlMatch = query.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (urlMatch) {
      const vid = urlMatch[1];
      return {
        id: vid,
        title: query,
        artist: 'YouTube Direct',
        duration: '0:00',
        thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        candidates: [{ id: vid, title: query, artist: 'YouTube Direct' }]
      };
    }

    // Prioritaskan pencarian lagu dengan versi lirik / audio untuk menghindari blokir embed VEVO (Error 150)
    let searchQuery = query.trim();
    const lower = searchQuery.toLowerCase();
    if (!lower.includes('lyrics') && !lower.includes('lirik') && !lower.includes('audio') && !lower.includes('topic')) {
      searchQuery += ' lyrics audio';
    }

    const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(searchQuery);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/) || html.match(/ytInitialData\s*=\s*({.+?});/);
    if (!match) {
      console.warn('[Search] ytInitialData tidak cocok dalam HTML YouTube (length:', html.length, ')');
      return null;
    }

    const data = JSON.parse(match[1]);
    const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
    
    const candidates = [];
    let primarySong = null;

    for (const c of contents) {
      if (c.videoRenderer) {
        const vr = c.videoRenderer;
        const videoId = vr.videoId;
        const title = vr.title?.runs?.[0]?.text || '';
        const artist = vr.ownerText?.runs?.[0]?.text || '';
        const duration = vr.lengthText?.simpleText || '0:00';
        const thumbnails = vr.thumbnail?.thumbnails || [];
        const thumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : '';

        // Deteksi apakah video dari VEVO (yang selalu memblokir embedding di website pihak ketiga)
        const isVevo = (artist + ' ' + title).toLowerCase().includes('vevo');

        const item = {
          id: videoId,
          title,
          artist,
          duration,
          thumbnail,
          isVevo
        };

        candidates.push(item);

        // Utamakan video non-VEVO sebagai primary song agar 100% bisa di-embed di overlay
        if (!primarySong && !isVevo) {
          primarySong = { ...item };
        }
        if (candidates.length >= 8) break;
      }
    }

    // Jika semua hasil kebetulan VEVO, ambil kandidat pertama
    if (!primarySong && candidates.length > 0) {
      primarySong = { ...candidates[0] };
    }

    if (primarySong) {
      primarySong.candidates = candidates;
      return primarySong;
    }
  } catch (err) {
    console.error('[Search] Error mencari lagu:', err);
  }
  return null;
}

// ============================================================================
// 5. LOGIKA ANTREAN LAGU, SKIP & REVOKE
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

  // 3. Cek Interaksi Chat (Pusat Interaksi)
  for (const inter of interactions) {
    if (!inter.enabled || inter.trigger?.type !== 'chat') continue;
    const kw = (inter.trigger.chatKeyword || '').toLowerCase().trim();
    if (kw && lowerComment.includes(kw)) {
      triggerInteraction(inter, { user, comment });
    }
  }

  // 4. Cek !play (Song Request)
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
// 6. KONEKSI TIKTOK LIVE REALTIME (v2.5.0 - ZERO COOKIE & ZERO KEY)
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

    // 1. Event Chat
    conn.on(WebcastEvent.CHAT, async data => {
      const user = data.user?.uniqueId || data.user?.nickname || 'Viewer';
      const comment = data.content?.trim() || '';
      const isModerator = !!(data.user?.userRole === 1 || data.user?.isOwner || isUserHost(user));
      console.log(`[TikTok Chat] @${user}: ${comment}`);
      await processIncomingChatMessage(user, comment, isModerator);
    });

    // 2. Event Gift (Pusat Interaksi)
    conn.on(WebcastEvent.GIFT, data => {
      const user = data.user?.uniqueId || data.user?.nickname || 'Viewer';
      const giftName = data.giftName || data.giftDetails?.giftName || 'Gift';
      const diamonds = data.diamondCount || 1;
      const repeatCount = data.repeatCount || 1;
      const avatar = data.user?.profilePictureUrls?.[0] || '';
      const totalDiamonds = diamonds * repeatCount;

      console.log(`[TikTok Gift] 🎁 @${user} mengirim ${repeatCount}x ${giftName} (${totalDiamonds} total koin)`);

      for (const inter of interactions) {
        if (!inter.enabled || inter.trigger?.type !== 'gift') continue;
        const reqGift = (inter.trigger.giftName || '').toLowerCase().trim();
        const minCoins = inter.trigger.minCoins || 0;

        const matchesName = !reqGift || reqGift === 'semua gift' || reqGift === 'any' || giftName.toLowerCase().includes(reqGift);
        const matchesCoins = totalDiamonds >= minCoins || diamonds >= minCoins;

        if (matchesName && matchesCoins) {
          triggerInteraction(inter, { user, avatar, giftName, count: repeatCount, diamonds: totalDiamonds });
        }
      }
    });

    // 3. Event Like / Tap-tap Layar (Pusat Interaksi)
    conn.on(WebcastEvent.LIKE, data => {
      const user = data.user?.uniqueId || data.user?.nickname || 'Viewer';
      const likeCount = data.likeCount || 1;
      accumulatedLikes += likeCount;

      for (const inter of interactions) {
        if (!inter.enabled || inter.trigger?.type !== 'like') continue;
        const targetLikes = inter.trigger.likeCount || 50;
        if (accumulatedLikes >= targetLikes) {
          accumulatedLikes = 0;
          triggerInteraction(inter, { user, count: targetLikes });
        }
      }
    });

    // 4. Event Social (Follow & Share) (Pusat Interaksi)
    conn.on(WebcastEvent.SOCIAL, data => {
      const user = data.user?.uniqueId || data.user?.nickname || 'Viewer';
      const displayType = String(data.displayType || '');
      const isFollow = displayType.includes('follow');
      const isShare = displayType.includes('share');

      if (isFollow) {
        console.log(`[TikTok Follow] 🌟 @${user} mulai mengikuti streamer!`);
        for (const inter of interactions) {
          if (!inter.enabled || inter.trigger?.type !== 'follow') continue;
          triggerInteraction(inter, { user });
        }
      } else if (isShare) {
        console.log(`[TikTok Share] 📢 @${user} membagikan siaran live!`);
        for (const inter of interactions) {
          if (!inter.enabled || inter.trigger?.type !== 'share') continue;
          triggerInteraction(inter, { user });
        }
      }
    });

    // 5. Event Member Masuk
    conn.on(WebcastEvent.MEMBER, data => {
      const user = data.user?.uniqueId || data.user?.nickname || 'Viewer';
      for (const inter of interactions) {
        if (!inter.enabled || inter.trigger?.type !== 'join') continue;
        triggerInteraction(inter, { user });
      }
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
// 7. HTTP SERVER & REST API (UNTUK OVERLAY & DASHBOARD PUSAT INTERAKSI)
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

  // 1. Halaman Overlay OBS (/overlay atau /overlay/alerts)
  if (pathname === '/overlay' || pathname === '/overlay/alerts') {
    const filePath = path.join(__dirname, 'overlay.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Gagal memuat overlay');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(data);
    });
    return;
  }

  // 2. Halaman Dashboard Pengontrol Streamer (/control atau /)
  if (pathname === '/control' || pathname === '/' || pathname === '/admin/pusat-interaksi') {
    const filePath = path.join(__dirname, 'control.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Gagal memuat dashboard');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(data);
    });
    return;
  }

  // 2b. Static File Asset (Video JJ / Audio / Gambar Kustom) (/assets/*)
  if (pathname.startsWith('/assets/')) {
    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(__dirname, safePath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.gif': 'image/gif',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.txt': 'text/plain'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(fullPath).pipe(res);
      return;
    }
  }

  // 2c. Ambil Daftar File Asset (Video / Audio Lokal di Folder /assets) (/api/assets/list)
  if (pathname === '/api/assets/list' && req.method === 'GET') {
    const assetsDir = path.join(__dirname, 'assets');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    try {
      const files = fs.readdirSync(assetsDir).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.mp4', '.webm', '.mp3', '.wav', '.ogg', '.gif', '.png', '.jpg', '.jpeg'].includes(ext);
      }).map(f => {
        const stats = fs.statSync(path.join(assetsDir, f));
        return {
          name: f,
          url: `/assets/${f}`,
          size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
          ext: path.extname(f).toLowerCase()
        };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, files }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 2d. Upload File Video / Audio Kustom dari Komputer Streamer (/api/upload/video)
  if (pathname === '/api/upload/video' && req.method === 'POST') {
    const assetsDir = path.join(__dirname, 'assets');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

    let rawFilename = parsedUrl.searchParams.get('filename') || ('video_' + Date.now() + '.mp4');
    let ext = path.extname(rawFilename) || '.mp4';
    let base = path.basename(rawFilename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    let cleanName = `${base}${ext}`;
    let targetPath = path.join(assetsDir, cleanName);

    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      try {
        const data = await readJsonBody();
        if (!data.base64) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Data base64 diperlukan' }));
          return;
        }
        let targetFilename = data.filename || rawFilename;
        let fileExt = path.extname(targetFilename) || '.mp4';
        let baseName = path.basename(targetFilename, fileExt).replace(/[^a-zA-Z0-9_-]/g, '_');
        let finalCleanName = `${baseName}${fileExt}`;
        let actualTargetPath = path.join(assetsDir, finalCleanName);

        const cleanBase64 = data.base64.replace(/^data:[^;]+;base64,/, '');
        fs.writeFileSync(actualTargetPath, Buffer.from(cleanBase64, 'base64'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, url: `/assets/${finalCleanName}`, filename: finalCleanName }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
      return;
    } else {
      const fileStream = fs.createWriteStream(targetPath);
      req.pipe(fileStream);
      fileStream.on('finish', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, url: `/assets/${cleanName}`, filename: cleanName }));
      });
      fileStream.on('error', (err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
      return;
    }
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
      serverStartTime: SERVER_START_TIME,
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
      skipVotesNeeded: config.skipVotesNeeded || 2,
      masterSwitches: config.masterSwitches || {},
      interactionsCount: interactions.length,
      recentAlertLogs: recentAlertLogs.slice(0, 15),
      overlayConfig: config.overlayConfig || {}
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
      console.log(`[API /api/skip]: user=${data.user}, isMod=${data.isModerator}, reason=${data.reason}, error=${data.errorCode}`);
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

  // 11. API Pusat Interaksi - Ambil Daftar Interaksi & Master Switches (/api/interactions)
  if (pathname === '/api/interactions' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      interactions,
      masterSwitches: config.masterSwitches || {},
      recentAlertLogs: recentAlertLogs.slice(0, 30)
    }));
    return;
  }

  // 12. API Pusat Interaksi - Toggle Master Switch (/api/interactions/master-switch)
  if (pathname === '/api/interactions/master-switch' && req.method === 'POST') {
    try {
      const data = await readJsonBody();
      if (!config.masterSwitches) config.masterSwitches = {};
      if (data.key && typeof data.value === 'boolean') {
        config.masterSwitches[data.key] = data.value;
        saveConfig();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, masterSwitches: config.masterSwitches }));
        return;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Key dan boolean value diperlukan' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 13. API Pusat Interaksi - Toggle Single Interaction On/Off (/api/interactions/toggle)
  if (pathname === '/api/interactions/toggle' && req.method === 'POST') {
    try {
      const data = await readJsonBody();
      const item = interactions.find(i => i.id === data.id);
      if (item) {
        item.enabled = !item.enabled;
        saveInteractions();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, enabled: item.enabled, id: item.id }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Interaksi tidak ditemukan' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 14. API Pusat Interaksi - Simpan / Buat Interaksi (/api/interactions/save)
  if (pathname === '/api/interactions/save' && req.method === 'POST') {
    try {
      const data = await readJsonBody();
      if (data.interaction) {
        const idx = interactions.findIndex(i => i.id === data.interaction.id);
        if (idx !== -1) {
          interactions[idx] = { ...interactions[idx], ...data.interaction };
        } else {
          interactions.push({
            id: 'act-' + Date.now(),
            enabled: true,
            ...data.interaction
          });
        }
        saveInteractions();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, interactions }));
        return;
      }
      if (Array.isArray(data.interactions)) {
        interactions = data.interactions;
        saveInteractions();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, interactions }));
        return;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Data interaksi tidak valid' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 15. API Pusat Interaksi - Hapus Interaksi (/api/interactions/delete)
  if (pathname === '/api/interactions/delete' && req.method === 'POST') {
    try {
      const data = await readJsonBody();
      const idx = interactions.findIndex(i => i.id === data.id);
      if (idx !== -1) {
        const removed = interactions.splice(idx, 1)[0];
        saveInteractions();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, removed }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Interaksi tidak ditemukan' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 16. API Pusat Interaksi - Uji Coba / Test Interaksi Langsung (/api/interactions/test)
  if (pathname === '/api/interactions/test' && req.method === 'POST') {
    try {
      const data = await readJsonBody();
      const item = interactions.find(i => i.id === data.id) || interactions[0];
      if (item) {
        const alert = triggerInteraction(item, {
          user: data.user || 'Tester_Interaksi',
          giftName: item.trigger?.giftName || 'Rose',
          count: 1
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, alert }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Tidak ada interaksi untuk dites' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 17. API Simulator Interaksi (/api/simulator/event)
  if (pathname === '/api/simulator/event' && req.method === 'POST') {
    try {
      const data = await readJsonBody();
      const user = data.user || 'Viewer_Simulasi';
      const eventType = data.type || 'gift';

      if (eventType === 'gift') {
        const giftName = data.giftName || 'Gift';
        const count = Number(data.count) || 1;
        const diamonds = Number(data.diamonds) || 1;
        const totalCoins = diamonds * count;
        for (const inter of interactions) {
          if (!inter.enabled || inter.trigger?.type !== 'gift') continue;
          const reqGift = (inter.trigger.giftName || '').toLowerCase().trim();
          const minCoins = Number(inter.trigger.minCoins) || 0;
          const matchesName = !reqGift || reqGift === 'semua gift' || reqGift === 'any' || giftName.toLowerCase().includes(reqGift);
          const matchesCoins = totalCoins >= minCoins || diamonds >= minCoins;
          if (matchesName && matchesCoins) {
            triggerInteraction(inter, { user, giftName, count, diamonds: totalCoins });
          }
        }
      } else if (eventType === 'like') {
        for (const inter of interactions) {
          if (!inter.enabled || inter.trigger?.type !== 'like') continue;
          triggerInteraction(inter, { user, count: 50 });
        }
      } else if (eventType === 'follow') {
        for (const inter of interactions) {
          if (!inter.enabled || inter.trigger?.type !== 'follow') continue;
          triggerInteraction(inter, { user });
        }
      } else if (eventType === 'share') {
        for (const inter of interactions) {
          if (!inter.enabled || inter.trigger?.type !== 'share') continue;
          triggerInteraction(inter, { user });
        }
      } else if (eventType === 'chat') {
        await processIncomingChatMessage(user, data.comment || '!jump');
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 18. API Alert Poll untuk Overlay OBS (/api/alerts/poll)
  if (pathname === '/api/alerts/poll' && req.method === 'GET') {
    const alertsToReturn = [...pendingAlerts];
    pendingAlerts = []; // Kosongkan antrean setelah diambil oleh overlay
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      alerts: alertsToReturn,
      masterSwitches: config.masterSwitches || {}
    }));
    return;
  }

  // 19. API Konfigurasi Posisi & Skala Overlay (/api/overlay/config)
  if (pathname === '/api/overlay/config' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config.overlayConfig || { pos: 'top-left', x: 24, y: 24, scale: 1.0, locked: false }));
    return;
  }

  if (pathname === '/api/overlay/config' && req.method === 'POST') {
    try {
      const data = await readJsonBody();
      config.overlayConfig = { ...(config.overlayConfig || {}), ...data };
      saveConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, overlayConfig: config.overlayConfig }));
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
  console.log(' 🎵 AMBAFINITY - TIKTOK LIVE PUSAT INTERAKSI & OVERLAY SUITE');
  console.log('================================================================');
  console.log(` 🌐 Dashboard Kontrol : http://localhost:${PORT}/control`);
  console.log(` ⚡ Pusat Interaksi   : http://localhost:${PORT}/admin/pusat-interaksi`);
  console.log(` 📺 OBS Browser Source: http://localhost:${PORT}/overlay`);
  console.log('================================================================');
  console.log(' Menunggu aktivitas dari live stream...');
});
