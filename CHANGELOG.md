# Changelog

## Unreleased

### New

- **First public layout.** The Endfield layout, its light and night themes, the `endfield`, `endfield-toast` and `endfield-transcript` mods, and a settings preview.
- **Install and uninstall scripts.** `node scripts/install.mjs` copies the skin into your Herdr home, backs up any Endfield file it replaces, and is safe to rerun. `node scripts/uninstall.mjs` removes it and restores the backups.
- **Opt-in extras.** A Claude Code statusline that also feeds the skin exact session data, and a PowerShell prompt.
- **Bring-your-own art pack.** `art-pack/build_pack.py` turns your own images into operator avatars and a manifest. The skin reads it; on-screen portraits are on the roadmap.
- **Official operator art, fetched on your machine.** `node scripts/fetch-operators.mjs --accept` downloads eight official operator renders, checks each against a pinned sha256, and builds the art pack into your Herdr home. The repo itself contains only the catalogue (`art-pack/operators.json`): URLs, hashes and crop settings. `--list`, `--only` and `--dry-run`; reruns do nothing.
- **Checks.** `node scripts/verify.mjs` checks the mods against a running Herdr; `--static` runs in CI and also rejects official art and personal data. Official CDN URLs are allowed only in `art-pack/operators.json`, and every URL there must be on the official site or its CDN.
