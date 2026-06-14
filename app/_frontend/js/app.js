const $ = (sel) => document.querySelector(sel);

const statusPill = $('#status-pill');
const modelPill = $('#model-pill');
const hint = $('#hint');
const rawStatus = $('#raw-status');
const audioPlayer = $('#audio-player');
const downloadLink = $('#download-link');
const historyList = $('#history-list');
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3113' : '';
const FRONTEND_BASE = '_frontend/';
const CUSTOM_PERSONAS_KEY = 'waifuvoice.customPersonas.v1';
const LLM_OPTIONS_KEY = 'waifuvoice.llmOptions.v1';
const CLONE_TOOLS_KEY = 'waifuvoice.cloneToolsEnabled.v1';
const PERSONA_LAB_DRAFT_KEY = 'waifuvoice.personaLabDraft.v1';
const TSUKI_DIALOGUE_KEY = 'waifuvoice.tsukiDialogue.v1';
const SCRIPT_SAMPLE_SPEED = 34;

function apiPath(path) {
  return `${API_BASE}${path}`;
}

const MODE_IDS = ['voice-design', 'zero-shot', 'continuation'];
const PRESET_TABS = [
  { key: 'personas', stateKey: 'persona', label: 'Personas' },
  { key: 'voices', stateKey: 'voice', label: 'Voices' },
  { key: 'moods', stateKey: 'mood', label: 'Moods' },
  { key: 'styles', stateKey: 'style', label: 'Styles' },
  { key: 'scenes', stateKey: 'scene', label: 'Scenes' }
];

const state = {
  objectUrl: null,
  outputs: [],
  isGenerating: false,
  currentMode: 0,
  uploadToolsOpen: false,
  cloneToolsEnabled: readCloneToolsEnabled(),
  customPersonaBackendAvailable: false,
  personaLab: null,
  presetLibrary: null,
  activePresetTab: 'personas',
  presetSelections: {
    persona: null,
    voice: null,
    mood: null,
    style: null,
    language: null,
    scene: null
  },
  dialogueHistory: [],
  activeDialogueIndex: null
};

function setHint(text, kind = 'info') {
  hint.textContent = text;
  hint.dataset.kind = kind;
  if (kind === 'error') hint.style.color = 'var(--accent-pink)';
  else if (kind === 'busy') hint.style.color = 'var(--text-white)';
  else hint.style.color = 'var(--accent-cyan)';
}

function setStatus(text, kind = 'waiting') {
  statusPill.textContent = text.toUpperCase();
  statusPill.className = `badge ${kind === 'error' ? 'pink' : 'cyan'}`;
}

function setModelState(text, kind = 'waiting') {
  modelPill.textContent = text.toUpperCase();
  modelPill.className = `badge ${kind === 'error' ? 'pink' : 'cyan'}`;
}

function setDownloadDisabled(disabled) {
  if (disabled) {
    downloadLink.classList.add('disabled');
    downloadLink.style.opacity = '0.5';
    downloadLink.style.pointerEvents = 'none';
    downloadLink.removeAttribute('href');
    downloadLink.removeAttribute('download');
  } else {
    downloadLink.classList.remove('disabled');
    downloadLink.style.opacity = '1';
    downloadLink.style.pointerEvents = 'auto';
  }
}

function setAudioBlob(blob, filename = null) {
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  const url = URL.createObjectURL(blob);
  state.objectUrl = url;
  audioPlayer.src = url;
  downloadLink.href = url;
  downloadLink.download = filename || `waifuvoice_voxcpm_${Date.now()}.wav`;
  setDownloadDisabled(false);
}

function defaultLlmOptions() {
  return {
    enabled: false,
    provider: 'lmstudio',
    endpoint: 'http://127.0.0.1:1234',
    model: '',
    context_tokens: 4096
  };
}

function readLlmOptions() {
  try {
    return { ...defaultLlmOptions(), ...JSON.parse(localStorage.getItem(LLM_OPTIONS_KEY) || '{}') };
  } catch {
    return defaultLlmOptions();
  }
}

function writeLlmOptions(options) {
  localStorage.setItem(LLM_OPTIONS_KEY, JSON.stringify({ ...defaultLlmOptions(), ...options }, null, 2));
}

function readCloneToolsEnabled() {
  try {
    return JSON.parse(localStorage.getItem(CLONE_TOOLS_KEY) || 'false') === true;
  } catch {
    return false;
  }
}

function writeCloneToolsEnabled(enabled) {
  localStorage.setItem(CLONE_TOOLS_KEY, JSON.stringify(!!enabled));
}

function readDialogueHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TSUKI_DIALOGUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDialogueHistory(items) {
  localStorage.setItem(TSUKI_DIALOGUE_KEY, JSON.stringify(items.slice(0, 25), null, 2));
}

function setTsukiDialogue(text, item = null) {
  const box = $('#tsuki-dialogue-text');
  if (!box) return;
  box.textContent = text || 'Enable a local LLM in Options, then ask for feedback on a generated voice.';
  box.classList.toggle('tsuki-dialogue-empty', !text);
  if (item) box.dataset.dialogueId = item.id;
}

function addTsukiDialogue(record, reply) {
  const item = {
    id: `dialogue-${Date.now()}`,
    created_at: new Date().toISOString(),
    filename: record.filename || '',
    question: 'How can I improve this voice?',
    reply
  };
  state.dialogueHistory = [item, ...state.dialogueHistory].slice(0, 25);
  state.activeDialogueIndex = null;
  writeDialogueHistory(state.dialogueHistory);
  setTsukiDialogue(reply, item);
  return item;
}

function loadDialogueHistory() {
  state.dialogueHistory = readDialogueHistory();
  const latest = state.dialogueHistory[0];
  if (latest) setTsukiDialogue(latest.reply, latest);
}

function openModal(id) {
  document.getElementById(id)?.classList.add('active');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
}

function populateOptionsModal() {
  const options = readLlmOptions();
  $('#llm-enabled-input').checked = !!options.enabled;
  $('#llm-provider-input').value = options.provider;
  $('#llm-endpoint-input').value = options.endpoint;
  $('#llm-model-input').value = options.model || '';
  $('#llm-context-input').value = Number(options.context_tokens) === 8192 ? '8192' : '4096';
  $('#clone-tools-enabled-input').checked = !!state.cloneToolsEnabled;
}

function saveOptionsFromModal() {
  state.cloneToolsEnabled = $('#clone-tools-enabled-input').checked;
  writeCloneToolsEnabled(state.cloneToolsEnabled);
  const options = {
    enabled: $('#llm-enabled-input').checked,
    provider: $('#llm-provider-input').value,
    endpoint: $('#llm-endpoint-input').value.trim(),
    model: $('#llm-model-input').value.trim(),
    context_tokens: Number($('#llm-context-input').value || 4096) === 8192 ? 8192 : 4096
  };
  writeLlmOptions(options);
  syncCloneToolsVisibility();
  setHint('Options saved.', 'ok');
  closeModal('options-modal');
}

function buildFeedbackRecord(record) {
  return {
    filename: record.filename || '',
    mode: record.mode || '',
    language: record.language || '',
    text: record.text || '',
    voice_design: record.voice_design || '',
    prompt_text: record.prompt_text || '',
    seed: record.seed,
    cfg_value: record.cfg_value,
    inference_timesteps: record.inference_timesteps,
    max_len: record.max_len,
    denoise: record.denoise,
    preset_state: record.preset_state || {}
  };
}

