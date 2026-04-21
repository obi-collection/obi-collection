#!/usr/bin/env python3
"""
process_inbox.py — OBI collection inbox processor

Combines obi.jpg (left) + jacket.jpg (right), uploads to Cloudinary,
extracts album info via Claude API, updates index.html, and pushes to GitHub.

Required environment variables:
  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
  ANTHROPIC_API_KEY
"""

import os
import sys
import json
import base64
import hashlib
import time
import urllib.request
import urllib.error
import subprocess
import re
from datetime import datetime
from pathlib import Path

BASE_DIR = Path("/Volumes/Extreme SSD/obi-collection")
INBOX = BASE_DIR / "inbox"


def log(msg):
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


# ── Image combination ────────────────────────────────────────────────────────

def combine_images(obi_path: Path, jacket_path: Path, output_path: Path):
    """Place obi on the left, jacket on the right; match heights."""
    import shutil

    if shutil.which("convert"):
        # ImageMagick: resize both to 800px tall, then append horizontally
        result = subprocess.run(
            [
                "convert",
                str(obi_path), "-resize", "x800",
                str(jacket_path), "-resize", "x800",
                "+append",
                str(output_path),
            ],
            capture_output=True,
        )
        if result.returncode == 0:
            log("Combined images with ImageMagick")
            return
        log(f"ImageMagick error: {result.stderr.decode()}")

    # Fallback: Pillow
    try:
        from PIL import Image

        obi = Image.open(obi_path).convert("RGB")
        jacket = Image.open(jacket_path).convert("RGB")

        h = max(obi.height, jacket.height)
        obi = obi.resize((int(obi.width * h / obi.height), h), Image.LANCZOS)
        jacket = jacket.resize((int(jacket.width * h / jacket.height), h), Image.LANCZOS)

        combined = Image.new("RGB", (obi.width + jacket.width, h))
        combined.paste(obi, (0, 0))
        combined.paste(jacket, (obi.width, 0))
        combined.save(output_path, "JPEG", quality=95)
        log("Combined images with Pillow")
        return
    except ImportError:
        pass

    raise RuntimeError(
        "Image combining failed: install ImageMagick (brew install imagemagick) "
        "or Pillow (pip install Pillow)"
    )


# ── Cloudinary upload ────────────────────────────────────────────────────────

def upload_to_cloudinary(image_path: Path, public_id: str) -> str:
    cloud_name = os.environ["CLOUDINARY_CLOUD_NAME"]
    api_key = os.environ["CLOUDINARY_API_KEY"]
    api_secret = os.environ["CLOUDINARY_API_SECRET"]

    timestamp = str(int(time.time()))
    params = {"public_id": public_id, "timestamp": timestamp}
    params_str = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    signature = hashlib.sha1((params_str + api_secret).encode()).hexdigest()

    boundary = "----OBIBoundary" + timestamp
    parts = []

    def field(name, value):
        parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n"
        )

    field("api_key", api_key)
    field("timestamp", timestamp)
    field("signature", signature)
    field("public_id", public_id)

    file_data = image_path.read_bytes()
    file_part = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{image_path.name}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + file_data + b"\r\n"

    body = "".join(parts).encode() + file_part + f"--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        f"https://api.cloudinary.com/v1_1/{cloud_name}/image/upload",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())["secure_url"]


# ── Claude API — album info extraction ──────────────────────────────────────

def extract_album_info(obi_path: Path) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise EnvironmentError("ANTHROPIC_API_KEY is not set")

    suffix = obi_path.suffix.lower()
    media_type = "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/png"
    image_b64 = base64.standard_b64encode(obi_path.read_bytes()).decode()

    prompt = (
        "この日本盤CDのOBI（帯）画像からアルバム情報を読み取ってください。\n"
        "必ず以下のJSONのみを返してください（前後の説明不要）:\n\n"
        '{"artist":"アーティスト名（英語）","album":"アルバムタイトル（英語）",'
        '"year":オリジナル発売年の数字,"yearJP":日本盤発売年の数字,"catalog":"カタログ番号"}\n\n'
        "情報が読み取れない項目はnullにしてください。"
    )

    payload = json.dumps(
        {
            "model": "claude-opus-4-6",
            "max_tokens": 512,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        }
    ).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())

    text = result["content"][0]["text"].strip()

    # Strip markdown code fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    return json.loads(text.strip())


