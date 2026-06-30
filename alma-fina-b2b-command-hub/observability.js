const state = {
  tracingRequested: false,
  tracingActive: false,
  tracingError: '',
  exporter: 'disabled'
};

function parseHeaderString(value) {
  if (!value) return undefined;
  const pairs = String(value)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const idx = part.indexOf('=');
      if (idx === -1) return null;
      return [part.slice(0, idx).trim(), part.slice(idx + 1).trim()];
    })
    .filter(Boolean);

  if (!pairs.length) return undefined;
  return Object.fromEntries(pairs);
}

function traceEndpoint() {
  if (process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (process.env.GRAFANA_OTLP_TRACES_ENDPOINT) return process.env.GRAFANA_OTLP_TRACES_ENDPOINT;
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return String(process.env.OTEL_EXPORTER_OTLP_ENDPOINT).replace(/\/$/, '') + '/v1/traces';
  }
  return '';
}

(function bootOpenTelemetry() {
  const endpoint = traceEndpoint();
  const headerString = process.env.OTEL_EXPORTER_OTLP_HEADERS || process.env.GRAFANA_OTLP_HEADERS || '';
  state.tracingRequested = process.env.OTEL_ENABLED === '1' || Boolean(endpoint);

  if (!state.tracingRequested) {
    return;
  }

  try {
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        url: endpoint || undefined,
        headers: parseHeaderString(headerString)
      }),
      instrumentations: [getNodeAutoInstrumentations()]
    });

    Promise.resolve(sdk.start())
      .then(() => {
        state.tracingActive = true;
        state.exporter = 'otlp-http';
        console.log(JSON.stringify({
          level: 'info',
          event: 'otel_started',
          endpoint: endpoint || 'default',
          exporter: state.exporter,
          ts: new Date().toISOString()
        }));
      })
      .catch(err => {
        state.tracingError = String(err && err.message || err);
        state.exporter = 'otlp-http-error';
        console.error(JSON.stringify({
          level: 'error',
          event: 'otel_start_failed',
          message: state.tracingError,
          ts: new Date().toISOString()
        }));
      });

    process.on('SIGTERM', () => {
      Promise.resolve(sdk.shutdown()).catch(() => {});
    });
  } catch (err) {
    state.tracingError = String(err && err.message || err);
    state.exporter = 'dependencies-missing';
    console.error(JSON.stringify({
      level: 'error',
      event: 'otel_bootstrap_failed',
      message: state.tracingError,
      ts: new Date().toISOString()
    }));
  }
})();

function getObservabilityState() {
  return { ...state };
}

module.exports = { getObservabilityState };
