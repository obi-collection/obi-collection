#!/usr/bin/env python3
"""
post_to_x.py — OBI Collection X (Twitter) auto-poster

Picks one unposted album from COLLECTION_DATA at random,
generates a one-line Japanese comment via Claude API,
and posts to X using OAuth 1.0a.

Required environment variables:
  X_API_KEY, X_API_SECRET
  X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
  ANTHROPIC_API_KEY

Usage:
  python post_to_x.py          # post one random unposted entry
  python post_to_x.py --dry-run  # preview without posting
"""

import os
import sys
import json
import hmac
import hashlib
import time
import random
import subprocess
import re
import urllib.request
import urllib.parse
import urllib.error
import base64
from datetime import datetime
from pathlib import Path

BASE_DIR = Path("/Volumes/Extreme SSD/obi-collection")
DATA_JS  = BASE_DIR / "data.js"
POSTED_JSON = BASE_DIR / "posted.json"


def log(msg: str):
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


# ── data.js loader ────────────────────────────────────────────────────────────

def load_albums() -> list[dict]:
    content = DATA_JS.read_text(encoding="utf-8")
    match = re.search(r"const COLLECTION_DATA\s*=\s*({.*?});", content, re.DOTALL)
    if not match:
        raise ValueError("COLLECTION_DATA not found in data.js")
    data = json.loads(match.group(1))
    return data["albums"]


# ── posted.json ───────────────────────────────────────────────────────────────

def load_posted() -> set[str]:
    if not POSTED_JSON.exists():
        return set()
    return set(json.loads(POSTED_JSON.read_text(encoding="utf-8")))


def save_posted(posted: set[str]):
    POSTED_JSON.write_text(
        json.dumps(sorted(posted), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


# ── candidate selection ───────────────────────────────────────────────────────

def pick_unposted(albums: list[dict], posted: set[str]):
    """Return (album, version) for a random unposted catalog number."""
    candidates = []
    for album in albums:
        for version in album.get("versions", []):
            catalog = version.get("catalog", "")
            if catalog and catalog not in posted:
                candidates.append((album, version))
    if not candidates:
        return None
    return random.choice(candidates)


# ── OAuth 1.0a ────────────────────────────────────────────────────────────────

def _percent_encode(s: str) -> str:
    return urllib.parse.quote(str(s), safe="")


def _oauth_signature(method: str, url: str, params: dict, secrets: dict) -> str:
    sorted_params = "&".join(
        f"{_percent_encode(k)}={_percent_encode(v)}"
        for k, v in sorted(params.items())
    )
    base = "&".join([
        _percent_encode(method.upper()),
        _percent_encode(url),
        _percent_encode(sorted_params),
    ])
    signing_key = (
        _percent_encode(secrets["api_secret"]) + "&" +
        _percent_encode(secrets["access_token_secret"])
    )
    sig = hmac.new(signing_key.encode("utf-8"), base.encode("utf-8"), hashlib.sha1)
    return base64.b64encode(sig.digest()).decode("utf-8")


def _oauth_header(method: str, url: str, extra_params: dict = None) -> str:
    """Build OAuth 1.0a Authorization header."""
    api_key      = os.environ["X_API_KEY"]
    api_secret   = os.environ["X_API_SECRET"]
    token        = os.environ["X_ACCESS_TOKEN"]
    token_secret = os.environ["X_ACCESS_TOKEN_SECRET"]

    timestamp = str(int(time.time()))
    nonce = base64.b64encode(os.urandom(32)).decode("utf-8").rstrip("=\n")

    oauth_params = {
        "oauth_consumer_key":     api_key,
        "oauth_nonce":            nonce,
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp":        timestamp,
        "oauth_token":            token,
        "oauth_version":          "1.0",
    }

    secrets = {
        "api_secret":          api_secret,
        "access_token_secret": token_secret,
    }

    sig_params = dict(oauth_params)
    if extra_params:
        sig_params.update(extra_params)

    oauth_params["oauth_signature"] = _oauth_signature(method, url, sig_params, secrets)

    return "OAuth " + ", ".join(
        f'{_percent_encode(k)}="{_percent_encode(v)}"'
        for k, v in sorted(oauth_params.items())
    )


def upload_media(image_url: str) -> str:
    """Download image from URL and upload to X. Returns media_id string."""
    log(f"画像ダウンロード中: {image_url}")
    with urllib.request.urlopen(image_url) as resp:
        image_data = resp.read()
        content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()

    upload_url = "https://upload.twitter.com/1.1/media/upload.json"
    encoded = base64.b64encode(image_data).decode("utf-8")

    body = urllib.parse.urlencode({"media_data": encoded}).encode("utf-8")
    auth = _oauth_header("POST", upload_url, {"media_data": encoded})

    req = urllib.request.Request(
        upload_url,
        data=body,
        headers={
            "Authorization": auth,
            "Content-Type":  "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode("utf-8"))

    media_id = result["media_id_string"]
    log(f"メディアアップロード完了: media_id={media_id}")
    return media_id


def post_tweet(text: str, media_id: str = None) -> dict:
    url = "https://api.twitter.com/2/tweets"
    auth = _oauth_header("POST", url)

    payload = {"text": text}
    if media_id:
        payload["media"] = {"media_ids": [media_id]}

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": auth,
            "Content-Type":  "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ── main ──────────────────────────────────────────────────────────────────────

def build_tweet(artist: str, album: str, catalog: str) -> str:
    return f"OBI Strip Collection 🇯🇵\n\nArtist: {artist}\nAlbum: {album}\nCat#: {catalog}\n\nDrop your favorite track 👇"


def main():
    dry_run = "--dry-run" in sys.argv
    copy_mode = "--copy" in sys.argv

    # Load env from .env if not already set
    env_path = BASE_DIR / ".env"
    try:
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    os.environ.setdefault(key.strip(), val.strip())
    except PermissionError:
        pass  # 環境変数が事前にエクスポートされている前提で続行

    albums  = load_albums()
    posted  = load_posted()

    result = pick_unposted(albums, posted)
    if result is None:
        log("未投稿のエントリーがありません。全件投稿済みです。")
        sys.exit(0)

    album, version = result
    artist    = album.get("artist", "")
    title     = album.get("album", "")
    catalog   = version.get("catalog", "")
    image_url = version.get("image", "")

    log(f"選択: {artist} / {title} [{catalog}]")
    log(f"画像URL: {image_url or 'なし'}")

    tweet_text = build_tweet(artist, title, catalog)
    log("--- ツイート内容 ---")
    print(tweet_text)
    log(f"--- 文字数: {len(tweet_text)} ---")

    if copy_mode:
        subprocess.run(["pbcopy"], input=tweet_text.encode("utf-8"), check=True)
        log("クリップボードにコピーしました。")
        return

    if dry_run:
        if image_url:
            try:
                with urllib.request.urlopen(image_url) as resp:
                    size = len(resp.read())
                log(f"[DRY RUN] 画像取得OK ({size:,} bytes)")
            except Exception as e:
                log(f"[DRY RUN] 画像取得NG: {e}")
        else:
            log("[DRY RUN] 画像なし")
        log("[DRY RUN] アップロード・投稿はスキップしました。")
        return

    media_id = None
    if image_url:
        media_id = upload_media(image_url)

    log("投稿中...")
    response = post_tweet(tweet_text, media_id=media_id)
    tweet_id = response.get("data", {}).get("id", "unknown")
    log(f"投稿完了: tweet_id={tweet_id}")

    posted.add(catalog)
    save_posted(posted)
    log(f"posted.json を更新しました（累計 {len(posted)} 件）")


if __name__ == "__main__":
    main()
