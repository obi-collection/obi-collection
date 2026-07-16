#!/usr/bin/env python3
"""Merge scheduled X posts (exported from schedule.html) into schedule.js.

Usage:
    python3 merge_schedule.py schedule.json
    pbpaste | python3 merge_schedule.py -

The input is a JSON object of {entry_id: entry_or_null}.
  - entry: {"month": 1-12, "day": 1-31, "title": str, "text": str,
            "youtube": str, "image": str (optional), "enabled": bool,
            "debut": "none" | "YYYY-MM-DD" (optional; absent = next weekend)}
  - null (or "") removes the entry from schedule.js
Entries are recurring: they fire every year on month/day (2/29 fires only
in leap years). After merging, posts are sorted by (month, day, id).
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SCHEDULE_JS = BASE_DIR / "schedule.js"

DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

URL_RE = re.compile(r"https?://\S+")


def weighted_length(text: str) -> int:
    """X's weighted tweet length: URL=23, CJK/emoji=2, latin=1 (limit 280)."""
    length = 23 * len(URL_RE.findall(text))
    for ch in URL_RE.sub("", text):
        cp = ord(ch)
        light = (cp <= 0x10FF or 0x2000 <= cp <= 0x200D
                 or 0x2010 <= cp <= 0x201F or 0x2032 <= cp <= 0x2037)
        length += 1 if light else 2
    return length


def load_schedule():
    content = SCHEDULE_JS.read_text(encoding="utf-8")
    match = re.search(r"const\s+SCHEDULE_DATA\s*=\s*(\{.*\});", content, re.DOTALL)
    if not match:
        raise RuntimeError("Could not parse SCHEDULE_DATA in schedule.js")
    return json.loads(match.group(1))


def save_schedule(data):
    data["posts"].sort(key=lambda p: (p["month"], p["day"], p["id"]))
    content = "const SCHEDULE_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    SCHEDULE_JS.write_text(content, encoding="utf-8")


def normalize(entry_id, value):
    """Validate an exported entry and return the normalized dict, or None."""
    if not isinstance(value, dict):
        print(f"WARNING: entry {entry_id!r} is not an object, skipped")
        return None
    try:
        month = int(value["month"])
        day = int(value["day"])
    except (KeyError, TypeError, ValueError):
        print(f"WARNING: entry {entry_id!r} has invalid month/day, skipped")
        return None
    if not (1 <= month <= 12 and 1 <= day <= DAYS_IN_MONTH[month - 1]):
        print(f"WARNING: entry {entry_id!r} has invalid date {month}/{day}, skipped")
        return None
    text = str(value.get("text", "")).strip()
    youtube = str(value.get("youtube", "")).strip()
    if not text or not youtube.startswith("http"):
        print(f"WARNING: entry {entry_id!r} is missing text or a valid YouTube URL, skipped")
        return None
    tweet_len = weighted_length(f"{text}\n\n{youtube}")
    if tweet_len > 280:
        print(f"WARNING: entry {entry_id!r} exceeds the tweet limit "
              f"({tweet_len}/280) — merged anyway, but X will reject it as-is")
    entry = {
        "id": str(entry_id),
        "month": month,
        "day": day,
        "title": str(value.get("title", "")).strip(),
        "text": text,
        "youtube": youtube,
        "enabled": bool(value.get("enabled", True)),
    }
    image = str(value.get("image", "")).strip()
    if image:
        entry["image"] = image
    debut = str(value.get("debut", "")).strip()
    if debut == "none":
        entry["debut"] = "none"
    elif debut:
        try:
            date.fromisoformat(debut)
        except ValueError:
            print(f"WARNING: entry {entry_id!r} has an invalid debut date {debut!r}, "
                  f"falling back to the next weekend")
        else:
            entry["debut"] = debut
    return entry


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    src = sys.stdin.read() if sys.argv[1] == "-" else Path(sys.argv[1]).read_text(encoding="utf-8")
    overrides = json.loads(src)
    if not isinstance(overrides, dict):
        raise ValueError("Input must be a JSON object of {entry_id: entry_or_null}")

    data = load_schedule()
    posts_by_id = {p["id"]: p for p in data["posts"]}
    updated = added = removed = skipped = 0
    for entry_id, value in overrides.items():
        entry_id = str(entry_id)
        if value in (None, ""):
            if posts_by_id.pop(entry_id, None) is not None:
                removed += 1
            continue
        entry = normalize(entry_id, value)
        if entry is None:
            skipped += 1
            continue
        if entry_id in posts_by_id:
            updated += 1
        else:
            added += 1
        posts_by_id[entry_id] = entry

    data["posts"] = list(posts_by_id.values())
    save_schedule(data)
    print(f"Done: {added} added, {updated} updated, {removed} removed, {skipped} skipped "
          f"(total {len(data['posts'])})")


if __name__ == "__main__":
    main()
