import json
import mimetypes
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
import tempfile
import uuid
from datetime import datetime, timezone
from urllib import request as urlrequest
from urllib.error import URLError, HTTPError

# Import the local VoxCPM Engine wrapper
try:
    from voxcpm_engine import VoxCPMEngine
    VOXCPM_IMPORT_ERROR = None
except Exception as exc:
    VoxCPMEngine = None
    VOXCPM_IMPORT_ERROR = str(exc)

from gpu_runtime_control import cool_down_engine
from vram_telemetry import get_vram_telemetry

ROOT = Path(__file__).resolve().parent
APP_ROOT = Path(os.environ.get("WAIFUVOICE_APP_ROOT", str(ROOT.parent))).expanduser().resolve()
DATA_ROOT = Path(os.environ.get("WAIFUVOICE_DATA_ROOT", str(APP_ROOT.parent))).expanduser().resolve()
PORT = int(os.environ.get("PORT", "3113"))
HOST = os.environ.get("HOST", "127.0.0.1")
MAX_JSON_BODY = int(os.environ.get("MAX_JSON_BODY", str(50 * 1024 * 1024)))
ALLOWED_ORIGINS = {
    "null",
    f"http://localhost:{PORT}",
    f"http://127.0.0.1:{PORT}",
    f"http://[::1]:{PORT}",
}

MODEL_PATH = os.environ.get("VOXCPM_MODEL_PATH", str(DATA_ROOT / "models" / "VoxCPM2"))
OUTPUTS_DIR = Path(os.environ.get("WAIFUVOICE_OUTPUTS_DIR", str(DATA_ROOT / "outputs"))).expanduser().resolve()
METADATA_PATH = OUTPUTS_DIR / "metadata.json"
CUSTOM_PERSONAS_PATH = Path(
    os.environ.get("WAIFUVOICE_CUSTOM_PERSONAS_PATH", str(DATA_ROOT / "personas" / "presets_custom.json"))
).expanduser().resolve()

ENGINE_LOCK = threading.Lock()
ENGINE = None

def get_engine():
    global ENGINE
    if ENGINE is not None:
        return ENGINE
    if VoxCPMEngine is None:
        raise RuntimeError(f"VoxCPMEngine import failed: {VOXCPM_IMPORT_ERROR}")
    with ENGINE_LOCK:
        if ENGINE is not None:
            return ENGINE
        ENGINE = VoxCPMEngine(MODEL_PATH)
        return ENGINE

def json_bytes(payload, status=200):
    body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    return status, body, "application/json; charset=utf-8"

def read_body(handler):
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if length <= 0:
        return {}
    if length > MAX_JSON_BODY:
        raise ValueError(f"request body too large; limit is {MAX_JSON_BODY} bytes")
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))

def utc_now():
    return datetime.now(timezone.utc).isoformat()

def load_metadata():
    if not METADATA_PATH.exists():
        return {}
    try:
        data = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if isinstance(data, dict):
        return data
    return {}

def save_metadata(metadata):
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_PATH.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )

def load_custom_personas():
    if not CUSTOM_PERSONAS_PATH.exists():
        return []
    try:
        data = json.loads(CUSTOM_PERSONAS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict) and isinstance(data.get("personas"), list):
        return [item for item in data["personas"] if isinstance(item, dict)]
    return []

