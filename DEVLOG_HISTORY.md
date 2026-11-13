# DEVLOG history

Older session-log entries moved out of `DEVLOG.md` §6 on 2026-11-13 (newest at the bottom). `DEVLOG.md` keeps the last 3.

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

### 2026-11-01 · Claude Code (desktop, Opus 5.5) · Wheel cooldown, OS-random seeds, test vectors for Unity
- Wheel: 3-spin cooldown in `core.js` spin step (`st.wheelHist`), param `wheelCooldown` in `DEFAULT_PARAMS`, new
  house rule `wheel-no-cooldown`. Lobby seeds now from `crypto.getRandomValues`. Why: playtesters saw Cuffed / Swap Meet
  repeat; the RNG was fair (12.4–12.9% per sector over 5,000 games) but back-to-back repeats hit ~61% of games.
- Backlog D14 done: `tools/export_vectors.mjs` writes 192 vectors (every mode × each valid single modifier × player
  counts × 2 seeds) to `tests/vectors/`: setup by ids, all actions, expected wheel spins, scores and order. The C# port
  in `hood-sorcery-unity` must pass them. Re-run the exporter after any rule change.
- Verified: `npm test` (25, new cooldown test), `node tools/simulate.mjs 50`, site loads locally with no console errors.
- Open: the Wheel UI doesn't grey out cooled sectors yet.

