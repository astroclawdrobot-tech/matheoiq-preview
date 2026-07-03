# Alma Fina → MatheoIQ Medical / Vet — Hub Structure Audit

Date: 2026-07-03

## Scope
Reference audited: `projects/matheoiq-preview/alma-fina-b2b-command-hub` and live `https://gazoo-alma-fina.up.railway.app`.
Compared against:
- `projects/matheoiq-preview/matheoiq-command-hub`
- `projects/matheoiq-medical-clone`
- `projects/matheo-iq-veterinary/app/frontend`
- live `https://matheoiq.mx`
- live `https://vet.matheoiq.mx`

## Alma Fina reference structure
Local reference has a full B2B command hub shape:
- Auth: `/login`, `/logout`
- Static app: `/`, `/index.html`, `/assets/*`, `/generated/*`
- Health/ops: `/api/health`, `/metrics`, local `/api/live-readiness`
- CRM/data: `/api/leads`, `/api/leads/summary`, `/api/buyers`, `/api/buyers/export`, `/api/supply`
- Inbox: `/api/inbox/events`, `/api/inbox/summary`, `/api/inbox/sync`
- Outreach queue/actions: `/api/outreach/queue`, `/api/outreach/ready-approval`, `/api/outreach/actions/approve`, `/api/outreach/actions/send-test`, `/api/outreach/actions/send-live`
- LOI workflow: `/api/loi/templates`, `/api/loi/drafts`, `/api/loi/render`, `/api/loi/render-pdf`, `/api/loi/artifacts`
- Data files: buyers, canonical leads, inbox events/state, outreach CSV, ready approvals, supply.

## Alma live deploy state
Live login works with `alma/fina`.
Live routes verified after auth:
- `/`, `/index.html`: 200
- `/api/health`: 200, reports `mode: light-backend`
- `/api/outreach/queue`: 200
- `/api/outreach/ready-approval`: 200
- `/api/leads/summary`: 200
- `/api/buyers`: 200
- `/api/supply`: 200
- `/metrics`: 200
- `/api/live-readiness`: 404 on live, although local source contains it.

Conclusion: Alma live is mostly operational, but deployed backend is a partial/light variant missing live-readiness.

## MatheoIQ Medical comparison
`projects/matheoiq-preview/matheoiq-command-hub` is not a one-to-one Alma clone. It is a minimal command-hub preview:
- endpoints: `/`, `/api/health`, `/api/live-readiness`
- data: clinics, doctors, dispatch queue, live readiness
- no equivalent outreach send-test/send-live/approve backend
- no LOI workflow
- no buyers/supply/inbox model

`projects/matheoiq-medical-clone` and live `matheoiq.mx` do contain broad SaaS/product surfaces:
- `/saas-app/`, `/saas-app/whatsapp/`, `/saas-app/credenciales/`, `/saas-app/agenda/`: live 200
- `/sales-hub/`: protected, redirects to admin access
- `/api/health`, `/api/live-readiness`: protected with `PRIVATE_APP_ADMIN_REQUIRED`
- Strong signals exist for WhatsApp, email, templates, queues, credentials, Stripe, Facturapi, CFDI, admin, owner, sales hub, no-live/external-writes gates.

Conclusion: Medical replicated the SaaS/ops principles and gating, but not the full Alma B2B command-hub backend as a clean one-to-one structure.

## Vet comparison
`projects/matheo-iq-veterinary/app/frontend` has a SaaS Vet structure with strong Medical parity:
- `/saas-vet/`, `/saas-vet/whatsapp/`, `/saas-vet/credenciales/`: live 200
- `/app-clinica/whatsapp`: live 200
- `/api/health`: live 200
- `VetSaasWorkspacePage.jsx` maps Vet modules to `medicalSource` routes such as `/saas-app/`, `/saas-app/whatsapp/`, `/saas-app/credenciales/`, `/saas-app/agenda/`.
- Strong signals exist for WhatsApp, queues, outreach, credentials, Stripe, Facturapi, CFDI, admin/owner/sales hub.

Conclusion: Vet is structurally replicated from the Medical SaaS app layer, not directly from Alma Fina B2B command hub. It has UI/module parity and some operational signals, but does not expose the Alma-style outreach backend routes as a command hub.

## Main finding
The Alma Fina hub was used more as an operational pattern/reference than as a strict code/route template for `matheoiq.mx` and `vet.matheoiq.mx`.

If the intended target is “same hub architecture everywhere,” then Medical and Vet need a dedicated command-hub backend layer with at least:
- `/login`, `/logout`
- `/api/health`
- `/api/live-readiness`
- `/metrics`
- `/api/outreach/queue`
- `/api/outreach/ready-approval`
- `/api/outreach/actions/approve`
- `/api/outreach/actions/send-test`
- `/api/outreach/actions/send-live`
- data files or DB tables equivalent to queue, approvals, inbox/events, templates
- provider gates for SMTP/Resend and WhatsApp/Twilio/Meta

## Patch applied after audit
Minimal parity patch applied without changing public navigation:

### Medical preview command hub
`projects/matheoiq-preview/matheoiq-command-hub` now exposes Alma-like command hub contracts:
- `/api/health` with `hubContract: alma-fina-command-hub-parity`
- `/api/live-readiness`
- `/metrics`
- `/api/outreach/queue`
- `/api/outreach/ready-approval`
- `/api/outreach/actions/approve`
- `/api/outreach/actions/send-test` blocked with `external_live_action_disabled`
- `/api/outreach/actions/send-live` blocked with `external_live_action_disabled`

Smoke: `npm run smoke` → `SMOKE_MATHEOIQ_MEDICO_MOVIL_LIVE_READINESS_OK`.

### Medical live API repo
`projects/matheoiq-medical-clone/services/api` already had most Alma sales-hub routes. Added the missing parity pieces:
- `/api/live-readiness`
- `/api/outreach/ready-approval`
- `hubContract: alma-fina-command-hub-parity` on `/api/health`
- explicit `privateAppAdminGate` protection for `/api/live-readiness`

Local HTTP verification:
- `/api/live-readiness` without admin cookie → 401
- with local admin cookie: `/api/health`, `/api/live-readiness`, `/api/outreach/queue`, `/api/outreach/ready-approval` → 200

### Vet backend
`projects/matheo-iq-veterinary/app/backend` now has authenticated Vet command hub parity endpoints:
- `/api/vet/command-hub/health`
- `/api/vet/command-hub/live-readiness`
- `/api/vet/command-hub/outreach/queue`
- `/api/vet/command-hub/outreach/ready-approval`
- `/api/vet/command-hub/outreach/actions/approve`
- `/api/vet/command-hub/outreach/actions/send-test` blocked
- `/api/vet/command-hub/outreach/actions/send-live` blocked

Verification:
- `python -m py_compile app/api/routes/vet_command_hub.py app/main.py` OK
- FastAPI OpenAPI route presence check OK
- Broader existing Vet static tests still have unrelated pre-existing frontend expectation failures; the new backend router compiles and is exposed.

## Remaining deploy note
Deploy/restart is still needed for live `matheoiq.mx` and `vet.matheoiq.mx` to expose the new backend routes publicly behind their existing auth gates.