def save_custom_personas(personas):
    CUSTOM_PERSONAS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = CUSTOM_PERSONAS_PATH.with_name(f"{CUSTOM_PERSONAS_PATH.name}.tmp")
    tmp_path.write_text(
        json.dumps(personas, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp_path.replace(CUSTOM_PERSONAS_PATH)

def upsert_custom_persona(persona):
    if not isinstance(persona, dict):
        raise ValueError("persona must be an object")
    persona_id = str(persona.get("id") or "").strip()
    if not persona_id:
        raise ValueError("persona.id is required")
    current = [item for item in load_custom_personas() if item.get("id") != persona_id]
    saved = dict(persona)
    saved["id"] = persona_id
    current.append(saved)
    save_custom_personas(current)
    return saved, current

def output_record_from_file(path, metadata):
    filename = path.name
    stat = path.stat()
    record = metadata.get(filename, {})
    merged = {
        "filename": filename,
        "url": f"/outputs/{filename}",
        "created_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "size_bytes": stat.st_size,
        "mode": "unknown",
        "text": "",
        "language": "",
        "voice_design": "",
        "prompt_text": "",
        "seed": -1,
        "cfg_value": None,
        "inference_timesteps": None,
        "max_len": None,
        "denoise": False,
        "sample_rate": None,
        "iteration_rate": None,
        "preset_state": {},
        "consent_ack": False,
    }
    if isinstance(record, dict):
        merged.update(record)
    merged["filename"] = filename
    merged["url"] = f"/outputs/{filename}"
    merged["size_bytes"] = stat.st_size
    merged.pop("notes", None)
    return merged

def list_output_records():
    if not OUTPUTS_DIR.exists():
        return []
    metadata = load_metadata()
    files = sorted(
        OUTPUTS_DIR.glob("*.wav"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return [output_record_from_file(path, metadata) for path in files]

def write_output_metadata(filename, updates):
    if not filename or Path(filename).name != filename or not filename.endswith(".wav"):
        raise ValueError("invalid output filename")
    target = (OUTPUTS_DIR / filename).resolve()
    try:
        target.relative_to(OUTPUTS_DIR.resolve())
    except ValueError:
        raise ValueError("invalid output filename")
    if not target.exists():
        raise FileNotFoundError(filename)
    metadata = load_metadata()
    current = output_record_from_file(target, metadata)
    current.update(updates)
    current["updated_at"] = utc_now()
    metadata[filename] = current
    save_metadata(metadata)
    return current

def build_generation_metadata(payload, filename, sample_rate, mode, iteration_rate=None):
    return {
        "filename": filename,
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "mode": mode,
        "text": (payload.get("text") or "").strip(),
        "language": (payload.get("language") or "English").strip(),
        "voice_design": (payload.get("voice_design") or "").strip(),
        "prompt_text": (payload.get("prompt_text") or "").strip(),
        "seed": int(payload.get("seed", -1)),
        "cfg_value": float(payload.get("cfg_value", 2.0)),
        "inference_timesteps": int(payload.get("inference_timesteps", 10)),
        "max_len": int(payload.get("max_len", 4096)),
        "denoise": bool(payload.get("denoise", False)),
        "sample_rate": sample_rate,
        "iteration_rate": round(float(iteration_rate), 2) if iteration_rate else None,
        "preset_state": payload.get("preset_state") or {},
        "consent_ack": bool(payload.get("consent_ack", False)),
    }

TSUKI_FEEDBACK_SYSTEM_PROMPT = (
    "You are Tsuki Hoshi, a concise AI assistant inside Waifu Voice Forge. "
    "You help improve VoxCPM voice generation settings and voice design prompts. "
    "Answer from Tsuki Hoshi's perspective, be practical, and keep the whole reply to at most 2 sentences. "
    "The user's fixed question is: How can I improve this voice?"
)

def trim_sentences(text, max_sentences=2):
    text = " ".join(str(text or "").split())
    if not text:
        return ""
    sentences = []
    current = []
    for char in text:
        current.append(char)
        if char in ".!?":
            sentence = "".join(current).strip()
            if sentence:
                sentences.append(sentence)
            current = []
            if len(sentences) >= max_sentences:
                break
    if len(sentences) < max_sentences and current:
        sentences.append("".join(current).strip())
    return " ".join(sentences[:max_sentences]).strip()

def build_feedback_user_prompt(payload):
    record = payload.get("record") if isinstance(payload.get("record"), dict) else {}
    context = {
        "question": "How can I improve this voice?",
        "filename": record.get("filename", ""),
        "mode": record.get("mode", ""),
        "language": record.get("language", ""),
        "text": record.get("text", ""),
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
        "Review this Waifu Voice Forge output metadata and give concise advice.\n"
        f"{json.dumps(context, ensure_ascii=False, indent=2)}"
    )

def post_json(url, payload, timeout=45):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urlrequest.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlrequest.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    return json.loads(raw)

def local_llm_feedback(payload):
    provider = (payload.get("provider") or "lmstudio").strip()
    endpoint = (payload.get("endpoint") or "").strip().rstrip("/")
    model = (payload.get("model") or "local-model").strip()
    if not endpoint:
        raise ValueError("local LLM endpoint is required")

    messages = [
        {"role": "system", "content": TSUKI_FEEDBACK_SYSTEM_PROMPT},
        {"role": "user", "content": build_feedback_user_prompt(payload)},
    ]
    if provider == "ollama":
        response = post_json(
            f"{endpoint}/api/chat",
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
            f"{endpoint}/v1/chat/completions",
            {
                "model": model,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 180,
            },
        )
        choices = response.get("choices") or []
        text = choices[0].get("message", {}).get("content", "") if choices else ""
    return trim_sentences(text, 2)

class Handler(BaseHTTPRequestHandler):
    def allowed_origin(self):
        origin = self.headers.get("Origin")
        if not origin:
            return None
        if origin in ALLOWED_ORIGINS:
            return origin
        return None

    def send_payload(self, status, body, content_type, extra_headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        allowed_origin = self.allowed_origin()
        if allowed_origin:
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header(
            "Access-Control-Expose-Headers",
            "X-Sample-Rate, X-Model-Source, X-Output-Filename, X-Iteration-Rate",
        )
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, payload, status=200):
        code, body, content_type = json_bytes(payload, status=status)
        self.send_payload(code, body, content_type)

    def send_error_json(self, status, message):
        self.send_json({"status": "error", "error": message}, status=status)

    def serve_file(self, rel_path):
        rel_path = rel_path.lstrip("/")
        target = (APP_ROOT / rel_path).resolve()
        try:
            target.relative_to(APP_ROOT)
        except ValueError:
            self.send_error_json(403, "Forbidden")
            return
        if not target.exists() or not target.is_file():
            self.send_error_json(404, "Not found")
            return
        mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        body = target.read_bytes()
        self.send_payload(200, body, mime)

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path in ("/", "/index.html"):
            return self.serve_file("index.html")
        if path.startswith("/_frontend/") or path.startswith("/css/") or path.startswith("/js/") or path.startswith("/assets/"):
            return self.serve_file(path.lstrip("/"))
        if path == "/api/health":
            loaded = ENGINE is not None
            payload = {
                "status": "ok",
                "loaded": loaded,
                "model_source": "VoxCPM2",
                "model_path": MODEL_PATH,
                "app_root": str(APP_ROOT),
                "data_root": str(DATA_ROOT),
                "outputs_dir": str(OUTPUTS_DIR),
                "custom_personas_path": str(CUSTOM_PERSONAS_PATH),
                "voxcpm_import_ok": VoxCPMEngine is not None,
            }
            if loaded:
                payload["sample_rate"] = getattr(ENGINE.model.tts_model, "sample_rate", None)
            return self.send_json(payload)

        if path == "/api/vram":
            try:
                return self.send_json({"status": "ok", **get_vram_telemetry()})
            except Exception as exc:
                return self.send_error_json(500, f"{type(exc).__name__}: {exc}")
            
        if path == "/api/outputs":
            return self.send_json(list_output_records())

        if path == "/api/personas/custom":
            return self.send_json({
                "status": "ok",
                "path": str(CUSTOM_PERSONAS_PATH),
                "personas": load_custom_personas(),
            })
            
        if path.startswith("/outputs/"):
            filename = path[len("/outputs/"):]
            outputs_dir = OUTPUTS_DIR.resolve()
            target = (outputs_dir / filename).resolve()
            try:
                target.relative_to(outputs_dir)
            except ValueError:
                return self.send_error_json(403, "Forbidden")
            if not target.exists() or not target.is_file() or target.suffix.lower() != ".wav":
                return self.send_error_json(404, "Not found")
            mime = "audio/wav"
            with open(target, "rb") as f:
                body = f.read()
            self.send_payload(200, body, mime)
            return

        self.send_error_json(404, "Not found")

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

    def do_POST(self):
        global ENGINE
        path = unquote(urlparse(self.path).path)
        if path not in ("/api/generate", "/api/generate_stream"):
            if path == "/api/vram/unload":
                try:
                    with ENGINE_LOCK:
                        engine_ref = ENGINE
                        ENGINE = None
                        result = cool_down_engine(engine_ref, restart_process=True)
                    result["telemetry"] = get_vram_telemetry()
                    return self.send_json({"status": "ok", **result})
                except Exception as exc:
                    return self.send_error_json(500, f"{type(exc).__name__}: {exc}")
            if path == "/api/llm_feedback":
                try:
                    payload = read_body(self)
                    text = local_llm_feedback(payload)
                    if not text:
                        raise RuntimeError("local LLM returned an empty reply")
                    return self.send_json({
                        "status": "ok",
                        "persona": "Tsuki Hoshi",
                        "question": "How can I improve this voice?",
                        "reply": text,
                    })
                except HTTPError as exc:
                    return self.send_error_json(exc.code, f"Local LLM HTTPError: {exc.reason}")
                except URLError as exc:
                    return self.send_error_json(502, f"Local LLM connection failed: {exc.reason}")
                except Exception as exc:
                    return self.send_error_json(500, f"{type(exc).__name__}: {exc}")
            if path == "/api/personas/custom":
                try:
                    payload = read_body(self)
                    persona = payload.get("persona") if isinstance(payload, dict) else None
                    saved, personas = upsert_custom_persona(persona)
                    return self.send_json({
                        "status": "ok",
                        "path": str(CUSTOM_PERSONAS_PATH),
                        "persona": saved,
                        "personas": personas,
                    })
                except Exception as exc:
                    return self.send_error_json(400, f"{type(exc).__name__}: {exc}")
            return self.send_error_json(404, "Not found")

        temp_ref_path = None
        temp_prompt_path = None
        try:
            payload = read_body(self)
            text = (payload.get("text") or "").strip()
            voice_design = (payload.get("voice_design") or "").strip()
            language = (payload.get("language") or "English").strip()
            ref_audio_base64 = payload.get("ref_audio_base64")
            prompt_audio_base64 = payload.get("prompt_audio_base64")
            prompt_text = (payload.get("prompt_text") or "").strip()
            if not prompt_text:
                prompt_text = None
            max_len = int(payload.get("max_len", 4096))
            seed = int(payload.get("seed", -1))
            cfg_value = float(payload.get("cfg_value", 2.0))
            inference_timesteps = int(payload.get("inference_timesteps", 10))
            denoise = bool(payload.get("denoise", False))
            mode = (payload.get("mode") or "voice-design").strip()
            consent_ack = bool(payload.get("consent_ack", False))

            if not text:
                raise ValueError("text is required")
            if mode in ("zero-shot", "continuation") and not consent_ack:
                raise ValueError("consent acknowledgement is required for uploaded voice modes")

            if ref_audio_base64:
                import base64
                audio_data = base64.b64decode(ref_audio_base64, validate=True)
                temp_ref_path = os.path.join(tempfile.gettempdir(), f"ref_{uuid.uuid4().hex}.wav")
                with open(temp_ref_path, "wb") as f:
                    f.write(audio_data)

            if prompt_audio_base64:
                import base64
                prompt_audio_data = base64.b64decode(prompt_audio_base64, validate=True)
                temp_prompt_path = os.path.join(tempfile.gettempdir(), f"prompt_{uuid.uuid4().hex}.wav")
                with open(temp_prompt_path, "wb") as f:
                    f.write(prompt_audio_data)

            engine = get_engine()
            
            if path == "/api/generate_stream":
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Transfer-Encoding", "chunked")
                # Send the sample rate in header so client knows how to play it
                self.send_header("X-Sample-Rate", str(engine.model.tts_model.sample_rate))
                self.end_headers()
                
                import numpy as np
                import soundfile as sf
                accumulated_chunks = []
                final_sr = 48000
                
                with ENGINE_LOCK:
                    for chunk, sample_rate in engine.generate_design_stream(
                        text=text,
                        language=language,
                        instruct=voice_design,
                        reference_wav_path=temp_ref_path,
                        cfg_value=cfg_value,
                        inference_timesteps=inference_timesteps,
                        denoise=denoise,
                        prompt_wav_path=temp_prompt_path,
                        prompt_text=prompt_text,
                        max_len=max_len,
                        seed=seed
                    ):
                        accumulated_chunks.append(chunk)
                        final_sr = sample_rate
                        
                        chunk_int16 = (chunk * 32767).astype(np.int16)
                        data = chunk_int16.tobytes()
                        chunk_header = f"{len(data):X}\r\n".encode("ascii")
                        self.wfile.write(chunk_header)
                        self.wfile.write(data)
                        self.wfile.write(b"\r\n")
                        self.wfile.flush()
                        
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
                
                if accumulated_chunks:
                    full_audio = np.concatenate(accumulated_chunks)
                    outputs_dir = str(OUTPUTS_DIR)
                    os.makedirs(outputs_dir, exist_ok=True)
                    filename = f"waifuvoice_voxcpm_{uuid.uuid4().hex[:8]}.wav"
                    out_path_target = os.path.join(outputs_dir, filename)
                    sf.write(str(out_path_target), full_audio, final_sr)
                    write_output_metadata(
                        filename,
                        build_generation_metadata(payload, filename, final_sr, mode),
                    )
                    
                return

            # Save permanently to the lobby outputs folder.
            outputs_dir = str(OUTPUTS_DIR)
            os.makedirs(outputs_dir, exist_ok=True)
            filename = f"waifuvoice_voxcpm_{uuid.uuid4().hex[:8]}.wav"
            out_path_target = os.path.join(outputs_dir, filename)
            
            with ENGINE_LOCK:
                out_path, sr, iteration_rate = engine.generate_design(
                    text=text,
                    language=language,
                    instruct=voice_design,
                    reference_wav_path=temp_ref_path,
                    output_path=out_path_target,
                    cfg_value=cfg_value,
                    inference_timesteps=inference_timesteps,
                    denoise=denoise,
                    prompt_wav_path=temp_prompt_path,
                    prompt_text=prompt_text,
                    max_len=max_len,
                    seed=seed
                )
                
            if not out_path or not os.path.exists(out_path):
                raise RuntimeError("Synthesis returned no audio data.")
            write_output_metadata(
                filename,
                build_generation_metadata(payload, filename, sr, mode, iteration_rate),
            )

            with open(out_path, "rb") as f:
                wav_data = f.read()
                
            # Do not remove out_path; leave it in the lobby outputs folder.
            response_headers = {
                "Content-Disposition": f'inline; filename="{filename}"',
                "X-Sample-Rate": str(sr),
                "X-Model-Source": "VoxCPM2",
                "X-Output-Filename": filename,
            }
            if iteration_rate:
                response_headers["X-Iteration-Rate"] = f"{iteration_rate:.2f}"

            self.send_payload(
                200,
                wav_data,
                "audio/wav",
                extra_headers=response_headers,
            )
        except Exception as exc:
            self.send_error_json(500, f"{type(exc).__name__}: {exc}")
        finally:
            for temp_path in (temp_ref_path, temp_prompt_path):
                if temp_path and os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except Exception:
                        pass

def main():
    print("====================================================")
    print("VoiceGen (rocm-voxcpm) VoxCPM backend active at:")
    print(f"  http://localhost:{PORT}")
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