async function requestVoiceFeedback(filename) {
  const record = findOutput(filename);
  if (!record) return;
  const options = readLlmOptions();
  if (!options.enabled) {
    setTsukiDialogue('Local LLM feedback is disabled. Open Options, enable it, and add your LM Studio or Ollama endpoint.');
    setHint('Enable local LLM feedback in Options first.', 'error');
    return;
  }
  if (!options.endpoint) {
    setHint('Set a local LLM endpoint in Options first.', 'error');
    return;
  }
  setTsukiDialogue('Reading this take and asking the local LLM how to improve the voice...');
  setHint('Requesting local LLM feedback...', 'busy');
  try {
    const res = await fetch(apiPath('/api/llm_feedback'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: options.provider,
        endpoint: options.endpoint,
        model: options.model || 'local-model',
        context_tokens: options.context_tokens || 4096,
        record: buildFeedbackRecord(record)
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Feedback HTTP ${res.status}`);
    addTsukiDialogue(record, data.reply);
    setHint('Tsuki Hoshi feedback received.', 'ok');
  } catch (err) {
    setTsukiDialogue(`I could not reach the local LLM: ${err.message}`);
    setHint(`Local LLM feedback failed: ${err.message}`, 'error');
  }
}

function renderDialogueHistoryModal() {
  const list = $('#dialogue-history-list');
  if (!list) return;
  list.innerHTML = '';
  if (!state.dialogueHistory.length) {
    list.innerHTML = '<div class="empty-history">No Tsuki Hoshi feedback yet.</div>';
    return;
  }
  state.dialogueHistory.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dialogue-history-item';
    button.dataset.index = String(index);
    button.innerHTML = `<strong>${escapeHtml(item.filename || 'Feedback')}</strong><span>${escapeHtml(item.reply.slice(0, 180))}</span>`;
    list.appendChild(button);
  });
}

function setParams(params = {}) {
  if (params.cfg_value !== undefined) {
    $('#cfg-input').value = params.cfg_value;
    $('#val-cfg').textContent = params.cfg_value;
  }
  if (params.inference_timesteps !== undefined) {
    $('#steps-input').value = params.inference_timesteps;
    $('#val-steps').textContent = params.inference_timesteps;
  }
  if (params.max_len !== undefined) {
    $('#maxlen-input').value = params.max_len;
    $('#val-maxlen').textContent = params.max_len;
  }
  if (params.seed !== undefined) {
    $('#seed-input').value = params.seed;
  }
}

async function refreshHealth() {
  try {
    const res = await fetch(apiPath('/api/health'));
    const data = await res.json();
    setStatus('Backend Online', 'ok');
    if (data.loaded) {
      setModelState(`${data.model_source || 'VoxCPM2'} loaded - ${data.sample_rate || 44100} Hz`, 'ok');
      setHint('Model is loaded and ready.', 'ok');
    } else {
      setModelState(`${data.model_source || 'VoxCPM2'} not loaded yet`, 'waiting');
      setHint('Model has not loaded yet. First generate will load it.', 'info');
    }
  } catch (err) {
    setStatus('Backend Offline', 'error');
    setModelState('VoxCPM2 status unknown', 'error');
    setHint(`Health check failed: ${err.message}`, 'error');
  }
}

function byId(list, id) {
  return (list || []).find((item) => item.id === id) || null;
}

function slugify(value) {
  return String(value || 'persona')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'persona';
}

function getLanguageValue() {
  return $('#language-select')?.value || 'English';
}

function setLanguageValue(value) {
  const select = $('#language-select');
  if (!select || !value) return;
  const found = [...select.options].some((option) => option.value === value);
  if (!found) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  select.value = value;
  const current = $('#voice-language-current');
  if (current) current.textContent = value;
  document.querySelectorAll('.language-option').forEach((button) => {
    button.classList.toggle('active', button.dataset.languageValue === value);
  });
}

function populateLanguageSelect() {
  const select = $('#language-select');
  const grid = $('#language-grid');
  const languages = state.presetLibrary?.languages || [];
  if (!select || !languages.length) return;
  const current = select.value || 'English';
  select.innerHTML = '';
  if (grid) grid.innerHTML = '';
  languages.forEach((language) => {
    const option = document.createElement('option');
    option.value = language.value || language.label;
    option.textContent = language.label || language.value;
    option.dataset.id = language.id || '';
    select.appendChild(option);
    if (grid) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'language-option';
      button.dataset.languageValue = language.value || language.label;
      button.dataset.languageId = language.id || '';
      button.innerHTML = `<strong>${escapeHtml(language.label || language.value)}</strong><small>${escapeHtml(language.family || 'VoxCPM2 voice language')}</small>`;
      grid.appendChild(button);
    }
  });
  setLanguageValue(current);
}

function readCustomPersonas() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_PERSONAS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCustomPersonas(personas) {
  localStorage.setItem(CUSTOM_PERSONAS_KEY, JSON.stringify(personas, null, 2));
}

function upsertLocalCustomPersona(persona) {
  const normalized = normalizePersona(persona);
  const personas = readCustomPersonas().filter((item) => item.id !== normalized.id);
  personas.push(normalized);
  writeCustomPersonas(personas);
  if (state.presetLibrary) {
    state.presetLibrary.personas = mergePersonas(state.presetLibrary.personas || [], personas);
  }
  return normalized;
}

async function loadCustomPersonas() {
  try {
    const res = await fetch(apiPath('/api/personas/custom'), { cache: 'no-store' });
    if (!res.ok) throw new Error(`Custom personas HTTP ${res.status}`);
    const data = await res.json();
    const personas = Array.isArray(data) ? data : data.personas;
    state.customPersonaBackendAvailable = true;
    return Array.isArray(personas) ? personas.map(normalizePersona) : [];
  } catch {
    state.customPersonaBackendAvailable = false;
    return readCustomPersonas();
  }
}

async function upsertCustomPersona(persona) {
  const normalized = normalizePersona(persona);
  try {
    const res = await fetch(apiPath('/api/personas/custom'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: normalized })
    });
    if (!res.ok) throw new Error(`Custom persona save HTTP ${res.status}`);
    const data = await res.json();
    const saved = normalizePersona(data.persona || normalized);
    const personas = Array.isArray(data.personas) ? data.personas.map(normalizePersona) : [saved];
    state.customPersonaBackendAvailable = true;
    if (state.presetLibrary) {
      state.presetLibrary.personas = mergePersonas(state.presetLibrary.personas || [], personas);
    }
    return saved;
  } catch {
    state.customPersonaBackendAvailable = false;
    return upsertLocalCustomPersona(normalized);
  }
}

function mergePersonas(basePersonas, customPersonas) {
  const byPersonaId = new Map();
  [...(basePersonas || []), ...(customPersonas || [])].forEach((persona) => {
    if (persona?.id) byPersonaId.set(persona.id, normalizePersona(persona));
  });
  return [...byPersonaId.values()];
}

function parseTagList(value) {
  return String(value || '')
    .split(/[,;\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatTagList(tags) {
  return Array.isArray(tags) ? tags.filter(Boolean).join(', ') : parseTagList(tags).join(', ');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitVoiceDesignSections(text) {
  const source = String(text || '').trim();
  if (!source) {
    return { voice_attribute: '', environment: '', detailed_notes: '' };
  }
  const aliases = [
    { key: 'voice_attribute', names: ['Voice Attribute', 'Voice Information', 'Voice Design'] },
    { key: 'environment', names: ['Environment'] },
    { key: 'detailed_notes', names: ['Detailed notes', 'Detailed Notes', "Director's Notes", 'Director Notes'] }
  ];
  const lookup = new Map();
  aliases.forEach(({ key, names }) => {
    names.forEach((name) => lookup.set(name.toLowerCase(), key));
  });
  const markerPattern = aliases.flatMap(({ names }) => names.map(escapeRegex)).join('|');
  const markerRe = new RegExp(`(?:^|\\s)(${markerPattern})\\s*:`, 'gi');
  const hits = [];
  let match;
  while ((match = markerRe.exec(source)) !== null) {
    hits.push({
      name: match[1].toLowerCase(),
      start: match.index,
      valueStart: match.index + match[0].length
    });
  }
  if (!hits.length) {
    return {
      voice_attribute: source,
      environment: '',
      detailed_notes: ''
    };
  }
  const sections = { voice_attribute: '', environment: '', detailed_notes: '' };
  hits.forEach((hit, index) => {
    const key = lookup.get(hit.name);
    if (!key) return;
    const next = hits[index + 1];
    const value = source.slice(hit.valueStart, next ? next.start : source.length).trim();
    if (value && !sections[key]) sections[key] = value;
  });
  if (!sections.voice_attribute && sections.environment && sections.detailed_notes) {
    sections.voice_attribute = source;
    sections.environment = '';
    sections.detailed_notes = '';
  }
  return sections;
}

function composeVoiceDesignText(parts = {}) {
  const sections = [
    parts.voice_attribute && `Voice Attribute: ${parts.voice_attribute.trim()}`,
    parts.environment && `Environment: ${parts.environment.trim()}`,
    parts.detailed_notes && `Detailed notes: ${parts.detailed_notes.trim()}`
  ].filter(Boolean);
  return sections.join('\n\n');
}

function normalizePersona(input = {}) {
  const title = input.title || input.name || input.label || 'Custom Persona';
  const label = input.label || title.replace(/,\s*the\s*/i, ' ').split(' ').slice(0, 3).join(' ');
  const voiceDesign = input.voice_design || input.voiceInformation || input.voice_information || input.prompt || input.voice || '';
  return {
    id: input.id || slugify(title),
    label,
    title,
    voice_design: voiceDesign,
    background: input.background || '',
    personality: input.personality || '',
    language: input.language || 'English',
    sample: input.sample || input.text || '',
    tags: Array.isArray(input.tags) ? input.tags : parseTagList(input.tags)
  };
}

function personaFromCurrentForm() {
  const title = selectedPresetParts().persona?.title || 'Current Voice Design';
  return normalizePersona({
    title,
    label: selectedPresetParts().persona?.label || 'Current Voice',
    voice_design: $('#voice-input').value.trim(),
    language: getLanguageValue(),
    sample: $('#text-input').value.trim(),
    tags: ['custom']
  });
}

function parsePersonaMarkdown(text) {
  const titleMatch = text.match(/^\s*#\s+(.+)$/m);
  const labeledTitle = text.match(/^\s*([^:\n]+?)\s*\(([^)\n]+)\)\s*$/m);
  const section = (...names) => {
    const pattern = names.map(escapeRegex).join('|');
    const re = new RegExp(`(?:^|\\n)\\s*(?:${pattern})\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:Title|Label|Voice Attribute|Environment|Detailed notes|Voice Information|Voice Design|Background|Personality|Target Language|Sample Line|Tags)\\s*:|$)`, 'i');
    return text.match(re)?.[1]?.trim() || '';
  };
  const title = section('Title') || titleMatch?.[1]?.trim() || (labeledTitle ? `${labeledTitle[1].trim()} (${labeledTitle[2].trim()})` : 'Imported Persona');
  const label = section('Label') || (labeledTitle ? labeledTitle[1].trim() : title.split(',')[0].trim());
  const voiceSections = splitVoiceDesignSections(section('Voice Design', 'Voice Information', 'Voice Attribute'));
  const voiceDesign = composeVoiceDesignText(voiceSections) || text.trim();
  return normalizePersona({
    title,
    label,
    voice_design: voiceDesign,
    background: section('Background'),
    personality: section('Personality'),
    language: section('Target Language') || 'English',
    sample: section('Sample Line'),
    tags: parseTagList(section('Tags'))
  });
}

function parsePersonaText(text, filename = '') {
  if (filename.toLowerCase().endsWith('.md')) return parsePersonaMarkdown(text);
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(normalizePersona);
    return normalizePersona(parsed.persona || parsed);
  } catch {
    return parsePersonaMarkdown(text);
  }
}

function personaToMarkdown(persona) {
  const sections = splitVoiceDesignSections(persona.voice_design);
  return [
    `# ${persona.title || persona.label || 'Persona'}`,
    '',
    `Label: ${persona.label || ''}`,
    '',
    composeVoiceDesignText(sections) || 'Voice Attribute:',
    '',
    `Background: ${persona.background || ''}`,
    '',
    `Personality: ${persona.personality || ''}`,
    '',
    `Target Language: ${persona.language || 'English'}`,
    '',
    `Sample Line: ${persona.sample || ''}`,
    '',
    `Tags: ${formatTagList(persona.tags)}`
  ].join('\n');
}

