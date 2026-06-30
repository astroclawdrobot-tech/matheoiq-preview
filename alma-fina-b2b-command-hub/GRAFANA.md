# Grafana integration for Alma Fina B2B Command Hub

## What is now built into the app
- `GET /metrics` returns Prometheus-format metrics
- server logs are emitted as structured JSON to stdout
- optional OpenTelemetry traces can be enabled for Grafana Tempo / Grafana Cloud
- `GET /api/health` now reports observability status

## Metrics available immediately
Examples:
- `almafina_http_requests_total`
- `almafina_http_request_duration_seconds`
- `almafina_http_inflight_requests`
- `almafina_loi_drafts_saved_total`
- `almafina_loi_html_render_total`
- `almafina_loi_pdf_render_total`
- `almafina_loi_pdf_render_failures_total`
- process memory / uptime gauges

## Railway setup
1. Deploy the repo with:
   - Root Directory: `alma-fina-b2b-command-hub`
   - Start Command: `npm start`
2. Add auth variables:
   - `AUTH_USERNAME`
   - `AUTH_PASSWORD`
3. Optional trace variables for Grafana Cloud:
   - `OTEL_SERVICE_NAME=alma-fina-b2b-command-hub`
   - `OTEL_ENABLED=1`
   - `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://otlp-gateway-<region>.grafana.net/otlp/v1/traces`
   - `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64-instance-id:api-key>`

## Grafana Cloud wiring
### Traces / APM
Use Grafana Cloud OTLP credentials and set the OTEL variables above. The app startup bootstrap in `observability.js` will auto-enable tracing.

### Metrics
Use any Prometheus-compatible scraper or Grafana Alloy to scrape:
- `https://<your-railway-url>/metrics`

Because the app is protected with Basic Auth, configure the scraper with the same `AUTH_USERNAME` / `AUTH_PASSWORD` or place the service behind a private network / agent.

### Logs
The app emits JSON logs to stdout. Railway will capture them automatically. For Loki/Grafana log centralization, forward Railway logs with your preferred shipper or use a platform-supported drain when available.

## Suggested first Grafana dashboards
- request rate by route
- p95 request latency
- 5xx error count
- PDF render success vs failure
- memory usage and uptime
- draft save volume over time

## Practical note
This is now Grafana-ready, but the final Grafana Cloud account hookup still depends on your Grafana credentials and preferred scraping/log shipping path.
