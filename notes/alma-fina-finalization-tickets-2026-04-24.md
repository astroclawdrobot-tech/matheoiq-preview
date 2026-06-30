# Alma Fina finalization tickets

Last update: 2026-04-24

## Legend
- `done_local` = finished in workspace, waiting push/deploy if needed
- `done_remote` = pushed to GitHub or otherwise confirmed outside local workspace
- `blocked_external` = needs token, domain, final contact data, or platform action
- `ready_next` = next actionable ticket once blockers are removed
- `in_progress` = currently being worked

## Hub / internal app

### AF-HUB-001 — Push latest hub changes to GitHub
- Status: `done_remote`
- Scope completed:
  - buyer tracker → `Use in LOI`
  - Alma Fina logo in hub
  - Alma Fina logo in LOI HTML render
  - premium control-center refresh
  - transport estimator
  - soft-ui / glassmorphism refresh
- Confirmed remote commits include:
  - `c66c003` — Alma Fina finalization bundle
  - `2f088b0` — test contact routing
  - `48a78f2` — design-system refresh
  - `4a5199f` — shipping estimator
  - `0756861` — soft UI dashboard refresh
- Done when:
  - commits are on `gazoorobot/gazoo` (confirmed)

### AF-HUB-002 — Confirm Railway with latest hub build
- Status: `in_progress`
- Depends on: `AF-HUB-001`
- Current state:
  - `https://gazoo-production.up.railway.app/api/health` returns `ok: true`
  - root `/` still requires Basic Auth
  - visual confirmation of the latest UI is still blocked by missing production Basic Auth credentials in workspace
- Done when:
  - the hub is opened after auth
  - the soft-ui refresh, module map, power meter, and transport estimator are visually confirmed in production

### AF-HUB-003 — Live QA of the LOI workflow
- Status: `ready_next`
- Depends on: `AF-HUB-002`
- Checklist:
  - login works
  - buyer row shows `Use in LOI`
  - LOI prefill works
  - HTML draft opens
  - PDF render works
  - draft save works
  - recent artifacts refresh works

### AF-HUB-004 — UX polish pass for internal beta
- Status: `done_local`
- Scope executed locally:
  - strengthened selected buyer highlight
  - added selected buyer execution card
  - made primary CTA path more obvious (`Use in LOI`, `Generate Email`, `Copy test brief`)
  - tightened copy around LOI/source linkage
- Needs push/redeploy to appear in production

### AF-HUB-005 — Add visible commercial status model in UI
- Status: `done_local`
- Scope executed locally:
  - visible buyer execution status card in tracker
  - route language display
  - next-action display
  - test brief generation for approval-first handling
- Note:
  - live multi-status progression (`approved`, `test_sent`, `replied`, `won/lost`) still needs real workflow wiring later

### AF-HUB-006 — Add UI entry point for test-send
- Status: `ready_next`
- Scope:
  - expose controlled `test-send` from hub UI
  - keep approval-first behavior

## Public site / web

### AF-SITE-001 — Logo asset finalization in deployable site
- Status: `done_local`
- Scope:
  - deployable logo asset added to `site/alma-fina/assets/alma-fina-logo.jpg`
  - favicon set in public site HTML
- Done when:
  - pushed and deployed on Vercel

### AF-SITE-002 — Confirm public contact details
- Status: `blocked_external`
- Executed locally:
  - surfaced `contact@almafina.mx`
  - surfaced `sales@almafina.mx`
  - centralized WhatsApp and email contact links in site JS
- Remaining blocker:
  - final WhatsApp number confirmation

### AF-SITE-003 — Push latest public site to GitHub / deploy target
- Status: `done_remote`
- Depends on: `AF-SITE-002` plus GitHub push
- Current state:
  - latest site files are already in `gazoorobot/gazoo`
  - production publish is still pending on Vercel
- Done when:
  - deploy target is updated

### AF-SITE-004 — Vercel deployment + domain connection
- Status: `blocked_external`
- Needs:
  - Vercel access
  - DNS connection for `almafina.mx`
- Done when:
  - production domain resolves with HTTPS

### AF-SITE-005 — Public site QA
- Status: `ready_next`
- Depends on: `AF-SITE-004`
- Scope:
  - mobile
  - desktop
  - FR/EN/ES/PT copy alignment
  - CTA and WhatsApp links
  - logo rendering

## Launch / ops follow-up

### AF-OPS-001 — Railway live access pack for morning validation
- Status: `blocked_external`
- Needs:
  - production Basic Auth username/password for the hub
- Done when:
  - live UI behind auth is checked against the QA list

### AF-OPS-002 — Public contact cutover decision
- Status: `blocked_external`
- Needs:
  - confirmation whether to keep internal test inbox temporarily or switch site/hub defaults to `contact@almafina.mx` and `sales@almafina.mx`
  - final public WhatsApp number confirmation
- Done when:
  - all public-facing contact constants match the approved production contacts

### AF-OPS-003 — Outbound email provider connection
- Status: `blocked_external`
- Needs:
  - provider choice (`Resend`, `Google Workspace SMTP`, or `Postmark`)
  - credentials / DNS records for SPF, DKIM, and ideally DMARC
- Done when:
  - allowlisted test send succeeds

### AF-OPS-004 — Overnight launch readiness prep
- Status: `done_local`
- Scope completed:
  - launch readiness report script added at `scripts/check_alma_fina_launch_readiness.py`
  - tomorrow-morning runbook added for access handoff and launch order

## Executed during this ticket pass
- Converted the remaining finalization work into explicit tickets.
- Captured dependencies and blockers so we stop mixing local work with deploy/platform work.
- Prepared a separate QA checklist file for live validation after push/redeploy.
- Executed a stronger hub polish pass locally with a selected buyer execution card and a clearer Buyer → LOI workflow.
- Executed a stronger public-site contact pass locally with centralized email / WhatsApp links and visible B2B contact emails in the CTA/footer.
- Updated the board after the GitHub push and Railway health check so the remaining blockers are now only access, deployment, and final production-contact decisions.
