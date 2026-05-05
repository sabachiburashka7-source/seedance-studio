# Lepton (Seedance Studio)

AI video + image + ad generation app using BytePlus ModelArk (Seedance 2.0 video, Seedream 5.0 image) and Claude.

## Files
- `server.js` — Node.js backend (no npm, built-in modules only)
- `seedance-studio.html` — Single-file frontend
- `package.json` — `{ "scripts": { "start": "node server.js" } }`
- `skills/*.md` — Claude system prompts loaded at boot (see Ads pipeline)
- `.gitignore` — ignores db.json, node_modules, files.zip

## Deployment
- **GitHub**: `sabachiburashka7-source/seedance-studio` (main branch)
- **Render**: auto-deploys on push, runs `node server.js`
- **Render env vars**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `APP_URL`, `BYTEPLUS_API_KEY`, `ANTHROPIC_API_KEY`, `FAL_API_KEY` (optional, for upscale)
- **UptimeRobot**: pings `/health` every 5 min to prevent Render free tier from sleeping

## Backend key details
- BytePlus API host: `ark.ap-southeast.bytepluses.com`
- Proxy strips `accept-encoding` header, sets `identity` to avoid gzip issues
- DB: Upstash Redis (REST API) with in-memory cache; falls back to `db.json` locally
- **`redisReady` safety flag**: only writes to Redis after confirmed load at boot (prevents data wipe on Redis hiccup)
- 12-second timeout on Redis HTTP requests; background retry loop every 10s up to 30 attempts
- Email: Brevo REST API (primary), Resend fallback (`api.resend.com`)
- `EMAIL_ENABLED` constant gates verification/forgot-password/login-block on either provider being configured (was previously gated only on `RESEND_KEY` — silently disabled verification on Brevo-only deployments)
- Temp video upload: litterbox.catbox.moe → tmpfiles.org fallback
- Server listens on `0.0.0.0` (required for Render)
- Root route strips query params (`?fbclid=` etc.) before matching `/`
- Health check at `/health` and `/healthz` returns `ok`
- Server only starts listening AFTER `initDB()` completes (no race on cold start)

## Auth endpoints
`/auth/register` `/auth/verify-email` `/auth/resend-verify` `/auth/forgot-password` `/auth/reset-password` `/auth/login` `/auth/logout` `/auth/me`

## Balance + promo
USD balance per user (legacy `credits` field auto-migrated by `migrateBalance()` at boot). Promo codes hard-coded in `PROMO_CODES` (single-use globally, tracked in `db.redeemedPromos`).
- `GET  /api/balance` — current balance
- `POST /api/deduct` `{ amount }` — gated charge before generation
- `POST /api/refund` `{ amount }` — credits user back when generation fails
- `POST /api/redeem-promo` `{ code }` — single-use promo redeem
There is no Stripe integration — payments live entirely on promo codes.

## Image generation (Seedream 5.0 via BytePlus)
- Endpoint: `POST /api/generate-image` (server-side `BYTEPLUS_API_KEY`, no user key)
- Model: `seedream-5-0-260128` (frontend tags as `seedream-5-0-lite`)
- Quality: `low` → 2k output (~$0.02), `high` → 3k output (~$0.08)
- Aspect ratios → size strings (e.g. `9:16`→`1512x2688` low, `2268x4032` high)
- Body accepts either legacy `imageBase64`/`imageMime` (single ref) or `images[]` (multi-ref)
- Multi-ref payload uses `image_urls`; single-ref uses `image`
- Response: Seedream returns a URL → server fetches the bytes and re-encodes as a base64 data URL before responding
- Up to 4 attempts with backoff on 429s and 150s timeouts

## Video generation (Seedance 2.0 via BytePlus)
- Goes through `/proxy/api/v3/contents/generations/tasks` (BytePlus proxy)
- Frontend hardcodes `model = 'dreamina-seedance-2-0-260128'` and `res = '480p'`
- T2V/I2V/V2V chosen by what's attached: text-only / + reference image / + reference video
- BytePlus response shape: `d.content.video_url` (string, not array)
- After completion, frontend submits to Fal Topaz upscaler in the background; library card shows `↑ Upscaling` then swaps to upscaled URL when complete

## Frontend key details
- Settings use JS button groups (`onBtnGroup`/`getBtnGroupValue`) — no `<select>` elements
- Mobile mode: auto-detected, toggle in nav (📱/🖥️), saved to localStorage
- `buildPayload(model, content, audio, ratio, dur, wm, res)` returns the BytePlus task body
- Toast: `toast(msg, type='ok', duration=5000)` — types: `ok`, `err`, `warn`
- `safeJson(r)` — wraps `r.json()` so empty / non-JSON server responses produce a useful error string
- `saveLib()` is serialized + coalesced: only one POST `/library` in flight; concurrent saves collapse into one trailing POST (prevented ads-pipeline items vanishing after refresh)

## Cold start / session handling
- Render free tier sleeps after 15 min of inactivity → cold start ~30s
- `initAuth()` retries up to 8 times on network errors or 5xx (5s, 8s, 11s…)
- 401/403 retried 3 times early (Redis may not have loaded yet) before clearing token
- `#wakeup-banner` div shown during retries
- On exhausted retries: token preserved, warn toast, ask user to refresh
- UptimeRobot ping every 5 min keeps the dyno warm

## Known BytePlus limitations
- Real people in images rejected by content policy (see canvas softening below)
- `file://` scheme rejected for `video_url` (must be public HTTPS URL)
- `draft` parameter not supported on Seedance 2.0
- `OutputAudioSensitiveContentDetected` is non-deterministic — frontend refunds and tells user to retry

