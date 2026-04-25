/**
 * Seedance Studio — Backend Server
 *
 * - Serves the HTML frontend
 * - Auth: /auth/register, /auth/login, /auth/logout, /auth/me
 * - Library: GET /library, POST /library  (per-user)
 * - Proxy: /proxy/* → BytePlus ModelArk API
 *
 * Database: Upstash Redis (via REST API) when env vars are set,
 *           falls back to local db.json for development.
 *
 * No npm install needed — uses only built-in Node.js modules.
 */

const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const PORT          = process.env.PORT || 3000;
const BYTEPLUS      = 'ark.ap-southeast.bytepluses.com';
const DB_FILE       = path.join(__dirname, 'db.json');
const REDIS_URL     = (process.env.UPSTASH_REDIS_REST_URL  || '').replace(/\/$/, '');
const REDIS_TOKEN   = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REDIS_KEY     = 'seedance_db';
const RESEND_KEY    = process.env.RESEND_API_KEY || '';
const BREVO_KEY     = process.env.BREVO_API_KEY  || '';
const BREVO_SENDER  = process.env.BREVO_SENDER_EMAIL || '';
const APP_URL       = process.env.APP_URL || 'http://localhost:3000';

// ── In-memory DB cache ────────────────────────────────────────────────────────
let dbCache = { users: {}, emailIndex: {}, sessions: {}, library: {}, verifyCodes: {}, resetCodes: {} };

// Safety flag: only write to Redis AFTER we've confirmed Redis responded at startup.
// This prevents wiping Redis with an empty DB when Redis was temporarily unreachable on boot.
let redisReady = false;

// ── Upstash Redis helpers ─────────────────────────────────────────────────────
function redisCmd(cmd, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    if (!REDIS_URL || !REDIS_TOKEN) return reject(new Error('No Redis config'));
    const u    = new URL(REDIS_URL);
    const body = Buffer.from(JSON.stringify(cmd));
    const opts = {
      hostname: u.hostname, port: 443, path: u.pathname || '/',
      method: 'POST',
      headers: {
        'Authorization':  'Bearer ' + REDIS_TOKEN,
        'Content-Type':   'application/json',
        'Content-Length': body.length,
      }
    };
    const req = https.request(opts, res => {
      const ch = []; res.on('data', c => ch.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(ch).toString())); }
        catch(e) { reject(e); }
      });
    });
    // Abort if Redis hangs — prevents server from stalling on boot
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Redis timeout after ' + timeoutMs + 'ms')));
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function redisSave(db) {
  try {
    await redisCmd(['SET', REDIS_KEY, JSON.stringify(db)]);
    console.log('[redis] saved OK');
  } catch(e) { console.error('[redis] save error:', e.message); }
}

async function redisLoad() {
  // Returns { data, ok } — ok=true means Redis responded (even if no data yet)
  try {
    const r = await redisCmd(['GET', REDIS_KEY]);
    const data = r.result ? JSON.parse(r.result) : null;
    return { data, ok: true };
  } catch(e) {
    console.error('[redis] load error:', e.message);
    return { data: null, ok: false };
  }
}

// ── Database (sync interface, async persistence) ──────────────────────────────
function loadDB() { return dbCache; }

function saveDB(db) {
  dbCache = db;
  if (REDIS_URL && REDIS_TOKEN) {
    if (!redisReady) {
      // Redis didn't respond at startup — refuse to overwrite Redis with potentially stale data
      console.warn('[db] saveDB: skipping Redis write — Redis was unreachable at startup. Data saved in-memory only.');
      return;
    }
    redisSave(db); // async, fire-and-forget
  } else {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8'); } catch {}
  }
}

async function initDB() {
  try {
    if (REDIS_URL && REDIS_TOKEN) {
      console.log('[db] Using Upstash Redis — loading...');
      const { data, ok } = await redisLoad();
      if (ok) {
        redisReady = true;
        if (data) {
          dbCache = { verifyCodes: {}, resetCodes: {}, ...data };
          const userCount = Object.keys(data.users || {}).length;
          console.log(`[db] Loaded from Redis — ${userCount} user(s)`);
        } else {
          console.log('[db] Redis reachable — fresh empty DB');
        }
      } else {
        redisReady = false;
        console.error('[db] Redis unreachable at startup — starting background retry...');
        retryRedisBackground();
      }
    } else {
      console.log('[db] Using local db.json');
      try {
        const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        dbCache = { verifyCodes: {}, resetCodes: {}, ...raw };
      } catch { /* fresh db */ }
    }
  } catch(e) {
    console.error('[db] initDB error (continuing with empty db):', e.message);
  }
}

