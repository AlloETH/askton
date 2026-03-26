#!/bin/sh

# Seed Claude OAuth credentials from env var if provided.
# Only seed if no credentials file already exists (preserves refreshed tokens).
if [ -n "$CLAUDE_CREDENTIALS" ]; then
  mkdir -p ~/.claude
  if [ ! -f ~/.claude/.credentials.json ]; then
    echo "$CLAUDE_CREDENTIALS" > ~/.claude/.credentials.json
    echo "Claude credentials seeded from CLAUDE_CREDENTIALS env var"
  else
    echo "Claude credentials file already exists, skipping seed"
  fi
fi

exec "$@"
