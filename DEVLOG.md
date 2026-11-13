# Hood Sorcery Playtest · Development log

The working document for this repo: what exists, how it fits together, what was decided, and what to build
next. **Read this before changing code.** Append to §6 (log) at the end of every session.

Design source: `Docs/Digital/MULTIMODE_PLAYTEST_PLAN.md` in the Hood Sorcery workspace (not in this repo).
The printed rules authority is **SRD v3.10.20**; the modes here are playtest variants.

---

## 1. Goals and constraints (from the team, 2026-10-30)

- **One page, several game modes**, each a rework pathway or a combination, so the team can playtest the top
  contenders online with other people. Priority: **P1 Corners**, then P2 Hold the Block, P15 Posted Up.
- **Modular and easy to change:** a mode = a JSON file + at most one new rule module.
- **Carries over to Unity** (the end goal): the Finals game is the full Hood Sorcery, digital, in whichever
  mode wins; the GP2 Android helper is **one app on one device** for the whole table. The engine here is the
  reference both should port.
- **P3 Tag Wars is not a mode** (grid game, paper prototype first). P6 Corner Store, P7 Overdraw, P8 The Block
  are also out of the shared engine (see the plan §4.4).
- Hosting: **GitHub Pages**, static. Online play is peer-to-peer (below), so no server is needed.

## 2. Architecture

```
 data/*.json ──▶ engine (pure rules) ◀── actions ── ui/app.js (local, host)   ── net/peer.js ──▶ clients
                   state + action -> new state        bots (engine bot hooks)       viewFor(state, seat)
```

- **Engine** (`engine/`): no DOM, no network, no `Math.random`. All randomness comes from a seeded mulberry32
  in `state.rng`. A game = `setup` + `state.actions`; `replay()` rebuilds it exactly. This is what gets
  ported to C#.
  - `game.js`: `createGame`, `act` (never mutates its input), `choiceFor`, `viewFor` (hides other hands,
    the deck, the rng and secret picks), `botChoice`, `replay`.
  - `registry.js`: module table, `resolveMode(mode, modifiers, players)`, `stepsFor(config)`, phase order.
  - `line.js` (seams, finger budget, line enumeration), `rank.js` (SRD §5 ties and roll-offs),
    `cast.js` (allowed zones, cast validation, bot helpers), `rng.js`, `summary.js` (one-line round summary
    from `players[].hist`; reads only, decides nothing). `setSeatKind` (game.js) hands a seat to a bot and back.
- **Stats** (`ui/stats.js`, no DOM, tested in Node): `Timer` (round starts and decision times, observed from
  successive views, so it works for local, host and client alike), `computeStats(record)` (record = the
  downloaded game log, v2), `statsMarkdown` / `statsCsv` / `parseStatsFile`. `ui/statsView.js` draws one SVG
  stats card, shown in the page and exported to PNG/JPEG through a canvas. `compareStats` /
  `compareMarkdown` / `compareCsv` put several games side by side.
- **Replay** (`ui/replay.js`, no DOM): `buildReplay(log)` rebuilds every state from the log's setup + actions
  and marks the stops (each finished decision step). The replay screen reuses the game view with a control
  panel instead of the action panel, and shows every hand.
  - `modules/*.js`: one rule module each.
- **Round = fixed phases**: `ROUND_START, PRE_CAST, CAST, PRE_REVEAL, REVEAL, RESOLVE, POST_RESOLVE, REFILL,
  ROUND_END`. Each module contributes **steps** `{ id, phase, order, kind: 'auto'|'choice', when, run | who,
  spec, validate, apply, bot }`. Steps are sorted by phase, then `order`. An `apply` that returns `'repeat'`
  asks again (used by Pass the Tab).
- **Choices** are one of three shapes, so the UI never needs new widgets per mode:
  `cast` (the line builder), `pickCards` (Swap Meet), `option` (any list of buttons).
  All choices are **simultaneous and hidden** until everyone in `who` has answered.
- **Cast format:** `{ lines: [{ zone, cards: [ids in order] }], thumbs: [zone, …] }`. Zones: Classic has one;
  Corners lets you cast into any zone with one shared finger budget; Posted Up only into your posted Spot.
- **Score tracks** are generic (`tracks.damage`, `tracks.rep`); the win rule is data
  (`win: { track, best, ties }`).
- **Wheel per mode:** a mode file maps sector → effect name (`"MUGGED": "noHeal"`); modules implement the
  effect names; limit changes live in each module's `effects` table.
