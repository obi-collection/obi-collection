#!/usr/bin/env python3
"""
watch_inbox.py — OBI collection inbox watcher

Polls inbox/ every 5 seconds. When both obi.jpg and jacket.jpg are present
and stable (finished writing), delegates to process_inbox.py.

Designed to be launched by launchd at login.
"""

import os
import sys
import time
import subprocess
import signal
from datetime import datetime
from pathlib import Path

BASE_DIR = Path("/Volumes/Extreme SSD/obi-collection")
INBOX = BASE_DIR / "inbox"
ENV_FILE = BASE_DIR / ".env"
LOCK_FILE = BASE_DIR / ".inbox_processing.lock"
POLL_INTERVAL = 5   # seconds between checks
STABLE_WAIT = 2     # seconds to confirm file size is stable


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)


def load_env():
    """Load variables from .env file into the process environment."""
    if not ENV_FILE.exists():
        return
    for raw in ENV_FILE.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip())


def file_is_stable(path: Path) -> bool:
    """Return True if the file exists and its size hasn't changed in STABLE_WAIT seconds."""
    try:
        size1 = path.stat().st_size
        time.sleep(STABLE_WAIT)
        size2 = path.stat().st_size
        return size1 == size2
    except FileNotFoundError:
        return False


def run_process():
    """Call process_inbox.py and return True on success."""
    script = BASE_DIR / "process_inbox.py"
    env = os.environ.copy()
    result = subprocess.run(
        [sys.executable, str(script)],
        env=env,
    )
    return result.returncode == 0


def handle_signal(signum, frame):
    log(f"Received signal {signum} — shutting down")
    sys.exit(0)


def main():
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    load_env()

    log("=== OBI inbox watcher started ===")
    log(f"    PID:     {os.getpid()}")
    log(f"    Inbox:   {INBOX}")
    log(f"    Python:  {sys.executable}")

    while True:
        a = next((p for p in [INBOX / "a.jpg", INBOX / "あ.jpg"] if p.exists()), None)
        b = next((p for p in [INBOX / "b.jpg", INBOX / "い.jpg"] if p.exists()), None)
        c = next((p for p in [INBOX / "c.jpg", INBOX / "う.jpg"] if p.exists()), None)

        combined_only = c is not None and a is None and b is None
        normal_mode = a is not None and b is not None

        if combined_only or normal_mode:
            if LOCK_FILE.exists():
                # Another instance is processing — wait
                time.sleep(POLL_INTERVAL)
                continue

            if combined_only and file_is_stable(c):
                log(f"Found {c.name} — starting process_inbox.py...")
                LOCK_FILE.touch()
                try:
                    success = run_process()
                    if success:
                        log("Done ✓")
                    else:
                        log("process_inbox.py failed — images left in inbox for retry")
                finally:
                    LOCK_FILE.unlink(missing_ok=True)

            elif normal_mode and file_is_stable(a) and file_is_stable(b):
                log(f"Found {a.name} + {b.name} — starting process_inbox.py...")
                LOCK_FILE.touch()
                try:
                    success = run_process()
                    if success:
                        log("Done ✓")
                    else:
                        log("process_inbox.py failed — images left in inbox for retry")
                finally:
                    LOCK_FILE.unlink(missing_ok=True)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