// Keeps retrying Redis every 10s until it responds, then restores dbCache.
// Safe to overwrite because redisReady=false blocks all writes, so in-memory
// state has no new data worth keeping.
async function retryRedisBackground() {
  for (let i = 1; i <= 30; i++) {
    await new Promise(r => setTimeout(r, 10000));
    if (redisReady) return;
    console.log('[redis] background retry attempt', i);
    try {
      const { data, ok } = await redisLoad();
      if (ok) {
        redisReady = true;
        if (data) {
          dbCache = { verifyCodes: {}, resetCodes: {}, ...data };
          console.log('[redis] background retry succeeded —', Object.keys(data.users || {}).length, 'users restored');
        } else {
          console.log('[redis] background retry succeeded — empty DB');
        }
        return;
      }
    } catch(e) {
      console.error('[redis] background retry error:', e.message);
    }
  }
  console.error('[redis] background retry exhausted after 30 attempts (~5 min)');
}

// ── Email (Brevo preferred, Resend fallback) ──────────────────────────────────
function sendEmail(to, subject, html) {
  return new Promise((resolve) => {
    // ── Brevo ──
    if (BREVO_KEY && BREVO_SENDER) {
      const body = Buffer.from(JSON.stringify({
        sender:      { email: BREVO_SENDER, name: 'Seedance Studio' },
        to:          [{ email: to }],
        subject,
        htmlContent: html
      }));
      const opts = {
        hostname: 'api.brevo.com', port: 443, path: '/v3/smtp/email', method: 'POST',
        headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json', 'Content-Length': body.length }
      };
      const req = https.request(opts, res => {
        const ch = []; res.on('data', c => ch.push(c));
        res.on('end', () => {
          try { const j = JSON.parse(Buffer.concat(ch).toString()); console.log('[email/brevo] sent to', to, '->', j.messageId || JSON.stringify(j)); resolve(j); }
          catch(e) { console.error('[email/brevo] parse error', e.message); resolve({}); }
        });
      });
      req.on('error', e => { console.error('[email/brevo] error', e.message); resolve({}); });
      req.write(body); req.end();
      return;
    }

    // ── Resend fallback ──
    if (RESEND_KEY) {
      const body = Buffer.from(JSON.stringify({
        from: 'Seedance Studio <onboarding@resend.dev>',
        to:   [to], subject, html
      }));
      const opts = {
        hostname: 'api.resend.com', port: 443, path: '/emails', method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json', 'Content-Length': body.length }
      };
      const req = https.request(opts, res => {
        const ch = []; res.on('data', c => ch.push(c));
        res.on('end', () => {
          try { const j = JSON.parse(Buffer.concat(ch).toString()); console.log('[email/resend] sent to', to, '->', j.id || j.name); resolve(j); }
          catch(e) { console.error('[email/resend] parse error', e.message); resolve({}); }
        });
      });
      req.on('error', e => { console.error('[email/resend] error', e.message); resolve({}); });
      req.write(body); req.end();
      return;
    }

    console.log('[email] No email provider configured — skipping email to', to);
    resolve({ skipped: true });
  });
}

function makeCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

// ── Auth helpers ──────────────────────────────────────────────────────────────
function hashPass(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}
function makeToken() { return crypto.randomBytes(32).toString('hex'); }
function makeId()    { return crypto.randomBytes(16).toString('hex'); }

function getSession(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const db   = loadDB();
  const sess = db.sessions[token];
  return sess ? { token, userId: sess.userId } : null;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function readBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
  });
}

