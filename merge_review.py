#!/usr/bin/env python3
"""Merge on-site reviews (exported from the site's ?review=1 mode) into reviews/.

Usage:
    python3 merge_review.py review.json
    pbpaste | python3 merge_review.py -

The input is a JSON object of {album_id: markdown_text}. An empty string
deletes that album's review. Hook/lyrics quote lines (フック："..." and the
following translation line) are stripped automatically — quoting chorus lyrics
on a public site is a copyright risk.

After merging, reviews_index.js (the list of album ids that have a published
review, loaded by the SPA) is regenerated and the static album pages are
rebuilt so the review text is served to crawlers too.
"""
import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
REVIEWS_DIR = BASE_DIR / "reviews"


def load_albums():
    content = (BASE_DIR / "data.js").read_text(encoding="utf-8").strip()
    m = re.fullmatch(r"const\s+COLLECTION_DATA\s*=\s*(\{.*\});", content, re.DOTALL)
    if not m:
        raise RuntimeError("Could not parse COLLECTION_DATA in data.js")
    return json.loads(m.group(1))["albums"]


def strip_hooks(text: str) -> tuple[str, int]:
    """Remove フック："…" lines and their translation line right after."""
    lines = text.replace("\r\n", "\n").split("\n")
    out = []
    stripped = 0
    skip_translation = False
    for line in lines:
        t = line.strip()
        if re.match(r"^フック\s*[:：]", t):
            stripped += 1
            skip_translation = True
            continue
        if skip_translation:
            skip_translation = False
            if re.fullmatch(r"（.*）", t):
                continue
        out.append(line)
    return "\n".join(out), stripped


def regenerate_index(albums):
    ids = [a["id"] for a in albums if (REVIEWS_DIR / f"{slugify(a['id'])}.md").exists()]
    (BASE_DIR / "reviews_index.js").write_text(
        "const REVIEWS_INDEX = " + json.dumps(ids, ensure_ascii=False, separators=(",", ":")) + ";",
        encoding="utf-8",
    )
    return len(ids)


def slugify(album_id: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", album_id.lower())).strip("-")


def apply_reviews(overrides: dict, albums: list) -> None:
    REVIEWS_DIR.mkdir(exist_ok=True)
    albums_by_id = {a["id"]: a for a in albums}
    updated = removed = skipped = hooks = 0
    for album_id, text in overrides.items():
        if album_id not in albums_by_id:
            print(f"WARNING: unknown album id {album_id!r}, skipped")
            skipped += 1
            continue
        path = REVIEWS_DIR / f"{slugify(album_id)}.md"
        if not isinstance(text, str) or not text.strip():
            if path.exists():
                path.unlink()
                removed += 1
            continue
        cleaned, n = strip_hooks(text)
        hooks += n
        path.write_text(cleaned.strip() + "\n", encoding="utf-8")
        updated += 1
    total = regenerate_index(albums)
    msg = f"reviews: {updated} written, {removed} deleted, {skipped} skipped ({total} published total)"
    if hooks:
        msg += f" — stripped {hooks} hook/lyrics line(s) for copyright"
    print(msg)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    src = sys.stdin.read() if sys.argv[1] == "-" else Path(sys.argv[1]).read_text(encoding="utf-8")
    overrides = json.loads(src)
    if not isinstance(overrides, dict):
        raise ValueError("Input must be a JSON object of {album_id: markdown_text}")

    apply_reviews(overrides, load_albums())

    import build_static
    build_static.build()
    print("Static pages rebuilt.")


if __name__ == "__main__":
    main()
