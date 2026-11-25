# Claude Code statusline (opt-in)

A Claude Code statusline in the skin's style. It also feeds the skin exact session data.

```
// herdr-endfield  main   Opus   ctx ▰▰▰▱▱▱▱▱▱▱ 31%   in 1.2m   5h 40% 2h10m left
```

## What it changes

- Claude Code shows this line under its prompt: folder, branch, model, effort, a 10-step context gauge (red from 75%), input tokens, and your 5-hour and 7-day limits when Claude Code reports them.
- On every update it writes one small JSON file per session to `~/.config/herdr-app/data/endfield/sessions/<session id>.json`. The file holds the session id, the Herdr terminal (`HC_TERMINAL_ID`), the folder, the transcript path, the model, the effort level, context use, cost and your 5-hour and 7-day usage limits (`rate_limits`).
- With these files, the skin matches each agent row to its exact session. Without them it guesses from the newest transcript in the folder and marks the card `≈`.
- The HUD footer shows the usage limits from the newest file that has them.

It reads nothing else and sends nothing anywhere.

## Requirements

`bash` and `gawk`. Git for Windows includes both. On macOS, install `gawk` (`brew install gawk`), because the script uses `systime` and `strftime`.

## Install

1. Copy the script:

   ```sh
   cp extras/claude-statusline/statusline-endfield.sh ~/.claude/statusline-endfield.sh
   ```

2. In `~/.claude/settings.json`, set `statusLine`. If a `statusLine` entry is already there, note it so you can put it back.

   ```json
   "statusLine": { "type": "command", "command": "bash ~/.claude/statusline-endfield.sh" }
   ```

3. Start a new Claude Code session.

The script writes to `~/.config/herdr-app`. If you use `HERDR_APP_HOME`, change `dir=` at the top of the script to match.

## Update

The skin's installer does not touch `~/.claude/`. When this script changes, copy it again (step 1 of Install). The HUD footer's usage limits need a copy from version 0.3.0 or later (see [CHANGELOG.md](../../CHANGELOG.md)). An older copy writes no `rate_limits`, and the footer leaves the section out. Each running session picks up the new script on its next statusline update.

## Undo

1. Remove the `statusLine` entry from `~/.claude/settings.json`, or put your old one back.
2. Delete `~/.claude/statusline-endfield.sh`.
3. Optionally delete `~/.config/herdr-app/data/endfield/sessions/`.
