#!/usr/bin/env python3
"""
check_years.py — MusicBrainzでyear/yearJPの照合をする
"""
import json
import time
import re
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

BASE_DIR = Path("/Volumes/Extreme SSD/obi-collection")
DATA_JS   = BASE_DIR / "data.js"
OUT_FILE  = BASE_DIR / "check_results.json"

MB_BASE = "https://musicbrainz.org/ws/2"
HEADERS = {"User-Agent": "obi-collection-checker/1.0 (https://github.com/obi-collection/obi-collection)"}


def mb_get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        return None


def search_release(artist, album):
    """MusicBrainzでアーティスト+アルバム名を検索し、(year_original, year_jp) を返す"""
    q = urllib.parse.quote(f'artist:"{artist}" AND release:"{album}"')
    url = f"{MB_BASE}/release-group?query={q}&limit=5&fmt=json"
    data = mb_get(url)
    if not data or not data.get("release-groups"):
        return None, None

    # 最もスコアの高いrelease-groupを選ぶ
    rg = data["release-groups"][0]
    rg_id = rg.get("id")
    first_release = rg.get("first-release-date", "")
    year_orig = int(first_release[:4]) if first_release and len(first_release) >= 4 else None

    # 日本盤のリリース年を取得
    year_jp = None
    if rg_id:
        time.sleep(1)
        url2 = f"{MB_BASE}/release?release-group={rg_id}&fmt=json&limit=100"
        data2 = mb_get(url2)
        if data2:
            for rel in data2.get("releases", []):
                country = rel.get("country", "")
                date = rel.get("date", "")
                if country == "JP" and date and len(date) >= 4:
                    y = int(date[:4])
                    if year_jp is None or y < year_jp:
                        year_jp = y

    return year_orig, year_jp


def main():
    # data.js読み込み
    content = DATA_JS.read_text(encoding="utf-8")
    data = json.loads(content.strip().removeprefix("const COLLECTION_DATA = ").removesuffix(";"))
    albums = data["albums"]

    # 対象: year == yearJP のもの
    targets = [a for a in albums if a["versions"][0].get("year") == a["versions"][0].get("yearJP")]
    print(f"対象件数: {len(targets)}")

    # 既存結果を読み込んで再開対応
    if OUT_FILE.exists():
        results = json.loads(OUT_FILE.read_text(encoding="utf-8"))
        done_ids = {r["id"] for r in results}
        print(f"既存結果: {len(results)}件 → 残り{len(targets) - len(done_ids)}件")
    else:
        results = []
        done_ids = set()

    for i, album in enumerate(targets):
        aid = album["id"]
        if aid in done_ids:
            continue

        artist = album["artist"]
        title  = album["album"]
        v      = album["versions"][0]
        year_cur   = v.get("year")
        yearJP_cur = v.get("yearJP")

        # 50件ごとに進捗表示
        if (i + 1) % 50 == 0:
            print(f"  [{i+1}/{len(targets)}] 処理中...")

        try:
            time.sleep(1)
            year_mb, yearJP_mb = search_release(artist, title)

            if year_mb is None:
                status = "not_found"
            elif year_mb != year_cur:
                status = "mismatch"
            else:
                status = "ok"

            entry = {
                "id": aid,
                "artist": artist,
                "album": title,
                "catalog": v.get("catalog", ""),
                "year_current": year_cur,
                "yearJP_current": yearJP_cur,
                "year_mb": year_mb,
                "yearJP_mb": yearJP_mb,
                "status": status,
            }
        except Exception as e:
            entry = {
                "id": aid,
                "artist": artist,
                "album": title,
                "catalog": v.get("catalog", ""),
                "year_current": year_cur,
                "yearJP_current": yearJP_cur,
                "year_mb": None,
                "yearJP_mb": None,
                "status": "not_found",
                "error": str(e),
            }

        results.append(entry)
        done_ids.add(aid)

        # 10件ごとに中間保存
        if len(results) % 10 == 0:
            OUT_FILE.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    # 最終保存
    OUT_FILE.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    # 集計
    mismatches = [r for r in results if r["status"] == "mismatch"]
    not_found  = [r for r in results if r["status"] == "not_found"]
    ok         = [r for r in results if r["status"] == "ok"]

    print(f"\n===== 結果サマリー =====")
    print(f"  OK        : {len(ok)}")
    print(f"  MISMATCH  : {len(mismatches)}")
    print(f"  NOT FOUND : {len(not_found)}")
    print(f"\n===== MISMATCH 上位20件 =====")
    for r in mismatches[:20]:
        print(f"  [{r['id']}] {r['artist']} — {r['album']}")
        print(f"    現在: year={r['year_current']} yearJP={r['yearJP_current']}")
        print(f"    MB  : year={r['year_mb']} yearJP={r['yearJP_mb']}")


if __name__ == "__main__":
    main()
