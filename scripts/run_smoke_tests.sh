#!/bin/bash
# Run Hermes adapter smoke test
# Usage: ./scripts/run_smoke_tests.sh [--mock]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default: use local real Hermes CLI backend
BACKEND_MODE="${HERMES_STUDIO_BACKEND:-local}"

if [[ "${1:-}" == "--mock" ]]; then
    BACKEND_MODE="mock"
fi

export HERMES_STUDIO_BACKEND="$BACKEND_MODE"

echo "=== Hermes Smoke Test ==="
echo "Backend: $BACKEND_MODE"
echo "Python: $(which python3)"
echo ""

# Ensure we have the adapter package in the path
# Run from project root so relative imports work
cd "$PROJECT_ROOT"

# Use the project's virtual environment Python if available
if [[ -d ".venv/bin/python3" ]]; then
    PYTHON=".venv/bin/python3"
elif [[ -d ".venv/Scripts/python.exe" ]]; then
    PYTHON=".venv/Scripts/python.exe"
else
    PYTHON="python3"
fi

echo "Running: $PYTHON scripts/smoke_test.py"
"$PYTHON" scripts/smoke_test.py

EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
    echo ""
    echo "Smoke test PASSED"
elif [[ $EXIT_CODE -eq 2 ]]; then
    echo ""
    echo "Smoke test SKIPPED (Hermes unavailable)"
else
    echo ""
    echo "Smoke test FAILED (exit code: $EXIT_CODE)"
fi

exit $EXIT_CODE