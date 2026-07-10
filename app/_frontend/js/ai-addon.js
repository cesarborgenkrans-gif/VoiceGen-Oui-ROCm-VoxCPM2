(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const STORAGE = {
    addonBase: 'waifuvoice.aiAddon.addonBase.v1',
    targetBase: 'waifuvoice.aiAddon.targetBase.v1',
    pollSeconds: 'waifuvoice.aiAddon.pollSeconds.v1',
    seenEvents: 'waifuvoice.aiAddon.seenEvents.v1'
  };

  const state = {
    addonBase: localStorage.getItem(STORAGE.addonBase) || 'http://127.0.0.1:3114',
    targetBase: localStorage.getItem(STORAGE.targetBase) || 'http://127.0.0.1:3113',
    pollSeconds: Number(localStorage.getItem(STORAGE.pollSeconds) || '2') || 2,
    gatewayOnline: false,
    targetOnline: false,
    events: [],
    outputs: [],
    latestSettings: null,
    seenEvents: readSeenEvents(),
    readyForAlerts: false,
    timer: null
  };

  const eventTemplate = $('#event-template');
  const outputTemplate = $('#output-template');

  function readSeenEvents() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE.seenEvents) || '[]');
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  function writeSeenEvents() {
    localStorage.setItem(STORAGE.seenEvents, JSON.stringify([...state.seenEvents].slice(-600)));
  }

  function normalizeBase(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function addonUrl(path) {
    return `${state.addonBase}${path}`;
  }

  function targetUrl(path) {
    return `${state.targetBase}${path}`;
  }

  function setText(selector, value) {
    const node = $(selector);
    if (node) node.textContent = value;
  }

  function setValue(selector, value) {
    const node = $(selector);
    if (node) node.value = value;
  }

  function setChip(node, text, mode) {
    if (!node) return;
    node.textContent = text;
    node.classList.remove('cyan', 'pink', 'gold');
    node.classList.add(mode === 'ok' ? 'cyan' : 'pink');
  }

  function shortDate(value) {
    if (!value) return 'Unknown time';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, { cache: 'no-store', ...options });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      throw new Error(data?.error || data?.raw || `HTTP ${res.status}`);
    }
    return data;
  }

  async function copyText(value) {
    const text = String(value || '');
    try {
      await navigator.clipboard.writeText(text);
      showBanner('Copied to clipboard');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      showBanner('Copied to clipboard');
    }
  }

  function showBanner(message) {
    const banner = $('#access-banner');
    const title = $('#access-banner-title');
    if (!banner || !title) return;
    title.textContent = message;
    banner.hidden = false;
  }

  function notifyAccess(event) {
    const settings = event.settings || {};
    const body = `${settings.mode || 'voice-design'} / seed ${settings.seed ?? -1}`;
    showBanner(body);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('VoiceGen AI access detected', { body });
    }
  }

  function buildGeneratePayload(settings = {}) {
    return {
      text: settings.text || '',
      language: settings.language || 'English',
      mode: settings.mode || 'voice-design',
      voice_design: settings.voice_design || '',
      prompt_text: settings.prompt_text || '',
      cfg_value: Number(settings.cfg_value ?? 2.0),
      inference_timesteps: Number(settings.inference_timesteps ?? 10),
      max_len: Number(settings.max_len ?? 4096),
      seed: Number(settings.seed ?? -1),
      denoise: !!settings.denoise,
      preset_state: settings.preset_state || {},
      consent_ack: !!settings.consent_ack
    };
  }

  function buildCurl(settings = {}) {
    const payload = JSON.stringify(buildGeneratePayload(settings), null, 2);
    return [
      'curl -X POST',
      `  "${addonUrl('/api/generate')}"`,
      '  -H "Content-Type: application/json"',
      `  --data ${JSON.stringify(payload)}`
    ].join(' \\\n');
  }

  function agentNote() {
    return [
      'Use the VoiceGen AI Addon gateway so the user can monitor voice generation.',
      `POST JSON to ${addonUrl('/api/generate')}.`,
      'Include text, voice_design, language, mode, cfg_value, inference_timesteps, max_len, seed, denoise, preset_state, and consent_ack when relevant.',
      'Do not call the direct VoiceGen /api/generate endpoint unless the user explicitly asks to bypass monitoring.'
    ].join('\n');
  }

  function requestEventGroups(events) {
    const groups = new Map();
    for (const event of events) {
      const key = event.request_id || event.id;
      if (!groups.has(key)) groups.set(key, { request: null, response: null, errors: [], all: [] });
      const group = groups.get(key);
      group.all.push(event);
      if (event.kind === 'generate.request') group.request = event;
      else if (event.kind === 'generate.response') group.response = event;
      else group.errors.push(event);
    }
    return [...groups.values()].sort((a, b) => {
      const at = new Date(a.all[0]?.created_at || 0).getTime();
      const bt = new Date(b.all[0]?.created_at || 0).getTime();
      return bt - at;
    });
  }

  function field(label, value) {
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value ?? '')}</dd></div>`;
  }

  function latestRequestGroup() {
    return requestEventGroups(state.events)[0] || null;
  }

  function setMainButtons(enabled) {
    $('#main-copy-settings').disabled = !enabled;
    $('#main-copy-curl').disabled = !enabled;
  }

  function renderLatestRequest() {
    const group = latestRequestGroup();
    const request = group?.request || group?.all?.[0] || null;
    const response = group?.response || null;
    const settings = request?.settings || null;
    state.latestSettings = settings;

    if (!settings) {
      setText('#request-title', 'Waiting for monitored request');
      setText('#latest-mode-chip', 'VOICE DESIGN');
      setText('#access-summary', 'Waiting for the first monitored voice request.');
      setValue('#spoken-script-display', '');
      setValue('#voice-design-display', '');
      setText('#seed-value', '-');
      setText('#cfg-value', '-');
      setText('#steps-value', '-');
      setText('#maxlen-value', '-');
      setText('#denoise-value', '-');
      setText('#language-value', '-');
      setMainButtons(false);
      return;
    }

    const mode = settings.mode || 'voice-design';
    const filename = response?.response?.filename || 'No output filename yet';
    setText('#request-title', response?.response?.filename || `${mode} request`);
    setText('#latest-mode-chip', String(mode).toUpperCase());
    setText('#access-summary', `Last monitored request: ${shortDate(request.created_at)}. Seed ${settings.seed ?? -1}. ${filename}.`);
    setValue('#spoken-script-display', settings.text || '');
    setValue('#voice-design-display', settings.voice_design || '');
    setText('#seed-value', settings.seed ?? -1);
    setText('#cfg-value', settings.cfg_value ?? 2.0);
    setText('#steps-value', settings.inference_timesteps ?? 10);
    setText('#maxlen-value', settings.max_len ?? 4096);
    setText('#denoise-value', settings.denoise ? 'On' : 'Off');
    setText('#language-value', settings.language || 'English');
    setMainButtons(true);
  }

  function renderEvents() {
    const list = $('#event-list');
    if (!list) return;
    const groups = requestEventGroups(state.events);
    setText('#event-count-value', String(state.events.length));

    if (!groups.length) {
      list.className = 'event-list empty-state';
      list.textContent = state.gatewayOnline
        ? 'No AI gateway calls yet.'
        : 'Addon gateway is offline. Start the addon server to see live gateway calls.';
      return;
    }

    list.className = 'event-list';
    list.innerHTML = '';
    for (const group of groups.slice(0, 12)) {
      const request = group.request || group.all[0];
      const response = group.response;
      const settings = request.settings || {};
      const node = eventTemplate.content.firstElementChild.cloneNode(true);
      $('.event-kind', node).textContent = response?.status || request.status || 'observed';
      $('time', node).textContent = shortDate(request.created_at);
      $('h3', node).textContent = response?.response?.filename || `${settings.mode || 'voice-design'} request`;

      $('.settings-list', node).innerHTML = [
        field('Seed', settings.seed ?? -1),
        field('CFG', settings.cfg_value ?? 2.0),
        field('Steps', settings.inference_timesteps ?? 10),
        field('Mode', settings.mode || 'voice-design'),
        field('Language', settings.language || 'English'),
        field('Audio', response?.response?.filename || 'pending')
      ].join('');

      $('.text-preview', node).innerHTML = `
        <pre>${escapeHtml(settings.text || '')}</pre>
        <pre>${escapeHtml(settings.voice_design || '')}</pre>
      `;

      $('[data-action="copy-settings"]', node).addEventListener('click', () => {
        copyText(JSON.stringify(buildGeneratePayload(settings), null, 2));
      });
      $('[data-action="copy-curl"]', node).addEventListener('click', () => {
        copyText(buildCurl(settings));
      });

      list.appendChild(node);
    }
  }

  function outputKey(output) {
    return String(output?.filename || output?.url || '').trim();
  }

  function outputAudioUrl(output) {
    return state.gatewayOnline
      ? addonUrl(output.url || `/outputs/${output.filename}`)
      : targetUrl(output.url || `/outputs/${output.filename}`);
  }

  function isAudioPlaying(audio) {
    return !!audio && !audio.paused && !audio.ended && audio.currentTime > 0;
  }

  function updateOutputCard(node, output) {
    const audioUrl = outputAudioUrl(output);
    $('h3', node).textContent = output.filename || 'Generated audio';
    $('p', node).textContent = `${shortDate(output.created_at)} / ${output.mode || 'unknown'} / seed ${output.seed ?? -1}`;

    const audio = $('audio', node);
    if (audio && audio.getAttribute('src') !== audioUrl && !isAudioPlaying(audio)) {
      audio.src = audioUrl;
    }

    const openLink = $('[data-action="download-output"]', node);
    openLink.href = audioUrl;
    openLink.download = output.filename || 'waifuvoice-output.wav';

    $('[data-action="copy-output"]', node).onclick = () => {
      copyText(JSON.stringify(output, null, 2));
    };
  }

  function renderOutputs() {
    const list = $('#output-list');
    if (!list) return;
    const outputs = state.outputs || [];
    setText('#output-count-value', String(outputs.length));
    setText('#output-count-pill', String(outputs.length));

    const visibleOutputs = outputs.slice(0, 12).filter((output) => outputKey(output));
    if (!visibleOutputs.length) {
      if ($$('audio', list).some(isAudioPlaying)) return;
      list.className = 'output-list empty-state';
      list.textContent = 'No generated clips detected yet.';
      return;
    }

    if (list.classList.contains('empty-state')) list.textContent = '';
    list.className = 'output-list';
    const existingCards = new Map($$('.output-card[data-output-key]', list).map((node) => [node.dataset.outputKey, node]));
    const liveKeys = new Set();

    for (const output of visibleOutputs) {
      const key = outputKey(output);
      liveKeys.add(key);
      let node = existingCards.get(key);
      if (!node) {
        node = outputTemplate.content.firstElementChild.cloneNode(true);
        node.dataset.outputKey = key;
      }
      updateOutputCard(node, output);
      list.appendChild(node);
    }

    for (const [key, node] of existingCards.entries()) {
      if (liveKeys.has(key)) continue;
      if ($$('audio', node).some(isAudioPlaying)) continue;
      node.remove();
    }
  }

  function updateMetrics() {
    const latestRequest = state.events.find((event) => event.kind === 'generate.request');
    const latestOutput = state.outputs[0];
    setText('#last-access-value', latestRequest ? shortDate(latestRequest.created_at) : 'No gateway access yet');
    setText('#latest-output-value', latestOutput?.filename || 'No output loaded');
    setText('#gateway-endpoint', `${state.addonBase}/api/generate`);
  }

  async function refreshStatus() {
    try {
      const status = await fetchJson(addonUrl('/api/ai-addon/status'));
      state.gatewayOnline = true;
      state.targetOnline = !!status.target?.online;
      setChip($('#gateway-chip'), 'GATEWAY ONLINE', 'ok');
      setChip($('#target-chip'), state.targetOnline ? 'VOICEGEN ONLINE' : 'VOICEGEN OFFLINE', state.targetOnline ? 'ok' : 'bad');
    } catch {
      state.gatewayOnline = false;
      setChip($('#gateway-chip'), 'GATEWAY OFFLINE', 'bad');
      try {
        await fetchJson(targetUrl('/api/health'));
        state.targetOnline = true;
        setChip($('#target-chip'), 'VOICEGEN ONLINE', 'ok');
      } catch {
        state.targetOnline = false;
        setChip($('#target-chip'), 'VOICEGEN OFFLINE', 'bad');
      }
    }
  }

  async function refreshEvents() {
    if (!state.gatewayOnline) {
      state.events = [];
      return;
    }
    const data = await fetchJson(addonUrl('/api/ai-addon/events'));
    const events = Array.isArray(data.events) ? data.events : [];
    const newRequests = events.filter((event) => event.kind === 'generate.request' && !state.seenEvents.has(event.id));
    state.events = events;

    if (state.readyForAlerts) {
      for (const event of newRequests) notifyAccess(event);
    }
    for (const event of events) state.seenEvents.add(event.id);
    writeSeenEvents();
  }

  async function refreshOutputs() {
    if (!state.targetOnline) {
      state.outputs = [];
      return;
    }
    try {
      const data = await fetchJson(state.gatewayOnline ? addonUrl('/api/outputs') : targetUrl('/api/outputs'));
      state.outputs = Array.isArray(data) ? data : [];
    } catch {
      state.outputs = [];
    }
  }

  async function refreshAll() {
    readInputs();
    await refreshStatus();
    try {
      await refreshEvents();
    } catch {
      state.events = [];
    }
    await refreshOutputs();
    renderLatestRequest();
    renderEvents();
    renderOutputs();
    updateMetrics();
    state.readyForAlerts = true;
    scheduleRefresh();
  }

  function scheduleRefresh() {
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(refreshAll, Math.max(1, state.pollSeconds) * 1000);
  }

  function readInputs() {
    state.addonBase = normalizeBase($('#addon-base-input')?.value || state.addonBase);
    state.targetBase = normalizeBase($('#target-base-input')?.value || state.targetBase);
    state.pollSeconds = Number($('#poll-interval-input')?.value || state.pollSeconds) || 2;
    localStorage.setItem(STORAGE.addonBase, state.addonBase);
    localStorage.setItem(STORAGE.targetBase, state.targetBase);
    localStorage.setItem(STORAGE.pollSeconds, String(state.pollSeconds));
  }

  function setDrawer(open) {
    $('#outputs-drawer')?.classList.toggle('open', open);
    $('#outputs-drawer')?.setAttribute('aria-hidden', String(!open));
    const scrim = $('#drawer-scrim');
    if (scrim) scrim.hidden = !open;
  }

  function bindUi() {
    $('#addon-base-input').value = state.addonBase;
    $('#target-base-input').value = state.targetBase;
    $('#poll-interval-input').value = state.pollSeconds;

    $('#refresh-button')?.addEventListener('click', refreshAll);
    $('#dismiss-banner')?.addEventListener('click', () => {
      $('#access-banner').hidden = true;
    });
    $('#clear-seen-button')?.addEventListener('click', () => {
      state.seenEvents = new Set();
      writeSeenEvents();
      showBanner('Alert memory reset');
    });
    $('#notification-button')?.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        showBanner('This browser does not support desktop notifications');
        return;
      }
      const permission = await Notification.requestPermission();
      showBanner(permission === 'granted' ? 'Desktop alerts enabled' : 'Desktop alerts not enabled');
    });
    $$('[data-agent-note-copy]').forEach((button) => {
      button.addEventListener('click', () => copyText(agentNote()));
    });
    $('#main-copy-settings')?.addEventListener('click', () => {
      if (state.latestSettings) copyText(JSON.stringify(buildGeneratePayload(state.latestSettings), null, 2));
    });
    $('#main-copy-curl')?.addEventListener('click', () => {
      if (state.latestSettings) copyText(buildCurl(state.latestSettings));
    });
    $('#outputs-toggle')?.addEventListener('click', () => setDrawer(true));
    $('#outputs-close')?.addEventListener('click', () => setDrawer(false));
    $('#drawer-scrim')?.addEventListener('click', () => setDrawer(false));

    $$('[data-copy-target]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = document.getElementById(button.dataset.copyTarget);
        copyText(target?.textContent || '');
      });
    });
  }

  bindUi();
  refreshAll();
})();
