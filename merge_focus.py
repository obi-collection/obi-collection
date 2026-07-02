#!/usr/bin/env python3
"""Merge focus-tune JSON (exported from the site's ?tune=1 mode) into data.js.

Usage:
    python3 merge_focus.py tune.json
    pbpaste | python3 merge_focus.py -

The input is a JSON object of {album_id: focus_percent}. A focus of 50 is the
default center crop, so those entries are removed from data.js rather than stored.
"""
import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def load_data():
    content = (BASE_DIR / "data.js").read_text(encoding="utf-8")
    match = re.fullmatch(r"const\s+COLLECTION_DATA\s*=\s*(\{.*\});", content, re.DOTALL)
    if not match:
        raise RuntimeError("Could not parse COLLECTION_DATA in data.js")
    return json.loads(match.group(1))


def save_data(data):
    content = "const COLLECTION_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";"
    (BASE_DIR / "data.js").write_text(content, encoding="utf-8")


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    src = sys.stdin.read() if sys.argv[1] == "-" else Path(sys.argv[1]).read_text(encoding="utf-8")
    overrides = json.loads(src)
    if not isinstance(overrides, dict):
        raise ValueError("Input must be a JSON object of {album_id: focus_percent}")

    data = load_data()
    albums_by_id = {a["id"]: a for a in data["albums"]}
    updated = removed = skipped = 0
    for album_id, focus in overrides.items():
        album = albums_by_id.get(str(album_id))
        if album is None:
            print(f"WARNING: unknown album id {album_id!r}, skipped")
            skipped += 1
            continue
        focus = round(float(focus))
        if not 0 <= focus <= 100:
            print(f"WARNING: focus {focus} out of range for id {album_id!r}, skipped")
            skipped += 1
            continue
        if focus == 50:
            if album.pop("focus", None) is not None:
                removed += 1
        else:
            album["focus"] = focus
            updated += 1

    save_data(data)
    print(f"Done: {updated} set, {removed} reset to default, {skipped} skipped")


if __name__ == "__main__":
    main()