function createPersonaLabTemplate(seed = {}) {
  const persona = normalizePersona(seed || {});
  const voiceSections = splitVoiceDesignSections(persona.voice_design);
  return normalizePersona({
    id: persona.id || '',
    title: persona.title || 'New Persona',
    label: persona.label || persona.title || 'New Persona',
    voice_design: composeVoiceDesignText(voiceSections),
    background: persona.background || '',
    personality: persona.personality || '',
    language: persona.language || getLanguageValue(),
    sample: persona.sample || '',
    tags: persona.tags || []
  });
}

function readPersonaLabDraft() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PERSONA_LAB_DRAFT_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      baseId: parsed.baseId || 'new',
      persona: createPersonaLabTemplate(parsed.persona || parsed)
    };
  } catch {
    return null;
  }
}

function writePersonaLabDraft(draft) {
  if (!draft?.persona) return;
  localStorage.setItem(
    PERSONA_LAB_DRAFT_KEY,
    JSON.stringify({
      baseId: draft.baseId || 'new',
      persona: draft.persona
    }, null, 2)
  );
}

function clearPersonaLabDraft() {
  localStorage.removeItem(PERSONA_LAB_DRAFT_KEY);
}

function populatePersonaLabLanguageSelect(selected = null) {
  const select = $('#persona-lab-language');
  if (!select) return;
  const languages = state.presetLibrary?.languages || [{ label: 'English', value: 'English' }];
  const current = selected || select.value || getLanguageValue();
  select.innerHTML = '';
  languages.forEach((language) => {
    const option = document.createElement('option');
    option.value = language.value || language.label;
    option.textContent = language.label || language.value;
    select.appendChild(option);
  });
  select.value = current;
}

function readPersonaLabForm() {
  const sections = {
    voice_attribute: $('#persona-lab-voice-attribute')?.value.trim() || '',
    environment: $('#persona-lab-environment')?.value.trim() || '',
    detailed_notes: $('#persona-lab-detailed-notes')?.value.trim() || ''
  };
  return normalizePersona({
    id: state.personaLab?.baseId && state.personaLab.baseId !== 'new' ? state.personaLab.baseId : '',
    title: $('#persona-lab-title')?.value.trim() || 'New Persona',
    label: $('#persona-lab-label')?.value.trim() || '',
    voice_design: composeVoiceDesignText(sections),
    background: $('#persona-lab-background')?.value.trim() || '',
    personality: $('#persona-lab-personality')?.value.trim() || '',
    language: $('#persona-lab-language')?.value || getLanguageValue(),
    sample: $('#persona-lab-sample')?.value.trim() || '',
    tags: parseTagList($('#persona-lab-tags')?.value || '')
  });
}

function populatePersonaLabForm(persona) {
  const draft = createPersonaLabTemplate(persona || {});
  const sections = splitVoiceDesignSections(draft.voice_design);
  $('#persona-lab-title').value = draft.title || '';
  $('#persona-lab-label').value = draft.label || '';
  populatePersonaLabLanguageSelect(draft.language || getLanguageValue());
  $('#persona-lab-voice-attribute').value = sections.voice_attribute || '';
  $('#persona-lab-environment').value = sections.environment || '';
  $('#persona-lab-detailed-notes').value = sections.detailed_notes || '';
  $('#persona-lab-background').value = draft.background || '';
  $('#persona-lab-personality').value = draft.personality || '';
  $('#persona-lab-sample').value = draft.sample || '';
  $('#persona-lab-tags').value = formatTagList(draft.tags);
}

function previewOrPlaceholder(value, placeholder = 'Not set yet.') {
  const text = String(value || '').trim();
  return text || placeholder;
}

function updatePersonaLabPreview(persona = readPersonaLabForm()) {
  if (!persona) return;
  const sections = splitVoiceDesignSections(persona.voice_design);
  const voiceDesign = composeVoiceDesignText(sections) || 'Voice Attribute:';
  const tags = Array.isArray(persona.tags) ? persona.tags : parseTagList(persona.tags);
  const titleNode = $('#persona-lab-preview-title');
  const labelNode = $('#persona-lab-preview-label');
  const tagNode = $('#persona-lab-preview-tags');
  const voiceNode = $('#persona-lab-preview-voice');
  const backgroundNode = $('#persona-lab-preview-background');
  const personalityNode = $('#persona-lab-preview-personality');
  const sampleNode = $('#persona-lab-preview-sample');
  const markdownNode = $('#persona-lab-preview-markdown');
  const statusNode = $('#persona-lab-status');
  if (titleNode) titleNode.textContent = persona.title || 'New Persona';
  if (labelNode) labelNode.textContent = persona.label || 'Label preview';
  if (statusNode) statusNode.textContent = state.personaLab?.baseId && state.personaLab.baseId !== 'new'
    ? `Editing ${persona.label || persona.title || 'persona'}`
    : 'Create or refine a custom voice design.';
  if (tagNode) {
    tagNode.innerHTML = '';
    (tags.length ? tags : ['No tags']).forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'persona-lab-chip';
      chip.textContent = tag;
      tagNode.appendChild(chip);
    });
  }
  if (voiceNode) voiceNode.textContent = previewOrPlaceholder(voiceDesign, 'Write the voice attribute, environment, and detailed notes.');
  if (backgroundNode) backgroundNode.textContent = previewOrPlaceholder(persona.background, 'Optional background text.');
  if (personalityNode) personalityNode.textContent = previewOrPlaceholder(persona.personality, 'Optional personality text.');
  if (sampleNode) sampleNode.textContent = previewOrPlaceholder(persona.sample, 'Optional sample line.');
  if (markdownNode) markdownNode.textContent = personaToMarkdown(persona);
}

