#!/usr/bin/env python3
"""Generate the ReelAnimator Colab notebook (robust, no %%bash pitfalls)."""
import json

cells = []

def md(text):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": text.splitlines(keepends=True)})

def code(text):
    cells.append({"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [],
                  "source": text.splitlines(keepends=True)})

md("""# ReelAnimator — Cloud Pipeline (Google Colab)

Runs the full pipeline on GPU:

**Whisper transcribe → script + translate → Sarvam Tamil TTS → b-roll (raw footage) → HyperFrames compose → earshot SFX → ffmpeg mux**

**Setup:** Runtime → Change runtime type → **T4 GPU**.

**Secrets:** add `SARVAM_API_KEY` in the 🔑 left sidebar, or paste it in the config cell.
""")

md("## 1. Install system dependencies")

code("""#@title ffmpeg + Node 22 + Python deps + earshot  (run once, ~3 min)
import os, subprocess, sys

def sh(cmd, label=None):
    print(f'\\n>>> {label or cmd}')
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    out = (r.stdout or '') + (r.stderr or '')
    print(out[-1500:] if out else '(no output)')
    return r.returncode

# ffmpeg
sh('apt-get -qq install -y ffmpeg > /dev/null 2>&1', 'install ffmpeg')
sh('ffmpeg -version | head -1', 'ffmpeg version')

# Node 22 via nvm
sh('curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash > /dev/null 2>&1', 'install nvm')
sh('bash -lc "source /root/.nvm/nvm.sh && nvm install 22 && nvm alias default 22"', 'install node 22')
sh('bash -lc "source /root/.nvm/nvm.sh && nvm use 22 && corepack enable && corepack prepare pnpm@latest --activate"', 'enable pnpm')

# Symlink node/npm/npx/pnpm into /usr/local/bin so EVERY later cell can use them
sh('bash -lc "source /root/.nvm/nvm.sh && nvm use 22 && NODE=$(dirname $(which node)) && '
   'ln -sf $NODE/node /usr/local/bin/node && ln -sf $NODE/npm /usr/local/bin/npm && '
   'ln -sf $NODE/npx /usr/local/bin/npx && ln -sf $NODE/corepack /usr/local/bin/corepack"', 'symlink node tools')
sh('bash -lc "source /root/.nvm/nvm.sh && nvm use 22 && PNPM=$(which pnpm) && ln -sf $PNPM /usr/local/bin/pnpm"', 'symlink pnpm')

sh('node --version && npm --version && pnpm --version', 'verify node toolchain')

# Python deps
sh('pip install -q openai-whisper yt-dlp > /dev/null 2>&1', 'install whisper + yt-dlp')

# uv + earshot
sh('curl -fsSL https://astral.sh/uv/install.sh | sh > /dev/null 2>&1', 'install uv')
sh('export PATH=/root/.local/bin:$PATH && uv tool install "earshot[mcp] @ git+https://github.com/Leonxlnx/earshot" > /dev/null 2>&1', 'install earshot')
sh('ln -sf /root/.local/bin/earshot /usr/local/bin/earshot 2>/dev/null; which earshot || echo "earshot not linked"', 'link earshot')

print('\\n=== SETUP COMPLETE ===')
sh('node --version; pnpm --version; ffmpeg -version | head -1')""")

md("""## 2. hyper-motion CLI

Optional — `.hype` scenes need the desktop app to render, which Colab doesn't have.
The pipeline falls back to GSAP-animated backgrounds automatically, so this is **optional**.
""")

code("""#@title (Optional) Install hyper-motion CLI from source
import subprocess
def sh(cmd, label=None):
    print(f'\\n>>> {label or cmd}')
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    out = (r.stdout or '') + (r.stderr or '')
    print(out[-800:] if out else '(no output)')

sh('bash -lc "source /root/.nvm/nvm.sh && nvm use 22 && cd /tmp && '
   'git clone --depth 1 https://github.com/psiddharthdesign/hypermotion.git > /dev/null 2>&1 && '
   'cd hypermotion/cli && pnpm install > /dev/null 2>&1 && pnpm run build > /dev/null 2>&1 && '
   'ln -sf /tmp/hypermotion/cli/bin/hypermotion.mjs /usr/local/bin/hypermotion && '
   'chmod +x /tmp/hypermotion/cli/bin/*.mjs"', 'build hyper-motion')
sh('hypermotion --help 2>&1 | head -3', 'verify')""")

md("## 3. Clone the repo")

