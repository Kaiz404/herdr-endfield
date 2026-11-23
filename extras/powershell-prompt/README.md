# PowerShell prompt (opt-in)

A one-line prompt in the skin's style, for PowerShell 5.1 and 7:

```
// herdr-endfield  main ›
```

## What it changes

- It replaces the `prompt` function and adds one helper, `Get-EfBranch`, in your session.
- The folder is `~` at home, else the folder's name. The branch comes from `.git/HEAD`, so it never runs `git.exe`.
- The `›` is red after a failed command and dim otherwise. Colours are the 16 ANSI colours, so your terminal theme decides the hues.
- It reports the current folder to the terminal (OSC 7), so new Herdr tabs and splits open where you are.

It changes nothing until you add it to your profile.

## Install

1. Copy `prompt.ps1` somewhere stable, for example next to your profile:

   ```powershell
   Copy-Item extras\powershell-prompt\prompt.ps1 (Join-Path (Split-Path $PROFILE) endfield-prompt.ps1)
   ```

2. Add this line to `$PROFILE` (`notepad $PROFILE`):

   ```powershell
   . (Join-Path (Split-Path $PROFILE) endfield-prompt.ps1)
   ```

3. Open a new terminal.

The branch glyph needs a font with Powerline symbols. JetBrains Mono, which the skin uses, has them.

## Undo

Delete the line from `$PROFILE`, delete `endfield-prompt.ps1`, and open a new terminal.