# ── Claude API — tracklist extraction ───────────────────────────────────────

def extract_tracklist(t_path: Path) -> list:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise EnvironmentError("ANTHROPIC_API_KEY is not set")

    suffix = t_path.suffix.lower()
    media_type = "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/png"
    image_b64 = base64.standard_b64encode(t_path.read_bytes()).decode()

    prompt = (
        "このCDのトラックリスト画像から曲名と曲番号を抽出してください。\n"
        "時間、作曲者などの情報は不要です。\n"
        "曲名は必ず英語の正式タイトルで出力してください。"
        "画像に日本語タイトルが記載されていても、英語の正式タイトルを使用してください。\n"
        "feat.やft.などの客演情報が曲名に含まれている場合は、それも含めて抽出してください。\n"
        '例：["4. Czar ft. M.O.P.", "19. Look Over Your Shoulder ft. Kendrick Lamar"]\n\n'
        "必ず以下のJSON配列のみを返してください（前後の説明不要）:\n\n"
        '["1. Track Name", "2. Track Name", ...]\n\n'
        "ローマ数字の曲番号は算用数字に変換してください。"
    )

    payload = json.dumps(
        {
            "model": "claude-opus-4-6",
            "max_tokens": 1024,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        }
    ).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())

    text = result["content"][0]["text"].strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    return json.loads(text.strip())


# ── index.html update ────────────────────────────────────────────────────────

def _slug(s: str) -> str:
    if not s:
        return "unknown"
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def generate_id(artist: str, albums: list) -> str:
    words = re.split(r"\s+", artist.strip())
    base = "".join(w[0].lower() for w in words if w)[:4]
    existing = sum(1 for a in albums if a["id"].startswith(base))
    return f"{base}{existing + 1:02d}"


def find_data_line(lines: list) -> int:
    """Return the 0-based index of the line containing the albums JSON array."""
    for i, line in enumerate(lines):
        if '"artist"' in line and '"id"' in line and len(line) > 500:
            return i
    raise RuntimeError("Could not locate albums JSON array in index.html")


def update_index_html(info: dict, raw_url: str, tracklist: list = None) -> dict:
    html_path = BASE_DIR / "data.js"
    content = html_path.read_text(encoding="utf-8")
    lines = content.split("\n")

    data_idx = find_data_line(lines)
    line = lines[data_idx]
    arr_start = line.index("[")
    arr_end = line.rindex("]") + 1
    albums = json.loads(line[arr_start:arr_end])

    album_id = generate_id(info["artist"], albums)

    # Add Cloudinary transformations for optimized delivery
    if "/upload/" in raw_url:
        parts = raw_url.split("/upload/", 1)
        image_url = parts[0] + "/upload/f_auto,q_auto,w_600/" + parts[1]
    else:
        image_url = raw_url

    year = info.get("year") or info.get("yearJP")
    year_jp = info.get("yearJP") or info.get("year")

    new_album = {
        "id": album_id,
        "artist": info["artist"],
        "album": info["album"],
        "versions": [
            {
                "year": year,
                "yearJP": year_jp,
                "catalog": info.get("catalog") or "",
                "image": image_url,
                "note": "",
            }
        ],
    }

    if tracklist:
        new_album["tracklist"] = tracklist

    albums.append(new_album)
    new_json = json.dumps(albums, ensure_ascii=False, separators=(",", ":"))
    lines[data_idx] = line[:arr_start] + new_json + line[arr_end:]
    html_path.write_text("\n".join(lines), encoding="utf-8")

    log(f"Added to data.js: id={album_id}, {info['artist']} — {info['album']}")
    return new_album


