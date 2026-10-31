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

Module hooks (all optional): `init`, `steps`, `effects`, `validateCast`, `botCast`, `adjustBotCast`,
`castPrefill`, `adjustLine` (after a line's stats, before Thumbs), and for Corners `zoneRep`, `challengerTies`,
`contestLost`. Bot casts always pass through `repairCast` (cast.js), so a module's extra limits never stall a bot.

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
14. Export **test vectors** (`tests/vectors/*.json`: setup + actions + expected result) from `replay`, for the
    C# port to pass.
15. "Tabletop entry" adapter (GP2 shape): crews type ATK/BLK/length instead of casting cards; the engine does the rest.
16. Port order for C#: `line` → `rank` + matrix + Wheel → chosen mode modules → choices → net.

**E. Art** — see ART_TODO.md.

### Budget note for cloud sessions

The first session (this one) built a working core on purpose and left polish to later sessions. Items A1–A5
and C11 give the most value per token. Keep each session to one or two backlog items, run `npm test` and the
simulator before committing, and append to §6.

## 6. Session log

### 2026-10-31 · Claude Code (desktop, Opus 5.5) · v0.1: first playable
- Built: engine (seeded, replayable), 4 modes (Classic, Corners P1, Hold the Block P2, Posted Up P15),
  8 modifiers (Call Out P16, Pass the Tab P12, Specialist matrix, Forecast, 4 corners, Block heals 1,
  3 Thumbs, Short game), lobby, hot-seat with cover screen, bots, PeerJS online (host + room code + invite link),
  rules pages, end survey + log download. 10 unit tests; bot simulator.
- Verified: `npm test` passes; every mode × player count × modifier set plays to the end and replays
  identically; in the browser: Corners round vs bots, Posted Up hot-seat with Call Out + Forecast to the end
  screen, an online host + client game in two tabs (client sees only its own hand).
- Bot sweep (50 games, 4p): Classic avg damage ~7 (printed playtest: 4–10); Corners avg Rep ~6;
  **Hold the Block avg damage ~2.3** (heal 2 may be too strong; try the "Block heals 1" modifier);
  Posted Up avg damage ~4.
- Published 2026-10-31: public repo RN22345/hood-sorcery-playtest, GitHub Pages from `main` /. `CLOUD_PROMPT.md` holds the prompt for cloud sessions.
- Not done: see §5. Not tested on phones or across two networks.

### 2026-10-31 · Claude Code (cloud, Opus 5.5) · A2 reveal moment, A3 round summary, A5 mobile pass
- **A3:** `engine/summary.js` `roundSummary(view)` → "Round 3: Ana +1 damage · Ben took Corner B · Cy left the
  Block". `roundEnd` now records `holds` in each `hist` entry. Shown as a strip above the action panel and on the
  hot-seat cover screen. New unit test (11 tests).
- **A2:** when a round's lines become visible, the cards flip over (staggered), each crew's cast shows in its
  player box with ATK/BLK, the box gets a +N/−N badge, corners that changed hands glow, and the summary strip
  lights up; after 6 s the lines dim back to "last round". `prefers-reduced-motion` turns the flip off.
- **A5:** ≤520 px: player boxes 2-up and compact, zones and line slots 1 column, hand is a sticky bottom bar
  that scrolls sideways, solid top bar, smaller cards; the log starts closed on screens ≤900 px.
- Verified: `npm test` passes; `node tools/simulate.mjs 50` runs clean (numbers as before). Playwright
  (Chromium) at 1280 px and 375 px: lobby, 2 rounds of Corners vs bots, reveal + summary shown, no console
  errors, no sideways scroll at 375 px.
- Open: not tried on a real phone or in online play with a client (the reveal is driven by views, so it
  should work the same). A1 (online hardening) and A4 (log replay) not started.

### 2026-10-31 · Claude Code (cloud, Opus 5.5) · A1 online hardening, post-game stats
- **A1:**
  - `net/peer.js`: ping/pong heartbeat, 12 s silence = dropped, on both sides.
  - The host sends `net` (online seats, connected, bot playing) with every view.
  - An in-game strip shows who is connected. The host gets **Bot takes over** / **Give back** buttons
    (`setSeatKind`). A rejoining player gets the seat back automatically. The client gets a **Reconnect** button
    (in game and in the waiting lobby).
- **Stats:**
  - `ui/stats.js` and `ui/statsView.js`, as described in §2.
  - Entry points: the **Stats** button in the top bar (current game, at any time), **Game stats** on the end
    screen, and the lobby section *Game stats* (load .md/.json files, drop files, or open recent games).
  - Downloads: .md, .csv, .png, .jpg.
  - Round history now also records `cards` and `rolls` (Thumb results).
  - The game log is now version 2: it adds `timing`, `seed`, `color`, `thumbs`, `wheelNames` and
    `modifierNames`.
- Click handler: buttons inside a modal now work (before, only the close button did).
- Verified:
  - `npm test` (14 tests; new `tests/stats.test.js`: seat hand-over keeps replay exact, the timer counts every
    decision once, stats totals match the engine in all 4 modes, .md and log round-trip) and
    `node tools/simulate.mjs 50` pass.
  - Playwright: an all-bot Posted Up short game, then the stats modal and all 4 downloads. A second tab saw the
    recent game and loaded the .md back. Checked at 375 px.
  - Online with two browser contexts over a real WebRTC connection, using a local PeerJS signalling server,
    because the sandbox blocks the public broker and the CDN: the client tab was killed, the host saw "dropped"
    after about 15 s, the bot took over and played on, the client rejoined, got the seat back and the bot
    stopped. The host then cut the connection, and the client's Reconnect button restored it.
- Open: two real networks / phones (needs people); comparing several games side by side (C11).

### 2026-10-31 · Claude Code (cloud, Opus 5.5) · A4 replay, C11 comparison
- **A4 Replay:** `ui/replay.js` `buildReplay(log)`. A replay screen (from **Replay** on the end screen, or
  **Replay this game** for a game log loaded under *Game stats*) has:
  - start/end, round and step buttons, play/pause, a slider and arrow keys;
  - "what just happened" (new log lines);
  - every crew's hand;
  - a warning if the replay ends differently from the saved result (the rules changed since).

  The reveal flip and round summary work in the replay too. **Stats** in the replay's top bar shows the
  stats up to the current step.
- **C11 Comparison:** loading 2+ files adds a comparison at the top of the stats screen: one row per game, plus
  per-mode averages (minutes, s/round, table total, margin, lead changes, comeback wins, wins by seat, fun).
  Downloadable as .md or .csv. Survey answers are now part of each game's stats and report. Loading a game's
  log and its .md report together counts as one game.
- Verified:
  - `npm test` (16 tests: replay rebuilds the same result, stops and rounds, divergence and bad-log errors;
    the comparison groups games by mode and counts seat wins) and `node tools/simulate.mjs 50` pass.
  - Playwright: replayed a finished game from the end screen (stepping, rounds, slider, keyboard, play) and
    went back to the end screen. Loaded 2 logs plus 1 .md: the comparison showed 2 games (the duplicate was
    merged), downloaded the comparison .csv, and replayed from a loaded file. Checked at 375 px. No console
    errors.
- Open: real-network and phone testing of A1. Section B (new modes/modifiers) is next in the backlog.

### 2026-10-31 · Claude Code (cloud, Opus 5.5) · Section B, game-like UI on a scaled 1920×1080 stage
- **Section B:**
  - New modifiers: **Corner locations** (6 locations), **Block corner**, **Open first card**, **Rep upkeep**
    (Corners) and **Run It Up** (any matrix mode).
  - New engine hooks: `adjustLine`, `castPrefill`, `adjustBotCast`, `zoneRep`, `challengerTies`,
    `contestLost`, plus `castProblem(..., limits)` and `repairCast`.
  - Matrix: folded crews skip the ranking and the stake multiplies the damage. Pass the Tab copes with
    unranked crews.
  - Readings flagged in `modes/corners.md` and `modes/classic.md`.
- **UI revamp** (desktop-first, the look Unity should match):
  - **Stage:** a scaled 1920×1080 stage, letterboxed from 480p to 4K, no page scrolling.
  - **Title screen:** a logo and crew standees; mode cards; modifier toggles with live descriptions; crew
    cards with Human/Bot/Online buttons; a big Play button.
  - **Game table:** opponents across the top with their hands shown as card backs and a "thinking"
    pulse; the round and the Wheel in a side column; street-corner zones lit in the holder's colour;
    location strips; a cast panel with a finger meter and a big Cast button; your crew bottom-left; your
    hand as a fan.
  - **Effects:** banners and a Wheel reel at round start, a winner banner, synthesized sounds (with mute).
  - **Stats screen:** tabs (compare / each game).
  - **Overlays:** modals and the hot-seat cover scale with the stage.
  - Phones keep a scrolling layout.
- Verified:
  - `npm test` (20 tests; new: locations, Block + upkeep, open card incl. bot casts, Run It Up matrix ×2 with
    a fold) and `node tools/simulate.mjs 50` pass. Run It Up with bots: about 19 average damage against about
    7 in Classic (flagged).
  - Playwright at 1920×1080, 1280×720, 854×480 and 3840×2160: lobby and play through casts and reveals in
    Corners (+locations, Block, open card), Hold the Block, Classic + Run It Up, and Posted Up + Call Out +
    Forecast. No region clips its content, the page doesn't scroll, and there are no console errors.
  - The stats export/reload, replay and comparison flows, and the online drop/bot/rejoin/reconnect flow (local
    signalling server), all re-run on the new layout.
- Open:
  - Posted Up dials D1–D4 (need the doc text).
  - The other ~6 location cards.
  - Art for locations, the logo, and a table background (ART_TODO).
  - Run It Up balance.
  - Possibly drag-and-drop casting.

### 2026-10-31 · Claude Code (cloud, Opus 5.5; SVG art by a Sonnet sub-agent) · Game-like UI: menus, narrator, drag-and-drop, art, audio
- **Title screen:** a night-street backdrop, the logo over a rotating Vein sigil, light rain, the four crews
  breathing in a line-up, and neon menu buttons. Menu entries: Play, Play online, Game stats, How to play,
  Settings, Credits.
- **Setup wizard:** big mode cards with art → a crew line-up (character-select style) → house-rule switches +
  a summary card. Random seed by default.
- **Narrated rounds** (`ui/show.js`, `ui/beats.js`): every round plays out as beats with captions, card flips,
  dice, rank badges, zone claims, floating damage/Rep and counters that tick. Speed (slow / normal / fast /
  instant), pace (one crew at a time / all at once), Skip.
- **Cards** are dragged into lines and zones, reordered, dragged back, and sorted in the hand; clicking still
  works.
- **Art:** 15 SVGs (menu and table backdrops, 6 zone tiles, 6 location icons, the Vein sigil). Zones show
  their tile; locations show their icon.
- **Audio:** 30 CC0 effects (Kenney casino, impact, interface and jingles packs; Organic Wooshes) and 3 CC0
  lo-fi tracks (Open Lo-Fi), with volumes and mute in Settings.
- **Engine:** structured log fields only (no rule changes). Call Out's +1 damage now appears in the log as a
  delta. New tests: the deltas add up to the final scores in every mode × modifier set; the narrator's beats,
  fed view by view, end on the final scores and holders.
- **Verified:**
  - `npm test` (22 tests) and `node tools/simulate.mjs 50` pass, with unchanged numbers.
  - Playwright at 1920×1080, 1280×720, 854×480 and a 375 px phone: menu, wizard, Corners with drag-and-drop
    casting and full narrated rounds (claims, Rep floaters, Wheel reel), Classic + Run It Up to the end on
    fast, Hold the Block, replay, stats modal + PNG, Play again, settings, online screens. No console errors,
    no clipped regions, no sideways scroll on the phone.
  - Online host + client over WebRTC (local signalling server): drop, bot takes over, rejoin, reconnect.
- **Open:**
  - Painted art to replace the flat SVGs (ART_TODO).
  - An original music theme.
  - The opponents' card-back stacks read a little like a barcode at small sizes.
  - Possibly a hover preview (big card) and drag-to-cast for Swap Meet picks.

### 2026-10-31 · Claude Code (cloud, Sonnet 5.5) · Playtest feedback pass: no animation resets, layout, results pop-up, Block holder, house rules
- **Animation resets (root cause):** `render()` rebuilt `#app` with `innerHTML` on every click, so every CSS animation
  (menu, Wheel, thinking pulse, hover transitions) restarted, and opening/closing Settings replayed the whole screen.
  New `ui/morph.js` diffs the new HTML into the live DOM. Verified in Chromium: menu animation clocks keep running
  while spamming the sound button; the Wheel's `bob` clock is continuous across opening and closing Settings; the
  wheel box, scoreboard rows, hand cards and cast panel keep their element identity across renders.
- **Layout:** the crews are now a slim scoreboard in the left column (standee, name, Thumbs, one big score; opponent
  card-back stacks removed); the board and hand get the rest. Cast cards are bigger everywhere (lanes scale to the
  room, up to ~140 px in Classic; in the cast panel 100 px; hand 146 px), Classic shows one lane per crew in a 2×2
  grid, and the narrator is an inline strip instead of an overlay that hid the lanes. Round 1 shows who has locked in.
- **Round results pop-up** (see §4): per-crew line, ATK/BLK with rank, result chips (+2 damage, took the Block…),
  the Damage Matrix with each crew's token (Classic / Posted Up), extra log lines. `rank` log entries now carry `m`
  and `stake`. New `hold` beat; new setting; unit test added (23 tests).
- **Hold the Block:** the Block zone is split into a gold *Holder* pane (👑) and a blue *Street* pane; the holder's
  scoreboard row is gold with a HOLDER tag; the cast panel carries a role banner (holder / Street / empty Block).
- **House rules page:** rules grouped (Round twists / Game length and Thumbs / Only for this mode), rules that don't
  fit the mode listed in one muted line instead of greyed cards, and a structured summary card (crew list, active
  rules, seed). `data/modifiers.json` gained a `group` field.
- Verified: `npm test` (23) and `node tools/simulate.mjs 50` pass; Playwright at 1920×1080, 1280×720 and 390 px:
  setup wizard, Classic / Hold the Block / Corners / Posted Up rounds with popups, drag-and-drop, log, stats,
  settings and rules modals, no console errors.
- Open: the lo-fi music doesn't fit the theme (ART_TODO); a real phone; the results pop-up for Corners shows the
  table only (no matrix there by design).

### 2026-10-31 · Claude Code (cloud, Sonnet 5.5) · Small fixes from playtest: card art loading, "last round" tag
- Card images no longer use `loading="lazy"`, retry once on error, and are preloaded at boot (a tester saw a broken
  Stonewall card; the file itself is valid and drags fine here, so the cause is most likely a lazy or failed fetch).
- Zones that still show the previous round's dimmed lines now carry a "last round" tag (it was confusing during
  the Run It Up choice).
- Verified: `npm test` (23), Playwright Classic rounds, tag appears from round 2, no console errors.
- **Lead card (house rules, Classic only):** *Show lead card* and *Lead card: hide ATK/BLK* (both turn Run It Up on).
  During the Run It Up pick you see each rival's first card (full card + readout, or number strip covered); the rest
  stays hidden and last round's lines are replaced by the lead lanes. `viewFor` adds `lead` / `leadHide` only during
  that pick. Decided with the team: first card of the line, show numbers by default, hide-numbers as a toggle, Classic
  only. New `requires.modes` in `modifierProblems`; test added; tests now pick modifiers via `modifierProblems`.
  Bots don't use lead cards yet. Hidden info online: clients get the lead card id (the hide option is display-only).
