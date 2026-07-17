#!/usr/bin/env bash
# Build the landing page: inline the base64 fonts from build/ into
# index.template.html, writing the self-contained site/dist/index.html.
# Run after editing index.template.html; deploy separately via infra/deploy-site.sh.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
python3 - <<'PY'
import os

def b64(path):
    return open(path).read().replace('\n', '').strip()

html = open('index.template.html').read()
html = html.replace('__ARCHIVO_B64__', b64('build/archivo-black.b64'))
html = html.replace('__INSTRUMENT_B64__', b64('build/instrument-italic.b64'))

assert '__ARCHIVO_B64__' not in html and '__INSTRUMENT_B64__' not in html, 'placeholder left unreplaced'
open('dist/index.html', 'w').write(html)
print('built dist/index.html', os.path.getsize('dist/index.html'), 'bytes')
PY
