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
    "search": stroke('<circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4L14 14"/>'),
    # Background tasks: the Squads count (a short stack of runs), and one glyph per kind (Task.kind, sessions.js).
    "tasks": stroke('<path d="M2 4h12M2 8h8M2 12h10"/>', width=1.5),
    "task-shell": stroke('<path d="M2.5 4l4 4l-4 4M8.5 12.5h5"/>', width=1.5),
    "task-agent": stroke('<circle cx="8" cy="5.5" r="2.5"/><path d="M3 14c0-3 2.2-4.5 5-4.5s5 1.5 5 4.5"/>', width=1.4),
    "task-monitor": stroke('<path d="M1.5 8.5h3l2-4.5l3 8l2-3.5h3"/>', width=1.4),
}

# The geometric layer, all tinted with the text colour and drawn large, then clipped by their
# parent: a field of dots (6px pitch), a 48px grid, a catalogue barcode, a registration cross,
# a tick ruler (major every 20px, minor every 4px), and range rings (dotted outer, solid inner,
# four ticks) that frame empty space.
def pattern(pid, w, h, body, size):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size[0]}" height="{size[1]}" viewBox="0 0 {size[0]} {size[1]}" fill="currentColor">'
            f'<defs><pattern id="{pid}" width="{w}" height="{h}" patternUnits="userSpaceOnUse">{body}</pattern></defs>'
            f'<rect width="{size[0]}" height="{size[1]}" fill="url(#{pid})"/></svg>\n')

ICONS["dots"] = pattern("d", 6, 6, '<circle cx="3" cy="3" r="0.8"/>', (1440, 960))
# The blueprint grid is the work area's layout background, an image (not tinted): mid grey at 14% reads on paper and night.
ICONS["grid"] = pattern("g", 48, 48, '<rect width="48" height="1" fill="#7F7F7F" fill-opacity="0.14"/><rect width="1" height="48" fill="#7F7F7F" fill-opacity="0.14"/>', (2400, 1600))
ICONS["barcode"] = ('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="8" viewBox="0 0 36 8" fill="currentColor">'
                    + "".join(f'<rect x="{x + o}" width="{w}" height="8"/>' for x in range(0, 36, 9) for o, w in ((0, 1), (3, 2), (6, 1)))
                    + "</svg>\n")
ICONS["cross"] = '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 9 9" fill="currentColor"><rect x="4" width="1" height="9"/><rect y="4" width="9" height="1"/></svg>\n'
ICONS["ticks"] = ('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="6" viewBox="0 0 400 6" fill="currentColor">'
                  + "".join(f'<rect x="{x}" y="{0 if x % 20 == 0 else 3}" width="1" height="{6 if x % 20 == 0 else 3}"/>' for x in range(0, 400, 4))
                  + "</svg>\n")
ICONS["rings"] = ('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300" fill="none" stroke="currentColor">'
                  '<circle cx="150" cy="150" r="148" stroke-dasharray="1 5" stroke-linecap="round"/><circle cx="150" cy="150" r="104"/>'
                  '<path d="M150 0v26M150 274v26M0 150h26M274 150h26"/></svg>\n')

for name, svg in ICONS.items():
    (ART / f"{name}.svg").write_text(svg, encoding="utf-8")
print(f"wrote {len(ICONS)} files to {ART}")
