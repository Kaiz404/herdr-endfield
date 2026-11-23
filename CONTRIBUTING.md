# Contributing

Thanks for helping. This file covers the dev loop, the rules every change follows, and how to propose a design.

## Layout of the repo

- `skin/` is a slice of a Herdr home: `layouts/`, `themes/`, `mods/endfield*`, `data/endfield/`. Install is a copy of it, so anything you put here lands in people's Herdr folders. Every path in it must start with `endfield`; `verify.mjs` enforces that.
- `extras/` holds opt-in pieces that live outside Herdr (a statusline, a shell prompt).
- `art-pack/` builds the optional operator art from images a person supplies.
- `scripts/` holds the Node scripts. They have no dependencies.

Read [`skin/mods/endfield/README.md`](skin/mods/endfield/README.md) for how the mod is put together, and [RECIPE.md](RECIPE.md) for what every region looks like and does. Herdr's own reference is `AGENTS.md` in your Herdr home.

## Dev loop

1. Install once, so your previous Endfield files (if any) are backed up: `node scripts/install.mjs`.
2. Edit files under `skin/`.
3. `node scripts/sync.mjs` copies your changes into the Herdr home. Herdr reloads them within a second. `--dry-run` shows the differences without writing.
4. `node scripts/verify.mjs` runs the static checks, then `herdr-app check` on each mod, looks for `*.error` files and reads `herdr-app status`. Herdr must be running.
5. Look at it. `herdr-app shot` saves the window as a PNG. Hover states need a real pointer.

Sync makes the home's Endfield files equal `skin/`. It also deletes files in the Endfield mod folders that are not in the repo. It never touches other files, and it never overwrites your `data/endfield/operators.json`.

To work on a throwaway home instead of your own, set `HERDR_APP_HOME` for every command.

CI runs `node scripts/verify.mjs --static` on Ubuntu and Windows. Run it before you push.

## Design rules

These keep the skin coherent. A change that breaks one needs a reason in its PR.

- **Yellow means "you, here, now".** `#FFFA00` marks only the active tab, the selected space, the focused pane, an agent that needs you, and primary buttons. Nothing decorative is yellow.
- **Status is a word plus a glyph.** Colour alone never carries meaning.
- **Motion only where work happens.** A working agent moves. An idle one is still. Interactions get one short piece of feedback, then stop.
- **Art is accent, never wallpaper.** Nothing sits behind text.
- **One decision, one place.** Colours live in `PALETTE`, agent statuses in `STATUS`, timings in `MOTION`, and who an agent is drawn as in `IDENTITY`, all in `kit.js`. A new status, colour, timing or operator is a new row in a table. It is not a new `if` in a surface, and not a number in a surface.
- **Smallest change that delivers the experience.** Delete what your change makes dead: unused exports, SVGs, helpers, stale comments. Prefer a flat call path; any question about the code should be answerable within three files.
- **Only native motion.** Use `.transition`, `.loop` and `.frames`. Mods have no `setTimeout` or `setInterval`, and a fast `cx.timer.every` repaints the whole window, so timers are for data (a clock, a poll) and never under one second for animation. `verify.mjs` fails on both.
- **The skin never starts an agent.** It shows and focuses agents; it does not spawn them. `verify.mjs` checks this too.
- **Generated art stays generated.** SVGs in `art/` come from `tools/make_art.py`. Edit the script and rerun it.
- **Comments say why, not what.** Keep a comment only when the code can't show the reason.

## What never goes in the repo

`verify.mjs --static` fails on each of these:

- Official art: anything under `art/operators/`, any image other than `preview.png`, and links to the game's asset CDN.
- Personal data: absolute paths with a user name (`C:\Users\<name>`, `/home/<name>`), email addresses, session ids, Herdr ids, transcripts, logs and window shots.

Before you attach a screenshot to an issue or PR, crop out terminal contents and folder names.

## Proposing a design

1. Open an **Idea** issue. Describe the moment it helps and what the person would see. A sketch or mockup helps more than words.
2. For anything larger than one region, mock it up first (an HTML page or an image) and check it against the design rules above.
3. Build it in a PR. Attach a screenshot in light and dark, and update `RECIPE.md` and `CHANGELOG.md` if behaviour changed.

## Commits

Small commits that each leave `verify.mjs` passing. Say what changed for the person using the skin first.
