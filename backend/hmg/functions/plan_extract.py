"""Gemini-backed plan dimension extraction for HMG Stones."""
import base64
import json
import hashlib
import re
from datetime import datetime, timezone

import requests

FUNCTION_SLUG = "hmg-extract-plan-dimensions"
GEMINI_MODEL = "gemini-2.5-flash"
PLAN_TABLE = "hmg_revisions"
PLAN_BUCKET = "hmg-project-plans"
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_RESPONSE_BYTES = 128 * 1024
APP_ROLE = "HMG Administrator"
ALLOWED_MIME_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"}
ROOM_CATEGORIES = {"hall", "kitchen", "bedroom", "toilet", "sit_out", "pooja", "stair", "other"}
OPENING_TYPES = {"door", "window", "ventilator", "main_door", "unknown"}
CONFIDENCES = {"high", "medium", "low"}
FACINGS = {"north", "south", "east", "west", "unknown"}
TOP_LEVEL_KEYS = {"buildingFacing", "builtUpAreaSqFt", "floorName", "rooms", "openings", "warnings", "rawTextPreview"}
ROOM_KEYS = {"id", "label", "category", "lengthFt", "widthFt", "heightFt", "includeFloor", "includeInteriorWalls", "confidence", "notes"}
OPENING_KEYS = {"label", "type", "notes"}
FRACTIONS = {"½": 0.5, "¼": 0.25, "¾": 0.75, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875}


def safe_error(code, message, stage=None, detail=None):
    error = {"code": code, "message": message}
    if stage:
        error["stage"] = stage
    if detail:
        error["detail"] = text(detail, 240)
    return {"ok": False, "error": error}


def text(value, limit, *, required=False):
    if value is None:
        if required:
            raise ValueError("Required text missing")
        return ""
    if not isinstance(value, str):
        value = str(value)
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    if re.search(r"<\s*/?\s*(script|iframe|object|embed|style)\b", value, re.IGNORECASE):
        raise ValueError("Unsafe text")
    if required and not value:
        raise ValueError("Required text missing")
    return value[:limit]


def slug(value, fallback):
    base = text(value, 80) or fallback
    slug = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")
    return (slug or fallback)[:80]


def bounded_list(value, limit, item_limit):
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        raise ValueError("Expected list")
    return [text(item, item_limit) for item in value[:limit] if text(item, item_limit)]


def numeric_text(value):
    if isinstance(value, str):
        match = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
        if match:
            return float(match.group(0))
    return value


def feet_inches_text(value):
    if not isinstance(value, str):
        return None
    source = value.strip()
    if not source:
        return None
    normalized = source.replace("′", "'").replace("’", "'").replace("“", '"').replace("”", '"')
    feet_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:'|feet|ft)", normalized, re.IGNORECASE)
    inch_match = re.search(r"(?:'|feet|ft)\s*[-\s]*([0-9]+(?:\.\d+)?)?", normalized, re.IGNORECASE)
    fraction = 0
    for marker, amount in FRACTIONS.items():
        if marker in normalized:
            fraction = amount
            break
    if feet_match:
        feet_value = float(feet_match.group(1))
        inches_value = 0
        if inch_match and inch_match.group(1):
            inches_value = float(inch_match.group(1))
        return feet_value + ((inches_value + fraction) / 12)
    plain = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(?:ft|feet)?\s*", normalized, re.IGNORECASE)
    if plain:
        return float(plain.group(1))
    return None


def dimensions_pair(value):
    if not isinstance(value, str):
        return None, None
    parts = re.split(r"\s*(?:x|×|by)\s*", value, maxsplit=1, flags=re.IGNORECASE)
    if len(parts) != 2:
        return None, None
    return feet_inches_text(parts[0]), feet_inches_text(parts[1])


def dimension(value):
    if value in (None, ""):
        return None
    parsed = feet_inches_text(value)
    if parsed is not None:
        value = parsed
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Invalid dimension")
    value = float(value)
    if value < 1 or value > 100:
        raise ValueError("Dimension outside supported range")
    return int(value) if value.is_integer() else round(value, 4)


