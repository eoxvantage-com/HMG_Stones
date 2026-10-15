#!/bin/bash
cd "$(dirname "$0")"

IMAGE="repo.eoxvantage.com/hackathon/environment"

# Copy .env.example to .env if .env doesn't exist
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "=== Copied .env.example to .env ==="
    echo "Please edit .env with your values, then run this script again."
    exit 0
  else
    echo "WARNING: No .env or .env.example found."
  fi
fi

# Pull latest image
echo "=== Pulling latest Docker image ==="
docker pull "$IMAGE" || echo "WARNING: Could not pull latest image, using local cache."

# Run container
echo ""
echo "=== Starting environment ==="
echo "  Dev URL: http://localhost:5173"
echo ""
docker run --rm -it -v .:/app -p 5173:5173 "$IMAGE"
