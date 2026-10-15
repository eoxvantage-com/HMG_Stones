"""Diffusers-backed visual preview generation for reviewed HMG floor plans.

This Taruvi function is an orchestrator only. It calls an external GPU service
(Hugging Face Inference Endpoint, Space, or private worker) that runs Diffusers,
then stores the returned image in private Taruvi storage.
"""
import base64
import hashlib
import io
import json
import re
import uuid
from datetime import datetime, timezone

import requests

FUNCTION_SLUG = "hmg-generate-plan-visual-preview"
PLAN_TABLE = "hmg_revisions"
PLAN_BUCKET = "hmg-project-plans"
APP_ROLE = "HMG Administrator"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
DEFAULT_MODEL = "stable-diffusion-xl-controlnet"
ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}


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
    if required and not value:
        raise ValueError("Required text missing")
    return value[:limit]


def secret_text(secret, *keys):
    value = secret.get("value") if isinstance(secret, dict) else secret
    if isinstance(value, dict):
        for key in keys or ("url", "endpoint", "value", "api_key", "token", "key"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip() and candidate != "[ENCRYPTED]":
                return candidate.strip()
    if isinstance(value, str) and value.strip() and value != "[ENCRYPTED]":
        return value.strip()
    raise ValueError("Secret unavailable")


def latest_project(database, project_id):
    rows = database.from_(PLAN_TABLE).filter("project_id", "eq", project_id).sort("version", "desc").page_size(1).execute().get("data", [])
    if not rows:
        raise ValueError("Project not found")
    snapshot = rows[0].get("snapshot")
    if not isinstance(snapshot, dict):
        raise ValueError("Project unavailable")
    return snapshot


def find_upload(project, upload_id):
    for upload in project.get("planUploads") or []:
        if isinstance(upload, dict) and upload.get("id") == upload_id:
            return upload
    raise ValueError("Plan upload not found")


def user_roles(user_data):
    values = user_data.get("roles", []) if isinstance(user_data, dict) else []
    if not isinstance(values, list):
        return set()
    return {r.get("name") for r in values if isinstance(r, dict) and isinstance(r.get("name"), str) and r.get("appslug") == "hmg_stones"}


def authorized(project, user_data):
    actor = str(user_data.get("id", ""))
    role_names = user_roles(user_data)
    return bool(user_data.get("is_superuser") is True or APP_ROLE in role_names or actor in (project.get("participants") or []))


def concise_rooms(upload):
    reviewed = upload.get("reviewed") or {}
    rooms = reviewed.get("rooms") or []
    if not isinstance(rooms, list) or not rooms:
        raise ValueError("Review plan before generating visual preview")
    result = []
    for room in rooms[:20]:
        if not isinstance(room, dict):
            continue
        result.append({
            "name": text(room.get("name"), 80) or "Room",
            "category": text(room.get("category"), 40) or "other",
            "lengthFt": room.get("lengthFt"),
            "widthFt": room.get("widthFt"),
            "heightFt": room.get("heightFt"),
            "xFt": room.get("xFt"),
            "zFt": room.get("zFt"),
            "floor": bool(room.get("includeFloor")),
            "walls": bool(room.get("includeInteriorWalls")),
        })
    if not result:
        raise ValueError("Reviewed room data unavailable")
    return result


def build_prompt(project, upload):
    extraction = upload.get("extraction") or {}
    reviewed = upload.get("reviewed") or {}
    assignments = reviewed.get("assignments") or {}
    material_targets = sorted(assignments.keys())[:30] if isinstance(assignments, dict) else []
    rooms = concise_rooms(upload)
    summary = {
        "project": text(project.get("name"), 120) or "HMG Stones project",
        "floorName": text(extraction.get("floorName"), 80) or "Ground Floor",
        "buildingFacing": text(extraction.get("buildingFacing"), 40) or "unknown",
        "builtUpAreaSqFt": extraction.get("builtUpAreaSqFt"),
        "footprint": extraction.get("footprint"),
        "rooms": rooms,
        "features": extraction.get("features") or [],
        "openings": extraction.get("openings") or [],
        "stoneTargets": material_targets,
    }
    prompt = (
        "Create a realistic but clearly conceptual interior floor-plan visual for an HMG Stones customer. "
        "Show the full reviewed home layout with connected rooms, walls, openings, stairs/ducts when present, and premium stone surfaces on selected floors/walls. "
        "Keep the geometry aligned to the supplied plan summary; do not add extra rooms. "
        "Use neutral lighting, human-understandable room volumes, and no people. "
        "This is a visual preview only, not measured construction documentation. "
        f"Plan summary JSON: {json.dumps(summary, sort_keys=True, separators=(',', ':'))}"
    )
    return prompt[:4000]


def provider_payload(prompt, project_id, upload_id):
    return {
        "prompt": prompt,
        "negative_prompt": "incorrect room count, extra rooms, unreadable layout, distorted plan, people, watermark, text labels, unsafe construction advice",
        "width": 1024,
        "height": 768,
        "num_inference_steps": 30,
        "guidance_scale": 7.0,
        "metadata": {"projectId": project_id, "uploadId": upload_id, "source": "hmg-plan-to-3d"},
    }


def extract_image(response):
    content_type = response.headers.get("content-type", "").split(";")[0].lower()
    body = response.content
    if content_type in ALLOWED_MIME_TYPES:
        return body, content_type, {}
    data = response.json()
    image_b64 = data.get("imageBase64") or data.get("image_base64") or data.get("b64_json")
    if not image_b64 and isinstance(data.get("data"), list) and data["data"]:
        first = data["data"][0]
        if isinstance(first, dict):
            image_b64 = first.get("b64_json") or first.get("image_base64")
    if not isinstance(image_b64, str):
        raise ValueError("Diffusers response did not include an image")
    if image_b64.startswith("data:image/"):
        header, image_b64 = image_b64.split(",", 1)
        content_type = header.split(";")[0].replace("data:", "")
    else:
        content_type = text(data.get("mimeType") or "image/png", 40)
    return base64.b64decode(image_b64, validate=True), content_type, data


def validate_image(image_bytes, mime_type):
    if not isinstance(image_bytes, (bytes, bytearray)) or len(image_bytes) < 12 or len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError("Diffusers image outside supported size")
    image_bytes = bytes(image_bytes)
    if mime_type == "image/png" and image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if mime_type == "image/jpeg" and image_bytes[:3] == b"\xff\xd8\xff":
        return "jpg"
    if mime_type == "image/webp" and image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "webp"
    raise ValueError("Diffusers image signature does not match declared type")


def call_diffusers(endpoint, token, payload):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    response = requests.post(endpoint, headers=headers, json=payload, timeout=110, allow_redirects=False)
    try:
        if response.status_code not in (200, 201):
            raise ValueError("Diffusers provider unavailable")
        return extract_image(response)
    finally:
        response.close()


def storage_upload(storage, path, image_bytes, mime_type, project_id, upload_id, preview_id):
    storage.from_(PLAN_BUCKET).upload(
        files=[(path.rsplit("/", 1)[-1], io.BytesIO(image_bytes))],
        paths=[path],
        metadatas=[{"projectId": project_id, "uploadId": upload_id, "previewId": preview_id, "purpose": "plan-visual-preview", "mimeType": mime_type}],
    )


def visual_preview_proof(signing_key, preview):
    clean = dict(preview)
    clean.pop("visualPreviewProof", None)
    return hashlib.sha256(("v1:" + signing_key + ":" + json.dumps(clean, sort_keys=True, separators=(",", ":"))).encode("utf-8")).hexdigest()


def main(params, user_data, sdk_client):
    if not user_data or not user_data.get("id"):
        return safe_error("UNAUTHENTICATED", "Sign in required")
    params = params or {}
    project_id = text(params.get("projectId"), 100, required=True)
    upload_id = text(params.get("uploadId"), 100, required=True)
    stage = "config"
    try:
        endpoint = secret_text(sdk_client.secrets.get("HMG_DIFFUSERS_ENDPOINT"), "url", "endpoint", "value")
        try:
            token = secret_text(sdk_client.secrets.get("HMG_DIFFUSERS_TOKEN"), "token", "api_key", "key", "value")
        except Exception:
            token = ""
    except Exception:
        return safe_error("DIFFUSERS_CONFIG_MISSING", "Diffusers visual preview is not configured for this app.", stage)
    try:
        stage = "project"
        project = latest_project(sdk_client.database, project_id)
        if project.get("id") and project.get("id") != project_id:
            raise ValueError("Project mismatch")
        if not authorized(project, user_data):
            return safe_error("FORBIDDEN", "Your account does not have permission for this HMG operation.", stage)
        stage = "upload"
        upload = find_upload(project, upload_id)
        prompt = build_prompt(project, upload)
        stage = "provider"
        image_bytes, mime_type, raw = call_diffusers(endpoint, token, provider_payload(prompt, project_id, upload_id))
        stage = "image"
        ext = validate_image(image_bytes, mime_type)
        preview_id = str(uuid.uuid4())
        storage_path = f"projects/{project_id}/plans/{upload_id}/visual-previews/{preview_id}.{ext}"
        stage = "storage"
        storage_upload(sdk_client.storage, storage_path, image_bytes, mime_type, project_id, upload_id, preview_id)
        now = datetime.now(timezone.utc).isoformat()
        preview = {
            "id": preview_id,
            "status": "Ready",
            "provider": "diffusers",
            "model": text(raw.get("model"), 120) or DEFAULT_MODEL if isinstance(raw, dict) else DEFAULT_MODEL,
            "createdAt": now,
            "storageBucket": PLAN_BUCKET,
            "storagePath": storage_path,
            "mimeType": mime_type,
            "prompt": prompt[:2000],
            "source": "AI visual only - not measured",
            "width": int(raw.get("width") or 1024) if isinstance(raw, dict) else 1024,
            "height": int(raw.get("height") or 768) if isinstance(raw, dict) else 768,
            "warnings": ["Visual preview only. Geometry, quote quantities, and technical approval come from reviewed plan data."],
        }
        preview["visualPreviewProof"] = visual_preview_proof(endpoint, preview)
        return {"ok": True, "data": preview}
    except Exception as exc:
        return safe_error("DIFFUSERS_VISUAL_PREVIEW_FAILED", "Diffusers visual preview could not be generated. The reviewed plan was preserved for retry.", stage, str(exc))
