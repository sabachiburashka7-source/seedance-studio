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
const FAL_KEY          = process.env.FAL_API_KEY          || '';
const BYTEPLUS_API_KEY = process.env.BYTEPLUS_API_KEY     || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY   || '';
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY       || '';
const R2_ACCOUNT_ID      = process.env.R2_ACCOUNT_ID        || '';
const R2_ACCESS_KEY_ID   = process.env.R2_ACCESS_KEY_ID     || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME     = process.env.R2_BUCKET_NAME       || '';
const R2_PUBLIC_URL      = (process.env.R2_PUBLIC_URL       || '').replace(/\/$/, '');
const R2_ENABLED         = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_PUBLIC_URL);

// Email verification fires whenever any email provider is configured.
// (Was previously gated on RESEND_KEY only — silently disabled verification
// once we switched to Brevo as the primary provider.)
const EMAIL_ENABLED    = !!(BREVO_KEY || RESEND_KEY);

const PROMO_CODES = {
  'SEED10A': 10, 'SEED10B': 10, 'SEED10C': 10, 'SEED10D': 10,
  'SEED20A': 20, 'SEED20B': 20, 'SEED20C': 20, 'SEED20D': 20,
  'SEED50A': 50, 'SEED50B': 50, 'SEED50C': 50,
  'SEED100A': 100, 'SEED100B': 100, 'SEED100C': 100,
};

// ── Cloudflare R2 upload (AWS SigV4, no SDK) ─────────────────────────────────
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, resp => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location)
        return downloadBuffer(resp.headers.location).then(resolve).catch(reject);
      const ch = [];
      resp.on('data', c => ch.push(c));
      resp.on('end', () => resolve(Buffer.concat(ch)));
      resp.on('error', reject);
    });
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Download timed out')); });
    req.on('error', reject);
  });
}

async function uploadToR2(buffer, key, contentType) {
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const amzDate   = now.getUTCFullYear() + pad(now.getUTCMonth()+1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const canonicalUri = `/${R2_BUCKET_NAME}/${key}`;
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + R2_SECRET_ACCESS_KEY, dateStamp), 'auto'), 's3'), 'aws4_request');
  const signature  = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: host, port: 443, path: canonicalUri, method: 'PUT',
      headers: { 'Content-Type': contentType, 'Content-Length': buffer.length,
        'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash, 'Authorization': authorization }
    };
    const r = https.request(opts, resp => {
      const ch = [];
      resp.on('data', c => ch.push(c));
      resp.on('end', () => {
        if (resp.statusCode >= 200 && resp.statusCode < 300) resolve(`${R2_PUBLIC_URL}/${key}`);
        else reject(new Error(`R2 upload HTTP ${resp.statusCode}: ${Buffer.concat(ch).toString().substring(0, 200)}`));
      });
    });
    r.setTimeout(120000, () => { r.destroy(); reject(new Error('R2 upload timed out')); });
    r.on('error', reject);
    r.write(buffer); r.end();
  });
}

// ── AI metadata tag (IPTC DigitalSourceType: trainedAlgorithmicMedia) ────────
// Injects an XMP packet into JPEG buffers identifying the image as AI-generated
// per the IPTC PhotoMetadata standard. Some content classifiers honor this
// declared signal instead of running their own real-vs-AI detector. Pure-JS,
// no deps, JPEG only (PNG/WebP pass through unchanged).
function injectAiMetadata(buf, mime) {
  if (!buf || buf.length < 4) return buf;
  if (mime !== 'image/jpeg') return buf;
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return buf; // not a JPEG (no SOI)
  const xmpId = 'http://ns.adobe.com/xap/1.0/\0';
  const xmp =
      '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/">'
    + '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + '<rdf:Description rdf:about=""'
    +   ' xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"'
    +   ' xmlns:xmp="http://ns.adobe.com/xap/1.0/"'
    +   ' xmlns:dc="http://purl.org/dc/elements/1.1/">'
    +   '<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>'
    +   '<xmp:CreatorTool>AI-generated</xmp:CreatorTool>'
    +   '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">AI-generated image</rdf:li></rdf:Alt></dc:description>'
    + '</rdf:Description>'
    + '</rdf:RDF>'
    + '</x:xmpmeta>'
    + '<?xpacket end="w"?>';
  const idBuf  = Buffer.from(xmpId, 'binary');
  const xmpBuf = Buffer.from(xmp, 'utf8');
  const segLen = 2 + idBuf.length + xmpBuf.length; // length field + payload
  if (segLen > 0xFFFF) return buf; // single APP1 segment max 64KB
  const header = Buffer.alloc(4);
  header[0] = 0xFF; header[1] = 0xE1;
  header.writeUInt16BE(segLen, 2);
  return Buffer.concat([buf.slice(0, 2), header, idBuf, xmpBuf, buf.slice(2)]);
}

// ── In-memory DB cache ────────────────────────────────────────────────────────
let dbCache = { users: {}, emailIndex: {}, sessions: {}, library: {}, verifyCodes: {}, resetCodes: {}, redeemedPromos: {} };

// Safety flag: only write to Redis AFTER we've confirmed Redis responded at startup.
// This prevents wiping Redis with an empty DB when Redis was temporarily unreachable on boot.
let redisReady = false;

// Tracks whether dbCache has ever been observed with users in it during this
// process lifetime. Once true, any saveDB that would write back an EMPTY users
// map is treated as a corruption bug and refused — the in-memory state must
// have been wiped by something unexpected, and overwriting Redis with that
// empty state is exactly the regression we keep fighting. Reset never happens.
let dbCacheKnownNonEmpty = false;
function noteCacheState() {
  if (!dbCacheKnownNonEmpty && dbCache.users && Object.keys(dbCache.users).length > 0) {
    dbCacheKnownNonEmpty = true;
  }
}

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
        const raw = Buffer.concat(ch).toString();
        // Reject on non-2xx HTTP status. Previously we'd parse the body and
        // resolve, which meant a 500/401 with a JSON error body was treated
        // like a successful response — load would return data=null,ok=true and
        // the empty dbCache would get written back to Redis on the next save.
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('Redis HTTP ' + res.statusCode + ': ' + raw.substring(0, 200)));
        }
        let parsed;
        try { parsed = JSON.parse(raw); }
        catch(e) { return reject(new Error('Redis non-JSON response: ' + raw.substring(0, 200))); }
        // Upstash signals errors via an `error` field on a 200 response too.
        // Reject so callers know the command did not actually succeed.
        if (parsed && parsed.error) {
          return reject(new Error('Redis error: ' + parsed.error));
        }
        resolve(parsed);
      });
    });
    // Abort if Redis hangs — prevents server from stalling on boot
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Redis timeout after ' + timeoutMs + 'ms')));
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// Serialized + retrying Redis writes.
// Multiple saveDB calls used to fire concurrent SETs; out-of-order completion
// could leave Redis with an older snapshot than what was already in the
// in-memory cache. Then on the next dyno restart we'd reload that stale
// snapshot and the user's most recent library generations would be gone.
// The chain ensures writes hit Redis in caller order; the retry covers
// transient Upstash timeouts that previously lost a DB version forever.
let _redisWriteChain = Promise.resolve(true);

function redisSave(db) {
  const payload = JSON.stringify(db); // snapshot synchronously
  const next = _redisWriteChain.then(async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await redisCmd(['SET', REDIS_KEY, payload]);
        console.log('[redis] saved OK' + (attempt > 1 ? ` (attempt ${attempt})` : ''));
        return true;
      } catch(e) {
        console.error(`[redis] save error (attempt ${attempt}/3):`, e.message);
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1500));
      }
    }
    return false;
  });
  _redisWriteChain = next.catch(() => false);
  return next;
}

