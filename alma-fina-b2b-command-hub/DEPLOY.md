# Alma Fina B2B Command Hub — deployment notes

## App root
- `apps/alma-fina-b2b-command-hub/`

## Runtime
- Node.js
- No external npm dependencies required currently
- Start command:
  ```bash
  npm start
  ```
  or
  ```bash
  node server.js
  ```

## Default local URL
- `http://127.0.0.1:8787/`

## Core routes
- `/`
- `/api/health`
- `/api/buyers`
- `/api/supply`
- `/api/loi/templates`
- `/api/loi/drafts`
- `/api/loi/artifacts`
- `/api/loi/render`
- `/api/loi/render-pdf`

## Deploy recommendation
For this app, prefer a simple Node host such as:
- Railway
- Render
- Fly.io
- a small VPS / container

This is a better fit than a purely static host because the hub now has server routes and backend PDF rendering.

## Minimal deploy steps
1. Upload / push the folder `apps/alma-fina-b2b-command-hub/`.
2. Set app root to that folder.
3. Use Node 18+.
4. Start command: `npm start`.
5. Expose port from `PORT` env if the platform provides one.
6. For protected access, set `AUTH_USERNAME` and `AUTH_PASSWORD` in the deploy platform.

## Notes
- The server already respects `process.env.PORT` and falls back to `8787`.
- Lightweight optional Basic Auth is available via `AUTH_USERNAME` and `AUTH_PASSWORD`.
- Generated LOI files are written into `generated/`.
- Server-saved LOI drafts are written into `data/loi-drafts/`.
- `generated/` and `data/loi-drafts/` are ignored by git.

## Before public deployment
- confirm final contact email
- confirm final WhatsApp number if you add it into future modules
- review any remaining placeholder buyer or commercial text
- decide whether the hub stays internal-only or gets authenticated access later