function syncPersonaLabFromForm() {
  if (!state.personaLab) return;
  const persona = readPersonaLabForm();
  state.personaLab = { ...state.personaLab, persona };
  writePersonaLabDraft(state.personaLab);
  updatePersonaLabPreview(persona);
}

function openPersonaLab(seed = null) {
  const selected = seed ? normalizePersona(seed) : selectedPresetParts().persona;
  const baseId = selected?.id || 'new';
  const stored = readPersonaLabDraft();
  const draft = state.personaLab && state.personaLab.baseId === baseId
    ? state.personaLab
    : stored && stored.baseId === baseId
      ? stored
      : { baseId, persona: createPersonaLabTemplate(selected || personaFromCurrentForm()) };
  state.personaLab = {
    baseId: draft.baseId || baseId,
    persona: createPersonaLabTemplate(draft.persona || selected || personaFromCurrentForm())
  };
  populatePersonaLabForm(state.personaLab.persona);
  updatePersonaLabPreview(state.personaLab.persona);
  renderPersonaLabPicker();
  openModal('persona-lab-modal');
}

function switchPersonaLabPersona(personaId) {
  const selected = byId(state.presetLibrary?.personas, personaId);
  if (!selected) return;
  syncPersonaLabFromForm();
  state.personaLab = {
    baseId: selected.id,
    persona: createPersonaLabTemplate(selected)
  };
  populatePersonaLabForm(state.personaLab.persona);
  updatePersonaLabPreview(state.personaLab.persona);
  renderPersonaLabPicker();
  writePersonaLabDraft(state.personaLab);
  setHint(`Loaded ${selected.label || selected.title} into Persona Lab.`, 'info');
}

function newPersonaLabDraft() {
  state.personaLab = {
    baseId: 'new',
    persona: createPersonaLabTemplate({
      title: 'New Persona',
      label: 'New Persona',
      language: getLanguageValue()
    })
  };
  populatePersonaLabForm(state.personaLab.persona);
  updatePersonaLabPreview(state.personaLab.persona);
  writePersonaLabDraft(state.personaLab);
  renderPersonaLabPicker();
  setHint('Persona Lab reset to a new draft.', 'info');
}

function duplicatePersonaLabDraft() {
  const persona = readPersonaLabForm();
  const title = `${persona.title || persona.label || 'Persona'} Copy`;
  state.personaLab = {
    baseId: 'new',
    persona: createPersonaLabTemplate({
      ...persona,
      id: '',
      title,
      label: title,
      language: persona.language || getLanguageValue()
    })
  };
  populatePersonaLabForm(state.personaLab.persona);
  updatePersonaLabPreview(state.personaLab.persona);
  writePersonaLabDraft(state.personaLab);
  renderPersonaLabPicker();
  setHint('Persona Lab duplicated into a new draft.', 'ok');
}

async function savePersonaLabDraft() {
  const persona = readPersonaLabForm();
  const sections = splitVoiceDesignSections(persona.voice_design);
  if (!sections.voice_attribute.trim()) {
    setHint('Persona Lab needs a voice attribute before saving.', 'error');
    return null;
  }
  const saved = normalizePersona({
    ...persona,
    id: state.personaLab?.baseId && state.personaLab.baseId !== 'new' ? state.personaLab.baseId : persona.id
  });
  const persisted = await upsertCustomPersona(saved);
  state.personaLab = { baseId: persisted.id, persona: createPersonaLabTemplate(persisted) };
  writePersonaLabDraft(state.personaLab);
  state.activePresetTab = 'personas';
  state.presetSelections.persona = persisted.id;
  state.presetSelections.voice = null;
  state.presetSelections.mood = null;
  state.presetSelections.style = null;
  state.presetSelections.scene = null;
  renderPresetTabs();
  renderPresetGrid();
  renderPersonaLabPicker();
  updatePresetBlendLabel();
  populatePersonaLabForm(persisted);
  updatePersonaLabPreview(persisted);
  setHint(`Saved persona ${persisted.label}.`, 'ok');
  return persisted;
}

function applyPersonaLabToMainForm() {
  const persona = readPersonaLabForm();
  const voiceDesign = composeVoiceDesignText(splitVoiceDesignSections(persona.voice_design));
  if (voiceDesign) $('#voice-input').value = voiceDesign;
  if (persona.sample) $('#text-input').value = persona.sample;
  if (persona.language) setLanguageValue(persona.language);
  if (state.presetLibrary && byId(state.presetLibrary.personas, persona.id)) {
    state.activePresetTab = 'personas';
    state.presetSelections.persona = persona.id;
    state.presetSelections.voice = null;
    state.presetSelections.mood = null;
    state.presetSelections.style = null;
    state.presetSelections.scene = null;
    renderPresetTabs();
    renderPresetGrid();
    updatePresetBlendLabel();
  }
  renderPersonaLabPicker();
  setHint('Persona applied to the main synthesis form.', 'ok');
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function selectedPresetParts() {
  const lib = state.presetLibrary || {};
  return {
    persona: byId(lib.personas, state.presetSelections.persona),
    voice: byId(lib.voices, state.presetSelections.voice),
    mood: byId(lib.moods, state.presetSelections.mood),
    style: byId(lib.styles, state.presetSelections.style),
    language: byId(lib.languages, state.presetSelections.language),
    scene: byId(lib.scenes, state.presetSelections.scene)
  };
}

function presetSummary() {
  const parts = selectedPresetParts();
  const labels = [parts.persona, parts.voice, parts.mood, parts.style, parts.language, parts.scene]
    .filter(Boolean)
    .map((item) => item.label);
  return labels.length ? labels.join(' / ') : 'No blend selected';
}

function buildVoicePrompt(parts = selectedPresetParts()) {
  return [parts.persona?.voice_design, parts.voice?.prompt, parts.mood?.prompt, parts.style?.prompt]
    .filter(Boolean)
    .join(' ');
}

function currentPresetState() {
  const parts = selectedPresetParts();
  return {
    selections: { ...state.presetSelections },
    labels: {
      persona: parts.persona?.label || '',
      voice: parts.voice?.label || '',
      mood: parts.mood?.label || '',
      style: parts.style?.label || '',
      language: parts.language?.label || '',
      scene: parts.scene?.label || ''
    },
    persona: parts.persona || null,
    voice_prompt: buildVoicePrompt(parts)
  };
}

function renderPresetTabs() {
  const tabs = $('#preset-tabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  PRESET_TABS.forEach((tab) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `preset-tab${state.activePresetTab === tab.key ? ' active' : ''}`;
    btn.dataset.tab = tab.key;
    btn.textContent = tab.label;
    tabs.appendChild(btn);
  });
}

function renderPresetGrid() {
  const grid = $('#preset-grid');
  const lib = state.presetLibrary;
  if (!grid || !lib) return;
  const tab = PRESET_TABS.find((item) => item.key === state.activePresetTab) || PRESET_TABS[0];
  const selectedId = state.presetSelections[tab.stateKey];
  grid.classList.toggle('persona-compact', tab.key === 'personas');
  grid.innerHTML = '';
  (lib[tab.key] || []).forEach((item) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `preset-card${selectedId === item.id ? ' active' : ''}`;
    card.dataset.category = tab.key;
    card.dataset.stateKey = tab.stateKey;
    card.dataset.id = item.id;
    const detail = tab.key === 'personas' ? '' : (item.voice_design || item.prompt || item.sample || item.text || item.personality || (item.tags || []).join(', '));
    card.innerHTML = `<strong>${escapeHtml(item.label || item.title || 'Persona')}</strong>${detail ? `<span>${escapeHtml(detail || '')}</span>` : ''}`;
    grid.appendChild(card);
  });
  updatePresetBlendLabel();
}

