"""Writes every SVG in mods/endfield/art. Rerun after changing a shape:
python mods/endfield/tools/make_art.py
"""
from pathlib import Path

ART = Path(__file__).resolve().parent.parent / "art"
ART.mkdir(exist_ok=True)

def stroke(body, size=16, width=1.3):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}" '
            f'fill="none" stroke="currentColor" stroke-width="{width}" stroke-linecap="square" stroke-linejoin="miter">{body}</svg>\n')

def fill(body, w=16, h=16):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" fill="currentColor">{body}</svg>\n'

ICONS = {
    "diamond": fill('<path d="M8 1.5L14.5 8L8 14.5L1.5 8z"/>'),
    # The ink button's hover arrow: what its yellow side tab turns into.
    "tri": fill('<path d="M0 0L6 4L0 8z"/>', 6, 8),
    "plus": stroke('<path d="M8 2.5v11M2.5 8h11"/>', width=1.5),
    "close": stroke('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>', width=1.4),
    "chevron-down": stroke('<path d="M3.5 6l4.5 4.5L12.5 6"/>', width=1.5),
    "chevron-right": stroke('<path d="M6 3.5l4.5 4.5L6 12.5"/>', width=1.5),
    "settings": stroke('<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>'),
    "server": stroke('<rect x="2" y="2.5" width="12" height="4.5"/><rect x="2" y="9" width="12" height="4.5"/><path d="M4.5 4.75h1M4.5 11.25h1"/>'),
    "monitor": stroke('<rect x="1.5" y="2.5" width="13" height="8.5"/><path d="M5.5 14h5M8 11v3"/>'),
    "sidebar": stroke('<rect x="1.5" y="2.5" width="13" height="11"/><path d="M6 2.5v11"/>'),
    "pin": stroke('<path d="M6 2h4M6.5 2v4.5L4 9h8L9.5 6.5V2M8 9v5"/>'),
    "pin-off": stroke('<path d="M6 2h4M6.5 2v4.5L4 9h8L9.5 6.5V2M8 9v5M2 2l12 12"/>'),
    "clock": stroke('<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>'),
    "layers": stroke('<path d="M8 2L14 5L8 8L2 5z"/><path d="M2 8l6 3l6-3M2 11l6 3l6-3"/>'),
    "split-right": stroke('<rect x="1.5" y="1.5" width="13" height="13"/><path d="M8 1.5v13"/>', width=1.2),
    "split-down": stroke('<rect x="1.5" y="1.5" width="13" height="13"/><path d="M1.5 8h13"/>', width=1.2),
    "zoom": stroke('<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>', width=1.2),
    "unzoom": stroke('<path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/>', width=1.2),
    "win-min": stroke('<path d="M0 5.5h10"/>', size=10, width=1),
    "win-max": stroke('<rect x=".5" y=".5" width="9" height="9"/>', size=10, width=1),
    "win-restore": stroke('<rect x=".5" y="2.5" width="7" height="7"/><path d="M2.5 2.5V.5h7v7h-2"/>', size=10, width=1),
    "win-close": stroke('<path d="M0 0l10 10M10 0L0 10"/>', size=10, width=1),
}

# Original topographic lines: two nested ridge systems and a knoll, white at 6%.
def contour():
    paths = []
    for i in range(5):
        y = 120 + i * 34
        paths.append(f'<path d="M0 {y} C 260 {y + 70} 470 {y - 60} 760 {y + 10} S 1180 {y + 90} 1440 {y + 20}"/>')
    for i in range(4):
        y = 620 + i * 38
        paths.append(f'<path d="M0 {y + 30} C 210 {y - 40} 520 {y + 80} 800 {y} S 1250 {y - 70} 1440 {y + 10}"/>')
    for r in (0, 18, 36):
        paths.append(f'<ellipse cx="1120" cy="430" rx="{110 - r}" ry="{64 - r * 0.6:.0f}" transform="rotate(-12 1120 430)"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900" preserveAspectRatio="none" '
            'fill="none" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="1">' + "".join(paths) + "</svg>\n")

ICONS["contour"] = contour()

for name, svg in ICONS.items():
    (ART / f"{name}.svg").write_text(svg, encoding="utf-8")
print(f"wrote {len(ICONS)} files to {ART}")
