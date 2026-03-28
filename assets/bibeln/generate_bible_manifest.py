from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path


BIBLES_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BIBLES_DIR / "bibles.json"
TARGET_FONT_SIZE = 12
LINE_HEIGHT_FACTOR = 1.2
MONOSPACE_CHAR_WIDTH = 7.224609375


def round_float(value: float, digits: int = 4) -> float:
    return round(float(value), digits)


def clean_display_name(file_name: str) -> str:
    return Path(file_name).stem.replace("_", " ")


def normalize_text(raw_text: str) -> str:
    return re.sub(r"\s+", " ", raw_text.replace("\ufeff", "")).strip()


def solve_circle_radius(text_length: int, char_width: float, line_height: float) -> int:
    min_radius = max(char_width * 0.75, line_height * 0.75, 1)
    estimated_radius = math.sqrt(max(text_length, 1) * char_width * line_height / math.pi)
    low = min_radius
    high = max(min_radius * 2, estimated_radius * 1.8)

    def capacity_for_radius(radius: float) -> int:
        capacity = 0
        y = -radius + line_height / 2
        while y <= radius - line_height / 2:
            row_width = 2 * math.sqrt(max(0, radius * radius - y * y))
            capacity += math.floor(row_width / char_width)
            y += line_height
        return capacity

    while capacity_for_radius(high) < text_length:
        low = high
        high *= 2

    for _ in range(40):
        mid = (low + high) / 2
        capacity = capacity_for_radius(mid)
        if capacity >= text_length:
            high = mid
        else:
            low = mid

    return math.ceil(high)


def build_circle_layout_preset(text_length: int) -> dict:
    line_height = TARGET_FONT_SIZE * LINE_HEIGHT_FACTOR
    radius = solve_circle_radius(text_length, MONOSPACE_CHAR_WIDTH, line_height)

    return {
        "fontSize": TARGET_FONT_SIZE,
        "charWidth": round_float(MONOSPACE_CHAR_WIDTH),
        "lineHeight": round_float(line_height),
        "radius": radius,
        "bounds": {
            "minX": -radius,
            "maxX": radius,
            "minY": -radius,
            "maxY": radius,
            "width": radius * 2,
            "height": radius * 2,
        },
        "worldSpan": radius * 2,
    }


def analyze_file(path: Path) -> dict:
    raw_text = path.read_text(encoding="utf-8")
    normalized_text = normalize_text(raw_text)
    unique_chars = "".join(sorted(set(normalized_text)))

    return {
        "file": path.name,
        "name": clean_display_name(path.name),
        "rawCharCount": len(raw_text),
        "charCount": len(normalized_text),
        "uniqueCharCount": len(unique_chars),
        "uniqueChars": unique_chars,
        "layoutPresets": {
            "circle": build_circle_layout_preset(len(normalized_text)),
        },
    }


def build_manifest() -> dict:
    items = [
        analyze_file(path)
        for path in sorted(BIBLES_DIR.glob("*.txt"), key=lambda item: item.name.lower())
    ]

    return {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "items": items,
    }


def main() -> None:
    manifest = build_manifest()
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"manifest geschrieben: {MANIFEST_PATH}")
    print(f"texte: {len(manifest['items'])}")


if __name__ == "__main__":
    main()