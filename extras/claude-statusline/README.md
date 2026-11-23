# Claude Code statusline (opt-in)

A Claude Code statusline in the skin's style. It also feeds the skin exact session data.

```
// herdr-endfield  main · Opus · ctx ▰▰▰▱▱▱▱▱▱▱ 31% · in 1.2m · 5h 40% 2h10m left
```

## What it changes

- Claude Code shows this line under its prompt: folder, branch, model, effort, a 10-step context gauge (red from 75%), input tokens, and your 5-hour and 7-day limits when Claude Code reports them.
- On every update it writes one small JSON file per session to `~/.config/herdr-app/data/endfield/sessions/<session id>.json`. The file holds the session id, the Herdr terminal (`HC_TERMINAL_ID`), the folder, the transcript path, the model, context use and cost.
- With these files, the skin matches each agent row to its exact session. Without them it guesses from the newest transcript in the folder and marks the card `≈`.

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

## Undo

1. Remove the `statusLine` entry from `~/.claude/settings.json`, or put your old one back.
2. Delete `~/.claude/statusline-endfield.sh`.
3. Optionally delete `~/.config/herdr-app/data/endfield/sessions/`.
