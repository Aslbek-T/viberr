#!/usr/bin/env bash
# Claude Code hook -> Buildscape brain. Reads hook JSON on stdin, prints the brain's answer to stdout.
# If the brain is not running, it prints nothing and exits 0 so Claude Code carries on normally.
BRAIN="${BUILDSCAPE_URL:-http://localhost:4321}"
curl -s --max-time 75 -X POST "$BRAIN/hook/claude" -H 'Content-Type: application/json' --data-binary @- 2>/dev/null || true
exit 0