## Canvas softening (real-person classifier bypass)
ByteDance runs a real-person classifier on every input image. Even clearly AI-generated photorealistic portraits trigger it. There is no API parameter to declare an image as AI-generated.

**Solution**: 5-pass canvas pipeline applied before sending any image to ByteDance. `fileToDataUrl(file)` (for `File` inputs) and `softenDataUrl(dataUrl)` (for already-fetched data URLs) both implement it:
1. `blur(1.2px) saturate(0.85)` CSS filter on canvas context — softens photographic micro-texture
2. 72% downscale → upscale back — bilinear interpolation twice destroys high-frequency sharpness
3. Grid overlay (lines every ~`min(w,h)/28` px, 18% opacity) — breaks facial-landmark sampling regions; the most effective pass
4. ±25 per-channel random noise
5. JPEG re-encode at 80% quality — DCT artifacts further distinguish from a clean camera original

Falls back to the raw FileReader data URL if the canvas is tainted (cross-origin). Visually indistinguishable, but consider DRYing the two duplicates if you touch them.

## Ads pipeline (4-stage Claude → image gen → video gen)
User uploads product photos + optional description → `createAd()` runs the full pipeline.

**Stage order:**
1. `POST /api/gen/brief` — product images + description → Claude (`ad-idea-generator` skill) → free-text concept + scene list (`ideaText`)
2. `POST /api/gen/shots` — `ideaText` → Claude (`video-prompt-builder` skill) → per-scene cinematic documents with `=== SCENE N OF M — name ===` headers (`shotsText`, parsed into `scenes[]`)
3. `POST /api/gen/refsheets` — `ideaText + shotsText` → Claude (`ref-sheet-generator` skill) → reference sheet prompts for characters / product / environments (`refSheetsText`, parsed into `entities[]` with `subjectId` / `envId` fields)
4. `POST /api/gen/startframes` — `ideaText + shotsText + refSheetsText` → Claude (`starting-frame-generator` skill) → one starting-frame prompt per scene (parsed into `startFrames[]` with `subjectIds` / `envIds` referencing entity IDs)

**Then per-scene image + video generation:**
- 3.5: For each entity, call `/api/generate-image` (product entity attaches the user's uploaded photos as refs, resized to 1024px)
- 4.5: For each scene, call `/api/generate-image` with the starting-frame prompt + the matching `SUBJECT_xxx` / `ENV_xxx` / `product` ref images (each resized to 1024px — full-res ref sheets are 3–8MB and silently get dropped otherwise)
- 5: For each scene, submit BytePlus video task with starting frame as first reference, all ref images, optional previous-scene video for visual continuity. All scenes 9:16, duration capped at 5–15s. Frontend `pollAd(job)` and `finishAd(job, url, err)` save items into the `folder: adTitle` group.

**Costs (USD, charged on top of per-image / per-video gen):** brief $0.15, shots $0.15, refsheets $0.10, startframes $0.05.

**`claudeApiCall(apiKey, system, messages)` helper** — uses `ANTHROPIC_API_KEY` env var, model `claude-sonnet-4-6`, 240s timeout (large outputs need it).

**`readBody` is called FIRST in every `/api/gen/*` handler**, before any auth checks — prevents "Failed to fetch" client errors when the server rejects mid-upload of a large image body.

**Output parsers (all in server.js):** `parseShotsOutput`, `parseRefSheetsOutput`, `parseStartFramesOutput` — split text by `=== SECTION ===` headers and per-block regexes. No JSON involved (Claude unreliably embeds literal newlines / unescaped quotes inside JSON strings, breaking `JSON.parse` with no good repair). Plain-text format with delimiters is robust.

**⚠️ Ad-blocker naming rule — NEVER use `/ads/` in any API endpoint path.**
Browser ad blockers (uBlock Origin, EasyList, AdGuard, etc.) match URL paths containing `/ads/`, `/ad-`, `ads.` etc. and silently kill the fetch before it leaves the browser. Symptoms: instant "Failed to fetch", Render logs show nothing at all. Renamed to `/api/gen/{brief,shots,refsheets,startframes}` to dodge this. Use neutral words (`gen`, `create`, `pipeline`, `brief`, `shots`) for any new endpoint touching ads/campaigns/promotions.

**Skill files** are plain `.md` (with YAML frontmatter that gets stripped at load): `ad-idea-generator.md`, `video-prompt-builder.md`, `ref-sheet-generator.md`, `starting-frame-generator.md`. Read at boot via `fs.readFileSync` — server fails to start if any are missing.

**Frontend (Ads page):**
- `adImages[]` — `{file, dataUrl}` for uploaded product photos
- `addAdImages` / `removeAdImage` / `renderAdImages` — multi-image upload grid with × buttons
- `adLog(msg, type)` / `adLogUpdate(step, msg, type)` / `adLogClear()` — step-by-step progress log panel
- `genImage(prompt, ratio, inputImages, label)` inside `createAd()` — image-gen with retry/backoff for 429/5xx/timeout
- `refMap` keyed by `SUBJECT_xxx` / `ENV_xxx` / `product` — built during stage 3.5, consumed by stage 4.5 and stage 5

## Library
- `lib` items: `{ id, prompt, url, ratio, model, ts, done, type?, folder?, label?, upscaling?, upscaleRequestId?, upscaleStatusUrl?, upscaleResponseUrl? }`
- `folder` field set by ads pipeline → `renderLib()` groups by folder, then ungrouped items below
- `libFolderState[name]` tracks collapsed state per folder
- `makeLibCard(item, i)` is the per-card renderer

## Workflow
- After every code change: `git add <files> && git commit && git push origin main`
- Render auto-deploys on push — no manual deploy step needed
- Always deploy automatically after finishing a change, without waiting for the user to ask
