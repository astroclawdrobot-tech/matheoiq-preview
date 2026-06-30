const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { spawnSync } = require('child_process');
const { getObservabilityState } = require('./observability');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DRAFTS_DIR = path.join(DATA_DIR, 'loi-drafts');
const GENERATED_DIR = path.join(ROOT, 'generated');
const CANONICAL_LEADS_PATH = path.join(DATA_DIR, 'canonical-leads.json');
const APP_OUTREACH_QUEUE = path.join(DATA_DIR, 'outreach-queue.csv');
const APP_READY_APPROVAL = path.join(DATA_DIR, 'ready-approval.json');
const APP_INBOX_EVENTS = path.join(DATA_DIR, 'inbox-events.json');
const APP_INBOX_SYNC_STATE = path.join(DATA_DIR, 'inbox-sync-state.json');
const APP_MAIL_OPS_SCRIPT = path.join(ROOT, 'hub_mail_ops.py');
const MAIL_CONFIG_CANDIDATES = [
  process.env.ALMAFINA_EMAIL_BOT_CONFIG,
  path.join(ROOT, 'config', 'email_bot.config.json'),
  path.join(ROOT, '..', 'config', 'email_bot.config.json'),
  path.join(ROOT, '..', '..', 'config', 'email_bot.config.json'),
  path.join(process.cwd(), 'config', 'email_bot.config.json')
].filter(Boolean);
const LOCAL_HTML_TEMPLATE_BY_LANGUAGE = {
  English: path.join(ROOT, 'email-templates', 'alma-fina-b2b-email-safe-v4-en.html'),
  Spanish: path.join(ROOT, 'email-templates', 'alma-fina-b2b-email-safe-v4-es.html'),
  French: path.join(ROOT, 'email-templates', 'alma-fina-b2b-email-safe-v4-fr.html')
};
const LOCAL_ULTRA_SHORT_HTML_TEMPLATE_BY_LANGUAGE = {
  English: path.join(ROOT, 'email-templates', 'alma-fina-b2b-email-safe-ultra-short-en.html'),
  Spanish: path.join(ROOT, 'email-templates', 'alma-fina-b2b-email-safe-ultra-short-es.html'),
  French: path.join(ROOT, 'email-templates', 'alma-fina-b2b-email-safe-ultra-short-fr.html')
};
const WORKSPACE_HTML_TEMPLATE_BY_LANGUAGE = {
  English: [
    path.join(ROOT, '..', '..', 'outreach', 'email-html', 'alma-fina-b2b-email-safe-v4-en-2026-04-29.html'),
    path.join(ROOT, 'outreach', 'email-html', 'alma-fina-b2b-email-safe-v4-en-2026-04-29.html'),
    path.join(process.cwd(), 'outreach', 'email-html', 'alma-fina-b2b-email-safe-v4-en-2026-04-29.html')
  ],
  Spanish: [
    path.join(ROOT, '..', '..', 'outreach', 'email-html', 'alma-fina-b2b-email-safe-v4-es-2026-04-29.html'),
    path.join(ROOT, 'outreach', 'email-html', 'alma-fina-b2b-email-safe-v4-es-2026-04-29.html'),
    path.join(process.cwd(), 'outreach', 'email-html', 'alma-fina-b2b-email-safe-v4-es-2026-04-29.html')
  ],
  French: [
    path.join(ROOT, '..', '..', 'outreach', 'email-html', 'alma-fina-b2b-email-safe-v4-fr-2026-04-29.html'),
    path.join(ROOT, 'outreach', 'email-html', 'alma-fina-b2b-email-safe-v4-fr-2026-04-29.html'),
    path.join(process.cwd(), 'outreach', 'email-html', 'alma-fina-b2b-email-safe-v4-fr-2026-04-29.html')
  ],
  Portuguese: [
    path.join(ROOT, '..', '..', 'outreach', 'email-html', 'alma-fina-b2b-email-safe-whatsapp-final-pt-2026-04-28.html'),
    path.join(ROOT, 'outreach', 'email-html', 'alma-fina-b2b-email-safe-whatsapp-final-pt-2026-04-28.html'),
    path.join(process.cwd(), 'outreach', 'email-html', 'alma-fina-b2b-email-safe-whatsapp-final-pt-2026-04-28.html')
  ]
};
const WORKSPACE_ULTRA_SHORT_HTML_TEMPLATE_BY_LANGUAGE = {
  English: [
    path.join(ROOT, '..', '..', 'outreach', 'email-html', 'alma-fina-b2b-email-safe-ultra-short-en-2026-04-29.html'),
    path.join(ROOT, 'outreach', 'email-html', 'alma-fina-b2b-email-safe-ultra-short-en-2026-04-29.html'),
    path.join(process.cwd(), 'outreach', 'email-html', 'alma-fina-b2b-email-safe-ultra-short-en-2026-04-29.html')
  ],
  Spanish: [
    path.join(ROOT, '..', '..', 'outreach', 'email-html', 'alma-fina-b2b-email-safe-ultra-short-es-2026-04-29.html'),
    path.join(ROOT, 'outreach', 'email-html', 'alma-fina-b2b-email-safe-ultra-short-es-2026-04-29.html'),
    path.join(process.cwd(), 'outreach', 'email-html', 'alma-fina-b2b-email-safe-ultra-short-es-2026-04-29.html')
  ],
  French: [
    path.join(ROOT, '..', '..', 'outreach', 'email-html', 'alma-fina-b2b-email-safe-ultra-short-fr-2026-04-29.html'),
    path.join(ROOT, 'outreach', 'email-html', 'alma-fina-b2b-email-safe-ultra-short-fr-2026-04-29.html'),
    path.join(process.cwd(), 'outreach', 'email-html', 'alma-fina-b2b-email-safe-ultra-short-fr-2026-04-29.html')
  ]
};
const SALUTATION_PLACEHOLDER_BY_LANGUAGE = {
  English: 'Hello [Name],',
  Spanish: 'Hola [Nombre],',
  French: 'Bonjour [Nom],',
  Portuguese: 'Olá [Nome],'
};
const GENERIC_SALUTATION_BY_LANGUAGE = {
  English: 'Hello,',
  Spanish: 'Hola,',
  French: 'Bonjour,',
  Portuguese: 'Olá,'
};
const GREETING_BY_LANGUAGE = {
  English: 'Hello',
  Spanish: 'Hola',
  French: 'Bonjour',
  Portuguese: 'Olá'
};
const SIGNOFF_BY_LANGUAGE = {
  English: 'Best regards,\nMathieu Delorme',
  Spanish: 'Saludos cordiales,\nMathieu Delorme',
  French: 'Bien cordialement,\nMathieu Delorme',
  Portuguese: 'Atenciosamente,\nMathieu Delorme'
};
const TEXT_FALLBACK_BY_LANGUAGE = {
  English: 'I am reaching out to introduce ALMA FINA and explore whether our Brussels sprout powder could be relevant for your ingredient sourcing, product development, or distribution activity.\n\nIf relevant, we can share an analytical data sheet and discuss an evaluation sample under a potential non-binding commercial discussion.',
  Spanish: 'Le escribo para presentar ALMA FINA y explorar si nuestro polvo de coles de Bruselas podría ser relevante para su actividad de abastecimiento de ingredientes, desarrollo de producto o distribución.\n\nSi resulta relevante, podemos compartir una ficha analítica y conversar sobre una muestra para evaluación dentro de una posible conversación comercial no vinculante.',
  French: 'Je vous contacte pour vous présenter ALMA FINA et voir si notre poudre de choux de Bruxelles pourrait être pertinente pour votre activité d\'approvisionnement en ingrédients, de développement produit ou de distribution.\n\nSi cela est pertinent, nous pouvons partager une fiche analytique et échanger sur un échantillon d\'évaluation dans le cadre d\'une discussion commerciale potentielle et non engageante.',
  Portuguese: 'Escrevo para apresentar a ALMA FINA e verificar se o nosso pó de couve-de-bruxelas pode ser relevante para sourcing de ingredientes, desenvolvimento de produto ou distribuição.\n\nSe fizer sentido, podemos compartilhar ficha analítica e conversar sobre uma amostra de avaliação em uma discussão comercial potencial e não vinculante.'
};
const BLOCK_LIVE_SEND_EVENT_TYPES = new Set(['unsubscribe', 'no_fit', 'wrong_contact', 'bounce']);
const DEFAULT_OUTREACH_QUEUE = 'bot-send-queue-high-priority-2026-04-21.csv';
const PRIORITY_OUTREACH_QUEUES = [
  'inbound/top-10-operational-email-queue-2026-04-28.csv',
  DEFAULT_OUTREACH_QUEUE
];
const OUTREACH_QUEUE_CANDIDATES = [
  process.env.ALMAFINA_OUTREACH_QUEUE,
  APP_OUTREACH_QUEUE,
  ...PRIORITY_OUTREACH_QUEUES.flatMap(file => [
    path.join(ROOT, '..', '..', 'leads', file),
    path.join(ROOT, '..', 'leads', file),
    path.join(ROOT, 'leads', file),
    path.join(process.cwd(), 'leads', file)
  ])
].filter(Boolean);
const READY_APPROVAL_CANDIDATES = [
  process.env.ALMAFINA_READY_APPROVAL,
  APP_READY_APPROVAL,
  path.join(ROOT, '..', '..', 'leads', 'inbound', 'top-10-next-wave-clean-2026-04-29.csv'),
  path.join(ROOT, '..', 'leads', 'inbound', 'top-10-next-wave-clean-2026-04-29.csv'),
  path.join(ROOT, 'leads', 'inbound', 'top-10-next-wave-clean-2026-04-29.csv'),
  path.join(process.cwd(), 'leads', 'inbound', 'top-10-next-wave-clean-2026-04-29.csv')
].filter(Boolean);
const PORT = Number(process.env.PORT || 8787);
const AUTH_USERNAME = process.env.AUTH_USERNAME || process.env.ALMAFINA_HUB_USERNAME || '';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || process.env.ALMAFINA_HUB_PASSWORD || '';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'alma-fina-b2b-command-hub';
const AUTH_SESSION_COOKIE = 'almafina_hub_session';
const AUTH_SESSION_SECRET = process.env.AUTH_SESSION_SECRET || crypto.createHash('sha256')
  .update(`${AUTH_USERNAME}:${AUTH_PASSWORD}:${SERVICE_NAME}`)
  .digest('hex');