code("""#@title Clone ReelAnimator  (format: 'username/reponame')
import subprocess, os

GITHUB_REPO = 'vijay00git/ReelAnimator'   #@param {type:'string'}
GITHUB_TOKEN = ''                          #@param {type:'string'}  # only for PRIVATE repos

if os.path.isdir('/content/ReelAnimator'):
    print('Already cloned — skipping.')
else:
    url = f'https://github.com/{GITHUB_REPO}.git'
    if GITHUB_TOKEN:
        url = f'https://{GITHUB_TOKEN}@github.com/{GITHUB_REPO}.git'
    print('Cloning:', f'https://github.com/{GITHUB_REPO}.git')
    r = subprocess.run(['git', 'clone', url, '/content/ReelAnimator'],
                       capture_output=True, text=True)
    print((r.stdout or '') + (r.stderr or ''))

if os.path.isdir('/content/ReelAnimator'):
    os.chdir('/content/ReelAnimator')
    print('\\nRepo ready:', os.getcwd())
    print('Files:', sorted(os.listdir('.')))
else:
    print('\\nCLONE FAILED — fix GITHUB_REPO and re-run.')""")

md("## 4. Configure API keys")

code("""#@title Set Sarvam API key + write .env
import os
from google.colab import userdata

# Use Colab Secrets (🔑) if present, else paste directly below.
try:
    SARVAM_API_KEY = userdata.get('SARVAM_API_KEY')
except Exception:
    SARVAM_API_KEY = ''

# SARVAM_API_KEY = 'sk_your_key_here'   # <-- paste here if no Secret set

os.chdir('/content/ReelAnimator')
env = f'''SARVAM_API_KEY={SARVAM_API_KEY}
SARVAM_VOICE_ID_TA=vijay
SARVAM_VOICE_ID_EN=shubh
TTS_PROVIDER=sarvam
WHISPER_MODEL=small
PYTHON_VENV=python3
KILO_MODEL=kilo/kilo-auto/free
'''
open('.env', 'w').write(env)

ok = bool(SARVAM_API_KEY and SARVAM_API_KEY.startswith('sk_'))
print('SARVAM_API_KEY:', (SARVAM_API_KEY[:10] + '...') if ok else 'MISSING — set it above')
print('Wrote .env')

# Quick TTS smoke test
if ok:
    import requests, base64
    r = requests.post('https://api.sarvam.ai/text-to-speech',
        headers={'api-subscription-key': SARVAM_API_KEY},
        json={'text': 'வணக்கம், இது ஒரு சோதனை.',
              'language_code': 'ta-IN', 'speaker': 'vijay',
              'model': 'bulbul:v3', 'output_audio_codec': 'wav'}, timeout=60)
    if r.status_code == 200 and 'audios' in r.json():
        n = len(base64.b64decode(r.json()['audios'][0]))
        print(f'Sarvam TTS OK — {n} audio bytes')
    else:
        print('Sarvam TTS FAILED:', r.status_code, r.text[:300])""")

md("## 5. Install Node deps")

code("""#@title pnpm install
import subprocess
r = subprocess.run('pnpm install', shell=True, cwd='/content/ReelAnimator',
                   capture_output=True, text=True)
print((r.stdout or '')[-1200:])
print((r.stderr or '')[-600:])
print('\\nDeps installed.' if r.returncode == 0 else '\\nINSTALL FAILED')""")

md("""## 6. Run the pipeline

Pick **one**:
- **A)** `from-text` — uses the bilingual script below (no LLM, no Whisper needed)
- **B)** `from-video` — transcribes your raw footage with GPU Whisper
""")

code("""#@title A) from-text — bilingual script (fast, no GPU needed)
import subprocess, os

os.chdir('/content/ReelAnimator')
os.makedirs('out/first_reel', exist_ok=True)

script = '''Tamil cinema is taking over the world|தமிழ் சினிமா உலகை கைப்பற்றுகிறது
From Rajinikanth to RRR the impact is massive|ரஜினிகாந்த் முதல் RRR வரை தாக்கம் மிகப்பெரியது
Streaming platforms are investing big in Tamil films|ஸ்ட்ரீமிங் தளங்கள் தமிழ் படங்களில் பெரிய முதலீடு செய்கின்றன
Dubbed Tamil movies are trending globally|டப் செய்யப்பட்ட தமிழ் படங்கள் உலகளவில் டிரெண்டிங்
The future of Tamil entertainment looks bright|தமிழ் பொழுதுபோக்கின் எதிர்காலம் பிரகாசமாக உள்ளது'''

open('out/first_reel/script_bilingual.txt', 'w').write(script)
print('Script written. Edit above to customize.\\n')

r = subprocess.run(
    'pnpm reel from-text --script-file out/first_reel/script_bilingual.txt --bilingual --lang ta',
    shell=True, cwd='/content/ReelAnimator', capture_output=True, text=True)
print((r.stdout or '')[-3000:])
print((r.stderr or '')[-1500:])
print('\\nPIPELINE OK' if r.returncode == 0 else '\\nPIPELINE FAILED')""")

