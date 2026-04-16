#!/bin/bash
# Wrapper for post_to_x.py — sources .env then runs the script.
# Called by launchd plist files.

set -e

BASE_DIR="/Volumes/Extreme SSD/obi-collection"
ENV_FILE="$BASE_DIR/.env"

# Abort silently if the SSD is not mounted
if [ ! -d "$BASE_DIR" ]; then
    exit 0
fi

# Load environment variables from .env
if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

exec /Library/Developer/CommandLineTools/usr/bin/python3 \
    "$BASE_DIR/post_to_x.py"