const REPLY_EMAIL = process.env.ALMAFINA_REPLY_EMAIL || 'sales@almafina.mx';
const OBS_STARTED_AT = Date.now();
const HTTP_DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const COUNTERS = new Map();
const GAUGES = new Map();
const HTTP_DURATION = new Map();
let INFLIGHT_REQUESTS = 0;

function metricSeriesKey(labels) {
  return JSON.stringify(Object.entries(labels || {}).sort(([a], [b]) => a.localeCompare(b)));
}

function labelsToProm(labels) {
  const entries = Object.entries(labels || {}).filter(([, value]) => value !== undefined && value !== '');
  if (!entries.length) return '';
  return '{' + entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${String(value)
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/"/g, '\\"')}"`)
    .join(',') + '}';
}

function incCounter(name, help, labels = {}, amount = 1) {
  const bucket = COUNTERS.get(name) || { help, samples: new Map() };
  bucket.help = help;
  const key = metricSeriesKey(labels);
  const sample = bucket.samples.get(key) || { labels, value: 0 };
  sample.value += amount;
  bucket.samples.set(key, sample);
  COUNTERS.set(name, bucket);
}

function setGauge(name, help, labels = {}, value = 0) {
  const bucket = GAUGES.get(name) || { help, samples: new Map() };
  bucket.help = help;
  const key = metricSeriesKey(labels);
  bucket.samples.set(key, { labels, value });
  GAUGES.set(name, bucket);
}

function observeDuration(labels, seconds) {
  const key = metricSeriesKey(labels);
  const current = HTTP_DURATION.get(key) || {
    labels,
    buckets: Object.fromEntries(HTTP_DURATION_BUCKETS.map(limit => [String(limit), 0])),
    inf: 0,
    sum: 0,
    count: 0
  };

  for (const limit of HTTP_DURATION_BUCKETS) {
    if (seconds <= limit) current.buckets[String(limit)] += 1;
  }
  current.inf += 1;
  current.sum += seconds;
  current.count += 1;
  HTTP_DURATION.set(key, current);
}

function routeLabelFor(pathname) {
  if (pathname.startsWith('/generated/')) return '/generated/:file';
  return pathname;
}

function logEvent(level, event, fields = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    event,
    ...fields
  });
  if (level === 'error') {
    console.error(line);
    return;
  }
  console.log(line);
}

function renderMetrics() {
  const mem = process.memoryUsage();
  const obs = getObservabilityState();
  const outreach = readOutreachQueue();
  const outreachSummary = buildOutreachSummary(outreach.rows);
  const inbox = readInboxEventStore();
  const inboxSummary = buildInboxEventSummary(inbox.events);
  setGauge('almafina_process_uptime_seconds', 'Process uptime in seconds.', {}, process.uptime());
  setGauge('almafina_process_resident_memory_bytes', 'Resident memory usage in bytes.', {}, mem.rss);
  setGauge('almafina_process_heap_used_bytes', 'Heap used in bytes.', {}, mem.heapUsed);
  setGauge('almafina_process_heap_total_bytes', 'Heap total in bytes.', {}, mem.heapTotal);
  setGauge('almafina_http_inflight_requests', 'Current in-flight HTTP requests.', {}, INFLIGHT_REQUESTS);
  setGauge('almafina_observability_info', 'Observability state.', {
    service: SERVICE_NAME,
    auth: authEnabled() ? 'basic' : 'disabled',
    traces: obs.tracingActive ? 'enabled' : (obs.tracingRequested ? 'requested' : 'disabled'),
    exporter: obs.exporter || 'disabled'
  }, 1);
  setGauge('almafina_generated_artifacts_total', 'Current generated HTML/PDF artifacts count.', {}, listLoiArtifacts().length);
  setGauge('almafina_saved_loi_drafts_total', 'Current persisted LOI draft count.', {}, listLoiDrafts().length);
  setGauge('almafina_outreach_queue_rows_total', 'Current outreach queue row count.', {}, outreachSummary.totalRows || 0);
  setGauge('almafina_outreach_email_rows_total', 'Current outreach email row count.', {}, outreachSummary.emailRows || 0);
  setGauge('almafina_outreach_sent_rows_total', 'Current outreach sent row count.', {}, outreachSummary.sentRows || 0);
  setGauge('almafina_outreach_failed_rows_total', 'Current outreach failed row count.', {}, outreachSummary.failedRows || 0);
  setGauge('almafina_outreach_pending_approval_rows_total', 'Current outreach pending-approval row count.', {}, outreachSummary.pendingApprovalRows || 0);
  setGauge('almafina_outreach_blocked_rows_total', 'Current outreach rows blocked by inbox guardrails.', {}, outreachSummary.blockedRows || 0);
  setGauge('almafina_outreach_do_not_contact_rows_total', 'Current outreach rows marked do-not-contact.', {}, outreachSummary.doNotContactRows || 0);
  setGauge('almafina_inbox_events_total', 'Current inbox event count.', {}, inboxSummary.totalEvents || 0);
  setGauge('almafina_inbox_open_events_total', 'Current inbox events requiring handling.', {}, inboxSummary.openEvents || 0);
  setGauge('almafina_inbox_reply_events_total', 'Current inbox reply/interested event count.', {}, inboxSummary.replyRows || 0);
  setGauge('almafina_inbox_sample_request_events_total', 'Current sample-request event count.', {}, inboxSummary.sampleRequestRows || 0);
  setGauge('almafina_inbox_deliverability_events_total', 'Current bounce/unsubscribe event count.', {}, (inboxSummary.unsubscribeRows || 0) + (inboxSummary.bounceRows || 0));

  const lines = [];
  const writeMetricBlock = (name, type, help, samples) => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
    for (const sample of samples) {
      lines.push(`${name}${labelsToProm(sample.labels)} ${sample.value}`);
    }
  };

  for (const [name, bucket] of [...COUNTERS.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    writeMetricBlock(name, 'counter', bucket.help, [...bucket.samples.values()]);
  }

  for (const [name, bucket] of [...GAUGES.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    writeMetricBlock(name, 'gauge', bucket.help, [...bucket.samples.values()]);
  }

  lines.push('# HELP almafina_http_request_duration_seconds HTTP request duration in seconds.');
  lines.push('# TYPE almafina_http_request_duration_seconds histogram');
  for (const sample of [...HTTP_DURATION.values()].sort((a, b) => metricSeriesKey(a.labels).localeCompare(metricSeriesKey(b.labels)))) {
    for (const limit of HTTP_DURATION_BUCKETS) {
      lines.push(`almafina_http_request_duration_seconds_bucket${labelsToProm({ ...sample.labels, le: String(limit) })} ${sample.buckets[String(limit)]}`);
    }
    lines.push(`almafina_http_request_duration_seconds_bucket${labelsToProm({ ...sample.labels, le: '+Inf' })} ${sample.inf}`);
    lines.push(`almafina_http_request_duration_seconds_sum${labelsToProm(sample.labels)} ${sample.sum}`);
    lines.push(`almafina_http_request_duration_seconds_count${labelsToProm(sample.labels)} ${sample.count}`);
  }

  return lines.join('\n') + '\n';
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendFile(res, filePath, type = 'text/html; charset=utf-8') {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { ok: false, error: 'not_found', filePath });
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length
    });
    res.end(data);
  });
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store'
  });
  res.end(html);
}

