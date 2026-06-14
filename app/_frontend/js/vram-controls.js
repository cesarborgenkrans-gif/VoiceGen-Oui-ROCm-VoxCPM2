const CONTROL_API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3113' : '';
let bypassNextGenerateWarning = false;

function controlApiPath(path) {
  return `${CONTROL_API_BASE}${path}`;
}

function setControlText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function setBackendModelState(text, kind = 'cyan') {
  const model = document.getElementById('model-pill');
  if (!model) return;
  model.textContent = text.toUpperCase();
  model.className = `badge ${kind}`;
}

function setHintText(text, kind = 'info') {
  const hint = document.getElementById('hint');
  if (!hint) return;
  hint.textContent = text;
  if (kind === 'error') hint.style.color = 'var(--accent-pink)';
  else if (kind === 'ok') hint.style.color = 'var(--accent-cyan)';
  else hint.style.color = 'var(--text-white)';
}

async function postJson(path) {
  const res = await fetch(controlApiPath(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function waitForBackendReturn(timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(controlApiPath('/api/health'), { cache: 'no-store' });
      if (res.ok) return res.json();
    } catch {
      // The backend is expected to drop briefly while the process restarts.
    }
    await new Promise((resolve) => window.setTimeout(resolve, 900));
  }
  throw new Error('backend did not come back after restart');
}

async function coolDownGpu() {
  const button = document.getElementById('btn-cooldown-gpu');
  if (button) button.disabled = true;
  setControlText('vram-cooldown-status', 'Restarting backend to release VRAM...');
  setHintText('Restarting the backend so ROCm releases the VRAM context...', 'busy');

  try {
    const result = await postJson('/api/vram/unload');
    setControlText('vram-cooldown-status', 'Backend restart scheduled. Waiting for it to return...');
    await waitForBackendReturn();
    const message = result.was_loaded
      ? 'Backend restarted. VoxCPM will cold-load on next synthesis.'
      : 'Backend restarted. Model is unloaded.';
    setControlText('vram-cooldown-status', message);
    setBackendModelState('VoxCPM2 not loaded yet', 'cyan');
    setHintText(message, 'ok');
    await window.WaifuVramTelemetry?.refresh?.();
  } catch (err) {
    setControlText('vram-cooldown-status', `Cooldown failed: ${err.message}`);
    setHintText(`Cooldown failed: ${err.message}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function openWarningModal(warning) {
  const body = document.getElementById('vram-warning-body');
  if (body) {
    body.textContent = `Starting VoxCPM may need about ${warning.required}, but ${warning.device} currently reports ${warning.free} free. Close other GPU-heavy apps, cool down first, or generate anyway if you accept the risk.`;
  }
  document.getElementById('vram-warning-modal')?.classList.add('active');
}

function closeWarningModal() {
  document.getElementById('vram-warning-modal')?.classList.remove('active');
}

async function interceptGenerate(event) {
  if (bypassNextGenerateWarning) {
    bypassNextGenerateWarning = false;
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    const warning = await window.WaifuVramTelemetry?.getGenerationWarning?.();
    if (!warning) {
      bypassNextGenerateWarning = true;
      document.getElementById('generate-btn')?.click();
      return;
    }
    openWarningModal(warning);
  } catch {
    bypassNextGenerateWarning = true;
    document.getElementById('generate-btn')?.click();
  }
}

function bootVramControls() {
  document.getElementById('btn-cooldown-gpu')?.addEventListener('click', coolDownGpu);
  document.getElementById('generate-btn')?.addEventListener('click', interceptGenerate, true);
  document.getElementById('btn-vram-warning-cancel')?.addEventListener('click', closeWarningModal);
  document.getElementById('btn-vram-warning-generate')?.addEventListener('click', () => {
    closeWarningModal();
    bypassNextGenerateWarning = true;
    document.getElementById('generate-btn')?.click();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootVramControls);
} else {
  bootVramControls();
}
