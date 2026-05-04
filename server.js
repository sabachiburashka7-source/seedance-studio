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

const PROMO_CODES = {
  'SEED10A': 10, 'SEED10B': 10, 'SEED10C': 10, 'SEED10D': 10,
  'SEED20A': 20, 'SEED20B': 20, 'SEED20C': 20, 'SEED20D': 20,
  'SEED50A': 50, 'SEED50B': 50, 'SEED50C': 50,
  'SEED100A': 100, 'SEED100B': 100, 'SEED100C': 100,
};

// ── In-memory DB cache ────────────────────────────────────────────────────────
let dbCache = { users: {}, emailIndex: {}, sessions: {}, library: {}, verifyCodes: {}, resetCodes: {}, redeemedPromos: {} };

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
    migrateBalance();
  } catch(e) {
    console.error('[db] initDB error (continuing with empty db):', e.message);
  }
}

function migrateBalance() {
  if (!dbCache.users) return;
  if (!dbCache.redeemedPromos) dbCache.redeemedPromos = {};
  let n = 0;
  for (const uid of Object.keys(dbCache.users)) {
    const u = dbCache.users[uid];
    if (u.balance === undefined) {
      // Convert legacy credits to dollars (1 cr = $0.033), or start at $0 for brand-new accounts
      u.balance = u.credits !== undefined ? Math.round(u.credits * 0.033 * 100) / 100 : 0;
      n++;
    }
    delete u.credits;
  }
  if (n > 0) { console.log(`[db] Migrated balance for ${n} user(s)`); saveDB(dbCache); }
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
          migrateBalance();
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
function claudeApiCall(apiKey, system, messages, maxTokens = 8192, timeoutMs = 240000) {
  apiKey = apiKey || ANTHROPIC_API_KEY;
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
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
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Claude timeout')));
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

// ── Ad pipeline skill prompts ──────────────────────────────────────────────
const SKILL_BRIEF   = fs.readFileSync(path.join(__dirname, 'skills/ad-idea-generator.md'), 'utf8').replace(/^---[\s\S]*?---\s*/m, '').trim();
const SKILL_SHOTS   = fs.readFileSync(path.join(__dirname, 'skills/video-prompt-builder.md'), 'utf8').replace(/^---[\s\S]*?---\s*/m, '').trim();
const SKILL_REFS    = fs.readFileSync(path.join(__dirname, 'skills/ref-sheet-generator.md'), 'utf8').replace(/^---[\s\S]*?---\s*/m, '').trim();
const SKILL_FRAMES  = fs.readFileSync(path.join(__dirname, 'skills/starting-frame-generator.md'), 'utf8').replace(/^---[\s\S]*?---\s*/m, '').trim();

// ── Ad pipeline output parsers ─────────────────────────────────────────────
function parseShotsOutput(text) {
  const scenes = [];
  const parts = text.split(/(?====\s*SCENE\s+\d+\s+OF\s+\d+)/);
  for (const part of parts) {
    const hm = part.match(/===\s*SCENE\s+(\d+)\s+OF\s+\d+\s*[—–-]\s*([^\n=]+?)[\s]*===\s*\n?([\s\S]*)/);
    if (!hm) continue;
    scenes.push({ number: parseInt(hm[1]), name: hm[2].trim(), prompt: hm[3].trim(), duration: 15, ratio: '9:16' });
  }
  return scenes;
}

function parseRefSheetsOutput(text) {
  const entities = [];
  const charSec = (text.match(/===\s*CHARACTER REFERENCE SHEETS\s*===([\s\S]*?)(?====\s*PRODUCT)/) || [])[1] || '';
  charSec.split(/(?=^CHARACTER:)/m).filter(b => b.trim().startsWith('CHARACTER:')).forEach(block => {
    const nm = block.match(/^CHARACTER:\s*(.+)/m);
    const id = block.match(/SUBJECT ID:\s*(\d{3})/i);
    if (nm) entities.push({ type: 'character', name: nm[1].trim(), subjectId: id ? id[1] : null, prompt: block.replace(/^CHARACTER:[^\n]+\n?/, '').trim() });
  });
  const prodSec = (text.match(/===\s*PRODUCT REFERENCE SHEET\s*===([\s\S]*?)(?====\s*ENVIRONMENT)/) || [])[1] || '';
  const pnm = prodSec.match(/^PRODUCT:\s*(.+)/m);
  if (pnm) entities.push({ type: 'product', name: pnm[1].trim(), subjectId: null, prompt: 'generate this product reference sheet for consistency' });
  const envSec = (text.match(/===\s*ENVIRONMENT REFERENCE SHEETS\s*===([\s\S]*)$/) || [])[1] || '';
  envSec.split(/(?=^ENVIRONMENT:)/m).filter(b => b.trim().startsWith('ENVIRONMENT:')).forEach(block => {
    const nm = block.match(/^ENVIRONMENT:\s*(.+)/m);
    const id = block.match(/ENV ID:\s*(\d{3})/i);
    if (nm) entities.push({ type: 'environment', name: nm[1].trim(), envId: id ? id[1] : null, prompt: block.replace(/^ENVIRONMENT:[^\n]+\n?/, '').trim() });
  });
  return entities;
}

function parseStartFramesOutput(text) {
  const frames = [];
  const section = (text.match(/===\s*STARTING FRAMES\s*===([\s\S]*)/) || [])[1] || text;
  section.split(/\n(?=SCENE\s+\d+:\s*\n)/).forEach(block => {
    const m = block.match(/^SCENE\s+(\d+):\s*\n([\s\S]+)/);
    if (!m) return;
    const prompt = m[2].trim();
    frames.push({
      scene: parseInt(m[1]), prompt,
      subjectIds: [...prompt.matchAll(/SUBJECT ID:\s*(\d{3})/g)].map(x => x[1]),
      envIds:     [...prompt.matchAll(/ENV ID:\s*(\d{3})/g)].map(x => x[1])
    });
  });
  return frames;
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
    db.users[userId]   = { email: key, hash: hashPass(password, salt), salt, createdAt: Date.now(), verified: !needsVerify, balance: 0 };
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
    return sendJSON(res, 200, { token, email: key, userId, balance: db.users[userId].balance ?? 0 });
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
    return sendJSON(res, 200, { token, email: key, userId, balance: db.users[userId].balance ?? 0 });
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
    return sendJSON(res, 200, { token, email: user.email, userId, balance: user.balance ?? 0 });
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
    return sendJSON(res, 200, { email: user.email, userId: sess.userId, balance: user.balance ?? 0 });
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
          const added = Math.round(credits * 0.033 * 100) / 100;
          user.balance = Math.round(((user.balance ?? 0) + added) * 100) / 100;
          saveDB(db);
          console.log('[stripe] +$' + added + ' → user ' + userId + ' (total: $' + user.balance + ')');
        }
      }
    }
    return sendJSON(res, 200, { received: true });
  }

  // ── Balance ───────────────────────────────────────────────────────────
  if (url === '/api/balance' && method === 'GET') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    const db   = loadDB();
    return sendJSON(res, 200, { balance: db.users[sess.userId].balance ?? 0 });
  }

  if (url === '/api/refund' && method === 'POST') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    const { amount } = await readBody(req);
    if (!amount || amount <= 0) return sendJSON(res, 400, { error: 'Invalid amount' });
    const db = loadDB();
    const user = db.users[sess.userId];
    user.balance = Math.round(((user.balance ?? 0) + amount) * 100) / 100;
    saveDB(db);
    console.log('[refund] +$' + amount + ' → user ' + sess.userId + ' (total: $' + user.balance + ')');
    return sendJSON(res, 200, { balance: user.balance });
  }

  if (url === '/api/deduct' && method === 'POST') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    const { amount } = await readBody(req);
    if (!amount || amount <= 0) return sendJSON(res, 400, { error: 'Invalid amount' });
    const db   = loadDB();
    const user = db.users[sess.userId];
    const cur  = user.balance ?? 0;
    if (cur < amount) return sendJSON(res, 402, { error: `Insufficient balance. Need $${amount.toFixed(2)}, have $${cur.toFixed(2)}.`, balance: cur });
    user.balance = Math.round((cur - amount) * 100) / 100;
    saveDB(db);
    return sendJSON(res, 200, { balance: user.balance });
  }

  if (url === '/api/redeem-promo' && method === 'POST') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    const { code } = await readBody(req);
    if (!code) return sendJSON(res, 400, { error: 'Code required' });
    const upper = String(code).toUpperCase().trim();
    const amount = PROMO_CODES[upper];
    if (!amount) return sendJSON(res, 400, { error: 'Invalid promo code' });
    const db = loadDB();
    if (!db.redeemedPromos) db.redeemedPromos = {};
    if (db.redeemedPromos[upper]) return sendJSON(res, 409, { error: 'This promo code has already been redeemed' });
    const user = db.users[sess.userId];
    if (!user) return sendJSON(res, 404, { error: 'User not found' });
    db.redeemedPromos[upper] = { userId: sess.userId, at: Date.now() };
    user.balance = Math.round(((user.balance ?? 0) + amount) * 100) / 100;
    saveDB(db);
    console.log('[promo] ' + upper + ' redeemed by user ' + sess.userId + ' (+$' + amount + ', total: $' + user.balance + ')');
    return sendJSON(res, 200, { balance: user.balance, added: amount });
  }

  // ── Seedream image generation (BytePlus Ark) ─────────────────────────────
  if (url === '/api/generate-image' && method === 'POST') {
    const { prompt, ratio, quality, imageBase64, imageMime, images } = await readBody(req); // must read body before any early return
    // Normalize to a list of {base64, mime}: legacy single-image fields still supported
    const refImagesList = Array.isArray(images) && images.length
      ? images.filter(i => i && i.base64).map(i => ({ base64: i.base64, mime: i.mime || 'image/jpeg' }))
      : (imageBase64 ? [{ base64: imageBase64, mime: imageMime || 'image/jpeg' }] : []);
    if (!BYTEPLUS_API_KEY) return sendJSON(res, 503, { error: 'Image generation not configured on server (BYTEPLUS_API_KEY missing).' });
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Sign in to generate images.' });
    const imgCost = quality === 'low' ? 0.02 : 0.08;
    {
      const db  = loadDB();
      const cur = db.users[sess.userId].balance ?? 0;
      if (cur < imgCost) return sendJSON(res, 402, { error: `Insufficient balance. Need $${imgCost.toFixed(2)}, have $${cur.toFixed(2)}.`, balance: cur });
    }
    if (!prompt) return sendJSON(res, 400, { error: 'Prompt required' });

    // Seedream 5.0: size must be WIDTHxHEIGHT, '2k', '3k', or '4k'
    const SIZE_MAP = { '1:1': '2048x2048', '16:9': '2688x1512', '9:16': '1512x2688', '4:3': '2560x1920', '3:4': '1920x2560', '21:9': '2688x1152' };
    const size = SIZE_MAP[ratio] || (quality === 'low' ? '2k' : '3k');
    const useRef = refImagesList.length > 0;
    console.log('[seedream-image]', useRef ? `with ${refImagesList.length} ref(s):` : 'generating:', size, quality, prompt.substring(0, 80));

    const payload = {
      model: 'seedream-5-0-260128',
      prompt,
      size,
      output_format: 'jpeg',
      watermark: false
    };
    if (useRef) {
      // Single image: use 'image' field; multiple: use 'image_urls' array
      if (refImagesList.length === 1) {
        payload.image = `data:${refImagesList[0].mime};base64,${refImagesList[0].base64}`;
      } else {
        payload.image_urls = refImagesList.map(img => `data:${img.mime};base64,${img.base64}`);
      }
    }
    const reqBody = Buffer.from(JSON.stringify(payload));

    const MAX_IMG_ATTEMPTS = 4;
    const seedreamRequest = () => new Promise((resolve, reject) => {
      const opts = {
        hostname: BYTEPLUS, port: 443,
        path: '/api/v3/images/generations', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': reqBody.length, 'Authorization': 'Bearer ' + BYTEPLUS_API_KEY }
      };
      const r = https.request(opts, resp => {
        const ch = [];
        resp.on('data', c => ch.push(c));
        resp.on('end', () => {
          const raw = Buffer.concat(ch).toString();
          if (!raw) { reject(new Error(`Seedream returned empty body (HTTP ${resp.statusCode})`)); return; }
          try { resolve({ status: resp.statusCode, body: JSON.parse(raw) }); }
          catch(e) { reject(new Error(`Seedream non-JSON response (HTTP ${resp.statusCode}): ${raw.substring(0, 200)}`)); }
        });
      });
      // 150s per attempt
      r.setTimeout(150000, () => { r.destroy(); reject(new Error('Seedream request timed out after 150s')); });
      r.on('error', reject);
      r.write(reqBody); r.end();
    });

    for (let attempt = 1; attempt <= MAX_IMG_ATTEMPTS; attempt++) {
      try {
        const result = await seedreamRequest();

        if (result.status === 429) {
          const waitSec = attempt * 20;
          console.log(`[seedream-image] rate limited (attempt ${attempt}/${MAX_IMG_ATTEMPTS}), waiting ${waitSec}s`);
          if (attempt < MAX_IMG_ATTEMPTS) {
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
          }
          const errMsg = result.body?.error?.message || 'Seedream rate limit exceeded — try again in a moment';
          return sendJSON(res, 429, { error: errMsg });
        }

        if (result.status !== 200) {
          const errMsg = result.body?.error?.message || JSON.stringify(result.body).substring(0, 400);
          console.error('[seedream-image] error', result.status, errMsg);
          return sendJSON(res, result.status >= 400 && result.status < 600 ? result.status : 500, { error: errMsg });
        }

        // API returns a URL; fetch it and convert to base64 data URL
        const imgUrl = result.body.data?.[0]?.url || result.body.data?.[0]?.b64_json && `data:image/jpeg;base64,${result.body.data[0].b64_json}`;
        if (!imgUrl) return sendJSON(res, 500, { error: 'No image data returned by Seedream' });

        let dataUrl = imgUrl;
        if (imgUrl.startsWith('http')) {
          try {
            const imgBuf = await new Promise((resolve, reject) => {
              https.get(imgUrl, r => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => resolve(Buffer.concat(c))); r.on('error', reject); }).on('error', reject);
            });
            dataUrl = `data:image/jpeg;base64,${imgBuf.toString('base64')}`;
          } catch (fe) {
            console.warn('[seedream-image] could not fetch image URL, storing URL directly:', fe.message);
            dataUrl = imgUrl;
          }
        }
        console.log('[seedream-image] done, dataUrl length:', dataUrl.length);
        const db2  = loadDB();
        const usr2 = db2.users[sess.userId];
        const cur2 = usr2.balance ?? 0;
        usr2.balance = Math.round((cur2 - imgCost) * 100) / 100;
        saveDB(db2);
        return sendJSON(res, 200, { url: dataUrl, balance: usr2.balance });
      } catch(e) {
        const isTimeout = e.message.includes('timed out');
        console.error(`[seedream-image] attempt ${attempt} error:`, e.message);
        if (attempt < MAX_IMG_ATTEMPTS && isTimeout) {
          const waitSec = attempt * 15;
          console.log(`[seedream-image] timeout, retrying after ${waitSec}s (attempt ${attempt})`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }
        return sendJSON(res, 502, { error: 'Seedream request failed: ' + e.message });
      }
    }
  }

  // ── Ads: Claude brainstorm ────────────────────────────────────────────────
  if (url === '/api/gen/brief' && method === 'POST') {
    const { images, description } = await readBody(req);
    const anthropicKey = ANTHROPIC_API_KEY;
    if (!anthropicKey) return sendJSON(res, 503, { error: 'Anthropic API key not configured on server (ANTHROPIC_API_KEY missing).' });
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Sign in to use Ads.' });
    if (!images || !images.length) return sendJSON(res, 400, { error: 'Upload at least one product image.' });

    const BRAINSTORM_COST = 0.15;
    const db = loadDB(); const user = db.users[sess.userId];
    const cur = user.balance ?? 0;
    if (cur < BRAINSTORM_COST) return sendJSON(res, 402, { error: `Insufficient balance. Need $${BRAINSTORM_COST.toFixed(2)}, have $${cur.toFixed(2)}.` });

    const userContent = [];
    for (const img of images) {
      userContent.push({ type: 'image', source: { type: 'base64', media_type: img.mime || 'image/jpeg', data: img.base64 } });
    }
    const descText = description ? `Product description: ${description}\n\n` : '';
    userContent.push({ type: 'text', text: `${descText}Generate one short-form ad concept for this product following your methodology. Output ONLY the CONCEPT block and SCENES list — no preamble, no rationale.` });

    const system = SKILL_BRIEF;
    try {
      const claudeRes = await claudeApiCall(anthropicKey, system, [{ role: 'user', content: userContent }]);
      if (claudeRes.status !== 200) {
        const msg = claudeRes.body?.error?.message || JSON.stringify(claudeRes.body).substring(0, 300);
        return sendJSON(res, claudeRes.status >= 400 ? claudeRes.status : 502, { error: 'Claude error: ' + msg });
      }
      const ideaText = claudeRes.body?.content?.[0]?.text || '';
      if (!ideaText.includes('CONCEPT') || !ideaText.includes('SCENES')) {
        return sendJSON(res, 502, { error: 'Claude returned unexpected format. Raw: ' + ideaText.substring(0, 200) });
      }
      user.balance = Math.round((cur - BRAINSTORM_COST) * 100) / 100;
      saveDB(db);
      return sendJSON(res, 200, { ideaText, balance: user.balance });
    } catch(e) {
      return sendJSON(res, 502, { error: 'Brief failed: ' + e.message });
    }
  }

  // ── Ads: Stage 2 — video prompts (video-prompt-builder skill) ─────────────
  if (url === '/api/gen/shots' && method === 'POST') {
    const { ideaText } = await readBody(req);
    const anthropicKey = ANTHROPIC_API_KEY;
    if (!anthropicKey) return sendJSON(res, 503, { error: 'Anthropic API key not configured.' });
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Sign in to use Ads.' });
    if (!ideaText) return sendJSON(res, 400, { error: 'ideaText required.' });

    const PROMPTS_COST = 0.15;
    const db = loadDB(); const user = db.users[sess.userId];
    const cur = user.balance ?? 0;
    if (cur < PROMPTS_COST) return sendJSON(res, 402, { error: `Insufficient balance. Need $${PROMPTS_COST.toFixed(2)}, have $${cur.toFixed(2)}.` });

    const userContent = [{ type: 'text', text: `Here is the ad concept and scene breakdown:\n\n${ideaText}\n\nGenerate the per-scene cinematic video prompts for Seedance 2.0. Use the per-scene output format (one self-contained document per scene with === SCENE N OF M === headers, shot timeline, effects inventory, density map, energy arc).` }];

    try {
      const claudeRes = await claudeApiCall(anthropicKey, SKILL_SHOTS, [{ role: 'user', content: userContent }]);
      if (claudeRes.status !== 200) {
        const msg = claudeRes.body?.error?.message || JSON.stringify(claudeRes.body).substring(0, 300);
        return sendJSON(res, claudeRes.status >= 400 ? claudeRes.status : 502, { error: 'Claude error: ' + msg });
      }
      const shotsText = claudeRes.body?.content?.[0]?.text || '';
      const scenes = parseShotsOutput(shotsText);
      if (!scenes.length) console.warn('[shots] parseShotsOutput returned 0 scenes. Raw start:', shotsText.substring(0, 200));
      user.balance = Math.round((cur - PROMPTS_COST) * 100) / 100;
      saveDB(db);
      return sendJSON(res, 200, { scenes, shotsText, balance: user.balance });
    } catch(e) {
      return sendJSON(res, 502, { error: 'Video prompts failed: ' + e.message });
    }
  }


  // ── Ads: Stage 3 — reference sheet prompts (ref-sheet-generator skill) ─────
  if (url === '/api/gen/refsheets' && method === 'POST') {
    const { ideaText, shotsText } = await readBody(req);
    const anthropicKey = ANTHROPIC_API_KEY;
    if (!anthropicKey) return sendJSON(res, 503, { error: 'Anthropic API key not configured.' });
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Sign in to use Ads.' });
    if (!ideaText || !shotsText) return sendJSON(res, 400, { error: 'ideaText and shotsText required.' });

    const REFS_COST = 0.10;
    const db = loadDB(); const user = db.users[sess.userId];
    const cur = user.balance ?? 0;
    if (cur < REFS_COST) return sendJSON(res, 402, { error: `Insufficient balance. Need $${REFS_COST.toFixed(2)}, have $${cur.toFixed(2)}.` });

    const userMsg = `INPUT A — CONCEPT + SCENES (from ad-idea-generator):\n${ideaText}\n\nINPUT B — PER-SCENE CINEMATIC DOCUMENTS (from video-prompt-builder):\n${shotsText}\n\nGenerate the reference sheet prompts for all characters, the product, and all environments. Output ONLY the three labeled blocks (=== CHARACTER REFERENCE SHEETS ===, === PRODUCT REFERENCE SHEET ===, === ENVIRONMENT REFERENCE SHEETS ===) with no preamble.`;

    try {
      const claudeRes = await claudeApiCall(anthropicKey, SKILL_REFS, [{ role: 'user', content: userMsg }]);
      if (claudeRes.status !== 200) {
        const msg = claudeRes.body?.error?.message || JSON.stringify(claudeRes.body).substring(0, 300);
        return sendJSON(res, claudeRes.status >= 400 ? claudeRes.status : 502, { error: 'Claude error: ' + msg });
      }
      const refSheetsText = claudeRes.body?.content?.[0]?.text || '';
      const entities = parseRefSheetsOutput(refSheetsText);
      if (!entities.length) console.warn('[refsheets] parseRefSheetsOutput returned 0 entities. Raw start:', refSheetsText.substring(0, 200));
      user.balance = Math.round((cur - REFS_COST) * 100) / 100;
      saveDB(db);
      return sendJSON(res, 200, { entities, refSheetsText, balance: user.balance });
    } catch(e) {
      return sendJSON(res, 502, { error: 'Ref sheets failed: ' + e.message });
    }
  }

  // ── Ads: Stage 4 — starting frame prompts (starting-frame-generator skill) ──
  if (url === '/api/gen/startframes' && method === 'POST') {
    const { ideaText, shotsText, refSheetsText } = await readBody(req);
    const anthropicKey = ANTHROPIC_API_KEY;
    if (!anthropicKey) return sendJSON(res, 503, { error: 'Anthropic API key not configured.' });
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Sign in to use Ads.' });
    if (!ideaText || !shotsText || !refSheetsText) return sendJSON(res, 400, { error: 'ideaText, shotsText, and refSheetsText required.' });

    const FRAMES_COST = 0.05;
    const db = loadDB(); const user = db.users[sess.userId];
    const cur = user.balance ?? 0;
    if (cur < FRAMES_COST) return sendJSON(res, 402, { error: `Insufficient balance. Need $${FRAMES_COST.toFixed(2)}, have $${cur.toFixed(2)}.` });

    const userMsg = `INPUT A — CONCEPT + SCENES:\n${ideaText}\n\nINPUT B — PER-SCENE CINEMATIC DOCUMENTS:\n${shotsText}\n\nINPUT C — REFERENCE SHEET PROMPTS:\n${refSheetsText}\n\nGenerate the starting frame prompts for all scenes. Output ONLY the === STARTING FRAMES === block.`;

    try {
      const claudeRes = await claudeApiCall(anthropicKey, SKILL_FRAMES, [{ role: 'user', content: userMsg }]);
      if (claudeRes.status !== 200) {
        const msg = claudeRes.body?.error?.message || JSON.stringify(claudeRes.body).substring(0, 300);
        return sendJSON(res, claudeRes.status >= 400 ? claudeRes.status : 502, { error: 'Claude error: ' + msg });
      }
      const framesText = claudeRes.body?.content?.[0]?.text || '';
      const startFrames = parseStartFramesOutput(framesText);
      if (!startFrames.length) console.warn('[startframes] parseStartFramesOutput returned 0 frames. Raw start:', framesText.substring(0, 200));
      user.balance = Math.round((cur - FRAMES_COST) * 100) / 100;
      saveDB(db);
      return sendJSON(res, 200, { startFrames, balance: user.balance });
    } catch(e) {
      return sendJSON(res, 502, { error: 'Start frames failed: ' + e.message });
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
