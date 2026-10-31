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
    `cast.js` (allowed zones, cast validation, bot helpers), `rng.js`.
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
1. Online hardening: show who is connected in-game; host "replace a dropped player with a bot"; client
   reconnect button; heartbeat. Test across two real networks (phone hotspot + home Wi-Fi).
2. Reveal moment: animate the flip (cards turn over), show each crew's line beside their box for a few seconds,
   highlight what changed (corner taken, damage +N). Today the log + dimmed "last round" lines carry it.
3. A round summary strip ("Round 3: Ana +1 damage, Ben took the Lot…") above the action panel.
4. Load a downloaded log and **replay** it step by step (engine `replay()` exists; needs UI).
5. Mobile layout pass (hand as a horizontal scroller, compact player boxes) — testers will use phones.

**B. Modes and modifiers from the plan**
6. **Corner location cards** for P1 (~12, `05_Pathways.md` P1): deal 3 per game; each a small rule hook
   (Laundromat 💧 seams +2 BLK, Rooftop max 1 card, Bodega pays 2 Rep, Precinct loser +1 damage, Subway Grate no
   seams, Old Church ties to challenger). Needs art (ART_TODO).
7. **Run It Up (P4)** modifier: raise / fold simultaneous choices, stakes ×2/×4, folders skip ranking (3- and
   2-player matrices exist).
8. **Block corner** (P1+P2): one corner heals its holder.
9. Open first card (P1 signal), Corners with Rep upkeep (snowball fix), Posted Up dials D1–D4 (`10_Posted_Up.md` §8).
10. Tier 3 when asked: P5 Beef, P10 Heat Check, P11 Stash Night, P13 Four Hats, P9 Smuggle Run, P14 Partners.

**C. Data for QA + Business**
11. Results page: drop several log `.json` files, compare modes (win spread, game length, survey answers).
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
- Not done: see §5. Not tested on phones or across two networks.
