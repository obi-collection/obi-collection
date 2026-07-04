#!/usr/bin/env python3
"""Generate static album pages, sitemap.xml, and robots.txt from data.js.

These static pages exist for SEO and link sharing: the main site (index.html)
is a JavaScript SPA whose content is invisible to crawlers and produces no
per-album OGP preview. Each generated page under albums/ carries
server-rendered content, Open Graph / Twitter tags (with the album's OBI
image), and JSON-LD MusicAlbum structured data, plus a link into the SPA
deep link (#album=<id>) for human visitors.

Run standalone (`python3 build_static.py`) or via process_inbox.py after a
data.js update.
"""

import json
import re
import html
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SITE_URL = "https://obi-collection.github.io/obi-collection/"
ALBUMS_DIR = BASE_DIR / "albums"
REVIEWS_DIR = BASE_DIR / "reviews"


def load_collection_data() -> dict:
    content = (BASE_DIR / "data.js").read_text(encoding="utf-8").strip()
    m = re.fullmatch(r"const\s+COLLECTION_DATA\s*=\s*(\{.*\});", content, re.DOTALL)
    if not m:
        raise RuntimeError("Could not parse COLLECTION_DATA in data.js")
    return json.loads(m.group(1))


def slugify(album_id: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", album_id.lower())).strip("-")


def esc(value) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def first_image_og(image_url: str) -> str:
    # Use a larger transform for the social card than the w_600 thumbnail.
    return image_url.replace("f_auto,q_auto,w_600", "f_auto,q_auto,w_1200")


def render_tracklist(tracklist) -> str:
    if not tracklist:
        return ""
    items = []
    for t in tracklist:
        if re.fullmatch(r"\[.*\]", t):
            items.append(f'<li class="disc">{esc(t[1:-1])}</li>')
        else:
            track_name = re.sub(r"^[0-9]+[.]?\s*", "", t)
            items.append(f"<li>{esc(track_name)}</li>")
    return '<ol class="tl">' + "".join(items) + "</ol>"


def render_markdown(md: str) -> str:
    """Minimal markdown → HTML for the Ask AI review format. Must mirror
    renderMarkdown() in app.js: #-#### headings, --- rules, - lists,
    **bold**, blank-line paragraphs (line breaks kept inside paragraphs)."""
    def inline(s: str) -> str:
        return re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", esc(s))

    out: list[str] = []
    para: list[str] = []
    lst: list[str] = []

    def flush_para():
        if para:
            out.append("<p>" + "<br>".join(para) + "</p>")
            para.clear()

    def flush_list():
        if lst:
            out.append("<ul>" + "".join(lst) + "</ul>")
            lst.clear()

    for raw in md.replace("\r\n", "\n").split("\n"):
        t = raw.strip()
        if not t:
            flush_para()
            flush_list()
            continue
        m = re.match(r"^(#{1,4})\s+(.*)$", t)
        if m:
            flush_para()
            flush_list()
            level = min(len(m.group(1)) + 2, 6)
            out.append(f'<h{level} class="review-h{len(m.group(1))}">{inline(m.group(2))}</h{level}>')
            continue
        if re.fullmatch(r"-{3,}|\*{3,}", t):
            flush_para()
            flush_list()
            out.append("<hr>")
            continue
        m = re.match(r"^[-*]\s+(.*)$", t)
        if m:
            flush_para()
            lst.append(f"<li>{inline(m.group(1))}</li>")
            continue
        flush_list()
        para.append(inline(t))
    flush_para()
    flush_list()
    return "".join(out)


def review_markdown(album: dict) -> str:
    path = REVIEWS_DIR / f"{slugify(album['id'])}.md"
    return path.read_text(encoding="utf-8") if path.exists() else ""


def json_ld(album: dict, v: dict, image_og: str) -> str:
    data = {
        "@context": "https://schema.org",
        "@type": "MusicAlbum",
        "name": album["album"],
        "byArtist": {"@type": "MusicGroup", "name": album["artist"]},
        "image": image_og,
        "url": f"{SITE_URL}albums/{slugify(album['id'])}.html",
    }
    if v.get("year"):
        data["datePublished"] = str(v["year"])
    release = {"@type": "MusicRelease"}
    if v.get("catalog"):
        release["catalogNumber"] = v["catalog"]
    if v.get("yearJP"):
        release["datePublished"] = str(v["yearJP"])
        release["releasedEvent"] = {
            "@type": "PublicationEvent",
            "location": {"@type": "Country", "name": "Japan"},
        }
    if len(release) > 1:
        data["albumRelease"] = release
    return json.dumps(data, ensure_ascii=False)


def render_page(album: dict) -> str:
    v = album["versions"][0]
    slug = slugify(album["id"])
    page_url = f"{SITE_URL}albums/{slug}.html"
    image_og = first_image_og(v.get("image") or "")
    year = v.get("year")
    title_text = f"{album['artist']} - {album['album']}"
    if year:
        title_text += f" ({year})"
    desc_parts = [f"{album['artist']}『{album['album']}』"]
    if year:
        desc_parts.append(f"原盤{year}年")
    if v.get("yearJP"):
        desc_parts.append(f"日本盤{v['yearJP']}年")
    if v.get("catalog"):
        desc_parts.append(f"カタログ番号 {v['catalog']}")
    desc = "／".join(desc_parts) + " — 日本盤OBI付きヒップホップCDコレクション"

    meta_rows = ""
    if year:
        meta_rows += f'<div class="row"><span class="k">Original</span><span class="val">{esc(year)}</span></div>'
    if v.get("yearJP"):
        meta_rows += f'<div class="row"><span class="k">Japan Release</span><span class="val">{esc(v["yearJP"])}</span></div>'
    if v.get("catalog"):
        meta_rows += f'<div class="row"><span class="k">Catalog No.</span><span class="val">{esc(v["catalog"])}</span></div>'

    deep_link = f"../index.html#album={esc(album['id'])}"
    note_url = album.get("note_url") or ""
    note_link = (
        f'<a class="note-link" href="{esc(note_url)}" target="_blank" rel="noopener">'
        f'解説記事を読む（note） →</a>'
        if note_url else ""
    )
    review_md = review_markdown(album)
    review_html = (
        f'<section class="review-body"><h3>Review</h3>{render_markdown(review_md)}</section>'
        if review_md else ""
    )

    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title_text)} | Japanese OBI</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{esc(page_url)}">
