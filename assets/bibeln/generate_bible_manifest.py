from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path


BIBLES_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BIBLES_DIR.parent.parent
MANIFEST_PATH = BIBLES_DIR / "bibles.json"
PROJECT_BIBLE_PATH = BIBLES_DIR / "0nefinity.txt"
TARGET_FONT_SIZE = 12
LINE_HEIGHT_FACTOR = 1.2
MONOSPACE_CHAR_WIDTH = 7.224609375
DOCUMENT_SEPARATOR = "--------------------"
EXCLUDED_DIRECTORY_PATHS = {
    Path(".git"),
    Path(".ssh"),
    Path(".vscode"),
    Path("assets/bibeln"),
    Path("tools/tools"),
}
EXCLUDED_FILE_PATHS = {
    Path(".gitattributes"),
    Path(".gitignore"),
    Path(".gitmodules"),
    Path(".htaccess"),
    Path(".htpasswd"),
    Path(".sitemap-cache"),
}
EXCLUDED_FILE_SUFFIXES = {
    ".avif",
    ".bmp",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".pdn",
    ".png",
    ".svg",
    ".webp",
}


def round_float(value: float, digits: int = 4) -> float:
    return round(float(value), digits)


def clean_display_name(file_name: str) -> str:
    return Path(file_name).stem.replace("_", " ")


def normalize_text(raw_text: str) -> str:
    return re.sub(r"\s+", " ", raw_text.replace("\ufeff", "")).strip()


def is_excluded_project_path(path: Path) -> bool:
    relative_path = path.relative_to(PROJECT_ROOT)
    if any(relative_path == excluded or excluded in relative_path.parents for excluded in EXCLUDED_DIRECTORY_PATHS):
        return True

    if relative_path in EXCLUDED_FILE_PATHS:
        return True

    if relative_path.name == ".env" or relative_path.name.startswith(".env."):
        return True

    return any(part.startswith(".") for part in relative_path.parts[:-1])


def read_project_text(path: Path) -> str | None:
    if path.suffix.lower() in EXCLUDED_FILE_SUFFIXES:
        return None

    try:
        raw_bytes = path.read_bytes()
    except OSError:
        return None

    if b"\x00" in raw_bytes:
        return None

    try:
        return raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return None


def build_project_bible_text() -> tuple[str, int]:
    documents: list[str] = []
    included_count = 0

    for path in sorted(PROJECT_ROOT.rglob("*"), key=lambda item: item.relative_to(PROJECT_ROOT).as_posix().lower()):
        if not path.is_file() or is_excluded_project_path(path):
            continue

        raw_text = read_project_text(path)
        if raw_text is None:
            continue

        relative_path = path.relative_to(PROJECT_ROOT).as_posix()
        document = f"{relative_path}\n{raw_text}"
        if not raw_text.endswith("\n"):
            document += "\n"
        document += f"{DOCUMENT_SEPARATOR}\n"
        documents.append(document)
        included_count += 1

    return "\n".join(documents), included_count


def write_project_bible() -> int:
    project_bible_text, included_count = build_project_bible_text()
    PROJECT_BIBLE_PATH.write_text(project_bible_text, encoding="utf-8")
    return included_count


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
    project_file_count = write_project_bible()
    manifest = build_manifest()
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"0nefinity geschrieben: {PROJECT_BIBLE_PATH}")
    print(f"projektdateien in 0nefinity: {project_file_count}")
    print(f"manifest geschrieben: {MANIFEST_PATH}")
    print(f"texte: {len(manifest['items'])}")


if __name__ == "__main__":
    main()