# ── Git push ─────────────────────────────────────────────────────────────────

def git_push(artist: str, album: str):
    os.chdir(BASE_DIR)
    subprocess.run(["git", "add", "data.js"], check=True)
    subprocess.run(
        ["git", "commit", "-m", f"Add {artist} - {album} (via inbox automation)"],
        check=True,
    )
    subprocess.run(["git", "push", "origin", "main"], check=True)
    log("Pushed to GitHub")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    obi_path      = next((p for p in [INBOX / "a.jpg", INBOX / "あ.jpg"] if p.exists()), INBOX / "a.jpg")
    jacket_path   = next((p for p in [INBOX / "b.jpg", INBOX / "い.jpg"] if p.exists()), INBOX / "b.jpg")
    combined_path = next((p for p in [INBOX / "c.jpg", INBOX / "う.jpg"] if p.exists()), INBOX / "c.jpg")
    t_path        = INBOX / "t.jpg"

    # Determine mode: combined.jpg alone, or obi.jpg + jacket.jpg
    combined_only = combined_path.exists() and not obi_path.exists() and not jacket_path.exists()

    if not combined_only and (not obi_path.exists() or not jacket_path.exists()):
        log("ERROR: inbox must contain either combined.jpg alone, or both obi.jpg and jacket.jpg")
        sys.exit(1)

    try:
        if combined_only:
            log("Step 1/5 — c.jpg found; skipping image combination.")
            info_source = combined_path
        else:
            # 1. Combine images
            log("Step 1/5 — Combining images (obi left, jacket right)...")
            combine_images(obi_path, jacket_path, combined_path)
            info_source = obi_path

        # 2. Extract album info from the obi (or combined) image
        log("Step 2/5 — Reading album info from obi with Claude API...")
        info = extract_album_info(info_source)
        if not info.get("artist"):
            info["artist"] = "Various Artists"
        log(f"  → {json.dumps(info, ensure_ascii=False)}")

        # 2b. Extract tracklist if t.jpg exists
        tracklist = None
        if t_path.exists():
            log("Step 2b — Extracting tracklist from t.jpg...")
            tracklist = extract_tracklist(t_path)
            log(f"  → {len(tracklist)} tracks extracted")

        # 3. Upload combined image to Cloudinary
        base_public_id = f"obi-strip-collection/{_slug(info['artist'])}_{_slug(info['album'])}"
        # Avoid overwriting existing Cloudinary images with the same name
        html_path = BASE_DIR / "data.js"
        existing_content = html_path.read_text(encoding="utf-8")
        counter = 2
        public_id = base_public_id
        while f"{public_id}.jpg" in existing_content:
            public_id = f"{base_public_id}-{counter}"
            counter += 1
        log(f"Step 3/5 — Uploading to Cloudinary ({public_id})...")
        raw_url = upload_to_cloudinary(combined_path, public_id)
        log(f"  → {raw_url}")

        # 4. Update index.html
        log("Step 4/5 — Updating index.html...")
        update_index_html(info, raw_url, tracklist)

        # 5. Commit and push
        log("Step 5/5 — Pushing to GitHub...")
        git_push(info["artist"], info["album"])

        # Cleanup inbox
        if not combined_only:
            obi_path.unlink()
            jacket_path.unlink()
        combined_path.unlink(missing_ok=True)
        if t_path.exists():
            t_path.unlink()
        log("Inbox cleaned up")
        log(f"SUCCESS: {info['artist']} — {info['album']} added!")

    except Exception as exc:
        log(f"ERROR: {exc}")
        import traceback
        traceback.print_exc()
        # Leave inbox files intact so the user can retry after fixing the issue
        sys.exit(1)


if __name__ == "__main__":
    main()
