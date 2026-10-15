"""Official product main-image inventory. No price/stock import; eligibility requires review."""
import concurrent.futures
import hashlib
import json
import re
import subprocess
import tempfile
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[2]
CACHE=Path(tempfile.gettempdir())/'hmg-official-products'
OUT=ROOT/'public/hmg-materials'
def fetch_html(url,path):
    if urlparse(url).hostname!='www.hmgstones.com' or "'" in url:raise ValueError('Official host required')
    if not path.exists():
        cmd="$r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 '"+url+"';[IO.File]::WriteAllText('"+str(path)+"',$r.Content)"
        subprocess.run(['powershell','-NoProfile','-NonInteractive','-Command',cmd],check=True,capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW,timeout=70)
    return path.read_text(encoding='utf-8-sig')
def product(url):
    slug=urlparse(url).path.strip('/').split('/')[-1]
    if not re.fullmatch(r'[a-z0-9_-]{1,80}',slug):raise ValueError('Unsupported product slug')
    soup=BeautifulSoup(fetch_html(url,CACHE/(slug+'.html')),'html.parser')
    title=soup.select_one('h1.product_title');img=soup.select_one('.woocommerce-product-gallery img.wp-post-image')
    if not title or not img:return {'sourcePageUrl':url,'error':'No product title or main image'}
    source=img.get('data-large_image') or img.get('data-src') or img.get('src')
    parsed=urlparse(source)
    if parsed.scheme!='https' or parsed.hostname!='www.hmgstones.com' or not parsed.path.startswith('/wp-content/uploads/'):raise ValueError('Unexpected source image')
    asset_id='hmg-stone-'+slug;ext=Path(parsed.path).suffix.lower()
    if ext not in ['.jpg','.jpeg','.png','.webp']:raise ValueError('Unsupported image type')
    local=OUT/(asset_id+ext)
    if not local.exists():
        with urlopen(Request(source,headers={'Referer':url,'User-Agent':'HMG-Official-Catalogue/1.0'}),timeout=45) as response:
            if urlparse(response.geturl()).hostname!='www.hmgstones.com' or not response.headers.get('Content-Type','').startswith('image/'):raise ValueError('Unexpected image response')
            content=response.read(16*1024*1024+1)
            if len(content)>16*1024*1024:raise ValueError('Image exceeds bound')
            local.write_bytes(content)
    with Image.open(local) as image:width,height=image.size;image.verify()
    attrs={}
    for row in soup.select('.woocommerce-product-details__short-description tr'):
        key=row.find('th');value=row.find('td')
        if key and value:attrs[key.get_text(' ',strip=True)]=value.get_text(' ',strip=True)
    cat=soup.select_one('.product_meta .posted_in a');sku=soup.select_one('.product_meta .sku')
    category=attrs.get('Category') or (cat.get_text(' ',strip=True) if cat else None)
    # Preserve approximate dimensions as source text, never invent parsed scale/product guarantees.
    dims=attrs.get('Slab Size (Approximate)')
    return {'id':asset_id,'optionId':str(uuid.uuid5(uuid.NAMESPACE_URL,url)),'title':title.get_text(' ',strip=True),'sourcePageUrl':url,'sourceUrl':source,'sourceCaption':img.get('alt',''),'sourceCheckedAt':'2026-10-05','category':category or 'Unspecified','stoneType':category,'colour':attrs.get('Colour'),'variant':None,'description':' '.join(k+': '+v for k,v in attrs.items()),'verifiedMetadata':attrs,'sku':sku.get_text(' ',strip=True) if sku else None,'physicalDimensions':{'sourceText':dims,'approximate':True} if dims else None,'width':width,'height':height,'localUrl':'/hmg-materials/'+local.name,'sha256':hashlib.sha256(local.read_bytes()).hexdigest(),'bytes':local.stat().st_size,'surfaceEligible':False,'allowedUse':'inspiration','eligibilityReason':'Official product image awaiting visual texture eligibility review.'}
def safe_product(url):
    try:return product(url)
    except Exception as error:return {'sourcePageUrl':url,'error':type(error).__name__}

if __name__=='__main__':
    CACHE.mkdir(exist_ok=True);OUT.mkdir(exist_ok=True)
    sitemap=ET.fromstring(fetch_html('https://www.hmgstones.com/product-sitemap.xml',CACHE/'sitemap.xml'))
    urls=[e.text for e in sitemap.findall('{*}url/{*}loc') if '/product/' in e.text]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:assets=list(pool.map(safe_product,urls))
    (ROOT/'docs/hmg/stone-products.json').write_text(json.dumps({'sourceSitemap':'https://www.hmgstones.com/product-sitemap.xml','assets':assets},indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    valid=[a for a in assets if 'error' not in a]
    for page in range((len(valid)+19)//20):
        sheet=Image.new('RGB',(1400,1200),'white');draw=ImageDraw.Draw(sheet)
        for i,a in enumerate(valid[page*20:(page+1)*20]):
            image=Image.open(ROOT/'public'/a['localUrl'].lstrip('/')).convert('RGB');image.thumbnail((270,245));x=(i%5)*280;y=(i//5)*300;sheet.paste(image,(x,y));draw.text((x+2,y+248),a['id'][:43],fill='black');draw.text((x+2,y+264),str(a['stoneType']),fill='black')
        sheet.save(ROOT/f'docs/hmg/stone-contact-{page+1}.jpg')
    print(json.dumps({'candidates':len(urls),'parsed':len(valid),'errors':[a for a in assets if 'error' in a]}))
