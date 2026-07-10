import json
import mimetypes
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
APP_ROOT = Path(os.environ.get("WAIFUVOICE_APP_ROOT", str(ROOT.parent))).expanduser().resolve()
DATA_ROOT = Path(os.environ.get("WAIFUVOICE_DATA_ROOT", str(APP_ROOT.parent))).expanduser().resolve()

HOST = os.environ.get("WAIFUVOICE_AI_ADDON_HOST", "127.0.0.1")
PORT = int(os.environ.get("WAIFUVOICE_AI_ADDON_PORT", "3114"))
TARGET_BASE = os.environ.get("WAIFUVOICE_AI_ADDON_TARGET", "http://127.0.0.1:3113").rstrip("/")
MAX_JSON_BODY = int(os.environ.get("WAIFUVOICE_AI_ADDON_MAX_JSON_BODY", str(64 * 1024 * 1024)))
MAX_EVENTS = int(os.environ.get("WAIFUVOICE_AI_ADDON_MAX_EVENTS", "200"))
PROXY_TIMEOUT = int(os.environ.get("WAIFUVOICE_AI_ADDON_PROXY_TIMEOUT", "900"))

OUTPUTS_DIR = Path(os.environ.get("WAIFUVOICE_OUTPUTS_DIR", str(DATA_ROOT / "outputs"))).expanduser().resolve()
EVENTS_PATH = Path(
    os.environ.get("WAIFUVOICE_AI_ADDON_LOG", str(OUTPUTS_DIR / "ai_addon_events.json"))
).expanduser().resolve()

EVENT_LOCK = threading.Lock()
TEXT_STORE_LIMIT = int(os.environ.get("WAIFUVOICE_AI_ADDON_TEXT_STORE_LIMIT", "24000"))


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def json_bytes(payload, status=200):
    body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    return status, body, "application/json; charset=utf-8"


def read_events():
    if not EVENTS_PATH.exists():
        return []
    try:
        data = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []
    return data if isinstance(data, list) else []


