#!/usr/bin/env python3
"""Merge note article URLs (exported from the site's ?note=1 mode) into data.js.

Usage:
    python3 merge_note.py note.json
    pbpaste | python3 merge_note.py -

The input is a JSON object of {album_id: note_article_url}. URLs must start
with https://note.com/. An empty string removes the note_url from that album.
Static album pages are rebuilt afterwards so the note link appears there too.
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
        raise ValueError("Input must be a JSON object of {album_id: note_url}")

    data = load_data()
    albums_by_id = {a["id"]: a for a in data["albums"]}
    updated = removed = skipped = 0
    for album_id, url in overrides.items():
        album = albums_by_id.get(str(album_id))
        if album is None:
            print(f"WARNING: unknown album id {album_id!r}, skipped")
            skipped += 1
            continue
        if url in ("", None):
            if album.pop("note_url", None):
                removed += 1
            continue
        if not (isinstance(url, str) and re.fullmatch(r"https://note\.com/\S+", url)):
            print(f"WARNING: invalid note URL for album {album_id!r}: {url!r}, skipped")
            skipped += 1
            continue
        album["note_url"] = url
        updated += 1

    save_data(data)
    print(f"Done: {updated} set, {removed} removed, {skipped} skipped")

    # Rebuild static pages so the note link shows up there as well
    import build_static
    build_static.build()
    print("Static pages rebuilt.")


if __name__ == "__main__":
    main()
