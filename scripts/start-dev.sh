#!/usr/bin/env bash
# Start dev environment — React HMR on :5173, Flask backend on :8080
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== SDRWatch Dev Server ==="
echo ""

# Start Flask backend (Docker)
echo "Starting Docker containers..."
cd "$PROJECT_DIR"
docker compose up -d sdrwatch-control sdrwatch-web
echo "Flask backend running at http://localhost:8080"
echo ""

# Start Vite dev server with HMR
echo "Starting Vite dev server (HMR)..."
cd "$PROJECT_DIR/sdrwatch_ui"
echo "React dev server will run at http://localhost:5173"
echo "API proxy → http://localhost:8080"
echo ""
echo "Open http://localhost:5173 in your browser"
echo "Edits to src/ files will auto-reload the page."
echo ""
npm run dev
