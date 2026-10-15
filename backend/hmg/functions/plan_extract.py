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
TOP_LEVEL_KEYS = {"buildingFacing", "builtUpAreaSqFt", "floorName", "rooms", "openings", "warnings", "rawTextPreview", "footprint", "features"}
ROOM_KEYS = {"id", "label", "category", "lengthFt", "widthFt", "heightFt", "includeFloor", "includeInteriorWalls", "confidence", "notes", "xFt", "zFt", "rect"}
OPENING_KEYS = {"label", "type", "notes", "roomId", "wall", "widthFt", "heightFt"}
FEATURE_TYPES = {"stair", "duct", "road", "setback", "balcony", "sit_out", "other"}
WALLS = {"north", "east", "south", "west", "unknown"}
FRACTIONS = {"½": 0.5, "¼": 0.25, "¾": 0.75, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875}
FT_PER_M = 3.280839895
EXTRACTION_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "buildingFacing": {"type": "string", "enum": ["north", "south", "east", "west", "unknown"]},
        "builtUpAreaSqFt": {"type": "number"},
        "floorName": {"type": "string"},
        "footprint": {
            "type": "object",
            "properties": {"lengthFt": {"type": "number"}, "widthFt": {"type": "number"}},
        },
        "features": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "type": {"type": "string", "enum": ["stair", "duct", "road", "setback", "balcony", "sit_out", "other"]},
                    "xFt": {"type": "number"}, "zFt": {"type": "number"},
                    "lengthFt": {"type": "number"}, "widthFt": {"type": "number"},
                    "notes": {"type": "string"},
                },
            },
        },
        "rooms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "label": {"type": "string"},
                    "category": {"type": "string", "enum": sorted(ROOM_CATEGORIES)},
                    "lengthFt": {"type": "number", "nullable": True},
                    "widthFt": {"type": "number", "nullable": True},
                    "heightFt": {"type": "number", "nullable": True},
                    "dimensions": {"type": "string"},
                    "includeFloor": {"type": "boolean"},
                    "includeInteriorWalls": {"type": "boolean"},
                    "confidence": {"type": "string", "enum": sorted(CONFIDENCES)},
                    "notes": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["label", "category", "confidence"],
            },
        },
        "openings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "type": {"type": "string", "enum": sorted(OPENING_TYPES)},
                    "roomId": {"type": "string"},
                    "wall": {"type": "string"},
                    "widthFt": {"type": "number", "nullable": True},
                    "heightFt": {"type": "number", "nullable": True},
                    "notes": {"type": "string"},
                },
                "required": ["label", "type"],
            },
        },
        "warnings": {"type": "array", "items": {"type": "string"}},
        "rawTextPreview": {"type": "string"},
    },
    "required": ["floorName", "rooms", "openings", "warnings"],
}


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

def scalar(value, *keys):
    current = value
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def first_value(*values):
    for value in values:
        if value not in (None, ""):
            return value
    return None


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
        ascii_fraction = re.search(r"(?:'|feet|ft)\s*[-\s]*(\d+)\s+(\d+)\s*/\s*(\d+)", normalized, re.IGNORECASE)
        if ascii_fraction:
            inches_value = float(ascii_fraction.group(1)) + (float(ascii_fraction.group(2)) / float(ascii_fraction.group(3)))
            fraction = 0
        elif inch_match and inch_match.group(1):
            inches_token = inch_match.group(1)
            if inches_token.isdigit() and len(inches_token) >= 3:
                suffix = inches_token[-2:]
                prefix = inches_token[:-2]
                compact_fraction = {"12": 0.5, "14": 0.25, "34": 0.75}.get(suffix)
                if compact_fraction is not None and prefix:
                    inches_value = float(prefix) + compact_fraction
                else:
                    inches_value = float(inches_token)
            else:
                inches_value = float(inches_token)
        return feet_value + ((inches_value + fraction) / 12)
    plain = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(?:ft|feet)?\s*", normalized, re.IGNORECASE)
    if plain:
        return float(plain.group(1))
    return None