def height(value):
    if value in (None, ""):
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Invalid height")
    value = float(value)
    if value < 6 or value > 20:
        raise ValueError("Height outside supported range")
    return int(value) if value.is_integer() else round(value, 4)


def optional_area(value):
    if value in (None, ""):
        return None
    value = numeric_text(value)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Invalid built-up area")
    value = float(value)
    if value <= 0 or value > 100000:
        raise ValueError("Built-up area outside supported range")
    return int(value) if value.is_integer() else round(value, 2)


def normalize_category(value):
    normalized = str(value or "other").strip().lower().replace(" ", "_").replace("-", "_")
    return normalized if normalized in ROOM_CATEGORIES else "other"


def normalize_confidence(value):
    normalized = str(value or "low").strip().lower()
    return normalized if normalized in CONFIDENCES else "low"


def normalize_extraction_json(raw, upload_id, model, now):
    if isinstance(raw, str):
        raw = json.loads(raw)
    if not isinstance(raw, dict):
        raise ValueError("Extraction JSON must be an object")
    floor_name = text(raw.get("floorName") or "Uploaded plan", 120, required=True)
    rooms_raw = raw.get("rooms")
    if not isinstance(rooms_raw, list) or not rooms_raw or len(rooms_raw) > 30:
        raise ValueError("Invalid room list")
    rooms = []
    seen_ids = set()
    for index, room in enumerate(rooms_raw, start=1):
        if not isinstance(room, dict):
            raise ValueError("Invalid room")
        label = text(room.get("label") or f"Room {index}", 120, required=True)
        room_id = slug(room.get("id") or label, f"room-{index}")
        original = room_id
        counter = 2
        while room_id in seen_ids:
            room_id = f"{original[:70]}-{counter}"
            counter += 1
        seen_ids.add(room_id)
        room_category = normalize_category(room.get("category"))
        inferred_length = None
        inferred_width = None
        if room.get("lengthFt") in (None, "") or room.get("widthFt") in (None, ""):
            inferred_length, inferred_width = dimensions_pair(room.get("dimensions"))
        rooms.append({
            "id": room_id,
            "label": label,
            "category": room_category,
            "lengthFt": dimension(room.get("lengthFt") if room.get("lengthFt") not in (None, "") else inferred_length),
            "widthFt": dimension(room.get("widthFt") if room.get("widthFt") not in (None, "") else inferred_width),
            "heightFt": height(room.get("heightFt")),
            "includeFloor": room.get("includeFloor") if isinstance(room.get("includeFloor"), bool) else True,
            "includeInteriorWalls": room.get("includeInteriorWalls") if isinstance(room.get("includeInteriorWalls"), bool) else room_category in {"kitchen", "toilet"},
            "confidence": normalize_confidence(room.get("confidence")),
            "notes": bounded_list(room.get("notes"), 8, 240),
        })
    openings_raw = raw.get("openings") or []
    if not isinstance(openings_raw, list) or len(openings_raw) > 40:
        raise ValueError("Invalid openings")
    openings = []
    for opening in openings_raw[:40]:
        if isinstance(opening, str):
            label = text(opening, 120, required=True)
            openings.append({"label": label, "type": "unknown", "notes": ""})
            continue
        if not isinstance(opening, dict):
            raise ValueError("Invalid opening")
        opening_type = str(opening.get("type") or "unknown").strip().lower()
        openings.append({
            "label": text(opening.get("label") or "Opening", 120, required=True),
            "type": opening_type if opening_type in OPENING_TYPES else "unknown",
            "notes": text(opening.get("notes"), 240) if opening.get("notes") is not None else "",
        })
    facing = str(raw.get("buildingFacing") or "unknown").strip().lower()
    result = {
        "sourceUploadId": text(upload_id, 100, required=True),
        "model": text(model, 80, required=True),
        "generatedAt": text(now, 40, required=True),
        "buildingFacing": facing if facing in FACINGS else "unknown",
        "floorName": floor_name,
        "rooms": rooms,
        "openings": openings,
        "warnings": bounded_list(raw.get("warnings"), 12, 300),
        "rawTextPreview": "",
    }
    area = optional_area(raw.get("builtUpAreaSqFt"))
    if area is not None:
        result["builtUpAreaSqFt"] = area
    return result


