# Art pack: bring your own operator art

The skin can give each agent a character ("operator") instead of its program tile. This repo ships no character art. You supply the images, and `build_pack.py` turns them into the files the skin reads.

Status: the skin's identity registry (`IDENTITY` in `skin/mods/endfield/kit.js`) reads the pack and your overrides today. The surfaces that draw avatars (agent rows, session card, pane header, toast) are not built yet; see [ROADMAP.md](../ROADMAP.md). Until then a pack changes nothing on screen.

Without an art pack, every surface draws the program's own tile.

## What art you can use

Use art you made, art you commissioned, or art whose licence lets you crop and recolour it.

Official Arknights: Endfield art is © Hypergryph / Gryphline. You can keep it on your own machine for your own use. Do not commit it, publish it, or ship it in a fork, a pack or a screenshot set. The official [fan content guidelines](https://endfield.gryphline.com/en-us/news/4497) prohibit works that copy official material without clear originality, and works that could be mistaken for official content. `scripts/verify.mjs` fails on any image other than `preview.png` and on any file under `art/operators/`, so CI catches it.

## Make a pack

1. Make a folder outside this repo, for example `~/endfield-art/`. Put one image per operator in it. A tall, front-facing, full-body or half-body image with a transparent background works best.
2. Copy `pack.example.json` there as `pack.json` and edit it (schema below).
3. Build it into your Herdr home:

   ```sh
   pip install Pillow
   python art-pack/build_pack.py ~/endfield-art/pack.json
   ```

   It writes `art/operators/<slug>/` and `art/operators/manifest.json` in `HERDR_APP_HOME`, else `~/.config/herdr-app`. Pass `--home <folder>` to write somewhere else.

The skin rereads the manifest every 30 seconds while the agents list is shown. No restart is needed.

To remove the pack, delete `art/operators/` from your Herdr home.

## `pack.json`

```json
{
  "operators": {
    "kestrel": { "name": "Kestrel", "image": "kestrel.png", "eyes": [0.5, 0.3], "face_width": 0.05, "accent": "#50BBE2" }
  },
  "default_assignment": { "claude": "kestrel", "sub-agent": "kestrel", "shell": null }
}
```

`operators` maps a slug (lowercase, `-` for spaces) to:

| Field | Required | Meaning |
|---|---|---|
| `name` | no | Display name. Default: the slug. |
| `image` | yes | Image file, relative to `pack.json`. |
| `eyes` | yes | `[x, y]`: the midpoint between the eyes, as fractions of the image width and height. In an image editor, read the pixel position and divide: `[612 / 1200, 455 / 1600]`. |
| `face_width` | yes | Width of the face (ear to ear), as a fraction of the image width. The avatar is cropped to about 1.4 times this. |
| `accent` | no | `#RRGGBB` used for the operator's edges. Default: sampled from the image. Avoid the signal yellow `#FFFA00`; the skin reserves it for "you, here, now". |

`default_assignment` maps a program key to a slug, or to `null` for "keep the program tile". Program keys are Herdr's (`claude`, `codex`, `gemini`, `opencode`, `cursor`, ...). Two keys are special: `sub-agent` is used for sub-agents, and `shell` for any agent with no entry of its own.

## What it builds

For each operator, in `art/operators/<slug>/`:

| File | Size | Use |
|---|---|---|
| `avatar-32.png`, `avatar-64.png`, `avatar-128.png` | square | Agent tiles, cards and headers. Smaller sizes are sharpened. |
| `avatar-64-round.png` | 64, circular | Round badges. |
| `signal.png` | 400x480 | Head and shoulders in ink and signal yellow, faded at the bottom. |

And `art/operators/manifest.json`, which the skin reads:

```json
{
  "default_assignment": { "claude": { "operator": "kestrel" } },
  "operators": [
    {
      "slug": "kestrel",
      "name": "Kestrel",
      "accent": "#50BBE2",
      "files": {
        "avatar32": "art/operators/kestrel/avatar-32.png",
        "avatar64": "art/operators/kestrel/avatar-64.png",
        "avatar128": "art/operators/kestrel/avatar-128.png",
        "avatar64round": "art/operators/kestrel/avatar-64-round.png",
        "signal": "art/operators/kestrel/signal.png"
      }
    }
  ]
}
```

Paths are relative to the Herdr home. An operator with any of the five files missing is dropped, and its agents keep their program tiles.

## Per-person overrides

`data/endfield/operators.json` in your Herdr home overrides `default_assignment` key by key, and can pin one terminal to one operator:

```json
{ "programs": { "claude": "kestrel", "codex": null }, "terminals": { "t3": "lumen" } }
```

The skin resolves an agent's operator in this order: `terminals[address]`, then `programs["sub-agent"]` for a sub-agent, then `programs[program key]`, then `programs.shell`. Install seeds this file from `skin/data/endfield/operators.example.json` and never overwrites it afterwards.
