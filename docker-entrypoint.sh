#!/bin/sh

# Seed Claude OAuth credentials from env var if provided
if [ -n "$CLAUDE_CREDENTIALS" ]; then
  mkdir -p ~/.claude
  echo "$CLAUDE_CREDENTIALS" > ~/.claude/.credentials.json
  echo "Claude credentials seeded from CLAUDE_CREDENTIALS env var"
fi

exec "$@"
