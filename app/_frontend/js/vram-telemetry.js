const VRAM_API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3113' : '';
const VRAM_OPTIONS_KEY = 'voicegen_oui.vramOptions.v1';

function vramApiPath(path) {
  return `${VRAM_API_BASE}${path}`;
}

function defaultVramOptions() {
  return {
    warningsEnabled: true,
    telemetryVisible: true
  };
}

function readVramOptions() {
  try {
    return {
      ...defaultVramOptions(),
      ...JSON.parse(localStorage.getItem(VRAM_OPTIONS_KEY) || '{}')
    };
  } catch {
    return defaultVramOptions();
  }
}

function writeVramOptions(options) {
  localStorage.setItem(
    VRAM_OPTIONS_KEY,
    JSON.stringify({ ...defaultVramOptions(), ...options }, null, 2)
  );
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'n/a';
  return `${(bytes / (1024 ** 3)).toFixed(2)} GiB`;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function setTelemetryVisible(visible) {
  document.getElementById('vram-panel')?.classList.toggle('is-hidden', !visible);
}

function populateVramOptions() {
  const options = readVramOptions();
  const warnings = document.getElementById('vram-warning-enabled-input');
  const telemetry = document.getElementById('vram-telemetry-visible-input');
  if (warnings) warnings.checked = !!options.warningsEnabled;
  if (telemetry) telemetry.checked = !!options.telemetryVisible;
  setTelemetryVisible(!!options.telemetryVisible);
}

function saveVramOptions() {
  const current = readVramOptions();
  const warnings = document.getElementById('vram-warning-enabled-input');
  const telemetry = document.getElementById('vram-telemetry-visible-input');
  const next = {
    warningsEnabled: warnings ? warnings.checked : current.warningsEnabled,
    telemetryVisible: telemetry ? telemetry.checked : current.telemetryVisible
  };
  writeVramOptions(next);
  setTelemetryVisible(next.telemetryVisible);
  if (next.telemetryVisible) refreshVramTelemetry();
}

async function fetchJson(path) {
  const res = await fetch(vramApiPath(path), { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function renderTelemetry(data) {
  const fill = document.getElementById('vram-meter-fill');
  if (!data?.available) {
    setText('vram-summary', 'Telemetry unavailable');
    setText('vram-details', data?.reason || 'VRAM data is not available in this runtime.');
    if (fill) fill.style.width = '0%';
    return;
  }

  const total = Number(data.total_bytes || 0);
  const used = Number(data.used_bytes || 0);
  const percent = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;
  setText('vram-summary', `${formatBytes(data.free_bytes)} free / ${formatBytes(data.total_bytes)} total`);
  setText(
    'vram-details',
    `${data.device_name || 'GPU'} | used ${formatBytes(data.used_bytes)} | torch reserved ${formatBytes(data.reserved_bytes)}`
  );
  if (fill) fill.style.width = `${percent.toFixed(1)}%`;
}

async function refreshVramTelemetry() {
  const options = readVramOptions();
  setTelemetryVisible(options.telemetryVisible);
  if (!options.telemetryVisible) return null;

  try {
    const data = await fetchJson('/api/vram');
    renderTelemetry(data);
    window.WaifuVramTelemetry.last = data;
    return data;
  } catch (err) {
    const data = { available: false, reason: err.message };
    renderTelemetry(data);
    window.WaifuVramTelemetry.last = data;
    return data;
  }
}

async function getGenerationWarning() {
  const options = readVramOptions();
  if (!options.warningsEnabled) return null;

  const health = await fetchJson('/api/health');
  if (health.loaded) return null;

  const telemetry = await fetchJson('/api/vram');
  window.WaifuVramTelemetry.last = telemetry;
  renderTelemetry(telemetry);

  if (!telemetry.available || !telemetry.warning) return null;
  return {
    free: formatBytes(telemetry.free_bytes),
    required: formatBytes(telemetry.estimated_required_bytes),
    device: telemetry.device_name || 'GPU'
  };
}

function bootVramTelemetry() {
  populateVramOptions();
  document.getElementById('vram-warning-enabled-input')?.addEventListener('change', saveVramOptions);
  document.getElementById('vram-telemetry-visible-input')?.addEventListener('change', saveVramOptions);
  document.getElementById('btn-save-options')?.addEventListener('click', saveVramOptions);
  document.getElementById('btn-options')?.addEventListener('click', () => window.setTimeout(populateVramOptions, 0));
  refreshVramTelemetry();
  window.setInterval(refreshVramTelemetry, 8000);
}

window.WaifuVramTelemetry = {
  last: null,
  readOptions: readVramOptions,
  writeOptions: writeVramOptions,
  populateOptions: populateVramOptions,
  saveOptions: saveVramOptions,
  refresh: refreshVramTelemetry,
  getGenerationWarning,
  formatBytes
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootVramTelemetry);
} else {
  bootVramTelemetry();
}