function renderPersonaLabPicker() {
  const list = $('#persona-lab-picker');
  const count = $('#persona-lab-library-count');
  const personas = state.presetLibrary?.personas || [];
  const activeId = state.personaLab?.baseId && state.personaLab.baseId !== 'new'
    ? state.personaLab.baseId
    : state.personaLab?.persona?.id || null;
  if (count) count.textContent = `${personas.length} persona${personas.length === 1 ? '' : 's'}`;
  if (!list) return;
  list.innerHTML = '';
  if (!personas.length) {
    list.innerHTML = '<div class="empty-history">No personas loaded yet.</div>';
    return;
  }
  personas.forEach((persona) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `persona-lab-persona${activeId === persona.id ? ' active' : ''}`;
    button.dataset.personaId = persona.id;
    button.title = persona.title || persona.label || 'Persona';
    button.innerHTML = `<strong>${escapeHtml(persona.label || persona.title || 'Persona')}</strong>`;
    list.appendChild(button);
  });
}

function scriptSampleButton(item) {
  const sample = item.text || '';
  return `
    <button class="script-sample-chip" type="button" data-script-sample="${escapeHtml(item.id)}" title="${escapeHtml(item.sample_context || sample)}">
      <strong>${escapeHtml(item.label || 'Script Sample')}</strong>
      <span>${escapeHtml(sample)}</span>
    </button>
  `;
}

function measureScriptSampleTicker() {
  const track = $('#script-sample-track');
  if (!track) return;
  const groups = track.querySelectorAll('.script-sample-group');
  if (groups.length < 2) return;
  const advance = groups[1].offsetLeft - groups[0].offsetLeft;
  if (advance <= 0) return;
  track.style.setProperty('--sample-shift', `${advance}px`);
  track.style.animationDuration = `${(advance / SCRIPT_SAMPLE_SPEED).toFixed(2)}s`;
}

function renderScriptSamples() {
  const rail = $('#script-sample-track');
  const lib = state.presetLibrary;
  if (!rail || !lib) return;
  const samples = lib.script_samples || [];
  if (!samples.length) {
    rail.innerHTML = '';
    return;
  }
  const group = `<div class="script-sample-group">${samples.map(scriptSampleButton).join('')}</div>`;
  rail.innerHTML = group + group;
  window.requestAnimationFrame(measureScriptSampleTicker);
}

function updatePresetBlendLabel() {
  const label = $('#preset-active-blend');
  if (label) label.textContent = presetSummary();
}

function selectPresetItem(stateKey, id) {
  state.presetSelections[stateKey] = id;
  if (stateKey === 'persona') {
    state.presetSelections.voice = null;
    state.presetSelections.mood = null;
    state.presetSelections.style = null;
    state.presetSelections.scene = null;
  }
  if (stateKey === 'voice') state.presetSelections.persona = null;
  renderPresetGrid();
  updatePresetBlendLabel();
}

function applySelectedPreset({ includeSample = false } = {}) {
  const parts = selectedPresetParts();
  const voicePrompt = buildVoicePrompt(parts);
  if (voicePrompt) $('#voice-input').value = voicePrompt;
  if (parts.persona?.language) setLanguageValue(parts.persona.language);
  if (parts.language?.value) setLanguageValue(parts.language.value);
  if (parts.style?.params) setParams(parts.style.params);
  const sample = parts.persona?.sample || parts.scene?.text || parts.language?.sample;
  if (includeSample && sample) $('#text-input').value = sample;
  setHint(`Preset blend loaded: ${presetSummary()}`, 'info');
}

function injectScriptSample(sampleId) {
  const sample = byId(state.presetLibrary?.script_samples, sampleId);
  if (!sample?.text) return;
  $('#text-input').value = sample.text;
  setHint(`Script sample inserted: ${sample.label}`, 'ok');
}

function resetPresetBlend() {
  state.presetSelections = {
    persona: null,
    voice: null,
    mood: null,
    style: null,
    language: null,
    scene: null
  };
  renderPresetGrid();
  updatePresetBlendLabel();
  setHint('Preset blend reset.', 'info');
}

async function loadPresetLibrary() {
  try {
    const res = await fetch(`${FRONTEND_BASE}data/presets.json`);
    if (!res.ok) throw new Error(`Preset library HTTP ${res.status}`);
    state.presetLibrary = await res.json();
    state.presetLibrary.personas = mergePersonas(state.presetLibrary.personas || [], await loadCustomPersonas());
    populateLanguageSelect();
    populatePersonaLabLanguageSelect(state.personaLab?.persona?.language || getLanguageValue());
    renderPresetTabs();
    renderPresetGrid();
    renderPersonaLabPicker();
    renderScriptSamples();
  } catch (err) {
    setHint(`Preset library failed: ${err.message}`, 'error');
  }
}

