# Endfield for Herdr

A layout for the [Herdr](https://herdr.dev) desktop app in the style of Arknights: Endfield's interface. Your coding agents become a squad of operators. Each has a portrait, a callsign and a status you can read at a glance. Paper chrome, ink terminal cards, and one acid yellow that means "you, here, now".

> **Unofficial fan project.** Inspired by the visual language of Arknights: Endfield. Not affiliated with, endorsed by or sponsored by Hypergryph, Gryphline or the Herdr project. This repo contains no official art, logos or assets. The optional operator portraits are downloaded by a script onto your own machine, for your personal use. See [THIRD_PARTY.md](THIRD_PARTY.md) and the [fan content guidelines](https://endfield.gryphline.com/en-us/news/4497).

![A schematic of the Endfield layout: the squad sidebar on the left, the tab strip on top, ink terminal cards in the work area](preview.png)

The image is a schematic of the layout, not a screenshot.

## What you get

- **Squads.** The sidebar groups your agents by project. Each agent shows its operator, a callsign such as `PERLICA`, its task, a status word (Generating, Waiting, Needs input, Finished, Idle or Error), its model, its elapsed time and a context gauge. Sub-agents hang under the agent that started them.
- **A banner when an agent needs you.** It shows the agent's question, with **Answer** and **Later**. A finished agent gets a short **Finished** slip.
- **A session panel** when you hover an agent: model, context, tokens, turns, its last action and any question it is waiting on.
- **Report**, one screen with every squad, sortable by status, rate, context and turn.
- **Dispatch**, to send a task to a running agent or start a new one, after it shows you the exact command. **Comms** shows what you sent and what agents told each other.
- **A home base.** New spaces open in your workspace folder (`Projects` in your home folder, if it exists), not in the home folder itself. An agent you start there works inside that folder instead of your whole home folder.
- **Light and night appearances** that follow your system, and original sounds.
- **Optional extras.** Official operator portraits, a Claude Code statusline, and a PowerShell prompt.

Model, context and sub-agent details are for Claude Code. Other agents show their status, program and task.

## Quick start

You need Herdr, Node.js 18 or newer, and Git. The portraits also need Python 3 with Pillow.

```sh
git clone https://github.com/Kaiz404/herdr-endfield
cd herdr-endfield
node scripts/install.mjs
herdr-app do layout.switch --name endfield
node scripts/fetch-operators.mjs --accept
```

The last command downloads the official operator art onto your machine. Leave it out to use the layout with program icons instead.

The full guide is [docs/SETUP.md](docs/SETUP.md). It covers each piece with a check and an undo step: the layout, the portraits, which operator each agent gets, sounds, the Claude Code statusline and theme, the PowerShell prompt, Dispatch and Comms, uninstall, troubleshooting, and what data the skin keeps.

## More

- [docs/SETUP.md](docs/SETUP.md): install, configure, uninstall and troubleshoot.
- [CONTRIBUTING.md](CONTRIBUTING.md): the dev loop and the design rules.
- [ROADMAP.md](ROADMAP.md) and [CHANGELOG.md](CHANGELOG.md).
- [RECIPE.md](RECIPE.md): the full design brief, region by region.

Code is MIT-licensed. The bundled font is under the SIL Open Font License. See [LICENSE](LICENSE) and [THIRD_PARTY.md](THIRD_PARTY.md).
