#!/usr/bin/env python3
"""Fetch Spotify album candidates for the site's ?spotify=1 registration mode.

Searches the Spotify API for every album in data.js that has no spotifyId yet
and writes the top matches to spotify_candidates.js, which the site loads to
show clickable candidates in the registration box. Selection is always manual.

Usage:
    python3 fetch_spotify_candidates.py          # albums without spotifyId
    python3 fetch_spotify_candidates.py --all    # every album

Required environment variables (or entries in .env next to this script):
    SPOTIFY_CLIENT_ID
    SPOTIFY_CLIENT_SECRET
"""
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CANDIDATES_JS = BASE_DIR / "spotify_candidates.js"
LIMIT = 5


def load_env():
    """Return (client_id, client_secret) from the environment or .env."""
    env = dict(os.environ)
    env_file = BASE_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    client_id = env.get("SPOTIFY_CLIENT_ID")
    client_secret = env.get("SPOTIFY_CLIENT_SECRET")
    if not client_id or not client_secret:
        sys.exit("ERROR: SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set (env or .env)")
    return client_id, client_secret


def load_albums():
    content = (BASE_DIR / "data.js").read_text(encoding="utf-8")
    match = re.fullmatch(r"const\s+COLLECTION_DATA\s*=\s*(\{.*\});", content, re.DOTALL)
    if not match:
        raise RuntimeError("Could not parse COLLECTION_DATA in data.js")
    return json.loads(match.group(1))["albums"]


def get_token(client_id, client_secret):
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    req = urllib.request.Request(
        "https://accounts.spotify.com/api/token",
        data=b"grant_type=client_credentials",
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))["access_token"]


def search_albums(token, query):
    params = urllib.parse.urlencode({"q": query, "type": "album", "limit": LIMIT, "market": "JP"})
    req = urllib.request.Request(
        f"https://api.spotify.com/v1/search?{params}",
        headers={"Authorization": f"Bearer {token}"},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req) as resp:
                items = json.loads(resp.read().decode("utf-8"))["albums"]["items"]
                return [
                    {
                        "id": a["id"],
                        "name": a["name"],
                        "artist": ", ".join(art["name"] for art in a["artists"]),
                        "year": (a.get("release_date") or "")[:4],
                        "tracks": a.get("total_tracks"),
                        "image": next((img["url"] for img in a.get("images", []) if img["height"] and img["height"] <= 300), (a.get("images") or [{}])[-1].get("url", "")),
                    }
                    for a in items
                ]
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = int(e.headers.get("Retry-After", "2")) + 1
                print(f"  rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            raise
    return []


def main():
    fetch_all = "--all" in sys.argv[1:]
    client_id, client_secret = load_env()
    token = get_token(client_id, client_secret)
    albums = load_albums()
    targets = [a for a in albums if fetch_all or not a.get("spotifyId")]
    print(f"Fetching candidates for {len(targets)} of {len(albums)} albums...")

    candidates = {}
    for i, album in enumerate(targets, 1):
        artist = album.get("artist") or ""
        title = album.get("album") or ""
        query = title if artist in ("V.A.", "O.S.T.") else f"{artist} {title}"
        try:
            results = search_albums(token, query)
        except Exception as e:
            print(f"  [{i}/{len(targets)}] {artist} — {title}: FAILED ({e})")
            continue
        if results:
            candidates[album["id"]] = results
        if i % 25 == 0 or i == len(targets):
            print(f"  [{i}/{len(targets)}] done (matches so far: {len(candidates)})")
        time.sleep(0.15)

    CANDIDATES_JS.write_text(
        "const SPOTIFY_CANDIDATES = " + json.dumps(candidates, ensure_ascii=False, separators=(",", ":")) + ";",
        encoding="utf-8",
    )
    print(f"Wrote {CANDIDATES_JS.name}: candidates for {len(candidates)} albums")


if __name__ == "__main__":
    main()
