# Art pack: operator art

The skin can give each agent a character ("operator") instead of its program tile. This repo ships no character art. There are two ways to get a pack:

- **The official renders, fetched on your machine.** `scripts/fetch-operators.mjs` downloads them from the official site and builds the pack. See [Fetch the official operators](#fetch-the-official-operators).
- **Your own images.** `build_pack.py` turns them into the files the skin reads. See [Make a pack](#make-a-pack).

With a pack, each agent's party chip in the sidebar, the pane name plates, Dispatch, Comms and the Report show the operator's round portrait. The session panel shows the bust, and the needs-input cut-in shows the signal portrait. Without a pack, every surface draws the program's own tile.

## What art you can use

Use art you made, art you commissioned, or art whose licence lets you crop and recolour it.

Official Arknights: Endfield art is © Hypergryph / Gryphline. You can keep it on your own machine for your own use. Do not commit it, publish it, or ship it in a fork, a pack or a screenshot set. The official [fan content guidelines](https://endfield.gryphline.com/en-us/news/4497) prohibit works that copy official material without clear originality, and works that could be mistaken for official content. `scripts/verify.mjs` fails on any image other than `preview.png` and on any file under `art/operators/`, so CI catches it.

## Fetch the official operators

```sh
node scripts/fetch-operators.mjs --list      # the 36 operators and the program defaults
node scripts/fetch-operators.mjs --accept    # download, verify and build
```

The script first prints a notice: this is an unofficial fan project, the art is © Hypergryph / Gryphline, and it is downloaded for your personal, local use only. Do not redistribute it. It downloads nothing until you pass `--accept`, or answer `y` when it asks at a terminal.

What it does:

1. Reads [`operators.json`](operators.json), the catalogue: the 36 playable operators, plus `endministrator-alt`, the male Endministrator render. Each operator row has its name, class, element and rarity (from the official operator page), the official CDN URL, sha256 and size of its source render, the official page URL, and its crop recipe (`eyes`, `face_width`, `bust`). Rows without an `accent` get one sampled from the image. A `note` marks a row whose source is only the small roster card (Kay and Mimino, for now). The catalogue holds no images, and no links other than the official site and its CDN. Tier-list facts for casting live in [docs/CASTING.md](../docs/CASTING.md).
2. Downloads each source over https, with a 30 second timeout and an 8 MB cap, into a temp folder. It refuses any URL that is not on the catalogue's `cdn`.
3. Checks each file's sha256. If the official site now serves a different file, it stops, installs nothing, and says the catalogue needs an update.
4. Runs `build_pack.py` on the downloads, then copies the pack into `art/operators/` in `HERDR_APP_HOME`, else `~/.config/herdr-app` (`%USERPROFILE%\.config\herdr-app` on Windows): the six files per operator, `manifest.json` and `CREDITS.md`.
5. Deletes the temp folder.

**How the crops were measured.** The first 8 rows keep their earlier values. For the other 29, the renders were downloaded to a scratch folder outside the repo, an anime face detector (OpenCV's LBP cascade, `lbpcascade_animeface`) proposed the face box, and the eye midpoint and face width were taken from that box with ratios calibrated on those 8 rows. Each crop was then checked by eye on a contact sheet of every avatar and bust. Where the detector missed or picked the wrong face (Alesh, Antal, Arclight, Argent Flow, Catcher, Da Pan, Purrchena, the male Endministrator, Kay and Mimino) the eyes and face width were read by hand from a grid over the render. Kay's and Mimino's busts take the whole 303x386 card. No crop is a default. The images were deleted afterwards.

Rerunning it is safe. It records what it built in `art/operators/.fetch-operators.json` and skips operators whose source hash and built files still match, so a second run downloads nothing. It never deletes a file. Before it replaces a file it did not write, or one you edited, it copies it to `art/operators/.fetch-operators-backup/<time>/`. It merges into an existing `manifest.json`: other operators, extra fields and your `default_assignment` stay.

Options: `--only perlica,ember` limits the run to those slugs. `--dry-run` prints the plan and writes nothing.

It needs Python 3.8 or newer with Pillow. If either is missing it says so and prints the install command (`python -m pip install Pillow`).

To remove the pack, delete `art/operators/` from your Herdr home.

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
| `bust` | no | `{"center": [x, y], "side": w}`: where to crop `signal.png`, as fractions of the image (`side` of its width). The crop is 3 sides wide and 3.6 tall, starting 1.1 sides above the centre. Default: centred on the eyes, sized from `face_width`. |

Any other field (`class`, `source_url`, ...) is copied as-is into the operator's manifest entry.

`default_assignment` maps a program key to a slug, or to `null` for "keep the program tile". It applies to agents whose model the skin does not know, or whose model's pool has none of the pack's operators; see [docs/CASTING.md](../docs/CASTING.md). Program keys are Herdr's (`claude`, `codex`, `gemini`, `opencode`, `cursor`, ...). Two keys are special: `sub-agent` is used for sub-agents, and `shell` for any agent with no entry of its own.

## What it builds

For each operator, in `art/operators/<slug>/`:

| File | Size | Use |
|---|---|---|
| `avatar-32.png`, `avatar-64.png`, `avatar-128.png` | square | Agent tiles, cards and headers. Smaller sizes are sharpened. |
| `avatar-64-round.png` | 64, circular | Round badges. |
| `bust-480.png` | 400x480 | Head and shoulders in full colour, faded at the bottom. The session panel. |
| `signal.png` | 400x480 | The same bust in ink and signal yellow. The needs-input cut-in. |

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
        "bust480": "art/operators/kestrel/bust-480.png",
        "signal": "art/operators/kestrel/signal.png"
      }
    }
  ]
}
```

Paths are relative to the Herdr home. An operator with any of the six files missing is dropped, and its agents keep their program tiles.

## Per-person overrides

`data/endfield/operators.json` in your Herdr home overrides `default_assignment` key by key, and can pin one terminal to one operator:

```json
{ "programs": { "claude": "kestrel", "codex": null }, "terminals": { "t3": "lumen" } }
```

The skin resolves an agent's operator in this order: `terminals[address]`, then your `programs["sub-agent"]` for a sub-agent, then your `programs[program key]`, then the operators its model's tier draws ([docs/CASTING.md](../docs/CASTING.md)), then the pack's `default_assignment` (`sub-agent`, the program key, `shell`). Install seeds this file, empty, from `skin/data/endfield/operators.example.json` and never overwrites a copy you edited.
