import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

src, dst = sys.argv[1], sys.argv[2]
font = TTFont(src)
font = instancer.instantiateVariableFont(font, {"wdth": 125, "wght": 600}, updateFontNames=False)

FAMILY = "Endfield Wide"
names = font["name"]
for rec in list(names.names):
    if rec.nameID in (16, 17, 21, 22, 25):
        names.removeNames(nameID=rec.nameID)
for nid, val in ((1, FAMILY), (2, "Regular"), (3, "EndfieldWide-SemiBoldExpanded;derived-from-Saira"),
                 (4, FAMILY), (6, "EndfieldWide-Regular")):
    names.setName(val, nid, 3, 1, 0x409)
    names.setName(val, nid, 1, 0, 0)
if "STAT" in font:
    del font["STAT"]
font["OS/2"].usWeightClass = 400
font["OS/2"].usWidthClass = 5
font["OS/2"].fsSelection = (font["OS/2"].fsSelection & ~0b1100001) | 0b1000000
font["head"].macStyle = 0
if "DSIG" in font:
    del font["DSIG"]
font.save(dst)
f2 = TTFont(dst)
print(f2["name"].getDebugName(1), f2["name"].getDebugName(4), "fvar" in f2, f2["OS/2"].usWeightClass)
