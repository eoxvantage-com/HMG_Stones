"""Download only exact URLs recorded from the rendered approved gallery DOM."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'docs/hmg/gallery-dom-evidence.json'
OUTPUT = ROOT / 'public/hmg-gallery'
SOURCE = 'https://www.hmgstones.com/gallery/'

def download(pair):
    index, item = pair
    url = item['url']
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'www.hmgstones.com' or not parsed.path.startswith('/wp-content/uploads/'):
        raise ValueError('Unexpected gallery asset URL')
    name = Path(parsed.path).name
    path = OUTPUT / name
    if not path.exists():
        with urlopen(Request(url, headers={'Referer': SOURCE, 'User-Agent': 'HMG-Gallery-Import/1.0'}), timeout=45) as response:
            final = urlparse(response.geturl())
            if final.scheme != 'https' or final.hostname != parsed.hostname:
                raise ValueError('Gallery image redirected outside approved host')
            if not response.headers.get('Content-Type', '').startswith('image/'):
                raise ValueError('Non-image response')
            data = response.read(16 * 1024 * 1024 + 1)
            if len(data) > 16 * 1024 * 1024:
                raise ValueError('Image exceeds import bound')
            path.write_bytes(data)
    data = path.read_bytes()
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        width, height = image.size
    return {'id': f'hmg-gallery-{index+1:03d}', 'sourcePageUrl': SOURCE, 'sourceUrl': url,
            'sourceCaption': item['caption'], 'sourceCheckedAt': '2026-10-05',
            'category': 'Experience Centre - 1 Sankey Road' if item['panel'].startswith('experience-') else 'HMG Factory 1',
            'title': f'Gallery reference {index+1:03d}', 'localUrl': '/hmg-gallery/' + name,
            'width': width, 'height': height, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
            'allowedUse': 'inspiration', 'surfaceEligible': False,
            'eligibilityReason': 'Gallery photograph; not yet verified as an unobstructed front-facing surface texture.'}

if __name__ == '__main__':
    evidence = json.loads(EVIDENCE.read_text(encoding='utf-8-sig'))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        assets = list(pool.map(download, enumerate(evidence['assets'])))
    manifest = {'sourcePageUrl': SOURCE, 'checkedAt': '2026-10-05', 'assets': assets}
    (ROOT / 'docs/hmg/gallery-assets.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'downloaded': len(assets), 'bytes': sum(x['bytes'] for x in assets), 'manifest': 'docs/hmg/gallery-assets.json'}))
