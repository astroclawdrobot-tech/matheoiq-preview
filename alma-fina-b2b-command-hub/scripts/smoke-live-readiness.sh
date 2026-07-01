#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8797}"
BASE="http://127.0.0.1:${PORT}"
LOG_FILE="${TMPDIR:-/tmp}/almafina-hub-smoke-${PORT}.log"
PID=""

cleanup() {
  if [[ -n "${PID}" ]] && kill -0 "${PID}" >/dev/null 2>&1; then
    kill "${PID}" >/dev/null 2>&1 || true
    wait "${PID}" >/dev/null 2>&1 || true
  fi
  rm -f "${ROOT}/generated/SMOKE-LIVE-READINESS.html" >/dev/null 2>&1 || true
  rmdir "${ROOT}/generated" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cd "${ROOT}"
PORT="${PORT}" node start.js >"${LOG_FILE}" 2>&1 &
PID="$!"

for _ in {1..40}; do
  if curl -fsS "${BASE}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

health_file="$(mktemp)"
readiness_file="$(mktemp)"
index_file="$(mktemp)"
curl -fsS "${BASE}/api/health" -o "${health_file}"
curl -fsS "${BASE}/api/live-readiness" -o "${readiness_file}"
curl -fsS "${BASE}/" -o "${index_file}"

python3 - "${health_file}" "${readiness_file}" "${index_file}" <<'PY'
import json, pathlib, sys
health=json.loads(pathlib.Path(sys.argv[1]).read_text())
readiness=json.loads(pathlib.Path(sys.argv[2]).read_text())
html=pathlib.Path(sys.argv[3]).read_text(encoding="utf-8")
assert health["ok"] is True, health
assert health["liveSend"] == "disabled", health
assert readiness["ok"] is True, readiness
assert readiness["status"] in {"INTERNAL_BETA_READY_PROVIDER_BLOCKED", "PUBLIC_LIVE_READY"}, readiness["status"]
required={"dashboard","health","buyers","canonical_leads","supply","outreach_queue","ready_approval","inbox_guardrails","loi","metrics"}
blocks={b["id"]: b for b in readiness["blocks"]}
missing=required-set(blocks)
assert not missing, missing
failed=[bid for bid in required if not blocks[bid]["ok"]]
assert not failed, failed
for marker in ["Alma Fina", "Dashboard", "Buyer", "Supply", "LOI", "Outreach", "Inbox", "approval"]:
    assert marker.lower() in html.lower(), marker
assert readiness["summary"]["buyers"] > 0
assert readiness["summary"]["canonicalLeads"] > 0
assert readiness["summary"]["queueRows"] > 0
PY
rm -f "${health_file}" "${readiness_file}" "${index_file}"

curl -fsS "${BASE}/api/buyers" >/dev/null
curl -fsS "${BASE}/api/leads/summary" >/dev/null
curl -fsS "${BASE}/api/supply" >/dev/null
curl -fsS "${BASE}/api/outreach/queue" >/dev/null
curl -fsS "${BASE}/api/outreach/ready-approval" >/dev/null
curl -fsS "${BASE}/api/inbox/summary" >/dev/null
curl -fsS "${BASE}/api/loi/templates" >/dev/null
curl -fsS "${BASE}/metrics" | grep -q "almafina_outreach_queue_rows_total"

curl -fsS -X POST "${BASE}/api/loi/render" \
  -H "content-type: application/json" \
  -d '{"ref":"SMOKE-LIVE-READINESS","buyer":"Smoke Buyer","seller":"Alma Fina","volume":"1000kg","price":"TBD"}' \
  | grep -q "Alma Fina LOI Draft"

live_status="$(curl -sS -o /tmp/almafina-live-guard-body.json -w "%{http_code}" \
  -X POST "${BASE}/api/outreach/actions/send-live" \
  -H "content-type: application/json" \
  -d '{"queue_id":"TOP10-0002"}')"
if [[ "${live_status}" != "403" ]]; then
  echo "Expected live-send guard HTTP 403, got ${live_status}" >&2
  cat /tmp/almafina-live-guard-body.json >&2 || true
  exit 1
fi
grep -q "live_send_disabled" /tmp/almafina-live-guard-body.json
rm -f /tmp/almafina-live-guard-body.json

echo "SMOKE_ALMAFINA_LIVE_READINESS_OK"
