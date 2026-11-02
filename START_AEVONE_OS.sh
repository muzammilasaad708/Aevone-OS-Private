#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -f web/config.js ]; then python3 tools/configure.py; fi
python3 tools/launch.py