function sendMetrics(res) {
  const body = renderMetrics();
  res.writeHead(200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function runMailOps(args = []) {
  const python = process.env.PYTHON || 'python3';
  const result = spawnSync(python, [APP_MAIL_OPS_SCRIPT, ...args], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8'
  });

  if (result.error) throw result.error;
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  let payload = null;
  if (stdout) {
    try {
      payload = JSON.parse(stdout);
    } catch (err) {
      throw new Error(`invalid_mail_ops_output: ${stdout}`);
    }
  }
  if (result.status !== 0) {
    const message = payload && payload.error
      ? payload.error
      : (stderr || stdout || `mail_ops_failed_exit_${result.status}`);
    throw new Error(message);
  }
  if (payload && payload.ok === false) {
    throw new Error(payload.error || 'mail_ops_failed');
  }
  return payload || { ok: true };
}

function authEnabled() {
  return Boolean(AUTH_USERNAME && AUTH_PASSWORD);
}

function sendRedirect(res, location, cookie) {
  const headers = {
    Location: location,
    'Cache-Control': 'no-store'
  };
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(302, headers);
  res.end();
}

function sendUnauthorized(res) {
  return sendJson(res, 401, { ok: false, error: 'auth_required', login: '/login' });
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return forwardedProto === 'https' || Boolean(req.socket && req.socket.encrypted);
}

function safeEqual(value, expected) {
  const left = Buffer.from(String(value || ''));
  const right = Buffer.from(String(expected || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function validAuthCredentials(username, password) {
  return safeEqual(username, AUTH_USERNAME) && safeEqual(password, AUTH_PASSWORD);
}

function parseCookies(req) {
  const header = String(req.headers.cookie || '');
  return header.split(';').reduce((acc, part) => {
    const [name, ...rest] = part.split('=');
    const key = String(name || '').trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('=').trim());
    return acc;
  }, {});
}

function authSessionSignature(username) {
  return crypto.createHmac('sha256', AUTH_SESSION_SECRET)
    .update(String(username || ''))
    .digest('hex');
}

function buildAuthSessionCookie(req, username) {
  const token = Buffer.from(`${username}:${authSessionSignature(username)}`).toString('base64url');
  const parts = [
    `${AUTH_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=2592000'
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearAuthSessionCookie(req) {
  const parts = [
    `${AUTH_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function hasValidSession(req) {
  if (!authEnabled()) return true;
  const cookies = parseCookies(req);
  const token = cookies[AUTH_SESSION_COOKIE];
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx === -1) return false;
    const username = decoded.slice(0, idx);
    const signature = decoded.slice(idx + 1);
    return safeEqual(username, AUTH_USERNAME) && safeEqual(signature, authSessionSignature(username));
  } catch (err) {
    return false;
  }
}

function sanitizeNextPath(value) {
  const raw = String(value || '/').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  if (raw.startsWith('/login')) return '/';
  return raw || '/';
}

function renderLoginPage({ error = '', next = '/' } = {}) {
  const safeNext = sanitizeNextPath(next);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in · Alma Fina Command Hub</title>
  <style>
    :root{color-scheme:light dark;}
    *{box-sizing:border-box;}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:linear-gradient(180deg,#f4fbf6,#e7f3ea);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#163322;}
    .card{width:min(100%,420px);background:rgba(255,255,255,0.96);border:1px solid rgba(27,67,50,0.10);border-radius:24px;padding:26px 22px;box-shadow:0 24px 60px rgba(27,67,50,0.14);}
    .eyebrow{font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#52796f;margin-bottom:12px;}
    h1{margin:0 0 8px;font-size:30px;line-height:1;color:#1b4332;font-family:Georgia,'Times New Roman',serif;}
    p{margin:0 0 18px;font-size:14px;line-height:1.6;color:#36594d;}
    .alert{margin:0 0 14px;padding:12px 14px;border-radius:14px;background:#fdeee8;border:1px solid rgba(217,93,57,0.22);color:#8a3a22;font-size:13px;line-height:1.5;}
    label{display:block;margin:14px 0 6px;font-size:12px;font-weight:700;color:#36594d;}
    input{width:100%;padding:14px 15px;border-radius:14px;border:1px solid rgba(27,67,50,0.14);background:#fff;color:#163322;font-size:16px;outline:none;}
    input:focus{border-color:#40916c;box-shadow:0 0 0 4px rgba(64,145,108,0.14);}
    button{width:100%;margin-top:18px;padding:14px 16px;border:none;border-radius:14px;background:#1b4332;color:#f7fff9;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 14px 28px rgba(27,67,50,0.18);}
    .foot{margin-top:14px;font-size:12px;color:#52796f;text-align:center;}
  </style>
</head>
<body>
  <main class="card">
    <div class="eyebrow">Protected workspace</div>
    <h1>Alma Fina</h1>
    <p>Sign in to open the B2B command hub.</p>
    ${error ? `<div class="alert">${esc(error)}</div>` : ''}
    <form method="POST" action="/login">
      <input type="hidden" name="next" value="${esc(safeNext)}">
      <label for="username">User name</label>
      <input id="username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Open hub</button>
    </form>
    <div class="foot">Mobile-friendly sign-in, same protected hub.</div>
  </main>
</body>
</html>`;
}

function isAuthorized(req) {
  if (!authEnabled()) return true;
  if (hasValidSession(req)) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx === -1) return false;
    const username = decoded.slice(0, idx);
    const password = decoded.slice(idx + 1);
    return validAuthCredentials(username, password);
  } catch (err) {
    return false;
  }
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readBuyers() {
  const p = path.join(DATA_DIR, 'buyers.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readSupply() {
  const p = path.join(DATA_DIR, 'supply.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readCanonicalLeadBundle() {
  return JSON.parse(fs.readFileSync(CANONICAL_LEADS_PATH, 'utf8'));
}

function firstExistingPath(paths) {
  for (const candidate of paths) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (err) {
      // ignore path access errors and continue
    }
  }
  return null;
}

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };

  const pushRow = () => {
    if (row.length === 1 && row[0] === '' && !field) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      pushField();
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      pushField();
      pushRow();
      continue;
    }
    field += char;
  }

  if (field || row.length) {
    pushField();
    pushRow();
  }

  if (!rows.length) return [];
  const headers = rows[0].map(value => String(value || '').trim());
  return rows.slice(1)
    .filter(values => values.some(value => String(value || '').trim() !== ''))
    .map(values => {
      const out = {};
      headers.forEach((header, idx) => {
        out[header] = values[idx] !== undefined ? values[idx] : '';
      });
      return out;
    });
}

function readOutreachQueue() {
  const queuePath = firstExistingPath(OUTREACH_QUEUE_CANDIDATES);
  if (!queuePath) return { path: null, updatedAt: null, rows: [] };
  const raw = fs.readFileSync(queuePath, 'utf8');
  const stat = fs.statSync(queuePath);
  return {
    path: queuePath,
    updatedAt: stat.mtime.toISOString(),
    rows: parseCsv(raw)
  };
}

function readReadyApproval() {
  const filePath = firstExistingPath(READY_APPROVAL_CANDIDATES);
  if (!filePath) return { path: null, updatedAt: null, rows: [] };
  const raw = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  let rows = [];
  if (filePath.endsWith('.json')) {
    const parsed = JSON.parse(raw || '[]');
    rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.rows) ? parsed.rows : []);
  } else {
    rows = parseCsv(raw);
  }
  return {
    path: filePath,
    updatedAt: stat.mtime.toISOString(),
    rows: Array.isArray(rows) ? rows : []
  };
}

function sanitizeReadyApprovalRow(row, queueRow) {
  const sendStatus = String(queueRow?.send_status || row.send_status || 'draft_not_sent').toLowerCase();
  const requiresManualApproval = String(queueRow?.requires_manual_approval || row.requires_manual_approval || '').toLowerCase() === 'true';
  const blockedReason = String(queueRow?.blocked_reason || row.blocked_reason || '').trim();
  const doNotContact = String(queueRow?.do_not_contact || row.do_not_contact || '').toLowerCase() === 'true';
  let currentStateLabel = 'Ready for manual approval';
  if (doNotContact) currentStateLabel = 'Do not contact';
  else if (blockedReason) currentStateLabel = `Blocked: ${blockedReason}`;
  else if (sendStatus === 'sent') currentStateLabel = 'Sent live';
  else if (sendStatus === 'approved' && !requiresManualApproval) currentStateLabel = 'Approved, ready to send';
  else if (requiresManualApproval) currentStateLabel = 'Needs approval';
  else if (sendStatus) currentStateLabel = sendStatus.replace(/_/g, ' ');
  return {
    queue_id: row.queue_id || queueRow?.queue_id || '',
    company: row.company || queueRow?.company || '',
    country: row.country || queueRow?.country || '',
    language: row.language || row.communication_language || queueRow?.communication_language || '',
    send_target: row.send_target || queueRow?.send_target || '',
    verification_status: row.verification_status || '',
    launch_state: row.launch_state || '',
    recommended_template: row.recommended_template || '',
    reason: row.reason || row.notes || '',
    current_send_status: sendStatus,
    requires_manual_approval: requiresManualApproval,
    blocked_reason: blockedReason,
    do_not_contact: doNotContact,
    current_state_label: currentStateLabel,
    live_notes: queueRow?.notes || ''
  };
}

function normalizeInboxEventType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['reply', 'replied', 'interested'].includes(normalized)) return normalized === 'interested' ? 'interested' : 'reply';
  if (['sample_request', 'sample requested', 'sample'].includes(normalized)) return 'sample_request';
  if (['analytical_sheet_request', 'analytical request', 'coa_request', 'coa', 'lab_data_request'].includes(normalized)) return 'analytical_sheet_request';
  if (['wrong_contact', 'wrong person', 'wrong recipient'].includes(normalized)) return 'wrong_contact';
  if (['unsubscribe', 'unsubscribed', 'opt_out'].includes(normalized)) return 'unsubscribe';
  if (['bounce', 'bounced', 'failed'].includes(normalized)) return 'bounce';
  if (['auto_reply', 'auto reply', 'out_of_office', 'ooo'].includes(normalized)) return 'auto_reply';
  if (['no_fit', 'not interested', 'no interest'].includes(normalized)) return 'no_fit';
  return 'reply';
}

function normalizeInboxEventStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['closed', 'resolved', 'done'].includes(normalized)) return 'closed';
  if (['planned', 'queued', 'next_step_planned'].includes(normalized)) return 'planned';
  return 'open';
}

function sanitizeInboxEvent(event, index = 0) {
  const occurredAt = event.occurred_at || event.occurredAt || event.logged_at || event.loggedAt || new Date().toISOString();
  const loggedAt = event.logged_at || event.loggedAt || new Date().toISOString();
  return {
    id: event.id || `INBOX-${String(index + 1).padStart(4, '0')}`,
    buyer_id: event.buyer_id || event.buyerId || '',
    queue_id: event.queue_id || event.queueId || '',
    company: event.company || '',
    contact_email: event.contact_email || event.contactEmail || '',
    contact_name: event.contact_name || event.contactName || '',
    event_type: normalizeInboxEventType(event.event_type || event.eventType),
    status: normalizeInboxEventStatus(event.status),
    channel: event.channel || 'email',
    owner: event.owner || '',
    subject: event.subject || '',
    snippet: event.snippet || '',
    recommended_action: event.recommended_action || event.recommendedAction || '',
    next_action: event.next_action || event.nextAction || '',
    notes: event.notes || '',
    occurred_at: new Date(occurredAt).toISOString(),
    logged_at: new Date(loggedAt).toISOString(),
    matched_via: event.matched_via || event.matchedVia || '',
    source_message_id: event.source_message_id || event.sourceMessageId || '',
    source_in_reply_to: event.source_in_reply_to || event.sourceInReplyTo || '',
    source_references: event.source_references || event.sourceReferences || '',
    source_from_email: event.source_from_email || event.sourceFromEmail || '',
    source_uid: event.source_uid || event.sourceUid || ''
  };
}

function readInboxEventStore() {
  if (!fs.existsSync(APP_INBOX_EVENTS)) return { updatedAt: null, events: [] };
  const raw = fs.readFileSync(APP_INBOX_EVENTS, 'utf8');
  const parsed = JSON.parse(raw || '{}');
  const events = Array.isArray(parsed.events) ? parsed.events.map((event, index) => sanitizeInboxEvent(event, index)) : [];
  return {
    updatedAt: parsed.updatedAt || null,
    events: events.sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || '')))
  };
}

function writeInboxEventStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(APP_INBOX_EVENTS, JSON.stringify({
    updatedAt: store.updatedAt || new Date().toISOString(),
    events: Array.isArray(store.events) ? store.events : []
  }, null, 2) + '\n', 'utf8');
}

function buildInboxEventSummary(events) {
  const allEvents = Array.isArray(events) ? events : [];
  const countByType = type => allEvents.filter(event => event.event_type === type).length;
  const countByStatus = status => allEvents.filter(event => event.status === status).length;
  const countByMatch = match => allEvents.filter(event => event.matched_via === match).length;
  return {
    totalEvents: allEvents.length,
    openEvents: countByStatus('open'),
    plannedEvents: countByStatus('planned'),
    closedEvents: countByStatus('closed'),
    replyRows: countByType('reply') + countByType('interested'),
    sampleRequestRows: countByType('sample_request'),
    analyticalRequestRows: countByType('analytical_sheet_request'),
    wrongContactRows: countByType('wrong_contact'),
    unsubscribeRows: countByType('unsubscribe'),
    bounceRows: countByType('bounce'),
    autoReplyRows: countByType('auto_reply'),
    noFitRows: countByType('no_fit'),
    matchedByThreadRows: countByMatch('thread'),
    matchedByAddressRows: countByMatch('address'),
    matchedByDomainRows: countByMatch('domain'),
    latestOccurredAt: allEvents[0] ? allEvents[0].occurred_at : null,
    byType: allEvents.reduce((acc, event) => {
      acc[event.event_type] = (acc[event.event_type] || 0) + 1;
      return acc;
    }, {}),
    byStatus: allEvents.reduce((acc, event) => {
      acc[event.status] = (acc[event.status] || 0) + 1;
      return acc;
    }, {})
  };
}

function inboxEventMatchesFilters(event, query) {
  const buyerId = String(query.get('buyerId') || '').trim().toLowerCase();
  const company = String(query.get('company') || '').trim().toLowerCase();
  const eventType = String(query.get('eventType') || '').trim().toLowerCase();
  const status = String(query.get('status') || '').trim().toLowerCase();
  const q = String(query.get('q') || '').trim().toLowerCase();
  if (buyerId && String(event.buyer_id || '').toLowerCase() !== buyerId) return false;
  if (company && String(event.company || '').toLowerCase() !== company) return false;
  if (eventType && String(event.event_type || '').toLowerCase() !== eventType) return false;
  if (status && String(event.status || '').toLowerCase() !== status) return false;
  if (q) {
    const haystack = [event.company, event.contact_email, event.subject, event.snippet, event.recommended_action, event.next_action, event.notes].join(' ').toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function appendInboxEvent(payload) {
  const store = readInboxEventStore();
  const now = new Date().toISOString();
  const event = sanitizeInboxEvent({
    ...payload,
    id: payload.id || `INBOX-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    occurred_at: payload.occurred_at || payload.occurredAt || now,
    logged_at: now
  }, store.events.length);
  store.events = [event, ...(store.events || [])].sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || '')));
  store.updatedAt = now;
  writeInboxEventStore(store);
  incCounter('almafina_inbox_events_logged_total', 'Total inbox events logged in the hub.', { event_type: event.event_type, status: event.status }, 1);
  return { event, store };
}

function buildOutreachSummary(rows) {
  const allRows = Array.isArray(rows) ? rows : [];
  const emailRows = allRows.filter(row => String(row.send_channel || '').toLowerCase() === 'email');
  const count = predicate => emailRows.filter(predicate).length;
  const byLanguage = emailRows.reduce((acc, row) => {
    const key = row.communication_language || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const byStatus = emailRows.reduce((acc, row) => {
    const key = row.send_status || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    totalRows: allRows.length,
    emailRows: emailRows.length,
    sentRows: count(row => row.send_status === 'sent'),
    failedRows: count(row => row.send_status === 'send_failed'),
    approvedRows: count(row => row.requires_manual_approval !== 'true' && row.send_status !== 'sent'),
    pendingApprovalRows: count(row => row.requires_manual_approval === 'true' && row.send_status !== 'sent'),
    blockedRows: count(row => !!String(row.blocked_reason || '').trim()),
    doNotContactRows: count(row => String(row.do_not_contact || '').toLowerCase() === 'true'),
    draftRows: count(row => row.send_status === 'draft_not_sent'),
    byLanguage,
    byStatus
  };
}

function sanitizeQueueRow(row) {
  return {
    queue_id: row.queue_id || '',
    lead_id: row.lead_id || '',
    company: row.company || '',
    country: row.country || '',
    communication_language: row.communication_language || '',
    send_channel: row.send_channel || '',
    send_target: row.send_target || '',
    contact_name: row.contact_name || '',
    contact_role: row.contact_role || '',
    send_status: row.send_status || '',
    requires_manual_approval: row.requires_manual_approval || '',
    attempt_count: row.attempt_count || '0',
    last_attempt_at_utc: row.last_attempt_at_utc || '',
    last_outbound_message_id: row.last_outbound_message_id || '',
    last_inbox_event_type: row.last_inbox_event_type || '',
    last_inbox_event_at_utc: row.last_inbox_event_at_utc || '',
    blocked_reason: row.blocked_reason || '',
    do_not_contact: row.do_not_contact || '',
    last_result: row.last_result || '',
    notes: row.notes || ''
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(pathname, rows) {
  const allRows = Array.isArray(rows) ? rows : [];
  if (!allRows.length) return;
  const fieldnames = [];
  allRows.forEach(row => {
    Object.keys(row || {}).forEach(key => {
      if (!fieldnames.includes(key)) fieldnames.push(key);
    });
  });
  const lines = [fieldnames.join(',')];
  allRows.forEach(row => {
    lines.push(fieldnames.map(name => csvEscape(row && row[name] !== undefined ? row[name] : '')).join(','));
  });
  fs.writeFileSync(pathname, `${lines.join('\n')}\n`, 'utf8');
}

function isMissingPythonError(err) {
  const msg = String(err && (err.message || err) || '');
  return msg.includes('ENOENT') && (msg.includes('python') || msg.includes('spawnSync'));
}

function approveQueueRowInNode(queuePath, queueId) {
  const queue = readOutreachQueue();
  const targetPath = queuePath || queue.path;
  if (!targetPath) throw new Error('outreach_queue_unavailable');
  const rows = targetPath === queue.path && Array.isArray(queue.rows) ? queue.rows : parseCsv(fs.readFileSync(targetPath, 'utf8'));
  const row = rows.find(item => String(item.queue_id || '') === String(queueId || ''));
  if (!row) throw new Error(`queue_id_not_found:${queueId}`);
  row.requires_manual_approval = 'false';
  if (!row.send_status || row.send_status === 'draft_not_sent') {
    row.send_status = 'approved';
  }
  row.last_result = row.last_result || 'approved in hub';
  writeCsv(targetPath, rows);
  return {
    ok: true,
    action: 'approve',
    queue_id: String(queueId || ''),
    send_status: row.send_status || '',
    requires_manual_approval: row.requires_manual_approval || ''
  };
}

function nowUtc() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function appendNote(existing, note) {
  const base = String(existing || '').trim();
  if (!base) return note;
  if (base.includes(note)) return base;
  return `${base} | ${note}`;
}

function firstName(value) {
  return normalizeText(value).split(' ')[0] || '';
}

function isGenericContact(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return true;
  return ['office', 'general', 'entry point', 'contact', 'regional office', 'main office', 'corporate office', 'inbox', 'routing'].some(token => text.includes(token));
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveExistingPath(candidates = []) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveTemplatePath(templatePath) {
  const raw = String(templatePath || '').trim();
  if (!raw) return null;
  const candidates = path.isAbsolute(raw)
    ? [raw]
    : [
        path.join(ROOT, '..', '..', raw),
        path.join(ROOT, '..', raw),
        path.join(ROOT, raw),
        path.join(process.cwd(), raw)
      ];
  return resolveExistingPath(candidates);
}

function parseTemplateFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const sections = {};
  let current = null;
  let mode = null;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      current = { title: line.replace(/^##\s+/, '').trim(), subject: [], message: [] };
      sections[current.title] = current;
      mode = null;
      continue;
    }
    if (!current) continue;
    if (/^###\s+(Subject|Asunto|Objet)\s*$/i.test(line.trim())) {
      mode = 'subject';
      continue;
    }
    if (/^###\s+(Message|Mensaje)\s*$/i.test(line.trim())) {
      mode = 'message';
      continue;
    }
    if (mode === 'subject') current.subject.push(line);
    if (mode === 'message') current.message.push(line);
  }
  return Object.fromEntries(Object.entries(sections).map(([title, value]) => [title, {
    subject: value.subject.join('\n').trim(),
    message: value.message.join('\n').trim()
  }]));
}

function personalizeMessage(language, contactName, message) {
  const safeLanguage = language || 'English';
  let greeting = GREETING_BY_LANGUAGE[safeLanguage] || GREETING_BY_LANGUAGE.English;
  if (!isGenericContact(contactName)) greeting = `${greeting} ${firstName(contactName)}`;
  const signoff = SIGNOFF_BY_LANGUAGE[safeLanguage] || SIGNOFF_BY_LANGUAGE.English;
  return String(message || '')
    .replace(/^(Hello|Hola|Olá|Bonjour),/m, `${greeting},`)
    .replace(/\n\n(Best regards,|Saludos cordiales,|Atenciosamente,|Bien cordialement,)\n[\s\S]*$/m, '')
    .trim() + `\n\n${signoff}`;
}

function wantsUltraShortTemplate(row = {}) {
  const combined = [row.outreach_template_key, row.outreach_template_section, row.notes]
    .map(value => normalizeText(value).toLowerCase())
    .join(' ');
  return combined.includes('ultra-short') || combined.includes('ultra short') || combined.includes('ultrashort');
}

function renderPlainTextForRow(row) {
  const templatePath = resolveTemplatePath(row.outreach_template_file);
  const section = String(row.outreach_template_section || '').trim();
  if (templatePath && section) {
    const parsed = parseTemplateFile(templatePath);
    const template = parsed[section];
    if (template && template.message) {
      return personalizeMessage(row.communication_language || 'English', row.contact_name || '', template.message);
    }
  }
  const language = row.communication_language || 'English';
  const greeting = isGenericContact(row.contact_name || '')
    ? (GENERIC_SALUTATION_BY_LANGUAGE[language] || GENERIC_SALUTATION_BY_LANGUAGE.English)
    : `${GREETING_BY_LANGUAGE[language] || GREETING_BY_LANGUAGE.English} ${firstName(row.contact_name || '')},`;
  const body = TEXT_FALLBACK_BY_LANGUAGE[language] || TEXT_FALLBACK_BY_LANGUAGE.English;
  const signoff = SIGNOFF_BY_LANGUAGE[language] || SIGNOFF_BY_LANGUAGE.English;
  return `${greeting}\n\n${body}\n\n${signoff}`;
}

function resolveHtmlTemplate(language, row = {}) {
  const useUltraShort = wantsUltraShortTemplate(row);
  const localMap = useUltraShort ? LOCAL_ULTRA_SHORT_HTML_TEMPLATE_BY_LANGUAGE : LOCAL_HTML_TEMPLATE_BY_LANGUAGE;
  const workspaceMap = useUltraShort ? WORKSPACE_ULTRA_SHORT_HTML_TEMPLATE_BY_LANGUAGE : WORKSPACE_HTML_TEMPLATE_BY_LANGUAGE;
  const safeLanguage = language || 'English';
  return resolveExistingPath([
    localMap[safeLanguage],
    localMap.English,
    ...(workspaceMap[safeLanguage] || []),
    ...(workspaceMap.English || [])
  ]);
}

function renderHtmlForRow(row) {
  const language = row.communication_language || 'English';
  const templatePath = resolveHtmlTemplate(language, row);
  if (!templatePath) return null;
  const placeholder = SALUTATION_PLACEHOLDER_BY_LANGUAGE[language] || SALUTATION_PLACEHOLDER_BY_LANGUAGE.English;
  const salutation = isGenericContact(row.contact_name || '')
    ? (GENERIC_SALUTATION_BY_LANGUAGE[language] || GENERIC_SALUTATION_BY_LANGUAGE.English)
    : `${GREETING_BY_LANGUAGE[language] || GREETING_BY_LANGUAGE.English} ${firstName(row.contact_name || '')},`;
  return fs.readFileSync(templatePath, 'utf8').replace(placeholder, salutation);
}

function resolveMailConfig() {
  const loaded = readJsonIfExists(resolveExistingPath(MAIL_CONFIG_CANDIDATES));
  const smtpCfg = loaded.smtp || {};
  const fromEmail = process.env.ALMAFINA_FROM_EMAIL || process.env.FROM_EMAIL || loaded.from_email || process.env.ALMAFINA_SMTP_USERNAME || process.env.SMTP_USERNAME || smtpCfg.username || '';
  const fromName = process.env.ALMAFINA_FROM_NAME || process.env.FROM_NAME || loaded.from_name || 'ALMA FINA';
  const replyTo = process.env.ALMAFINA_REPLY_TO || process.env.REPLY_TO || loaded.reply_to || fromEmail;
  const host = String(process.env.ALMAFINA_SMTP_HOST || process.env.SMTP_HOST || smtpCfg.host || 'smtp.gmail.com').trim();
  const port = Number(process.env.ALMAFINA_SMTP_PORT || process.env.SMTP_PORT || smtpCfg.port || 587);
  const username = String(process.env.ALMAFINA_SMTP_USERNAME || process.env.SMTP_USERNAME || smtpCfg.username || fromEmail).trim();
  const password = String(process.env.ALMAFINA_SMTP_PASSWORD || process.env.SMTP_PASSWORD || smtpCfg.password || '').trim();
  const useTlsRaw = process.env.ALMAFINA_SMTP_USE_TLS || process.env.SMTP_USE_TLS;
  const useTls = useTlsRaw ? !['0', 'false', 'no'].includes(String(useTlsRaw).toLowerCase()) : !(smtpCfg.use_tls === false);
  const secureRaw = process.env.ALMAFINA_SMTP_SECURE || process.env.SMTP_SECURE;
  const secure = secureRaw ? !['0', 'false', 'no'].includes(String(secureRaw).toLowerCase()) : port === 465;
  const familyRaw = process.env.ALMAFINA_SMTP_FAMILY || process.env.SMTP_FAMILY;
  const family = familyRaw ? Number(familyRaw) : (/gmail\.com$/i.test(host) ? 4 : undefined);
  if (!fromEmail || !username || !password) throw new Error('missing_smtp_config');
  return { fromEmail, fromName, replyTo, smtp: { host, port, username, password, useTls, secure, family } };
}

async function smtpSendInNode(config, toEmail, subject, plainBody, htmlBody) {
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: Number(config.smtp.port || 587),
    secure: Boolean(config.smtp.secure),
    requireTLS: !config.smtp.secure && Boolean(config.smtp.useTls),
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    family: config.smtp.family,
    auth: {
      user: config.smtp.username,
      pass: config.smtp.password
    }
  });
  const info = await transporter.sendMail({
    from: `${config.fromName} <${config.fromEmail}>`,
    to: toEmail,
    replyTo: config.replyTo,
    subject,
    text: plainBody,
    html: htmlBody || undefined,
    messageId: `<${crypto.randomBytes(12).toString('hex')}@${String(config.fromEmail).split('@')[1] || 'almafina.mx'}>`
  });
  return {
    result: `sent via smtp to ${toEmail}`,
    message_id: String(info.messageId || '').replace(/[<>]/g, '')
  };
}

async function sendQueueRowInNode(queuePath, queueId, mode, options = {}) {
  const queue = readOutreachQueue();
  const targetPath = queuePath || queue.path;
  if (!targetPath) throw new Error('outreach_queue_unavailable');
  const rows = targetPath === queue.path && Array.isArray(queue.rows) ? queue.rows : parseCsv(fs.readFileSync(targetPath, 'utf8'));
  const row = rows.find(item => String(item.queue_id || '') === String(queueId || ''));
  if (!row) throw new Error(`queue_id_not_found:${queueId}`);

  const config = resolveMailConfig();
  const subject = row.outreach_subject || 'ALMA FINA ingredient introduction';
  const plainBody = renderPlainTextForRow(row);
  const htmlBody = renderHtmlForRow(row);

  if (mode === 'test') {
    const target = String(options.to || config.fromEmail || '').trim();
    if (!target) throw new Error('missing_test_target');
    const sendMeta = await smtpSendInNode(config, target, `[TEST] ${subject}`, plainBody, htmlBody);
    const stamp = nowUtc();
    row.notes = appendNote(row.notes || '', `test preview sent ${stamp} to ${target}`);
    writeCsv(targetPath, rows);
    return {
      ok: true,
      action: 'send_test',
      queue_id: String(queueId || ''),
      to: target,
      result: sendMeta.result,
      message_id: sendMeta.message_id,
      sent_at_utc: stamp
    };
  }

  if (String(row.requires_manual_approval || '').toLowerCase() === 'true') {
    throw new Error('queue_row_requires_manual_approval');
  }
  if (String(row.do_not_contact || '').toLowerCase() === 'true') {
    throw new Error('do_not_contact');
  }
  if (row.blocked_reason) {
    throw new Error(String(row.blocked_reason));
  }
  if (BLOCK_LIVE_SEND_EVENT_TYPES.has(String(row.last_inbox_event_type || '').toLowerCase())) {
    throw new Error(String(row.last_inbox_event_type || 'blocked_by_inbox_event'));
  }

  row.attempt_count = String(Number(row.attempt_count || '0') + 1);
  row.last_attempt_at_utc = nowUtc();
  try {
    const sendMeta = await smtpSendInNode(config, row.send_target, subject, plainBody, htmlBody);
    row.send_status = 'sent';
    row.last_result = sendMeta.result;
    row.last_outbound_message_id = sendMeta.message_id;
    writeCsv(targetPath, rows);
    return {
      ok: true,
      action: 'send_live',
      queue_id: String(queueId || ''),
      to: row.send_target,
      result: sendMeta.result,
      message_id: sendMeta.message_id,
      sent_at_utc: row.last_attempt_at_utc
    };
  } catch (err) {
    row.send_status = 'send_failed';
    row.last_result = `${err.name || 'Error'}: ${err.message || err}`;
    writeCsv(targetPath, rows);
    throw err;
  }
}

function canonicalLeadMatchesFilters(lead, query) {
  const q = String(query.get('q') || '').trim().toLowerCase();
  const country = String(query.get('country') || '').trim().toLowerCase();
  const language = String(query.get('language') || '').trim().toLowerCase();
  const tier = String(query.get('tier') || '').trim().toLowerCase();
  const queueStatus = String(query.get('queueStatus') || '').trim().toLowerCase();
  const priorityBucket = String(query.get('priorityBucket') || '').trim().toLowerCase();
  const hasEmail = String(query.get('hasEmail') || '').trim().toLowerCase();

  if (q) {
    const haystack = [
      lead.canonicalLeadId,
      lead.buyerId,
      lead.companyName,
      lead.geo && lead.geo.country,
      lead.geo && lead.geo.continent,
      lead.classification && lead.classification.sector,
      lead.classification && lead.classification.notes,
      lead.contact && lead.contact.email
    ].join(' ').toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (country && String(lead.geo && lead.geo.country || '').toLowerCase() !== country) return false;
  if (language && String(lead.classification && lead.classification.communicationLanguage || '').toLowerCase() !== language) return false;
  if (tier && String(lead.geo && lead.geo.tier || '').toLowerCase() !== tier) return false;
  if (queueStatus && String(lead.outreachQueue && lead.outreachQueue.sendStatus || 'unqueued').toLowerCase() !== queueStatus) return false;
  if (priorityBucket && String(lead.classification && lead.classification.priorityBucket || '').toLowerCase() !== priorityBucket) return false;
  if (hasEmail === 'true' && !(lead.contact && lead.contact.hasEmail)) return false;
  if (hasEmail === 'false' && lead.contact && lead.contact.hasEmail) return false;
  return true;
}

function canonicalLeadCsv(leads) {
  const headers = [
    'canonical_lead_id', 'buyer_id', 'company_name', 'country', 'continent', 'communication_language',
    'tier', 'priority_bucket', 'priority_rank', 'contact_score', 'recommended_primary_channel',
    'contact_name', 'contact_title', 'email', 'phone', 'linkedin_company', 'queue_matched',
    'queue_id', 'queue_status', 'queue_send_target', 'source_batch', 'source_file', 'notes'
  ];
  const rows = leads.map(lead => [
    lead.canonicalLeadId,
    lead.buyerId,
    lead.companyName,
    lead.geo && lead.geo.country || '',
    lead.geo && lead.geo.continent || '',
    lead.classification && lead.classification.communicationLanguage || '',
    lead.geo && lead.geo.tier || '',
    lead.classification && lead.classification.priorityBucket || '',
    lead.classification && lead.classification.priorityRank || '',
    lead.classification && lead.classification.contactScore || '',
    lead.classification && lead.classification.recommendedPrimaryChannel || '',
    lead.contact && lead.contact.name || '',
    lead.contact && lead.contact.title || '',
    lead.contact && lead.contact.email || '',
    lead.contact && lead.contact.phone || '',
    lead.contact && lead.contact.linkedinCompany || '',
    lead.outreachQueue && lead.outreachQueue.matched ? 'true' : 'false',
    lead.outreachQueue && lead.outreachQueue.queueId || '',
    lead.outreachQueue && lead.outreachQueue.sendStatus || '',
    lead.outreachQueue && lead.outreachQueue.sendTarget || '',
    lead.source && lead.source.batch || '',
    lead.source && lead.source.file || '',
    lead.classification && lead.classification.notes || ''
  ]);
  return [headers.join(','), ...rows.map(row => row.map(csvEscape).join(','))].join('\n') + '\n';
}

function sanitizeToken(value, fallback = 'draft') {
  return String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;
}

function listLoiDrafts() {
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  return fs.readdirSync(DRAFTS_DIR)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const p = path.join(DRAFTS_DIR, name);
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      return { ...raw, _file: name };
    })
    .sort((a, b) => String(b.saved_at || '').localeCompare(String(a.saved_at || '')));
}

function saveLoiDraft(payload) {
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  const savedAt = payload.saved_at || new Date().toISOString();
  const ref = sanitizeToken(payload.ref, 'AF-LOI-DRAFT');
  const buyer = sanitizeToken(payload.buyer_company, 'buyer');
  const stamp = savedAt.replace(/[^0-9]/g, '').slice(0, 14) || Date.now().toString();
  const fileName = `${stamp}__${ref}__${buyer}.json`;
  const draft = { ...payload, saved_at: savedAt };
  fs.writeFileSync(path.join(DRAFTS_DIR, fileName), JSON.stringify(draft, null, 2), 'utf8');
  return { ...draft, _file: fileName };
}

function listLoiArtifacts() {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  return fs.readdirSync(GENERATED_DIR)
    .filter(name => name.endsWith('.html') || name.endsWith('.pdf'))
    .map(name => {
      const p = path.join(GENERATED_DIR, name);
      const stat = fs.statSync(p);
      return {
        file: name,
        type: path.extname(name).replace('.', '').toLowerCase(),
        size: stat.size,
        updated_at: stat.mtime.toISOString(),
        url: `/generated/${encodeURIComponent(name)}`
      };
    })
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

async function readBody(req) {
  const raw = await readRawBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

function buildLoiHtml(data) {
  const d = Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, esc(v)]));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Alma Fina LOI Draft - ${d.buyer_company || 'Buyer'}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f1e8; color: #1b2e21; font-family: Georgia, 'Times New Roman', serif; }
  .page { max-width: 900px; margin: 24px auto; background: #fffdf8; border: 1px solid rgba(27,46,33,0.08); box-shadow: 0 12px 40px rgba(0,0,0,0.06); }
  .wrap { padding: 34px 42px 30px; }
  .topline { height: 6px; background: linear-gradient(90deg, #183323 0%, #c8a94a 100%); }
  .toolbar { max-width: 900px; margin: 18px auto 0; display:flex; justify-content:flex-end; gap:10px; }
  .toolbar button { border:none; background:#183323; color:#fffdf8; padding:10px 14px; border-radius:10px; cursor:pointer; }
  .toolbar button.alt { background:#c8a94a; color:#183323; }
  .brand-row { display:flex; justify-content:space-between; gap:24px; margin-bottom:20px; align-items:flex-start; }
  .brand-wrap { display:flex; align-items:center; gap:16px; }
  .brand-logo { width:74px; height:74px; object-fit:contain; flex-shrink:0; }
  .brand h1 { margin:0; font-size:32px; letter-spacing:0.12em; color:#183323; }
  .brand p { margin:6px 0 0; font-size:13px; color:#6c7568; text-transform:uppercase; letter-spacing:0.14em; }
  .meta { text-align:right; font-size:12px; color:#5d655a; line-height:1.6; }
  .meta strong { color:#183323; }
  .title-box { border:1px solid rgba(200,169,74,0.35); background:rgba(200,169,74,0.08); padding:14px 16px; margin:18px 0 26px; }
  .title-box h2 { margin:0; font-size:22px; color:#183323; }
  .title-box p { margin:6px 0 0; font-size:13px; color:#5d655a; }
  .section { margin-bottom:22px; }
  .section-title { margin:0 0 10px; font-size:13px; text-transform:uppercase; letter-spacing:0.18em; color:#b48c32; }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid rgba(27,46,33,0.12); padding:10px 12px; vertical-align:top; font-size:13px; line-height:1.45; }
  th { background:#f7f4ec; text-align:left; color:#183323; width:32%; }
  td { color:#2f4034; }
  .two-col { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .card { border:1px solid rgba(27,46,33,0.12); background:#fff; }
  .card h3 { margin:0; padding:12px 14px; background:#f7f4ec; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#183323; }
  .card .body { padding:14px; font-size:13px; line-height:1.5; color:#2f4034; }
  .notice { border-left:4px solid #c8a94a; background:#faf6ea; padding:12px 14px; font-size:13px; line-height:1.55; color:#3d493d; }
  .pill { display:inline-block; border:1px solid rgba(200,169,74,0.35); color:#b48c32; font-size:10px; letter-spacing:0.12em; text-transform:uppercase; padding:4px 8px; border-radius:999px; margin-top:8px; }
  .sig-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:12px; }
  .sig-box { border:1px solid rgba(27,46,33,0.12); padding:14px; min-height:150px; }
  .sig-box h4 { margin:0 0 22px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#183323; }
  .line { border-bottom:1px solid rgba(27,46,33,0.3); height:26px; margin-bottom:10px; }
  .small { font-size:12px; color:#667066; }
  .footer { margin-top:26px; padding-top:12px; border-top:1px solid rgba(27,46,33,0.12); font-size:11px; color:#6c7568; display:flex; justify-content:space-between; gap:16px; }
  @media print { body { background:white; } .toolbar { display:none; } .page { margin:0; box-shadow:none; border:none; } .wrap { padding:20px 24px 16px; } }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="alt" onclick="window.print()">Print / Save as PDF</button>
    <button onclick="window.close()">Close</button>
  </div>
  <div class="page"><div class="topline"></div><div class="wrap">
    <div class="brand-row">
      <div class="brand-wrap"><img class="brand-logo" src="${d.logo_url || '/assets/alma-fina-logo.jpg'}" alt="Alma Fina logo"><div class="brand"><h1>ALMA FINA</h1><p>Brussels Sprout Powder · Draft B2B LOI</p></div></div>
      <div class="meta">
        <div><strong>Document:</strong> Buyer-safe discussion draft</div>
        <div><strong>Date:</strong> ${d.date || '[Insert date]'}</div>
        <div><strong>Reference:</strong> ${d.ref || '[Insert reference]'}</div>
        <div><strong>Domain:</strong> almafina.mx</div>
      </div>
    </div>
    <div class="title-box">
      <h2>Letter of Intent, Non-Binding Discussion Draft</h2>
      <p>Prepared for a qualified B2B discussion with ${d.buyer_company || 'buyer'} and intended as a buyer-safe working draft.</p>
    </div>
    <div class="section"><h3 class="section-title">1. Parties</h3><table>
      <tr><th>Seller</th><td>Alma Fina [full legal entity to confirm]<br>Tenancingo, Estado de México, Mexico<br>Contact: ${d.seller_name || 'Mathieu Delorme'} [title to confirm]<br>${d.seller_email || REPLY_EMAIL} · almafina.mx</td></tr>
      <tr><th>Buyer</th><td>${d.buyer_company || '[Buyer legal name]'}<br>${d.buyer_address || '[Buyer address]'}<br>Contact: ${d.buyer_contact || '[Buyer contact]'}${d.buyer_title ? ' · ' + d.buyer_title : ''}<br>${d.buyer_web || '[Buyer website]'}</td></tr>
    </table></div>
    <div class="section"><h3 class="section-title">2. Product Description</h3><table>
      <tr><th>Product</th><td>Brussels Sprout Powder (Brassica oleracea var. gemmifera)</td></tr>
      <tr><th>Origin</th><td>Tenancingo, Estado de México, Mexico</td></tr>
      <tr><th>Expected harvest window</th><td>${d.harvest_date || '[Insert expected harvest window]'}</td></tr>
      <tr><th>Form</th><td>${d.form || '[Insert form / grind / particle size]'}<br>Final technical specification to be confirmed in the corresponding product / analytical documentation.</td></tr>
      <tr><th>Quality documents</th><td>Analytical data sheet, traceability details, and supporting quality information available on request and subject to confirmation.</td></tr>
      <tr><th>Claims / certifications</th><td>${d.certifications || '[Insert only verified certifications or validated product statements]'}</td></tr>
    </table></div>
    <div class="section"><h3 class="section-title">3. Indicative Commercial Terms</h3><table>
      <tr><th>Indicative quantity</th><td>${d.qty_y1 || '[Insert volume range]'}, subject to technical and commercial review</td></tr>
      <tr><th>Indicative price</th><td>${d.price_fob || '[Insert price range and currency]'}<br>Subject to internal confirmation before final commercial paper.</td></tr>
      <tr><th>Incoterms</th><td>${d.incoterms || '[Insert Incoterms]'}</td></tr>
      <tr><th>Payment terms</th><td>${d.payment || '[Insert payment terms]'}</td></tr>
      <tr><th>Exclusivity</th><td>${d.exclusivity || 'Non-exclusive discussion basis unless explicitly agreed otherwise in a later signed document.'}</td></tr>
      <tr><th>Sample policy</th><td>Evaluation sample target: ${d.sample_qty || '[Insert sample quantity]'} · final shipment subject to availability, internal approval, and confirmed timeline.</td></tr>
    </table></div>
    <div class="section two-col">
      <div class="card"><h3>4. Quality & Sampling</h3><div class="body">Alma Fina expects to support buyer qualification with relevant analytical and commercial documentation as available. Any technical parameter, test method, or sample commitment should be confirmed in writing before reliance by the buyer.</div></div>
      <div class="card"><h3>5. Proposed Timeline</h3><div class="body"><strong>Discussion draft shared:</strong> ${d.loi_signed || '[Insert target window]'}<br><strong>Sample review:</strong> [Insert target window]<br><strong>Commercial evaluation:</strong> [Insert target window]<br><strong>Possible definitive agreement:</strong> [Insert target window]<br><strong>Supply timeline, if confirmed:</strong> subject to harvest and final agreement</div></div>
    </div>
    <div class="section" style="margin-top:22px;"><h3 class="section-title">6. Legal Position</h3><div class="notice"><strong>Non-binding discussion draft.</strong> This document is provided for commercial discussion purposes only and does not create a binding obligation on either party to conclude any transaction, purchase, sale, exclusivity arrangement, or definitive agreement.<br><br>Any binding commercial, confidentiality, exclusivity, governing law, dispute resolution, compliance, delivery, or quality obligations should be stated expressly in a later signed agreement reviewed by the relevant parties.</div><div class="pill">Rendered from Command Hub backend · buyer-safe working version</div></div>
    <div class="section"><h3 class="section-title">7. Signature Block, For Draft Review</h3><div class="sig-grid">
      <div class="sig-box"><h4>Seller</h4><div class="line"></div><div class="small">Name: ${d.seller_name || 'Mathieu Delorme'}</div><div class="small">Title: [To confirm]</div><div class="small">Date: ${d.date || '[Insert date]'}</div></div>
      <div class="sig-box"><h4>Buyer</h4><div class="line"></div><div class="small">Name: ${d.buyer_signatory || '[Buyer signatory]'}</div><div class="small">Title: ${d.buyer_title || '[Buyer title]'}</div><div class="small">Date: [Insert date]</div></div>
    </div></div>
    <div class="footer"><div>Alma Fina · Tenancingo, Estado de México, Mexico</div><div>almafina.mx · ${d.ref || '[Insert reference]'} · Internal commercial use</div></div>
  </div></div>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const started = process.hrtime.bigint();
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const routeLabel = routeLabelFor(url.pathname);
  INFLIGHT_REQUESTS += 1;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    INFLIGHT_REQUESTS = Math.max(0, INFLIGHT_REQUESTS - 1);
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    const labels = {
      method: req.method || 'GET',
      route: routeLabel,
      status: String(res.statusCode || 0)
    };
    incCounter('almafina_http_requests_total', 'Total HTTP requests handled by the app.', labels, 1);
    observeDuration(labels, seconds);
    if ((res.statusCode || 500) >= 500) {
      incCounter('almafina_http_server_errors_total', 'Total HTTP 5xx responses.', { route: routeLabel }, 1);
    }
    logEvent('info', 'http_request', {
      request_id: requestId,
      method: req.method,
      path: url.pathname,
      route: routeLabel,
      status: res.statusCode,
      duration_ms: Number((seconds * 1000).toFixed(2)),
      user_agent: req.headers['user-agent'] || '',
      remote_addr: req.socket && req.socket.remoteAddress || ''
    });
  });

  if (req.method === 'GET' && url.pathname === '/login') {
    if (!authEnabled() || isAuthorized(req)) {
      return sendRedirect(res, sanitizeNextPath(url.searchParams.get('next') || '/'));
    }
    return sendHtml(res, 200, renderLoginPage({ next: url.searchParams.get('next') || '/' }));
  }

  if (req.method === 'POST' && url.pathname === '/login') {
    try {
      const raw = await readRawBody(req);
      const body = new URLSearchParams(raw);
      const username = String(body.get('username') || '').trim();
      const password = String(body.get('password') || '');
      const next = sanitizeNextPath(body.get('next') || '/');
      if (!validAuthCredentials(username, password)) {
        res.statusCode = 401;
        return sendHtml(res, 401, renderLoginPage({ error: 'Incorrect user name or password.', next }));
      }
      return sendRedirect(res, next, buildAuthSessionCookie(req, username));
    } catch (err) {
      return sendHtml(res, 400, renderLoginPage({ error: 'Login failed. Please try again.', next: '/' }));
    }
  }

  if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/logout') {
    return sendRedirect(res, '/login', clearAuthSessionCookie(req));
  }

  if (url.pathname !== '/api/health' && url.pathname !== '/login' && url.pathname !== '/logout' && !isAuthorized(req)) {
    if (req.method === 'GET' && !url.pathname.startsWith('/api/') && url.pathname !== '/metrics') {
      return sendHtml(res, 200, renderLoginPage({ next: `${url.pathname}${url.search || ''}` }));
    }
    return sendUnauthorized(res);
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return sendFile(res, path.join(ROOT, 'index.html'));
  }

  if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
    const rel = url.pathname.replace('/assets/', '');
    const filePath = path.join(ROOT, 'assets', rel);
    if (!filePath.startsWith(path.join(ROOT, 'assets'))) {
      return sendJson(res, 400, { ok: false, error: 'invalid_asset_path' });
    }
    return sendFile(res, filePath, mimeTypeFor(filePath));
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      app: 'alma-fina-b2b-command-hub',
      mode: 'light-backend',
      auth: authEnabled() ? 'basic' : 'disabled',
      observability: {
        metrics: '/metrics',
        logs: 'json-stdout',
        traces: getObservabilityState()
      }
    });
  }

  if (req.method === 'GET' && url.pathname === '/metrics') {
    return sendMetrics(res);
  }

  if (req.method === 'GET' && url.pathname === '/api/buyers') {
    return sendJson(res, 200, readBuyers());
  }

  if (req.method === 'GET' && url.pathname === '/api/buyers/export') {
    try {
      const bundle = readCanonicalLeadBundle();
      const leads = (bundle.leads || []).filter(lead => canonicalLeadMatchesFilters(lead, url.searchParams));
      const body = canonicalLeadCsv(leads);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Content-Disposition': 'attachment; filename="alma-fina-canonical-leads.csv"',
        'Cache-Control': 'no-store'
      });
      return res.end(body);
    } catch (err) {
      logEvent('error', 'buyers_export_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 500, { ok: false, error: 'buyers_export_failed', message: String(err) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/leads') {
    try {
      const bundle = readCanonicalLeadBundle();
      const filtered = (bundle.leads || []).filter(lead => canonicalLeadMatchesFilters(lead, url.searchParams));
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || filtered.length || 500)));
      return sendJson(res, 200, {
        ok: true,
        generated_at: bundle.generatedAt || null,
        sources: bundle.sources || {},
        total: filtered.length,
        rows: filtered.slice(0, limit)
      });
    } catch (err) {
      logEvent('error', 'canonical_leads_read_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 500, { ok: false, error: 'canonical_leads_read_failed', message: String(err) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/leads/summary') {
    try {
      const bundle = readCanonicalLeadBundle();
      return sendJson(res, 200, {
        ok: true,
        generated_at: bundle.generatedAt || null,
        sources: bundle.sources || {},
        summary: bundle.summary || {}
      });
    } catch (err) {
      logEvent('error', 'canonical_leads_summary_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 500, { ok: false, error: 'canonical_leads_summary_failed', message: String(err) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/inbox/events') {
    try {
      const store = readInboxEventStore();
      const filtered = (store.events || []).filter(event => inboxEventMatchesFilters(event, url.searchParams));
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || filtered.length || 500)));
      return sendJson(res, 200, {
        ok: true,
        updated_at: store.updatedAt,
        summary: buildInboxEventSummary(filtered),
        total: filtered.length,
        rows: filtered.slice(0, limit)
      });
    } catch (err) {
      logEvent('error', 'inbox_events_read_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 500, { ok: false, error: 'inbox_events_read_failed', message: String(err) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/inbox/summary') {
    try {
      const store = readInboxEventStore();
      return sendJson(res, 200, {
        ok: true,
        updated_at: store.updatedAt,
        summary: buildInboxEventSummary(store.events)
      });
    } catch (err) {
      logEvent('error', 'inbox_summary_read_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 500, { ok: false, error: 'inbox_summary_read_failed', message: String(err) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/inbox/events') {
    try {
      const payload = await readBody(req);
      const { event, store } = appendInboxEvent(payload || {});
      const queue = readOutreachQueue();
      let guardrails = null;
      if (queue.path) {
        guardrails = runMailOps([
          'apply-guardrails',
          '--queue', queue.path,
          '--inbox-events', APP_INBOX_EVENTS
        ]);
      }
      return sendJson(res, 200, {
        ok: true,
        updated_at: store.updatedAt,
        summary: buildInboxEventSummary(store.events),
        event,
        guardrails
      });
    } catch (err) {
      logEvent('error', 'inbox_event_save_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 400, { ok: false, error: 'inbox_event_save_failed', message: String(err) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/inbox/sync') {
    try {
      const payload = await readBody(req);
      const queue = readOutreachQueue();
      if (!queue.path) {
        return sendJson(res, 400, { ok: false, error: 'outreach_queue_unavailable' });
      }
      const mailResult = runMailOps([
        'sync-inbox',
        '--queue', queue.path,
        '--inbox-events', APP_INBOX_EVENTS,
        '--state', APP_INBOX_SYNC_STATE,
        '--days', String(Math.max(1, Math.min(30, Number(payload.days || 14))))
      ]);
      const store = readInboxEventStore();
      incCounter('almafina_inbox_sync_runs_total', 'Total inbox synchronization runs triggered from the hub.', {}, 1);
      return sendJson(res, 200, {
        ok: true,
        sync: mailResult,
        updated_at: store.updatedAt,
        summary: buildInboxEventSummary(store.events),
        total: store.events.length,
        rows: store.events.slice(0, 50)
      });
    } catch (err) {
      logEvent('error', 'inbox_sync_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 500, { ok: false, error: 'inbox_sync_failed', message: String(err) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/supply') {
    return sendJson(res, 200, readSupply());
  }

  if (req.method === 'POST' && url.pathname === '/api/outreach/actions/approve') {
    try {
      const payload = await readBody(req);
      const queue = readOutreachQueue();
      if (!queue.path) {
        return sendJson(res, 400, { ok: false, error: 'outreach_queue_unavailable' });
      }
      if (!payload.queue_id && !payload.queueId) {
        return sendJson(res, 400, { ok: false, error: 'missing_queue_id' });
      }
      let mailResult;
      try {
        mailResult = runMailOps([
          'approve',
          '--queue', queue.path,
          '--queue-id', String(payload.queue_id || payload.queueId)
        ]);
      } catch (err) {
        if (!isMissingPythonError(err)) throw err;
        logEvent('info', 'outreach_approve_python_missing_fallback', {
          request_id: requestId,
          queue_id: String(payload.queue_id || payload.queueId)
        });
        mailResult = approveQueueRowInNode(queue.path, String(payload.queue_id || payload.queueId));
      }
      const fresh = readOutreachQueue();
      incCounter('almafina_outreach_approvals_total', 'Total queue approvals executed from the hub.', {}, 1);
      return sendJson(res, 200, {
        ok: true,
        action: mailResult,
        queue_path: fresh.path,
        updated_at: fresh.updatedAt,
        summary: buildOutreachSummary(fresh.rows),
        rows: fresh.rows.map(sanitizeQueueRow)
      });
    } catch (err) {
      logEvent('error', 'outreach_approve_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 500, { ok: false, error: 'outreach_approve_failed', message: String(err) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/outreach/actions/send-test') {
    try {
      const payload = await readBody(req);
      const queue = readOutreachQueue();
      if (!queue.path) {
        return sendJson(res, 400, { ok: false, error: 'outreach_queue_unavailable' });
      }
      if (!payload.queue_id && !payload.queueId) {
        return sendJson(res, 400, { ok: false, error: 'missing_queue_id' });
      }
      const args = [
        'send-test',
        '--queue', queue.path,
        '--queue-id', String(payload.queue_id || payload.queueId)
      ];
      if (payload.to) args.push('--to', String(payload.to));
      let mailResult;
      try {
        mailResult = runMailOps(args);
      } catch (err) {
        if (!isMissingPythonError(err)) throw err;
        logEvent('info', 'outreach_send_test_python_missing_fallback', {
          request_id: requestId,
          queue_id: String(payload.queue_id || payload.queueId)
        });
        mailResult = await sendQueueRowInNode(queue.path, String(payload.queue_id || payload.queueId), 'test', { to: payload.to });
      }
      const fresh = readOutreachQueue();
      incCounter('almafina_outreach_test_sends_total', 'Total test sends triggered from the hub.', {}, 1);
      return sendJson(res, 200, {
        ok: true,
        action: mailResult,
        queue_path: fresh.path,
        updated_at: fresh.updatedAt,
        summary: buildOutreachSummary(fresh.rows),
        rows: fresh.rows.map(sanitizeQueueRow)
      });
    } catch (err) {
      logEvent('error', 'outreach_send_test_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 500, { ok: false, error: 'outreach_send_test_failed', message: String(err) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/outreach/actions/send-live') {
    try {
      const payload = await readBody(req);
      const queue = readOutreachQueue();
      if (!queue.path) {
        return sendJson(res, 400, { ok: false, error: 'outreach_queue_unavailable' });
      }
      if (!payload.queue_id && !payload.queueId) {
        return sendJson(res, 400, { ok: false, error: 'missing_queue_id' });
      }
      let mailResult;
      try {
        mailResult = runMailOps([
          'send-live',
          '--queue', queue.path,
          '--queue-id', String(payload.queue_id || payload.queueId),
          '--inbox-events', APP_INBOX_EVENTS
        ]);
      } catch (err) {
        if (!isMissingPythonError(err)) throw err;
        logEvent('info', 'outreach_send_live_python_missing_fallback', {
          request_id: requestId,
          queue_id: String(payload.queue_id || payload.queueId)
        });
        mailResult = await sendQueueRowInNode(queue.path, String(payload.queue_id || payload.queueId), 'live');
      }
      const fresh = readOutreachQueue();
      incCounter('almafina_outreach_live_sends_total', 'Total live sends triggered from the hub.', {}, 1);
      return sendJson(res, 200, {
        ok: true,
        action: mailResult,
        queue_path: fresh.path,
        updated_at: fresh.updatedAt,
        summary: buildOutreachSummary(fresh.rows),
        rows: fresh.rows.map(sanitizeQueueRow)
      });
    } catch (err) {
      logEvent('error', 'outreach_send_live_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 500, { ok: false, error: 'outreach_send_live_failed', message: String(err) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/outreach/queue') {
    try {
      const queue = readOutreachQueue();
      return sendJson(res, 200, {
        ok: true,
        queue_path: queue.path,
        updated_at: queue.updatedAt,
        summary: buildOutreachSummary(queue.rows),
        rows: queue.rows.map(sanitizeQueueRow)
      });
    } catch (err) {
      logEvent('error', 'outreach_queue_read_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 500, { ok: false, error: 'outreach_queue_read_failed', message: String(err) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/outreach/ready-approval') {
    try {
      const ready = readReadyApproval();
      const queue = readOutreachQueue();
      const queueById = new Map((queue.rows || []).map(row => [String(row.queue_id || '').trim(), row]));
      const rows = (ready.rows || []).map(row => sanitizeReadyApprovalRow(row, queueById.get(String(row.queue_id || '').trim())));
      return sendJson(res, 200, {
        ok: true,
        source_path: ready.path,
        updated_at: ready.updatedAt || queue.updatedAt,
        total: rows.length,
        rows
      });
    } catch (err) {
      logEvent('error', 'ready_approval_read_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 500, { ok: false, error: 'ready_approval_read_failed', message: String(err) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/loi/templates') {
    return sendJson(res, 200, {
      ok: true,
      templates: [
        'thorne',
        'garden',
        'nb',
        'latam'
      ]
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/loi/drafts') {
    try {
      return sendJson(res, 200, { ok: true, drafts: listLoiDrafts() });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: 'draft_list_failed', message: String(err) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/loi/artifacts') {
    try {
      return sendJson(res, 200, { ok: true, artifacts: listLoiArtifacts() });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: 'artifact_list_failed', message: String(err) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/loi/drafts') {
    try {
      const payload = await readBody(req);
      const saved = saveLoiDraft(payload || {});
      incCounter('almafina_loi_drafts_saved_total', 'Total LOI drafts saved server-side.', {}, 1);
      return sendJson(res, 200, { ok: true, draft: saved });
    } catch (err) {
      logEvent('error', 'loi_draft_save_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 400, { ok: false, error: 'draft_save_failed', message: String(err) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/loi/render') {
    try {
      const payload = await readBody(req);
      fs.mkdirSync(GENERATED_DIR, { recursive: true });
      const html = buildLoiHtml(payload);
      const ref = String(payload.ref || 'AF-LOI-DRAFT').replace(/[^A-Za-z0-9_-]/g, '_');
      const outPath = path.join(GENERATED_DIR, `${ref}.html`);
      fs.writeFileSync(outPath, html, 'utf8');
      incCounter('almafina_loi_html_render_total', 'Total LOI HTML renders.', {}, 1);
      return sendHtml(res, 200, html);
    } catch (err) {
      logEvent('error', 'loi_html_render_failed', { request_id: requestId, message: String(err) });
      return sendJson(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/loi/render-pdf') {
    try {
      fs.mkdirSync(GENERATED_DIR, { recursive: true });
      const payload = await readBody(req);
      const ref = String(payload.ref || 'AF-LOI-DRAFT').replace(/[^A-Za-z0-9_-]/g, '_');
      const outPath = path.join(GENERATED_DIR, `${ref}.pdf`);
      const renderScript = path.join(ROOT, 'render_loi_pdf.py');
      const proc = spawnSync('python3', [renderScript, outPath], {
        input: JSON.stringify(payload),
        encoding: 'utf8'
      });

      if (proc.status !== 0) {
        incCounter('almafina_loi_pdf_render_failures_total', 'Total failed LOI PDF renders.', {}, 1);
        logEvent('error', 'loi_pdf_render_failed', {
          request_id: requestId,
          status: proc.status,
          stdout: proc.stdout,
          stderr: proc.stderr
        });
        return sendJson(res, 500, {
          ok: false,
          error: 'pdf_render_failed',
          stdout: proc.stdout,
          stderr: proc.stderr
        });
      }

      const pdf = fs.readFileSync(outPath);
      incCounter('almafina_loi_pdf_render_total', 'Total successful LOI PDF renders.', {}, 1);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': pdf.length,
        'Content-Disposition': `inline; filename="${ref}.pdf"`,
        'Cache-Control': 'no-store'
      });
      return res.end(pdf);
    } catch (err) {
      incCounter('almafina_loi_pdf_render_failures_total', 'Total failed LOI PDF renders.', {}, 1);
      logEvent('error', 'loi_pdf_render_exception', { request_id: requestId, message: String(err) });
      return sendJson(res, 500, { ok: false, error: 'pdf_render_exception', message: String(err) });
    }
  }

  if (req.method === 'GET' && url.pathname.startsWith('/generated/')) {
    const rel = url.pathname.replace('/generated/', '');
    const filePath = path.join(GENERATED_DIR, rel);
    return sendFile(res, filePath, mimeTypeFor(filePath));
  }

  if (req.method === 'GET' && url.pathname === '/data/buyers.json') {
    return sendFile(res, path.join(DATA_DIR, 'buyers.json'), 'application/json; charset=utf-8');
  }

  if (req.method === 'GET' && url.pathname === '/data/supply.json') {
    return sendFile(res, path.join(DATA_DIR, 'supply.json'), 'application/json; charset=utf-8');
  }

  if (req.method === 'GET' && url.pathname === '/data/inbox-events.json') {
    return sendFile(res, APP_INBOX_EVENTS, 'application/json; charset=utf-8');
  }

  return sendJson(res, 404, { ok: false, error: 'route_not_found', path: url.pathname });
});

server.listen(PORT, () => {
  logEvent('info', 'server_started', {
    port: PORT,
    auth: authEnabled() ? 'basic' : 'disabled',
    observability: getObservabilityState(),
    started_at: new Date(OBS_STARTED_AT).toISOString()
  });
});
