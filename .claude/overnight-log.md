# Overnight run: close every flagged issue

The user went to sleep and granted full autonomy to finish all the flagged issues, merge them, and push to GitHub with updated docs.

Each PR passes these gates:

1. An independent reviewer on a different model says SHIP.
2. CI passes on Ubuntu and Windows.
3. Merge to main.
4. Sync main into the live Herdr home and check `herdr-app status`.

## Done

| Issue | PR | Notes |
|---|---|---|
| #5 drop the conveyor | #7 | |
| #4 sub-agent list | #8 | Rebased onto #7 by hand. |
| #3 one transcript pane | #9 | Added a load-shape guard. Not click-tested by the user. Double-click risk is noted; it self-heals. |
| #6 row metrics | #13 | Review nits fixed: dropped the unread `tools`, fixed a stale comment, documented the 1s redraw. |
| #10 usage footer | #12 | |
| #19 sticky card | #20 | Pointer-coordinate check removed as unobservable. Event-driven closes only. Fixed a regression: a press on another agent's row still opens that row's card. |
| #18 prompt a sub-agent, #22 Dispatch idle/done | #21 | Retry now always draws the command under any note. Residual on #22: a paneless child maps `done` to `idle`, which fails safe. |

## Later

- **#24 merged (closes #11).** The art is installed live, and operators cast by model tier.
- **#27 merged (closes #23).** I resolved the conflicts by hand and kept the three-argument `transcriptsIn`.
- **#28 merged.** It adds a guard so a failed identity refresh can't stick, which fixed portraits after the art install. The root cause is not identified. Follow-ups: log the refresh rejection, and include present slugs in the cache key.
- **Usage limit hit.** I stopped the fix rounds for #25 and #26 mid-run. Partial work is in their `.claude/worktrees`.

## After the limit reset

- **#26 merged (closes #15).** A fresh agent finished the stopped fix round. The re-review said SHIP. Known gap: closing the Archive dialog mid-exit skips the hide, which fails safe because Resume still works.
- **#25 merged (part 1 of #16).** The fix round was finished. The re-review found a zombie: a sub-agent that died mid Bash read Generating forever. I fixed it by bounding a pending foreground shell call by its timeout (default 2 min, at most 10) plus 60s. The fixture age went from 1 hour to 90s, because no foreground shell call can run for an hour. Then I merged main (RECIPE conflict).
- **#14 started.**
- **#16 part 2 started**: the task list in the card, and Waiting on lead rows.
- **#29 merged (closes #14).** The review was FIX-FIRST because double-click rename flickered the fold. I fixed it: the name text takes the double-click and stops the click reaching the header, so it never folds, and a drag only starts after 4px of travel. "Move to squad" is cut because Herdr has no command for it.
- **#16 part 2 is PR #30.** Review is running.
- **#17 waits for #30**, since both touch every surface.
- **#30 merged (closes #16).** The review was FIX-FIRST because of a cross-PR bug: the Squads menu's Archive gated on the derived Waiting status. I fixed it to gate on `herdrStatus`, with a test.
- **#32 merged (closes #17).** The review said SHIP. Lint holes went to #31.
- **Filed #31**, collecting every review follow-up left open.
- **All flagged issues are closed.** Only #31 is open. The live window was checked by screenshot: operators, one-line idle rows, the FINISHED counter, two-row limits, and no dots.
- **Docs pass for 0.3.0 started**, as PR docs-0.3.0.
- **#33 (docs for 0.3.0) merged.** The review said SHIP. I fixed its four factual nits first: the operator count of 29, what Comms logs, the `--continue` resume case, and the eight-operator Opus draw.
- **Done.** Main is at `fc1dafe` and synced live. No open PRs. The only open issue is #31, the follow-ups. Merged agent worktrees were removed. Not done: a git tag or GitHub release for 0.3.0, left for the user to decide.

## In flight (stopped at the usage limit, earlier)

- **#11 operators, PR #24.** FIX-FIRST: pane agents reshuffle operators when others close. The fix round, adding sticky draws, is running.
- **#16 part 1, waiting status, PR #25.** FIX-FIRST: batched notices, monitor timeouts, conflicts. The fix round is running.
- **#15 card metrics and actions.** Building.
- **#23 transcript as a role.** Building.

## Queued

- **#14** drag, rename, archive, right-click. Waits for #15, because it uses Archive.
- **#16 part 2.** Task-list UI, plus a Waiting state on lead rows. Waits for #25.
- **#17** no-dots rule, sweep and lint. Last code change.
- **Docs pass.** README, SETUP, RECIPE, CHANGELOG, then a version bump to 0.3.0.

## Decisions

- **Fallback operator.** The female Endministrator. The user never answered.
- **Merges without the user's click-test.** The user granted full autonomy for the night.
- **Disk.** C was full twice (0 MB and 211 MB free). This session isn't the cause; it recovered on its own.
- **Run log location.** A reviewer's scratch cleanup deleted this log and the scratch checkouts. Everything was pushed, so nothing was lost. The log now lives in `.claude/` in the repo, which is untracked.