async function generate() {
  const text = $('#text-input').value.trim();
  const voice_design = $('#voice-input').value.trim();
  const language = getLanguageValue();
  const cfg_value = Number($('#cfg-input').value || 2.0);
  const inference_timesteps = Number($('#steps-input').value || 10);
  const max_len = Number($('#maxlen-input').value || 4096);
  const seed = Number($('#seed-input').value || -1);
  const denoise = $('#denoise-input').checked;
  const activeMode = state.uploadToolsOpen ? state.currentMode : 0;
  const mode = MODE_IDS[activeMode] || 'voice-design';
  const consent_ack = $('#consent-input')?.checked || false;

  if (!text) {
    setHint('Please enter a script first.', 'error');
    return;
  }
  if (mode !== 'voice-design' && !consent_ack) {
    setHint('Please confirm consent for uploaded voice material first.', 'error');
    return;
  }

  let ref_audio_base64 = null;
  let prompt_audio_base64 = null;
  const prompt_text = $('#prompt-text-input').value.trim();

  const fileToB64 = (file) => new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });

  if (activeMode === 1) {
    ref_audio_base64 = await fileToB64($('#ref-audio-input').files[0]);
  } else if (activeMode === 2) {
    prompt_audio_base64 = await fileToB64($('#prompt-audio-input').files[0]);
  }

  const payload = {
    text,
    language,
    mode,
    voice_design: activeMode === 0 ? voice_design : null,
    ref_audio_base64,
    prompt_audio_base64,
    prompt_text: activeMode === 2 ? prompt_text : null,
    cfg_value,
    inference_timesteps,
    max_len,
    seed,
    denoise,
    preset_state: currentPresetState(),
    consent_ack
  };

  state.isGenerating = true;
  let generationSucceeded = false;
  renderHistory();
  setStatus('GENERATING', 'busy');
  setHint('Synthesizing audio via VoxCPM...', 'busy');
  rawStatus.textContent = '> Processing text-to-speech request...';
  $('#generate-btn').disabled = true;
  startWalking();

  try {
    const res = await fetch(apiPath('/api/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text());
    const filename = res.headers.get('X-Output-Filename');
    const blob = await res.blob();
    setAudioBlob(blob, filename);
    rawStatus.textContent = '> Audio generated and loaded into the player.';
    setStatus('DONE', 'ok');
    setHint('Audio generation finished perfectly.', 'ok');
    await loadHistory();
    const autoplay = $('#autoplay-input');
    if (autoplay && autoplay.checked) audioPlayer.play().catch(() => {});
    generationSucceeded = true;
  } catch (err) {
    setStatus('ERROR', 'error');
    setHint(err.message, 'error');
    rawStatus.textContent = `> FATAL ERROR\n> ${err.message}`;
    triggerErrorState();
  } finally {
    state.isGenerating = false;
    $('#generate-btn').disabled = false;
    stopWalking({ celebrate: generationSucceeded });
    renderHistory();
  }
}

function normalizeOutputRecord(record) {
  if (typeof record === 'string') {
    return { filename: record, url: `/outputs/${record}`, preset_state: {} };
  }
  return record;
}

async function loadHistory() {
  try {
    const res = await fetch(apiPath('/api/outputs'));
    if (!res.ok) return;
    const data = await res.json();
    state.outputs = (Array.isArray(data) ? data : []).map(normalizeOutputRecord);
    renderHistory();
    drawVisibleWaveforms();
  } catch (err) {
    console.warn('Could not load history:', err);
  }
}

function renderHistory() {
  if (!historyList) return;
  historyList.innerHTML = '';
  if (state.isGenerating) {
    const pending = document.createElement('div');
    pending.className = 'history-item';
    pending.innerHTML = '<div class="history-name">Generating current clip...</div><div class="history-meta">Queued in this session</div>';
    historyList.appendChild(pending);
  }
  if (!state.outputs.length && !state.isGenerating) {
    const empty = document.createElement('div');
    empty.className = 'empty-history';
    empty.textContent = 'No generated clips yet.';
    historyList.appendChild(empty);
    return;
  }
  state.outputs.slice(0, 7).forEach((record) => {
    const item = document.createElement('article');
    item.className = 'history-item';
    const url = apiPath(record.url || `/outputs/${record.filename}`);
    const summary = [
      record.mode || 'voice',
      record.language || 'unknown',
      record.seed !== undefined ? `seed ${record.seed}` : ''
    ].filter(Boolean).join(' / ');
    item.innerHTML = `
      <div class="history-top">
        <div>
          <div class="history-name" title="${escapeHtml(record.filename || '')}">${escapeHtml(record.filename || '')}</div>
          <div class="history-meta">${escapeHtml(summary)}</div>
        </div>
        <div class="history-actions">
          <button class="history-action" data-action="play" data-file="${escapeHtml(record.filename)}">Play</button>
          <button class="history-action" data-action="feedback" data-file="${escapeHtml(record.filename)}">Get Feedback</button>
        </div>
      </div>
      <canvas class="waveform" width="520" height="34" data-src="${url}"></canvas>
      <div class="history-meta">${escapeHtml((record.text || '').slice(0, 180))}</div>
    `;
    historyList.appendChild(item);
  });
}

async function drawVisibleWaveforms() {
  const canvases = [...document.querySelectorAll('.waveform:not([data-drawn])')].slice(0, 7);
  for (const canvas of canvases) {
    canvas.dataset.drawn = '1';
    try {
      await drawWaveform(canvas, canvas.dataset.src);
    } catch {
      drawWaveformFallback(canvas);
    }
  }
}

async function drawWaveform(canvas, src) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return drawWaveformFallback(canvas);
  const audioCtx = new AudioCtx();
  const res = await fetch(src);
  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const channel = audioBuffer.getChannelData(0);
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const step = Math.max(1, Math.floor(channel.length / width));
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(129,236,236,0.22)';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#81ecec';
  ctx.beginPath();
  for (let x = 0; x < width; x++) {
    let min = 1;
    let max = -1;
    for (let i = 0; i < step; i++) {
      const sample = channel[(x * step) + i] || 0;
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    const y1 = ((1 + min) * height) / 2;
    const y2 = ((1 + max) * height) / 2;
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
  }
  ctx.stroke();
  audioCtx.close?.();
}

function drawWaveformFallback(canvas) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(129,236,236,0.18)';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#81ecec';
  ctx.beginPath();
  for (let x = 0; x < width; x += 6) {
    const amp = 4 + Math.abs(Math.sin(x * 0.045)) * (height / 2 - 4);
    ctx.moveTo(x, height / 2 - amp / 2);
    ctx.lineTo(x, height / 2 + amp / 2);
  }
  ctx.stroke();
}

function findOutput(filename) {
  return state.outputs.find((record) => record.filename === filename);
}

function playOutput(filename) {
  const record = findOutput(filename);
  if (!record) return;
  audioPlayer.src = apiPath(record.url || `/outputs/${record.filename}`);
  downloadLink.href = audioPlayer.src;
  downloadLink.download = record.filename;
  setDownloadDisabled(false);
  audioPlayer.play().catch(() => {});
  setStatus('HISTORY LOADED', 'ok');
  setHint(`Playing: ${record.filename}`, 'ok');
}

function setMode(index) {
  state.currentMode = index === 2 ? 2 : 1;
  const pill = $('#toggle-pill');
  const panelIndex = state.currentMode === 2 ? 1 : 0;
  if (pill) pill.style.transform = `translateX(${panelIndex * 100}%)`;
  const btns = [$('#btn-mode-1'), $('#btn-mode-2')];
  btns.forEach((btn, i) => { if (btn) btn.classList.toggle('active', i === panelIndex); });
  const track = $('#slider-track');
  if (track) track.style.transform = `translateX(-${panelIndex * 50}%)`;
  document.querySelectorAll('.slider-pane').forEach((pane, i) => pane.classList.toggle('active-pane', i === panelIndex));
}

function setUploadToolsOpen(open) {
  if (!state.cloneToolsEnabled) open = false;
  state.uploadToolsOpen = open;
  if (!open) state.currentMode = 0;
  const panel = $('#upload-tools-panel');
  const btn = $('#btn-upload-tools');
  const consentPanel = $('#consent-panel');
  if (panel) panel.classList.toggle('active', open);
  if (btn) {
    btn.classList.toggle('active', open);
    btn.setAttribute('aria-expanded', String(open));
  }
  if (consentPanel) consentPanel.classList.toggle('active', open);
  if (open && state.currentMode === 0) setMode(1);
}

function syncCloneToolsVisibility() {
  const enabled = !!state.cloneToolsEnabled;
  const panel = $('#upload-tools-panel');
  const btn = $('#btn-upload-tools');
  const consentPanel = $('#consent-panel');
  if (btn) btn.hidden = !enabled;
  if (panel) panel.hidden = !enabled;
  if (consentPanel) consentPanel.hidden = !enabled;
  if (!enabled) setUploadToolsOpen(false);
}

// ==========================================
// TSUKI HOSHI MASCOT ENGINE
// ==========================================
const sprite = document.getElementById('mascot-chibi-sidebar');
const tsukiIdleSheet = `${FRONTEND_BASE}assets/img/tsuki_hoshi-alt-3x3-no-bg.png`;
const tsukiWalkSheet = `${FRONTEND_BASE}assets/img/tsuki_hoshi-walk-3x3-no-bg.png`;
const patientWaitingSequence = [3, 6, 7];
const celebrationSequence = [6, 7, 8];
const celebrationFrameDuration = 900;
const celebrationSettleDuration = 1040;
let isPatientlyWaiting = false;
let patientFrameIndex = 0;
let patientTimer = null;
let celebrationTimer = null;
let isCelebrating = false;
let isTouchAnimating = false;
let isScriptActive = false;
let isGuideHovering = false;

function setSpriteFrame(sheet, frame) {
  if (!sprite) return;
  sprite.style.backgroundImage = `url("${sheet}")`;
  sprite.style.backgroundSize = '300% 300%';
  sprite.style.backgroundRepeat = 'no-repeat';
  const col = frame % 3;
  const row = Math.floor(frame / 3);
  sprite.style.backgroundPosition = `calc(${col * 50}%) ${row * 50}%`;
}

function clearPatientTimer() {
  if (patientTimer) window.clearTimeout(patientTimer);
  patientTimer = null;
}

function clearCelebrationTimer() {
  if (celebrationTimer) window.clearTimeout(celebrationTimer);
  celebrationTimer = null;
}

function renderMascotIdleState() {
  if (!sprite || isPatientlyWaiting || isCelebrating || isTouchAnimating) return;
  if (isGuideHovering) {
    setSpriteFrame(tsukiIdleSheet, 8);
  } else if (isScriptActive) {
    setSpriteFrame(tsukiIdleSheet, 7);
  } else {
    setSpriteFrame(tsukiIdleSheet, 0);
  }
}

function stepPatientWaiting() {
  if (!isPatientlyWaiting) return;
  setSpriteFrame(tsukiWalkSheet, patientWaitingSequence[patientFrameIndex]);
  patientFrameIndex = (patientFrameIndex + 1) % patientWaitingSequence.length;
  patientTimer = window.setTimeout(stepPatientWaiting, 600);
}

function startWalking() {
  if (!sprite || isPatientlyWaiting) return;
  clearCelebrationTimer();
  isCelebrating = false;
  isPatientlyWaiting = true;
  patientFrameIndex = 0;
  sprite.classList.add('is-patiently-waiting');
  stepPatientWaiting();
}

