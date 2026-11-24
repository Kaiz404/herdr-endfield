# Casting: which operator an agent is drawn as

With the art pack installed, each agent is drawn as an Arknights: Endfield operator. A stronger model draws a stronger operator. This page explains the rule and the game facts behind it. The rule itself is one table, `CASTING` in [`skin/mods/endfield/fleet.js`](../skin/mods/endfield/fleet.js).

## The rule

1. The skin reads the agent's model id, for example `claude-opus-5-5`. Today it knows the model of Claude Code agents and their sub-agents. Other agents have no model, so step 5 applies to them.
2. It lowercases the id, drops any `vendor/` prefix, and tests the patterns in `CASTING.rules` in order. The first pattern that matches names the tier.
3. The tier's pool lists operators in draw order. The agent takes the first one that no other agent holds, including the sub-agents shown in Squads. Sibling sub-agents therefore get different operators. A callsign number, such as `YVONNE-2`, appears only when every operator in the pool is taken.
4. The agent keeps its operator while it draws from the same pool. When another agent closes, or another agent's model arrives, nobody else changes. Only a change to the agent's own pool draws it again: a model in another tier, its first known model, a pin or an override. The skin holds this memory in the running mod only. After a Herdr restart or a mod reload, every agent draws again in creation order. A sub-agent takes its slot when the agents list draws it, so a newly shown sub-agent holds its operator only once the agents list has rendered.
5. An agent with no model gets its program's default from the art pack (`default_assignment`). An agent whose model matches no pattern gets the fallback, the Endministrator. Dispatch shows the operator a new agent will draw. A same-program child runs its parent's model, so Dispatch predicts it by model. Any other new agent starts on its program's default, and Dispatch labels it that way.