def write_events(events):
    EVENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = EVENTS_PATH.with_name(f"{EVENTS_PATH.name}.tmp")
    tmp_path.write_text(json.dumps(events[:MAX_EVENTS], ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(EVENTS_PATH)


def append_event(event):
    with EVENT_LOCK:
        events = read_events()
        events.insert(0, event)
        write_events(events)


def clipped_text(value, limit=TEXT_STORE_LIMIT):
    if value is None:
        return ""
    text = str(value)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n[clipped after {limit} characters by ai-addon]"


def json_safe(value):
    try:
        json.dumps(value, ensure_ascii=False)
        return value
    except TypeError:
        return str(value)


def audio_field_summary(payload, key):
    value = payload.get(key)
    if not value:
        return {
            f"has_{key}": False,
            f"{key}_chars": 0,
        }
    chars = len(str(value))
    return {
        f"has_{key}": True,
        f"{key}_chars": chars,
        f"{key}_approx_bytes": int(chars * 0.75),
    }


def summarize_payload(payload):
    if not isinstance(payload, dict):
        return {
            "request_body_type": type(payload).__name__,
            "text": "",
            "voice_design": "",
        }

    text = str(payload.get("text") or "")
    voice_design = str(payload.get("voice_design") or "")
    prompt_text = str(payload.get("prompt_text") or "")
    preset_state = payload.get("preset_state") or {}

    summary = {
        "request_body_keys": sorted(str(key) for key in payload.keys()),
        "mode": payload.get("mode") or "voice-design",
        "language": payload.get("language") or "English",
        "text": clipped_text(text),
        "text_length": len(text),
        "voice_design": clipped_text(voice_design),
        "voice_design_length": len(voice_design),
        "prompt_text": clipped_text(prompt_text),
        "prompt_text_length": len(prompt_text),
        "seed": payload.get("seed", -1),
        "cfg_value": payload.get("cfg_value", 2.0),
        "inference_timesteps": payload.get("inference_timesteps", 10),
        "max_len": payload.get("max_len", 4096),
        "denoise": bool(payload.get("denoise", False)),
        "consent_ack": bool(payload.get("consent_ack", False)),
        "preset_state": json_safe(preset_state),
    }
    summary.update(audio_field_summary(payload, "ref_audio_base64"))
    summary.update(audio_field_summary(payload, "prompt_audio_base64"))
    return summary


def parse_request_body(handler):
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if length > MAX_JSON_BODY:
        raise ValueError(f"request body too large; limit is {MAX_JSON_BODY} bytes")
    raw = handler.rfile.read(length) if length > 0 else b""
    if not raw:
        return raw, {}
    content_type = handler.headers.get("Content-Type", "")
    if "json" not in content_type.lower():
        return raw, {"non_json_body_bytes": len(raw)}
    return raw, json.loads(raw.decode("utf-8"))


def target_url(path_and_query):
    parsed = urlparse(path_and_query)
    path = parsed.path or "/"
    url = f"{TARGET_BASE}{path}"
    if parsed.query:
        url = f"{url}?{parsed.query}"
    return url


def target_json(path, timeout=5):
    req = urlrequest.Request(target_url(path), method="GET")
    with urlrequest.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    return json.loads(raw)


def local_origin_allowed(origin):
    if not origin:
        return None
    if origin == "null":
        return origin
    parsed = urlparse(origin)
    if parsed.scheme in ("http", "https") and parsed.hostname in ("localhost", "127.0.0.1", "::1"):
        return origin
    return None


def response_header(headers, name):
    try:
        return headers.get(name)
    except Exception:
        return None


class Handler(BaseHTTPRequestHandler):
    server_version = "VoiceGenAIAddon/1.0"

    def log_message(self, fmt, *args):
        print(f"[{utc_now()}] {self.address_string()} - {fmt % args}")

    def send_payload(self, status, body, content_type, extra_headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        allowed_origin = local_origin_allowed(self.headers.get("Origin"))
        if allowed_origin:
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header(
            "Access-Control-Expose-Headers",
            "X-Sample-Rate, X-Model-Source, X-Output-Filename, Content-Disposition",
        )
        if extra_headers:
            for key, value in extra_headers.items():
                if value is not None:
                    self.send_header(key, str(value))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            return

    def send_json(self, payload, status=200):
        code, body, content_type = json_bytes(payload, status=status)
        self.send_payload(code, body, content_type)

    def send_error_json(self, status, message):
        self.send_json({"status": "error", "error": str(message)}, status=status)

    def serve_file(self, rel_path):
        target = (APP_ROOT / rel_path.lstrip("/")).resolve()
        try:
            target.relative_to(APP_ROOT)
        except ValueError:
            self.send_error_json(403, "Forbidden")
            return
        if not target.exists() or not target.is_file():
            self.send_error_json(404, "Not found")
            return
        mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self.send_payload(200, target.read_bytes(), mime)

    def proxy_get(self):
        req = urlrequest.Request(
            target_url(self.path),
            headers={"Accept": self.headers.get("Accept", "*/*")},
            method="GET",
        )
        try:
            with urlrequest.urlopen(req, timeout=PROXY_TIMEOUT) as response:
                body = response.read()
                content_type = response_header(response.headers, "Content-Type") or "application/octet-stream"
                self.send_payload(response.status, body, content_type, self.forward_headers(response.headers))
        except HTTPError as exc:
            body = exc.read()
            content_type = response_header(exc.headers, "Content-Type") or "application/json; charset=utf-8"
            self.send_payload(exc.code, body, content_type, self.forward_headers(exc.headers))
        except URLError as exc:
            self.send_error_json(502, f"VoiceGen target unavailable: {exc.reason}")

    def forward_headers(self, headers):
        return {
            "Content-Disposition": response_header(headers, "Content-Disposition"),
            "X-Sample-Rate": response_header(headers, "X-Sample-Rate"),
            "X-Model-Source": response_header(headers, "X-Model-Source"),
            "X-Output-Filename": response_header(headers, "X-Output-Filename"),
        }

    def addon_status(self):
        events = read_events()
        try:
            target_health = target_json("/api/health")
            target_online = True
            target_error = ""
        except Exception as exc:
            target_health = None
            target_online = False
            target_error = f"{type(exc).__name__}: {exc}"
        self.send_json(
            {
                "status": "ok",
                "addon": {
                    "host": HOST,
                    "port": PORT,
                    "url": f"http://{HOST}:{PORT}",
                    "app_root": str(APP_ROOT),
                    "data_root": str(DATA_ROOT),
                    "events_path": str(EVENTS_PATH),
                    "events_count": len(events),
                },
                "target": {
                    "base_url": TARGET_BASE,
                    "online": target_online,
                    "error": target_error,
                    "health": target_health,
                },
            }
        )

    def do_OPTIONS(self):
        self.send_response(204)
        allowed_origin = local_origin_allowed(self.headers.get("Origin"))
        if allowed_origin:
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path in ("/", "/ai-addon.html"):
            return self.serve_file("ai-addon.html")
        if path.startswith("/_frontend/"):
            return self.serve_file(path.lstrip("/"))
        if path == "/api/ai-addon/status":
            return self.addon_status()
        if path == "/api/ai-addon/events":
            return self.send_json({"status": "ok", "events_path": str(EVENTS_PATH), "events": read_events()})
        if path in ("/api/health", "/api/outputs", "/api/vram") or path.startswith("/outputs/"):
            return self.proxy_get()
        return self.send_error_json(404, "Not found")

    def do_POST(self):
        path = unquote(urlparse(self.path).path)
        if path != "/api/generate":
            return self.send_error_json(404, "Not found")

        request_id = f"wvai-{uuid.uuid4().hex[:12]}"
        started = time.perf_counter()
        raw_body = b""
        payload = {}

        try:
            raw_body, payload = parse_request_body(self)
            request_event = {
                "id": f"{request_id}-request",
                "request_id": request_id,
                "created_at": utc_now(),
                "kind": "generate.request",
                "status": "observed",
                "target_base": TARGET_BASE,
                "client": {
                    "host": self.client_address[0] if self.client_address else "",
                    "user_agent": self.headers.get("User-Agent", ""),
                    "origin": self.headers.get("Origin", ""),
                    "path": self.path,
                },
                "settings": summarize_payload(payload),
            }
            append_event(request_event)

            req = urlrequest.Request(
                target_url(self.path),
                data=raw_body,
                headers={
                    "Content-Type": self.headers.get("Content-Type", "application/json"),
                    "Accept": self.headers.get("Accept", "*/*"),
                    "User-Agent": "VoiceGen-AI-Addon/1.0",
                },
                method="POST",
            )
            try:
                with urlrequest.urlopen(req, timeout=PROXY_TIMEOUT) as response:
                    body = response.read()
                    elapsed_ms = int((time.perf_counter() - started) * 1000)
                    response_event = {
                        "id": f"{request_id}-response",
                        "request_id": request_id,
                        "created_at": utc_now(),
                        "kind": "generate.response",
                        "status": "completed",
                        "target_base": TARGET_BASE,
                        "response": {
                            "status_code": response.status,
                            "content_type": response_header(response.headers, "Content-Type"),
                            "filename": response_header(response.headers, "X-Output-Filename"),
                            "sample_rate": response_header(response.headers, "X-Sample-Rate"),
                            "model_source": response_header(response.headers, "X-Model-Source"),
                            "elapsed_ms": elapsed_ms,
                            "bytes": len(body),
                        },
                    }
                    append_event(response_event)
                    content_type = response_header(response.headers, "Content-Type") or "application/octet-stream"
                    return self.send_payload(response.status, body, content_type, self.forward_headers(response.headers))
            except HTTPError as exc:
                body = exc.read()
                elapsed_ms = int((time.perf_counter() - started) * 1000)
                append_event(
                    {
                        "id": f"{request_id}-response",
                        "request_id": request_id,
                        "created_at": utc_now(),
                        "kind": "generate.response",
                        "status": "failed",
                        "target_base": TARGET_BASE,
                        "response": {
                            "status_code": exc.code,
                            "content_type": response_header(exc.headers, "Content-Type"),
                            "elapsed_ms": elapsed_ms,
                            "bytes": len(body),
                            "error_preview": body[:600].decode("utf-8", errors="replace"),
                        },
                    }
                )
                content_type = response_header(exc.headers, "Content-Type") or "application/json; charset=utf-8"
                return self.send_payload(exc.code, body, content_type, self.forward_headers(exc.headers))
        except (ValueError, json.JSONDecodeError) as exc:
            append_event(
                {
                    "id": f"{request_id}-error",
                    "request_id": request_id,
                    "created_at": utc_now(),
                    "kind": "generate.error",
                    "status": "failed",
                    "target_base": TARGET_BASE,
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )
            return self.send_error_json(400, exc)
        except URLError as exc:
            append_event(
                {
                    "id": f"{request_id}-error",
                    "request_id": request_id,
                    "created_at": utc_now(),
                    "kind": "generate.error",
                    "status": "failed",
                    "target_base": TARGET_BASE,
                    "settings": summarize_payload(payload),
                    "error": f"VoiceGen target unavailable: {exc.reason}",
                }
            )
            return self.send_error_json(502, f"VoiceGen target unavailable: {exc.reason}")
        except Exception as exc:
            append_event(
                {
                    "id": f"{request_id}-error",
                    "request_id": request_id,
                    "created_at": utc_now(),
                    "kind": "generate.error",
                    "status": "failed",
                    "target_base": TARGET_BASE,
                    "settings": summarize_payload(payload),
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )
            return self.send_error_json(500, f"{type(exc).__name__}: {exc}")


def main():
    print("====================================================")
    print("VoiceGen AI Addon monitor active at:")
    print(f"  http://localhost:{PORT}")
    print("")
    print("Forwarding voice generation calls to:")
    print(f"  {TARGET_BASE}")
    print("")
    print("AI gateway endpoint:")
    print(f"  http://localhost:{PORT}/api/generate")
    print("====================================================")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
