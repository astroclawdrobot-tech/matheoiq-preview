#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8796}"
BASE="http://127.0.0.1:${PORT}"
LOG="${TMPDIR:-/tmp}/matheoiq-medico-movil-smoke-${PORT}.log"
PID=""
cleanup(){ if [[ -n "${PID}" ]] && kill -0 "${PID}" >/dev/null 2>&1; then kill "${PID}" >/dev/null 2>&1 || true; wait "${PID}" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
cd "${ROOT}"
PORT="${PORT}" node server.js >"${LOG}" 2>&1 &
PID="$!"
for _ in {1..40}; do curl -fsS "${BASE}/api/health" >/dev/null 2>&1 && break || sleep .25; done
health="$(mktemp)"; ready="$(mktemp)"; html="$(mktemp)"; queue="$(mktemp)"; approvals="$(mktemp)"; metrics="$(mktemp)"
curl -fsS "${BASE}/api/health" -o "${health}"
curl -fsS "${BASE}/api/live-readiness" -o "${ready}"
curl -fsS "${BASE}/api/outreach/queue" -o "${queue}"
curl -fsS "${BASE}/api/outreach/ready-approval" -o "${approvals}"
curl -fsS "${BASE}/metrics" -o "${metrics}"
curl -fsS "${BASE}/" -o "${html}"
python3 - "${health}" "${ready}" "${html}" "${queue}" "${approvals}" "${metrics}" <<'PY'
import json, pathlib, sys
health=json.loads(pathlib.Path(sys.argv[1]).read_text())
ready=json.loads(pathlib.Path(sys.argv[2]).read_text())
html=pathlib.Path(sys.argv[3]).read_text(encoding='utf-8')
queue=json.loads(pathlib.Path(sys.argv[4]).read_text())
approvals=json.loads(pathlib.Path(sys.argv[5]).read_text())
metrics=pathlib.Path(sys.argv[6]).read_text()
assert health['ok'] is True, health
assert health['externalActions'] == 'disabled', health
assert health['hubContract'] == 'alma-fina-command-hub-parity', health
assert ready['ok'] is True, ready
assert ready['status'] == 'LIVE_PREVIEW_READY_EXTERNAL_ACTIONS_BLOCKED', ready['status']
assert queue['ok'] is True and queue['summary']['total'] >= 3 and queue['summary']['externalWrites'] == 0, queue
assert approvals['ok'] is True and approvals['total'] >= 2, approvals
assert 'matheoiq_hub_requests_total' in metrics
assert 'matheoiq_hub_blocked_external_actions_total' in metrics
assert ready['publicClaims']['usesAlmaFinaContent'] is False
assert ready['publicClaims']['containsRealPatientData'] is False
assert ready['publicClaims']['dispatchesRealDoctors'] is False
assert ready['publicClaims']['chargesPayments'] is False
required={'backend_guards','medical_license','mx_compliance','payments','ai_ops','closed_pilot'}
blocks={b['id']: b for b in ready['priorityBlocks']}
assert required == set(blocks), blocks.keys()
assert all(blocks[k]['ready'] for k in required), blocks
assert ready['summary']['clinicsRows'] >= 5
assert ready['summary']['doctorsRows'] >= 4
assert ready['summary']['dispatchQueueRows'] >= 5
assert ready['summary']['blockedRedFlagRows'] >= 1
for marker in ['MatheoIQ Médico Móvil','AI Dispatch','Checklist priority blocks','No live writes','Licencia médica']:
    assert marker in html, marker
PY
rm -f "${health}" "${ready}" "${html}" "${queue}" "${approvals}" "${metrics}"
for endpoint in /api/dispatch/live /api/payments/capture /api/patients/write /api/outreach/actions/send-test /api/outreach/actions/send-live; do
  status="$(curl -sS -o /tmp/matheoiq-live-body.json -w '%{http_code}' -X POST "${BASE}${endpoint}" -H 'content-type: application/json' -d '{}')"
  if [[ "${status}" != "403" ]]; then echo "Expected 403 for ${endpoint}, got ${status}" >&2; cat /tmp/matheoiq-live-body.json >&2 || true; exit 1; fi
  grep -q 'external_live_action_disabled' /tmp/matheoiq-live-body.json
done
rm -f /tmp/matheoiq-live-body.json
echo "SMOKE_MATHEOIQ_MEDICO_MOVIL_LIVE_READINESS_OK"
