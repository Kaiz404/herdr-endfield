# Set up Endfield for Herdr

This guide takes a machine that has Herdr installed to the full Endfield setup. That covers the layout, official operator portraits, sounds, a Claude Code statusline and theme, a PowerShell prompt, Dispatch and Comms, the home base, and managing chats and squads. Each section says what the step changes, how to check it worked, and how to undo it. Only the first section is required. Every later one is optional and stands alone.

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
- [10. Manage chats and squads](#10-manage-chats-and-squads)
- [11. Run agents on several Claude accounts](#11-run-agents-on-several-claude-accounts)
- [Update to a new version](#update-to-a-new-version)
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

**Update.** See [Update to a new version](#update-to-a-new-version).

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

If you fetched the pack before version 0.3.0, it has 8 operators. Run `node scripts/fetch-operators.mjs --accept` again to add the other 29 (28 operators and a second Endministrator card). It skips the operators you already have. Casting by model uses only the operators your pack has, so with the old pack most agents draw the same few operators.

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

**What it changes.** By default, an agent's model decides its operator. [Casting](CASTING.md) explains the rule and lists the operators in each tier. `data/endfield/operators.json` in your Herdr home overrides casting by model and the pack's default assignment. The installer creates it from `skin/data/endfield/operators.example.json`, which is empty, so the model decides until you add entries. The installer never overwrites a file you edited. It replaces a copy that still matches the seed of earlier versions, which pinned every program, so that casting by model shows.

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
   - `spares` lists operators that an agent takes once every operator in its pool is taken, before callsigns get numbers. Without spares, the next agent is numbered, for example `PERLICA-2`.
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

### Update the statusline

**What it changes.** Since version 0.3.0, the statusline also writes your 5-hour and 7-day usage limits (`rate_limits`) and the effort level (`effort`) into each session's file. The HUD footer reads the usage limits from them, and the session panel shows a changed effort at once. An older copy of the script writes neither, so the footer leaves out the usage limits. The installer does not touch `~/.claude/`, so copy the script again after you update.

1. From the repo folder, copy the script again. On Windows, run this in Git Bash:

   ```sh
   cp extras/claude-statusline/statusline-endfield.sh ~/.claude/statusline-endfield.sh
   ```

2. Each running Claude Code session uses the new copy at its next statusline update. You do not need to restart it.

**Check it worked.** The newest file in `data/endfield/sessions/` has a `"rate_limits"` and an `"effort"` field. `rate_limits` is `null` when Claude Code does not report your limits. In PowerShell:

```powershell
Get-Content (Get-ChildItem "$HOME\.config\herdr-app\data\endfield\sessions" | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
```

When the field has numbers, the HUD footer shows `5-HOUR` and `WEEKLY` blocks with the percent used and the time to reset.

**Undo.** The older script still works with the skin. The footer then leaves out the usage limits. To remove the statusline completely, follow the undo step above.

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

The Spaces header shows the base, for example `BASE` and `PROJECTS` side by side. Hover the `+` to see the full path.

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

**Fold Spaces.** Click anywhere on the Spaces header, like a squad's, to fold Spaces to its header, so Squads gets the height. The chevron `▾` shows the state, the header lights on hover, and the tooltip says "Click to fold". The `+` stays and still opens a new space without folding. Click the header again (the chevron is then `▸`) to unfold Spaces to the size it had. Endfield remembers the fold when Herdr restarts. On the narrow sidebar rail, Spaces always shows its list. To fold and unfold with a key, add `endfield.toggleSpaces` to the same section. This example uses `alt-shift-s`:

```json
"layout:endfield": { "alt-shift-n": "endfield.newSpace", "alt-shift-s": "endfield.toggleSpaces" }
```

**Check it worked.** Click the `+` in the Spaces header. In a terminal, `herdr-app ls` lists the new space with the base as its `folder`.

**Undo.** Set `"homeBase"` to `"~"`, so new spaces open in your home folder again. Remove the `keys.json` line if you added it.

## 10. Manage chats and squads

The session panel and a squad header's right-click menu change a chat or a squad. Each change that types into an agent opens a dialog first. The dialog shows the exact command and runs it once, when you click **Confirm**.

### Change a chat from its session panel

The **Chat** row of an agent's session panel shows its model, effort and mode, and has one button per action. Claude Code has **Rename**, **Plan**, **Next mode**, **Model**, **Effort** and **Archive**. Codex has **Rename**, **Model** and **Archive**. Cursor has **Rename**, **Plan** and **Archive**.

1. Hover the agent in Squads, or right-click it to keep the panel open until you click outside it or press Esc. Then click an action. The panel closes and a dialog opens. Nothing has run yet.
2. Fill in what the dialog asks for, such as the new name or the model.
3. Read the **Needs** and **Does** lines and the command at the foot of the dialog. The command is exactly what runs.
4. Click **Confirm** (**Archive** for Archive).

Every action that types into the agent waits until it is idle. If the agent is working or needs input, the button is dimmed and says why. **Finished** counts as not idle: Peek or Focus the agent first. The check uses Herdr's own status, so an agent that reads **Waiting** while Herdr calls it idle takes typed actions. **Rename** always renames the tab in Herdr; tick its box to also name the Claude Code session with `/rename`.

`/model` and `/effort` also change your Claude Code defaults for new sessions, as if you had typed them. After a change the dialog shows the new model, effort or mode when the skin can read it. For Codex and Cursor it says **Sent**.

**Next mode** presses Shift+Tab with `hc keys`, which has no idle check of its own. The dialog checks that the agent is idle just before the press. If a permission prompt opens in between, the key press goes to that prompt and can answer it.

**Check it worked.** The dialog shows the new name, model, effort or mode, or **Sent**. The **You** tab in Comms lists every action that typed into the agent; a Herdr-only rename (without the `/rename` box) is not logged there.

**Undo.** Run the same action again with the old value. Rename it back, pick the old model or effort, or press **Next mode** until the old mode shows. `/model` and `/effort` also changed your default for new sessions, and the same action puts it back.

### Archive a chat and resume it

**Archive** first writes the chat to the archived list in `data/endfield/archive.json`, then ends the agent with `/exit` (`/quit` for Codex and Cursor). The transcript stays. The dialog waits until Herdr shows the program has ended, and then says **Archived**. If the program is still running after 20 seconds, the dialog says **Still running** and the agent stays in Squads. A shell left behind in its terminal is kept out of Squads until another agent starts there.

To bring one back, open the **Report**, click **Archived**, and click **Resume** on the chat. Each chat shows where it opens and the exact command Resume runs, such as `claude --resume <session id>`. If the chat's space still exists, a new tab opens there. If the space was closed, a new space opens with the squad's old name, and the squad's other chats resume into that same space. Either way the chat runs in its own folder, because Claude Code finds a session by the folder it ran in. Only a chat with no known folder opens in the home base. The list warns when the command may reopen a different chat. This happens for Codex and Cursor, which resume their newest chat, for a Claude Code chat whose session id was matched by its folder, and for one with no session id at all, which resumes with `claude --continue`. **Resume** is dimmed while the chat is still running.

**Check it worked.** After **Archive**, the dialog says **Archived**, the agent leaves Squads, and **Report > Archived** lists the chat. After **Resume**, a new tab runs the command and the chat leaves the list.

**Undo.** **Resume** undoes **Archive**. To forget an archived chat without resuming it, delete its entry from `data/endfield/archive.json`. Its transcript stays in `~/.claude/projects/`.

### Archive or close a whole squad

Right-click a squad header. **Archive squad** and **Close squad** each open a dialog that lists every terminal that ends with the squad's space, in three groups: agents (including any you pinned), sub-agents, and shells and servers. Shells include ones an archived chat left behind, which Squads hides. The dialog also shows every command it runs. Nothing runs until you click the dialog's primary button. **Pinned** has neither item, because it is not a space.

**Archive squad** archives every chat in the space the way **Archive** does, one at a time, parents before their sub-agents. It refuses to start if any agent is not idle or is a program nothing resumes, and names each one and why. A plain shell or a server never stops it. Nothing resumes a shell, so the dialog lists it under **Ends**, and confirming closes it with the space. Every end command goes with `hc send --if idle`. Each row shows its progress: **Typing**, **Ending**, then **Archived** once Herdr shows the program stopped. A single list read without the terminal is not enough; it takes a second read in a row. When every chat has ended, the squad's space closes with `space.close`. That also ends the shells the chats leave behind and the shells and servers the dialog listed.

If an agent's status changes before its turn, hc refuses the send and nothing is typed. Its record is removed, the rest are not sent, and the space stays open. If a chat is still running after 20 seconds, it stays in Squads, its record stays in **Archived** with **Resume** dimmed, and the space stays open. Open the menu again to archive what is left.

**Close squad** closes the space at once. Herdr ends every terminal in it: agents, their sub-agents and shells. It does not keep or park them. A running agent is killed without `/exit` and without an archive record, so **Archived** can't resume it, and a turn in progress is lost. The dialog's red **Kills** line counts and names everything that ends, agents, sub-agents, and shells and servers, and the dialog offers **Archive squad instead**.

Right before `space.close`, both actions read the space again. If anything is there that the dialog didn't list, such as a tab opened since or a server an agent started, the space stays open and the dialog says **Kept** and names it. Open the menu again to see the new list.

**Check it worked.** After **Archive squad**, every row says **Archived**, the dialog says **Closed**, the squad leaves Squads and Spaces, and **Report > Archived** lists each chat. After **Close squad**, the squad leaves Squads and Spaces.

**Undo.** Resume each chat from **Report > Archived**. The first one makes a space with the squad's name, and the rest join it. Close squad has no undo.

### Arrange squads and chats in Squads

A squad is a Herdr space with agents in it. Its name and its place in the list are the space's, so the Spaces list changes with it.

- **Reorder a squad.** Drag its header up or down. The squad lifts and follows the pointer, and the other squads slide aside to open a gap where it will land. Release to drop it in the gap. To cancel, press Esc or move the pointer out of the list, and the squads slide back. A squad stays among the squads on its machine and below **Pinned**. A worktree space stays under its main checkout, because the Spaces list moves it back there.
- **Reorder a chat in its squad.** Click the sort pill and choose **Tab order**. Then drag an agent row up or down within its squad. It moves the chat's tab in its space, so the tab strip shows the new order too. The chat's sub-agents move with it. In **Priority** order, chats don't reorder, because the sort decides their order. Sub-agent rows and **+N earlier** don't drag.
- **Move a chat to another squad.** Drag its agent row onto another squad's header, in either order. Hold it over the header for a moment: the header lifts and the plate you carry says **Move to** and the squad, or why it can't. A header that hasn't lifted takes no drop, so a slip of the hand moves nothing. Release, and the chat joins that squad's shown tab as a split, right of its focused pane, and Herdr shows it there. The program keeps running and nothing is typed into it, so you can move an agent that is working or waiting on a question. Only that chat moves: other panes in its old tab stay. A linked chat stays in its squad until you unlink it, and a chat can't move to another machine.
- **Dock a chat beside the pane you're looking at.** Drag its agent row out of Squads, past the sidebar's right edge, into the work area. Zones appear over it: drop on the right or the centre to split it right of the focused pane, on the bottom to put it below, and on the left or the top to put it there. The zone under the pointer shows where it lands, edged in yellow. The chat keeps running. For a chat already in that tab, every zone says **Trade places with the focused pane** and does that, because Herdr doesn't report which side of the pane it is on now. Press Esc, click, or drop outside the work area, to cancel. A drag you leave for 10 seconds cancels itself.
- **Reorder without dragging.** Right-click the header, then click **Move up** or **Move down**. Empty spaces have no squad, so a squad moves past them.
- **Rename a squad.** Double-click its name, or right-click it and click **Rename squad**. Type the name and press Enter. Press Esc, or click somewhere else, to keep the old name.
- **Archive or close a squad.** Right-click the header, then click **Archive squad** or **Close squad**. See [Archive or close a whole squad](#archive-or-close-a-whole-squad).
- **Act on a chat.** Right-click an agent row. Its session panel opens and stays open. **Rename**, **Archive** and the other chat actions are in its **Chat** row, and **Pin** (or **Unpin**) is in its footer. See [Change a chat from its session panel](#change-a-chat-from-its-session-panel).
- **Look at a sub-agent.** A Claude Code sub-agent's row is named by its type, such as `EXPLORE` or `POTETO-AGENT`. The running ones come first, then **+N earlier**, which lists the finished ones under it; **Show less** stays right under the running ones. Hover or right-click the row. Its panel names its operator, such as `TYPHOEUS`, then shows its status, model, effort, run time, context, last action and background tasks. **Open transcript** opens its transcript pane. **Follow-up** opens the pane with the follow-up box ready, and the text goes through its parent. A sub-agent has no Rename, Pin or Archive, because it is not a terminal.

- **Link an agent as a helper of another.** In **Priority** order, drag a Claude Code agent's row onto another Claude Code agent's row. The row under the pointer gets a border, and the plate you carry says whether a drop links there or why it can't. Release, and a dialog titled **Link** *helper* **under** *lead* says that both agents get a short note about each other so they can coordinate. Click **Show note** to read the two notes first, then click **Link**. The skin saves the link in `data/endfield/links.json` at once, so Squads shows the helper under its lead, marked `linked`, even if either agent is working. Then it types each note with `hc send --if idle`, but only into an agent that is idle at that moment. It never types into a working agent. Each note names the other agent by its folder and task and asks the two to coordinate through Claude Code's [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging.md) (`ListAgents` and `SendMessage`, with `notify_when_idle` to hear when the other finishes), and to agree who owns which files or work in separate git worktrees. The dialog shows one line with the result and closes. If an agent was busy, the line names it, and that agent's session panel shows **Send note**. Click it when the agent is idle, then click **Send**, and the skin types only that agent's note. The two must be in the same squad: to link agents from two squads, first move one into the other's squad. To undo, right-click the helper's row and click **Unlink** in its session panel. Nothing is typed. A link also ends when either agent's terminal ends, or when a new session or another program starts in either one. A link made in another Herdr window shows within a few seconds, and an agent that already has a lead can't be given a second one: unlink it first.

Messaging needs Claude Code 2.1.234 or later on Windows (2.1.224 on macOS and Linux), and `notify_when_idle` needs 2.1.236 in both sessions. A session started with `--bare` can't receive messages. A session whose `crossSessionInbound` setting is `refuse` drops them, and `hold` keeps them for your approval. The link doesn't make the helper an hc sub-agent: that is set when an agent starts, so the Report and hc's own notes to a parent still treat the two as separate.

Herdr has no command that moves a tab to another space, so a move or a dock takes the chat's pane away and gives it a new one where you dropped it, with the same program still running. For a moment in between, the chat has no pane. If Herdr doesn't show the pane you chose in time, or a step fails, the skin never puts the chat beside some other pane. It puts it back in the tab it came from. If that tab had no other pane, the chat stays hidden and keeps running. Either way a notice that stays says where the chat is now, and how to show it again: `herdr-app do terminal.keep --terminal <terminal>`, or `hc attach <terminal>` in any terminal.

**Check it worked.** The Spaces list shows the new order and name, because a squad is a space.

**Undo.** Drag the squad or chat back, or rename it again. Pin and unpin from the same menu. Unlink a helper on its session panel.

## 11. Run agents on several Claude accounts

You can save more than one Claude login and choose one for each Claude Code agent. You can also move a running chat to another account, and it keeps its history.

> **Read Anthropic's terms first.** Using several accounts to get around usage limits may break Anthropic's terms of service. That decision is yours.

Each account is a long-lived token. Every account shares your one `~/.claude` folder, so a chat started on one account resumes on another. Tokens are stored in Herdr's data folder, `data/endfield/accounts.json`:

- **Windows:** encrypted with DPAPI. Only your Windows user on this computer can read them.
- **macOS:** in your login Keychain. The file keeps only the names. This path is not tested yet.
- **Linux:** in the file itself, which only your user can read. Claude Code keeps its own login the same way.

A token never goes into the skin, a tab's command, Comms or the repo.

You need the Claude Code statusline (step 5). It gives the skin each chat's exact session id, so a switch resumes the right chat.

### Add an account

1. In a terminal signed in to that account, run `claude setup-token`. Copy the token it prints.
2. Click the **5-HOUR / WEEKLY** usage limits in the footer, then click **Manage accounts**. With no Claude Code agent in focus, the click opens the menu at once. A tab named **Accounts** opens. You can also run `node "$HOME/.config/herdr-app/mods/endfield/tools/account.mjs"` in any terminal.
3. Press `a`, type a name such as `work`, and paste the token. The token does not show as you paste it.
4. Press `q` to close the menu.

To remove an account, open the same menu and press `r`.

### Use a default account

Save your normal login as a token too, then press `d` in the same menu and pick it. New agents then start on a named account, so the footer always shows its name, and you can switch a chat back to it.

Dispatch uses the default account by itself. To make Herdr's own menus (such as **New tab**) start Claude Code on it too, add a `claude` entry to `~/.config/herdr-app/programs.json`. Replace `<home>` with your home folder, with forward slashes also on Windows (for example `C:/Users/<you>`).

- If the file does not exist, create it with this content.
- If it exists, add only the `claude` line inside its `"programs"` object, and keep the other entries. If it already has a `claude` entry, add the `"run"` key to that entry.

```json
{ "programs": {
    "claude": { "run": ["node", "<home>/.config/herdr-app/mods/endfield/tools/account.mjs", "run", "--", "claude"] } } }
```

Without a default account, this command runs plain `claude`, so it is safe to keep. A `claude` you type in a shell does not read this file and still uses your normal login. The footer then shows that login's email.

**Check it worked:**

1. Run `herdr-app status`. `errors` is empty, and Herdr wrote no `programs.error` file next to `programs.json`.
2. Start Claude Code from Herdr's **New tab** menu. The footer shows your default account's name next to **Focused**.

**Undo:** remove the `claude` entry from `programs.json`, or delete the file if that was its only entry. `scripts/uninstall.mjs` does this for you, because the entry points at a script inside the Endfield mod. It removes only a `run` that points at that script, and keeps your other entries.

### Start a new agent on an account

In **Dispatch > New agent**, pick Claude Code. An **Account** box shows when you have saved accounts. Click it to step through `default` (your normal login) and each saved account. The command at the foot of the dialog shows the wrapper, for example `node .../account.mjs run work -- claude`.

### Move a running chat to another account

1. Focus the agent, then click the **5-HOUR / WEEKLY** usage limits in the footer. The footer shows the agent's account beside **5-HOUR**, for example `work ▾`. **Switch** is dimmed only while the agent needs input.
2. Pick the account to move to. The dialog shows the account the chat uses now.
3. If the agent is working, choose **When**:
   - **After this turn** (default): the switch waits until the turn ends. Nothing is lost.
   - **Stop now**: the switch presses Esc. Finished tool calls and the history stay, but the reply in progress is lost. The resumed chat gets a note to continue.
4. Click **Switch**.

A new tab opens and does the switch where you can see it:

1. It waits for the turn to end.
2. It ends the old agent, which also closes its tab.
3. It runs `claude --resume <session id>` on the new account.

To cancel, close the new tab before the turn ends. Background tasks that the old agent started end with it, and the dialog warns you about this. Without a session id, the switch resumes the newest chat in the folder (`--continue`), and the dialog says so.

**Check it worked.** The new tab shows the chat's history. The newest file in `data/endfield/sessions/` for that terminal has `"account": "<name>"`. The HUD footer shows the account's name beside its 5-hour limit. Each account has its own limits, so the footer shows the limits of the focused agent's account.

**Undo.** Move the chat back with **Account**. Remove an account from the menu. Delete `data/endfield/accounts.json` to forget every account (on macOS, also remove the `herdr-endfield` items in Keychain Access).

## Update to a new version

**What it changes.** `install.mjs` copies the new skin over the old one. It never overwrites `data/endfield/operators.json` or `data/endfield/settings.json` once they exist. The one exception is an `operators.json` that still matches the seed of version 0.2.0 or earlier, which pinned one operator per program. The installer replaces it with the new empty seed, so that casting by model shows. It also deletes the Endfield folders that earlier versions installed and this one no longer has.

1. From the repo folder, get the new version and install it:

   ```sh
   git pull
   node scripts/install.mjs
   ```

2. If you added the Claude Code statusline, [copy it again](#update-the-statusline).
3. If you fetched the operator portraits, run `node scripts/fetch-operators.mjs --accept` again. It adds the operators that are new in the catalogue and skips the rest.

From version 0.2.0, the installer removes `mods/endfield-transcript`. The transcript pane is now part of the `endfield` mod, as its `transcript` role. `node scripts/sync.mjs` and `node scripts/uninstall.mjs` remove the old folder too. A transcript pane left open from before the update can show an error. Click a sub-agent in Squads to replace it, or close it.

**Check it worked.** The installer lists the old folder under `removed, no longer part of the skin`. `herdr-app status` shows `"errors": []`, and `node scripts/verify.mjs` ends with `PASS`. This command prints `False`:

```powershell
Test-Path "$HOME\.config\herdr-app\mods\endfield-transcript"
```

On macOS and Linux, `ls ~/.config/herdr-app/mods` lists `endfield` and no `endfield-transcript`.

**Undo.** Check out the earlier version, then make the installed skin match it:

```sh
git checkout <commit>
node scripts/sync.mjs
```

`sync.mjs` copies that version's files, puts back its folders, such as `mods/endfield-transcript`, and deletes the files it does not have. It never touches your `operators.json`. Run `git checkout main` to come back.

## Uninstall everything

1. Switch Herdr back to its own layout:

   ```sh
   herdr-app do layout.switch --name main
   ```

2. From the repo folder, remove the skin:

   ```sh
   node scripts/uninstall.mjs
   ```

   The script removes what the installer added and restores anything it backed up. It also deletes the files the skin wrote while it ran: the Comms log, the archived chats list, the links and the session cache. It removes the default-account `run` from `programs.json`, if you added it (section 11). It keeps `data/endfield/operators.json` and `data/endfield/settings.json` if you edited them, and the statusline's `sessions/` folder. If Herdr still shows Endfield, the script stops and says so. `--force` skips that check.

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
   - For saved accounts on macOS, the tokens stay in the login Keychain. Delete each one with `security delete-generic-password -s herdr-endfield -a <name>`. On Windows and Linux, step 3 already deleted them with `data/endfield`.

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

No. The installer and the skin write only inside the Herdr home. The skin reads Claude Code transcripts in `~/.claude/projects/` to show the model, context, tool calls and sub-agents, and it never writes there. Two steps in this guide touch Claude Code, and you do both by hand: the `statusLine` entry in `~/.claude/settings.json`, and the `/theme` choice. The session panel's **Model** and **Effort** actions type `/model` and `/effort` into Claude Code, which saves them as your defaults in `~/.claude/settings.json`. Each dialog says so before you confirm.

### What data does it keep on my machine?

Everything stays in your Herdr home. Nothing is sent anywhere.

- `data/endfield/comms.jsonl` is the Comms log, one line per Dispatch or session panel action. Each line holds the time, the target terminal, the hc command and the text you typed. A secret you type into a task is stored here in plain text. With **Now, wait for reply**, the line also holds the last line on the agent's screen after its turn. The skin drops the oldest lines to keep the file under 512 KB. Uninstall deletes it.
- `data/endfield/archive.json` lists the chats you archived: the session id, program, folder, title and the command that resumes it. Resume removes a chat from it. Uninstall deletes it; the transcripts stay in `~/.claude/projects/`.
- `data/endfield/links.json` lists the helpers you linked: the two terminals' addresses with their start times, the two Claude Code session ids, when, and which of the two notes were typed. A link leaves it when you unlink it, or at the next write after either terminal ends or starts another session. Uninstall deletes it.
- `data/endfield/probe-cache.json` and `data/endfield/probe-agents.json` hold a summary of each Claude Code transcript the skin read: the model, token counts, the last tool with its file or command, and the first line of the prompt. The cache lets each poll read only new lines. Entries for files that are gone, or unchanged for a week, are dropped. Uninstall deletes them.
- `data/endfield/operators.json` and `data/endfield/settings.json` are your settings.
- `data/endfield/sessions/` holds the statusline's files, if you added the statusline.
- `art/operators/` holds the operator art, if you fetched it.
