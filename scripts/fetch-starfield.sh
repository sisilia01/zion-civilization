#!/usr/bin/env bash
# Download NASA equirectangular star panorama (run on machine with network access).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/textures

URLS=(
  "https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k.jpg"
  "https://svs.gsfc.nasa.gov/vis/a000000/a003500/a003572/TychoSkymapII.t5_04096x02048.jpg"
  "https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k_print.jpg"
)

TMP="public/textures/starfield.jpg.tmp"
DEST="public/textures/starfield.jpg"
OK=0

for url in "${URLS[@]}"; do
  echo "Trying: $url"
  if curl -fsSL -A "Mozilla/5.0 (compatible; ZION/1.0)" -L --connect-timeout 30 -o "$TMP" "$url"; then
    BYTES=$(stat -c%s "$TMP" 2>/dev/null || stat -f%z "$TMP")
    if [ "$BYTES" -lt 8000 ]; then
      echo "  skip: file too small ($BYTES bytes)"
      continue
    fi
    if python3 - "$TMP" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
try:
    from PIL import Image
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "Pillow"])
    from PIL import Image
im = Image.open(path)
w, h = im.size
ratio = w / h
px = list(im.resize((256, 128)).getdata())
n = len(px)
avg = sum(r + g + b for r, g, b in px) / (3 * n)
dark = sum(1 for r, g, b in px if r + g + b < 90) / n
print(f"  size {w}x{h} ratio={ratio:.2f} avg_brightness={avg:.1f} dark_ratio={dark:.2f}")
if ratio < 1.75 or ratio > 2.25:
    sys.exit(2)
if avg > 100:
    sys.exit(3)
if dark < 0.35:
    sys.exit(4)
sys.exit(0)
PY
    then
      mv "$TMP" "$DEST"
      echo "Saved valid starfield: $DEST"
      OK=1
      break
    else
      echo "  skip: validation failed (wrong aspect, too bright, or not dark enough)"
    fi
  else
    echo "  download failed"
  fi
done

rm -f "$TMP"
if [ "$OK" -ne 1 ]; then
  echo "ERROR: Could not download a valid 2:1 NASA star panorama." >&2
  exit 1
fi