def metric_text(value):
    if not isinstance(value, str):
        return None
    source = value.strip().lower()
    if not source:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)\s*(?:m|metre|meter|metres|meters)\b", source)
    if match:
        return float(match.group(1)) * FT_PER_M
    cm_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:cm|centimetre|centimeter|centimetres|centimeters)\b", source)
    if cm_match:
        return float(cm_match.group(1)) / 100 * FT_PER_M
    return None


def unit_value(value):
    if isinstance(value, dict):
        number = first_value(value.get("value"), value.get("amount"), value.get("number"))
        unit = str(value.get("unit") or value.get("uom") or "ft").strip().lower()
        if isinstance(number, str):
            parsed = feet_inches_text(number) or metric_text(number) or numeric_text(number)
            number = parsed
        if isinstance(number, (int, float)) and not isinstance(number, bool):
            if unit in {"m", "meter", "meters", "metre", "metres"}:
                return float(number) * FT_PER_M
            if unit in {"cm", "centimeter", "centimeters", "centimetre", "centimetres"}:
                return float(number) / 100 * FT_PER_M
            return float(number)
    if isinstance(value, str):
        return feet_inches_text(value) or metric_text(value) or numeric_text(value)
    return value


def dimensions_pair(value):
    if not isinstance(value, str):
        return None, None
    parts = re.split(r"\s*(?:x|×|by)\s*", value, maxsplit=1, flags=re.IGNORECASE)
    if len(parts) != 2:
        return None, None
    return unit_value(parts[0]), unit_value(parts[1])


def dimension(value):
    if value in (None, ""):
        return None
    parsed = unit_value(value)
    if parsed is not None:
        value = parsed
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Invalid dimension")
    value = float(value)
    if value < 1 or value > 100:
        raise ValueError("Dimension outside supported range")
    return int(value) if value.is_integer() else round(value, 4)


def plan_coordinate(value):
    if value in (None, ""):
        return None
    parsed = unit_value(value)
    if parsed is not None:
        value = parsed
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Invalid plan coordinate")
    value = float(value)
    if value < 0 or value > 500:
        raise ValueError("Plan coordinate outside supported range")
    return int(value) if value.is_integer() else round(value, 4)


def rect_value(raw):
    if not isinstance(raw, dict):
        return None
    length_value = first_value(raw.get("lengthFt"), raw.get("length"))
    width_value = first_value(raw.get("widthFt"), raw.get("width"), raw.get("depth"))
    rect = {
        "xFt": plan_coordinate(first_value(raw.get("xFt"), raw.get("x"), raw.get("leftFt"))),
        "zFt": plan_coordinate(first_value(raw.get("zFt"), raw.get("yFt"), raw.get("y"), raw.get("topFt"))),
        "lengthFt": dimension(length_value),
        "widthFt": dimension(width_value),
    }
    if any(value is None for value in rect.values()):
        return None
    return rect


def feature_list(raw):
    value = first_value(raw.get("features"), raw.get("planFeatures"), raw.get("nonRoomFeatures"), raw.get("annotations"))
    return value if isinstance(value, list) else []


def height(value):
    if value in (None, ""):
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Invalid height")
    value = float(value)
    if value < 6 or value > 20:
        raise ValueError("Height outside supported range")
    return int(value) if value.is_integer() else round(value, 4)


def confidence_value(value):
    if isinstance(value, dict):
        value = first_value(value.get("level"), value.get("value"), value.get("confidence"))
    return normalize_confidence(value)


def room_list(raw):
    rooms = raw.get("rooms")
    if isinstance(rooms, list) and rooms:
        return rooms
    floors = raw.get("floors") or raw.get("levels") or raw.get("storeys")
    if isinstance(floors, list):
        result = []
        for floor in floors:
            if isinstance(floor, dict) and isinstance(floor.get("rooms"), list):
                for room in floor["rooms"]:
                    if isinstance(room, dict):
                        result.append({**room, "_floorName": first_value(floor.get("name"), floor.get("label"), floor.get("floorName"))})
        return result
    return rooms