- **UI** (`ui/`): `app.js` is the controller (lobby, local/host/client roles, hot-seat cover screen, bot
  timer), `views.js` returns HTML strings, `md.js` renders the rules pages. UI code never decides rules;
  it calls `castProblem` for live feedback and the engine for everything else.
  - **Stage** (`stage.js`): every screen is laid out on a **1920×1080 stage** scaled to fit the window
    (letterboxed), the same model as a Unity Canvas Scaler with a 1920×1080 reference. Desktop from 480p to
    4K shows everything without scrolling. Narrow or portrait windows (`body.flow`) get a scrolling layout.
    Screen regions (game): top bar · side (round + limits, Wheel, **the crews as a slim scoreboard**,
    connections) · board (zones/lanes with a results pop-up over them, narrator/summary strip, action panel) ·
    your hand (a fan under the board) · log. These map one-to-one to Unity panels.
  - **Rendering** (`morph.js`): a screen is *diffed* into the DOM, not replaced, so a click (sound button, modal,
    settings) never restarts running animations. Keyed elements (`data-k`, `data-card`, `data-pid`, `data-zone`)
    are matched by key; a changed `data-k` (a new stage page, a new choice, a new narrator beat, a new results
    pop-up) is a new element, which is what plays its entry animation. Never rebuild `#app` with `innerHTML`.
  - **Effects + audio** (`fx.js`): banners, the Wheel reel, floating numbers, claim flashes, dice; sound
    effects from CC0 samples (`assets/audio/`, Web Audio) and looping lo-fi music (menu / game), with volumes
    in Settings. A separate layer outside `#app`, so re-renders never restart an animation.
  - **Narrator** (`show.js` + pure `beats.js`): turns *new log entries* into paced beats (round banner → Wheel
    reel → "all lines in" → flip → Thumb dice → totals → rank badges / zone claims → damage/Rep floaters → …).
    It keeps a *displayed* copy (`show.disp`: scores, holders, round, Wheel, which round's cards are face up)
    that lags the real state until each beat plays; views read it. Bots and the hot-seat cover wait while it
    plays; the choice panel appears after. Speed and pace live in Settings; **Skip** jumps to the end.
    It relies on structured log fields from the engine: `d` / `ds` (score deltas), `zone` + `holder`,
    `ranks`, wheel `id`, end `pid` (a unit test checks the deltas add up to every final score).
  - **Screens:** title menu → setup wizard (mode / crews / house rules) → table; Play online (host / join);
    Game stats menu; settings, how-to-play and credits modals. Entry animations run only when the screen,
    step, choice or modal changes (`.enter` on the stage), never on routine re-renders.
  - **Cards** are dragged with pointer events (mouse and touch): a ghost follows the pointer in a layer
    outside `#app`; drop on a slot (at a position), on a zone tile, back on the hand, or within the hand
    (UI-only hand order). Clicking still works.
- **Online** (`net/peer.js`): PeerJS 1.5.4 (WebRTC, free public signalling broker), star topology, host is
  authoritative and sends each client `viewFor(state, seat)`. Rejoin with the same name gets the seat back.
  Hidden info is safe from other clients, not from the host (fine for playtests).

### Modules

| Module | File | Does |
|---|---|---|
| core | `modules/core.js` | round start, Wheel spin, Swap Meet, cast, reveal + Thumbs, Flip the Script, settle damage (Thumb 6), refill, end + standings |
| matrix | `modules/matrix.js` | rank ATK/BLK, Mugged/Sabotage rotation, Damage Matrix (standard or specialist), Bleeding |
| corners | `modules/corners.js` | P1: per-corner contest, Rep, The Turf extra corner, Corners Wheel rereads, bot |
| holdTheBlock | `modules/holdTheBlock.js` | P2: holder vs Street hits, heal, stay/bail, empty-Block claim, bot |
| postedUp | `modules/postedUp.js` | P15: rich Spot roll, post up, Spot take, rich heal, end payout, bot |
| forecast | `modules/forecast.js` | P15 modifier: pre-rolls next round's rich Spot from round 4 |
| callOut | `modules/callOut.js` | P16: spend a Thumb to call out a rival (local to your Spot in Posted Up) |
| passTheTab | `modules/passTheTab.js` | P12: worst crew may pay a Thumb to swap damage down the line |
| locations | `modules/locations.js` | P1: a location card per corner (Laundromat, Rooftop, Bodega, Precinct, Subway Grate, Old Church) |
| blockCorner | `modules/blockCorner.js` | P1+P2: the first corner is The Block, +1 Rep to its holder |
| openCard | `modules/openCard.js` | P1 signal: open one card + corner before casting; it must lead that line |
| runItUp | `modules/runItUp.js` | P4: fold / call / raise after casting; stakes ×2/×4; folders skip the matrix |
| plug | `modules/plug.js` | experiment, Corners + Classic: 4 face-up cards at Refill, picked worst-off first (Rep / damage), pass allowed |
| turfPerks | `modules/turfPerks.js` | experiment, Corners: the corner holder at round start gets its location's perk (Wash, Lookout, Badge, Back Way, Confession) |
| contraband | `modules/contraband.js` | experiment, Corners: 2 secret one-shot items per crew (12 kinds), one a round, committed with the cast |
| respin | `modules/respin.js` | helper loaded by Turf Perks / Contraband: the shared "keep or re-spin" prompt right after the spin |

Module hooks (all optional): `init`, `steps`, `effects`, `validateCast`, `botCast`, `adjustBotCast`,
`castPrefill`, `adjustLine` (after a line's stats, before Thumbs), and for Corners `zoneRep`, `challengerTies(st,ctx,z,pid)`,
`contestLost`. **Experiment hooks (2026-11-12, all behaviour-neutral when unused; the C# port mirrors each one 1:1):**
`limitsFor(st,ctx,pid,limits,cast)` (per-crew limits; `cast.js limitsFor` returns the same `st.limits` object when nothing
changes), `immune(st,ctx,pid,fx,cast)` (Badge, Bribe; `cast.js immune`), `castSpec(st,ctx,pid,spec)` (extra fields in the
cast choice), `finishBotCast(st,ctx,pid,cast)` (after every `adjustBotCast`; Contraband picks its item here),
`redactView(st,v,pid)` (hidden items, Lookout), `respinOptions(st,ctx,pid)` / `respinUsed(st,ctx,pid,value)` (the `respin`
step), and for Corners `holderFor(st,ctx,z)` (Fake ID), `contestWon(st,ctx,z,winner,pids)` (Snitch) and
`afterContests(st,ctx,out,lost)` (Getaway Car, The Plug's tally), called once after all contests and Mugged.
Core exports `spinWheel(st,ctx,{respin})`, `discardUsed(st,ctx)` (sets `st.usedOut`; core refill then skips its discard)
and `drawable(st,ctx)` (reshuffle if the deck is empty). A cast may carry `item: {id, zone?, target?}`; `cleanCast` keeps
it only when present. `requires.excludes: [modifier ids]` greys out a combination. Bot casts always pass through `repairCast` (cast.js), so a module's extra limits never stall a bot.

## 3. How to…

**Add a mode.** Write `data/modes/<id>.json` (copy one), add the id to `data/modes/index.json`, write
`modes/<id>.md`. If it needs new rules, add `engine/modules/<name>.js` with steps, register it in
`engine/registry.js`, and list it in the mode's `modules`. Add a unit test with hand-made numbers
(see `fakeState` in `tests/engine.test.js`). Run `npm test` and `node tools/simulate.mjs 100 <id>`.

**Add a modifier.** Add an entry to `data/modifiers.json`: `modules` to add, `params` to override,
`requires: { track, modules }` so the lobby greys it out where it doesn't fit. Pure-number modifiers need no code.

**Change a number.** Mode `params` (e.g. `blockHeal`, `richHeal`, `repPerCorner`, `zoneCount`) or the defaults
in `registry.js` (`rounds 8, hand 8, thumbs 2, line 8, maxCards 3`).

**Update cards/art.** Edit the master spreadsheet in the workspace, then `python tools/export_data.py <workspace>`.

## 4. Decisions made while building (2026-10-31)

- **Plain JS ES modules, no build step**, instead of the plan's TypeScript + Vite. Reason: anyone (or any AI
  session) can edit a file on GitHub and Pages serves it as is; Node runs the same files for tests. JSDoc-ish
  comments carry the types; the shapes map directly to C# classes.
- **New repo** `hood-sorcery-playtest`; the old v2 prototype repo (`hood-sorcery-prototype`) is left untouched.
- **Bots never touch the game rng** (`botRng` in `cast.js` hashes seed+round+seat), so a recorded game replays
  exactly whether a seat was a bot or a human.
- **Hot-seat**: when several humans share a device, every hidden choice goes through a "Pass the device"
  cover; between turns all hands are hidden.
- **Corners rule gaps filled** (flagged in `modes/corners.md`): Thumb 6 = +1 Rep; Mugged = the corner won with
  the highest total goes to its runner-up; Sabotage = challengers win ties; Bleeding = losers of a contest −1 Rep;
  The Turf = an extra corner this round. Challengers need ATK ≥ 1 to take any corner.
- **Hold the Block gaps filled** (flagged in `modes/hold-the-block.md`): Mugged = no heal; Sabotage = holder BLK
  −2; Bleeding ranked as Classic; knocked off with nobody "in" → Block empty; no stay/bail in the last round.
- **Call Out** picks are hidden and simultaneous (the app version from `11_Call_Out.md`), not in seat order.
- **Pass the Tab** runs after the matrix and before Thumb 6; order = round damage, then worse combined rank.
- Round history entries (`players[].hist`) carry `holds` (names of the zones held at round end), so a round
  summary can say who took what without reading the log text. `engine/summary.js` builds the summary; it lives
  in `engine/` (not `ui/`) because it is pure and unit-tested, and the Unity UI will want the same lines.
- The reveal moment is UI-only: the engine usually runs straight from the flip to the next round's cast, so
  the UI notices "a new round's lines became visible" (`v.revealed`, or `v.lastRes` one round later), flips
  them once and keeps the highlights for 6 s. No engine pause, so bots and online play are not slowed.
- **Replacing a dropped player with a bot** is `setSeatKind`, not a recorded action: bots never touch the game
  rng, so `replay(setup, actions)` still gives the same game. It writes a `seat` log line. A player who rejoins
  with the same name gets the seat back automatically. Heartbeat: ping every 4 s, 12 s of silence = dropped
  (WebRTC close events often never fire on phones).
- **Stats file format:** the `.md` report is readable and carries the stats as a JSON block at the end, so it
  loads back without a parser for the tables. A game log `.json` loads too (stats recomputed). The CSV is
  export-only (long format: one row per crew per round). Recent games' stats are kept in localStorage
  (`hsp:recentStats`, last 8) so another tab can open them without a file. Images come from the SVG card, so
  no screenshot library (html2canvas) is needed.
- Posted Up's end-of-game payout lands after the last round's history, so stats show it as a separate
  "end of game" adjustment (and an "end" point on the chart) instead of folding it into round 8.
- **What this site is for (2026-10-31, from the team):** it is the playtest table *and* the visual reference
  for how the game should look and feel, so the Unity build (desktop first; a mobile port maybe later)
  matches what was tested. It is not GP2 or GP3 itself. The `engine/` is the rules reference for both the
  GP2 helper app and the Unity game. Hence the 1920×1080 stage, the regions named above, and game-feel
  effects living in one place (`fx.js`) that a Unity scene can mirror.
- Bots now wait 650 ms before answering (was 220 ms), so a table of bots reads like players.
- Section B readings (all flagged in `modes/corners.md` / `modes/classic.md`): Precinct costs Rep instead of
  damage; Subway Grate removes the seam's length cut too; the Block's heal = +1 Rep; Rep upkeep from the 3rd
  corner; Run It Up fold cost 1 and ×2 / ×4 stakes. Posted Up dials D1–D4 are **not done**: their text is in
  `10_Posted_Up.md` §8, which is not in this repo.
- **Look and sound (2026-10-31, from the team):** "more like a video game, less like a parameter form";
  desktop-first. New assets are allowed. Decisions: flat SVG art made for this build (`assets/ui`,
  `assets/locations`, drawn by a sub-agent from a brief, generated by scripts, checked visually) as stand-ins
  until painted art exists (ART_TODO); audio only from **CC0** sources (credits file + title-screen credits);
  music streamed with `<audio preload=none>`, effects decoded once into Web Audio buffers (~4.4 MB total).
- **Log entries carry structured fields** for presentation (`d`, `ds`, `zone`, `holder`, `ranks`, `id`, `pid`).
  They are not rules and do not change replays; the Unity port can drive its own animations from them.
- Seeds are random per game by default (*Random game* toggle in house rules); a fixed seed is still possible.
- **Round results pop-up (2026-10-31):** opens when a round starts to resolve (first rank / claim / damage beat),
  covers only the zones (the action panel and hand stay usable, so Flip the Script, Pass the Tab or stay/bail
  are never hidden), and a `hold` beat keeps it up ~3 s before the next round starts. The matrix grid is drawn from
  the `m` / `stake` fields now logged on the `rank` entry (not a rule change); who took what comes from
  `roundSummary`. Settings: closes itself / wait for a click / off.
- Final-standings roll-off uses a d6 plus a hidden tiebreak digit so it never loops; the log shows the d6.

- **Wheel cooldown (team, 2026-11-01):** a sector that landed sits out the next 3 spins (`wheelCooldown`, default 3;
  house rule *Wheel without cooldown* sets 0). Seeds come from `crypto.getRandomValues`. Saved logs from before this
  change replay with different Wheel results (the engine draws from a smaller pool).
- **Finals ruleset (team, 2026-11-01):** Corners first, Classic second; the Unity port follows that order. Modes may
  still be added, changed or removed, so keep everything as modules + data.

- **GP2 = Corners expansion for the tabletop (team, 2026-11-01):** two engine pieces for it. `physicalDeck` param
  (modifier `physical-deck`, group `tabletop`, hidden in the web lobby): a cast may name any real card, Swap Meet is a
  log reminder instead of a pick, refill only removes cards that were in the hand (no change for normal games). Hands
  in state are then only used by bots/tests. `hotCorner` module (modifier `hot-corner`): one random corner per round
  pays `hotRep` (+1) via the `zoneRep` hook; bots ignore it. Not checked together with *Open first card* (it uses the hand).
- **Never add a step to an existing module lightly:** `botRng` seeds from `st.stepIdx`, so a new step in `core` shifts
  every bot choice and changes every recorded vector. Fold new behaviour into an existing step, or put it in a new
  module that is only loaded by a modifier.

- **Experiments: The Plug, Turf Perks, Contraband (2026-11-12, from `GP3_OVERHAUL_PLAN.md` §0, §0.3a, §4a).** Three optional
  modifiers in the new group `experiment` (off by default). Contraband is retired in the SRD (D-32): here it is an experiment
  only. Changed from the `12_Player_Choices.md` §7 draft: **Lookout** shows a *hand* (lines are built at the same time), **Burner
  Phone** = +1 card (same reason), **Back Way** = +1 to your *total* finger limit, **Confession** = once per game per crew.
  Readings the plan did not cover, all flagged in `modes/corners.md` "Playtest guesses":
  - **Re-spin is its own step** (`respin` module, ROUND_START 11), asked right after the spin to every crew that holds a
    re-spin (Lucky Charm, Confession); both answers are hidden and simultaneous. One re-spin a round: Lucky Charm first, then the
    lowest seat; the others keep theirs. The first `wheel` log line stays; the re-spin logs `respin`. The cooldown history entry
    is replaced and the sector that was spun can't come up. Lucky Charm counts as the round's one item.
  - **Item shape:** `cast.item = { id, zone? , target? }` (zone for Fake ID / Brass Knuckles / Kevlar Hoodie, a rival for Snitch);
    consumed at the flip (`itemReveal`, REVEAL −1). Items are dealt from the 12 without repeats (4 crews hold 8 of them).
    The public log never names a stolen item.
  - **Immunity:** Badge covers Cuffed and Mugged; Bribe covers every curse (Cuffed, Mugged, Sabotage, Bleeding). Mugged on an
    immune crew: nothing happens (an `immune` log line, no fallback). Sabotage: an immune *holder* keeps its ties.
  - **Fake ID:** the user counts as holder at that corner and defends with BLK; the real holder fights as a challenger. With no
    other line there, the Fake ID user simply takes it.
  - **Smoke Bomb:** only changes ties between a challenger and the holder (the holder already wins them); it does not beat
    Sabotage or Old Church when the *holder* plays it.
  - **Snitch** costs 1 Rep per contested corner (2+ crews with a line there) the named crew wins, after Mugged.
  - **Getaway Car:** the lost line with the most ATK moves to the best-paying empty corner (nobody holds it after the contests),
    lowest corner on a tie; it takes it with ATK 1+. The line is re-filed under the new corner in `st.res`.
  - **Pickpocket** takes a random item from a random rival's unused items (engine RNG), after the items played this round are
    revealed; the thief can use it from next round on.
  - **The Plug:** 4 cards, picks one crew at a time (`"repeat"`), Corners ties by contests lost this round counted after
    Mugged (`afterContests`) then a logged roll-off; Classic ties by damage this round. No market in the last round. Bots take
    the card that raises their best line (ATK+BLK) by at least 0.5, else pass.
  - **Turf Perks** use the holder *at the start of the round* (`st.perks`). **Wash** runs after the used cards leave the hand.
  - Not allowed with `physical-deck` (new `requires.excludes`). Hooks are neutral: no new steps, log lines or RNG draws in a game
    that does not load the modules, so all 220 older vectors are unchanged.

- **FIN-12: Contraband in Classic + character cards (2026-11-13, D-39, D-42).** Contraband's `requires` is now `modes: [corners,
  classic]`; new modifier `characters` (group `experiment`, param `charDeal` 2 = pick 1 of 2, 1 = just dealt), Corners + Classic, not
  with the physical deck. Hold the Block / Posted Up left out (not in the Finals build). Design record and cut list:
  `Docs/Concept Rework/13_Character_Cards_and_Contraband_All_Modes.md` §2a, §4a. Choices, all flagged in `modes/classic.md`:
  - **Commonality rule (user: "there should be comonality"):** an item changes only where the mode makes it meaningless. A corner in
    Corners = a **ranking** in Classic (1st ATK, 1st BLK). 8 items word for word; Fake ID (swap ATK/BLK after the Thumbs), Getaway Car
    (2+ damage → 1 less), Snitch (+1 damage per ranking the rival tops), Spray Can (heal 1 per ranking you top) change. `itemDef(id, mode)`
    gives the mode's text and pick; the tray shows it. Corners text and code paths are untouched (`ITEMS` is still the Corners entry).
  - **New neutral hooks:** `thumbRoll` and `adjustRolled` (core reveal), `settleDamage` (core settle, before Thumb 6), `rankEntry` + an
    optional `win` flag in `rankEntries` (matrix), `immune` asked by the matrix on Mugged / Sabotage / Bleeding (`rotateExcept`). No steps
    were added to `core`, `matrix` or `contraband` (that would shift `stepIdx`); all character steps live in the new module. Unused hooks:
    no RNG draw, no log line. `git diff tests/vectors` after re-export: only added files.
  - **Character cards:** 8 of the 10 drafted (Cool Head, Light Touch, Thick Skin, Slippery cut; Gale Rider / Tide Watcher renamed Storm
    Chaser / The Plumber so no card sounds like a crew). Changed from the draft after bot sweeps: the element cards are "+1 ATK and +1 BLK
    on a line with 2+ cards of the element" (the draft's +1 BLK was worth ~0 in Corners, where BLK only counts while holding); **Big
    Hands = +1 card** (+1 finger was worth nothing: three cards fill 8 fingers, and longer lines lose rank ties); **Underdog** counts ties
    and starts in round 2; **Loaded Dice** also gives +1 Thumb. Corners picks "one of your lines" for the player (most ATK+BLK). The
    pick is a hidden simultaneous `charPick` choice (ROUND_START 2, round 1 only), the offers stay secret (`redactView`), the kept card is
    public. One `char` log line a round, after the reveal lines (so the narrator's reveal group stays together).
  - **Bots:** Classic item picks read rivals' past totals (Fake ID only when the swap beats more rivals; Getaway Car on a weak line, Spray Can
    on a strong one, Snitch on the least-damaged rival, Burner Phone / Extra Hand only if a wider line is better). Character picks weigh
    the hand's share of the element and the sweep results (`botWorth`).
  - Results pop-up: the Wheel tag now shows the re-spun sector (it showed the first spin after a Lucky Charm / Confession).

### Hosting: is GitHub Pages enough?

Yes, for this stage. Pages serves static files, and the site is static: the game logic runs in the host
player's browser and players connect peer-to-peer over WebRTC (PeerJS), with PeerJS's free public broker only
introducing the peers. Limits and fallbacks:

| Limit | Fallback |
|---|---|
| Public broker can be down or slow; some school/office networks block WebRTC (no TURN server) | Hot-seat + bots always work; swap `net/peer.js` for **Supabase Realtime** or **Firebase Realtime Database** (free tiers, websocket, works behind most firewalls) |
| No server = no stored results; logs are downloaded files | Add a Supabase table or a Google Form for survey/log upload |
| Pages needs a public repo on a free GitHub plan | Netlify / Cloudflare Pages / Vercel (free, can deploy private repos); itch.io (HTML5 upload, private draft pages) |
| Host can see everything (state lives in the host's browser) | Fine for team playtests; Unity Finals uses a relay (Unity Netcode + Relay, or Photon) |

## 5. Backlog (for the next sessions; roughly in priority order)

Sized so a cloud session can take them one by one. ✅ = done.

**A. Playtest-critical**
1. ✅ Online hardening: show who is connected in-game; host "replace a dropped player with a bot"; client
   reconnect button; heartbeat. **Still to do:** test across two real networks (phone hotspot + home Wi-Fi).
   Also possible: a TURN server for networks that block direct WebRTC.
2. ✅ Reveal moment: animate the flip (cards turn over), show each crew's line beside their box for a few seconds,
   highlight what changed (corner taken, damage +N). Today the log + dimmed "last round" lines carry it.
3. ✅ A round summary strip ("Round 3: Ana +1 damage, Ben took the Lot…") above the action panel.
4. ✅ Load a downloaded log and **replay** it step by step (engine `replay()` exists; needs UI).
5. ✅ Mobile layout pass (hand as a horizontal scroller, compact player boxes) — testers will use phones.
   Still to do: try it on a real phone (only checked in a 375 px browser window).

**B. Modes and modifiers from the plan**
6. ✅ **Corner location cards** for P1 (~12, `05_Pathways.md` P1): deal 3 per game; each a small rule hook
   (Laundromat 💧 seams +2 BLK, Rooftop max 1 card, Bodega pays 2 Rep, Precinct loser +1 damage, Subway Grate no
   seams, Old Church ties to challenger). Needs art (ART_TODO). **Done: the six named here; the other ~6
   need `05_Pathways.md`.**
7. ✅ **Run It Up (P4)** modifier: raise / fold simultaneous choices, stakes ×2/×4, folders skip ranking (3- and
   2-player matrices exist).
8. ✅ **Block corner** (P1+P2): one corner heals its holder.
9. ✅ Open first card (P1 signal), ✅ Corners with Rep upkeep (snowball fix), ❌ Posted Up dials D1–D4
   (`10_Posted_Up.md` §8, not in this repo: paste the section into a session to add them).
10. Tier 3 when asked: P5 Beef, P10 Heat Check, P11 Stash Night, P13 Four Hats, P9 Smuggle Run, P14 Partners.

**C. Data for QA + Business**
11. ✅ Results page: drop several log `.json` files, compare modes (win spread, game length, survey answers).
    Next step if wanted: charts across games (e.g. game length per mode), and reading survey free text side by side.
12. Per-round one-tap question "did another crew change your cast?" (yes/no) stored in the log.
13. Smarter bots (the "aware" bot from `Docs/Concept Rework/evidence/posted_up_test.py`) and a sim report per mode.

**D. Toward Unity / GP2**
14. ✅ Export **test vectors** (`tests/vectors/*.json`: setup + actions + expected result) from `replay`, for the
    C# port to pass.
15. "Tabletop entry" adapter (GP2 shape): crews type ATK/BLK/length instead of casting cards; the engine does the rest.
16. Port order for C#: `line` → `rank` + matrix + Wheel → chosen mode modules → choices → net.

**E. Art** — see ART_TODO.md.

### Budget note for cloud sessions

The first session (this one) built a working core on purpose and left polish to later sessions. Items A1–A5
and C11 give the most value per token. Keep each session to one or two backlog items, run `npm test` and the
simulator before committing, and append to §6.

## 6. Session log

Older entries: `DEVLOG_HISTORY.md`. Keep only the last 3 entries here; move older ones there.

### 2026-11-01 · Claude Code (desktop, Opus 5.5) · GP2 engine: physical deck + hot corner
- `physical-deck` and `hot-corner` modifiers (see §4), `engine/modules/hotCorner.js`, `cast.js`/`core.js` changes, the hot
  corner uses the existing gold "rich" zone style. Vectors: 220 (192 unchanged, 28 new for the two modifiers).
- Verified: `npm test` 27 (2 new), `node tools/simulate.mjs` with both modifiers, lobby shows Hot corner and hides
  Physical deck, the hot zone is highlighted in a Corners game, no console errors.
- Open: a visible "HOT" label on the zone; bots that aim for the hot corner.

### 2026-11-12 · Claude Code (desktop, Sonnet 5.5) · S1a: The Plug, Turf Perks, Contraband (experiments) + engine hooks
- Built (branch `experiments`): the neutral hooks of `GP3_OVERHAUL_PLAN.md` §4a (see §2 "Experiment hooks"); modules `plug`, `turfPerks`,
  `contraband` and the helper `respin`; three modifiers in the group `experiment`; bots for every new decision (Plug pick or pass,
  Wash, Lookout target, item choice incl. Burner Phone / Extra Hand re-plans, re-spin on a curse); `finishBotCast` and `castSpec` hooks
  (not in the plan: Contraband must pick its item *after* openCard has moved the cards, and the cast spec needs per-item limits).
- Web UI: lobby group *Experiments*; Plug / Wash picks as clickable cards (the market is also shown to waiting crews); the re-spin
  prompt with the sector; the item tray under the line builder (hidden until the flip, per-item limits, corner / rival picker);
  the Lookout hand strip; perk badges on crews and corners, a pocket counter per crew; an item banner in the narrated round and the
  re-spin as a second Wheel reel.
- Tests: `tests/experiments.test.js` (23 tests: every item, every perk, the Plug orders and ties, re-spin rules, hidden info,
  200 seeded bot games per experiment + replay, combos with four corners / open card / Block / hot corner). Vectors: 262 (220 old
  unchanged, 42 new incl. 3 combination sets). The two "every modifier at once" tests now skip combinations the new `excludes` forbids.
- Verified: `npm test` 50 pass; `node tools/simulate.mjs 50` clean; 200 games × each experiment (Plug also in Classic), no stall; in the
  browser (local static server) each experiment on: lobby, item pick + lock-in + reveal banner, Plug picks, Wash, Lookout, re-spin
  prompt (Lucky Charm), no console errors. Bot sweep (200 games, 4p Corners): average Rep 6.0 plain, 6.2 Plug, 6.8 Turf Perks,
  6.3 Contraband; Classic + Plug damage 7.0 vs 6.9 (so the Plug barely moves a bot game).
- Open: the C# port (S1b); the replay screen and the online (peer) flow were not tried with the experiments (they only read views and logs);
  bots ignore the information from Lookout; Unity UI for all three is S3. Not tried on a phone or online (peer) with a client.

### 2026-11-13 · Claude Code (desktop, Opus 5.5) · FIN-12: Contraband in Classic + character cards
- Engine: `contraband.js` Classic readings (`itemDef`, `adjustRolled`, `rankEntry`, `settleDamage`, Classic bot items); new
  `engine/modules/characters.js` (8 cards, pick step, note step, `limitsFor`, `adjustLine`, `thumbRoll`, `redactView`, bot pick); neutral hooks
  in `core.js`, `matrix.js`, `rank.js`; modifier `characters`; Contraband allowed in Classic. Details in §4.
- UI: both toggles in the Classic lobby (Experiments); character pick panel (two gold cards); 🃏 badge on each crew plate; item tray shows the
  Classic texts; reveal banners and results lines come from the new log lines; re-spun Wheel tag in the results pop-up.
- Tests: new `tests/fin12.test.js` (13 tests: every vector replays, neutral hooks, every Classic item, every character card, hidden info,
  200 bot games per combination); the experiments `requires` test updated. Vectors: 316 (262 old byte-identical, 54 new: Classic +
  Contraband, characters in both modes, both together, and with the Plug / Turf Perks / Run It Up + Pass the Tab).
- Verified: `npm test` 63 pass; `node tools/simulate.mjs 50` clean (also with each new modifier). Sweep, 500 games × 4 bots: Classic avg damage
  6.79 plain / 6.79 Contraband / 6.67 characters / 6.62 both, seat wins 22–30%; Corners avg Rep 6.12 / 6.28 / 6.13 / 6.27, seat wins 20–31%
  (the 20/31 spread with Contraband is the same as before this change). Per card (seat 1 forced, 500 games): Classic −0.5 (Loaded Dice) to
  −1.5 (Big Hands) damage; Corners +0.3 to +0.8 Rep. In the browser: Classic lobby toggles, pick panel, badges, Turf limit 5 cards with Big
  Hands, Fake ID in the tray and its reveal banner, results lines (Character cards, Spray Can); no console errors.
- Open: not playtested by people; Corners UI with characters only checked through tests (same code paths); online (peer) flow not tried with
  the new pick step; the C# port and Unity UI are later stages (hooks to mirror: `thumbRoll`, `adjustRolled`, `settleDamage`, `rankEntry`/`win`,
  matrix `immune` + `rotateExcept`); Loaded Dice is weak and may want a rethink.
