# Roadmap

Direction, not promises. Each item ships only when it passes `verify.mjs` and looks right in light and dark.

## 1. Screenshots

The game-UI redesign shipped in 0.2.0, and the fleet tools in 0.3.0 (see [CHANGELOG.md](CHANGELOG.md)). What is left from them:

- A screenshot set from a demo session (`scripts/demo-fleet.mjs`), in light and dark, with no official art, personal folders or terminal contents in it.
- The follow-ups from the 0.3.0 reviews, tracked in [issue #31](https://github.com/Kaiz404/herdr-endfield/issues/31). They cover the Finished slip before Waiting, Waiting in the tab and space signals, Archive's dialog closed while ending, logging failed identity rereads, and a few races in the transcript pane and the session card. None has been seen live.

## 2. Native GUI sessions through an ACP bridge

Today an agent is a terminal. The goal is an optional native pane per session: streamed messages, tool calls with diffs, and approval cards. Research so far points to this shape:

- **One bridge, one protocol.** A small Node process speaks the Agent Client Protocol (ACP v1) over stdio to each agent and serves the mod over localhost. The mod starts it with `hc run --bg --keep`, health-checks it, and relaunches it after a reboot or core crash.
- **Claude Code first.** It is the most-used agent and the riskiest assumption. The first milestone is one Claude session in a pane: prompt, stream, approve, cancel. Kill criterion: if the adapter cannot resume a session written by the terminal, show sub-agent transcripts and report usage, switch Claude to the Agent SDK directly and keep ACP for the others. Cursor (native `agent acp`) and Codex follow.
- **Transcripts before hooks.** Background tasks and the Waiting status shipped in 0.3.0 without Claude Code hooks. The skin reads them from the session transcript, so no hook probe is needed for them. Hooks (`PreToolUse`, `PermissionRequest`, `Stop`) stay an option if a later feature needs an event the transcript does not carry.
- **Safe by default.** The localhost API requires a bearer token read from a file and rejects any request with an `Origin` header. Events are served in segments under 1 MiB (a mod's `readTextFile` limit) or by long-poll. Adapter versions are pinned exactly.
- **No subscription login through the GUI.** Login stays in a terminal. The bridge never calls `authenticate` for a subscription method, never reads credential files and never sets tokens. If the bridge is shared publicly, it supports API keys only, or it does not ship.
- Sessions still running in a terminal keep the terminal view. "Resume in GUI" is offered only for sessions whose terminal has exited.

## 3. Agent-to-agent messaging

- **Now: `hc`.** Herdr's core already lets any terminal agent start, message (`hc send`, with idle gating) and wait for another, and records parent and child. The skin shows those links as sub-agents. Document the patterns.
- **Later: a mailbox.** Once a second GUI session exists, the bridge hosts a mailbox MCP server, started per session as a stdio shim that carries the agent's identity. Tools: `list_agents`, `send_message`, `read_inbox`. Messages arrive wrapped as untrusted, `send_message` returns at once, and a hop and rate limit stops two agents from answering each other forever. One address space covers `hc` terminals and ACP sessions.
