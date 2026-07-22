import ipaddress
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse


HOST = os.environ.get("VOICEGEN_OUI_LLM_HOST", "127.0.0.1")
PORT = int(os.environ.get("VOICEGEN_OUI_LLM_PORT", "3115"))
MAX_JSON_BODY = int(os.environ.get("VOICEGEN_OUI_LLM_MAX_JSON_BODY", str(1024 * 1024)))
SERVICE_NAME = "voicegen-llm-bridge"
SUPPORTED_PROVIDERS = {"lmstudio", "openai-compatible", "ollama"}
ALLOWED_ORIGINS = {
    "null",
    "http://localhost:3113",
    "http://127.0.0.1:3113",
    "http://[::1]:3113",
}

TSUKI_FEEDBACK_SYSTEM_PROMPT = (
    "You are Tsuki Hoshi, a concise AI assistant inside VoiceGen Oui!. "
    "You help improve VoxCPM voice generation settings and voice design prompts. "
    "You cannot hear the generated audio, so never claim that you heard it. "
    "Base every answer on the actual Spoken Script and its generation metadata. "
    "Your reply must quote 3 to 8 consecutive words copied exactly from the actual Spoken Script; never use the voice design as the quoted evidence. "
    "Connect that exact phrase or its punctuation to one concrete delivery or synthesis change. "
    "Avoid generic advice. Answer from Tsuki Hoshi's perspective, be practical, and keep the whole reply to at most 2 sentences. "
    "The user's fixed question is: How can I improve this voice?"
)


class NoLoadedModelError(ValueError):
    pass


def json_bytes(payload):
    return json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")


def read_body(handler):
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if length <= 0:
        return {}
    if length > MAX_JSON_BODY:
        raise ValueError(f"request body too large; limit is {MAX_JSON_BODY} bytes")
    raw = handler.rfile.read(length)
    payload = json.loads(raw.decode("utf-8")) if raw else {}
    if not isinstance(payload, dict):
        raise ValueError("JSON request body must be an object")
    return payload


def normalize_provider(provider):
    provider = (provider or "lmstudio").strip().lower()
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(f"unsupported local LLM provider: {provider}")
    return provider