code("""#@title B) from-video — transcribe raw footage with GPU Whisper
import subprocess, os, glob

os.chdir('/content/ReelAnimator')
raw = sorted(glob.glob('Raw Footage/*.mp4'))
if not raw:
    print('No raw footage found in Raw Footage/ — upload one first.')
else:
    src = raw[0]
    print('Transcribing:', src)
    os.makedirs('out/first_reel', exist_ok=True)
    subprocess.run(f'ffmpeg -nostdin -y -i "{src}" -vn -ac 1 -ar 16000 out/first_reel/audio.wav',
                   shell=True, capture_output=True)
    # GPU whisper (small model)
    r = subprocess.run('whisper out/first_reel/audio.wav --model small --language ta '
                       '--output_format json --output_dir out/first_reel '
                       '--word_timestamps True --device cuda',
                       shell=True, capture_output=True, text=True)
    print((r.stdout or '')[-1500:])
    print((r.stderr or '')[-800:])
    j = 'out/first_reel/audio.json'
    if os.path.exists(j):
        import json
        d = json.load(open(j))
        print('\\nDetected language:', d.get('language'))
        for s in d.get('segments', []):
            print(f'  [{s["start"]:.1f}-{s["end"]:.1f}] {s["text"]}')
        lines = [s['text'].strip() for s in d.get('segments', []) if s.get('text', '').strip()]
        open('out/first_reel/transcript.txt', 'w').write('\\n'.join(lines))
        print('\\nSaved transcript.txt — translate to Tamil, then use from-text --script-file')
    else:
        print('Whisper produced no output.')""")

md("## 7. Get the result")

code("""#@title Preview + download the reel
import glob, os, subprocess
from google.colab import files
from IPython.display import Video, display

reels = sorted(glob.glob('/content/ReelAnimator/out/*/reel_ta.mp4'), key=os.path.getmtime)
if not reels:
    print('No reel found — check the pipeline output above.')
else:
    latest = reels[-1]
    size = os.path.getsize(latest) / 1024
    print(f'Reel: {latest}  ({size:.0f} KB)')

    probe = subprocess.run(
        f'ffprobe -v error -show_entries format=duration:stream=codec_name,width,height '
        f'-of default=noprint_wrappers=1 "{latest}"',
        shell=True, capture_output=True, text=True)
    print(probe.stdout)

    display(Video(latest, embed=True, height=600))
    files.download(latest)

    for extra in ('beats.json', 'metadata.json'):
        p = os.path.join(os.path.dirname(latest), extra)
        if os.path.exists(p):
            files.download(p)""")

md("""## Troubleshooting

| Error | Fix |
|---|---|
| `SyntaxError: invalid syntax` on a shell line | That cell was run as Python. Re-run the whole cell (each cell is self-contained). |
| `pnpm: command not found` | Re-run cell 1 — it symlinks pnpm into `/usr/local/bin`. |
| `Sarvam TTS FAILED 401/403` | Key missing or wrong. Re-run cell 4. |
| `CLONE FAILED` | `GITHUB_REPO` must be `'user/repo'`, not a URL. |
| Render very slow | Reduce beats, or render with `--quality draft`. |
| `.hype` scenes missing | Expected — needs hyper-motion desktop app. GSAP motion is used instead. |

## Notes

- **Sarvam TTS** uses `bulbul:v3` + voice `vijay` (`ta-IN`) — good Tamil quality.
- **Raw footage** is used full-bleed as background for every beat.
- **GSAP motion**: captions fade/slide/scale in; background gets a slow Ken Burns zoom.
- **earshot SFX**: whoosh/pop/impact on beat cuts.
- **Bilingual script** (`EN|TA` per line) skips the LLM entirely — fastest path.
""")

nb = {
    "nbformat": 4,
    "nbformat_minor": 0,
    "metadata": {
        "colab": {"provenance": [], "gpuType": "T4"},
        "kernelspec": {"name": "python3", "display_name": "Python 3"},
        "accelerators": ["GPU"],
    },
    "cells": cells,
}

with open('colab/reelanimator_colab.ipynb', 'w') as f:
    json.dump(nb, f, indent=1, ensure_ascii=False)

print(f'Wrote notebook with {len(cells)} cells ({sum(1 for c in cells if c["cell_type"]=="code")} code)')