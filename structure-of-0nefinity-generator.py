#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import os
from pathlib import Path

DEFAULT_IGNORES = {
    ".git", ".hg", ".svn", ".DS_Store", "__pycache__", "node_modules",
    "dist", "build", ".venv", ".idea", ".vscode"
}
DEFAULT_SUFFIX_IGNORES = {".log", ".tmp", ".swp", ".lock"}

def should_ignore(name: str, is_dir: bool) -> bool:
    if name in DEFAULT_IGNORES:
        return True
    for suf in DEFAULT_SUFFIX_IGNORES:
        if name.endswith(suf):
            return True
    return False

def build_tree(dir_path: Path) -> dict:
    """Ordner -> Objekt; Dateien -> null; Symlinks minimal markieren."""
    dirs, files, symlinks = [], [], []
    try:
        with os.scandir(dir_path) as it:
            for e in it:
                n = e.name
                if n in (".", ".."):
                    continue
                try:
                    is_dir = e.is_dir(follow_symlinks=False)
                    is_file = e.is_file(follow_symlinks=False)
                    is_link = e.is_symlink()
                except OSError:
                    continue
                if should_ignore(n, is_dir):
                    continue
                if is_link:
                    symlinks.append(n)
                elif is_dir:
                    dirs.append(n)
                elif is_file:
                    files.append(n)
    except PermissionError:
        return {"@error": "permission-denied"}

    dirs.sort(key=str.casefold)
    files.sort(key=str.casefold)
    symlinks.sort(key=str.casefold)

    out = {}
    for d in dirs:
        out[d] = build_tree(dir_path / d)
    for f in files:
        out[f] = None
    for s in symlinks:
        # Symlink als kleines Objekt kennzeichnen (folgen wir nicht, um Zyklen zu vermeiden)
        try:
            target = os.readlink((dir_path / s).as_posix())
        except OSError:
            target = None
        out[s] = {"@symlink": target}
    return out

def main():
    ap = argparse.ArgumentParser(
        description="Erzeugt eine minimalistische JSON-Struktur: Ordner=Objekt, Datei=null."
    )
    ap.add_argument("-o", "--output", default="structure-of-0nefinity.json",
                    help="Ausgabedatei (Default: structure-of-0nefinity.json)")
    ap.add_argument("--root-label", default="0nefinity.love",
                    help='Name des obersten Ordner-Schlüssels (Default: "0nefinity.love")')
    ap.add_argument("--type-label", default="project-structure-of-0nefinity.love",
                    help='Key für den Projektstruktur-Block (Default: wie angegeben)')
    args = ap.parse_args()

    # Root = aktuelles Arbeitsverzeichnis (CWD)
    root = Path(".").resolve()

    tree = build_tree(root)
    data = [
        {"deepest-structure-of-pure-0nefinity": ""},
        {args.type_label: {args.root_label: tree}},
    ]

    out_path = Path(args.output)
    if not out_path.is_absolute():
        out_path = root / out_path

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"✓ geschrieben:", out_path.resolve())

if __name__ == "__main__":
    main()
