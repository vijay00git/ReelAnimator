# ReelAnimator — Google Colab (single-cell setup)

Paste this into a Colab cell (Runtime → Change runtime type → T4 GPU first).
Set `SARVAM_API_KEY` in Colab Secrets (🔑 left sidebar) or paste it below.

```python
#@title ReelAnimator — One-shot Colab setup + run
SARVAM_API_KEY = ""  # @param {type:"raw"}  # or use userdata.get('SARVAM_API_KEY')
GITHUB_REPO = ""  # @param {type:"string"}  # e.g. 'youruser/ReelAnimator'

import os
os.environ['DEBIAN_FRONTEND'] = 'noninteractive'
os.environ['NVM_DIR'] = '/root/.nvm'
os.environ['SARVAM_API_KEY'] = SARVAM_API_KEY
os.environ['PATH'] = '/root/.local/bin:' + os.environ.get('PATH', '')

# 1. System deps
!apt-get -qq install -y ffmpeg > /dev/null 2>&1
!curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash > /dev/null 2>&1
!bash -c 'source /root/.nvm/nvm.sh && nvm install 22 && nvm alias default 22 && corepack enable && corepack prepare pnpm@latest --activate' > /dev/null 2>&1
!pip install -q openai-whisper yt-dlp > /dev/null 2>&1
!curl -fsSL https://astral.sh/uv/install.sh | sh > /dev/null 2>&1
!uv tool install "earshot[mcp] @ git+https://github.com/Leonxlnx/earshot" > /dev/null 2>&1

# 2. hyper-motion CLI (from source)
!bash -c 'source /root/.nvm/nvm.sh && nvm use 22 && cd /tmp && git clone --depth 1 https://github.com/psiddharthdesign/hypermotion.git >/dev/null 2>&1 && cd hypermotion/cli && pnpm install >/dev/null 2>&1 && pnpm run build >/dev/null 2>&1 && ln -sf /tmp/hypermotion/cli/bin/hypermotion.mjs /root/.local/bin/hypermotion && chmod +x /tmp/hypermotion/cli/bin/*.mjs' > /dev/null 2>&1

# 3. Clone repo
if GITHUB_REPO:
    !git clone https://github.com/{GITHUB_REPO}.git /content/ReelAnimator > /dev/null 2>&1
    %cd /content/ReelAnimator
else:
    print("Set GITHUB_REPO or clone manually.")

# 4. Write .env
with open('/content/ReelAnimator/.env', 'w') as f:
    f.write(f"SARVAM_API_KEY={SARVAM_API_KEY}\nSARVAM_VOICE_ID_TA=vijay\nTTS_PROVIDER=sarvam\nWHISPER_MODEL=small\nKILO_MODEL=kilo/kilo-auto/free\n")

# 5. Install + run
!bash -c 'source /root/.nvm/nvm.sh && nvm use 22 && pnpm install' 2>&1 | tail -3
!bash -c 'source /root/.nvm/nvm.sh && nvm use 22 && export PATH="/root/.local/bin:$PATH" && pnpm reel from-text --script-file out/first_reel/script_bilingual.txt --bilingual --lang ta' 2>&1 | tail -30
```

## Upload raw footage

```python
from google.colab import files
import os
os.makedirs('/content/ReelAnimator/Raw Footage', exist_ok=True)
for fn, data in files.upload().items():
    open(f'/content/ReelAnimator/Raw Footage/{fn}', 'wb').write(data)
```

## Download result

```python
from google.colab import files
import glob, os
reels = glob.glob('/content/ReelAnimator/out/*/reel_ta.mp4')
if reels:
    files.download(max(reels, key=os.path.getmtime))
```