/**
 * Lepton — Backend Server
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

const PORT             = process.env.PORT || 3000;
const BYTEPLUS         = 'ark.ap-southeast.bytepluses.com';
const DB_FILE          = path.join(__dirname, 'db.json');
const REDIS_URL        = (process.env.UPSTASH_REDIS_REST_URL  || '').replace(/\/$/, '');
const REDIS_TOKEN      = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REDIS_KEY        = 'seedance_db';
const RESEND_KEY       = process.env.RESEND_API_KEY       || '';
const BREVO_KEY        = process.env.BREVO_API_KEY        || '';
const BREVO_SENDER     = process.env.BREVO_SENDER_EMAIL   || '';
const APP_URL          = process.env.APP_URL              || 'http://localhost:3000';
const STRIPE_KEY       = process.env.STRIPE_SECRET_KEY    || '';
const STRIPE_WSEC      = process.env.STRIPE_WEBHOOK_SECRET || '';
const FAL_KEY          = process.env.FAL_API_KEY          || '';
const BYTEPLUS_API_KEY = process.env.BYTEPLUS_API_KEY     || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY   || '';

const CREDIT_PACKAGES = {
  starter: { credits: 500,  usdCents:  900, name: '500 Credits'  },
  popular: { credits: 1500, usdCents: 2200, name: '1500 Credits' },
  pro:     { credits: 4000, usdCents: 4900, name: '4000 Credits' },
};

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
    migrateCredits();
  } catch(e) {
    console.error('[db] initDB error (continuing with empty db):', e.message);
  }
}

function migrateCredits() {
  if (!dbCache.users) return;
  let n = 0;
  for (const uid of Object.keys(dbCache.users)) {
    if (dbCache.users[uid].credits === undefined) { dbCache.users[uid].credits = 1000; n++; }
  }
  if (n > 0) { console.log(`[db] Granted 1000 starting credits to ${n} existing user(s)`); saveDB(dbCache); }
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
          migrateCredits();
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
        sender:      { email: BREVO_SENDER, name: 'Lepton' },
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
        from: 'Lepton <onboarding@resend.dev>',
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

// ── Claude (Anthropic) API helper ─────────────────────────────────────────────
function claudeApiCall(apiKey, system, messages) {
  apiKey = apiKey || ANTHROPIC_API_KEY;
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system,
      messages
    }));
    const opts = {
      hostname: 'api.anthropic.com', port: 443, path: '/v1/messages', method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      }
    };
    const req = https.request(opts, res => {
      const ch = []; res.on('data', c => ch.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(ch).toString()) }); }
        catch(e) { reject(new Error('Claude parse error: ' + e.message)); }
      });
    });
    req.setTimeout(120000, () => req.destroy(new Error('Claude timeout')));
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── Claude JSON parser (strips markdown fences, escapes literal newlines in strings) ─
function sanitizeJsonNewlines(s) {
  // Escape literal \r and \n that appear inside JSON string values
  return s.replace(/"(?:[^"\\]|\\.|\n|\r)*"/g, m =>
    m.replace(/\r\n/g, '\\n').replace(/\r/g, '\\n').replace(/\n/g, '\\n')
  );
}
function safeParseClaudeJSON(text) {
  const t = (text || '').trim();
  // 1. Direct parse
  try { return JSON.parse(t); } catch {}
  // 2. Strip markdown code fences (\r\n-aware)
  const stripped = t.replace(/^```[a-z]*\r?\n?/i, '').replace(/\r?\n?```\s*$/i, '').trim();
  try { return JSON.parse(stripped); } catch {}
  // 3. Sanitize literal newlines inside string values, then try again
  try { return JSON.parse(sanitizeJsonNewlines(stripped)); } catch {}
  // 4. Extract first {...} block and sanitize
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s !== -1 && e > s) { try { return JSON.parse(sanitizeJsonNewlines(t.slice(s, e + 1))); } catch {} }
  return null;
}

// ── Fal.ai helper ─────────────────────────────────────────────────────────────
function falRequest(method, falPath, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = body ? Buffer.from(JSON.stringify(body)) : null;
    const opts = {
      hostname: 'queue.fal.run', port: 443, path: falPath, method,
      headers: {
        'Authorization': 'Key ' + FAL_KEY,
        'Content-Type': 'application/json',
        ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {})
      }
    };
    const r = https.request(opts, resp => {
      const ch = []; resp.on('data', c => ch.push(c));
      resp.on('end', () => {
        const text = Buffer.concat(ch).toString().trim();
        try { resolve({ status: resp.statusCode, body: text ? JSON.parse(text) : {} }); }
        catch(e) { reject(new Error('Fal parse error: ' + e.message)); }
      });
    });
    r.setTimeout(30000, () => r.destroy(new Error('Fal timeout')));
    r.on('error', reject);
    if (bodyBuf) r.write(bodyBuf);
    r.end();
  });
}

// ── Stripe helpers ────────────────────────────────────────────────────────────
function stripeRequest(method, path, formPairs) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(formPairs.map(([k,v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'));
    const opts = {
      hostname: 'api.stripe.com', port: 443, path, method,
      headers: {
        'Authorization':  'Basic ' + Buffer.from(STRIPE_KEY + ':').toString('base64'),
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': body.length,
        'Stripe-Version': '2023-10-16',
      }
    };
    const req = https.request(opts, res => {
      const ch = []; res.on('data', c => ch.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(ch).toString()) }); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function verifyStripeSignature(rawBody, sigHeader) {
  if (!STRIPE_WSEC) return false;
  const parts = {};
  sigHeader.split(',').forEach(p => { const [k,v] = p.split('='); if (!parts[k]) parts[k] = v; });
  const { t, v1 } = parts;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - parseInt(t)) > 300) return false;
  const expected = crypto.createHmac('sha256', STRIPE_WSEC).update(t + '.' + rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

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
    req.on('error', () => resolve({}));
  });
}

// ── Serve HTML ────────────────────────────────────────────────────────────────
function serveHTML(res) {
  fs.readFile(path.join(__dirname, 'seedance-studio.html'), (err, data) => {
    if (err) { res.writeHead(404); res.end('seedance-studio.html not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
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

  const skip = new Set(['host', 'origin', 'referer', 'accept-encoding', 'authorization']);
  for (const [k, v] of Object.entries(req.headers)) {
    if (!skip.has(k.toLowerCase())) options.headers[k] = v;
  }
  options.headers['accept-encoding'] = 'identity';
  if (BYTEPLUS_API_KEY) options.headers['authorization'] = 'Bearer ' + BYTEPLUS_API_KEY;

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
  if (method === 'POST') console.log('[req]', method, url, new Date().toISOString());

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
    db.users[userId]   = { email: key, hash: hashPass(password, salt), salt, createdAt: Date.now(), verified: !needsVerify, credits: 1000 };
    db.emailIndex[key] = userId;
    db.library[userId] = [];
    if (!db.verifyCodes) db.verifyCodes = {};
    if (!db.resetCodes)  db.resetCodes  = {};
    if (needsVerify) {
      const code = makeCode();
      db.verifyCodes[key] = { code, expires: Date.now() + 15 * 60 * 1000 };
      saveDB(db);
      await sendEmail(key, 'Verify your Lepton account',
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
    return sendJSON(res, 200, { token, email: key, userId, credits: db.users[userId].credits ?? 1000 });
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
    await sendEmail(key, 'Your new Lepton verification code',
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
      await sendEmail(key, 'Reset your Lepton password',
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
    return sendJSON(res, 200, { token, email: key, userId, credits: db.users[userId].credits ?? 1000 });
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
    return sendJSON(res, 200, { token, email: user.email, userId, credits: user.credits ?? 1000 });
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
    return sendJSON(res, 200, { email: user.email, userId: sess.userId, credits: user.credits ?? 1000 });
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
    const apiKey = BYTEPLUS_API_KEY;
    if (!apiKey) return sendJSON(res, 503, { error: 'BytePlus API key not configured on server' });

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

  // ── Stripe: create checkout session ──────────────────────────────────────
  if (url === '/api/stripe/create-checkout' && method === 'POST') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    if (!STRIPE_KEY) return sendJSON(res, 503, { error: 'Payments not configured' });
    const { packageId } = await readBody(req);
    const pkg = CREDIT_PACKAGES[packageId];
    if (!pkg) return sendJSON(res, 400, { error: 'Invalid package' });
    try {
      const result = await stripeRequest('POST', '/v1/checkout/sessions', [
        ['mode',                                                       'payment'],
        ['success_url',                                                APP_URL + '/?payment=success'],
        ['cancel_url',                                                 APP_URL + '/'],
        ['metadata[userId]',                                           sess.userId],
        ['metadata[credits]',                                          String(pkg.credits)],
        ['line_items[0][quantity]',                                    '1'],
        ['line_items[0][price_data][currency]',                        'usd'],
        ['line_items[0][price_data][unit_amount]',                     String(pkg.usdCents)],
        ['line_items[0][price_data][product_data][name]',              pkg.name],
        ['line_items[0][price_data][product_data][description]',       'Lepton credits for AI video & image generation'],
      ]);
      if (result.status !== 200) {
        console.error('[stripe] create-checkout error', result.body?.error?.message);
        return sendJSON(res, 400, { error: result.body?.error?.message || 'Stripe error' });
      }
      console.log('[stripe] checkout session created for user', sess.userId, 'pkg', packageId);
      return sendJSON(res, 200, { url: result.body.url });
    } catch(e) {
      console.error('[stripe] checkout error:', e.message);
      return sendJSON(res, 500, { error: 'Payment error: ' + e.message });
    }
  }

  // ── Stripe: webhook ───────────────────────────────────────────────────────
  if (url === '/api/stripe/webhook' && method === 'POST') {
    const rawBody = await new Promise(resolve => {
      const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks)));
    });
    const sig = req.headers['stripe-signature'] || '';
    if (!STRIPE_WSEC) return sendJSON(res, 503, { error: 'Webhook secret not configured' });
    if (!verifyStripeSignature(rawBody, sig)) {
      console.warn('[stripe] webhook signature mismatch');
      return sendJSON(res, 400, { error: 'Invalid signature' });
    }
    let event;
    try { event = JSON.parse(rawBody.toString()); }
    catch { return sendJSON(res, 400, { error: 'Invalid JSON' }); }

    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object;
      const userId  = session?.metadata?.userId;
      const credits = parseInt(session?.metadata?.credits || '0');
      if (userId && credits > 0) {
        const db   = loadDB();
        const user = db.users[userId];
        if (user) {
          user.credits = (user.credits ?? 0) + credits;
          saveDB(db);
          console.log('[stripe] +' + credits + ' credits → user ' + userId + ' (total: ' + user.credits + ')');
        }
      }
    }
    return sendJSON(res, 200, { received: true });
  }

  // ── Credits ───────────────────────────────────────────────────────────
  if (url === '/api/credits' && method === 'GET') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    const db   = loadDB();
    return sendJSON(res, 200, { credits: db.users[sess.userId].credits ?? 1000 });
  }

  if (url === '/api/refund-credits' && method === 'POST') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    const { amount } = await readBody(req);
    if (!amount || amount <= 0) return sendJSON(res, 400, { error: 'Invalid amount' });
    const db = loadDB();
    const user = db.users[sess.userId];
    user.credits = Math.round(((user.credits ?? 0) + amount) * 100) / 100;
    saveDB(db);
    console.log('[refund] +' + amount + ' credits → user ' + sess.userId + ' (total: ' + user.credits + ')');
    return sendJSON(res, 200, { credits: user.credits });
  }

  if (url === '/api/deduct-credits' && method === 'POST') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    const { amount } = await readBody(req);
    if (!amount || amount <= 0) return sendJSON(res, 400, { error: 'Invalid amount' });
    const db   = loadDB();
    const user = db.users[sess.userId];
    const cur  = user.credits ?? 1000;
    if (cur < amount) return sendJSON(res, 402, { error: `Not enough credits. Need ${amount}, have ${cur}.`, credits: cur });
    user.credits = Math.round((cur - amount) * 100) / 100;
    saveDB(db);
    return sendJSON(res, 200, { credits: user.credits });
  }

  // ── Gemini image generation ───────────────────────────────────────────────
  if (url === '/api/generate-image' && method === 'POST') {
    const { prompt, ratio, quality, imageBase64, imageMime, images } = await readBody(req); // must read body before any early return
    // Normalize to a list of {base64, mime}: legacy single-image fields still supported
    const refImagesList = Array.isArray(images) && images.length
      ? images.filter(i => i && i.base64).map(i => ({ base64: i.base64, mime: i.mime || 'image/jpeg' }))
      : (imageBase64 ? [{ base64: imageBase64, mime: imageMime || 'image/jpeg' }] : []);
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return sendJSON(res, 503, { error: 'Image generation not configured on server (GEMINI_API_KEY missing).' });
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Sign in to generate images.' });
    const imgCost = quality === 'low' ? 0.5 : 2.5;
    {
      const db  = loadDB();
      const cur = db.users[sess.userId].credits ?? 1000;
      if (cur < imgCost) return sendJSON(res, 402, { error: `Not enough credits. Need ${imgCost}, have ${cur}.`, credits: cur });
    }
    if (!prompt) return sendJSON(res, 400, { error: 'Prompt required' });

    // Gemini supports: 1:1, 3:4, 4:3, 9:16, 16:9 — map unsupported ratios to closest
    const RATIO_MAP = { '21:9': '16:9' };
    const aspectRatio = RATIO_MAP[ratio] || ratio || '1:1';
    const useEdit = refImagesList.length > 0;
    console.log('[gemini-image]', useEdit ? `editing with ${refImagesList.length} ref(s):` : 'generating:', aspectRatio, quality, prompt.substring(0, 80));

    const msgParts = [];
    for (const img of refImagesList) {
      msgParts.push({ inlineData: { mimeType: img.mime, data: img.base64 } });
    }
    msgParts.push({ text: prompt });

    // Embed aspect ratio in prompt — generationConfig doesn't accept aspectRatio/numberOfImages for this model
    msgParts[msgParts.length - 1].text += ` Output in ${aspectRatio} aspect ratio.`;
    const reqBody = Buffer.from(JSON.stringify({
      contents: [{ parts: msgParts }],
      generationConfig: { responseModalities: ['IMAGE'] }
    }));

    const MAX_IMG_ATTEMPTS = 4;
    const geminiRequest = () => new Promise((resolve, reject) => {
      const model = 'gemini-3.1-flash-image-preview';
      const opts = {
        hostname: 'generativelanguage.googleapis.com', port: 443,
        path: `/v1beta/models/${model}:generateContent?key=${geminiKey}`, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': reqBody.length }
      };
      const r = https.request(opts, resp => {
        const ch = [];
        resp.on('data', c => ch.push(c));
        resp.on('end', () => {
          const raw = Buffer.concat(ch).toString();
          if (!raw) { reject(new Error(`Gemini returned empty body (HTTP ${resp.statusCode})`)); return; }
          try { resolve({ status: resp.statusCode, body: JSON.parse(raw) }); }
          catch(e) { reject(new Error(`Gemini non-JSON response (HTTP ${resp.statusCode}): ${raw.substring(0, 200)}`)); }
        });
      });
      // 90s per attempt — if Gemini stalls longer it's rate-limited; retry handles it
      r.setTimeout(90000, () => { r.destroy(); reject(new Error('Gemini request timed out after 90s')); });
      r.on('error', reject);
      r.write(reqBody); r.end();
    });

    for (let attempt = 1; attempt <= MAX_IMG_ATTEMPTS; attempt++) {
      try {
        const result = await geminiRequest();

        if (result.status === 429) {
          const waitSec = attempt * 20;
          console.log(`[gemini-image] rate limited (attempt ${attempt}/${MAX_IMG_ATTEMPTS}), waiting ${waitSec}s`);
          if (attempt < MAX_IMG_ATTEMPTS) {
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
          }
          const errMsg = result.body?.error?.message || 'Gemini rate limit exceeded — try again in a moment';
          return sendJSON(res, 429, { error: errMsg });
        }

        if (result.status !== 200) {
          const errMsg = result.body?.error?.message || JSON.stringify(result.body).substring(0, 400);
          console.error('[gemini-image] error', result.status, errMsg);
          return sendJSON(res, result.status >= 400 && result.status < 600 ? result.status : 500, { error: errMsg });
        }

        const imgPart = result.body.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imgPart) return sendJSON(res, 500, { error: 'No image data returned by Gemini' });

        const mime = imgPart.inlineData.mimeType || 'image/jpeg';
        const dataUrl = `data:${mime};base64,${imgPart.inlineData.data}`;
        console.log('[gemini-image] done, dataUrl length:', dataUrl.length);
        const db2  = loadDB();
        const usr2 = db2.users[sess.userId];
        const cur2 = usr2.credits ?? 1000;
        usr2.credits = Math.round((cur2 - imgCost) * 100) / 100;
        saveDB(db2);
        return sendJSON(res, 200, { url: dataUrl, credits: usr2.credits });
      } catch(e) {
        const isTimeout = e.message.includes('timed out');
        console.error(`[gemini-image] attempt ${attempt} error:`, e.message);
        if (attempt < MAX_IMG_ATTEMPTS && isTimeout) {
          const waitSec = attempt * 15;
          console.log(`[gemini-image] timeout, retrying after ${waitSec}s (attempt ${attempt})`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }
        return sendJSON(res, 502, { error: 'Gemini request failed: ' + e.message });
      }
    }
  }

  // ── Ads: Claude brainstorm ────────────────────────────────────────────────
  if (url === '/api/gen/brief' && method === 'POST') {
    const { images, description } = await readBody(req); // must read body before any early return
    const anthropicKey = ANTHROPIC_API_KEY;
    if (!anthropicKey) return sendJSON(res, 503, { error: 'Anthropic API key not configured on server (ANTHROPIC_API_KEY missing).' });
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Sign in to use Ads.' });
    if (!images || !images.length) return sendJSON(res, 400, { error: 'Upload at least one product image.' });

    const BRAINSTORM_COST = 5;
    const db = loadDB(); const user = db.users[sess.userId];
    const cur = user.credits ?? 1000;
    if (cur < BRAINSTORM_COST) return sendJSON(res, 402, { error: `Not enough credits. Need ${BRAINSTORM_COST}, have ${cur}.` });

    const userContent = [];
    for (const img of images) {
      userContent.push({ type: 'image', source: { type: 'base64', media_type: img.mime || 'image/jpeg', data: img.base64 } });
    }
    userContent.push({ type: 'text', text: description ? `Product description: ${description}\n\nAnalyze these product images and create a compelling video ad concept.` : 'Analyze these product images and create a compelling video ad concept.' });

    const system = `You are an expert advertising creative director. You generate emotionally powerful, battle-tested ad concepts using a rigorous four-phase methodology. Work through every phase internally before producing your JSON output.

---

## PHASE 0 — VISUAL PRODUCT INTELLIGENCE

Perform a deep read of the product image(s). Extract:
- Physical attributes: category, form, materials, colors, size cues, packaging, quality signals (premium vs. accessible, artisan vs. industrial), era/aesthetic (modern, vintage, futuristic, organic, clinical)
- Functional promise: what does it do, what problem does it solve, what transformation does it offer (speed, convenience, pleasure, protection, status)
- Sensory imagination: how does it feel/smell/sound to use, what moment of the day does it belong to
- Cultural & social signals: what tribe does it belong to, what does owning/using it say about you, who does this product say you are

---

## PHASE 1 — EMOTIONAL TERRITORY MAPPING

Map the product to its 3 most powerful emotional territories from this framework:
- Belonging: to be part of something — community, shared identity
- Freedom: escape, autonomy, self-expression — rebellion, open road, release
- Love & Connection: intimacy, being seen, relationships — romance, family, friendship
- Achievement: progress, mastery, winning — transformation, milestone, pride
- Safety & Trust: security, certainty, protection — reliability, science, care
- Joy & Play: delight, humor, spontaneity — surprise, absurdist, warmth
- Identity & Status: who I am and who sees me — aspiration, exclusivity, taste
- Nostalgia: return, comfort, the past — memory, heritage, simplicity
- Fear & Urgency: threat removal, loss aversion — problem-solution, stakes
- Transcendence: meaning, purpose beyond self — legacy, spirituality, beauty

For each chosen territory, identify: the core emotional tension it creates and resolves, the human insight that makes it feel true, the moment of vulnerability where the message lands deepest.

---

## PHASE 2 — GENERATE AND EVALUATE 3 FULL AD CONCEPTS

For each concept, develop completely:

**Strategic Insight:** The single human truth this ad exploits. One sentence. This is the "because this is true about humans, our ad works" statement.

**Target Human:** Not a demographic. A person in a moment — what they just did, what they're feeling, what they secretly want, what they're afraid to admit.

**The Hook:** The first 3 seconds as a visceral description. What stops everything?

**The Story (MANDATORY TWO-SCENE PROBLEM → SOLUTION STRUCTURE):** Every concept MUST be told in exactly two 15-second scenes. The story must feel like a moment from a real person's everyday life — something the audience has lived themselves. Not a mood film, not a vibe piece, not stock-ad symbolism. A concrete situation with a clear micro-goal, an obstacle, and a turn.

GROUND THE STORY IN EVERYDAY LIFE. Pick one specific, universally-recognizable everyday context — not a fashion shoot or perfume mood. Examples of the texture we want:
- 7am, running late, can't find keys, coffee cold, kid yelling from the next room
- Friday night, fridge half-empty, takeout app open, exhausted on the couch
- Crowded subway, headphones dead, stranger's elbow in the ribs, twelve more stops
- Kitchen post-dinner, dishes piled, partner already asleep, phone buzzing with work emails
- Gym at 6am, alarm went off three times, sneakers untied, water bottle empty
- Bathroom mirror at midnight, makeup half off, big day tomorrow, scrolling instead of sleeping

PACE & ACTION DENSITY. Each 15-second scene must contain 4-6 distinct ACTION BEATS — concrete things the character DOES or that visibly happens. Not contemplation. Not held tableaux. Verbs, not adjectives. Each beat is 2-4 seconds. The audience never sits on a single image — there's always forward motion. Think a Wes Anderson sequence or a TikTok edit, not a fragrance commercial.

Scene 1 (PROBLEM, 15s): the painful before-state. The target human ACTIVELY struggling with a specific everyday task — fumbling, searching, dropping, sighing, scrolling, slamming, retrying. Product NOT visible. Stack 4-6 micro-frustrations one after another so the pain compounds. End on the peak frustration beat.

Scene 2 (SOLUTION, 15s): the after-state with the product. Same person, same room, same lighting tone — visible continuity with Scene 1. The product enters at a specific moment and the same kind of micro-actions now flow effortlessly. 4-6 beats again, but now they CLICK. End on the new emotional reality (a smile, a deep exhale, a small private moment of "yes").

For each scene name the character's body language, the specific micro-actions, and what the audience FEELS by the final frame. Specificity wins: not "she relaxes" but "she kicks off one shoe, then the other, drops her bag on the floor, finally exhales."

**Visual Language:** Color palette (reference films/photographers), cinematography style, editing rhythm, sound/music direction.

**Tagline:** One line, 10 words or fewer, contains a tension or surprise.

Apply these advertising psychology principles to every concept:
- Identity-based persuasion: mirror the audience's self-image → show what their tribe does → make the product a self-affirmation
- Peak-End Rule: design for one moment of maximum emotional intensity + a resolved landing
- Somatic markers: create a body response — goosebumps, smile, lump in the throat — that becomes inseparable from the product
- Loss aversion: frame the ABSENCE of the product as the problem, not the product as the solution
- Vulnerability principle: name an unspoken truth the audience feels but rarely says out loud — with empathy, not shame
- Specificity: "she buries her feet in the sand and doesn't look at her phone once" not "a woman relaxes on a beach"

Brand archetypes to consider: Hero (mastery, overcoming), Caregiver (protection, warmth), Rebel (challenge status quo), Sage (truth, education), Creator (imagination, craft), Lover (intimacy, pleasure), Jester (joy, irreverence), Innocent (purity, nostalgia), Explorer (freedom, adventure), Ruler (premium, authority), Magician (transformation, before/after), Everyman (belonging, accessibility).

Run each concept through 10 stress tests (score 1–5):
1. Stranger Test: would someone describe this at dinner tonight?
2. Truth Test: could a competitor steal this idea verbatim? (If yes, it fails)
3. Gut-Punch Test: does it make you feel something in your chest?
4. Cocktail Party Test: is there something people would share or quote?
5. Scale Test: does the core idea survive compression to 6s AND expansion to 2 minutes?
6. Audience Fit Test: would the target human feel deeply SEEN?
7. Brand Fit Test: does this elevate the product's perceived value coherently?
8. Longevity Test: could this be a campaign platform for 2+ years?
9. Pace Test: in any 5-second window, are at least 2 distinct things happening (not held shots, not contemplation)? If not, the concept fails.
10. Everyday Recognition Test: does the audience's first thought watching Scene 1 go "oh god, that's me on a Tuesday"? If not, the situation is too abstract — pick a more universal everyday moment.

Identify each concept's fatal flaw and secret weapon.

---

## PHASE 3 — SELECT THE WINNER

Declare the winning concept based on stress test scores + qualitative judgment. No hedging — make a call. Identify: the specific emotional mechanism it activates, why this cultural moment makes it land harder now, the 3 most important things to protect in production, the bold choice that must not be watered down.

---

## PHASE 4 — REFERENCE IMAGES

Think like a visual effects supervisor. Generate a complete list of ALL reference images needed: every character (full body front/side/back reference sheets), every product angle, every key environment, every important prop. No fixed limit — generate as many as the concept requires.

---

## OUTPUT

After working through all phases internally, output ONLY valid JSON (no markdown, no code fences) for the WINNING concept:

{
  "adTitle": "Short campaign title",
  "tagline": "Unforgettable one-liner, 10 words or fewer, contains a tension or surprise",
  "emotionalTerritory": "Primary emotional territory name",
  "brandArchetype": "The archetype this concept embodies",
  "strategicInsight": "The single human truth this ad exploits. One sentence, sharp as a knife.",
  "targetHuman": "Not a demographic — a person in a moment. What they just did, what they feel, what they secretly want.",
  "vulnerability": "The unspoken truth this ad names — said with empathy, not shame.",
  "hook": "The first 3 seconds as a visceral description.",
  "mood": "Visual mood in 3-5 words",
  "visualStyle": "Cinematography/aesthetic reference — specific (e.g. handheld intimacy, wide epic, macro close-ups, slow burn, rapid cuts)",
  "colorPalette": "Specific color direction — reference films, photographers, or describe precisely",
  "soundDirection": "Music feel, tempo, instrumentation, and key sound design notes",
  "referenceImages": [
    {
      "key": "unique_snake_case_key",
      "label": "Human-readable label",
      "type": "product | character | environment | prop",
      "prompt": "See prompt rules below",
      "ratio": "1:1 or 16:9 or 9:16",
      "dependsOn": ["key_of_another_ref_image"]
    }
  ],
  "scenes": [
    {
      "number": 1,
      "name": "Problem — short scene name",
      "role": "problem",
      "everydayContext": "One concrete sentence locating this moment in real life — time of day, what the character was just doing, the micro-goal they're failing at",
      "description": "The before-state: the target human ACTIVELY struggling with a specific everyday task. Product NOT visible. Punchy verbs, not vibe.",
      "actionBeats": [
        "Beat 1: specific micro-action with a verb (≈2-3s)",
        "Beat 2: next micro-frustration (≈2-3s)",
        "Beat 3: another concrete failure or annoyance (≈2-3s)",
        "Beat 4: stacking pressure (≈2-3s)",
        "Beat 5: peak frustration — final pain beat the scene lands on (≈2-3s)"
      ],
      "duration": 15,
      "ratio": "9:16",
      "refImageKeys": ["key1"]
    },
    {
      "number": 2,
      "name": "Solution — short scene name",
      "role": "solution",
      "everydayContext": "Same time/place/character as Scene 1, now with the product present",
      "description": "Same person, same room, same lighting as Scene 1. Product enters at a specific beat and the same kind of micro-actions now flow.",
      "actionBeats": [
        "Beat 1: visual echo of Scene 1's final frame so continuity reads (≈2-3s)",
        "Beat 2: the product enters — specific gesture (≈2-3s)",
        "Beat 3: a frictionless action that mirrors a Scene 1 frustration but now resolved (≈2-3s)",
        "Beat 4: another mirrored beat — small win (≈2-3s)",
        "Beat 5: resolution — the new emotional reality (≈2-3s)"
      ],
      "duration": 15,
      "ratio": "9:16",
      "refImageKeys": ["key1", "product_sheet"]
    }
  ]
}

RULES:
- referenceImages: generate ALL needed refs — one product sheet, all character sheets, all environments, key props.
- type field rules:
  • "product" — exactly ONE entry with type "product". The user's actual product photo will be sent to the image generator alongside your prompt. Your prompt MUST be exactly: "Generate a product reference sheet photo." — nothing more. Do NOT describe the product, do NOT add details about angles, lighting, backgrounds, or annotations. The image generator will scan the input photo and knows how to create the reference sheet automatically.
  • "character" — for each human or animal character. Prompt MUST follow this exact structure:
    - Opening: "Character reference sheet, professional studio format."
    - Identity: name/role if any, nationality/ethnicity, age range, build (e.g. "medium build, slightly stocky")
    - Physical details: hair color + length + texture, eye color, skin tone, facial hair, any distinguishing features (e.g. "heavy dark under-eyes, tired expression")
    - Panel layout: "Full body front view on left side, full body side profile on right side. Multiple face close-ups in bottom half — front view, 3/4 angle view, and [key expression] expression. Color palette swatches shown on side."
    - Clothing: every garment named with exact color + material + fit (e.g. "oversized heather grey crew neck t-shirt, black jogger sweatpants with ribbed cuffs, worn grey suede slip-on house slippers")
    - Posture and expression: specific body language and emotional state (e.g. "posture slouched forward, shoulders dropped — expression blank and exhausted, not angry, just completely drained")
    - Annotations: "Annotations pointing to hair style, eye color, fabric material, facial hair."
    - Technical: "Clean white background. Photorealistic, shot on Canon R5, professional lighting."
    - Labels: "Label at top left: CHAR ID: 00X STUDY 1. Label at top right: STUDY 1."
    - Color swatches: list 3-5 specific swatches matching the character's palette (e.g. "Small color swatches showing: dark charcoal, black, heather grey, warm skin tone.")
    - End with: "No cartoon, no anime, no caricature. No illustration, no 3D render."
  • "environment" — for each distinct location/setting. Prompt MUST follow this exact structure:
    - Opening: "Environment reference sheet, professional format."
    - Location identity: specific place name/type, architectural style, country/culture if relevant
    - Panel layout: "Three panel layout: wide angle full room [position], medium [area] [position], close-up [detail] [position]." — specify top-left, top-right, bottom-center etc.
    - Key visual elements: list every surface, furniture piece, prop, and material with precise detail (concrete walls, worn wooden desk, metal shelving, etc.)
    - Lighting: time of day, light source direction, quality and color temperature (e.g. "warm golden morning sunlight flooding through window, high key")
    - Mood adjectives: 3-5 specific words (e.g. "calm, open, peaceful, focused")
    - Color tone: overall grading direction (e.g. "warm golden color tone, high key")
    - Annotations: "Annotation lines pointing to: [list 4-5 specific features]."
    - Labels: "Label top left: ENV ID: 00X STUDY X. Label top right: [LOCATION NAME — STATE/MOOD]."
    - Color swatches: "Color swatches bottom right."
    - Technical: "Real interior/exterior photography, photorealistic, shot on Canon R5."
    - End with: "No illustration, no cartoon, no 3D render, no sketch, no painting, no stylized."
    - If this is a variant/alternate state of an existing environment, explicitly reference the original: "Exact same layout as ENV ID: 00X STUDY X — same [feature], same [feature] — but [what changed]."
  • "prop" — for important objects/products other than the hero product. Detailed prompt showing the object from multiple angles, materials labeled, scale reference.
- dependsOn: if a reference image must visually contain or prominently feature another reference object (e.g. a gift box showing the product inside, a hand holding the product, a scene styled around the character), list that object's key in dependsOn. The already-generated image for each listed key will be fed as a visual reference to the image generator. This ensures the dependent image accurately depicts the referenced object rather than hallucinating it. Leave dependsOn empty or omit it entirely for fully self-contained images (e.g. the product sheet itself, a standalone character or environment that doesn't need to show the product). IMPORTANT: "product" type refs never need dependsOn since they get the real uploaded photo directly.
- scenes: EXACTLY 2 scenes — Scene 1 role="problem" (no product visible), Scene 2 role="solution" (product present and resolving the tension). Each scene duration MUST be exactly 15. Total ad = 30 seconds. Do not output 1, 3, or more scenes.
- ratio must be one of: 9:16, 16:9, 1:1, 4:3, 3:4, 21:9
- Every scene description must name which refImageKeys it needs
- ACTION BEATS REQUIRED: every scene MUST have an "actionBeats" array of 4-6 strings. Each string is a specific micro-action a director could shoot. Use VERBS. No "she feels", "she experiences", "the mood is" — instead "she fumbles with the keys", "she swipes left then sighs", "she drops her bag mid-stride". The beats are the cuts the editor will make.
- EVERYDAY CONTEXT REQUIRED: every scene must have an "everydayContext" string — one concrete sentence locating the moment in a universally-recognizable real-life situation (morning rush, late-night kitchen, packed commute, post-work collapse, etc.). If you cannot fill this without resorting to abstract or aspirational language, the situation is wrong — pick a more grounded one.
- PRODUCT CONSISTENCY: Scene 2's description must explicitly state how the product is framed (e.g. "held in hand at chest height, centered, occupying ~35% of frame width") and Scene 1's resolution must establish the empty space where the product will land in Scene 2. The character/person, environment, lighting tone, and wardrobe must remain visually continuous across both scenes — only the presence of the product changes.
- Write like a creative director pitching to skeptical CMOs — confident, specific, surprising. No generic language. Every detail serves an emotional purpose.`;

    try {
      const claudeRes = await claudeApiCall(anthropicKey, system, [{ role: 'user', content: userContent }]);
      if (claudeRes.status !== 200) {
        const msg = claudeRes.body?.error?.message || JSON.stringify(claudeRes.body).substring(0, 300);
        return sendJSON(res, claudeRes.status >= 400 ? claudeRes.status : 502, { error: 'Claude error: ' + msg });
      }
      const text = claudeRes.body?.content?.[0]?.text || '';
      const concept = safeParseClaudeJSON(text);
      if (!concept) return sendJSON(res, 502, { error: 'Claude returned invalid JSON: ' + text.substring(0, 200) });

      user.credits = Math.round((cur - BRAINSTORM_COST) * 100) / 100;
      saveDB(db);
      return sendJSON(res, 200, { concept, credits: user.credits });
    } catch(e) {
      return sendJSON(res, 502, { error: 'Brainstorm failed: ' + e.message });
    }
  }

  // ── Ads: Claude video prompts ─────────────────────────────────────────────
  if (url === '/api/gen/shots' && method === 'POST') {
    const { concept, refImages } = await readBody(req); // must read body before any early return
    const anthropicKey = ANTHROPIC_API_KEY;
    if (!anthropicKey) return sendJSON(res, 503, { error: 'Anthropic API key not configured on server (ANTHROPIC_API_KEY missing).' });
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Sign in to use Ads.' });

    const PROMPTS_COST = 5;
    const db = loadDB(); const user = db.users[sess.userId];
    const cur = user.credits ?? 1000;
    if (cur < PROMPTS_COST) return sendJSON(res, 402, { error: `Not enough credits. Need ${PROMPTS_COST}, have ${cur}.` });

    if (!concept) return sendJSON(res, 400, { error: 'Concept required.' });

    // Don't send ref images — OpenAI PNG base64 per image is ~2MB; 12 images would exceed
    // Anthropic's request size limit. The concept JSON already describes every ref image
    // (label + generation prompt) which is all Claude needs to write video prompts.
    const userContent = [
      { type: 'text', text: `Ad concept:\n${JSON.stringify(concept, null, 2)}\n\nCreate a Seedance 2.0 video generation prompt for EACH scene listed in the concept.` }
    ];

    const system = `You are an expert AI video prompt engineer specializing in Seedance 2.0 (ByteDance's video generation model). You use the Video Prompt Builder methodology — every prompt is built shot-by-shot with precise effect names, density contrast, a signature moment, and a clear energy arc.

## HOW TO BUILD EACH SCENE PROMPT

For each scene in the ad concept, write a complete video generation prompt using this exact shot structure:

SHOT [N] ([timestamp]) — [Shot Name]
• EFFECT: [Primary effect name] + [secondary effects if stacked]
• [What is visually happening — subject, camera angle, environment]
• [Camera behaviour — movement, angle, lens behaviour]
• [Speed/timing — be specific: "approximately 20-25% speed", not just "slow motion"]
• [How this shot exits / transitions to the next]

Name effects precisely:
- Speed: "speed ramp (deceleration)", "speed ramp (acceleration)", "slow-motion at ~20-25% speed"
- Camera: "dolly in", "handheld tracking", "static overhead", "Dutch angle ~30°", "high-angle wide"
- Digital: "digital zoom punch (scale-in)", "digital zoom pull-back (scale-out)", "zoom pump (rapid in-out pulse)"
- Transitions: "white bloom flash entry", "whip pan exit (motion blur smear)", "motion blur as connector"
- Atmosphere: "motion blur streaks", "light flares", "depth-of-field rack focus", "camera shake/vibration"

Describe stacked effects explicitly — if 3 things happen at once, list all 3.
Mark the most impactful shot: "This is the SIGNATURE VISUAL EFFECT."

After the shot list, append on separate lines:
EFFECTS DENSITY: list each 2-3s segment as HIGH (4+ effects), MEDIUM (2-3 effects), or LOW (1 effect)
ENERGY ARC: one sentence — opening energy → signature peak → how it resolves

## CREATIVE PRINCIPLES

- Contrast drives impact: alternate HIGH-density and LOW-density moments
- Every scene must have one SIGNATURE moment — called out explicitly
- Transitions ARE shots: whip pans, bloom flashes, motion blur smears are creative moments, not filler
- Specificity always: "the frame scales inward rapidly" not "zoom in"
- Energy must resolve: the final beat should feel intentional, not abrupt

## DURATION CALIBRATION

There are EXACTLY 2 scenes, each EXACTLY 15 seconds. Do not shorten, do not extend.
- Scene 1 (PROBLEM, 0:00–0:15): 5–7 shots. Build the ache, contrast HIGH/LOW density, end on the pain peak.
- Scene 2 (SOLUTION, 0:00–0:15): 5–7 shots. Open by mirroring Scene 1's final frame, the product enters and resolves the tension, end on the new emotional reality.
Shot timestamps must add up to 15 seconds per scene.

## PACE & CUTTING

These ads must feel FAST — like a Wes Anderson sequence or a punchy TikTok edit, not a perfume commercial. Average shot length 2–3 seconds. Never hold a single composition for more than 4 seconds without internal motion (camera move, subject action, or effect). Cuts should land on action — a hand grabbing, a foot stepping, a door opening — not on dead air.

## MAP ACTION BEATS TO SHOTS

The concept JSON gives you "actionBeats" arrays for each scene. Each beat is a concrete micro-action the character does. Translate every beat into at least one shot — the shot should literally show that action with a verb (e.g. beat "she fumbles for keys in her bag" → SHOT showing close-up of hand digging in a bag, keys jangling). Do not skip beats, do not invent contemplative shots that aren't tied to an action beat. The beats ARE your shot list — your job is to choose the camera angle, the effect, and the cut for each.

## STORY STRUCTURE

Scene 1 = PROBLEM (no product visible). Scene 2 = SOLUTION (product present, same person/environment as Scene 1). Treat them as a single 30-second arc: Scene 2 must visually echo Scene 1 (same character, same lighting tone, same space) so the contrast lands.

## PRODUCT FRAMING CONSISTENCY (CRITICAL)

The product must appear at a CONSISTENT scale and framing wherever it shows up — across all shots in Scene 2 and across the starting frame. Pick one specific framing rule for the product (e.g. "held in hand at chest height, centered, occupying ~35% of frame width" or "set on a wooden surface, centered, ~40% of frame width, shot from eye level") and state it explicitly in every shot that contains the product. Never let the product appear tiny in one shot and dominant in the next — the audience must feel one consistent object.

## COPYRIGHT SAFETY — CRITICAL

ByteDance's content filter rejects prompts containing brand names, trademarks, logos, or real person names. Violating this causes the entire video generation to fail.
- NEVER write the brand/company name — use "the brand", "the company", or describe its visual role
- NEVER write "logo" — describe visually: "a colorful emblem on the chest", "a distinctive mark on the package"
- NEVER name real people, celebrities, or public figures
- NEVER reference song titles, film titles, or other IP
- Describe clothing, products, environments by visual characteristics only: colors, shapes, textures, materials

## OUTPUT FORMAT — FOLLOW EXACTLY

Output in two parts with no extra text before or after:

PART 1 — one line of compact JSON (no line breaks inside the JSON):
SCENES_META: [{"number":1,"role":"problem","name":"Scene name","useRefImages":["key1"],"ratio":"9:16","duration":15,"startingImagePrompt":"One concise sentence: exact composition of the first frame — subject, environment, camera angle, lighting, mood"},{"number":2,"role":"solution",...,"duration":15,...}]

Always exactly two entries: number 1 with role "problem" (no product in starting frame), number 2 with role "solution" (product present in starting frame at the agreed consistent framing). Both duration values must be 15.

"startingImagePrompt" must be a SHORT single-line sentence (max 35 words) describing the very first frame of that scene so it can be used to generate a starting image via an image generation model. CRITICAL: every key listed in this scene's "useRefImages" will be sent to the image generator as actual visual input alongside this prompt. So do NOT re-describe what those refs show — do NOT describe the character's hair/clothing/face if a character ref is attached, do NOT describe the product's appearance if the product ref is attached, do NOT describe the environment's layout if an environment ref is attached. INSTEAD use phrases like "the character" / "the product" / "the environment" and focus the words on what the refs cannot supply: composition, camera angle, framing, pose, gesture, action, expression, lighting direction and quality, mood. No brand names, no logos, no real people. For Scene 2 specifically, the startingImagePrompt MUST state the exact product framing (position in frame, height, percentage of frame width occupied, camera angle to the product) and that framing must match what is described in the shot list. This field MUST be included for every scene.

PART 2 — each scene's full prompt text, wrapped in tags (use the scene number from above):
<scene_1>
SHOT 1 (0:00-0:03) — Shot Name
• EFFECT: primary effect + secondary effect
• What is visually happening
• Camera behaviour
• How this shot exits
SHOT 2 (0:03-0:07) — Shot Name
• EFFECT: ...
SHOT 3 (0:07-0:11) — Shot Name
• EFFECT: ...
SHOT 4 (0:11-0:15) — Shot Name
• EFFECT: ... (final beat — peak of the pain, no product visible)
EFFECTS DENSITY: 0-5s LOW, 5-10s MEDIUM, 10-15s HIGH
ENERGY ARC: Opening energy → signature peak → resolution
</scene_1>
<scene_2>
SHOT 1 (0:00-0:03) — Shot Name
• EFFECT: ... (visually echoes Scene 1's final frame so continuity reads)
• PRODUCT FRAMING: state the consistent framing rule for the product
SHOT 2 (0:03-0:08) — Shot Name (product reveal at the agreed framing)
• EFFECT: ...
SHOT 3 (0:08-0:12) — Shot Name
• EFFECT: ...
SHOT 4 (0:12-0:15) — Shot Name
• EFFECT: ... (resolution beat — product still framed at the agreed scale)
EFFECTS DENSITY: 0-5s LOW, 5-10s HIGH, 10-15s MEDIUM
ENERGY ARC: Continuity with Scene 1 → product reveal peak → resolved landing
</scene_2>

Match the mood, visual style, and color palette from the ad concept. Write like a director's shot notes — direct, technical, specific. No hype language.`;

    try {
      const claudeRes = await claudeApiCall(anthropicKey, system, [{ role: 'user', content: userContent }]);
      if (claudeRes.status !== 200) {
        const msg = claudeRes.body?.error?.message || JSON.stringify(claudeRes.body).substring(0, 300);
        return sendJSON(res, claudeRes.status >= 400 ? claudeRes.status : 502, { error: 'Claude error: ' + msg });
      }
      const text = claudeRes.body?.content?.[0]?.text || '';

      // Parse hybrid format: "SCENES_META: [...]" + <scene_N>...</scene_N> blocks
      // Use bracket-balancing to extract the array — simple non-greedy regex would stop
      // at the first nested ']' (e.g. inside "useRefImages": ["k1","k2"]) and break.
      const metaStart = text.indexOf('SCENES_META:');
      if (metaStart === -1) return sendJSON(res, 502, { error: 'Claude response missing SCENES_META line. Raw: ' + text.substring(0, 300) });
      const arrOpen = text.indexOf('[', metaStart);
      if (arrOpen === -1) return sendJSON(res, 502, { error: 'SCENES_META has no array. Raw: ' + text.substring(metaStart, metaStart + 200) });
      let depth = 0, arrClose = -1;
      for (let i = arrOpen; i < text.length; i++) {
        if (text[i] === '[') depth++;
        else if (text[i] === ']') { depth--; if (depth === 0) { arrClose = i; break; } }
      }
      if (arrClose === -1) return sendJSON(res, 502, { error: 'SCENES_META array never closes.' });
      let metaArr;
      try { metaArr = JSON.parse(text.slice(arrOpen, arrClose + 1)); }
      catch(e) { return sendJSON(res, 502, { error: 'SCENES_META JSON invalid: ' + e.message + '. Raw: ' + text.slice(arrOpen, arrOpen + 200) }); }

      const scenes = metaArr.map(s => {
        const m = text.match(new RegExp('<scene_' + s.number + '>([\\s\\S]*?)<\\/scene_' + s.number + '>'));
        const prompt = m ? m[1].trim() : '';
        if (!prompt) console.warn('[shots] scene', s.number, 'has no <scene_N> block — prompt will be empty');
        return { ...s, prompt };
      });

      user.credits = Math.round((cur - PROMPTS_COST) * 100) / 100;
      saveDB(db);
      return sendJSON(res, 200, { scenes, credits: user.credits });
    } catch(e) {
      return sendJSON(res, 502, { error: 'Video prompts failed: ' + e.message });
    }
  }

  // ── Fal.ai upscale: submit ───────────────────────────────────────────────────
  if (url === '/api/upscale' && method === 'POST') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    if (!FAL_KEY) return sendJSON(res, 503, { error: 'Upscaler not configured' });
    const { video_url } = await readBody(req);
    if (!video_url) return sendJSON(res, 400, { error: 'video_url required' });
    try {
      const result = await falRequest('POST', '/fal-ai/topaz/upscale/video', { video_url, upscale_factor: 2, H264_output: true });
      const requestId = result.body?.request_id;
      if (!requestId) {
        console.error('[fal] submit failed', result.status, JSON.stringify(result.body).substring(0, 200));
        return sendJSON(res, 502, { error: 'Fal submit failed: ' + (result.body?.detail || result.status) });
      }
      // Fal returns status_url and response_url scoped to the right namespace
      // (for nested model paths like fal-ai/topaz/upscale/video the URLs Fal
      // returns differ from the model path — using these directly avoids guessing).
      const statusUrl = result.body?.status_url || null;
      const responseUrl = result.body?.response_url || null;
      console.log('[fal] upscale submitted', requestId, 'statusUrl:', statusUrl);
      return sendJSON(res, 200, { requestId, statusUrl, responseUrl });
    } catch(e) {
      console.error('[fal] submit error:', e.message);
      return sendJSON(res, 502, { error: 'Upscale failed: ' + e.message });
    }
  }

  // ── Fal.ai upscale: poll status ──────────────────────────────────────────────
  if (url.startsWith('/api/upscale/status') && method === 'GET') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    if (!FAL_KEY) return sendJSON(res, 503, { error: 'Upscaler not configured' });
    const params = new URL('http://x' + url).searchParams;
    const requestId = params.get('id');
    if (!requestId) return sendJSON(res, 400, { error: 'id required' });

    // Validate any client-supplied URLs to ensure we only hit Fal's queue host.
    const safePath = (raw) => {
      if (!raw) return null;
      try {
        const u = new URL(raw);
        if (u.hostname !== 'queue.fal.run') return null;
        return u.pathname + u.search;
      } catch { return null; }
    };
    // Prefer the URLs Fal returned at submit time; fall back to legacy guess
    // for items submitted before this fix shipped.
    const fallback = '/fal-ai/topaz/upscale/video/requests/' + encodeURIComponent(requestId);
    const statusPath   = safePath(params.get('statusUrl'))   || (fallback + '/status');
    const responsePath = safePath(params.get('responseUrl')) || fallback;

    try {
      const statusRes = await falRequest('GET', statusPath);
      const rawStatus = String(statusRes.body?.status || '').toUpperCase();
      console.log('[fal] poll http=' + statusRes.status + ' status=' + rawStatus + ' path=' + statusPath);

      const looksProgress = rawStatus === 'IN_QUEUE' || rawStatus === 'IN_PROGRESS' || rawStatus === 'QUEUED' || rawStatus === 'RUNNING';
      if (looksProgress) return sendJSON(res, 200, { status: rawStatus });

      // Status is COMPLETED, unknown, or status fetch returned nothing useful —
      // try the response endpoint. If it has a video URL the job is done,
      // regardless of what the status field said.
      const resultRes = await falRequest('GET', responsePath);
      const videoUrl = resultRes.body?.video?.url || resultRes.body?.output?.video?.url || '';
      if (videoUrl) {
        console.log('[fal] upscale complete, url:', videoUrl.substring(0, 80));
        return sendJSON(res, 200, { status: 'COMPLETED', url: videoUrl });
      }
      if (rawStatus === 'COMPLETED' || rawStatus === 'OK' || rawStatus === 'SUCCESS') {
        return sendJSON(res, 502, { error: 'Fal reports complete but no video URL. Body: ' + JSON.stringify(resultRes.body).substring(0, 200) });
      }
      return sendJSON(res, 200, { status: rawStatus || 'IN_QUEUE' });
    } catch(e) {
      console.error('[fal] status error:', e.message);
      return sendJSON(res, 502, { error: 'Status check failed: ' + e.message });
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
    console.log('  ║   🎬  Lepton is running!    ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log('  ║   Open: http://localhost:' + PORT + '         ║');
    console.log('  ║   Stop: Ctrl+C                       ║');
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
  });
});