// ── Serve HTML ────────────────────────────────────────────────────────────────
function serveHTML(res) {
  fs.readFile(path.join(__dirname, 'seedance-studio.html'), (err, data) => {
    if (err) { res.writeHead(404); res.end('seedance-studio.html not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}

// ── BytePlus proxy ────────────────────────────────────────────────────────────
function proxy(req, res, bodyBuffer) {
  const target = req.url.slice(6); // strip /proxy

  const isTask  = target.includes('contents/generations') || target.includes('content_generation');
  const isFiles = target.startsWith('/api/v3/files');
  if (isTask || isFiles) {
    process.stdout.write('\n-> ' + req.method + ' ' + target + '\n');
    if (bodyBuffer && bodyBuffer.length && (req.headers['content-type'] || '').includes('json')) {
      try { process.stdout.write('  REQ: ' + JSON.stringify(JSON.parse(bodyBuffer.toString()), null, 2) + '\n'); } catch {}
    }
  }

  const options = { hostname: BYTEPLUS, port: 443, path: target, method: req.method, headers: {} };

  const skip = new Set(['host', 'origin', 'referer', 'accept-encoding']);
  for (const [k, v] of Object.entries(req.headers)) {
    if (!skip.has(k.toLowerCase())) options.headers[k] = v;
  }
  options.headers['accept-encoding'] = 'identity';

  const proxyReq = https.request(options, proxyRes => {
    const outHeaders = {
      ...proxyRes.headers,
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    };

    if (isTask || isFiles) {
      const chunks = [];
      proxyRes.on('data', c => chunks.push(c));
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks);
        process.stdout.write('<- ' + proxyRes.statusCode + '\n');
        try { process.stdout.write('  RES: ' + JSON.stringify(JSON.parse(body.toString()), null, 2) + '\n'); }
        catch { process.stdout.write('  RES (raw): ' + body.toString().substring(0, 800) + '\n'); }
        res.writeHead(proxyRes.statusCode, outHeaders);
        res.end(body);
      });
    } else {
      res.writeHead(proxyRes.statusCode, outHeaders);
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', e => {
    console.error('Proxy error:', e.message);
    res.writeHead(502);
    res.end(JSON.stringify({ error: { message: 'Proxy error: ' + e.message } }));
  });

  if (bodyBuffer && bodyBuffer.length) proxyReq.write(bodyBuffer);
  proxyReq.end();
}

// ── Main request handler ──────────────────────────────────────────────────────
async function handleRequest(req, res) {
  const { method, url } = req;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    });
    return res.end();
  }

  // Health check (Render uses this)
  if (url === '/health' || url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  // Frontend — strip query strings/fragments so messenger tracking params (?fbclid= etc.) don't break it
  const pathname = url.split('?')[0].split('#')[0];
  if (pathname === '/' || pathname === '/index.html') return serveHTML(res);

  // ── Register ──────────────────────────────────────────────────────────────
  if (url === '/auth/register' && method === 'POST') {
    const { email, password } = await readBody(req);
    if (!email || !password)   return sendJSON(res, 400, { error: 'Email and password required' });
    if (password.length < 8)   return sendJSON(res, 400, { error: 'Password must be at least 8 characters' });
    const db  = loadDB();
    const key = email.toLowerCase().trim();
    if (db.emailIndex[key])    return sendJSON(res, 409, { error: 'This email is already registered. Try signing in.' });
    const userId = makeId();
    const salt   = crypto.randomBytes(16).toString('hex');
    const needsVerify = !!RESEND_KEY;
    db.users[userId]   = { email: key, hash: hashPass(password, salt), salt, createdAt: Date.now(), verified: !needsVerify };
    db.emailIndex[key] = userId;
    db.library[userId] = [];
    if (!db.verifyCodes) db.verifyCodes = {};
    if (!db.resetCodes)  db.resetCodes  = {};
    if (needsVerify) {
      const code = makeCode();
      db.verifyCodes[key] = { code, expires: Date.now() + 15 * 60 * 1000 };
      saveDB(db);
      await sendEmail(key, 'Verify your Seedance Studio account',
        `<div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>🎬 Verify your email</h2>
          <p>Your verification code is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:10px;text-align:center;padding:20px;background:#f4f4f4;border-radius:8px">${code}</div>
          <p style="color:#888;font-size:13px">This code expires in 15 minutes.</p>
        </div>`);
      return sendJSON(res, 200, { needsVerify: true, email: key });
    }
    const token = makeToken();
    db.sessions[token] = { userId, createdAt: Date.now() };
    saveDB(db);
    return sendJSON(res, 200, { token, email: key, userId });
  }

  // ── Verify email ──────────────────────────────────────────────────────────
  if (url === '/auth/verify-email' && method === 'POST') {
    const { email, code } = await readBody(req);
    const db  = loadDB();
    const key = (email || '').toLowerCase().trim();
    const vc  = (db.verifyCodes || {})[key];
    if (!vc || vc.code !== code) return sendJSON(res, 400, { error: 'Invalid or expired code. Check your email or request a new code.' });
    if (Date.now() > vc.expires) return sendJSON(res, 400, { error: 'Code expired. Request a new one.' });
    const userId = db.emailIndex[key];
    if (!userId) return sendJSON(res, 400, { error: 'Account not found' });
    db.users[userId].verified = true;
    delete db.verifyCodes[key];
    const token = makeToken();
    db.sessions[token] = { userId, createdAt: Date.now() };
    saveDB(db);
    return sendJSON(res, 200, { token, email: key, userId });
  }

  // ── Resend verification code ───────────────────────────────────────────────
  if (url === '/auth/resend-verify' && method === 'POST') {
    const { email } = await readBody(req);
    const db  = loadDB();
    const key = (email || '').toLowerCase().trim();
    const userId = db.emailIndex[key];
    if (!userId) return sendJSON(res, 404, { error: 'Email not found' });
    if (db.users[userId].verified) return sendJSON(res, 400, { error: 'Already verified' });
    if (!db.verifyCodes) db.verifyCodes = {};
    const code = makeCode();
    db.verifyCodes[key] = { code, expires: Date.now() + 15 * 60 * 1000 };
    saveDB(db);
    await sendEmail(key, 'Your new Seedance Studio verification code',
      `<div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>🎬 New verification code</h2>
        <div style="font-size:36px;font-weight:bold;letter-spacing:10px;text-align:center;padding:20px;background:#f4f4f4;border-radius:8px">${code}</div>
        <p style="color:#888;font-size:13px">This code expires in 15 minutes.</p>
      </div>`);
    return sendJSON(res, 200, { ok: true });
  }

  // ── Forgot password ───────────────────────────────────────────────────────
  if (url === '/auth/forgot-password' && method === 'POST') {
    const { email } = await readBody(req);
    const db  = loadDB();
    const key = (email || '').toLowerCase().trim();
    const userId = db.emailIndex[key];
    // Always return ok to not leak whether email exists
    if (userId && RESEND_KEY) {
      if (!db.resetCodes) db.resetCodes = {};
      const code = makeCode();
      db.resetCodes[key] = { code, expires: Date.now() + 15 * 60 * 1000 };
      saveDB(db);
      await sendEmail(key, 'Reset your Seedance Studio password',
        `<div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>🎬 Password reset</h2>
          <p>Your reset code is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:10px;text-align:center;padding:20px;background:#f4f4f4;border-radius:8px">${code}</div>
          <p style="color:#888;font-size:13px">This code expires in 15 minutes. If you didn't request this, ignore this email.</p>
        </div>`);
    }
    return sendJSON(res, 200, { ok: true });
  }

  // ── Reset password ────────────────────────────────────────────────────────
  if (url === '/auth/reset-password' && method === 'POST') {
    const { email, code, password } = await readBody(req);
    if (!password || password.length < 8) return sendJSON(res, 400, { error: 'Password must be at least 8 characters' });
    const db  = loadDB();
    const key = (email || '').toLowerCase().trim();
    const rc  = (db.resetCodes || {})[key];
    if (!rc || rc.code !== code) return sendJSON(res, 400, { error: 'Invalid or expired code.' });
    if (Date.now() > rc.expires) return sendJSON(res, 400, { error: 'Code expired. Request a new one.' });
    const userId = db.emailIndex[key];
    if (!userId) return sendJSON(res, 400, { error: 'Account not found' });
    const salt = crypto.randomBytes(16).toString('hex');
    db.users[userId].hash = hashPass(password, salt);
    db.users[userId].salt = salt;
    db.users[userId].verified = true;
    delete db.resetCodes[key];
    const token = makeToken();
    db.sessions[token] = { userId, createdAt: Date.now() };
    saveDB(db);
    return sendJSON(res, 200, { token, email: key, userId });
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  if (url === '/auth/login' && method === 'POST') {
    const { email, password } = await readBody(req);
    if (!email || !password) return sendJSON(res, 400, { error: 'Email and password required' });
    const db     = loadDB();
    const key    = email.toLowerCase().trim();
    const userId = db.emailIndex[key];
    if (!userId)             return sendJSON(res, 401, { error: 'Invalid email or password' });
    const user   = db.users[userId];
    if (hashPass(password, user.salt) !== user.hash)
                             return sendJSON(res, 401, { error: 'Invalid email or password' });
    if (RESEND_KEY && !user.verified) return sendJSON(res, 403, { error: 'Please verify your email first.', needsVerify: true, email: key });
    const token = makeToken();
    db.sessions[token] = { userId, createdAt: Date.now() };
    saveDB(db);
    return sendJSON(res, 200, { token, email: user.email, userId });
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  if (url === '/auth/logout' && method === 'POST') {
    const sess = getSession(req);
    if (sess) { const db = loadDB(); delete db.sessions[sess.token]; saveDB(db); }
    return sendJSON(res, 200, { ok: true });
  }

  // ── Me ────────────────────────────────────────────────────────────────────
  if (url === '/auth/me' && method === 'GET') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    const db   = loadDB();
    const user = db.users[sess.userId];
    return sendJSON(res, 200, { email: user.email, userId: sess.userId });
  }

  // ── Get library ───────────────────────────────────────────────────────────
  if (url === '/library' && method === 'GET') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    const db   = loadDB();
    return sendJSON(res, 200, { library: db.library[sess.userId] || [] });
  }

  // ── Save library ──────────────────────────────────────────────────────────
  if (url === '/library' && method === 'POST') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    const body = await readBody(req);
    const db   = loadDB();
    db.library[sess.userId] = body.library || [];
    saveDB(db);
    return sendJSON(res, 200, { ok: true });
  }

  // ── File URL resolver ─────────────────────────────────────────────────────
  if (url.startsWith('/file-url/') && method === 'GET') {
    const fileId = url.slice(10);
    const apiKey = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    if (!apiKey) return sendJSON(res, 401, { error: 'Missing API key' });

    function byteplusGet(p) {
      return new Promise((resolve, reject) => {
        const opts = { hostname: BYTEPLUS, port: 443, path: p, method: 'GET',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'accept-encoding': 'identity' } };
        const r = https.request(opts, resp => {
          const chunks = [];
          resp.on('data', c => chunks.push(c));
          resp.on('end', () => resolve({ status: resp.statusCode, headers: resp.headers, body: Buffer.concat(chunks).toString() }));
        });
        r.on('error', reject); r.end();
      });
    }

    try {
      for (let i = 0; i < 10; i++) {
        const meta = await byteplusGet('/api/v3/files/' + fileId);
        const j = JSON.parse(meta.body);
        if (j.url || j.download_url) return sendJSON(res, 200, { url: j.url || j.download_url });
        if (j.status !== 'processing') break;
        await new Promise(r => setTimeout(r, 3000));
      }
      return sendJSON(res, 404, { error: 'Could not resolve download URL for ' + fileId });
    } catch(e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  // ── Temp video upload ─────────────────────────────────────────────────────
  if (url.startsWith('/upload-temp') && method === 'POST') {
    const qs     = url.includes('?') ? url.split('?')[1] : '';
    const params = new URLSearchParams(qs);
    const name   = params.get('name') || 'video.mp4';
    const ctype  = req.headers['content-type'] || 'video/mp4';

    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);

      function buildMultipart(fields, fileField, fileName, fileType, fileBody) {
        const boundary = '----TmpBnd' + Date.now();
        const parts = [];
        for (const [k, v] of Object.entries(fields)) {
          parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
        }
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${fileType}\r\n\r\n`));
        parts.push(fileBody);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
        return { boundary, body: Buffer.concat(parts) };
      }

      function postMultipart(hostname, p, fields, fileField, fileName, fileType, fileBody) {
        return new Promise((resolve, reject) => {
          const { boundary, body: mp } = buildMultipart(fields, fileField, fileName, fileType, fileBody);
          const opts = {
            hostname, port: 443, path: p, method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': mp.length }
          };
          const r = https.request(opts, resp => {
            const ch = []; resp.on('data', c => ch.push(c));
            resp.on('end', () => resolve({ status: resp.statusCode, text: Buffer.concat(ch).toString().trim() }));
          });
          r.on('error', reject); r.write(mp); r.end();
        });
      }

      function tryLitterbox() {
        return postMultipart('litterbox.catbox.moe', '/resources/internals/api.php',
          { reqtype: 'fileupload', time: '24h' }, 'fileToUpload', name, ctype, body)
          .then(({ status, text }) => {
            if (text.startsWith('http')) return text;
            throw new Error('litterbox: ' + text.substring(0, 120));
          });
      }

      function tryTmpfiles() {
        return postMultipart('tmpfiles.org', '/api/v1/upload',
          {}, 'file', name, ctype, body)
          .then(({ status, text }) => {
            try {
              const j = JSON.parse(text);
              const u = j.data?.url || j.url;
              if (u && u.startsWith('http')) return u.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
            } catch {}
            throw new Error('tmpfiles: ' + text.substring(0, 120));
          });
      }

      tryLitterbox()
        .catch(() => tryTmpfiles())
        .then(fileUrl => sendJSON(res, 200, { url: fileUrl }))
        .catch(e => sendJSON(res, 500, { error: e.message }));
    });
    return;
  }

  // ── OpenAI image generation ───────────────────────────────────────────────
  if (url === '/api/generate-image' && method === 'POST') {
    const openaiKey = (req.headers['x-openai-key'] || '').trim();
    if (!openaiKey) return sendJSON(res, 401, { error: 'OpenAI API key required. Enter it in the Image tab.' });
    const { prompt, size, quality } = await readBody(req);
    if (!prompt) return sendJSON(res, 400, { error: 'Prompt required' });

    const payload = {
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size:    size    || '1024x1024',
      quality: quality || 'high',
    };
    const body = Buffer.from(JSON.stringify(payload));
    console.log('[openai-image] generating:', size, quality, prompt.substring(0, 80));

    try {
      const result = await new Promise((resolve, reject) => {
        const opts = {
          hostname: 'api.openai.com', port: 443,
          path: '/v1/images/generations', method: 'POST',
          headers: {
            'Authorization':  'Bearer ' + openaiKey,
            'Content-Type':   'application/json',
            'Content-Length': body.length,
          }
        };
        const r = https.request(opts, resp => {
          const ch = [];
          resp.on('data', c => ch.push(c));
          resp.on('end', () => {
            try { resolve({ status: resp.statusCode, body: JSON.parse(Buffer.concat(ch).toString()) }); }
            catch(e) { reject(new Error('OpenAI parse error: ' + e.message)); }
          });
        });
        r.on('error', reject);
        r.write(body); r.end();
      });

      if (result.status !== 200) {
        const errMsg = result.body?.error?.message || JSON.stringify(result.body).substring(0, 400);
        console.error('[openai-image] error', result.status, errMsg);
        return sendJSON(res, result.status >= 400 && result.status < 600 ? result.status : 500, { error: errMsg });
      }

      const imgData = result.body.data?.[0];
      if (!imgData) return sendJSON(res, 500, { error: 'No image data returned by OpenAI' });

      const dataUrl = imgData.b64_json
        ? 'data:image/png;base64,' + imgData.b64_json
        : imgData.url || '';
      console.log('[openai-image] done, dataUrl length:', dataUrl.length);
      return sendJSON(res, 200, { url: dataUrl });
    } catch(e) {
      console.error('[openai-image] request error:', e.message);
      return sendJSON(res, 502, { error: 'OpenAI request failed: ' + e.message });
    }
  }

  // ── BytePlus proxy ────────────────────────────────────────────────────────
  if (url.startsWith('/proxy/')) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => proxy(req, res, Buffer.concat(chunks)));
    return;
  }

  res.writeHead(404); res.end('Not found');
}

// ── Start ─────────────────────────────────────────────────────────────────────
initDB()
  .catch(e => console.error('[db] initDB rejected (server will still start):', e.message))
  .then(() => {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(e => {
      console.error('Server error:', e);
      if (!res.headersSent) { res.writeHead(500); res.end(JSON.stringify({ error: 'Internal server error' })); }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║   🎬  Seedance Studio is running!    ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log('  ║   Open: http://localhost:' + PORT + '         ║');
    console.log('  ║   Stop: Ctrl+C                       ║');
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
  });
});