function playCompletionCelebration() {
  if (!sprite) return;
  clearCelebrationTimer();
  isCelebrating = true;
  sprite.classList.add('is-celebrating');
  let celebrationFrameIndex = 0;
  const stepCelebration = () => {
    setSpriteFrame(tsukiWalkSheet, celebrationSequence[celebrationFrameIndex]);
    celebrationFrameIndex += 1;
    if (celebrationFrameIndex < celebrationSequence.length) {
      celebrationTimer = window.setTimeout(stepCelebration, celebrationFrameDuration);
      return;
    }
    celebrationTimer = window.setTimeout(() => {
      isCelebrating = false;
      sprite.classList.remove('is-celebrating');
      renderMascotIdleState();
    }, celebrationSettleDuration);
  };
  stepCelebration();
}

function stopWalking({ celebrate = false } = {}) {
  isPatientlyWaiting = false;
  clearPatientTimer();
  if (sprite) {
    sprite.classList.remove('is-patiently-waiting');
    if (celebrate) playCompletionCelebration();
    else renderMascotIdleState();
  }
}

function triggerErrorState() {
  if (isTouchAnimating) return;
  stopWalking();
  isTouchAnimating = true;
  if (sprite) {
    const oldBgPos = sprite.style.backgroundPosition;
    const oldBgImage = sprite.style.backgroundImage;
    setSpriteFrame(tsukiIdleSheet, 5);
    sprite.classList.add('anim-jump');
    setTimeout(() => {
      sprite.classList.remove('anim-jump');
      sprite.style.backgroundPosition = oldBgPos;
      sprite.style.backgroundImage = oldBgImage;
      isTouchAnimating = false;
      renderMascotIdleState();
    }, 400);
  }
}

function getMascotStage() {
  return document.getElementById('angel-stage') || sprite?.parentElement;
}

function spawnMascotParticle(text, className, options = {}) {
  const stage = getMascotStage();
  if (!stage) return;
  const particle = document.createElement('div');
  particle.className = `particle ${className}`;
  particle.textContent = text;
  const centerX = options.x ?? (stage.clientWidth / 2);
  const centerY = options.y ?? (stage.clientHeight / 2);
  particle.style.left = `${centerX + (options.offsetX || 0)}px`;
  particle.style.top = `${centerY + (options.offsetY || 0)}px`;
  if (options.dx) particle.style.setProperty('--dx', options.dx);
  if (options.dy) particle.style.setProperty('--dy', options.dy);
  stage.appendChild(particle);
  setTimeout(() => particle.remove(), options.duration || 1500);
}


function playMascotAffectionTouch(event = null) {
  if (!sprite || isTouchAnimating || isPatientlyWaiting || isCelebrating) return;
  isTouchAnimating = true;
  const oldBgPos = sprite.style.backgroundPosition;
  const oldBgImage = sprite.style.backgroundImage;
  const oldBgSize = sprite.style.backgroundSize;
  const stage = getMascotStage();
  const rect = stage?.getBoundingClientRect?.();
  const clickX = event && rect ? event.clientX - rect.left : undefined;
  const clickY = event && rect ? event.clientY - rect.top : undefined;

  setSpriteFrame(tsukiIdleSheet, 1);
  sprite.classList.add('anim-squish');
  for (let i = 0; i < 3; i += 1) {
    setTimeout(() => {
      spawnMascotParticle('♥', 'particle-heart', {
        x: clickX,
        y: clickY,
        offsetX: (Math.random() - 0.5) * 62,
        offsetY: -20 + ((Math.random() - 0.5) * 24),
        duration: 1200
      });
    }, i * 100);
  }

  setTimeout(() => {
    sprite.classList.remove('anim-squish');
    sprite.style.backgroundPosition = oldBgPos;
    sprite.style.backgroundImage = oldBgImage;
    sprite.style.backgroundSize = oldBgSize;
    isTouchAnimating = false;
    renderMascotIdleState();
  }, 430);
}

if (sprite) {
  renderMascotIdleState();
  sprite.addEventListener('mousedown', playMascotAffectionTouch);
}

const scriptInput = $('#text-input');
if (scriptInput) {
  const setScriptActive = (active) => {
    isScriptActive = active;
    renderMascotIdleState();
  };
  scriptInput.addEventListener('focus', () => setScriptActive(true));
  scriptInput.addEventListener('input', () => setScriptActive(true));
  scriptInput.addEventListener('blur', () => setScriptActive(false));
}

const userGuideButton = $('#btn-user-guide');
if (userGuideButton) {
  const setGuideHover = (active) => {
    isGuideHovering = active;
    renderMascotIdleState();
  };
  userGuideButton.addEventListener('pointerover', () => setGuideHover(true));
  userGuideButton.addEventListener('pointerout', () => setGuideHover(false));
  userGuideButton.addEventListener('mouseover', () => setGuideHover(true));
  userGuideButton.addEventListener('mouseout', () => setGuideHover(false));
  userGuideButton.addEventListener('mouseenter', () => setGuideHover(true));
  userGuideButton.addEventListener('mouseleave', () => setGuideHover(false));
  userGuideButton.addEventListener('focus', () => setGuideHover(true));
  userGuideButton.addEventListener('blur', () => setGuideHover(false));
  document.addEventListener('mousemove', (event) => {
    const hovered = document.elementFromPoint(event.clientX, event.clientY);
    setGuideHover(!!hovered?.closest?.('#btn-user-guide'));
  });
}

const termData = {
  cfg: '<strong>CFG Scale (Classifier-Free Guidance)</strong> determines how strictly the model adheres to your text prompt versus its own unconditional prior. Higher values force it to follow instructions more strictly but may sound robotic, while lower values give the model more creative freedom.',
  timesteps: '<strong>Inference Timesteps</strong> control the number of diffusion steps used for generation. More steps can improve fidelity but take longer.',
  maxlen: '<strong>Max Length</strong> is the maximum number of acoustic tokens the model can generate. Longer sequences require more VRAM.',
  denoise: '<strong>Denoise Audio</strong> applies the model denoiser when clone or continuation audio is supplied.',
  voicedesign: '<strong>Voice Design</strong> creates a voice from a written description instead of uploaded reference audio.',
  voicelanguage: '<strong>VoxCPM2 Language</strong> is the target voice-generation language sent with the synthesis request. It is not the app menu language.',
  personas: '<strong>Personas</strong> are shareable voice design packages. A Persona can be imported from JSON or Markdown, exported again, and usually contains the voice instruction plus optional character background, personality, target language, and a sample line. To make your own, write a strong Voice Design Instruction, export it as JSON or MD, then share that file with another Waifu Voice user.',
  llmfeedback: '<strong>LLM Feedback</strong> sends generated-output metadata to your configured local LM Studio or Ollama model and asks: How can I improve this voice? It uses Tsuki Hoshi as the assistant persona, expects a short reply, and works best with small local instruct models using about 4096 context tokens.',
  zeroshot: '<strong>Zero-Shot Clone</strong> uses a short reference clip to imitate acoustic signature, pitch, and timbre.',
  continuation: '<strong>Continuation</strong> uses prompt audio and exact transcription so the model continues from the supplied performance.',
  credits: '<p><strong>WaifuVoice Forge App</strong> engineered and developed by <strong>Cesar Borgenkrans</strong>.</p><p><strong>VoxCPM Engine</strong> developed by OpenBMB (Tsinghua University).</p>'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function importPersonaFile(file) {
  if (!file) return;
  const text = await file.text();
  const parsed = parsePersonaText(text, file.name);
  const personas = Array.isArray(parsed) ? parsed : [parsed];
  const imported = [];
  for (const persona of personas) {
    imported.push(await upsertCustomPersona(persona));
  }
  state.activePresetTab = 'personas';
  state.presetSelections.persona = imported[0]?.id || null;
  renderPresetTabs();
  renderPresetGrid();
  renderPersonaLabPicker();
  updatePresetBlendLabel();
  if (imported[0]) applySelectedPreset({ includeSample: true });
  setHint(`Imported ${imported.length} persona${imported.length === 1 ? '' : 's'}.`, 'ok');
}

function selectedOrCurrentPersona() {
  const selected = selectedPresetParts().persona;
  if (selected) return normalizePersona(selected);
  return personaFromCurrentForm();
}

function exportPersona(format) {
  const persona = selectedOrCurrentPersona();
  const base = slugify(persona.title || persona.label);
  if (format === 'md') {
    downloadText(`${base}.md`, personaToMarkdown(persona), 'text/markdown;charset=utf-8');
    setHint(`Exported ${persona.label} as Markdown.`, 'ok');
    return;
  }
  downloadText(`${base}.json`, JSON.stringify(persona, null, 2), 'application/json;charset=utf-8');
  setHint(`Exported ${persona.label} as JSON.`, 'ok');
}

$('#preset-tabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.preset-tab');
  if (!btn) return;
  state.activePresetTab = btn.dataset.tab;
  renderPresetTabs();
  renderPresetGrid();
});