<meta property="og:type" content="music.album">
<meta property="og:title" content="{esc(title_text)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{esc(image_og)}">
<meta property="og:url" content="{esc(page_url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title_text)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{esc(image_og)}">
<link rel="icon" href="../favicon.ico">
<link rel="stylesheet" href="../style.css">
<script type="application/ld+json">{json_ld(album, v, image_og)}</script>
<style>
.album-page {{ max-width: 720px; margin: 0 auto; padding: 1.5rem 1rem 4rem; }}
.album-page .crumb {{ font-family: var(--font-body); color: var(--text-secondary); margin-bottom: 1rem; }}
.album-page .crumb a {{ color: var(--gold-obi); text-decoration: none; }}
.album-page img.obi {{ width: 100%; border-radius: 8px; border: 1px solid var(--border-mid); display: block; margin-bottom: 1.25rem; }}
.album-page h1 {{ font-family: var(--font-heading); color: var(--gold-obi); font-size: 1.6rem; line-height: 1.2; margin-bottom: 0.25rem; }}
.album-page h2 {{ font-family: var(--font-body); color: var(--text-primary); font-weight: 400; font-size: 1.15rem; margin-bottom: 1.25rem; }}
.album-page .row {{ display: flex; gap: 1rem; padding: 0.45rem 0; border-bottom: 1px solid var(--border-subtle); }}
.album-page .k {{ width: 130px; flex-shrink: 0; color: var(--text-secondary); font-family: var(--font-body); }}
.album-page .val {{ color: var(--text-primary); font-family: var(--font-body); }}
.album-page .open-spa {{ display: inline-block; margin: 1.5rem 0; background: var(--gold-obi); color: var(--black); font-family: var(--font-heading); font-weight: 700; padding: 0.7rem 1.5rem; border-radius: 4px; text-decoration: none; }}
.album-page .note-link {{ display: inline-block; margin: 1.5rem 0 1.5rem 0.75rem; background: transparent; color: #41C9B4; border: 1px solid #41C9B4; font-family: var(--font-heading); font-weight: 700; padding: 0.7rem 1.5rem; border-radius: 4px; text-decoration: none; }}
.album-page ol.tl {{ margin: 0.5rem 0 0 1.25rem; color: var(--text-primary); font-family: var(--font-body); line-height: 1.7; }}
.album-page ol.tl li.disc {{ list-style: none; margin: 0.5rem 0 0.25rem -1.25rem; color: var(--gold-obi); font-weight: 700; }}
.album-page h3 {{ font-family: var(--font-heading); color: var(--text-primary); margin-top: 1.5rem; font-size: 1.05rem; }}
</style>
</head>
<body>
<main class="album-page">
<div class="crumb"><a href="../index.html">← US Hip Hop · Japanese Pressings</a></div>
<img class="obi" src="{esc(v.get('image') or '')}" alt="{esc(album['artist'])} - {esc(album['album'])} OBI">
<h1>{esc(album['artist'])}</h1>
<h2>{esc(album['album'])}{f" ({esc(year)})" if year else ""}</h2>
<div class="meta">{meta_rows}</div>
<a class="open-spa" href="{deep_link}">コレクションで開く →</a>{note_link}
{review_html}
{f"<h3>Track List</h3>{render_tracklist(album.get('tracklist'))}" if album.get('tracklist') else ""}
</main>
</body>
</html>
"""


def build():
    data = load_collection_data()
    albums = data["albums"]
    ALBUMS_DIR.mkdir(exist_ok=True)

    # Clean stale pages (ids that no longer exist)
    current_slugs = {slugify(a["id"]) + ".html" for a in albums}
    for existing in ALBUMS_DIR.glob("*.html"):
        if existing.name not in current_slugs:
            existing.unlink()

    for album in albums:
        slug = slugify(album["id"])
        (ALBUMS_DIR / f"{slug}.html").write_text(render_page(album), encoding="utf-8")

    # sitemap.xml
    urls = [SITE_URL] + [f"{SITE_URL}albums/{slugify(a['id'])}.html" for a in albums]
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sitemap.append(f"  <url><loc>{html.escape(u)}</loc></url>")
    sitemap.append("</urlset>")
    (BASE_DIR / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")

    # robots.txt
    (BASE_DIR / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}sitemap.xml\n", encoding="utf-8"
    )

    print(f"Generated {len(albums)} album pages + sitemap.xml ({len(urls)} URLs) + robots.txt")


if __name__ == "__main__":
    build()
