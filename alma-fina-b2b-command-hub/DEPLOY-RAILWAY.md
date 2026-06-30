# Alma Fina B2B Command Hub — Railway quick deploy

## Recommended path
Use Railway with a GitHub repo if possible.

## Preferred deploy shapes
### Option A, direct app folder
- root directory: `alma-fina-b2b-command-hub` in the GitHub repo used for Railway

### Option B, root-level wrapper (best when Railway mobile/UI hides Root Directory)
- put the files from `repo-root-template/` at the GitHub repo root
- keep the app in `alma-fina-b2b-command-hub/`
- then Railway can deploy from repo root with no special Root Directory field
- this wrapper now also includes a root `Dockerfile` fallback, which is often the most reliable path if Railpack build-plan detection fails

## Runtime
- Node 18+
- Start command: `npm start`

## Required env vars
- `AUTH_USERNAME`
- `AUTH_PASSWORD`

## Recommended env vars
- `ALMAFINA_REPLY_EMAIL=sales@almafina.mx` for the current approved B2B reply path

## Optional env vars
- `PORT` is provided automatically by Railway
- `OTEL_SERVICE_NAME=alma-fina-b2b-command-hub`
- `OTEL_ENABLED=1`
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=...` for Grafana Cloud traces
- `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic ...`

## Railway dashboard flow
1. Push the project to GitHub.
2. In Railway, click **New Project**.
3. Choose **Deploy from GitHub repo**.
4. Select the repo.
5. If Railway exposes **Root Directory**, set it to:
   - `alma-fina-b2b-command-hub`
6. If Railway does **not** expose Root Directory, use the root-level wrapper files from `repo-root-template/` (or the generated export pack).
7. If Railway keeps failing with Railpack/build-plan detection, prefer the root wrapper with its `Dockerfile` fallback.
8. Confirm the start command is:
   - `npm start`
9. Add environment variables:
   - `AUTH_USERNAME=...`
   - `AUTH_PASSWORD=...`
   - `ALMAFINA_REPLY_EMAIL=sales@almafina.mx`
10. Deploy.
11. Open the generated Railway URL.
12. Confirm:
   - browser asks for Basic Auth
   - `/api/health` returns JSON
   - `/metrics` returns Prometheus text after auth
   - app loads after auth
   - if OTEL is enabled, traces appear in Grafana Cloud / Tempo

## Railway CLI flow (alternative)
If using CLI instead of GitHub deploy:

```bash
npm install -g @railway/cli
railway login
cd apps/alma-fina-b2b-command-hub
railway init
railway up
railway variables set AUTH_USERNAME=almafina
railway variables set AUTH_PASSWORD=change-me
```

Then open the Railway-provided domain and test access.

## Post-deploy checklist
- root page asks for auth
- LOI draft HTML render works
- LOI PDF render works
- saved drafts work
- recent artifacts list works

## Notes
- This app is better on Railway than on Vercel because it uses a persistent Node backend.
- A root-deploy export can be generated with:
  - `python3 scripts/build_command_hub_repo_root_export.py`
- Keep the credentials strong before sharing the URL.
