# VoiceGen Oui! AI Addon

This addon is an add-only monitor and gateway for AI-driven VoiceGen usage. It does not modify the existing VoiceGen frontend, backend, models, personas, or output code.

## Purpose

When an AI agent generates a voice, the addon gives the user a separate screen that shows:

- The exact text the agent sent.
- The voice design prompt.
- Mode, language, seed, CFG value, inference timesteps, max length, denoise, consent flag, and preset state.
- Whether uploaded audio fields were present, without storing the raw base64 audio.
- The resulting filename, sample rate, response status, elapsed time, and output metadata.
- A notification when the AI accesses the gateway endpoint.

## Files

- `app/ai-addon.html` - standalone dashboard screen.
- `app/_frontend/css/ai-addon.css` - dashboard styling.
- `app/_frontend/js/ai-addon.js` - dashboard polling, notifications, copy buttons, and rendering.
- `app/_backend/ai_addon_server.py` - separate gateway and monitor server.
- `start_voicegen_oui_ai_addon.ps1` - Windows launcher for the addon.
- `docs/AI_ADDON.md` - this guide.

## Recommended Run Flow

1. Start VoiceGen normally so it listens on `http://127.0.0.1:3113`.
2. Start the addon:

```powershell
.\start_voicegen_oui_ai_addon.ps1
```

3. Open the addon dashboard:

```text
http://127.0.0.1:3114/ai-addon.html
```

4. Tell AI agents to call the monitored gateway endpoint:

```text
http://127.0.0.1:3114/api/generate
```

The addon forwards the request to the real VoiceGen endpoint at `http://127.0.0.1:3113/api/generate`, logs the settings, returns the generated wav response, and updates the dashboard.

## Duet Electron Usage

For the `duet-electron` style workflow, set the VoiceGen URL used by the agent integration to:

```text
http://127.0.0.1:3114
```

The existing generation path `/api/generate` remains the same, but the addon becomes the monitored gateway in front of VoiceGen.

## Monitoring Modes

Gateway monitoring:

- Best option.
- Shows the request immediately when the AI sends it.
- Can notify before synthesis completes.
- Captures copied settings and curl commands.

After-effects monitoring:

- Works from the dashboard by polling `/api/outputs`.
- Useful when an AI bypasses the addon and calls port `3113` directly.
- Only sees completed outputs, not the moment of access.

Because this addon is add-only, direct calls into the original VoiceGen backend cannot be intercepted before completion unless the caller uses the addon gateway.

## Event Log

Gateway events are stored locally at:

```text
outputs\ai_addon_events.json
```

The log is capped to the most recent 200 events by default. It stores text and prompt settings, but does not store raw `ref_audio_base64` or `prompt_audio_base64` data.

## Environment Variables

Optional configuration:

```powershell
$env:VOICEGEN_OUI_AI_ADDON_PORT = "3114"
$env:VOICEGEN_OUI_AI_ADDON_TARGET = "http://127.0.0.1:3113"
$env:VOICEGEN_OUI_AI_ADDON_LOG = "D:\path\to\ai_addon_events.json"
$env:VOICEGEN_OUI_AI_ADDON_MAX_EVENTS = "200"
$env:VOICEGEN_OUI_AI_ADDON_TEXT_STORE_LIMIT = "24000"
$env:VOICEGEN_OUI_AI_ADDON_PROXY_TIMEOUT = "900"
```

## Agent Instruction Snippet

Use this when instructing an AI agent:

```text
Use the VoiceGen Oui! AI Addon gateway so the user can monitor voice generation.
POST JSON to http://127.0.0.1:3114/api/generate.
Include text, voice_design, language, mode, cfg_value, inference_timesteps, max_len, seed, denoise, preset_state, and consent_ack when relevant.
Do not call the direct VoiceGen /api/generate endpoint unless the user explicitly asks to bypass monitoring.
```

## Copying Settings

In the dashboard:

- `Copy settings JSON` copies a reusable generation payload.
- `Copy curl` copies a command that replays the same generation through the addon gateway.
- `Copy metadata` copies completed output metadata from VoiceGen.

This makes it possible to inspect, repeat, compare, or manually refine the exact voice settings an AI agent used.
