#!/usr/bin/env bash
set -e

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed."
    echo "Install it from https://www.python.org/downloads/"
    echo "  macOS: brew install python3"
    echo "  Ubuntu/Debian: sudo apt install python3 python3-venv"
    exit 1
fi

# Create venv if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Setting up for first run..."
    python3 -m venv .venv
fi

# Activate venv
source .venv/bin/activate

# Install dependencies if needed
if ! python -c "import flask" 2>/dev/null; then
    echo "Installing dependencies..."
    pip install -r requirements.txt
    playwright install chromium
fi

# Open browser after a short delay
(sleep 2 && open http://localhost:5000 2>/dev/null || xdg-open http://localhost:5000 2>/dev/null) &

python app.py
