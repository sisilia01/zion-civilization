#!/usr/bin/env bash
# Download and validate equirectangular Milky Way panorama (run on machine with network).
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/validate-milkyway.mjs
