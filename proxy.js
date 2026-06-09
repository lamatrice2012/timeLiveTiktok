/**
 * proxy.js — Détection live TikTok
 * Hébergé sur Render.com (free tier)
 */

const http  = require('http');
const https = require('https');

const PORT     = process.env.PORT || 4242;
const USERNAME = process.env.TIKTOK_USER || 'warriorsgamingsurvival';

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function fetchTikTok(username) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.tiktok.com',
      path: `/@${username}/live`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function detectLive(html, statusCode) {
  if (statusCode >= 300 && statusCode < 400) return false;
  const positive = [
    '"roomStatus":2',
    '"isLiveBroadcasting":true',
    '"liveRoomStatus":2',
    '"status":2',
    'LIVE_ROOM_STATUS_STREAMING',
  ];
  const negative = [
    '"roomStatus":0',
    '"roomStatus":4',
    '"liveRoomStatus":0',
    '"isLiveBroadcasting":false',
  ];
  const hasPos = positive.some(s => html.includes(s));
  const hasNeg = negative.some(s => html.includes(s));
  if (hasPos && !hasNeg) return true;
  if (!hasNeg && html.includes('"liveRoom"') && html.includes('"viewerCount"')) return true;
  return false;
}

const server = http.createServer(async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/status') {
    const username = (url.searchParams.get('user') || USERNAME).replace(/[^a-zA-Z0-9_.]/g, '');
    try {
      const { status, body } = await fetchTikTok(username);
      const isLive = detectLive(body, status);
      let title = null;
      const m = body.match(/"title"\s*:\s*"([^"]{1,120})"/);
      if (m) title = m[1];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ isLive, username, title, checkedAt: new Date().toISOString() }));
      console.log(`[${new Date().toLocaleTimeString()}] @${username} → ${isLive ? '🔴 LIVE' : '⚫ offline'}`);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Proxy démarré sur port ${PORT}`);
});
