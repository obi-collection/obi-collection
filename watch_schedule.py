#!/usr/bin/env python3
"""
watch_schedule.py — OBI collection schedule export watcher

Polls ~/Downloads every 5 seconds for obi-schedule-*.json files dropped by
the "保存して反映" button in schedule.html. When one appears and is stable,
merges it into schedule.js (merge_schedule.py), commits and pushes, then
deletes the download.

This is what makes the editor feel like a real app: hit the button on any
device that downloads to this Mac, and the schedule updates itself.

Designed to be launched by launchd at login (see the plist alongside the
watch-inbox one).
"""

import os
import re
import signal
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

BASE_DIR = Path("/Volumes/Extreme SSD/obi-collection")
DOWNLOADS = Path.home() / "Downloads"
PROCESSED_DIR = DOWNLOADS / "obi-schedule-processed"
PATTERN = "obi-schedule-*.json"
POLL_INTERVAL = 5   # seconds between checks
STABLE_WAIT = 2     # seconds to confirm the file size is stable


def log(msg: str):
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


def file_is_stable(path: Path) -> bool:
    try:
        size1 = path.stat().st_size
        time.sleep(STABLE_WAIT)
        return size1 == path.stat().st_size
    except FileNotFoundError:
        return False


def run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=str(BASE_DIR), capture_output=True, text=True)


def merge_file(path: Path) -> bool:
    """Merge one export into schedule.js, then commit and push."""
    result = run([sys.executable, str(BASE_DIR / "merge_schedule.py"), str(path)])
    output = (result.stdout + result.stderr).strip()
    for line in output.splitlines():
        log(f"  {line}")
    if result.returncode != 0:
        log("merge_schedule.py が失敗しました。ファイルは残します（再試行可能）。")
        return False

    status = run(["git", "status", "--porcelain", "schedule.js"])
    if not status.stdout.strip():
        log("schedule.js に変更はありませんでした（反映済みの内容）。")
        return True

    run(["git", "add", "schedule.js"])
    commit = run(["git", "commit", "-m", "Update scheduled X posts from the schedule editor"])
    if commit.returncode != 0:
        log(f"git commit が失敗しました: {(commit.stdout + commit.stderr).strip()}")
        return False
    push = run(["git", "push"])
    if push.returncode != 0:
        log(f"git push が失敗しました（ローカルには反映済み）: {(push.stdout + push.stderr).strip()}")
        return True
    log("schedule.js を更新してプッシュしました ✓")
    return True


def handle_signal(signum, frame):
    log(f"Received signal {signum} — shutting down")
    sys.exit(0)


def main():
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    log("=== OBI schedule watcher started ===")
    log(f"    PID:       {os.getpid()}")
    log(f"    Watching:  {DOWNLOADS}/{PATTERN}")

    while True:
        if not BASE_DIR.exists():  # SSD が外れている間は何もしない
            time.sleep(POLL_INTERVAL)
            continue
        for path in sorted(DOWNLOADS.glob(PATTERN)):
            # Safari の途中ダウンロード（.download）は glob に出ないが、念のため安定待ち
            if not file_is_stable(path):
                continue
            log(f"検出: {path.name}")
            if merge_file(path):
                PROCESSED_DIR.mkdir(exist_ok=True)
                stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                path.rename(PROCESSED_DIR / f"{stamp}-{path.name}")
                log(f"処理済みへ移動: {PROCESSED_DIR.name}/{stamp}-{path.name}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
