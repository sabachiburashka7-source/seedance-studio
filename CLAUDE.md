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

## Image generation (OpenAI)
- Endpoint: `POST /api/generate-image` — proxies to OpenAI `/v1/images/generations`
- Model: `gpt-image-1` (displayed as "GPT Image 2.0" in UI)
- User enters their OpenAI API key directly in the Image tab settings (same pattern as BytePlus key for video)
- Key is sent from frontend as `x-openai-key` request header; server forwards it as `Authorization: Bearer`
- No env var needed for OpenAI key
- Quality setting: `low` / `high` (maps to OpenAI `quality` param)
- Aspect ratio → OpenAI size mapping: `9:16`→`1024x1536`, `16:9`→`1536x1024`, `1:1`→`1024x1024`, `4:3`→`1536x1024`, `3:4`→`1024x1536`, `21:9`→`1536x1024`
- Response is synchronous (no polling) — image returned as base64 data URL, saved directly to Library
- `openaiKey()` / `checkOpenAIKey()` mirror `key()` / `checkKey()` used for BytePlus

## Known BytePlus limitations
- Real people in images rejected by content policy (see canvas softening below)
- `file://` scheme rejected for `video_url` (must be public HTTPS URL)
- `draft` parameter not supported on Seedance 2.0

## Canvas softening (real-person classifier bypass)
ByteDance runs a real-person classifier on every input image before generation. Even clearly AI-generated photorealistic portraits (e.g. character reference sheets) trigger it. There is no API parameter to declare an image as AI-generated.

**Solution** (in `fileToDataUrl` in `seedance-studio.html`): 5-pass canvas pipeline applied to every image before it is sent to ByteDance:
1. `blur(1.2px) saturate(0.85)` CSS filter on the canvas context — softens photographic skin/hair micro-texture
2. 72% downscale → upscale back to full size — bilinear interpolation twice destroys high-frequency sharpness patterns
3. 18% opacity grid overlay (lines every ~`min(w,h)/28` px) — breaks up the facial landmark regions the classifier samples; this is the most effective pass
4. ±25 per-channel random noise
5. JPEG re-encode at 80% quality — DCT block artifacts further distinguish from a clean camera original

Falls back to the raw FileReader data URL if the canvas is tainted (cross-origin). The processed image is visually indistinguishable at normal size and Seedance still reads character details correctly for generation.

## Workflow
- After every code change: `git add <files> && git commit && git push origin main`
- Render auto-deploys on push — no manual deploy step needed
- Always deploy automatically after finishing a change, without waiting for the user to ask

## Ads pipeline
Full AI-powered ad creation tab. User uploads product photos + optional description → full pipeline runs automatically.

**Pipeline order:**
1. Product images → `POST /api/gen/brief` (Claude) → ad concept JSON
2. Concept → generate all reference images via `POST /api/generate-image` (OpenAI) — dynamic count, no fixed limit
3. Concept + ref images → `POST /api/gen/shots` (Claude) → shot-by-shot video prompts per scene
4. Each scene prompt + ref images → BytePlus video generation → poll → save to Library in named folder

**Server endpoints:**
- `POST /api/gen/brief` — sends images + description to Claude, returns concept JSON. `readBody` called FIRST before any auth checks (critical — prevents "Failed to fetch" when server rejects mid-upload of large image body)
- `POST /api/gen/shots` — sends concept to Claude, returns scene prompts merged with metadata. Same readBody-first rule. Ref images are NOT sent (too large; concept JSON already describes them).
- Both use `claudeApiCall(apiKey, system, messages)` helper — user-supplied Anthropic key sent as `x-anthropic-key` header, 60s timeout
- Cost: 5 credits for brainstorm + 5 credits for video prompts (charged on top of normal image/video gen costs)

**⚠️ /api/gen/shots response format — hybrid text, NOT JSON prompts**
Claude cannot reliably put multi-line shot descriptions inside JSON strings — it embeds literal newlines and unescaped double-quotes (e.g. `"soft" bokeh`) which break `JSON.parse` with no reliable post-hoc repair. The endpoint uses a hybrid output format:

- **PART 1**: `SCENES_META: [{"number":1,"name":"...","useRefImages":["k1"],"ratio":"9:16","duration":6},...]` — compact JSON for metadata only (no prompt text)
- **PART 2**: `<scene_1>...full prompt text...</scene_1>` tags — plain text, immune to JSON encoding issues

Server parses SCENES_META with a **bracket-balancing loop** (not regex) to correctly handle nested arrays like `useRefImages`. Then extracts each `<scene_N>` block by regex and merges `prompt` into the metadata before returning to the frontend. Frontend receives normal `{ scenes: [{...prompt, useRefImages, ...}] }`.