def opening_list(raw):
    for key in ("openings", "doorsWindows", "doorsAndWindows", "apertures"):
        value = raw.get(key)
        if isinstance(value, list):
            return value
    return raw.get("openings") or []


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
    rooms_raw = room_list(raw)
    if not isinstance(rooms_raw, list) or not rooms_raw or len(rooms_raw) > 30:
        raise ValueError("Invalid room list")
    rooms = []
    seen_ids = set()
    for index, room in enumerate(rooms_raw, start=1):
        if not isinstance(room, dict):
            raise ValueError("Invalid room")
        label = text(first_value(room.get("label"), room.get("name"), room.get("roomName"), room.get("title")) or f"Room {index}", 120, required=True)
        room_id = slug(room.get("id") or label, f"room-{index}")
        original = room_id
        counter = 2
        while room_id in seen_ids:
            room_id = f"{original[:70]}-{counter}"
            counter += 1
        seen_ids.add(room_id)
        room_category = normalize_category(first_value(room.get("category"), room.get("roomType"), room.get("type"), room.get("usage")))
        inferred_length = None
        inferred_width = None
        dimensions_text = first_value(room.get("dimensions"), room.get("dimensionText"), room.get("size"), room.get("roomSize"))
        if first_value(room.get("lengthFt"), room.get("length"), room.get("lengthValue")) in (None, "") or first_value(room.get("widthFt"), room.get("width"), room.get("widthValue")) in (None, ""):
            inferred_length, inferred_width = dimensions_pair(dimensions_text)
        length_value = first_value(room.get("lengthFt"), room.get("length"), room.get("lengthValue"), scalar(room, "dimensions", "length"), inferred_length)
        width_value = first_value(room.get("widthFt"), room.get("width"), room.get("widthValue"), scalar(room, "dimensions", "width"), inferred_width)
        normalized_room = {
            "id": room_id,
            "label": label,
            "category": room_category,
            "lengthFt": dimension(length_value),
            "widthFt": dimension(width_value),
            "heightFt": height(first_value(room.get("heightFt"), room.get("height"), room.get("heightValue"))),
            "includeFloor": room.get("includeFloor") if isinstance(room.get("includeFloor"), bool) else True,
            "includeInteriorWalls": room.get("includeInteriorWalls") if isinstance(room.get("includeInteriorWalls"), bool) else room_category in {"kitchen", "toilet"},
            "confidence": confidence_value(room.get("confidence")),
            "notes": bounded_list(room.get("notes"), 8, 240),
        }
        room_rect = rect_value(room.get("rect") or room.get("bounds") or room.get("position"))
        x_value = plan_coordinate(first_value(room.get("xFt"), room.get("x"), scalar(room, "rect", "xFt"), scalar(room, "position", "xFt")))
        z_value = plan_coordinate(first_value(room.get("zFt"), room.get("yFt"), room.get("y"), scalar(room, "rect", "zFt"), scalar(room, "position", "zFt")))
        if room_rect:
            normalized_room.update(room_rect)
        elif x_value is not None and z_value is not None:
            normalized_room["xFt"] = x_value
            normalized_room["zFt"] = z_value
        rooms.append(normalized_room)
    openings_raw = opening_list(raw)
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
        opening_type = str(first_value(opening.get("type"), opening.get("openingType"), opening.get("kind")) or "unknown").strip().lower()
        normalized_opening = {
            "label": text(first_value(opening.get("label"), opening.get("name"), opening.get("id")) or "Opening", 120, required=True),
            "type": opening_type if opening_type in OPENING_TYPES else "unknown",
            "notes": text(opening.get("notes"), 240) if opening.get("notes") is not None else "",
        }
        room_ref = text(first_value(opening.get("roomId"), opening.get("room"), opening.get("roomName")), 100)
        if room_ref:
            normalized_opening["roomId"] = slug(room_ref, room_ref)
        wall = str(opening.get("wall") or "unknown").strip().lower()
        if wall in WALLS:
            normalized_opening["wall"] = wall
        width = dimension(first_value(opening.get("widthFt"), opening.get("width")))
        height_value = height(first_value(opening.get("heightFt"), opening.get("height")))
        if width is not None:
            normalized_opening["widthFt"] = width
        if height_value is not None:
            normalized_opening["heightFt"] = height_value
        openings.append(normalized_opening)
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
    footprint = rect_value({**(raw.get("footprint") or {}), "xFt": 0, "zFt": 0}) if isinstance(raw.get("footprint"), dict) else None
    if footprint:
        result["footprint"] = {"lengthFt": footprint["lengthFt"], "widthFt": footprint["widthFt"]}
    features = []
    for index, feature in enumerate(feature_list(raw)[:30], start=1):
        if not isinstance(feature, dict):
            continue
        feature_type = str(first_value(feature.get("type"), feature.get("featureType"), feature.get("kind")) or "other").strip().lower().replace(" ", "_")
        feature_rect = rect_value(feature.get("rect") or feature.get("bounds") or feature)
        if not feature_rect:
            continue
        features.append({
            "id": slug(feature.get("id") or feature.get("label") or f"feature-{index}", f"feature-{index}"),
            "label": text(first_value(feature.get("label"), feature.get("name")) or f"Feature {index}", 120, required=True),
            "type": feature_type if feature_type in FEATURE_TYPES else "other",
            **feature_rect,
            "notes": text(feature.get("notes"), 240) if feature.get("notes") is not None else "",
        })
    if features:
        result["features"] = features
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
        "Extract a structured floor-plan dimension draft from any architect, builder, CAD, municipal, real-estate, "
        "or contractor template. Return strict JSON only matching the configured schema. Use only dimensions and "
        "labels that are visible in the uploaded PDF/image; Never estimate hidden wall thickness, adjacency, scale, "
        "or unreadable dimensions. Return every readable enclosed room/space with its original label, category, "
        "lengthFt and widthFt converted to decimal feet. When visible, include footprint length/width, room xFt/zFt top-left coordinates, and stair/duct/road/setback feature rectangles in feet from a common plan origin; otherwise omit coordinates. Use null for missing dimensions. Convert metric dimensions "
        "to feet. If a dimension is written as L x W, keep that order. Include doors, windows, ventilators and main "
        "doors when labels are visible. Put uncertainty in warnings and per-room notes. rawTextPreview must be a "
        "short safe excerpt, not full document text. Room category must be one of hall, kitchen, bedroom, toilet, "
        "sit_out, pooja, stair, other. Confidence must be high, medium, or low."
    )

