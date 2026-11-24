# Set up Endfield for Herdr

This guide takes a machine that has Herdr installed to the full Endfield setup. That covers the layout, official operator portraits, sounds, a Claude Code statusline and theme, a PowerShell prompt, and Dispatch and Comms. Each section says what the step changes, how to check it worked, and how to undo it. Only the first section is required. Every later one is optional and stands alone.

Commands are for Windows (PowerShell) first. Where macOS or Linux differs, the guide says so.

- [Check the prerequisites](#check-the-prerequisites)
- [Quick start](#quick-start)
- [1. Install the layout](#1-install-the-layout)
- [2. Fetch the official operator portraits](#2-fetch-the-official-operator-portraits)
- [3. Choose which operator each agent gets](#3-choose-which-operator-each-agent-gets)
- [4. Turn on the Endfield sounds](#4-turn-on-the-endfield-sounds)
- [5. Add the Claude Code statusline](#5-add-the-claude-code-statusline)
- [6. Switch Claude Code to the ANSI theme](#6-switch-claude-code-to-the-ansi-theme)
- [7. Add the PowerShell prompt](#7-add-the-powershell-prompt)
- [8. Send work with Dispatch and read Comms](#8-send-work-with-dispatch-and-read-comms)
- [9. Choose where new spaces open](#9-choose-where-new-spaces-open)
- [Uninstall everything](#uninstall-everything)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

## Check the prerequisites

| Tool | Needed for | Check it | Tested with |
|---|---|---|---|
| Herdr desktop app, with herdr-core | everything | `herdr-app --version` and `hc --version` | herdr-app 0.1.16, hc 0.1.22 |
| Node.js 18 or newer | the install scripts, and the session data the skin shows for Claude Code | `node --version` | Node 22 (CI) |
| Git | cloning and updating this repo | `git --version` | 2.51 |
| Python 3.8 or newer, with Pillow | building the operator portraits | `python --version`, then `python -c "import PIL; print(PIL.__version__)"` | Python 3.13, Pillow 12.3 |
| `bash` and `gawk` | the Claude Code statusline only | `bash --version`, `gawk --version` | Git for Windows |

Install Herdr from [herdr.dev](https://herdr.dev) and start it once. The first start creates the Herdr home, the folder the skin installs into:

- Windows: `%USERPROFILE%\.config\herdr-app` (in PowerShell, `$HOME\.config\herdr-app`)
- macOS and Linux: `~/.config/herdr-app`

If you set `HERDR_APP_HOME`, every script in this repo uses that folder instead.

Install Node.js from [nodejs.org](https://nodejs.org). Without Node the layout still works, but the model, context and sub-agent fields for Claude Code read `—`.

On macOS and Linux, the Python command is often `python3`. Use it wherever this guide says `python`. To install Pillow:

```sh
python -m pip install Pillow
```

On macOS, the statusline also needs GNU awk: `brew install gawk`. Git for Windows already includes `bash` and `gawk`.

## Quick start

These five commands install the layout, show it, and fetch the operator portraits:

```sh
git clone https://github.com/Kaiz404/herdr-endfield
cd herdr-endfield
node scripts/install.mjs
herdr-app do layout.switch --name endfield
node scripts/fetch-operators.mjs --accept
```

The last command downloads official game art onto your machine. Read [the fan-content notice](#2-fetch-the-official-operator-portraits) before you run it, or leave it out. The skin works without it.

The rest of this guide explains each step and adds the optional pieces.

## 1. Install the layout

**What it changes.** `install.mjs` copies the `skin/` folder into your Herdr home. That is the `endfield` layout, its light and night themes, the `endfield` mod, and two settings files in `data/endfield/`. It writes only paths whose names start with `endfield`. If an Endfield file is already there and the installer did not write it, the installer first copies it to `.endfield-install/backup/`.

1. Clone the repo and run the installer:

   ```sh
   git clone https://github.com/Kaiz404/herdr-endfield
   cd herdr-endfield
   node scripts/install.mjs
   ```

   The installer lists what it added, then a line that starts with `Done.` A second run prints `Nothing to do: the skin is already installed.`

2. Show the layout. Press `ctrl-shift-l` in Herdr until Endfield shows, or run:

   ```sh
   herdr-app do layout.switch --name endfield
   ```

**Check it worked.** Run `herdr-app status`. The output shows `"layout": "endfield"` and `"errors": []`. From the repo folder, `node scripts/verify.mjs` runs every check against the running Herdr and ends with `PASS`.

To try the layout with no real agents, start a demo fleet of stand-in processes. They only report a status, and they live in spaces named `ef-demo-*`:

```sh
node scripts/demo-fleet.mjs up --agents 16
node scripts/demo-fleet.mjs down
```

**Update.** Run `git pull`, then `node scripts/install.mjs` again. The installer never overwrites `data/endfield/operators.json` or `data/endfield/settings.json` once they exist. It deletes the Endfield folders that earlier versions installed and this one no longer has, such as `mods/endfield-transcript`. A transcript pane left open from before the update can show an error. Click a sub-agent in Squads to replace it, or close it.

**Undo.** See [Uninstall everything](#uninstall-everything).

## 2. Fetch the official operator portraits

> **Fan content.** herdr-endfield is an unofficial fan project. It is not affiliated with, endorsed by or sponsored by Hypergryph, Gryphline or the Herdr project. The character art is © Hypergryph / Gryphline. The script below downloads it from the official site onto your computer, for your personal, local use only. Do not redistribute the files: no commits, forks, packs, mods, uploads or screenshot sets. Read the official [fan content guidelines](https://endfield.gryphline.com/en-us/news/4497).

**What it changes.** `fetch-operators.mjs` downloads the official renders of 36 operators (37 files: the Endministrator has a second, male render), checks each one against a pinned sha256, and builds six image files per operator. It writes them, with `manifest.json` and `CREDITS.md`, into `art/operators/` in your Herdr home. It writes nothing else. With the pack in place, each agent's chip in the sidebar, the pane name plates, Dispatch, Comms and the Report show the operator's round portrait. The session panel shows the bust, and the needs-input cut-in shows a yellow-and-ink version of it.

1. To see the operators, their class, element and rarity, and the program defaults, run:

   ```sh
   node scripts/fetch-operators.mjs --list
   ```

   Agents whose model the skin knows (Claude Code agents and their sub-agents) are cast by model: a stronger model draws a stronger operator, and siblings draw different ones. See [Casting](CASTING.md). An agent with no known model gets its program's default: Claude Code gets Perlica, Codex Laevatain, Gemini Last Rite, OpenCode Chen Qianyu, Cursor Snowshine, and any other program Ember.

2. To see what a run would download, run `node scripts/fetch-operators.mjs --dry-run`. It writes nothing. A full run downloads about 30 MB. Kay and Mimino have only their small roster card on the official site so far, so their busts are softer than the others.

3. Download and build the pack:

   ```sh
   node scripts/fetch-operators.mjs --accept
   ```

   Without `--accept`, the script prints the notice and asks `Download for personal use on this machine? [y/N]`. To fetch only some operators, add `--only perlica,ember`.

**Check it worked.** The script ends with `Done. 37 operator(s) built into <folder>.` A second run prints `Nothing to do: every operator is built and up to date.` `node scripts/verify.mjs` prints `art pack: 37 operators, all files present`. The sidebar shows portraits within 30 seconds, because the skin rereads the pack every 30 seconds.

**Undo.** Delete the `art/operators` folder from your Herdr home. Every surface goes back to the program's own tile.

```powershell
Remove-Item -Recurse -Force "$HOME\.config\herdr-app\art\operators"
```

On macOS and Linux:

```sh
rm -rf ~/.config/herdr-app/art/operators
```

To build a pack from your own images instead, see [`art-pack/README.md`](../art-pack/README.md).

## 3. Choose which operator each agent gets

**What it changes.** `data/endfield/operators.json` in your Herdr home overrides casting by model and the pack's default assignment. The installer creates it from `skin/data/endfield/operators.example.json`, which is empty, so the model decides until you add entries. The installer never overwrites a file you edited. It replaces a copy that still matches the seed of earlier versions, which pinned every program, so that casting by model shows.

1. Open the file:

   ```powershell
   notepad "$HOME\.config\herdr-app\data\endfield\operators.json"
   ```

2. Edit it. For example:

   ```json
   {
     "programs": { "codex": null, "shell": "ember" },
     "terminals": { "t3": "laevatain" },
     "spares": ["laevatain"]
   }
   ```

   - `programs` maps a program key to an operator slug, and wins over the model. The keys are `claude`, `codex`, `gemini`, `opencode` and `cursor`. `sub-agent` is for sub-agents, and `shell` is for any program with no entry of its own. For example, `"claude": "perlica"` draws every Claude Code agent as Perlica whatever its model.
   - `terminals` gives one terminal its own operator, and wins over `programs`. A terminal's address is the `T3` on its pane's name plate, written in lower case. `herdr-app ls` also lists the addresses.
   - `spares` lists operators that an agent takes once every operator in its pool is taken, before callsigns get numbers. Without spares, the next agent is numbered, for example `PERLICA·2`.
   - `null`, or a slug that is not in the pack, means no operator. That agent keeps its program tile.

3. Save the file.

**Check it worked.** The sidebar redraws within 30 seconds. If nothing changes, see [Art does not appear](#art-does-not-appear).

**Undo.** Delete the file and run `node scripts/install.mjs`. The installer creates it again from the example.

## 4. Turn on the Endfield sounds

The skin has three original sounds in `mods/endfield/sounds/`. `needs-input.mp3` plays when an agent needs input, `claimed.mp3` plays when an agent finishes, and `tick.mp3` is a quiet click when Dispatch sends or a panel opens.

Herdr plays its own sounds for the same two events. The skin plays its two alerts only while Herdr's sounds are off, so one event never sounds twice. Choose one of these ways to hear the Endfield sounds.

**Option A: Herdr plays the Endfield files.** Herdr keeps deciding when to play. Open `settings.json` in your Herdr home (`notepad "$HOME\.config\herdr-app\settings.json"`) and set `sounds` to:

```json
"sounds": { "enabled": true, "blocked": "mods/endfield/sounds/needs-input.mp3", "done": "mods/endfield/sounds/claimed.mp3" }
```

**Option B: the skin plays them.** Set Herdr's sounds off:

```json
"sounds": { "enabled": false }
```

The skin then plays its alerts when it shows the needs-input cut-in or the Finished slip.

The skin's own switches are in `data/endfield/settings.json`. `sounds.alerts` (default `true`) turns the skin's alerts on or off. `sounds.ticks` (default `false`) turns the quiet clicks on or off.

**Check it worked.** Herdr applies `settings.json` at once. With option A, the Play buttons in Herdr's **Settings > Alerts** play the Endfield files. If `settings.json` is invalid, Herdr keeps the last good version and writes `settings.error` next to it.

**Undo.** Put `"sounds": { "enabled": true }` back in `settings.json`.

## 5. Add the Claude Code statusline

**What it changes.** Claude Code shows one line under its prompt with the folder, branch, model, effort, a context gauge, input tokens and your usage limits:

```
// herdr-endfield  main · Opus · ctx ▰▰▰▱▱▱▱▱▱▱ 31% · in 1.2m · 5h 40% 2h10m left
```

The script also writes a small file per session to `data/endfield/sessions/<session id>.json` in your Herdr home. With these files, the skin matches each agent row to its exact Claude Code session. Without them, it guesses from the newest transcript in the agent's folder and marks the session panel `≈`. The script sends nothing anywhere.

1. Copy the script. On Windows, run this in Git Bash. On macOS and Linux, run it in your shell.

   ```sh
   cp extras/claude-statusline/statusline-endfield.sh ~/.claude/statusline-endfield.sh
   ```

2. Open `~/.claude/settings.json`. If it already has a `statusLine` entry, copy it somewhere so you can put it back. Then set:

   ```json
   "statusLine": { "type": "command", "command": "bash ~/.claude/statusline-endfield.sh" }
   ```

3. Start a new Claude Code session in a Herdr terminal.

If you set `HERDR_APP_HOME`, change `dir=` at the top of the script to the same folder.

**Check it worked.** The line shows under Claude Code's prompt. A file appears in `data/endfield/sessions/`, and the session panel for that agent no longer shows `≈`.

**Undo.** Remove the `statusLine` entry from `~/.claude/settings.json`, or put your old one back. Delete `~/.claude/statusline-endfield.sh`. To remove the session files too, delete `data/endfield/sessions/` from your Herdr home.

The full notes are in [`extras/claude-statusline/README.md`](../extras/claude-statusline/README.md).

## 6. Switch Claude Code to the ANSI theme

**What it changes.** Claude Code draws with the terminal's 16 ANSI colours instead of its own. The Endfield themes set those 16 colours, so Claude Code's text, diffs and highlights match the skin. Endfield's terminals are ink in both the light and the night appearance, so use the dark variant.

1. In a Claude Code session, type `/theme`.
2. Select **Dark mode (ANSI colors only)**.

Claude Code stores the choice as the theme `dark-ansi`.

**Check it worked.** Claude Code's colours change to the Endfield terminal palette: muted reds, greens and blues on the ink card.

**Undo.** Type `/theme` again and select your previous theme.

## 7. Add the PowerShell prompt

**What it changes.** A one-line prompt for PowerShell 5.1 and 7, `// folder  branch ›`. The `›` turns red after a failed command. The prompt also tells Herdr which folder you are in, so new tabs and splits open there. It replaces the `prompt` function and adds one helper, `Get-EfBranch`.

1. Copy the script next to your profile:

   ```powershell
   New-Item -ItemType Directory -Force (Split-Path $PROFILE) | Out-Null
   Copy-Item extras\powershell-prompt\prompt.ps1 (Join-Path (Split-Path $PROFILE) endfield-prompt.ps1)
   ```

2. Open your profile with `notepad $PROFILE`, and add this line:

   ```powershell
   . (Join-Path (Split-Path $PROFILE) endfield-prompt.ps1)
   ```

3. Open a new terminal.

If PowerShell says that running scripts is disabled, your execution policy blocks the profile. Run `Get-ExecutionPolicy`. If it prints `Restricted`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then open a new terminal.

**Check it worked.** The prompt reads `// herdr-endfield  main ›` inside the repo. The branch glyph needs a font with Powerline symbols. JetBrains Mono, which the skin uses, has them.

**Undo.** Delete the line from `$PROFILE`, delete `endfield-prompt.ps1`, and open a new terminal.

## 8. Send work with Dispatch and read Comms

Dispatch and Comms use herdr-core's `hc` command, which Herdr installs. The skin never starts an agent by itself. Dispatch runs one `hc` command, when you click **Dispatch**.

### Send a task with Dispatch

1. Open Dispatch. Click the `+` on a squad header, or click **Dispatch** in an agent's session panel. With no agents running, the sidebar shows a **Dispatch** pill.
2. Choose **Send to agent** to type into a running agent, or **New agent** to start one.
3. For **Send to agent**, pick the target. Then pick the delivery:
   - **Only if idle** sends only if the agent is waiting at its prompt: idle, or finished its turn. While it is generating, needs input or stopped on an error, **Dispatch** is disabled and the dialog says why. hc has no queue.
   - **Now** sends at once. hc waits for a draft you are typing in that terminal, for up to 60 seconds.
   - **Now, wait for reply** sends at once, then waits for the turn to end and logs the agent's last screen line.
4. For **New agent**, pick the program, the squad (click it for the next space) and the parent. Then pick the lifetime: **Ends with parent**, **Outlives parent** or **No parent**.
5. Type the task.
6. Read the command at the foot of the dialog. It is the exact `hc` command that Dispatch runs, quoted for your shell.
7. Click **Dispatch**.

Dispatch never sends a blocked agent a task. If hc refuses the order before it types anything, fix the cause and click **Dispatch** again. After hc accepts an order, the button becomes **Close**, so one order never goes twice.

### Read Comms

Click the **Comms** pill at the top right. Comms opens as a pane beside the focused one. Its tabs are **All**, **You** and **Reports**.

- **You** shows every order you sent with Dispatch, and the screen lines logged after **Now, wait for reply**. They come from the log in `data/endfield/comms.jsonl`.
- **Reports** shows `<hc from="...">` messages that agents received from other agents. The skin reads them off the agents' screens, so each one is marked Unverified.

The **Report** pill, next to Comms, swaps the work area for one screen with every squad. Click a column heading (Agent, Rate, Reserves, Turn or Status) to sort by it.

**Undo.** Nothing to undo. To clear the log, delete `data/endfield/comms.jsonl`.

## 9. Choose where new spaces open

**What it does.** Every **New space** control in the Endfield sidebar opens the new space in your home base, a workspace folder, instead of your home folder. An agent treats the folder it starts in as its project. Started in your home folder, it can read and change everything there, such as `.ssh`, `.aws` and other programs' settings. Started in the home base, it works inside that folder.

The Spaces header shows the base, for example `BASE · PROJECTS`. Hover the `+` to see the full path.

- If you set nothing, the base is `Projects` in your home folder. If you have no `Projects` folder, the base is your home folder.
- If the folder you set does not exist, new spaces open in your home folder, and the header shows the base in red with `NOT FOUND`.
- A space on another machine opens in that machine's home. The base applies only to this computer.

**Change it.**

1. Open `data/endfield/settings.json` in your Herdr home:

   ```powershell
   notepad "$HOME\.config\herdr-app\data\endfield\settings.json"
   ```

2. Add `homeBase` with a folder, next to the other settings in the file. `~` means your home folder:

   ```json
   "homeBase": "~/Projects"
   ```

   On Windows you can also write a full path, such as `"D:\\work"`. Write each backslash twice in JSON.

3. Save the file. The header changes within 30 seconds.

To go back to the default, set `"homeBase": null` or remove the line.

**Bind a key.** The installer does not change your keys. To open a space in the home base with a key, add a section to `keys.json` in your Herdr home. This example uses `alt-shift-n`:

```json
"layout:endfield": { "alt-shift-n": "endfield.newSpace" }
```

The section applies only while Endfield shows. Choose a key that `keys.json` does not already use. Herdr's own `ctrl-shift-n` still opens a space in the folder Herdr chooses. To make `ctrl-shift-n` use the home base in Endfield, bind `ctrl-shift-n` in the same section instead.

**Check it worked.** Click the `+` in the Spaces header. In a terminal, `herdr-app ls` lists the new space with the base as its `folder`.

**Undo.** Set `"homeBase"` to `"~"`, so new spaces open in your home folder again. Remove the `keys.json` line if you added it.

## Uninstall everything

1. Switch Herdr back to its own layout:

   ```sh
   herdr-app do layout.switch --name main
   ```

2. From the repo folder, remove the skin:

   ```sh
   node scripts/uninstall.mjs
   ```

   The script removes what the installer added and restores anything it backed up. It also deletes the files the skin wrote while it ran: the Comms log and the session cache. It keeps `data/endfield/operators.json` and `data/endfield/settings.json` if you edited them, and the statusline's `sessions/` folder. If Herdr still shows Endfield, the script stops and says so. `--force` skips that check.

3. Delete what the script leaves on purpose, if you want it gone. In PowerShell:

   ```powershell
   Remove-Item -Recurse -Force "$HOME\.config\herdr-app\art\operators", "$HOME\.config\herdr-app\data\endfield"
   ```

   On macOS and Linux:

   ```sh
   rm -rf ~/.config/herdr-app/art/operators ~/.config/herdr-app/data/endfield
   ```

4. Undo the optional pieces you added:
   - For sounds, put `"sounds": { "enabled": true }` back in Herdr's `settings.json`.
   - For the statusline, remove the `statusLine` entry from `~/.claude/settings.json`, and delete `~/.claude/statusline-endfield.sh`.
   - For the Claude Code theme, select your previous theme with `/theme`.
   - For the PowerShell prompt, delete the line from `$PROFILE`, and delete `endfield-prompt.ps1`.

## Troubleshooting

### The layout does not show

- Run `herdr-app status`. If `layout` is not `endfield`, run `herdr-app do layout.switch --name endfield`.
- If `errors` is not empty, it names the file or mod that failed. See [`.error` files](#herdr-wrote-an-error-file).
- If Herdr is stuck or blank, press `ctrl-alt-shift-escape`. Nothing can rebind it. It sets the shown layout and `keys.json` aside as `*.reset-<time>` files, and goes back to Herdr's `main` layout. Then run `node scripts/install.mjs` to put the Endfield layout back, and switch to it again.
- If the installer says `No Herdr home at <folder>`, start Herdr once, or set `HERDR_APP_HOME` to the folder you use.

### Herdr wrote an error file

When a file is invalid, Herdr keeps the last good version and writes the reason to a `.error` file, for example `layout.error` or `settings.error`. To find them, run this in PowerShell:

```powershell
Get-ChildItem "$HOME\.config\herdr-app" -Recurse -Filter *.error
```

On macOS and Linux:

```sh
find ~/.config/herdr-app -name '*.error'
```

Read the file, fix the JSON it names, and save. Herdr applies the fix at once. `node scripts/verify.mjs` also lists every `.error` file and runs `herdr-app check` on each Endfield mod.

### Art does not appear

1. Run `node scripts/verify.mjs`. It must print `art pack: N operators, all files present`, where N is the number you fetched (37 for the whole catalogue). If it prints `no art pack installed`, run `node scripts/fetch-operators.mjs --accept`.
2. If you fetched the pack before version 0.2.0, the session panel has no bust. Run `node scripts/fetch-operators.mjs --accept` again. It builds the missing `bust-480.png`. An operator with any of its six files missing shows as its program tile.
3. Check that `data/endfield/operators.json` is valid JSON. If it is not, the skin ignores it without an error. To check it:

   ```sh
   node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); console.log('ok')" ~/.config/herdr-app/data/endfield/operators.json
   ```

   In PowerShell, write the path as `"$HOME\.config\herdr-app\data\endfield\operators.json"`.
4. Check every slug in `operators.json` against `node scripts/fetch-operators.mjs --list`. An unknown slug, or `null`, gives the program tile.
5. Wait 30 seconds. The skin rereads the pack and `operators.json` every 30 seconds.

### The download fails with a hash mismatch

The script prints `the official site now serves a different file than the catalogue expects` and installs nothing. The official site changed that image, and the pinned sha256 in `art-pack/operators.json` no longer matches.

1. Run `git pull` and try again. A newer catalogue may already have the new hash.
2. If it still fails, fetch the other operators. Leave out the one that failed, for example `node scripts/fetch-operators.mjs --accept --only perlica,ember,ardelia`.
3. Open an issue that names the operator, so the catalogue gets an update.

If the script reports `HTTP 404` or another HTTP status, the file moved. Follow the same steps.

### Python or Pillow is missing

The script checks for both before it downloads anything, and stops with a message.

- If it says `Python 3.8 or newer is needed`, install Python from [python.org](https://www.python.org/downloads/). On Windows, select **Add python.exe to PATH** in the installer. On Windows the script tries `python`, then `py -3`, then `python3`. On macOS and Linux it tries `python3`, then `python`.
- If it says `Pillow is needed`, run the `-m pip install Pillow` command that it prints. That command uses the same Python the script found.

### A command with JSON fails in Windows PowerShell

Windows PowerShell 5.1 removes the double quotes inside an argument before it passes the argument to a program. So `herdr-app do layout.clone '{"name":"main","as":"my-layout"}'` reaches Herdr as `{name:main,as:my-layout}`, and Herdr rejects it. Escape each inner quote with a backslash:

```powershell
herdr-app do layout.clone '{\"name\":\"main\",\"as\":\"my-layout\"}'
```

The commands in this guide use flags such as `--name endfield`, so they need no escaping. The command that Dispatch shows is already quoted for Windows PowerShell 5.1.

### Every alert sounds twice, or not at all

The skin plays its alerts only when Herdr's `sounds.enabled` is `false`. Herdr plays its own only when it is `true`. So the two never play for the same event.

- If you hear no Endfield sound with Herdr's sounds off, check that `sounds.alerts` is not `false` in `data/endfield/settings.json`.
- If you hear no sound with Herdr's sounds on, check the `blocked` and `done` paths in `settings.json`. They are relative to the Herdr home. Look for a `settings.error` file.
- If you hear two sounds for one event, the second one does not come from Herdr or the skin. Check for another notifier, such as a hook in Claude Code's settings.

### The session panel shows `—` or `≈`

`—` means the skin has no data for that field. The skin reads Claude Code sessions only, and it needs `node` on the `PATH` that Herdr sees. Other agents show `—` for model and context. `≈` means the skin matched the agent to the newest transcript in its folder. Two sessions in one folder can get the same match. [Add the statusline](#5-add-the-claude-code-statusline) to make the match exact.

## FAQ

### Why are there no images in the repo?

The operator art is © Hypergryph / Gryphline. The [fan content guidelines](https://endfield.gryphline.com/en-us/news/4497) prohibit works that copy official material without clear originality. So the repo holds only a catalogue: URLs on the official site, a sha256 for each file, and crop settings. You download and build the art on your own machine. `node scripts/verify.mjs --static` runs in CI and fails on any image other than `preview.png`, on any file under `art/operators/`, and on links to the official CDN outside the catalogue. `preview.png` is a schematic drawn from the layout's settings preview, not a screenshot.

### Does it need root or admin rights, or access to my home folder?

No. The installer and the skin run as you, with no administrator or root rights. They write only inside the Herdr home. New spaces open in your home base, not your home folder, so the agents you start there work in that folder.

### Does it change my Claude Code settings?

No. The installer and the skin write only inside the Herdr home. The skin reads Claude Code transcripts in `~/.claude/projects/` to show the model, context, tool calls and sub-agents, and it never writes there. Two steps in this guide touch Claude Code, and you do both by hand: the `statusLine` entry in `~/.claude/settings.json`, and the `/theme` choice.

### What data does it keep on my machine?

Everything stays in your Herdr home. Nothing is sent anywhere.

- `data/endfield/comms.jsonl` is the Comms log, one line per Dispatch. Each line holds the time, the target terminal, the hc command and the text you typed. A secret you type into a task is stored here in plain text. With **Now, wait for reply**, the line also holds the last line on the agent's screen after its turn. The skin drops the oldest lines to keep the file under 512 KB. Uninstall deletes it.
- `data/endfield/probe-cache.json` and `data/endfield/probe-agents.json` hold a summary of each Claude Code transcript the skin read: the model, token counts, the last tool with its file or command, and the first line of the prompt. The cache lets each poll read only new lines. Entries for files that are gone, or unchanged for a week, are dropped. Uninstall deletes them.
- `data/endfield/operators.json` and `data/endfield/settings.json` are your settings.
- `data/endfield/sessions/` holds the statusline's files, if you added the statusline.
- `art/operators/` holds the operator art, if you fetched it.
