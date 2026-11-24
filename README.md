# Endfield for Herdr

A layout for the [Herdr](https://herdr.dev) desktop app in the style of Arknights: Endfield's interface. Your coding agents become a squad of operators. Each has a portrait, a callsign and a status you can read at a glance. Paper chrome, ink terminal cards, and one acid yellow that means "you, here, now".

> **Unofficial fan project.** Inspired by the visual language of Arknights: Endfield. Not affiliated with, endorsed by or sponsored by Hypergryph, Gryphline or the Herdr project. This repo contains no official art, logos or assets. The optional operator portraits are downloaded by a script onto your own machine, for your personal use. See [THIRD_PARTY.md](THIRD_PARTY.md) and the [fan content guidelines](https://endfield.gryphline.com/en-us/news/4497).

![A schematic of the Endfield layout: the squad sidebar on the left, the tab strip on top, ink terminal cards in the work area](preview.png)

The image is a schematic of the layout, not a screenshot.

## What you get

- **Squads.** The sidebar groups your agents by project, one squad per space. With the optional portraits, each agent is drawn as one of 36 operators, cast by its model: a stronger model draws a stronger operator, and sibling sub-agents draw different ones. See [Casting](docs/CASTING.md).
- **Rows you can read at a glance.** Each row names what runs: the program for an agent, such as `CLAUDE` or `CODEX`, and the Claude Code type for a sub-agent, such as `POTETO-AGENT` or `EXPLORE`. Then the model and effort, how long the run has gone, how many background tasks it runs, a status word, and the task with a context gauge. The status is Generating, Waiting, Needs input, Finished, Idle or Error. Waiting means the turn ended but background work it started still runs. Idle agents fold to one line. Sub-agents hang under the agent that started them: the running ones first, then **+N earlier** for the finished ones. The operator's portrait is on the row, and its callsign, such as `PERLICA`, is on the session panel.
- **A session panel** when you hover an agent or a Claude Code sub-agent: context, tool calls, its background tasks, its last action and any question it is waiting on. Right-click the row to keep the panel open. Its buttons rename the chat or change its model, effort or mode. Each one shows the exact command and runs it only when you confirm.
- **Archive and Resume.** Archive ends a chat and keeps its transcript. Resume opens it again in a new tab.
- **Squads you can arrange.** Drag a squad to reorder it, and the others slide aside to show where it lands. In Tab order, drag a chat to reorder it within its squad. Double-click a squad's name to rename it, and right-click its header for a menu.
- **Helpers.** In Priority order, drag one Claude Code agent onto another to link it as a helper. It shows under its lead, and on your confirm each gets a note to coordinate through Claude Code's cross-session messaging.
- **One transcript pane** for a Claude Code sub-agent, with a box to send it a follow-up through its parent.
- **A banner when an agent needs you.** It shows the agent's question, with **Answer** and **Later**. A finished agent gets a short **Finished** slip.
- **Usage limits** in the footer: your Claude 5-hour and weekly use, and the time to reset. They come from the Claude Code statusline.
- **Report**, one screen with every squad, sortable by status, rate, context and turn.
- **Dispatch**, to send a task to a running agent or start a new one, after it shows you the exact command. **Comms** shows what you sent and what agents told each other.
- **A home base.** New spaces open in your workspace folder (`Projects` in your home folder, if it exists), not in the home folder itself. An agent you start there works inside that folder instead of your whole home folder.
- **Light and night appearances** that follow your system, and original sounds.
- **Optional extras.** Official operator portraits, a Claude Code statusline, and a PowerShell prompt.

Model, context, background task and sub-agent details are for Claude Code. Other agents show their status, program and task.

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

The full guide is [docs/SETUP.md](docs/SETUP.md). It covers each piece with a check and an undo step: the layout, the portraits, which operator each agent gets, sounds, the Claude Code statusline and theme, the PowerShell prompt, Dispatch and Comms, chat actions, Archive and Resume, arranging squads, several Claude accounts, the home base, updating, uninstall, troubleshooting, and what data the skin keeps.

## More

- [docs/SETUP.md](docs/SETUP.md): install, configure, uninstall and troubleshoot.
- [CONTRIBUTING.md](CONTRIBUTING.md): the dev loop and the design rules.
- [ROADMAP.md](ROADMAP.md) and [CHANGELOG.md](CHANGELOG.md).
- [RECIPE.md](RECIPE.md): the full design brief, region by region.

Code is MIT-licensed. The bundled font is under the SIL Open Font License. See [LICENSE](LICENSE) and [THIRD_PARTY.md](THIRD_PARTY.md).
