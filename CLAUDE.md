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

## Backend key details
- BytePlus API host: `ark.ap-southeast.bytepluses.com`
- Proxy strips `accept-encoding` header, sets `identity` to avoid gzip issues
- DB: Upstash Redis (REST API) with in-memory cache; falls back to `db.json` locally
- **`redisReady` safety flag**: only writes to Redis after confirmed load at boot (prevents data wipe on Redis hiccup)
- Email: Brevo REST API (primary), Resend fallback
- Temp video upload: litterbox.catbox.moe → tmpfiles.org fallback
- Server listens on `0.0.0.0` (required for Render)
- Root route strips query params (`?fbclid=` etc.) before matching `/`

## Auth endpoints
`/auth/register` `/auth/verify-email` `/auth/resend-verify` `/auth/forgot-password` `/auth/reset-password` `/auth/login` `/auth/logout` `/auth/me`

## Frontend key details
- BytePlus response shape: `d.content.video_url` (string, not array)
- Settings use JS button groups (`getBtnGroupValue('model-group')` etc.) — no `<select>` elements
- Mobile mode: auto-detected, toggle button in nav (📱/🖥️), saved to localStorage
- `buildPayload` uses `size` field (e.g. `"720x1280"`), not `resolution`

## Known BytePlus limitations
- Real people in images rejected by content policy
- `file://` scheme rejected for `video_url` (must be public HTTPS URL)
- `draft` parameter not supported on Seedance 2.0