$('#preset-grid')?.addEventListener('click', (e) => {
  const card = e.target.closest('.preset-card');
  if (!card) return;
  selectPresetItem(card.dataset.stateKey, card.dataset.id);
});

$('#script-sample-track')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-script-sample]');
  if (!btn) return;
  injectScriptSample(btn.dataset.scriptSample);
});

$('#btn-apply-blend')?.addEventListener('click', () => applySelectedPreset({ includeSample: false }));
$('#btn-sample-line')?.addEventListener('click', () => applySelectedPreset({ includeSample: true }));
$('#btn-reset-blend')?.addEventListener('click', resetPresetBlend);
$('#btn-persona-lab')?.addEventListener('click', () => openPersonaLab());
$('#btn-persona-lab-new')?.addEventListener('click', newPersonaLabDraft);
$('#btn-persona-lab-duplicate')?.addEventListener('click', duplicatePersonaLabDraft);
$('#btn-persona-lab-save')?.addEventListener('click', () => {
  savePersonaLabDraft().catch((err) => setHint(`Persona save failed: ${err.message}`, 'error'));
});
$('#btn-persona-lab-apply')?.addEventListener('click', applyPersonaLabToMainForm);
$('#btn-persona-lab-export-json')?.addEventListener('click', () => exportPersona('json'));
$('#btn-persona-lab-export-md')?.addEventListener('click', () => exportPersona('md'));
$('#persona-lab-picker')?.addEventListener('click', (event) => {
  const item = event.target.closest('.persona-lab-persona');
  if (!item) return;
  switchPersonaLabPersona(item.dataset.personaId);
});
$('#persona-lab-form')?.addEventListener('input', syncPersonaLabFromForm);
$('#persona-lab-form')?.addEventListener('change', syncPersonaLabFromForm);
$('#persona-lab-form')?.addEventListener('submit', (event) => event.preventDefault());
$('#btn-import-persona')?.addEventListener('click', () => $('#persona-import-input')?.click());
$('#persona-import-input')?.addEventListener('change', async (e) => {
  await importPersonaFile(e.target.files?.[0]);
  e.target.value = '';
});
$('#btn-export-persona-json')?.addEventListener('click', () => exportPersona('json'));
$('#btn-export-persona-md')?.addEventListener('click', () => exportPersona('md'));
$('#generate-btn').addEventListener('click', generate);
$('#btn-refresh-history')?.addEventListener('click', loadHistory);
$('#btn-options')?.addEventListener('click', () => {
  populateOptionsModal();
  openModal('options-modal');
});
$('#btn-save-options')?.addEventListener('click', saveOptionsFromModal);
$('#voice-language-button')?.addEventListener('click', () => {
  $('#voice-language-button')?.setAttribute('aria-expanded', 'true');
  populateLanguageSelect();
  openModal('language-modal');
});

$('#language-grid')?.addEventListener('click', (event) => {
  const option = event.target.closest('.language-option');
  if (!option) return;
  setLanguageValue(option.dataset.languageValue);
  setHint(`VoxCPM2 voice language set to ${option.dataset.languageValue}.`, 'ok');
  $('#voice-language-button')?.setAttribute('aria-expanded', 'false');
  closeModal('language-modal');
});

document.querySelectorAll('[data-close-modal]')?.forEach((button) => {
  button.addEventListener('click', () => {
    closeModal(button.dataset.closeModal);
    if (button.dataset.closeModal === 'language-modal') $('#voice-language-button')?.setAttribute('aria-expanded', 'false');
  });
});

document.querySelectorAll('.modal-overlay')?.forEach((overlay) => {
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      overlay.classList.remove('active');
      if (overlay.id === 'language-modal') $('#voice-language-button')?.setAttribute('aria-expanded', 'false');
    }
  });
});

$('#tsuki-dialogue-text')?.addEventListener('click', () => {
  $('#dialogue-modal-body').textContent = $('#tsuki-dialogue-text').textContent;
  openModal('dialogue-modal');
});

$('#tsuki-dialogue-text')?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  $('#dialogue-modal-body').textContent = $('#tsuki-dialogue-text').textContent;
  openModal('dialogue-modal');
});

$('#btn-dialogue-history')?.addEventListener('click', () => {
  const latest = state.dialogueHistory[0];
  if (state.activeDialogueIndex !== null && latest) {
    state.activeDialogueIndex = null;
    setTsukiDialogue(latest.reply, latest);
    $('#btn-dialogue-history').textContent = 'History';
    return;
  }
  renderDialogueHistoryModal();
  openModal('dialogue-history-modal');
});

$('#dialogue-history-list')?.addEventListener('click', (event) => {
  const item = event.target.closest('.dialogue-history-item');
  if (!item) return;
  const index = Number(item.dataset.index);
  const dialogue = state.dialogueHistory[index];
  if (!dialogue) return;
  state.activeDialogueIndex = index;
  setTsukiDialogue(dialogue.reply, dialogue);
  $('#btn-dialogue-history').textContent = index === 0 ? 'History' : 'Latest';
  closeModal('dialogue-history-modal');
});

historyList?.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const filename = target.dataset.file;
  if (target.dataset.action === 'play') playOutput(filename);
  if (target.dataset.action === 'feedback') requestVoiceFeedback(filename);
});

$('#cfg-input').addEventListener('input', (e) => { $('#val-cfg').textContent = e.target.value; });
$('#steps-input').addEventListener('input', (e) => { $('#val-steps').textContent = e.target.value; });
$('#maxlen-input').addEventListener('input', (e) => { $('#val-maxlen').textContent = e.target.value; });
$('#btn-toggle-params')?.addEventListener('click', () => {
  const panel = $('#inference-panel');
  const button = $('#btn-toggle-params');
  const collapsed = !panel?.classList.contains('is-collapsed');
  panel?.classList.toggle('is-collapsed', collapsed);
  button?.setAttribute('aria-expanded', String(!collapsed));
});

$('#language-select')?.addEventListener('change', (e) => {
  setLanguageValue(e.target.value);
});

window.addEventListener('resize', () => {
  window.clearTimeout(window.__scriptSampleTickerResize);
  window.__scriptSampleTickerResize = window.setTimeout(measureScriptSampleTicker, 150);
});
if (document.fonts?.ready) document.fonts.ready.then(measureScriptSampleTicker);
$('#btn-upload-tools')?.addEventListener('click', () => setUploadToolsOpen(!state.uploadToolsOpen));
$('#btn-mode-1')?.addEventListener('click', () => setMode(1));
$('#btn-mode-2')?.addEventListener('click', () => setMode(2));

$('#btn-user-guide').addEventListener('click', () => {
  $('#term-guide-overlay').classList.add('active');
  const firstTerm = document.querySelector('.term-item');
  if (firstTerm) firstTerm.click();
});

$('#btn-close-guide').addEventListener('click', () => {
  $('#term-guide-overlay').classList.remove('active');
});

document.querySelectorAll('.term-item').forEach((item) => {
  item.addEventListener('click', (e) => {
    document.querySelectorAll('.term-item').forEach((el) => el.classList.remove('active'));
    e.target.classList.add('active');
    const termKey = e.target.dataset.term;
    $('#term-title').textContent = e.target.textContent;
    $('#term-desc').innerHTML = termData[termKey] || 'No description available.';
  });
});

setDownloadDisabled(true);
syncCloneToolsVisibility();
loadDialogueHistory();
loadPresetLibrary();
loadHistory();
refreshHealth();