async function redisLoad() {
  // Returns { data, ok } — ok=true means Redis responded with a definitive answer
  // (either real data, or a confirmed empty key). Any error / ambiguous response
  // returns ok=false so saveDB will refuse to write and avoid wiping live data.
  try {
    const r = await redisCmd(['GET', REDIS_KEY]);
    // Upstash returns { result: <string|null> } on success. A missing `result`
    // field means the response shape is unexpected — treat as a load failure
    // rather than as "key is empty", which would let the next saveDB overwrite
    // Redis with our default empty dbCache.
    if (!('result' in r)) {
      console.error('[redis] load: unexpected response shape (no result field):', JSON.stringify(r).substring(0, 200));
      return { data: null, ok: false };
    }
    if (r.result) {
      try { return { data: JSON.parse(r.result), ok: true }; }
      catch(e) {
        console.error('[redis] load: stored value is not valid JSON — refusing to overwrite. Length:', r.result.length);
        return { data: null, ok: false };
      }
    }
    // result === null — key genuinely doesn't exist. Confirm with a one-shot
    // retry to make sure this isn't a transient Upstash glitch that would
    // otherwise let us mark redisReady=true with an empty cache, then wipe
    // real data on the next saveDB.
    console.warn('[redis] load: GET returned null result — retrying once in 1500ms to confirm');
    await new Promise(r => setTimeout(r, 1500));
    try {
      const r2 = await redisCmd(['GET', REDIS_KEY]);
      if (!('result' in r2)) {
        console.error('[redis] load: confirmation retry returned unexpected shape — refusing to mark Redis ready');
        return { data: null, ok: false };
      }
      if (r2.result) {
        console.warn('[redis] load: confirmation retry returned data after initial null — using that. First read was a transient glitch.');
        try { return { data: JSON.parse(r2.result), ok: true }; }
        catch(e) {
          console.error('[redis] load: confirmation retry value is not valid JSON — refusing.');
          return { data: null, ok: false };
        }
      }
      console.log('[redis] load: confirmed empty key on retry — fresh install OK to proceed');
      return { data: null, ok: true };
    } catch(e) {
      console.error('[redis] load: confirmation retry failed:', e.message);
      return { data: null, ok: false };
    }
  } catch(e) {
    console.error('[redis] load error:', e.message);
    return { data: null, ok: false };
  }
}

// ── Database (sync interface, async persistence) ──────────────────────────────
function loadDB() { return dbCache; }

