# Alma Fina B2B Command Hub — scaffold

## Files
- `apps/alma-fina-b2b-command-hub/index.html`
- `apps/alma-fina-b2b-command-hub/server.js`
- `apps/alma-fina-b2b-command-hub/start.js`
- `apps/alma-fina-b2b-command-hub/observability.js`
- `apps/alma-fina-b2b-command-hub/.env.example`
- `apps/alma-fina-b2b-command-hub/GRAFANA.md`
- `apps/alma-fina-b2b-command-hub/repo-root-template/`
- `apps/alma-fina-b2b-command-hub/data/buyers.json`
- `apps/alma-fina-b2b-command-hub/data/canonical-leads.json`
- `apps/alma-fina-b2b-command-hub/data/supply.json`
- `apps/alma-fina-b2b-command-hub/data/inbox-events.json`
- `apps/alma-fina-b2b-command-hub/data/inbox-sync-state.json`
- `apps/alma-fina-b2b-command-hub/hub_mail_ops.py`
- `apps/alma-fina-b2b-command-hub/email-templates/`

## Status
Internal beta scaffold based on the original prototype, but cleaned for safer next-step development.

## Live readiness / priority blocks
The hub now exposes `GET /api/live-readiness` as the single go-live gate.

Critical internal blocks verified by the smoke test:
- Dashboard UI and `/api/health`
- Buyer pipeline and canonical lead data
- Supply dashboard
- Outreach queue and next-wave approval file
- Inbox guardrails for bounces / unsubscribe / wrong contact / no-fit
- LOI HTML/PDF generator
- Prometheus metrics at `/metrics`

Public/live exposure remains blocked until these environment-level items are configured:
- `AUTH_USERNAME` + `AUTH_PASSWORD` (or `ALMAFINA_HUB_USERNAME` + `ALMAFINA_HUB_PASSWORD`)
- SMTP/IMAP credentials for test/live send and inbox sync
- `ALMAFINA_PUBLIC_URL` or `RAILWAY_PUBLIC_DOMAIN`
- `ALMAFINA_LIVE_SEND_ENABLED=1` only after legal/provider/manual approval checks

Live email send has two safety gates: the environment flag above and a per-request confirmation body `confirm: "SEND_LIVE_ALMAFINA"`. Without both, the API returns a guardrail error and sends nothing.

Run the full local gate:
```bash
npm run smoke:live-readiness
```

## What was changed
- Removed direct frontend dependency on Anthropic API calls
- Replaced AI features with local scaffold outputs / mock logic
- Replaced earlier placeholder LOI behavior with working backend HTML/PDF rendering plus frontend fallback
- Softened LOI default fields to avoid unverified claims being preloaded as facts
- Updated seller signature default to `Mathieu Delorme`

## Current behavior
### LOI Generator
- now renders a dynamic buyer-safe LOI draft from the current form values
- first tries the backend route `POST /api/loi/render`
- falls back to local frontend rendering if the backend is absent
- opens the rendered draft in a new window for review / print-to-PDF
- can also request a server-side PDF through `POST /api/loi/render-pdf`
- can save drafts locally in browser storage and reload them from the sidebar

### Buyer Outreach Tracker
- now uses a first batch of real queue-backed buyer rows instead of only conceptual demo accounts
- buyer rows are now derived from a canonical lead artifact built from the classified inbound master plus queue overlay
- generates local draft email output without live AI
- CSV export works in-browser from the loaded buyer set
- buyer rows can now prefill the LOI form through a direct `Use in LOI` bridge
- selected buyer execution card now exposes approval-first controls: approve row, send internal test, and send live for approved rows
- reply-watch V1 is available: manual inbox event intake for replies, sample / analytical requests, wrong-contact notes, unsubscribes, and bounces
- Gmail auto-intake V1 is available through a hub-triggered sync path that reads the mailbox over IMAP, classifies common reply / bounce / unsubscribe / sample / analytical signals, and appends matched inbox events
- Phase B guardrails now feed inbox outcomes back into the queue: bounce / wrong-contact / unsubscribe / no-fit events re-arm manual approval and live-send is blocked when the latest inbox signal says the contact should not be mailed again yet
- Phase B V2 strengthens inbox matching: replies can now match by stored outbound message-id thread reference, direct address hit, or unique company-domain fallback when a buyer answers from a different mailbox on the same domain
- Manual inbox events now also re-apply queue guardrails immediately, so logging an unsubscribe / wrong-contact / no-fit event in the hub updates the queue state without waiting for the next Gmail sync
- ultra-short cold-email assets now exist in EN / ES / FR, with self-contained app templates plus workspace HTML copies for tighter first-touch outreach
- `hub_mail_ops.py` can now switch to the ultra-short HTML path when the queue/template metadata includes markers like `ultra-short`, `ultra short`, or `ultrashort`
- live queue sync reads the top-10 outreach queue and falls back to `data/outreach-queue.csv`, so clean Railway/GitHub exports stay self-contained

