"""Pinned originals + reproducible metadata. Python stdlib only; --verify is offline."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.request
import xml.etree.ElementTree as ET
import struct

REVISION = '6735193b9d6f499411171daf8d8b7adf1e2d8883'
BASE = f'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/{REVISION}/'
ROOT = Path(__file__).resolve().parent / 'assets'
FILES = ['README.md', 'LICENSE.md', 'credit_names.txt', 'tracker.json'] + [
    f'sprite/{species}/{name}' for species in ('0249', '0250')
    for name in ('credits.txt', 'AnimData.xml', 'Idle-Anim.png', 'Attack-Anim.png', 'Hover-Anim.png')
]

def metadata():
    tracker = json.loads((ROOT / 'tracker.json').read_bytes())
    entries = []
    for species in ('0249', '0250'):
        tree = ET.fromstring((ROOT / f'sprite/{species}/AnimData.xml').read_bytes())
        animations = []
        for a in tree.findall('./Anims/Anim'):
            name = a.findtext('Name')
            if name not in ('Idle', 'Attack', 'Hover'):
                continue
            png = (ROOT / f'sprite/{species}/{name}-Anim.png').read_bytes()
            width, height = struct.unpack('>II', png[16:24])
            fw, fh = int(a.findtext('FrameWidth')), int(a.findtext('FrameHeight'))
            durations = [int(d.text) for d in a.findall('./Durations/Duration')]
            assert width == fw * len(durations) and height == fh * 8
            animations.append(dict(name=name, frameWidth=fw, frameHeight=fh,
                                   sheetWidth=width, sheetHeight=height, durations=durations))
        entries.append(dict(species=species, creator=tracker[species]['sprite_credit'],
                            provenance='original-game-extraction',
                            licenseStatus='CHUNSOFT original; no individual CC grant established',
                            animations=animations))
    return dict(repository='https://github.com/PMDCollab/SpriteCollab', revision=REVISION,
                files=[dict(path=p, url=BASE+p, sha256=hashlib.sha256((ROOT/p).read_bytes()).hexdigest()) for p in FILES],
                entries=entries)

if '--verify' in sys.argv:
    assert metadata() == json.loads((ROOT / 'manifest.json').read_bytes()), 'Asset or metadata mismatch'
    print('Verified 14 pinned originals, SHA256, XML frame grids and tracker credits (offline).')
else:
    for p in FILES:
        dest = ROOT / p
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(urllib.request.urlopen(BASE+p).read())
    (ROOT / 'manifest.json').write_text(json.dumps(metadata(), ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('Collected pinned originals and manifest.')