def extraction_proof(api_key, draft):
    canonical = json.dumps(draft, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(("v1:" + api_key + ":" + canonical).encode("utf-8")).hexdigest()

def validate_plan_mime(mime_type):
    mime = str(mime_type or "").strip().lower()
    if mime not in ALLOWED_MIME_TYPES:
        raise ValueError("Unsupported plan file type")
    return "image/jpeg" if mime == "image/jpg" else mime


def build_gemini_prompt():
    return (
        "Extract room names, visible dimensions, building facing, openings, and warnings from this HMG Stones "
        "customer plan. Return strict JSON only with keys: buildingFacing, builtUpAreaSqFt, floorName, rooms, "
        "openings, warnings, rawTextPreview. Preserve original room labels where readable. Parse feet and inches "
        "into decimal feet. Use null for missing dimensions. Never estimate hidden wall thickness, adjacency, or "
        "unreadable dimensions. Put uncertainty in warnings and per-room notes. rawTextPreview must be a short safe "
        "excerpt, not full document text. Room category must be one of hall, kitchen, bedroom, toilet, sit_out, "
        "pooja, stair, other. Confidence must be high, medium, or low."
    )


def extract_json_text(response_json):
    candidates = response_json.get("candidates") if isinstance(response_json, dict) else None
    if not candidates:
        raise ValueError("No Gemini candidates")
    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    text = "".join(part.get("text", "") for part in parts if isinstance(part, dict))
    if not text:
        raise ValueError("No Gemini text")
    text = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    return fenced.group(1).strip() if fenced else text


def call_gemini(api_key, file_bytes, mime_type, prompt, model=GEMINI_MODEL):
    if not isinstance(file_bytes, (bytes, bytearray)):
        raise ValueError("Plan file download failed")
    if len(file_bytes) > MAX_FILE_BYTES:
        raise ValueError("Plan file exceeds extraction limit")
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}, {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(bytes(file_bytes)).decode("ascii")}}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 4096, "responseMimeType": "application/json"},
    }
    response = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        json=payload,
        timeout=40,
        allow_redirects=False,
        stream=True,
    )
    if response.status_code != 200:
        response.close()
        raise ValueError("Gemini provider unavailable")
    chunks = []
    size = 0
    for chunk in response.iter_content(chunk_size=4096):
        size += len(chunk)
        if size > MAX_RESPONSE_BYTES:
            response.close()
            raise ValueError("Gemini response exceeds budget")
        chunks.append(chunk)
    response.close()
    body = json.loads(b"".join(chunks).decode("utf-8"))
    return json.loads(extract_json_text(body))


def secret_value(secret):
    value = secret.get("value") if isinstance(secret, dict) else secret
    if isinstance(value, dict):
        value = value.get("api_key") or value.get("key")
    if not isinstance(value, str) or not value.strip() or value == "[ENCRYPTED]":
        raise ValueError("Gemini key unavailable")
    return value.strip()


def latest_project(database, project_id):
    rows = database.from_(PLAN_TABLE).filter("project_id", "eq", project_id).sort("version", "desc").page_size(1).execute().get("data", [])
    if not rows:
        raise ValueError("Project not found")
    snapshot = rows[0].get("snapshot")
    if not isinstance(snapshot, dict):
        raise ValueError("Project unavailable")
    return snapshot


