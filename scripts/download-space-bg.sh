#!/usr/bin/env bash
# Replace procedural placeholder with NASA Webb deep field (public domain).
set -euo pipefail
OUT="$(dirname "$0")/../public/images/space-bg.jpg"
mkdir -p "$(dirname "$OUT")"
URLS=(
  "https://stsci-opo.org/STScI-01EVT1SCJPBPXE4ETPMP36Z31Y3.png"
  "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=2560&q=80"
  "https://www.nasa.gov/wp-content/uploads/2023/03/web_first_images_release.png"
)
for u in "${URLS[@]}"; do
  if curl -fsSL -A "Mozilla/5.0" -L -o "$OUT" "$u" && [ -s "$OUT" ]; then
    echo "Saved $OUT from $u ($(wc -c < "$OUT") bytes)"
    exit 0
  fi
done
echo "Failed to download space background; keeping existing file." >&2
exit 1