def pdf_literal(value):
    value = value.replace(r"\(", "(").replace(r"\)", ")").replace(r"\\", "\\")
    value = re.sub(r"\\([nrtbf])", " ", value)
    value = re.sub(r"\\[0-7]{1,3}", " ", value)
    return value


def fallback_pdf_text(file_bytes):
    # Dependency-free fallback for uncompressed/plain PDF text. Gemini is the primary extractor.
    raw = bytes(file_bytes).decode("latin-1", "ignore")
    literals = [pdf_literal(item) for item in re.findall(r"\((?:\.|[^\)])*\)", raw)]
    text_value = " ".join(x[1:-1] if x.startswith("(") and x.endswith(")") else x for x in literals)
    return text_value or raw[:50000]


ROOM_LABELS = [
    ("kitchen / dining", "kitchen", "Kitchen / Dining"),
    ("master bed room", "bedroom", "Master Bed Room"),
    ("master bed", "bedroom", "Master Bed"),
    ("bed room", "bedroom", "Bed Room"),
    ("living", "hall", "Living"),
    ("sit out", "sit_out", "Sit Out"),
    ("pooja", "pooja", "Pooja"),
    ("kitchen", "kitchen", "Kitchen"),
    ("toilet", "toilet", "Toilet"),
    ("hall", "hall", "Hall"),
]


def room_label_from_segment(segment, index):
    clean = re.sub(r"www\.indianplans\.in|\b(?:PROPOSED|TYPICAL|GROUND|FIRST|FLOOR|PLAN)\b", " ", segment, flags=re.IGNORECASE)
    clean = re.sub(r"\b(?:ROAD|WIDE|FACING|BUILDING|BUILT|AREA|SFT|NORTH|SOUTH|EAST|WEST|UP|DUCT|GATE|MD|D2|D|W3|W2|W|V|O|N)\b", " ", clean, flags=re.IGNORECASE)
    lowered = clean.lower()
    found = None
    for needle, category, label in ROOM_LABELS:
        pos = lowered.rfind(needle)
        if pos >= 0 and (found is None or pos > found[0]):
            found = (pos, category, label)
    return (found[2], found[1]) if found else (f"Room {index}", "other")