### Supply Dashboard
- now uses confirmed operating data instead of speculative harvest placeholders
- focuses on inventory, lead base, queue status, channel mix, top countries, and operating milestones
- uses local advisory text instead of direct AI calls

### LOI draft persistence
- drafts still save locally in the browser for offline fallback
- when the backend is available, drafts are also saved server-side under `data/loi-drafts/`
- the frontend merges server drafts and local drafts in the saved-drafts list

### LOI artifacts
- generated HTML and PDF artifacts are indexed through `GET /api/loi/artifacts`
- the frontend now shows recent generated LOI files with direct open links
- backend-generated files continue to live under `generated/`

### Lightweight auth
- optional Basic Auth is available through environment variables
- set `AUTH_USERNAME` and `AUTH_PASSWORD` (or `ALMAFINA_HUB_USERNAME` / `ALMAFINA_HUB_PASSWORD`)
- when those variables are absent, auth stays disabled for local/internal work
- `/api/health` stays reachable and reports whether auth is enabled

### Observability / Grafana
- `GET /metrics` now exposes Prometheus-format metrics
- request logs are emitted as structured JSON lines to stdout
- `GET /api/health` reports current observability state
- optional OTLP tracing can be enabled with `OTEL_*` variables for Grafana Tempo / Grafana Cloud
- see `GRAFANA.md` for setup notes

### Railway root deploy fallback
- `repo-root-template/` contains root-level `package.json`, `railway.json`, `Dockerfile`, and `.dockerignore` files for GitHub repos where Railway cannot easily set `Root Directory`
- this gives a deterministic Dockerfile-based fallback when Railpack build-plan detection is flaky
- `python3 scripts/build_command_hub_repo_root_export.py` generates a clean export pack that is deployable from repo root

## Lightweight backend
A dependency-free Node server now exists with first routes:
- `GET /api/health`
- `GET /api/buyers`
- `GET /api/buyers/export`
- `GET /api/leads`
- `GET /api/leads/summary`
- `GET /api/supply`
- `GET /api/outreach/queue`
- `GET /api/inbox/events`
- `GET /api/inbox/summary`
- `POST /api/inbox/events`
- `POST /api/inbox/sync`
- `POST /api/outreach/actions/approve`
- `POST /api/outreach/actions/send-test`
- `POST /api/outreach/actions/send-live`
- `GET /api/loi/templates`
- `GET /api/loi/drafts`
- `POST /api/loi/drafts`
- `GET /api/loi/artifacts`
- `POST /api/loi/render`
- `POST /api/loi/render-pdf`

Run locally:
```bash
node apps/alma-fina-b2b-command-hub/server.js
```

Then open:
- `http://127.0.0.1:8787/`

## Next product step
Best next evolution is to deepen the backend and operator workflow with additions such as:
- richer buyer status progression backed by real workflow state
- stronger reply threading across multi-message conversations
- richer do-not-contact lifecycle beyond the first guardrail block
- `POST /api/ai/negotiation-tips`
- `POST /api/ai/outreach-email`

## Lead dataset refresh helper
Rebuild the hub lead layer from the latest classified inbound files:

```bash
python3 scripts/build_hub_lead_dataset.py
```

This regenerates:
- `data/canonical-leads.json`
- `data/buyers.json`
- `data/supply.json`
- `leads/inbound/hub-lead-classification-summary-2026-04-29.md`

The inbox reply tracker is stored separately in:
- `data/inbox-events.json`
- `data/inbox-sync-state.json`

Those files are append/update oriented and are not regenerated by the lead-build script.

## Ultra-short outreach assets
Plain-text variants live at:
- `leads/outreach-messages-ultra-short-en-es-fr-2026-04-29.md`

Email-safe HTML variants live at:
- `outreach/email-html/alma-fina-b2b-email-safe-ultra-short-en-2026-04-29.html`
- `outreach/email-html/alma-fina-b2b-email-safe-ultra-short-es-2026-04-29.html`
- `outreach/email-html/alma-fina-b2b-email-safe-ultra-short-fr-2026-04-29.html`

App-local bundled copies live at:
- `email-templates/alma-fina-b2b-email-safe-ultra-short-en.html`
- `email-templates/alma-fina-b2b-email-safe-ultra-short-es.html`
- `email-templates/alma-fina-b2b-email-safe-ultra-short-fr.html`

## Related files
- `prototypes/alma-fina-b2b-hub/README.md`
- `prototypes/alma-fina-b2b-hub/loi-buyer-safe-v1-2026-04-22.html`
- `prototypes/alma-fina-b2b-hub/loi-thorne-buyer-safe-v1-2026-04-22.html`
- `exports/alma-fina-loi-thorne-buyer-safe-v1-2026-04-22.pdf`
