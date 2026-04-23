# Seedance Studio — Claude Code Handoff

## What this project is
A web app that lets you generate AI videos using the BytePlus ModelArk API (Seedance 2.0 by ByteDance).
It has a Generate tab and a Library tab. The backend is a Node.js proxy server to avoid CORS issues.

## Current file structure
```
seedance-studio/
├── server.js              — Node.js proxy server (no dependencies)
├── seedance-studio.html   — Full frontend (single file, vanilla JS)
└── HANDOFF.md             — This file
```

## How it works
1. User opens http://localhost:3000
2. Frontend sends API calls to /proxy/api/v3/...
3. server.js forwards them to https://ark.ap-southeast.bytepluses.com/api/v3/...
4. BytePlus processes and returns results

## API used
- Provider: BytePlus ModelArk (ByteDance)
- Base URL: https://ark.ap-southeast.bytepluses.com/api/v3
- Auth: Bearer token in Authorization header
- Model: dreamina-seedance-2-0-260128 (Standard) or dreamina-seedance-2-0-fast-260128 (Fast)

## Key API endpoints
1. POST /api/v3/files — Upload reference images/videos (multipart/form-data, purpose: "user_data")
2. POST /api/v3/content_generation/tasks — Create video generation task
3. GET  /api/v3/content_generation/tasks/:id — Poll task status

## Task creation payload
```json
{
  "model": "dreamina-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "your prompt" },
    { "type": "image_url", "image_url": { "url": "file://file-id-here" }, "role": "reference_image" },
    { "type": "video_url", "video_url": { "url": "file://file-id-here" }, "role": "reference_video" }
  ],
  "generate_audio": true,
  "ratio": "9:16",
  "duration": 15,
  "watermark": false,
  "size": "720x1280"
}
```

## Size mapping (resolution + ratio → size string)
```
720p:  9:16=720x1280  16:9=1280x720  1:1=960x960  4:3=960x720  3:4=720x960  21:9=1280x544
480p:  9:16=480x864   16:9=864x480   1:1=640x640  4:3=640x480  3:4=480x640  21:9=864x368
1080p: 9:16=1080x1920 16:9=1920x1080 1:1=1440x1440 4:3=1440x1080 3:4=1080x1440 21:9=1920x816
```

## Pricing (BytePlus resource pack rate)
- Without video input: $7.00/M tokens
- With video input: $4.30/M tokens  
- Token formula: (inputVideoDuration + outputDuration) × width × height × 24fps / 1024
- Example: 15s 720p 9:16 text-only = ~$2.26, with video ref = ~$1.39

## Known bugs fixed so far
1. ✅ Upload was sending JSON with base64 — fixed to multipart/form-data
2. ✅ Wrong purpose value "assistants" — fixed to "user_data"
3. ✅ Invalid "resolution" param in task creation — removed, now uses "size" string
4. ✅ CORS error from file:// — fixed by adding proxy server

## What still needs testing / possible issues
- Video URL extraction from task response: we try d.content?.[0]?.video_url?.url — may need adjustment based on actual response shape
- The "size" parameter may or may not be accepted by the content_generation API — needs testing
- If task creation still fails, log the full response body and check which field is invalid

## Suggested next improvements
- Add a proper loading state per-generation in the library
- Add ability to copy video URL
- Add error retry button
- Consider adding a simple .env file for the API key instead of entering it in the UI every time
- Consider hosting on a simple VPS so it's accessible from phone without running Node locally

## How to run
```bash
node server.js
# then open http://localhost:3000
```
No npm install needed — uses only built-in Node.js modules (http, https, fs, path, url).
