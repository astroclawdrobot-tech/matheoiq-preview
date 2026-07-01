const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8788);

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
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
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, JSON.stringify({ ok: true, app: 'matheoiq-medico-movil-command-hub', mode: 'live-preview', externalActions: 'disabled' }, null, 2));
  }
  if (req.method === 'GET' && url.pathname === '/api/live-readiness') {
    const readiness = buildReadiness();
    return send(res, readiness.ok ? 200 : 503, JSON.stringify(readiness, null, 2));
  }
  if (req.method === 'POST' && ['/api/dispatch/live', '/api/payments/capture', '/api/patients/write'].includes(url.pathname)) {
    return send(res, 403, JSON.stringify({ ok: false, error: 'external_live_action_disabled', message: 'Closed preview only. Real dispatch, payment capture and patient writes require explicit GO and production backend gates.' }, null, 2));
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
