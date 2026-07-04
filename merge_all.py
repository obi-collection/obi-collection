#!/usr/bin/env python3
"""Merge a combined edit-mode export (from the site's ?edit=1 mode) into data.js.

Usage:
    python3 merge_all.py edit.json
    pbpaste | python3 merge_all.py -

The input is a JSON object with up to three sections:
    {"focus": {album_id: 0-100}, "spotify": {album_id: id_or_url}, "note": {album_id: url}}

Rules per section match the individual merge scripts:
    focus   — 50 (center) removes the field; values are rounded and clamped to 0-100
    spotify — accepts bare 22-char IDs, open.spotify.com URLs, spotify: URIs,
              a list of those (multi-disc sets), or "none" (checked — not on
              Spotify); empty string removes spotifyId
    note    — must start with https://note.com/ ; empty string removes note_url

Static album pages are rebuilt afterwards when note URLs changed.
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


def merge_focus(album, value, stats):
    focus = round(float(value))
    if not 0 <= focus <= 100:
        print(f"WARNING: focus {focus} out of range for id {album['id']!r}, skipped")
        stats["skipped"] += 1
        return
    if focus == 50:
        if album.pop("focus", None) is not None:
            stats["removed"] += 1
    else:
        album["focus"] = focus
        stats["set"] += 1


def merge_spotify(album, value, stats):
    if value in ("", None):
        if album.pop("spotifyId", None) is not None:
            stats["removed"] += 1
        return
    if value == "none":
        album["spotifyId"] = "none"
        stats["set"] += 1
        return
    values = value if isinstance(value, list) else [value]
    ids = []
    for item in values:
        spotify_id = extract_spotify_album_id(item)
        if spotify_id is None:
            print(f"WARNING: invalid Spotify id/URL for id {album['id']!r}: {item!r}, entry skipped")
            stats["skipped"] += 1
            return
        if spotify_id not in ids:
            ids.append(spotify_id)
    if not ids:
        stats["skipped"] += 1
        return
    album["spotifyId"] = ids[0] if len(ids) == 1 else ids
    stats["set"] += 1


def merge_note(album, value, stats):
    if value in ("", None):
        if album.pop("note_url", None):
            stats["removed"] += 1
        return
    if not (isinstance(value, str) and re.fullmatch(r"https://note\.com/\S+", value)):
        print(f"WARNING: invalid note URL for id {album['id']!r}: {value!r}, skipped")
        stats["skipped"] += 1
        return
    album["note_url"] = value
    stats["set"] += 1


SECTIONS = {"focus": merge_focus, "spotify": merge_spotify, "note": merge_note}


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    src = sys.stdin.read() if sys.argv[1] == "-" else Path(sys.argv[1]).read_text(encoding="utf-8")
    payload = json.loads(src)
    if not isinstance(payload, dict):
        raise ValueError("Input must be a JSON object with focus/spotify/note sections")
    unknown = set(payload) - set(SECTIONS)
    if unknown:
        raise ValueError(f"Unknown sections {sorted(unknown)}; expected focus/spotify/note "
                         "(individual exports go through merge_focus.py / merge_spotify.py / merge_note.py)")

    data = load_data()
    albums_by_id = {a["id"]: a for a in data["albums"]}
    note_changed = False
    for section, merger in SECTIONS.items():
        overrides = payload.get(section) or {}
        if not isinstance(overrides, dict):
            print(f"WARNING: section {section!r} is not an object, skipped")
            continue
        stats = {"set": 0, "removed": 0, "skipped": 0}
        for album_id, value in overrides.items():
            album = albums_by_id.get(str(album_id))
            if album is None:
                print(f"WARNING: unknown album id {album_id!r} in {section}, skipped")
                stats["skipped"] += 1
                continue
            merger(album, value, stats)
        if section == "note" and (stats["set"] or stats["removed"]):
            note_changed = True
        print(f"{section}: {stats['set']} set, {stats['removed']} removed, {stats['skipped']} skipped")

    save_data(data)
    if note_changed:
        import build_static
        build_static.build()
        print("Static pages rebuilt.")


if __name__ == "__main__":
    main()
