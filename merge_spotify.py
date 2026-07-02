#!/usr/bin/env python3
"""Merge Spotify album IDs (exported from the site's ?spotify=1 mode) into data.js.

Usage:
    python3 merge_spotify.py spotify.json
    pbpaste | python3 merge_spotify.py -

The input is a JSON object of {album_id: spotify_album_id_or_url}. Values may be
a bare 22-character album ID, an open.spotify.com album URL, or a spotify:album:
URI. An empty string removes the spotifyId field from that album.
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


def extract_spotify_album_id(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    m = re.search(r"album[/:]([A-Za-z0-9]{22})", value)
    if m:
        return m.group(1)
    return value if re.fullmatch(r"[A-Za-z0-9]{22}", value) else None


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    src = sys.stdin.read() if sys.argv[1] == "-" else Path(sys.argv[1]).read_text(encoding="utf-8")
    overrides = json.loads(src)
    if not isinstance(overrides, dict):
        raise ValueError("Input must be a JSON object of {album_id: spotify_album_id_or_url}")

    data = load_data()
    albums_by_id = {a["id"]: a for a in data["albums"]}
    updated = removed = skipped = 0
    for album_id, value in overrides.items():
        album = albums_by_id.get(str(album_id))
        if album is None:
            print(f"WARNING: unknown album id {album_id!r}, skipped")
            skipped += 1
            continue
        if value in ("", None):
            if album.pop("spotifyId", None) is not None:
                removed += 1
            continue
        spotify_id = extract_spotify_album_id(value)
        if spotify_id is None:
            print(f"WARNING: invalid Spotify id/URL for album {album_id!r}: {value!r}, skipped")
            skipped += 1
            continue
        album["spotifyId"] = spotify_id
        updated += 1

    save_data(data)
    print(f"Done: {updated} set, {removed} removed, {skipped} skipped")


if __name__ == "__main__":
    main()
