# Prompt for a Claude Code cloud session

Paste the block below into a new cloud session on the repo **RN22345/hood-sorcery-playtest** (branch `main`).
Change the "This session" line to pick other backlog items next time.

---

```
You are continuing development of the Hood Sorcery playtest table (live at
https://rn22345.github.io/hood-sorcery-playtest/, served by GitHub Pages from main).

First read CLAUDE.md and DEVLOG.md in full. They hold the architecture, the decisions already made,
the backlog (DEVLOG §5) and the session log (§6). Follow CLAUDE.md's rules: rules only in engine/,
plain ES modules, no build step, no new dependencies without a reason written in DEVLOG.

This session: work through DEVLOG backlog items A2, A3 and A5, in that order:
- A2: a visible reveal moment (cards flip, each crew's line shown, what changed highlighted).
- A3: a one-line round summary above the action panel.
- A5: a mobile layout pass (hand scrolls horizontally, compact player boxes; test at 375 px width).
If time and budget remain, do A1 (online hardening: in-game connection list, replace a dropped
player with a bot, client reconnect button).

How to work:
- Serve locally with `python -m http.server 8080` and check changes in a browser if you can.
- Before each commit: `npm test` passes and `node tools/simulate.mjs 50` runs clean.
  Add unit tests for any engine change.
- Commit to a branch `cloud/<short-topic>`, push it, and open a pull request to main with a
  short description and what you verified. Don't merge it yourself.
- Keep costs down: read only the files you need, don't re-run long simulations without reason,
  and stop after the items above.
- At the end, append a DEVLOG §6 entry (date, model, what changed, verified, open) and update
  the backlog ticks. If a rule is unclear, pick the simplest reading and flag it under
  "Playtest guesses" in modes/<id>.md instead of asking.
```

---

## Suggested later sessions (one per run)

| Session | Backlog items | Why |
|---|---|---|
| 2 | A1 online hardening, A4 replay a downloaded log | Online playtests with people outside the room |
| 3 | B6 Corner location cards (with placeholder art) | P1 is the priority pathway; the draft depends on them |
| 4 | C11 results page, C12 per-round question | QA + Business need comparable data across modes |
| 5 | B7 Run It Up, B8 Block corner | More combinations to vote on |
| 6 | D14 test vectors, D15 tabletop-entry adapter | Prepares the Unity Finals port and the GP2 app |
