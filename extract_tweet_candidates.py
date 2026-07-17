#!/usr/bin/env python3
"""Extract scheduled-post candidates from a Twitter/X archive.

Scans the archive's tweets for posts that contain a YouTube link and writes
them to schedule_candidates.js, which schedule.html shows as a pick list
(tap a candidate to open the editor pre-filled; saving it makes a normal
schedule draft).

Usage:
    python3 extract_tweet_candidates.py "/path/to/twitter-archive-folder" [more archives...]
    python3 extract_tweet_candidates.py "/path/to/tweets.js"

Multiple archives are merged; list the newest first — when the same video
appears in several archives, the first occurrence wins, so the newest
archive's engagement counts are kept (and older archives only contribute
tweets that were since deleted).

Excluded: retweets, replies to other accounts, tweets without a YouTube URL.
The original post date becomes the suggested month/day (anniversary reposts).
"""
import html
import json
import re
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
OUT_FILE = BASE_DIR / "schedule_candidates.js"

YOUTUBE_RE = re.compile(
    r"(?:youtu\.be/|youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/))"
    r"([A-Za-z0-9_-]{11})"
)


def load_tweets(path: Path) -> list[dict]:
    if path.is_dir():
        path = path / "data" / "tweets.js"
    content = path.read_text(encoding="utf-8")
    # window.YTD.tweets.part0 = [...]
    json_part = content[content.index("["):]
    return [item["tweet"] for item in json.loads(json_part)]


def clean_text(full_text: str, urls: list[dict], media: list[dict]) -> str:
    """Remove t.co links (URL entities and media links) from the tweet body."""
    text = full_text
    for u in urls + media:
        text = text.replace(u.get("url", ""), "")
    text = re.sub(r"https://t\.co/\S+", "", text)
    return html.unescape(re.sub(r"[ \t]+\n", "\n", text)).strip()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    tweets = []
    for arg in sys.argv[1:]:
        path = Path(arg)
        batch = load_tweets(path)
        # deleted-tweets.js 由来は候補に「削除済み」フラグを付ける
        from_deleted = "deleted" in (path.name if path.is_file() else "")
        print(f"{arg}: {len(batch)} tweets" + (" (deleted)" if from_deleted else ""))
        for t in batch:
            t["_deleted"] = from_deleted
        tweets.extend(batch)

    candidates = []
    seen_videos = set()
    for t in tweets:
        full_text = t.get("full_text", "")
        if full_text.startswith("RT @"):
            continue
        if t.get("in_reply_to_status_id_str"):
            continue
        urls = t.get("entities", {}).get("urls", [])
        media = t.get("entities", {}).get("media", [])
        youtube = next(
            (u["expanded_url"] for u in urls if YOUTUBE_RE.search(u.get("expanded_url", ""))),
            None,
        )
        if not youtube:
            continue
        video_id = YOUTUBE_RE.search(youtube).group(1)
        if video_id in seen_videos:
            continue
        seen_videos.add(video_id)
        created = datetime.strptime(t["created_at"], "%a %b %d %H:%M:%S %z %Y")
        cand = {
            "id": t["id_str"],
            "month": created.month,
            "day": created.day,
            "year": created.year,
            "text": clean_text(full_text, urls, media),
            "youtube": f"https://youtu.be/{video_id}",
            "favs": int(t.get("favorite_count", 0)),
            "rts": int(t.get("retweet_count", 0)),
        }
        if t.get("_deleted"):
            cand["deleted"] = True
        candidates.append(cand)

    candidates.sort(key=lambda c: (-(c["favs"] + c["rts"]), c["id"]))
    OUT_FILE.write_text(
        "const SCHEDULE_CANDIDATES = " + json.dumps(candidates, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(candidates)} candidates to {OUT_FILE.name} "
          f"(from {len(tweets)} tweets)")


if __name__ == "__main__":
    main()
