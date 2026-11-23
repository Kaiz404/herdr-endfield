"""Writes the skin's original sounds into mods/endfield/sounds, synthesised with ffmpeg (no samples).
python mods/endfield/tools/make_sounds.py   (needs ffmpeg on PATH)
"""
import subprocess
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "sounds"
OUT.mkdir(exist_ok=True)

def note(freq, start, length, gain=0.35, decay=9):
    # A sine with its octave at a third of the level, struck and decaying: a clean industrial chime.
    return (f"if(between(t,{start},{start + length}),{gain}*(sin(2*PI*{freq}*(t-{start}))+0.33*sin(4*PI*{freq}*(t-{start})))"
            f"*exp(-(t-{start})*{decay})*min(1,(t-{start})*400),0)")

SOUNDS = {
    # Needs input: two rising beeps, the second held a little. It asks; it does not alarm.
    "needs-input": ([note(880, 0.00, 0.12, decay=14), note(1320, 0.14, 0.34, decay=7)], 0.5),
    # Claimed: a quick three-note rise that rings out.
    "claimed": ([note(1047, 0.00, 0.30, 0.25), note(1319, 0.07, 0.30, 0.25), note(1568, 0.14, 0.45, 0.3, 6)], 0.62),
    # A UI tick: a 25ms click, very quiet.
    "tick": ([note(2200, 0.0, 0.025, 0.08, 120)], 0.04),
}

for name, (notes, seconds) in SOUNDS.items():
    expr = "+".join(notes)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"aevalsrc='{expr}':s=44100:d={seconds}",
                    "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", str(OUT / f"{name}.mp3")], check=True)
print(f"wrote {len(SOUNDS)} files to {OUT}")
