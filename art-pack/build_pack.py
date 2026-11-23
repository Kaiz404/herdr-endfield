"""Build an operator art pack for the Endfield skin from images you supply.

    python art-pack/build_pack.py my-pack/pack.json [--home <herdr home>]

Reads pack.json (schema in art-pack/README.md), crops each image into the files the skin
draws, and writes <home>/art/operators/<slug>/*.png plus <home>/art/operators/manifest.json.
<home> defaults to HERDR_APP_HOME, else ~/.config/herdr-app. Needs Pillow.
"""
import argparse, colorsys, json, os, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

INK, PAPER, SIGNAL = (0x19, 0x19, 0x19), (0xEE, 0xED, 0xEC), (0xFF, 0xFA, 0x00)
FILES = {'avatar32': 'avatar-32.png', 'avatar64': 'avatar-64.png', 'avatar128': 'avatar-128.png',
         'avatar64round': 'avatar-64-round.png', 'signal': 'signal.png'}
RECIPE = {'name', 'accent', 'image', 'eyes', 'face_width', 'bust'}


def avatars(im, ex, ey, s):
    """Square face crops; the eye line sits 40% down, smaller sizes sharpened to survive 32px."""
    av = im.crop((round(ex - s / 2), round(ey - 0.4 * s), round(ex + s / 2), round(ey + 0.6 * s)))
    out = {}
    for n, sharpen in ((128, 0), (64, 40), (32, 90)):
        a = av.resize((n, n), Image.LANCZOS)
        out[f'avatar{n}'] = a.filter(ImageFilter.UnsharpMask(radius=0.8, percent=sharpen, threshold=1)) if sharpen else a
    big = av.resize((256, 256), Image.LANCZOS)
    mask = Image.new('L', big.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 255, 255), fill=255)
    big.putalpha(ImageChops.multiply(big.getchannel('A'), mask))
    out['avatar64round'] = big.resize((64, 64), Image.LANCZOS)
    return out


def bust(im, ex, ey, side):
    """Head and shoulders, 400x480, fading out over the bottom 28%."""
    w, top, h = 3.0 * side, ey - 1.1 * side, 3.6 * side
    b = im.crop((round(ex - w / 2), round(top), round(ex + w / 2), round(top + h))).resize((400, 480), Image.LANCZOS)
    fade = Image.new('L', b.size, 255)
    start = int(b.height * 0.72)
    for y in range(start, b.height):
        fade.paste(round(255 * (b.height - 1 - y) / (b.height - 1 - start)), (0, y, b.width, y + 1))
    b.putalpha(ImageChops.multiply(b.getchannel('A'), fade))
    return b


def duotone(im, lo, hi, gamma=1.0):
    lum = im.convert('L')
    lo_v, hi_v = lum.getextrema()
    lut = lambda c0, c1: [round(c0 + (c1 - c0) * max(0, min(1, (i - lo_v) / max(1, hi_v - lo_v))) ** gamma) for i in range(256)]
    return Image.merge('RGBA', (*[lum.point(lut(lo[k], hi[k])) for k in range(3)], im.getchannel('A')))


def sample_accent(im):
    """The most saturated mid-light colour in the image, lifted to read on paper and on ink."""
    rgb = Image.new('RGB', im.size, PAPER)
    rgb.paste(im, mask=im.getchannel('A'))
    q = rgb.quantize(16, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()
    best, score = (0x80, 0x80, 0x80), -1
    for count, idx in q.getcolors():
        r, g, b = pal[idx * 3: idx * 3 + 3]
        _, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        sc = count * s * s * max(0, 1 - abs(l - 0.5) * 2.2)
        if sc > score:
            best, score = (r, g, b), sc
    h, l, s = colorsys.rgb_to_hls(*(c / 255 for c in best))
    return '#%02X%02X%02X' % tuple(round(v * 255) for v in colorsys.hls_to_rgb(h, min(0.6, max(0.42, l)), max(0.6, s)))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('pack')
    ap.add_argument('--home', default=os.environ.get('HERDR_APP_HOME') or os.path.join(os.path.expanduser('~'), '.config', 'herdr-app'))
    args = ap.parse_args()
    pack = json.load(open(args.pack, encoding='utf-8'))
    src_dir = os.path.dirname(os.path.abspath(args.pack))
    out_dir = os.path.join(args.home, 'art', 'operators')

    operators = []
    for slug, o in pack['operators'].items():
        im = Image.open(os.path.join(src_dir, o['image'])).convert('RGBA')
        W, H = im.size
        ex, ey = o['eyes'][0] * W, o['eyes'][1] * H
        s = o['face_width'] * W / 0.7
        bx, by, side = (o['bust']['center'][0] * W, o['bust']['center'][1] * H, o['bust']['side'] * W) if 'bust' in o else (ex, ey, 1.17 * s)
        b = bust(im, bx, by, side)
        made = {**avatars(im, ex, ey, s), 'signal': duotone(b, INK, SIGNAL, gamma=2.2)}
        os.makedirs(os.path.join(out_dir, slug), exist_ok=True)
        for key, name in FILES.items():
            made[key].save(os.path.join(out_dir, slug, name), optimize=True)
        accent = o.get('accent') or sample_accent(b)
        operators.append({'slug': slug, 'name': o.get('name', slug), 'accent': accent,
                          **{k: v for k, v in o.items() if k not in RECIPE},
                          'files': {k: f'art/operators/{slug}/{n}' for k, n in FILES.items()}})
        print(f'{slug}: {len(FILES)} files, accent {accent}')

    unknown = [v for v in pack.get('default_assignment', {}).values() if v is not None and v not in pack['operators']]
    if unknown:
        sys.exit(f'default_assignment names operators not in the pack: {", ".join(unknown)}')
    manifest = {'default_assignment': {k: {'operator': v} for k, v in pack.get('default_assignment', {}).items()},
                'operators': operators}
    with open(os.path.join(out_dir, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'wrote {os.path.join(out_dir, "manifest.json")}')


if __name__ == '__main__':
    main()
