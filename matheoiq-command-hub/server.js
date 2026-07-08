const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8788);
const STARTED_AT = new Date();
const counters = { requests: 0, blockedExternalActions: 0 };

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function summarizeQueue(queue) {
  const rows = queue.queue || [];
  return {
    total: rows.length,
    byChannel: rows.reduce((acc, row) => ({ ...acc, [row.channel]: (acc[row.channel] || 0) + 1 }), {}),
    blocked: rows.filter(row => String(row.status).includes('blocked')).length,
    readyForReview: rows.filter(row => String(row.status).includes('ready')).length,
    externalWrites: 0
  };
}

function blockedAction(action, extra = {}) {
  counters.blockedExternalActions += 1;
  return {
    ok: false,
    action,
    error: 'external_live_action_disabled',
    message: 'Command Hub parity endpoint is active, but real email/WhatsApp/patient writes stay blocked until provider credentials, legal/compliance review and explicit GO are validated.',
    confirmationRequired: 'SEND_LIVE_MATHEOIQ_MEDICAL',
    externalWrites: 0,
    ...extra
  };
}

function metrics() {
  return [
    '# HELP matheoiq_hub_requests_total Total HTTP requests handled by the command hub.',
    '# TYPE matheoiq_hub_requests_total counter',
    `matheoiq_hub_requests_total ${counters.requests}`,
    '# HELP matheoiq_hub_blocked_external_actions_total External/live actions blocked by safety gates.',
    '# TYPE matheoiq_hub_blocked_external_actions_total counter',
    `matheoiq_hub_blocked_external_actions_total ${counters.blockedExternalActions}`,
    '# HELP matheoiq_hub_uptime_seconds Command hub process uptime in seconds.',
    '# TYPE matheoiq_hub_uptime_seconds gauge',
    `matheoiq_hub_uptime_seconds ${Math.floor((Date.now() - STARTED_AT.getTime()) / 1000)}`,
    ''
  ].join('\n');
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': payload.length,
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function mime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function buildReadiness() {
  const clinics = readJson('data/clinics.json');
  const doctors = readJson('data/doctors.json');
  const queue = readJson('data/dispatch-queue.json');
  const readiness = readJson('data/live-readiness.json');
  const blocksReady = readiness.priorityBlocks.filter(block => block.ready).length;
  const externalBlocked = Object.values(readiness.externalActions).every(value => String(value).includes('disabled') || String(value).includes('blocked'));
  return {
    ok: blocksReady === readiness.priorityBlocks.length && externalBlocked,
    ...readiness,
    checkedAt: new Date().toISOString(),
    summary: {
      ...readiness.summary,
      criticalBlocksReady: blocksReady,
      criticalBlocksTotal: readiness.priorityBlocks.length,
      clinicsRows: clinics.clinics.length,
      doctorsRows: doctors.doctors.length,
      dispatchQueueRows: queue.queue.length,
      blockedRedFlagRows: queue.queue.filter(row => row.status === 'triage_blocked' || row.urgency === 'red_flag').length,
      doctorsBlockedUntilCredentialed: doctors.doctors.filter(row => String(row.status).includes('blocked')).length
    }
  };
}

function handler(req, res) {
  counters.requests += 1;
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, JSON.stringify({ ok: true, app: 'matheoiq-medico-movil-command-hub', mode: 'live-preview', hubContract: 'alma-fina-command-hub-parity', externalActions: 'disabled' }, null, 2));
  }
  if (req.method === 'GET' && url.pathname === '/metrics') {
    return send(res, 200, metrics(), 'text/plain; version=0.0.4; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/api/live-readiness') {
    const readiness = buildReadiness();
    return send(res, readiness.ok ? 200 : 503, JSON.stringify(readiness, null, 2));
  }
  if (req.method === 'GET' && url.pathname === '/api/outreach/queue') {
    const queue = readJson('data/outreach-queue.json');
    return send(res, 200, JSON.stringify({ ok: true, ...queue, summary: summarizeQueue(queue) }, null, 2));
  }
  if (req.method === 'GET' && url.pathname === '/api/outreach/ready-approval') {
    const approvals = readJson('data/ready-approval.json');
    return send(res, 200, JSON.stringify({ ok: true, ...approvals, total: (approvals.approvals || []).length }, null, 2));
  }
  if (req.method === 'POST' && url.pathname === '/api/outreach/actions/approve') {
    return send(res, 200, JSON.stringify({ ok: true, action: 'approve', status: 'approval_recorded_in_preview_only', liveAllowed: false, externalWrites: 0, nextRequiredConfirmation: 'SEND_LIVE_MATHEOIQ_MEDICAL' }, null, 2));
  }
  if (req.method === 'POST' && url.pathname === '/api/outreach/actions/send-test') {
    return send(res, 403, JSON.stringify(blockedAction('send-test', { mode: 'test_send_requires_bound_provider_credentials' }), null, 2));
  }
  if (req.method === 'POST' && url.pathname === '/api/outreach/actions/send-live') {
    return send(res, 403, JSON.stringify(blockedAction('send-live', { mode: 'live_send_requires_explicit_go' }), null, 2));
  }
  if (req.method === 'POST' && ['/api/dispatch/live', '/api/payments/capture', '/api/patients/write'].includes(url.pathname)) {
    return send(res, 403, JSON.stringify(blockedAction(url.pathname), null, 2));
  }
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
  const filePath = path.resolve(ROOT, rel);
  if (!filePath.startsWith(ROOT)) return send(res, 400, JSON.stringify({ ok: false, error: 'invalid_path' }));
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, JSON.stringify({ ok: false, error: 'not_found' }));
    send(res, 200, data, mime(filePath));
  });
}

http.createServer(handler).listen(PORT, () => {
  console.log(JSON.stringify({ event: 'server_started', app: 'matheoiq-medico-movil-command-hub', port: PORT, externalActions: 'disabled' }));
});