// Returns a Promise<boolean> — true if the write hit durable storage.
// Most callers ignore the return value (fire-and-forget is fine for
// auth/balance updates). The /library POST awaits it so the client knows
// whether to retry.
function saveDB(db) {
  dbCache = db;
  if (REDIS_URL && REDIS_TOKEN) {
    if (!redisReady) {
      // Redis didn't respond at startup — refuse to overwrite Redis with potentially stale data
      console.warn('[db] saveDB: skipping Redis write — Redis was unreachable at startup. Data saved in-memory only.');
      return Promise.resolve(false);
    }
    // Last-line defence: once we've seen users in dbCache during this process,
    // never write an empty users map back to Redis. If this branch fires, some
    // earlier code path corrupted dbCache and we'd be one SET away from wiping
    // every user's library/balance/auth.
    if (dbCacheKnownNonEmpty && (!db.users || Object.keys(db.users).length === 0)) {
      console.error('[db] saveDB: REFUSING to write empty users map to Redis — dbCache was previously non-empty. Reloading from Redis to repair in-memory state.');
      // Repair in-memory state asynchronously so any next saveDB has correct
      // data to write. Don't await — this save call has already returned false.
      redisLoad().then(({ data, ok }) => {
        if (ok && data && data.users && Object.keys(data.users).length > 0) {
          dbCache = { verifyCodes: {}, resetCodes: {}, ...data };
          console.log('[db] in-memory dbCache restored from Redis after empty-write refusal.');
        }
      }).catch(e => console.error('[db] repair reload failed:', e.message));
      return Promise.resolve(false);
    }
    noteCacheState();
    return redisSave(db);
  } else {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8'); } catch {}
    return Promise.resolve(true);
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
          noteCacheState();
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
        noteCacheState();
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
          noteCacheState();
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

// ── Per-user library storage ──────────────────────────────────────────────────
// Library data lives in its OWN Redis key per user (`seedance_lib_<userId>`),
// not embedded in the main DB key. This keeps the main key well under Upstash's
// 10 MB request-size limit even when users accumulate many base64-encoded
// images, and lets each user have up to 10 MB of their own library separately.
const LIB_KEY_PREFIX  = 'seedance_lib_';
const REDIS_MAX_BYTES = 10 * 1024 * 1024; // Upstash REST max request body

// In-memory per-user library cache. Keys are user IDs.
const libCache = {};

async function loadUserLibrary(userId) {
  if (userId in libCache) return libCache[userId];
  if (!REDIS_URL || !REDIS_TOKEN) {
    libCache[userId] = (dbCache.library && dbCache.library[userId]) || [];
    return libCache[userId];
  }
  try {
    const r = await redisCmd(['GET', LIB_KEY_PREFIX + userId]);
    if (r && r.result) {
      libCache[userId] = JSON.parse(r.result);
    } else {
      // No per-user key yet — fall back to legacy db.library entry if present
      libCache[userId] = (dbCache.library && dbCache.library[userId]) || [];
    }
    return libCache[userId];
  } catch (e) {
    console.error('[lib] load error for', userId, '—', e.message);
    // Don't cache on error; let the next call retry
    return (dbCache.library && dbCache.library[userId]) || [];
  }
}

// Returns { ok, error?, size? }
async function saveUserLibrary(userId, library) {
  libCache[userId] = library;
  if (!REDIS_URL || !REDIS_TOKEN) {
    if (!dbCache.library) dbCache.library = {};
    dbCache.library[userId] = library;
    try { fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf8'); } catch {}
    return { ok: true };
  }
  if (!redisReady) return { ok: false, error: 'redis_not_ready' };
  const payload = JSON.stringify(library);
  // Reserve 1 KB for command framing overhead.
  if (payload.length > REDIS_MAX_BYTES - 1024) {
    console.error(`[lib] user ${userId}: payload ${(payload.length/1024/1024).toFixed(2)} MB exceeds Upstash 10 MB limit — refusing save`);
    return { ok: false, error: 'too_large', size: payload.length };
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await redisCmd(['SET', LIB_KEY_PREFIX + userId, payload]);
      console.log(`[lib] saved ${userId} (${(payload.length/1024).toFixed(1)} KB)` + (attempt > 1 ? ` (attempt ${attempt})` : ''));
      return { ok: true };
    } catch (e) {
      console.error(`[lib] save attempt ${attempt}/3 failed for ${userId}:`, e.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }
  return { ok: false, error: 'save_failed' };
}

// One-time migration: move db.library[userId] entries into per-user keys, then
// strip them from the main DB key so it goes back under the 10 MB SET limit.
// Idempotent — safe to run on every boot. Users whose libraries are still too
// big after migration are kept in main DB (and will keep blocking main DB
// saves) so we surface the situation in logs rather than silently truncating.
async function migrateLibrariesToOwnKeys() {
  if (!REDIS_URL || !REDIS_TOKEN || !redisReady) return;
  const oldLib = dbCache.library;
  if (!oldLib) return;
  const entries = Object.entries(oldLib).filter(([, l]) => Array.isArray(l) && l.length > 0);
  if (!entries.length) return;
  console.log(`[migrate] Found ${entries.length} legacy library/ies in main DB key — moving to per-user keys`);
  const migrated = [];
  const failed   = [];
  for (const [userId, library] of entries) {
    const result = await saveUserLibrary(userId, library);
    if (result.ok) migrated.push(userId);
    else { failed.push({ userId, error: result.error, size: result.size }); }
  }
  if (migrated.length) {
    for (const uid of migrated) delete dbCache.library[uid];
    const saved = await saveDB(dbCache);
    console.log(`[migrate] Cleared ${migrated.length} migrated entry/entries from main DB key (saveDB ok=${saved})`);
  }
  if (failed.length) {
    console.warn(`[migrate] ${failed.length} user library/ies did NOT migrate:`,
      failed.map(f => `${f.userId} (${f.error}${f.size ? ' ' + (f.size/1024/1024).toFixed(1) + ' MB' : ''})`).join(', '));
  }
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
    // Header tolerates: "=== SCENE 1 OF 1 — Name ===", "=== SCENE 1 OF 1 - Name ===",
    // "=== SCENE 1 OF 1: Name ===", and "=== SCENE 1 OF 1 ===" (no dash/name).
    // Claude sometimes drops the name on single-scene outputs.
    const hm = part.match(/===\s*SCENE\s+(\d+)\s+OF\s+\d+\s*(?:[—–\-:]\s*([^\n=]+?)\s*)?===\s*\n?([\s\S]*)/);
    if (!hm) continue;
    const num = parseInt(hm[1]);
    scenes.push({
      number: num,
      name: (hm[2] || '').trim() || `Scene ${num}`,
      prompt: hm[3].trim(),
      duration: 15,
      ratio: '9:16',
    });
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
  if (pnm) entities.push({ type: 'product', name: pnm[1].trim(), subjectId: null, prompt: 'generate this product multi angle reference sheet image highlighting details visually' });
  const envSec = (text.match(/===\s*ENVIRONMENT REFERENCE SHEETS\s*===([\s\S]*)$/) || [])[1] || '';
  envSec.split(/(?=^ENVIRONMENT:)/m).filter(b => b.trim().startsWith('ENVIRONMENT:')).forEach(block => {
    const nm = block.match(/^ENVIRONMENT:\s*(.+)/m);
    const id = block.match(/ENV ID:\s*(\d{3})/i);
    if (nm) entities.push({ type: 'environment', name: nm[1].trim(), envId: id ? id[1] : null, prompt: block.replace(/^ENVIRONMENT:[^\n]+\n?/, '').trim() });
  });
  return entities;
}

function parseStartFramesOutput(text, productName) {
  const frames = [];
  const section = (text.match(/===\s*STARTING FRAMES\s*===([\s\S]*)/) || [])[1] || text;
  // Build a product-mention regex from the actual product name, since the
  // skill instructs Claude to name the product directly (e.g. "the plush bear")
  // rather than write the literal word "product".
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cleanName = (productName || '').replace(/^the\s+/i, '').trim();
  const productRe = cleanName ? new RegExp(`\\b${escRe(cleanName)}\\b`, 'i') : null;
  section.split(/\n(?=SCENE\s+\d+:\s*\n)/).forEach(block => {
    const m = block.match(/^SCENE\s+(\d+):\s*\n([\s\S]+)/);
    if (!m) return;
    const prompt = m[2].trim();
    const hasProduct = /\bproduct\b/i.test(prompt) || (productRe ? productRe.test(prompt) : false);
    frames.push({
      scene: parseInt(m[1]), prompt,
      subjectIds: [...prompt.matchAll(/SUBJECT ID:\s*(\d{3})/g)].map(x => x[1]),
      envIds:     [...prompt.matchAll(/ENV ID:\s*(\d{3})/g)].map(x => x[1]),
      hasProduct
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

// ── Ad background pipeline ────────────────────────────────────────────────────
// Runs the full 4-stage Claude + image + video pipeline server-side so the
// browser doesn't need to stay open. Job state is stored in Redis under
// ad_job_<jobId> with a 24h TTL.

const adJobCache = {}; // local-dev fallback when Redis isn't configured

function adJobKey(jobId) { return 'ad_job_' + jobId; }

async function getAdJob(jobId) {
  try {
    if (!REDIS_URL || !REDIS_TOKEN) return adJobCache[jobId] || null;
    const r = await redisCmd(['GET', adJobKey(jobId)]);
    if (!r || !r.result) return null;
    return JSON.parse(r.result);
  } catch(e) { console.error('[ad-job] getAdJob:', e.message); return null; }
}

async function setAdJob(jobId, data) {
  try {
    const payload = JSON.stringify(data);
    if (!REDIS_URL || !REDIS_TOKEN) { adJobCache[jobId] = data; return; }
    await redisCmd(['SET', adJobKey(jobId), payload, 'EX', 86400]);
  } catch(e) { console.error('[ad-job] setAdJob:', e.message); }
}

async function updateAdJob(jobId, patch) {
  const job = (await getAdJob(jobId)) || {};
  await setAdJob(jobId, { ...job, ...patch, updatedAt: Date.now() });
}

function adDeductBalance(userId, amount) {
  const db = loadDB(); const user = db.users[userId];
  if (!user) throw new Error('User not found');
  const cur = user.balance ?? 0;
  if (cur < amount) throw new Error(`Insufficient balance. Need $${amount.toFixed(2)}, have $${cur.toFixed(2)}.`);
  user.balance = Math.round((cur - amount) * 100) / 100;
  saveDB(db);
  return user.balance;
}

function adRefundBalance(userId, amount) {
  try {
    const db = loadDB(); const user = db.users[userId];
    if (!user) return;
    user.balance = Math.round(((user.balance ?? 0) + amount) * 100) / 100;
    saveDB(db);
  } catch(e) { console.warn('[ad-job] refund error:', e.message); }
}

async function adGenProductRef(userId, images) {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
  const prompt = 'generate this product multi angle reference sheet image highlighting details visually';
  const cost = 0.02;
  adDeductBalance(userId, cost);

  let gptResp;
  if (images && images.length > 0) {
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', prompt);
    form.append('size', '1024x1024');
    form.append('quality', 'low');
    form.append('n', '1');
    for (let idx = 0; idx < images.length; idx++) {
      const img = images[idx];
      if (!img.base64) continue;
      const imgBuf = Buffer.from(img.base64, 'base64');
      const mime = img.mime || 'image/jpeg';
      form.append('image[]', new Blob([imgBuf], { type: mime }), `ref${idx}.${mime === 'image/png' ? 'png' : 'jpg'}`);
    }
    gptResp = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + OPENAI_API_KEY },
      body: form, signal: AbortSignal.timeout(240000)
    });
  } else {
    gptResp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-2', prompt, size: '1024x1024', quality: 'low', output_format: 'jpeg', n: 1 }),
      signal: AbortSignal.timeout(240000)
    });
  }
  const gptJson = await gptResp.json();
  if (!gptResp.ok) throw new Error(gptJson?.error?.message || 'GPT image failed');
  const item = gptJson?.data?.[0];
  const b64 = item?.b64_json; const imgUrl = item?.url;
  if (!b64 && !imgUrl) throw new Error('No image data returned');
  if (b64) {
    const buf = injectAiMetadata(Buffer.from(b64, 'base64'), 'image/jpeg');
    if (R2_ENABLED) {
      const key = `img/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
      return await uploadToR2(buf, key, 'image/jpeg');
    }
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  }
  if (R2_ENABLED) {
    const buf = injectAiMetadata(await downloadBuffer(imgUrl), 'image/jpeg');
    return await uploadToR2(buf, `img/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`, 'image/jpeg');
  }
  return imgUrl;
}

async function adSubmitVideo(textPrompt, productRefUrl, envPrefix) {
  const ratio = '9:16'; const dur = 15; const res = '480p';
  const model = 'dreamina-seedance-2-0-260128';
  const fullPrompt = (envPrefix || '') + (productRefUrl ? 'Use the reference image for product fidelity. ' : '') + textPrompt;
  const content = [{ type: 'text', text: fullPrompt }];
  if (productRefUrl) {
    content.push({ type: 'image_url', image_url: { url: productRefUrl }, role: 'reference_image' });
  }
  const payload = {
    model_name: model, content,
    parameters: { seed: Math.floor(Math.random() * 1e9), res, aspect_ratio: ratio, duration: dur, watermark: false },
    audio_config: { audio_switch: true, bgm_switch: false },
    audio_prompt: 'natural ambient sounds and object sounds only, no music, no vocals, no lyrics',
  };
  const submitUrl = `https://${BYTEPLUS}/api/v3/contents/generations/tasks`;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const r = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${BYTEPLUS_API_KEY}`, 'Accept-Encoding': 'identity' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(60000),
    });
    const j = await r.json();
    const taskId = j.id || j.task_id;
    if (taskId) return taskId;
    const errMsg = j.error?.message || JSON.stringify(j).substring(0, 200);
    console.error(`[ad-job] BytePlus submit attempt ${attempt}:`, errMsg);
    if (!/high demand|try again later|temporar/i.test(errMsg) || attempt === 6) throw new Error(errMsg);
    await new Promise(r => setTimeout(r, attempt * 60000));
  }
  throw new Error('BytePlus submit failed after 6 attempts');
}

async function adPollVideo(taskId, onProgress) {
  const pollUrl = `https://${BYTEPLUS}/api/v3/contents/generations/tasks/${taskId}`;
  let n = 0; let emptyUrlRetries = 0;
  while (n < 80) {
    await new Promise(r => setTimeout(r, n === 0 ? 8000 : 30000));
    n++;
    if (onProgress) onProgress(n / 80);
    let d;
    try {
      const r = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${BYTEPLUS_API_KEY}`, 'Accept-Encoding': 'identity' },
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) { console.warn('[ad-job] poll HTTP', r.status); continue; }
      d = await r.json();
    } catch(e) { console.warn('[ad-job] poll error:', e.message); continue; }
    const status = (d.status || '').toLowerCase();
    if (status === 'succeeded' || status === 'success' || status === 'completed') {
      const videoUrl = d.content?.video_url || d.content?.[0]?.video_url?.url || d.content?.[0]?.url
        || d.outputs?.[0]?.url || d.output?.url || d.result?.url || '';
      if (!videoUrl) {
        if (++emptyUrlRetries < 6) continue;
        throw new Error('Video URL missing from BytePlus response');
      }
      return videoUrl;
    }
    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      throw new Error(d.error?.message || d.message || 'Video failed: ' + d.status);
    }
    console.log('[ad-job] polling', taskId, 'status:', status, 'n:', n);
  }
  throw new Error('Video generation timed out after 40 minutes');
}

function adDeriveTitle(ideaText, description) {
  if (description) return description.replace(/\s+/g, ' ').trim().substring(0, 40);
  const m = ideaText.match(/THE\s+IDEA\s*\**\s*\n+([\s\S]*?)(?:\n+\**Why it works|$)/i);
  const prose = (m ? m[1] : ideaText).replace(/\*\(\s*\d+\s*[–\-]\s*\d+\s*s\s*\)\*/g, '').replace(/\*+/g, '').trim();
  return prose.split(/[.,]/)[0].trim().substring(0, 40) || ('Ad — ' + new Date().toLocaleDateString());
}

async function runAdPipeline(jobId) {
  let job = await getAdJob(jobId);
  if (!job) { console.error('[ad-job] not found:', jobId); return; }
  const { userId, images, description } = job;

  // Strip images from Redis immediately — they're large and only needed in memory
  await updateAdJob(jobId, { images: null, status: 'running' });

  try {
    // ── Stage 1: Brief ──────────────────────────────────────────────────
    await updateAdJob(jobId, { stage: 'brief', stageLabel: 'Generating ad concept…', progress: 0.02 });
    console.log('[ad-job]', jobId, 'brief start');
    const userContent = [];
    for (const img of (images || [])) {
      userContent.push({ type: 'image', source: { type: 'base64', media_type: img.mime || 'image/jpeg', data: img.base64 } });
    }
    const descText = description ? `Product description: ${description}\n\n` : '';
    userContent.push({ type: 'text', text: `${descText}Generate ONE realistic ad idea for this product following your methodology. Output exactly the two-block format from your Output Format section ("**THE IDEA**" paragraph pitch + "**Why it works:**" two sentences). No preamble, no alternatives.` });
    const briefRes = await claudeApiCall(ANTHROPIC_API_KEY, SKILL_BRIEF, [{ role: 'user', content: userContent }]);
    if (briefRes.status !== 200) throw new Error('Brief failed: ' + (briefRes.body?.error?.message || briefRes.status));
    const ideaText = briefRes.body?.content?.[0]?.text || '';
    if (!/THE IDEA/i.test(ideaText) || !/Why it works/i.test(ideaText)) throw new Error('Brief returned unexpected format');
    adDeductBalance(userId, 0.15);
    const adTitle = adDeriveTitle(ideaText, description);
    await updateAdJob(jobId, { stageLabel: 'Ad concept ready', progress: 0.12, adTitle, ideaText });
    console.log('[ad-job]', jobId, 'brief done — title:', adTitle);

    // ── Stage 2: RefSheets ───────────────────────────────────────────────
    await updateAdJob(jobId, { stage: 'refsheets', stageLabel: 'Designing reference sheets…', progress: 0.14 });
    console.log('[ad-job]', jobId, 'refsheets start');
    const refMsg = `INPUT — realistic ad pitch (from realistic-ad-idea-generator). It is one paragraph describing a single 15-second video with embedded beat timestamps, followed by a "Why it works" note. Extract every distinct character, the product, and every distinct environment named or implied in the pitch.\n\n${ideaText}\n\nGenerate the reference sheet prompts for all characters, the product, and all environments. Output ONLY the three labeled blocks (=== CHARACTER REFERENCE SHEETS ===, === PRODUCT REFERENCE SHEET ===, === ENVIRONMENT REFERENCE SHEETS ===) with no preamble.`;
    const refsRes = await claudeApiCall(ANTHROPIC_API_KEY, SKILL_REFS, [{ role: 'user', content: refMsg }]);
    if (refsRes.status !== 200) throw new Error('RefSheets failed: ' + (refsRes.body?.error?.message || refsRes.status));
    const refSheetsText = refsRes.body?.content?.[0]?.text || '';
    const entities = parseRefSheetsOutput(refSheetsText);
    adDeductBalance(userId, 0.10);
    await updateAdJob(jobId, { stageLabel: 'Reference sheets ready', progress: 0.22, refSheetsText, entities });
    console.log('[ad-job]', jobId, 'refsheets done —', entities.length, 'entities');

    // ── Stage 2.5: Product ref image ─────────────────────────────────────
    await updateAdJob(jobId, { stage: 'refImages', stageLabel: 'Creating product reference image…', progress: 0.24 });
    console.log('[ad-job]', jobId, 'product ref image start');
    let productRefUrl = null;
    const productEntity = entities.find(e => e.type === 'product');
    const envEntities = entities.filter(e => e.type === 'environment');
    if (productEntity && OPENAI_API_KEY) {
      try {
        productRefUrl = await adGenProductRef(userId, images);
        const userLib = await loadUserLibrary(userId);
        userLib.unshift({
          id: 'ref-' + jobId + '-prod', prompt: 'product reference sheet', url: productRefUrl,
          ratio: '1:1', model: 'gpt-image-2', ts: Date.now(), done: Date.now(),
          type: 'image', folder: adTitle, label: productEntity.name || 'product', hidden: true,
        });
        await saveUserLibrary(userId, userLib);
        console.log('[ad-job]', jobId, 'product ref done');
      } catch(e) {
        console.warn('[ad-job]', jobId, 'product ref failed (continuing):', e.message);
      }
    }
    const envPrefix = envEntities.length > 0
      ? envEntities.map(e => `Environment — ${e.name}: ${e.prompt}`).join('\n\n') + '\n\n'
      : '';
    await updateAdJob(jobId, { stageLabel: 'Reference image ready', progress: 0.35, productRefUrl, envPrefix });

    // ── Stage 4: Shots ───────────────────────────────────────────────────
    await updateAdJob(jobId, { stage: 'shots', stageLabel: 'Writing cinematic shot prompts…', progress: 0.37 });
    console.log('[ad-job]', jobId, 'shots start');
    const shotsMsg = `Here is the realistic ad pitch (a single 15-second video, one paragraph with embedded timestamps, plus a "Why it works" note):\n\n${ideaText}\n\nTreat this as a SINGLE 15-second scene. Use the per-scene output format and produce exactly ONE document with the header "=== SCENE 1 OF 1 — [short scene name] ===" followed by the shot timeline, effects inventory, density map, and energy arc. Honour the pitch's embedded beat timestamps. The video is silent (no dialogue, no voiceover) and contains no turned-on phone/laptop/tablet/TV screens.`;
    const shotsRes = await claudeApiCall(ANTHROPIC_API_KEY, SKILL_SHOTS, [{ role: 'user', content: [{ type: 'text', text: shotsMsg }] }]);
    if (shotsRes.status !== 200) throw new Error('Shots failed: ' + (shotsRes.body?.error?.message || shotsRes.status));
    const shotsText = shotsRes.body?.content?.[0]?.text || '';
    const scenes = parseShotsOutput(shotsText);
    if (!scenes.length) throw new Error('Shot prompts failed to parse — please retry');
    adDeductBalance(userId, 0.15);
    await updateAdJob(jobId, { stageLabel: 'Shot prompts ready', progress: 0.45, scenes });
    console.log('[ad-job]', jobId, 'shots done —', scenes.length, 'scene(s)');

    // ── Stage 5: Video generation ────────────────────────────────────────
    const scene = scenes[0];
    const dur = Math.max(5, Math.min(15, scene.duration || 15));
    const rawPrompt = (scene.prompt || 'Scene 1').replace(/\b(logo|trademark|brand name|registered mark)\b/gi, 'emblem');
    const videoCost = Math.round(dur * 480 * 864 * 24 / 1024 * 7.0e-6 * 1.3 * 100) / 100;
    adDeductBalance(userId, videoCost);
    await updateAdJob(jobId, { stage: 'video', stageLabel: 'Submitting to video generation…', progress: 0.46 });
    console.log('[ad-job]', jobId, 'video submit start');
    const taskId = await adSubmitVideo(rawPrompt, productRefUrl, envPrefix);
    await updateAdJob(jobId, { taskId, stageLabel: 'Video generating (5–15 min)…', progress: 0.48 });
    console.log('[ad-job]', jobId, 'video task:', taskId);

    const videoStartTs = Date.now();
    const progressTimer = setInterval(async () => {
      try {
        const elapsed = (Date.now() - videoStartTs) / 1000;
        const p = 0.48 + Math.min(0.40, (elapsed / (8 * 60)) * 0.40);
        await updateAdJob(jobId, { progress: p });
      } catch(_) {}
    }, 60000);

    let rawVideoUrl;
    try {
      rawVideoUrl = await adPollVideo(taskId);
    } catch(e) {
      adRefundBalance(userId, videoCost);
      throw e;
    } finally {
      clearInterval(progressTimer);
    }
    await updateAdJob(jobId, { stageLabel: 'Saving video…', progress: 0.90 });

    let storedUrl = rawVideoUrl;
    if (R2_ENABLED) {
      try {
        const buf = await downloadBuffer(rawVideoUrl);
        const key = `vid/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.mp4`;
        storedUrl = await uploadToR2(buf, key, 'video/mp4');
        console.log('[ad-job]', jobId, 'video stored to R2');
      } catch(e) { console.warn('[ad-job] R2 store failed:', e.message); }
    }

    // Save video to user's library
    const libItem = {
      id: 'ad-' + jobId, prompt: rawPrompt, url: storedUrl,
      res: '480p', ratio: '9:16', dur, audio: false,
      model: 'dreamina-seedance-2-0-260128', ts: job.createdAt || Date.now(), done: Date.now(),
      folder: adTitle, label: 'Scene 1 video', sceneIndex: 0, upscaling: !!storedUrl,
    };
    const userLib2 = await loadUserLibrary(userId);
    userLib2.unshift(libItem);
    await saveUserLibrary(userId, userLib2);

    await updateAdJob(jobId, { status: 'done', stage: 'done', stageLabel: 'Done!', progress: 1, videoUrl: storedUrl, libItemId: libItem.id });
    console.log('[ad-job]', jobId, 'complete:', storedUrl?.substring(0, 80));

    // Upscale (fire-and-forget)
    if (FAL_KEY && storedUrl) {
      falRequest('POST', '/fal-ai/topaz/upscale/video', { video_url: storedUrl, upscale_factor: 2, H264_output: true })
        .then(async falResult => {
          const requestId = falResult.body?.request_id;
          if (!requestId) return;
          const userLib3 = await loadUserLibrary(userId);
          const idx = userLib3.findIndex(i => i.id === libItem.id);
          if (idx >= 0) {
            userLib3[idx].upscaleRequestId = requestId;
            userLib3[idx].upscaleStatusUrl = falResult.body?.status_url || null;
            userLib3[idx].upscaleResponseUrl = falResult.body?.response_url || null;
            await saveUserLibrary(userId, userLib3);
          }
          console.log('[ad-job]', jobId, 'upscale submitted:', requestId);
        })
        .catch(e => console.warn('[ad-job] upscale submit failed:', e.message));
    }

  } catch(e) {
    console.error('[ad-job]', jobId, 'pipeline error:', e.message);
    try { await updateAdJob(jobId, { status: 'failed', error: e.message, stageLabel: 'Failed: ' + e.message }); } catch(_) {}
  }
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

  // Strip query strings/fragments up front so messenger tracking params (?fbclid=…),
  // UptimeRobot cache-busters (?_=12345), trailing slashes etc. don't break route matching.
  const pathname = url.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';

  // Health check (Render + UptimeRobot use this) — short-circuit before any DB / auth work
  if (pathname === '/health' || pathname === '/healthz' || pathname === '/ping') {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    });
    return res.end('ok');
  }

  if (pathname === '/' || pathname === '/index.html') return serveHTML(res);

  if (pathname === '/logo.jpg' || pathname === '/favicon.ico') {
    fs.readFile(path.join(__dirname, 'logo.jpg'), (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
      res.end(data);
    });
    return;
  }

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
    const needsVerify = EMAIL_ENABLED;
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
    if (userId && EMAIL_ENABLED) {
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
    if (EMAIL_ENABLED && !user.verified) return sendJSON(res, 403, { error: 'Please verify your email first.', needsVerify: true, email: key });
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
    const library = await loadUserLibrary(sess.userId);
    return sendJSON(res, 200, { library });
  }

  // ── Save library ──────────────────────────────────────────────────────────
  if (url === '/library' && method === 'POST') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    const body = await readBody(req);
    // Validate shape — readBody returns {} on parse failure or truncated upload.
    // The previous `body.library || []` silently wrote an empty array, wiping
    // the user's library on any malformed POST. Reject instead so the client
    // retries and the existing data is preserved.
    if (!Array.isArray(body.library)) {
      console.warn('[library] rejected save — body.library not an array (likely parse failure / truncated upload). User data preserved.');
      return sendJSON(res, 400, { error: 'Invalid library payload' });
    }
    const result = await saveUserLibrary(sess.userId, body.library);
    if (!result.ok) {
      if (result.error === 'too_large') {
        return sendJSON(res, 413, {
          error: `Library too large to persist (${(result.size/1024/1024).toFixed(1)} MB). Maximum is 10 MB. Delete old items or enable Cloudflare R2 image storage to free space.`,
          size: result.size
        });
      }
      console.error('[library] save failed —', result.error);
      return sendJSON(res, 503, { error: 'Database unavailable, retry' });
    }
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
    const { prompt, ratio, quality, imageBase64, imageMime, images, outputFormat, batchCount, model: reqModel } = await readBody(req); // must read body before any early return
    // Normalize to a list of {base64, mime}: legacy single-image fields still supported.
    // Items may also arrive as { url } (R2/HTTPS) — we fetch and base64-encode server-side
    // so client doesn't have to worry about CORS on R2 URLs.
    let refImagesList = Array.isArray(images) && images.length
      ? images.filter(i => i && (i.base64 || i.url)).map(i => ({ base64: i.base64 || null, mime: i.mime || 'image/jpeg', url: i.url || null }))
      : (imageBase64 ? [{ base64: imageBase64, mime: imageMime || 'image/jpeg', url: null }] : []);
    for (const img of refImagesList) {
      if (!img.base64 && img.url) {
        try {
          const buf = await downloadBuffer(img.url);
          img.base64 = buf.toString('base64');
          if (!img.mime || img.mime === 'image/jpeg') {
            const lower = img.url.toLowerCase();
            if (lower.includes('.png')) img.mime = 'image/png';
            else if (lower.includes('.webp')) img.mime = 'image/webp';
          }
        } catch (e) {
          console.warn('[generate-image] failed to fetch ref URL:', img.url, e.message);
        }
      }
    }
    refImagesList = refImagesList.filter(i => i.base64);
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Sign in to generate images.' });

    const isGpt = reqModel === 'gpt-image-2';
    if (isGpt) {
      if (!OPENAI_API_KEY) return sendJSON(res, 503, { error: 'OpenAI API key not configured on server (OPENAI_API_KEY missing).' });
    } else {
      if (!BYTEPLUS_API_KEY) return sendJSON(res, 503, { error: 'Image generation not configured on server (BYTEPLUS_API_KEY missing).' });
    }

    // Cost varies by model
    const imgCost  = isGpt ? (quality === 'low' ? 0.02 : 0.19) : (quality === 'low' ? 0.02 : 0.08);
    const imgCount = (!isGpt && batchCount && batchCount > 1) ? Math.min(Math.floor(batchCount), 14) : 1;
    const totalCost = Math.round(imgCost * imgCount * 100) / 100;
    {
      const db  = loadDB();
      const cur = db.users[sess.userId].balance ?? 0;
      if (cur < totalCost) return sendJSON(res, 402, { error: `Insufficient balance. Need $${totalCost.toFixed(2)}, have $${cur.toFixed(2)}.`, balance: cur });
    }
    if (!prompt) return sendJSON(res, 400, { error: 'Prompt required' });

    // Start streaming response immediately so Render's reverse proxy doesn't
    // time out on long-running Seedream requests (e.g. 4 ref images take 60-90s).
    // Periodic newline writes keep the connection alive; JSON.parse ignores them.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const keepAlive = setInterval(() => { try { res.write('\n'); } catch(_) {} }, 20000);
    const endImg = obj => { clearInterval(keepAlive); res.end(JSON.stringify(obj)); };

    // ── GPT Image 2 branch ──────────────────────────────────────────────────
    if (isGpt) {
      const GPT_SIZE_MAP = { '1:1': '1024x1024', '16:9': '1536x1024', '9:16': '1024x1536', '4:3': '1536x1024', '3:4': '1024x1536', '21:9': '1536x1024' };
      const gptSize    = GPT_SIZE_MAP[ratio] || '1024x1024';
      const gptQuality = quality === 'low' ? 'low' : 'high';

      try {
        let gptResp;

        if (refImagesList.length > 0) {
          // Use /v1/images/edits with native FormData — avoids manual multipart bugs
          const form = new FormData();
          form.append('model', 'gpt-image-2');
          form.append('prompt', prompt);
          form.append('size', gptSize);
          form.append('quality', gptQuality);
          form.append('n', '1');
          let addedRefs = 0;
          for (let idx = 0; idx < refImagesList.length; idx++) {
            const img = refImagesList[idx];
            if (!img.base64) continue;
            const imgBuf = Buffer.from(img.base64, 'base64');
            const mime   = img.mime || 'image/jpeg';
            const ext    = mime === 'image/png' ? 'png' : 'jpeg';
            form.append('image[]', new Blob([imgBuf], { type: mime }), `ref${idx}.${ext}`);
            addedRefs++;
          }
          console.log('[gpt-image] editing with', addedRefs, 'ref(s):', gptSize, gptQuality, prompt.substring(0, 80));
          gptResp = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + OPENAI_API_KEY },
            body: form,
            signal: AbortSignal.timeout(240000)
          });
        } else {
          // Text-only: /v1/images/generations
          console.log('[gpt-image] generating:', gptSize, gptQuality, prompt.substring(0, 80));
          gptResp = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + OPENAI_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-image-2', prompt, size: gptSize, quality: gptQuality, output_format: 'jpeg', n: 1 }),
            signal: AbortSignal.timeout(240000)
          });
        }

        const gptJson = await gptResp.json();
        if (!gptResp.ok) {
          const errMsg = gptJson?.error?.message || JSON.stringify(gptJson).substring(0, 400);
          console.error('[gpt-image] error', gptResp.status, errMsg);
          return endImg({ error: errMsg });
        }

        // Handle both b64_json and url response formats
        const item   = gptJson?.data?.[0];
        const b64    = item?.b64_json;
        const imgUrl = item?.url;
        if (!b64 && !imgUrl) return endImg({ error: 'No image data returned by OpenAI' });

        let finalUrl;
        if (b64) {
          const imgBuf = injectAiMetadata(Buffer.from(b64, 'base64'), 'image/jpeg');
          if (R2_ENABLED) {
            const key = `img/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
            finalUrl = await uploadToR2(imgBuf, key, 'image/jpeg');
            console.log('[gpt-image] uploaded to R2:', key);
          } else {
            finalUrl = `data:image/jpeg;base64,${imgBuf.toString('base64')}`;
          }
        } else if (R2_ENABLED) {
          const dlBuf = injectAiMetadata(await downloadBuffer(imgUrl), 'image/jpeg');
          finalUrl = await uploadToR2(dlBuf, `img/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`, 'image/jpeg');
        } else {
          finalUrl = imgUrl;
        }

        const db2 = loadDB();
        const usr2 = db2.users[sess.userId];
        usr2.balance = Math.round(((usr2.balance ?? 0) - imgCost) * 100) / 100;
        saveDB(db2);
        return endImg({ url: finalUrl, balance: usr2.balance });
      } catch(e) {
        console.error('[gpt-image] error:', e.message);
        return endImg({ error: 'GPT Image 2 request failed: ' + e.message });
      }
    }

    // Seedream 5.0: size must be WIDTHxHEIGHT, '2k', '3k', or '4k'
    // low = 2k output (~2048px), high = 3k output (~3072px)
    const SIZE_MAP_LOW  = { '1:1': '2048x2048', '16:9': '2688x1512', '9:16': '1512x2688', '4:3': '2560x1920', '3:4': '1920x2560', '21:9': '2688x1152' };
    const SIZE_MAP_HIGH = { '1:1': '3072x3072', '16:9': '4032x2268', '9:16': '2268x4032', '4:3': '3840x2880', '3:4': '2880x3840', '21:9': '4032x1728' };
    const SIZE_MAP = quality === 'low' ? SIZE_MAP_LOW : SIZE_MAP_HIGH;
    const size = SIZE_MAP[ratio] || (quality === 'low' ? '2k' : '3k');
    const useRef = refImagesList.length > 0;
    console.log('[seedream-image]', useRef ? `with ${refImagesList.length} ref(s):` : 'generating:', size, quality, prompt.substring(0, 80));

    const modelId = reqModel || 'seedream-5-0-260128';
    const payload = {
      model: modelId,
      prompt,
      size,
      watermark: false
    };
    if (!modelId.includes('4-5')) payload.output_format = outputFormat === 'png' ? 'png' : 'jpeg';
    if (imgCount > 1) {
      payload.sequential_image_generation = 'auto';
      payload.sequential_image_generation_options = { max_images: imgCount };
    }
    if (useRef) {
      // Always use 'image' field: string for single ref, array for multiple refs
      if (refImagesList.length === 1) {
        payload.image = `data:${refImagesList[0].mime};base64,${refImagesList[0].base64}`;
      } else {
        payload.image = refImagesList.map(img => `data:${img.mime};base64,${img.base64}`);
        if (imgCount === 1) payload.sequential_image_generation = 'disabled';
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
          return endImg({ error: errMsg });
        }

        if (result.status !== 200) {
          const errMsg = result.body?.error?.message || JSON.stringify(result.body).substring(0, 400);
          console.error('[seedream-image] error', result.status, errMsg);
          return endImg({ error: errMsg });
        }

        // Fetch image URL → upload to R2 (permanent) or fall back to base64
        const fetchDataUrl = async (imgUrl) => {
          if (!imgUrl) return null;
          if (!imgUrl.startsWith('http')) return imgUrl;
          const mime = outputFormat === 'png' ? 'image/png' : 'image/jpeg';
          try {
            const imgBuf = injectAiMetadata(await downloadBuffer(imgUrl), mime);
            if (R2_ENABLED) {
              const ext = outputFormat === 'png' ? 'png' : 'jpg';
              const key = `img/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
              const r2Url = await uploadToR2(imgBuf, key, mime);
              console.log('[seedream-image] uploaded to R2:', key);
              return r2Url;
            }
            return `data:${mime};base64,${imgBuf.toString('base64')}`;
          } catch (fe) {
            console.warn('[seedream-image] could not fetch/upload image URL:', fe.message);
            return imgUrl;
          }
        };

        const items = result.body.data || [];
        if (!items.length) return endImg({ error: 'No image data returned by Seedream' });

        if (imgCount > 1) {
          // Batch mode — return all generated images
          const dataUrls = (await Promise.all(items.map(item => {
            const u = item.url || (item.b64_json && `data:image/jpeg;base64,${item.b64_json}`);
            return fetchDataUrl(u);
          }))).filter(Boolean);
          console.log('[seedream-image] batch done,', dataUrls.length, 'images');
          const actualCost = Math.round(imgCost * dataUrls.length * 100) / 100;
          const db2 = loadDB();
          const usr2 = db2.users[sess.userId];
          usr2.balance = Math.round(((usr2.balance ?? 0) - actualCost) * 100) / 100;
          saveDB(db2);
          return endImg({ urls: dataUrls, balance: usr2.balance });
        }

        // Single image mode
        const imgUrl = items[0].url || (items[0].b64_json && `data:image/jpeg;base64,${items[0].b64_json}`);
        const dataUrl = await fetchDataUrl(imgUrl);
        if (!dataUrl) return endImg({ error: 'No image data returned by Seedream' });
        console.log('[seedream-image] done, dataUrl length:', dataUrl.length);
        const db2  = loadDB();
        const usr2 = db2.users[sess.userId];
        usr2.balance = Math.round(((usr2.balance ?? 0) - imgCost) * 100) / 100;
        saveDB(db2);
        return endImg({ url: dataUrl, balance: usr2.balance });
      } catch(e) {
        const isTimeout = e.message.includes('timed out');
        console.error(`[seedream-image] attempt ${attempt} error:`, e.message);
        if (attempt < MAX_IMG_ATTEMPTS && isTimeout) {
          const waitSec = attempt * 15;
          console.log(`[seedream-image] timeout, retrying after ${waitSec}s (attempt ${attempt})`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }
        return endImg({ error: 'Seedream request failed: ' + e.message });
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
    userContent.push({ type: 'text', text: `${descText}Generate ONE realistic ad idea for this product following your methodology. Output exactly the two-block format from your Output Format section ("**THE IDEA**" paragraph pitch + "**Why it works:**" two sentences). No preamble, no alternatives.` });

    const system = SKILL_BRIEF;
    try {
      const claudeRes = await claudeApiCall(anthropicKey, system, [{ role: 'user', content: userContent }]);
      if (claudeRes.status !== 200) {
        const msg = claudeRes.body?.error?.message || JSON.stringify(claudeRes.body).substring(0, 300);
        return sendJSON(res, claudeRes.status >= 400 ? claudeRes.status : 502, { error: 'Claude error: ' + msg });
      }
      const ideaText = claudeRes.body?.content?.[0]?.text || '';
      if (!/THE IDEA/i.test(ideaText) || !/Why it works/i.test(ideaText)) {
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
    const { ideaText, refSheetsText, startFramesText } = await readBody(req);
    const anthropicKey = ANTHROPIC_API_KEY;
    if (!anthropicKey) return sendJSON(res, 503, { error: 'Anthropic API key not configured.' });
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Sign in to use Ads.' });
    if (!ideaText) return sendJSON(res, 400, { error: 'ideaText required.' });

    const PROMPTS_COST = 0.15;
    const db = loadDB(); const user = db.users[sess.userId];
    const cur = user.balance ?? 0;
    if (cur < PROMPTS_COST) return sendJSON(res, 402, { error: `Insufficient balance. Need $${PROMPTS_COST.toFixed(2)}, have $${cur.toFixed(2)}.` });

    const extraContext = [
      refSheetsText ? `\n\nREFERENCE SHEET PROMPTS (entity IDs and visual descriptions — reference entities by SUBJECT ID / ENV ID in Shot 1):\n${refSheetsText}` : '',
      startFramesText ? `\n\nSTARTING FRAME PROMPTS (the literal first frame of each scene, already generated as images — Shot 1 of each scene must match its starting frame exactly):\n${startFramesText}` : '',
    ].join('');
    const userContent = [{ type: 'text', text: `Here is the realistic ad pitch (a single 15-second video, one paragraph with embedded timestamps, plus a "Why it works" note):\n\n${ideaText}${extraContext}\n\nTreat this as a SINGLE 15-second scene. Use the per-scene output format and produce exactly ONE document with the header "=== SCENE 1 OF 1 — [short scene name] ===" followed by the shot timeline, effects inventory, density map, and energy arc. Honour the pitch's embedded beat timestamps. The video is silent (no dialogue, no voiceover) and contains no turned-on phone/laptop/tablet/TV screens.` }];

    try {
      const claudeRes = await claudeApiCall(anthropicKey, SKILL_SHOTS, [{ role: 'user', content: userContent }]);
      if (claudeRes.status !== 200) {
        const msg = claudeRes.body?.error?.message || JSON.stringify(claudeRes.body).substring(0, 300);
        return sendJSON(res, claudeRes.status >= 400 ? claudeRes.status : 502, { error: 'Claude error: ' + msg });
      }
      const shotsText = claudeRes.body?.content?.[0]?.text || '';
      const scenes = parseShotsOutput(shotsText);
      if (!scenes.length) {
        // Don't charge if we can't parse anything — fail loudly so the client
        // surfaces the error instead of silently "completing" with 0 videos.
        console.warn('[shots] parseShotsOutput returned 0 scenes. Raw start:', shotsText.substring(0, 400));
        return sendJSON(res, 502, {
          error: 'Video prompts failed to parse (Claude output did not contain any "=== SCENE N OF M ===" headers). Please retry — no charge applied.',
          rawPreview: shotsText.substring(0, 200),
        });
      }
      user.balance = Math.round((cur - PROMPTS_COST) * 100) / 100;
      saveDB(db);
      return sendJSON(res, 200, { scenes, shotsText, balance: user.balance });
    } catch(e) {
      return sendJSON(res, 502, { error: 'Video prompts failed: ' + e.message });
    }
  }


  // ── Ads: Stage 2 — reference sheet prompts (ref-sheet-generator skill) ─────
  if (url === '/api/gen/refsheets' && method === 'POST') {
    const { ideaText } = await readBody(req);
    const anthropicKey = ANTHROPIC_API_KEY;
    if (!anthropicKey) return sendJSON(res, 503, { error: 'Anthropic API key not configured.' });
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Sign in to use Ads.' });
    if (!ideaText) return sendJSON(res, 400, { error: 'ideaText required.' });

    const REFS_COST = 0.10;
    const db = loadDB(); const user = db.users[sess.userId];
    const cur = user.balance ?? 0;
    if (cur < REFS_COST) return sendJSON(res, 402, { error: `Insufficient balance. Need $${REFS_COST.toFixed(2)}, have $${cur.toFixed(2)}.` });

    const userMsg = `INPUT — realistic ad pitch (from realistic-ad-idea-generator). It is one paragraph describing a single 15-second video with embedded beat timestamps, followed by a "Why it works" note. Extract every distinct character, the product, and every distinct environment named or implied in the pitch.\n\n${ideaText}\n\nGenerate the reference sheet prompts for all characters, the product, and all environments. Output ONLY the three labeled blocks (=== CHARACTER REFERENCE SHEETS ===, === PRODUCT REFERENCE SHEET ===, === ENVIRONMENT REFERENCE SHEETS ===) with no preamble.`;

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

  // ── Ads: Stage 3 — starting frame prompts (starting-frame-generator skill) ──
  if (url === '/api/gen/startframes' && method === 'POST') {
    const { ideaText, refSheetsText } = await readBody(req);
    const anthropicKey = ANTHROPIC_API_KEY;
    if (!anthropicKey) return sendJSON(res, 503, { error: 'Anthropic API key not configured.' });
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Sign in to use Ads.' });
    if (!ideaText || !refSheetsText) return sendJSON(res, 400, { error: 'ideaText and refSheetsText required.' });

    const FRAMES_COST = 0.05;
    const db = loadDB(); const user = db.users[sess.userId];
    const cur = user.balance ?? 0;
    if (cur < FRAMES_COST) return sendJSON(res, 402, { error: `Insufficient balance. Need $${FRAMES_COST.toFixed(2)}, have $${cur.toFixed(2)}.` });

    const userMsg = `INPUT A — realistic ad pitch (one paragraph, single 15-second scene with embedded beat timestamps, followed by a "Why it works" note):\n${ideaText}\n\nINPUT B — REFERENCE SHEET PROMPTS:\n${refSheetsText}\n\nThis is a SINGLE scene. Generate exactly ONE starting frame prompt for it under the header "SCENE 1:". The starting frame should depict the opening 0–2s beat from the pitch. Output ONLY the === STARTING FRAMES === block.`;

    try {
      const claudeRes = await claudeApiCall(anthropicKey, SKILL_FRAMES, [{ role: 'user', content: userMsg }]);
      if (claudeRes.status !== 200) {
        const msg = claudeRes.body?.error?.message || JSON.stringify(claudeRes.body).substring(0, 300);
        return sendJSON(res, claudeRes.status >= 400 ? claudeRes.status : 502, { error: 'Claude error: ' + msg });
      }
      const framesText = claudeRes.body?.content?.[0]?.text || '';
      // Pull the product name out of the refsheets so we can detect product mentions
      // even when the skill (correctly) names the product directly instead of using
      // the literal word "product".
      const prodMatch = (refSheetsText || '').match(/===\s*PRODUCT REFERENCE SHEET\s*===[\s\S]*?^PRODUCT:\s*([^\n]+)/m);
      const productName = prodMatch ? prodMatch[1].trim() : '';
      const startFrames = parseStartFramesOutput(framesText, productName);
      if (!startFrames.length) console.warn('[startframes] parseStartFramesOutput returned 0 frames. Raw start:', framesText.substring(0, 200));
      user.balance = Math.round((cur - FRAMES_COST) * 100) / 100;
      saveDB(db);
      return sendJSON(res, 200, { startFrames, startFramesText: framesText, balance: user.balance });
    } catch(e) {
      return sendJSON(res, 502, { error: 'Start frames failed: ' + e.message });
    }
  }

  // ── Ad background job: start full pipeline ───────────────────────────────────
  if (url === '/api/gen/ad-run' && method === 'POST') {
    const { images, description } = await readBody(req);
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Sign in to use Ads.' });
    if (!images || !images.length) return sendJSON(res, 400, { error: 'Upload at least one product image.' });
    if (!ANTHROPIC_API_KEY) return sendJSON(res, 503, { error: 'Anthropic API key not configured.' });
    if (!BYTEPLUS_API_KEY) return sendJSON(res, 503, { error: 'BytePlus API key not configured.' });
    const db = loadDB(); const user = db.users[sess.userId];
    if (!user) return sendJSON(res, 401, { error: 'User not found.' });
    if ((user.balance ?? 0) < 0.50) return sendJSON(res, 402, { error: `Insufficient balance. Need at least $0.50 to start an ad pipeline.` });
    const jobId = crypto.randomBytes(8).toString('hex');
    await setAdJob(jobId, {
      jobId, userId: sess.userId, status: 'pending', stage: 'pending',
      stageLabel: 'Starting…', progress: 0, images, description: description || '',
      adTitle: null, videoUrl: null, createdAt: Date.now(), updatedAt: Date.now(),
    });
    runAdPipeline(jobId).catch(e => console.error('[ad-job] unhandled error for', jobId, ':', e.message));
    return sendJSON(res, 200, { jobId });
  }

  // ── Ad background job: poll status ───────────────────────────────────────────
  if (url.startsWith('/api/gen/ad-job') && method === 'GET') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    const params = new URL('http://x' + url).searchParams;
    const jobId = params.get('id');
    if (!jobId) return sendJSON(res, 400, { error: 'id required' });
    const job = await getAdJob(jobId);
    if (!job) return sendJSON(res, 404, { error: 'Job not found or expired' });
    if (job.userId !== sess.userId) return sendJSON(res, 403, { error: 'Forbidden' });
    // Stale detection: if running but not updated in 45 min, mark failed
    if (job.status === 'running' && job.updatedAt && (Date.now() - job.updatedAt) > 45 * 60 * 1000) {
      job.status = 'failed'; job.error = 'Pipeline stalled — please try again';
    }
    const { images: _, ...safeJob } = job; // don't send image data back
    return sendJSON(res, 200, safeJob);
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
        if (R2_ENABLED) {
          try {
            const buf = await downloadBuffer(videoUrl);
            const key = `vid/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-upscaled.mp4`;
            const r2Url = await uploadToR2(buf, key, 'video/mp4');
            console.log('[fal] uploaded upscaled video to R2:', key);
            return sendJSON(res, 200, { status: 'COMPLETED', url: r2Url });
          } catch(re) {
            console.warn('[fal] R2 upload failed, returning Fal URL:', re.message);
          }
        }
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

  // ── Store video to R2 ────────────────────────────────────────────────────
  if (url === '/api/store-video' && method === 'POST') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });
    const { video_url } = await readBody(req);
    if (!video_url) return sendJSON(res, 400, { error: 'video_url required' });
    if (!R2_ENABLED) return sendJSON(res, 200, { url: video_url });
    try {
      const buf = await downloadBuffer(video_url);
      const key = `vid/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.mp4`;
      const r2Url = await uploadToR2(buf, key, 'video/mp4');
      console.log('[store-video] uploaded to R2:', key);
      return sendJSON(res, 200, { url: r2Url });
    } catch(e) {
      console.error('[store-video] R2 upload failed:', e.message);
      return sendJSON(res, 200, { url: video_url });
    }
  }

  // ── Image-bytes proxy ─────────────────────────────────────────────────────
  // Same-origin re-stream of R2 public URLs so the frontend canvas can read
  // pixels without cross-origin taint (R2 doesn't send CORS by default).
  // Whitelisted to R2_PUBLIC_URL so we're not an open proxy.
  if (url.startsWith('/api/image-bytes')) {
    const q = url.split('?')[1] || '';
    const target = new URLSearchParams(q).get('url');
    if (!target) { res.writeHead(400); return res.end('missing url'); }
    if (!R2_PUBLIC_URL || !target.startsWith(R2_PUBLIC_URL)) {
      res.writeHead(403); return res.end('only R2 public URLs allowed');
    }
    try {
      const buf = await downloadBuffer(target);
      const lower = target.toLowerCase();
      const ct = lower.endsWith('.png') ? 'image/png'
               : lower.endsWith('.webp') ? 'image/webp'
               : 'image/jpeg';
      res.writeHead(200, {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(buf);
    } catch (e) {
      console.warn('[image-bytes] fetch failed:', e.message);
      res.writeHead(502); return res.end('fetch failed');
    }
  }

  // ── BytePlus proxy ────────────────────────────────────────────────────────
  if (url.startsWith('/proxy/')) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => proxy(req, res, Buffer.concat(chunks)));
    return;
  }

  // ── Proxy download (bypasses CORS on CDN URLs) ───────────────────────────
  if (pathname === '/api/dl' && method === 'GET') {
    const sess = getSession(req);
    if (!sess) { res.writeHead(401); res.end('Not authenticated'); return; }
    const params = new URL(req.url, 'http://x').searchParams;
    const fileUrl = params.get('url');
    const filename = params.get('name') || 'download';
    if (!fileUrl || !/^https?:\/\//.test(fileUrl)) { res.writeHead(400); res.end('Bad url'); return; }
    try {
      const upstream = await fetch(fileUrl, { signal: AbortSignal.timeout(60000) });
      if (!upstream.ok) { res.writeHead(502); res.end('Upstream error'); return; }
      const ct = upstream.headers.get('content-type') || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': ct,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      });
      upstream.body.pipeTo(new WritableStream({ write(chunk) { res.write(chunk); }, close() { res.end(); } }));
    } catch { res.writeHead(502); res.end('Fetch failed'); }
    return;
  }

  res.writeHead(404); res.end('Not found');
}

// ── Start ─────────────────────────────────────────────────────────────────────
initDB()
  .catch(e => console.error('[db] initDB rejected (server will still start):', e.message))
  .then(async () => {
  // Move any legacy library entries out of the main DB key into per-user keys
  // BEFORE we start serving traffic. This shrinks the main DB key back under
  // Upstash's 10 MB request-size limit so balance/auth saves stop failing.
  try { await migrateLibrariesToOwnKeys(); }
  catch(e) { console.error('[migrate] unexpected error:', e.message); }

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