def parse_floorplan_text(source_text, upload_id, now):
    source = text(source_text, 12000)
    if not source:
        raise ValueError("No readable PDF text")
    compact = re.sub(r"\s+", " ", source)
    facing_match = re.search(r"\b(NORTH|SOUTH|EAST|WEST)\s+FACING\s*BUILDING", compact, re.IGNORECASE)
    area_match = re.search(r"BUILT\s*UP\s*AREA\s*:\s*([0-9,]+(?:\.\d+)?)\s*SFT", compact, re.IGNORECASE)
    dim_pattern = re.compile(r"(\d+'\s*-\s*\d{1,4}(?:[¼½¾])?\"?)\s*(?:x|×)\s*(\d+'\s*-\s*\d{1,4}(?:[¼½¾])?\"?)", re.IGNORECASE)
    rooms = []
    seen = {}
    previous_end = 0
    for match in dim_pattern.finditer(compact):
        label, category = room_label_from_segment(compact[previous_end:match.start()], len(rooms) + 1)
        previous_end = match.end()
        length = dimension(match.group(1))
        width = dimension(match.group(2))
        if length is None or width is None:
            continue
        base_id = slug(label, f"room-{len(rooms)+1}")
        seen[base_id] = seen.get(base_id, 0) + 1
        room_id = base_id if seen[base_id] == 1 else f"{base_id}-{seen[base_id]}"
        rooms.append({
            "id": room_id,
            "label": label,
            "category": category,
            "lengthFt": length,
            "widthFt": width,
            "heightFt": None,
            "includeFloor": True,
            "includeInteriorWalls": category in {"kitchen", "toilet"},
            "confidence": "medium",
            "notes": ["Extracted from embedded PDF text; verify against the uploaded plan."],
        })
        if len(rooms) >= 20:
            break
    if not rooms:
        raise ValueError("No room dimensions found in PDF text")
    openings = []
    for marker, opening_type in [("MD", "main_door"), ("W3", "window"), ("W2", "window"), ("W", "window"), ("V", "ventilator"), ("D2", "door"), ("D", "door")]:
        if re.search(rf"\b{re.escape(marker)}\b", compact):
            openings.append({"label": marker, "type": opening_type, "notes": "Detected from embedded PDF labels."})
    result = {
        "sourceUploadId": text(upload_id, 100, required=True),
        "model": "Local PDF text fallback",
        "generatedAt": text(now, 40, required=True),
        "buildingFacing": facing_match.group(1).lower() if facing_match else "unknown",
        "floorName": "Uploaded plan",
        "rooms": rooms,
        "openings": openings[:20],
        "warnings": ["Local PDF text fallback used; confirm every dimension before generating 3D or quoting."],
        "rawTextPreview": text(compact, 500),
    }
    if area_match:
        result["builtUpAreaSqFt"] = optional_area(area_match.group(1))
    return result


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
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 4096, "responseMimeType": "application/json", "responseSchema": EXTRACTION_RESPONSE_SCHEMA},
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
        now = datetime.now(timezone.utc).isoformat()
        try:
            raw = call_gemini(api_key, file_bytes, upload["mimeType"], build_gemini_prompt(), GEMINI_MODEL)
            stage = "normalize"
            draft = normalize_extraction_json(raw, upload_id, GEMINI_MODEL, now)
        except Exception as provider_error:
            if upload["mimeType"] != "application/pdf":
                raise
            stage = "fallback"
            draft = parse_floorplan_text(fallback_pdf_text(file_bytes), upload_id, now)
            draft["warnings"] = draft.get("warnings", []) + [text(f"Gemini extraction fallback reason: {provider_error}", 240)]
        draft["extractionProof"] = extraction_proof(api_key, draft)
        return {"ok": True, "data": draft}
    except Exception as exc:
        return safe_error("PLAN_EXTRACTION_FAILED", "Plan dimensions could not be extracted. The upload was preserved for retry or manual review.", stage, str(exc))