def validate_loopback_endpoint(endpoint):
    endpoint = (endpoint or "").strip().rstrip("/")
    if not endpoint:
        raise ValueError("local LLM endpoint is required")
    parsed = urlparse(endpoint)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("local LLM endpoint must be an http:// or https:// loopback URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("local LLM endpoint cannot contain credentials, a query, or a fragment")
    hostname = parsed.hostname.lower()
    if hostname != "localhost":
        try:
            if not ipaddress.ip_address(hostname).is_loopback:
                raise ValueError("local LLM endpoint must use localhost or a loopback IP address")
        except ValueError as exc:
            if "must use localhost" in str(exc):
                raise
            raise ValueError("local LLM endpoint must use localhost or a loopback IP address") from exc
    return endpoint


def llm_api_url(endpoint, provider, operation):
    endpoint = validate_loopback_endpoint(endpoint)
    provider = normalize_provider(provider)
    if operation not in ("models", "chat"):
        raise ValueError(f"unsupported local LLM operation: {operation}")

    if provider == "ollama":
        suffix = "/api/tags" if operation == "models" else "/api/chat"
        for known_suffix in ("/api/tags", "/api/chat"):
            if endpoint.endswith(known_suffix):
                endpoint = endpoint[: -len(known_suffix)]
                break
        if endpoint.endswith(suffix):
            return endpoint
        if endpoint.endswith("/api"):
            return f"{endpoint}{suffix[len('/api') :]}"
        return f"{endpoint}{suffix}"

    suffix = "/v1/models" if operation == "models" else "/v1/chat/completions"
    for known_suffix in ("/v1/models", "/v1/chat/completions"):
        if endpoint.endswith(known_suffix):
            endpoint = endpoint[: -len(known_suffix)]
            break
    if endpoint.endswith(suffix):
        return endpoint
    if endpoint.endswith("/v1"):
        return f"{endpoint}{suffix[len('/v1') :]}"
    return f"{endpoint}{suffix}"


def get_json(url, timeout=15):
    request = urlrequest.Request(url, headers={"Accept": "application/json"}, method="GET")
    with urlrequest.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def post_json(url, payload, timeout=45):
    request = urlrequest.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlrequest.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def discover_llm_models(provider, endpoint):
    provider = normalize_provider(provider)
    response = get_json(llm_api_url(endpoint, provider, "models"))
    if provider == "ollama":
        models = response.get("models") if isinstance(response, dict) else []
        names = [
            str(item.get("name") or item.get("model") or "").strip()
            for item in (models or [])
            if isinstance(item, dict)
        ]
    else:
        models = response.get("data") if isinstance(response, dict) else []
        names = [
            str(item.get("id") or "").strip()
            for item in (models or [])
            if isinstance(item, dict)
        ]
    return [name for name in names if name]


def resolve_llm_model(provider, endpoint, requested_model):
    requested_model = (requested_model or "").strip()
    if requested_model:
        return requested_model
    models = discover_llm_models(provider, endpoint)
    if not models:
        raise NoLoadedModelError(
            "no loaded local LLM model was found; load a model or enter its exact model ID in Options"
        )
    return models[0]


def trim_sentences(text, max_sentences=2):
    text = " ".join(str(text or "").split())
    if not text:
        return ""
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9"“])', text)
    return " ".join(sentences[:max_sentences]).strip()


def build_feedback_user_prompt(payload):
    record = payload.get("record") if isinstance(payload.get("record"), dict) else {}
    spoken_script = str(record.get("spoken_script") or record.get("text") or "").strip()
    context = {
        "question": "How can I improve this voice?",
        "filename": record.get("filename", ""),
        "mode": record.get("mode", ""),
        "language": record.get("language", ""),
        "spoken_script": spoken_script,
        "voice_design": record.get("voice_design", ""),
        "prompt_text": record.get("prompt_text", ""),
        "seed": record.get("seed", -1),
        "cfg_value": record.get("cfg_value"),
        "inference_timesteps": record.get("inference_timesteps"),
        "max_len": record.get("max_len"),
        "denoise": record.get("denoise", False),
        "preset_state": record.get("preset_state", {}),
    }
    return (
        "Review this VoiceGen Oui! take and give script-specific advice.\n\n"
        "ACTUAL SPOKEN SCRIPT\n"
        f"---\n{spoken_script or '[missing from this legacy record]'}\n---\n\n"
        "MANDATORY: begin with a 3-to-8-word exact quote copied from between the script delimiters above. "
        "Do not substitute words from Voice Design. Connect that quote or its punctuation to one precise voice-design "
        "or synthesis adjustment; keep the seed fixed unless changing it is the specific recommendation.\n\n"
        "GENERATION METADATA\n"
        f"{json.dumps(context, ensure_ascii=False, indent=2)}"
    )


def local_llm_feedback(payload):
    provider = normalize_provider(payload.get("provider"))
    endpoint = validate_loopback_endpoint(payload.get("endpoint"))
    model = resolve_llm_model(provider, endpoint, payload.get("model"))
    messages = [
        {"role": "system", "content": TSUKI_FEEDBACK_SYSTEM_PROMPT},
        {"role": "user", "content": build_feedback_user_prompt(payload)},
    ]
    if provider == "ollama":
        response = post_json(
            llm_api_url(endpoint, provider, "chat"),
            {
                "model": model,
                "messages": messages,
                "stream": False,
                "options": {
                    "num_ctx": int(payload.get("context_tokens") or 4096),
                    "temperature": 0.3,
                },
            },
        )
        text = response.get("message", {}).get("content", "")
    else:
        response = post_json(
            llm_api_url(endpoint, provider, "chat"),
            {
                "model": model,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 512,
            },
        )
        choices = response.get("choices") or []
        text = choices[0].get("message", {}).get("content", "") if choices else ""
    return trim_sentences(text, 2), model


class Handler(BaseHTTPRequestHandler):
    server_version = "VoiceGenLlmBridge/1.0"

    def allowed_origin(self):
        origin = self.headers.get("Origin")
        return origin if origin in ALLOWED_ORIGINS else None

    def send_json(self, payload, status=200):
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        allowed_origin = self.allowed_origin()
        if allowed_origin:
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status, message, error_type=None):
        payload = {"status": "error", "error": message}
        if error_type:
            payload["error_type"] = error_type
        self.send_json(payload, status=status)

    def do_OPTIONS(self):
        self.send_response(204)
        allowed_origin = self.allowed_origin()
        if allowed_origin:
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == "/api/health":
            return self.send_json(
                {
                    "status": "ok",
                    "service": SERVICE_NAME,
                    "pid": os.getpid(),
                    "bridge_path": str(Path(__file__).resolve()),
                    "host": HOST,
                    "port": PORT,
                    "providers": sorted(SUPPORTED_PROVIDERS),
                    "default_lm_studio_endpoint": "http://127.0.0.1:1234",
                }
            )
        return self.send_error_json(404, "Not found", "bridge_route_not_found")

    def do_POST(self):
        path = unquote(urlparse(self.path).path)
        if path not in ("/api/llm_models", "/api/llm_feedback"):
            return self.send_error_json(404, "Not found", "bridge_route_not_found")
        try:
            payload = read_body(self)
            if path == "/api/llm_models":
                provider = normalize_provider(payload.get("provider"))
                endpoint = validate_loopback_endpoint(payload.get("endpoint"))
                models = discover_llm_models(provider, endpoint)
                return self.send_json(
                    {
                        "status": "ok",
                        "provider": provider,
                        "endpoint": endpoint,
                        "models": models,
                        "recommended_model": models[0] if models else "",
                    }
                )

            text, resolved_model = local_llm_feedback(payload)
            if not text:
                raise RuntimeError("local LLM returned an empty reply")
            return self.send_json(
                {
                    "status": "ok",
                    "persona": "Tsuki Hoshi",
                    "question": "How can I improve this voice?",
                    "model": resolved_model,
                    "reply": text,
                }
            )
        except NoLoadedModelError as exc:
            return self.send_error_json(422, str(exc), "no_loaded_model")
        except HTTPError as exc:
            return self.send_error_json(
                502,
                f"Local LLM HTTP {exc.code}: {exc.reason}",
                "llm_http_error",
            )
        except (URLError, TimeoutError, OSError) as exc:
            reason = getattr(exc, "reason", exc)
            return self.send_error_json(
                502,
                f"Local LLM is unavailable: {reason}",
                "llm_unavailable",
            )
        except (ValueError, json.JSONDecodeError) as exc:
            return self.send_error_json(400, str(exc), "invalid_request")
        except Exception as exc:
            return self.send_error_json(500, f"{type(exc).__name__}: {exc}", "bridge_error")

    def log_message(self, format_string, *args):
        sys.stdout.write(f"{self.address_string()} - {format_string % args}\n")
        sys.stdout.flush()


def main():
    if HOST not in ("127.0.0.1", "::1", "localhost"):
        raise RuntimeError("VOICEGEN_OUI_LLM_HOST must remain loopback-only")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"VoiceGen Oui! Windows LLM bridge listening at http://{HOST}:{PORT}", flush=True)
    print("LLM traffic stays on Windows; the ROCm voice backend remains in WSL on port 3113.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
