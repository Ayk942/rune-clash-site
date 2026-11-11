"""Rune Clash — fabrique les portraits des héros (img/heros/<id>.webp, fond transparent).

Le site sait dessiner lui-même un portrait qui manque, mais des images toutes prêtes
chargent bien plus vite. À relancer après avoir ajouté ou modifié des héros :
    1. dans le dossier du site : python3 -m http.server 8770
    2. dans un autre terminal :   python3 outils/portraits.py
Il faut Python, Playwright (pip install playwright, puis playwright install chromium), Pillow et numpy.

Méthode : chaque héros est dessiné deux fois, sur fond noir puis sur fond blanc ;
la différence entre les deux images donne la transparence exacte (même les bords et les ailes translucides).
"""
import asyncio, base64, io, os, sys
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(ICI, '..', 'img', 'heros')
ADRESSE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8770/index.html'
L, H = 300, 400   # taille des portraits (pixels)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

def image(data_url):
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(data_url.split(',', 1)[1]))).convert('RGB')).astype(np.float32) / 255

def detourer(noir, blanc):
    a = 1 - (blanc - noir).mean(axis=2)                     # opacité
    a = np.clip(a, 0, 1)
    c = np.where(a[..., None] > 0.004, noir / np.maximum(a[..., None], 0.004), 0)
    rgba = np.dstack([np.clip(c, 0, 1), a])
    return Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')

async def main():
    os.makedirs(SORTIE, exist_ok=True)
    async with async_playwright() as p:
        br = await p.chromium.launch(args=ARGS, executable_path='/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
        pg = await br.new_page(viewport={'width': 1200, 'height': 900})
        await pg.goto(ADRESSE)
        await pg.wait_for_function('() => typeof Scene3D !== "undefined" && Scene3D.pret', timeout=120000)
        ids = await pg.evaluate('() => HEROES.map(h => h.id)')
        seul = sys.argv[2].split(',') if len(sys.argv) > 2 else None
        for i, hid in enumerate(ids):
            if seul and hid not in seul: continue
            n = await pg.evaluate(f'() => Scene3D.portrait("{hid}", {L}, {H}, [0, 0, 0])')
            b = await pg.evaluate(f'() => Scene3D.portrait("{hid}", {L}, {H}, [1, 1, 1])')
            im = detourer(image(n), image(b))
            im.save(os.path.join(SORTIE, hid + '.webp'), 'WEBP', quality=84, method=6)
            print(f'{i + 1}/{len(ids)} {hid}', flush=True)
        await br.close()

asyncio.run(main())