Two kinds of override still win over the model. Both live in `data/endfield/operators.json` in your Herdr home. A terminal pin (`terminals`) always wins. A program entry (`programs`) wins for every agent of that program. A pin or override that names an operator claims it before any other agent draws. The agent you pin gets the bare callsign, such as `YVONNE`, and the agent that held Yvonne draws again. Two agents pinned to one operator are numbered in creation order. A sub-agent shown in Squads still holds its operator, so a pin to that operator takes the next number until the sub-agent leaves the list. See [Choose which operator each agent gets](SETUP.md#3-choose-which-operator-each-agent-gets).

A pool uses only the operators your art pack has. With an older pack of eight operators, an Opus agent draws Laevatain, then Perlica. A Haiku agent falls back to its program's default, because that pack has no 4★ operators.

## Tiers

| Tier | Model families (first match wins) | Pool |
|---|---|---|
| fable | Claude Fable, OpenAI `gpt-*-pro` and `o*-pro`, Gemini Deep Think and Ultra, Grok Heavy | the top 6★ meta: rated S and T0 on both lists |
| opus | Claude Opus, the GPT flagship and Codex, the o-series, Gemini Pro, Grok, DeepSeek Pro and Reasoner, Kimi Pro | high-tier 6★, and the 5★ that both lists rate A or T0 |
| sonnet | Claude Sonnet, GPT and Codex mini, Gemini Flash, Cursor Composer, Qwen, GLM, MiniMax, Kimi, DeepSeek, Mistral | mid-tier 5★, and Ember |
| haiku | Claude Haiku, nano, Flash-Lite, other `*-flash` and `*-fast` models, local models of 99B or less | the 4★ operators |

Two patterns need care:

- **"mini" is a word of its own.** `gpt-5-mini` and `o4-mini` match `(^|[-_.])mini($|[-_.])`. The end of `gemini` does not match, so `gemini-3-pro` stays in the opus tier.
- **A size tag of 99B or less means a small local model.** `(^|[-:/])\d{1,2}b($|[-_.])` matches a parameter count of one or two digits written as its own tag, as in `qwen2.5-coder:7b`, `mistral-7b` or `gpt-oss-20b`. Those go to haiku. The rule runs before the open-weight family rule, so `qwen3-coder:30b` is haiku, not sonnet. A tag of three digits does not match: `llama3.1:405b` stays sonnet by family, and `gpt-oss-120b` matches no rule and gets the fallback. An active-parameter tag such as the `a22b` in `qwen3-235b-a22b` does not match either, because a letter comes before the digits.
- **Order matters.** `gpt-5.1-codex-mini` must reach the mini rule before the Codex rule, and `gemini-3-flash-lite` must reach the Flash-Lite rule before the Flash rule.

`tests/casting.test.mjs` runs 39 model ids through the table.

## Operators by tier

Rarity, class and element come from the [official operator page](https://endfield.gryphline.com/en-us/operator). The tier columns come from two community tier lists, fetched on 2026-11-24:

- **Icy Veins**, updated 2026-11-15: <https://www.icy-veins.com/arknights-endfield/tier-list>. Tiers run S to D.
- **Prydwen**, updated 2026-11-05, rated on Echoes of War: <https://www.prydwen.gg/arknights-endfield/tier-list>. Tiers run T0 to T3.

The composite averages the two after mapping S=4, A=3, B=2, C=1, D=0 and T0=4, T0.5=3.5, T1=2.5, T1.5=1.5, T2=1, T3=0. Neither list ranks Kay or Mimino yet.

| Tier | Operator | Rarity | Class | Element | Icy Veins | Prydwen | Composite |
|---|---|---|---|---|---|---|---|
| fable | Arcane | 6★ | Caster | Nature | S | T0 | 4 |
| fable | Argent Flow | 6★ | Guard | Electric | S | T0 | 4 |
| fable | Mi Fu | 6★ | Guard | Physical | S | T0 | 4 |
| fable | Rossi | 6★ | Guard | Physical | S | T0 | 4 |
| fable | Si | 6★ | Supporter | Cryo | S | T0 | 4 |
| fable | Zhuang Fangyi | 6★ | Striker | Electric | S | T0 | 4 |
| fable | Camille | 6★ | Vanguard | Heat | S | T0 | 4 |
| fable | Tangtang | 6★ | Caster | Cryo | S | T0 | 4 |
| fable | Gilberta | 6★ | Supporter | Nature | S | T0 | 4 |
| opus | Laevatain | 6★ | Striker | Heat | S | T0.5 | 3.75 |
| opus | Yvonne | 6★ | Striker | Cryo | S | T0.5 | 3.75 |
| opus | Ardelia | 6★ | Supporter | Nature | S | T0.5 | 3.75 |
| opus | Last Rite | 6★ | Striker | Cryo | A | T0 | 3.5 |
| opus | Typhoeus | 6★ | Striker | Nature | A | T0 | 3.5 |
| opus | Liino | 6★ | Supporter | Electric | A | T0 | 3.5 |
| opus | Pogranichnik | 6★ | Vanguard | Physical | A | T0 | 3.5 |
| opus | Lifeng | 6★ | Guard | Physical | A | T0.5 | 3.25 |
| opus | Kay | 6★ | Vanguard | Nature | — | — | — |
| opus | Perlica | 5★ | Caster | Electric | A | T0 | 3.5 |
| opus | Xaihi | 5★ | Supporter | Cryo | A | T0 | 3.5 |
| sonnet | Chen Qianyu | 5★ | Guard | Physical | B | T0.5 | 2.75 |
| sonnet | Avywenna | 5★ | Striker | Electric | B | T0.5 | 2.75 |
| sonnet | Ember | 6★ | Defender | Heat | B | T1 | 2.25 |
| sonnet | Snowshine | 5★ | Defender | Cryo | B | T1 | 2.25 |
| sonnet | Arclight | 5★ | Vanguard | Electric | B | T1 | 2.25 |
| sonnet | Wulfgard | 5★ | Caster | Heat | B | T1 | 2.25 |
| sonnet | Da Pan | 5★ | Striker | Physical | C | T1 | 1.75 |
| sonnet | Alesh | 5★ | Vanguard | Cryo | C | T1 | 1.75 |
| sonnet | Mimino | 5★ | Supporter | Physical | — | — | — |
| sonnet | Purrchena | 5★ | Defender | Physical | D | T1.5 | 0.75 |
| haiku | Akekuri | 4★ | Vanguard | Heat | B | T0.5 | 2.75 |
| haiku | Antal | 4★ | Supporter | Electric | C | T1 | 1.75 |
| haiku | Catcher | 4★ | Defender | Physical | C | T2 | 1 |
| haiku | Estella | 4★ | Guard | Cryo | C | T1.5 | 1.25 |
| haiku | Fluorite | 4★ | Caster | Nature | C | T1.5 | 1.25 |
| fallback | Endministrator | 6★ | Guard | Physical | A | T1 | 2.75 |

Choices the lists do not settle:

- **Kay** is unranked. She is in the opus pool as the newest limited 6★.
- **Mimino** is unranked. She is in the sonnet pool, with the other 5★ operators.
- **Ember** is a 6★ with a mid-tier rating, so she is in the sonnet pool. She is also the default for shells.
- **Strikers and Guards lead the opus pool.** They are the damage dealers, which suits agents doing heavy work.
- **The lists disagree in places.** Last Rite, Typhoeus, Liino, Pogranichnik, Perlica and Xaihi are A on Icy Veins and T0 on Prydwen. Laevatain, Yvonne and Ardelia are S on Icy Veins and T0.5 on Prydwen. The composite settles these.

## Program defaults and the fallback

These apply when an agent's model is unknown. They are the catalogue's `default_assignment` in [`art-pack/operators.json`](../art-pack/operators.json):

| Program | Operator |
|---|---|
| Claude Code | Perlica |
| Codex | Laevatain |
| Gemini | Last Rite |
| OpenCode | Chen Qianyu |
| Cursor | Snowshine |
| Any other program | Ember |

A model that matches no pattern gets the female Endministrator, the player's avatar. To use Perlica instead, change `fallback` in `CASTING`.

## Change the casting

- **A new model family.** Add a pattern to `CASTING.rules`. Put it before any broader pattern that would also match it, and add its id to `tests/casting.test.mjs`.
- **A new operator.** Add the operator to `art-pack/operators.json` with an official CDN URL and its sha256, then add its slug to one pool. The test checks that every pooled slug is in the catalogue, and that no slug is in two pools.
- **A rebalance.** Reorder a pool, or move a slug between pools, and update the table on this page with the tier list's date.
