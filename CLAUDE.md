# Seedance Studio

AI video generation app using BytePlus ModelArk (Seedance 2.0).

## Files
- `server.js` — Node.js backend (no npm, built-in modules only)
- `seedance-studio.html` — Single-file frontend
- `package.json` — `{ "scripts": { "start": "node server.js" } }`
- `.gitignore` — ignores db.json, node_modules, files.zip

## Deployment
- **GitHub**: `sabachiburashka7-source/seedance-studio` (main branch)
- **Render**: auto-deploys on push, runs `node server.js`
- **Render env vars**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `APP_URL`
- **UptimeRobot**: pings `/health` every 5 min to prevent Render free tier from sleeping

## Backend key details
- BytePlus API host: `ark.ap-southeast.bytepluses.com`
- Proxy strips `accept-encoding` header, sets `identity` to avoid gzip issues
- DB: Upstash Redis (REST API) with in-memory cache; falls back to `db.json` locally
- **`redisReady` safety flag**: only writes to Redis after confirmed load at boot (prevents data wipe on Redis hiccup)
- 12-second timeout on Redis HTTP requests (`req.setTimeout()`) to prevent boot stall
- Email: Brevo REST API (primary), Resend fallback
- Temp video upload: litterbox.catbox.moe → tmpfiles.org fallback
- Server listens on `0.0.0.0` (required for Render)
- Root route strips query params (`?fbclid=` etc.) before matching `/` — fixes messenger link sharing
- Health check at `/health` and `/healthz` returns `ok`
- Server only starts listening AFTER `initDB()` completes (no race on cold start)

## Auth endpoints
`/auth/register` `/auth/verify-email` `/auth/resend-verify` `/auth/forgot-password` `/auth/reset-password` `/auth/login` `/auth/logout` `/auth/me`

## Frontend key details
- BytePlus response shape: `d.content.video_url` (string, not array)
- Settings use JS button groups (`getBtnGroupValue('model-group')` etc.) — no `<select>` elements
- Mobile mode: auto-detected, toggle button in nav (📱/🖥️), saved to localStorage
- `buildPayload` uses `size` field (e.g. `"720x1280"`), not `resolution`
- Toast function: `toast(msg, type='ok', duration=5000)` — types: `ok` (green), `err` (red), `warn` (yellow)

## Cold start / session handling
- Render free tier sleeps after 15 min of inactivity → cold start takes ~30s
- `initAuth()` retries up to 8 times on network errors or 5xx (increasing delay: 5s, 8s, 11s…)
- Only clears auth token on genuine `401`/`403` — never on network errors
- Yellow `#wakeup-banner` div shown during retries with countdown message
- On exhausted retries: preserves token, shows warn toast, tells user to refresh
- **Fix**: UptimeRobot pings `/health` every 5 min → server never sleeps

## Known BytePlus limitations
- Real people in images rejected by content policy
- `file://` scheme rejected for `video_url` (must be public HTTPS URL)
- `draft` parameter not supported on Seedance 2.0

## Current state (as of last session)
All core features working and deployed:
- Auth (register, login, logout, email verify via Brevo)
- Video generation (text-to-video, image-to-video)
- Library (save/delete generated videos, per user, synced to Redis)
- Mobile/desktop UI toggle with auto-detection
- Professional dark UI with button groups for model/resolution/ratio settings
- Redis data safety (redisReady flag + 12s timeout)
- Messenger link fix (strips tracking params)
- Cold start session retry (no more phantom logouts)
