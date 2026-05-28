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
- **Vercel**: auto-deploys on push (moved here after the Render account was suspended)
- **Vercel env vars**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `APP_URL`, `BYTEPLUS_API_KEY`, `ANTHROPIC_API_KEY`, `FAL_API_KEY` (optional, for upscale)

## Backend key details
- BytePlus API host: `ark.ap-southeast.bytepluses.com`
- Proxy strips `accept-encoding` header, sets `identity` to avoid gzip issues
- DB: Upstash Redis (REST API) with in-memory cache; falls back to `db.json` locally
- **`redisReady` safety flag**: only writes to Redis after confirmed load at boot (prevents data wipe on Redis hiccup). `redisCmd` rejects non-2xx HTTP and Upstash `error` JSON responses; `redisLoad` confirms null GET results with a one-shot retry before accepting "empty"
- **Empty-write refusal**: once `dbCacheKnownNonEmpty` is set (cache observed with users at least once this process), `saveDB` refuses to write back an empty users map to Redis and async-reloads from Redis to repair in-memory state. Catches any logic bug that would otherwise wipe everything
- **Library lives in PER-USER Redis keys**: `seedance_lib_<userId>` (not embedded in the main `seedance_db` key). Main key only holds users/sessions/balance/etc. so it stays well under Upstash's 10 MB SET limit even as libraries grow. `/library` GET/POST go through `loadUserLibrary` / `saveUserLibrary` helpers backed by a per-user `libCache`. On boot, `migrateLibrariesToOwnKeys()` moves any legacy `db.library[userId]` entries into per-user keys and strips them from the main key — idempotent
- **HTTP 413 on oversized library**: `saveUserLibrary` refuses payloads >10 MB (Upstash REST limit) and returns `{ ok: false, error: 'too_large' }`; the `/library` POST handler turns this into HTTP 413 with a human-readable message; the frontend `saveLib` stops retrying and shows a toast
- 12-second timeout on Redis HTTP requests; background retry loop every 10s up to 30 attempts
- Email: Brevo REST API (primary), Resend fallback (`api.resend.com`)
- `EMAIL_ENABLED` constant gates verification/forgot-password/login-block on either provider being configured (was previously gated only on `RESEND_KEY` — silently disabled verification on Brevo-only deployments)
- Temp video upload: litterbox.catbox.moe → tmpfiles.org fallback
- Server listens on `0.0.0.0`
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

## Known BytePlus limitations
- Real people in images rejected by content policy
- `file://` scheme rejected for `video_url` (must be public HTTPS URL)
- `draft` parameter not supported on Seedance 2.0
- `OutputAudioSensitiveContentDetected` is non-deterministic — frontend refunds and tells user to retry

## Image handling
Reference images and videos are uploaded as-is — no classifier-bypass disruption. `fileToDataUrl` (manual T2V/I2V) reads the raw file, optionally letterboxing to a target aspect ratio. `urlToDataUrl` (ads pipeline) letterboxes to `9:16`. Videos uploaded for V2V (`uploadVidFile`) go straight to the temp host.

## Ads pipeline (3-stage: idea → product ref → video)
User uploads product photos + optional description → `createAd()` POSTs to `/api/gen/ad-run` → server runs `runAdPipeline(jobId)` async, frontend polls `/api/gen/ad-job?id=…`.

**Stage order (all inside `runAdPipeline`):**
1. **Idea** — product images + description → Claude (`organic-tiktok-ad-generator` skill) → single paragraph 15-second TikTok-style ad pitch with embedded `(0–2s)`, `(2–6s)`, `(6–11s)`, `(11–15s)` beats. Cost $0.15. `extractIdeaParagraph()` strips the `**THE IDEA**` header so the paragraph can be fed straight to BytePlus.
2. **Product reference image** — user's uploaded product photos → `adGenProductRef()` → OpenAI `gpt-image-2` at `quality: 'low'`, `size: 1024x1024` → product reference sheet image (1 image). Cost $0.02. Stored to R2 if configured, hidden lib item kept for reference.
3. **Video** — `adSubmitVideo(ideaParagraph, productRefUrl, '')` → BytePlus Seedance 2.0 task, 15s, 9:16, 480p. Product ref URL attached as `role: 'reference_image'` (not first-frame). Video cost computed from pixel volume.

**Frontend ↔ server stages** (both must agree): `idea` → `productRef` → `video` → `done`. `adProgUpdateFromJob` maps these to chip IDs `idea`, `productRef`, `video`.

**Single 15s output, 9:16.** Final video saved to `lib` with `folder: adTitle` (title derived from description or the first sentence of the idea paragraph). Fal Topaz upscale fired and forgotten.

**`claudeApiCall(apiKey, system, messages)` helper** — uses `ANTHROPIC_API_KEY` env var, model `claude-sonnet-4-6`, 240s timeout.

**Endpoints (only two now):**
- `POST /api/gen/ad-run` — kicks off the pipeline, returns `{ jobId }`. `readBody` called FIRST (before auth) to avoid "Failed to fetch" on large image uploads.
- `GET  /api/gen/ad-job?id=<jobId>` — polled by frontend, returns full job state (stage, stageLabel, progress 0..1, adTitle, videoUrl, error).

**⚠️ Ad-blocker naming rule — NEVER use `/ads/` in any API endpoint path.**
Browser ad blockers (uBlock Origin, EasyList, AdGuard, etc.) match URL paths containing `/ads/`, `/ad-`, `ads.` etc. and silently kill the fetch before it leaves the browser. Symptoms: instant "Failed to fetch", server logs show nothing at all. Renamed to `/api/gen/{ad-run,ad-job}` to dodge this. Use neutral words (`gen`, `run`, `job`) for any new endpoint touching ads/campaigns/promotions.

**Skill file** is plain `.md` (YAML frontmatter stripped at load): `skills/organic-tiktok-ad-generator.md` → `SKILL_IDEA` constant. Read at boot via `fs.readFileSync` — server fails to start if missing.

**Frontend (Ads page):**
- `adImages[]` — `{file, dataUrl}` for uploaded product photos
- `addAdImages` / `removeAdImage` / `renderAdImages` — multi-image upload grid with × buttons
- `createAd()` — resizes images via `resizeForClaude`, POSTs to `/api/gen/ad-run`, stores `jobId` in `localStorage.ad_bg_job`, then `watchAdJob(jobId)` polls until done/failed
- `adProg*` family — animated progress bar + chips, driven by `adProgUpdateFromJob(job)` from each poll response

## Library
- `lib` items: `{ id, prompt, url, ratio, model, ts, done, type?, folder?, label?, upscaling?, upscaleRequestId?, upscaleStatusUrl?, upscaleResponseUrl? }`
- `folder` field set by ads pipeline → `renderLib()` groups by folder, then ungrouped items below
- `libFolderState[name]` tracks collapsed state per folder
- `makeLibCard(item, i)` is the per-card renderer

## Workflow
- After every code change: `git add <files> && git commit && git push origin main`
- Vercel auto-deploys on push — no manual deploy step needed
- Always deploy automatically after finishing a change, without waiting for the user to ask
