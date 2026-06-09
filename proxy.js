/**
 * proxy.js — Détection live TikTok via WebcastPushConnection
 * Utilise la même logique stable que server.js
 * Hébergé sur Render.com (free tier)
 */

const http = require('http');
const { WebcastPushConnection } = require('tiktok-live-connector');

const PORT = process.env.PORT || 4242;
const DEFAULT_USERNAME = process.env.TIKTOK_USER || 'papyoursdetiktok';

// ═══════════════════════════════════════════════════════════════════════════════════
// 🔌 État TikTok
// ═══════════════════════════════════════════════════════════════════════════════════

const tiktokConnections = new Map(); // username → { connection, isLive, title, viewerCount, roomStatus }

function getOrCreateConnection(username) {
  if (tiktokConnections.has(username)) {
    return tiktokConnections.get(username);
  }
  
  const state = {
    connection: new WebcastPushConnection(username),
    isLive: false,
    title: null,
    viewerCount: 0,
    roomStatus: null,
    lastChecked: null,
    error: null,
  };
  
  tiktokConnections.set(username, state);
  
  // Connexion
  state.connection.connect()
    .then(async () => {
      console.log(`✅ TikTok connecté: @${username}`);
      state.error = null;
      
      // Événement: live room info
      state.connection.on('roomUser', data => {
        state.viewerCount = data.viewerCount || 0;
        state.roomStatus = 'connected';
        console.log(`👥 [@${username}] Viewers: ${state.viewerCount}`);
      });
      
      // Événement: title/room update
      state.connection.on('like', data => {
        // On reçoit des events = la personne est EN LIVE
        if (!state.isLive) {
          state.isLive = true;
          console.log(`🔴 [@${username}] LIVE DÉTECTÉ`);
        }
      });
      
      state.connection.on('gift', data => {
        if (!state.isLive) {
          state.isLive = true;
          console.log(`🔴 [@${username}] LIVE DÉTECTÉ (gift)`);
        }
      });
      
      state.connection.on('chat', data => {
        if (!state.isLive) {
          state.isLive = true;
          console.log(`🔴 [@${username}] LIVE DÉTECTÉ (chat)`);
        }
      });
      
      state.connection.on('follow', data => {
        if (!state.isLive) {
          state.isLive = true;
          console.log(`🔴 [@${username}] LIVE DÉTECTÉ (follow)`);
        }
      });
      
    })
    .catch(err => {
      // Utilisateur hors ligne ou erreur
      state.isLive = false;
      state.error = err.message || 'Utilisateur hors ligne';
      console.log(`⏳ [@${username}] ${state.error}`);
      
      // Retry dans 30s
      setTimeout(() => {
        console.log(`🔄 Retry connexion @${username}...`);
        tiktokConnections.delete(username);
        getOrCreateConnection(username);
      }, 30000);
    });
  
  // Déconnexion
  state.connection.on('disconnected', () => {
    console.log(`⚠️ [@${username}] Déconnecté, retry dans 10s...`);
    state.isLive = false;
    state.roomStatus = null;
    
    setTimeout(() => {
      tiktokConnections.delete(username);
      getOrCreateConnection(username);
    }, 10000);
  });
  
  return state;
}

// ═══════════════════════════════════════════════════════════════════════════════════
// 🌐 HTTP SERVER
// ═══════════════════════════════════════════════════════════════════════════════════

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer(async (req, res) => {
  setCORS(res);
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ✅ GET /status?user=USERNAME
  if (url.pathname === '/status') {
    const username = (url.searchParams.get('user') || DEFAULT_USERNAME).replace(/[^a-zA-Z0-9_.]/g, '');
    
    const state = getOrCreateConnection(username);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      isLive: state.isLive,
      username: username,
      title: state.title,
      viewerCount: state.viewerCount,
      roomStatus: state.roomStatus,
      checkedAt: new Date().toISOString(),
      error: state.error,
    }));
    
    if (state.isLive) {
      console.log(`[${new Date().toLocaleTimeString()}] @${username} → 🔴 LIVE`);
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] @${username} → ⚫ offline`);
    }
    
    return;
  }

  // ✅ GET /health
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ✅ GET / (info)
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      service: 'TikTok Live Status Proxy',
      version: '2.0',
      endpoints: {
        '/status?user=USERNAME': 'Check if user is live',
        '/health': 'Health check',
      },
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🚀 Proxy TikTok démarré sur port ${PORT}`);
  console.log(`   GET /status?user=USERNAME`);
  console.log(`   GET /health`);
  console.log(`   Utilise tiktok-live-connector (stable) au lieu du scraping HTTP`);
});
