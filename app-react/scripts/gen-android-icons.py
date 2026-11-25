"""Gera os ícones do app Android a partir de public/icon-maskable-512.png.

Uso (na pasta app-react): python scripts/gen-android-icons.py
Escreve em android/app/src/main/res: ícone adaptativo (fundo + figura), ícones
legados (quadrado e redondo), splash e o ícone monocromático da notificação do GPS.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android/app/src/main/res'
SRC = Image.open(ROOT / 'public/icon-maskable-512.png').convert('RGB')
BG = SRC.getpixel((5, 5))  # (24, 24, 27)
ORANGE = (250, 132, 43)


def figure_rgba():
    """Figura laranja com fundo transparente (alfa pela distância ao fundo)."""
    out = Image.new('RGBA', SRC.size)
    px, dst = SRC.load(), out.load()
    span = sum((o - b) ** 2 for o, b in zip(ORANGE, BG)) ** 0.5
    for y in range(SRC.height):
        for x in range(SRC.width):
            p = px[x, y]
            d = sum((a - b) ** 2 for a, b in zip(p, BG)) ** 0.5
            a = max(0, min(1, d / span))
            dst[x, y] = (*ORANGE, round(a * 255)) if a > 0.02 else (0, 0, 0, 0)
    return out


FIG = figure_rgba()
BOX = FIG.getbbox()  # só a figura, sem a margem
CROP = FIG.crop(BOX)
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def put(path, img):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def centered(canvas_size, fig, width_ratio, color=None):
    w, h = canvas_size
    tw = round(min(w, h) * width_ratio)
    th = round(tw * fig.height / fig.width)
    f = fig.resize((tw, th), Image.LANCZOS)
    if color:
        solid = Image.new('RGBA', f.size, (*color, 255))
        solid.putalpha(f.getchannel('A'))
        f = solid
    base = Image.new('RGBA', canvas_size, (*BG, 255) if color is None and False else (0, 0, 0, 0))
    base.alpha_composite(f, ((w - tw) // 2, (h - th) // 2))
    return base


for name, d in DENS.items():
    # adaptativo: 108dp, figura dentro da zona segura (cerca de 50% da largura)
    fg = centered((round(108 * d),) * 2, CROP, 0.50)
    put(RES / f'mipmap-{name}/ic_launcher_foreground.png', fg)
    # legado: 48dp, quadrado com cantos arredondados e redondo
    s = round(48 * d)
    tile = Image.new('RGBA', (s, s), (*BG, 255))
    tile.alpha_composite(centered((s, s), CROP, 0.62))
    sq = tile.copy()
    m = Image.new('L', (s, s), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, s - 1, s - 1), radius=round(s * 0.18), fill=255)
    sq.putalpha(m)
    put(RES / f'mipmap-{name}/ic_launcher.png', sq)
    rd = tile.copy()
    m = Image.new('L', (s, s), 0)
    ImageDraw.Draw(m).ellipse((0, 0, s - 1, s - 1), fill=255)
    rd.putalpha(m)
    put(RES / f'mipmap-{name}/ic_launcher_round.png', rd)
    # notificação: 24dp, silhueta branca sobre transparente
    put(RES / f'drawable-{name}/ic_tracking.png', centered((round(24 * d),) * 2, CROP, 0.92, color=(255, 255, 255)))

# splash: fundo escuro com a figura ao centro
SPLASH = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}
for name, (w, h) in SPLASH.items():
    for folder, size in ((f'drawable-port-{name}', (w, h)), (f'drawable-land-{name}', (h, w))):
        img = Image.new('RGBA', size, (*BG, 255))
        img.alpha_composite(centered(size, CROP, 0.34 if size[0] < size[1] else 0.22))
        put(RES / folder / 'splash.png', img.convert('RGB'))
put(RES / 'drawable/splash.png', Image.new('RGBA', (480, 800), (*BG, 255)).convert('RGB'))
print('ok', BG, BOX)