def find_upload(project, upload_id):
    uploads = project.get("planUploads") or []
    if not isinstance(uploads, list):
        raise ValueError("Plan uploads unavailable")
    for upload in uploads:
        if isinstance(upload, dict) and upload.get("id") == upload_id:
            return upload
    raise ValueError("Plan upload not found")


def validate_upload(project_id, upload):
    if upload.get("storageBucket") != PLAN_BUCKET:
        raise ValueError("Unsupported plan bucket")
    mime_type = validate_plan_mime(upload.get("mimeType"))
    path = text(upload.get("storagePath"), 500, required=True)
    upload_id = text(upload.get("id"), 100, required=True)
    expected_prefix = f"projects/{project_id}/plans/{upload_id}/"
    if not path.startswith(expected_prefix) or ".." in path or path.endswith("/"):
        raise ValueError("Invalid plan storage path")
    return {"bucket": PLAN_BUCKET, "path": path, "mimeType": mime_type, "uploadId": upload_id}


def user_roles(user_data):
    values = user_data.get("roles", []) if isinstance(user_data, dict) else []
    if not isinstance(values, list):
        return set()
    return {r.get("name") for r in values if isinstance(r, dict) and isinstance(r.get("name"), str) and r.get("appslug") == "hmg_stones"}


def authorized(project, user_data):
    actor = str(user_data.get("id", ""))
    role_names = user_roles(user_data)
    return bool(user_data.get("is_superuser") is True or APP_ROLE in role_names or actor in (project.get("participants") or []))


def verify_signature(file_bytes, mime_type):
    if mime_type == "application/pdf" and file_bytes.startswith(b"%PDF-"):
        return
    if mime_type == "image/png" and file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return
    if mime_type == "image/jpeg" and file_bytes[:3] == b"\xff\xd8\xff":
        return
    if mime_type == "image/webp" and file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WEBP":
        return
    raise ValueError("Plan file signature does not match declared type")


def download(storage, bucket, path, mime_type):
    data = storage.from_(bucket).download(path)
    if hasattr(data, "read"):
        data = data.read()
    if isinstance(data, str):
        data = data.encode("utf-8")
    if not isinstance(data, (bytes, bytearray)):
        raise ValueError("Plan file download failed")
    if len(data) > MAX_FILE_BYTES:
        raise ValueError("Plan file exceeds extraction limit")
    data = bytes(data)
    verify_signature(data, mime_type)
    return data


def main(params, user_data, sdk_client):
    if not user_data or not user_data.get("id"):
        return safe_error("UNAUTHENTICATED", "Sign in required")
    params = params or {}
    project_id = text(params.get("projectId"), 100, required=True)
    upload_id = text(params.get("uploadId"), 100, required=True)
    stage = "secret"
    try:
        api_key = secret_value(sdk_client.secrets.get("G_API_key"))
    except Exception:
        return safe_error("GEMINI_SECRET_MISSING", "Gemini extraction is not configured for this app.", stage)
    try:
        stage = "project"
        project = latest_project(sdk_client.database, project_id)
        if project.get("id") and project.get("id") != project_id:
            raise ValueError("Project mismatch")
        if not authorized(project, user_data):
            return safe_error("FORBIDDEN", "Your account does not have permission for this HMG operation.", stage)
        stage = "upload"
        upload = validate_upload(project_id, find_upload(project, upload_id))
        stage = "storage"
        file_bytes = download(sdk_client.storage, upload["bucket"], upload["path"], upload["mimeType"])
        stage = "provider"
        raw = call_gemini(api_key, file_bytes, upload["mimeType"], build_gemini_prompt(), GEMINI_MODEL)
        stage = "normalize"
        draft = normalize_extraction_json(raw, upload_id, GEMINI_MODEL, datetime.now(timezone.utc).isoformat())
        draft["extractionProof"] = extraction_proof(api_key, draft)
        return {"ok": True, "data": draft}
    except Exception as exc:
        return safe_error("PLAN_EXTRACTION_FAILED", "Plan dimensions could not be extracted. The upload was preserved for retry or manual review.", stage, str(exc))