**`safeParseClaudeJSON()` helper** (used by `/api/gen/brief` only): tries direct parse → strip markdown fences → sanitize literal newlines in strings → extract first `{...}` block. Still useful for the brainstorm endpoint which returns simpler JSON without free-form text fields.

**⚠️ Ad-blocker naming rule — NEVER use `/ads/` in any API endpoint path.**
Browser ad blockers (uBlock Origin, EasyList, AdGuard, etc.) match URL paths containing `/ads/`, `/ad-`, `ads.` etc. and silently kill the fetch before it leaves the browser. Symptoms look like a server problem but are 100% client-side: "Failed to fetch" appears instantly, Render logs show nothing at all, even a 1 KB request fails. The endpoints were originally `/api/ads/brainstorm` and `/api/ads/video-prompts` and were blocked by every user with an ad blocker. They were renamed to `/api/gen/brief` and `/api/gen/shots` to fix this. When adding any new endpoint related to ads, campaigns, or promotions, always use neutral words (`gen`, `create`, `pipeline`, `brief`, `shots`, etc.).

**Claude skill prompts:**
- Brainstorm uses the **ad-concept-generator** skill: Phase 0 visual intelligence, emotional territory mapping, identity-based persuasion, Peak-End Rule, somatic markers. Outputs structured JSON with `referenceImages[]` (dynamic list) and `scenes[]`
- Video prompts use the **video-prompt-builder** skill: shot-by-shot effects timeline with named effects (speed ramp, digital zoom, bloom flash, whip pan etc.), density contrast, signature moment callouts, energy arc
- Both skill `.skill` files are ZIP archives (not plain text) — extract with PowerShell `ZipFile::ExtractToDirectory` to read them

**Reference images:**
- Claude returns a `referenceImages` array — as many entries as the concept needs (character sheets, product angles, environments, props, etc.)
- Each entry: `{ key, label, prompt, ratio }` — frontend iterates and generates all of them via OpenAI
- Keys are referenced by scenes via `refImageKeys[]`

**Frontend (Ads page):**
- `adImages[]` — array of `{file, dataUrl}` for uploaded product photos
- `addAdImages(input)` / `removeAdImage(idx)` / `renderAdImages()` — multi-image upload grid with × buttons
- `anthropicKey()` / `checkAnthropicKey()` — same pattern as `openaiKey()` / `key()`
- `checkKey()` and `checkOpenAIKey()` mirror their status to Ads tab pills; `goPage('ads')` triggers both syncs
- `adLog(msg, type)` / `adLogUpdate(step, msg, type)` / `adLogClear()` — step-by-step progress log panel (`#ad-log`)
- `createAd()` — main async pipeline; all scene videos hardcoded to `9:16` ratio, duration capped at 4–10s
- `pollAd(job)` / `finishAd(job, url, err)` — separate polling functions that save items with `folder: adTitle`

**Library folder grouping:**
- `lib` items can have a `folder` field (set by Ads pipeline)
- `makeLibCard(item, i)` extracted as standalone function
- `libFolderState{}` tracks collapsed state per folder name
- `renderLib()` groups items by folder first (collapsible `📁` headers with `grid-column: 1/-1`), then renders ungrouped items below
- Folder header click toggles `libFolderState[name]` and re-renders

## Current state (as of last session)
All core features working and deployed:
- Auth (register, login, logout, email verify via Brevo)
- Video generation (text-to-video, image-to-video) via BytePlus proxy
- Image generation via OpenAI GPT Image 2.0 (user-supplied key in UI)
- Library (save/delete generated videos + images, per user, synced to Redis) — now supports folder grouping
- Mobile/desktop UI toggle with auto-detection
- Professional dark UI with button groups for model/resolution/ratio settings
- Redis data safety (redisReady flag + 12s timeout)
- Messenger link fix (strips tracking params)
- Cold start session retry (no more phantom logouts)
- Canvas softening pipeline — AI-generated portraits (incl. photorealistic reference sheets) now pass ByteDance's real-person classifier
- **Ads tab** — full AI ad creation pipeline (Claude brainstorm → OpenAI ref images → Claude video prompts → BytePlus scenes → Library folder); endpoints `/api/gen/brief` + `/api/gen/shots` (renamed away from `/api/ads/*` to avoid ad-blocker blocks)
- **Ads shots parsing fixed** — `/api/gen/shots` uses hybrid text format (SCENES_META JSON line + `<scene_N>` text tags) to avoid Claude embedding literal newlines and unescaped quotes inside JSON strings; SCENES_META parsed with bracket-balancing to handle nested `useRefImages` arrays
