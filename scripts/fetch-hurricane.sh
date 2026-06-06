#!/usr/bin/env bash
# Download a real NASA/Wikimedia hurricane (run on a machine with network access):
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/textures
curl -fsSL -A "Mozilla/5.0" -o public/textures/hurricane.png \
  "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Hurricane_Florence_2018-09-12.jpg/640px-Hurricane_Florence_2018-09-12.jpg" \
  || curl -fsSL -A "Mozilla/5.0" -o public/textures/hurricane.jpg \
  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Hurricane_Isabel_from_ISS.jpg/640px-Hurricane_Isabel_from_ISS.jpg"
echo "Saved hurricane texture to public/textures/"
