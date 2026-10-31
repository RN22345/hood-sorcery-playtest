# Hood Sorcery · Playtest Table

**Play:** https://rn22345.github.io/hood-sorcery-playtest/

A one-page, multi-mode playtest table for **Hood Sorcery** (Siyaman Studios), the 4-crew simultaneous-casting
card game. Each mode is one of the rework pathways; modifiers stack on top. Play hot-seat on one device,
against bots, or online with a room code. No install, no account, no server.

| Mode | Pathway | One line |
|---|---|---|
| **Classic** | SRD v3.10.20 | The printed game. Rank ATK and BLK, take matrix damage, least damage wins. The control group |
| **Corners** | P1 | Split your 8 fingers across 3 corners. Challengers use ATK, holders defend with BLK. Most Rep wins |
| **Hold the Block** | P2 | One Vein corner: the holder heals but the whole Street hits them. Stay or bail? |
| **Posted Up** | P15 | Classic + pick a Spot each round; highest ATK takes it; the rich Spot heals; Spots pay at the end |

**Modifiers:** Call Out (P16) · Pass the Tab (P12) · Run It Up (P4) · Show lead card (P4, see a rival's first card before the bet) · Specialist matrix · Forecast · 4 corners ·
Corner locations (P1) · Block corner (P1+P2) · Open first card (P1) · Rep upkeep · Block heals 1 · 3 Thumbs ·
Short game (4 rounds).

Built for a desktop browser at any size from 480p to 4K: the whole table always fits the window, with no
scrolling (the crews are a slim scoreboard on the left; the line, the lanes of cast cards and your hand get the
rest). In **Hold the Block** the holder sits in a gold 👑 *Holder* pane apart from *The Street*, and the cast
panel says which side you are on. On a phone it switches to a scrolling layout. 🔊 mutes, ⚙ opens the settings. Music and sound
effects are CC0 (credits in `assets/audio/CREDITS.md` and on the title screen).

---

## Quick guide

1. **Open the link.** The title screen has **Play**, **Play online**, **Game stats**, **How to play** and
   **Settings** (music, sound, how fast rounds play out, bot speed).
2. **Play:** three steps. Pick a **mode** → set each **crew** to 🙂 Human (this device), 🤖 Bot or 🌐 Online →
   tick any **house rules** → **Start game**. Every game gets a new random shuffle unless you turn *Random game*
   off and type a seed. With several humans on one device, the screen says *Pass the device to …* between turns.
3. **Your turn:** **drag cards** from your hand (the fan at the bottom) into your line, or onto a zone on the
   table; drop them between other cards to change the order (order matters for seams ✦), drag them back to the
   hand to take them out, or drag cards around your hand to sort it. Clicking works too. **+ Thumbs** commits
   Trigger Thumbs; **Cast** lights up when the line is legal.
4. **Then the table plays it out:** the cards flip, Trigger Thumb dice roll, totals and rank badges appear, each
   corner/Spot changes hands with a flash, and damage or Rep floats up from each crew while the counters move. A
   caption says what happened. When the round resolves, a **Round results** pop-up shows every crew's totals and
   rank and, in Classic and Posted Up, the printed **Damage Matrix** with each crew's token on its cell. It
   closes by itself (or click it, or press Enter; *Results* in the strip under the table reopens it; Settings:
   closes itself / wait for a click / off). **Skip** or change the speed at any time (Settings: slow / normal /
   fast / instant; one crew at a time or all at once). The next round opens with the Wheel spinning.
5. **Online:** *Play online* → **Host a table** (set seats to Online, open the room, share the **code** or the
   invite link) or **Join a table** (name + code). During the game a strip shows who is connected; a dropped
   player presses **Reconnect** and gets their seat back, and the host can let a **bot take over** meanwhile.
6. **Rules** (top bar) explains the mode you're playing; **Log** shows every roll and result.
7. **At the end:** the survey, **Game stats** (standings, chart, timing, economy; download as .md, .csv, .png or
   .jpg), **Replay** (step through with every hand visible), **Play again**, and **Download log** (.json: seed,
   every choice, log, timings, survey; replays exactly). Under *Game stats* on the title screen you can reopen
   recent games, or load reports/logs (several at once are compared side by side).

Tips: the **seed** makes a game repeatable (same seed + same choices = same game). Bots let 1–2 testers run a
full 4-crew table. The *Short game* modifier is for quick rules checks.

---

## For developers

- **No build step.** Plain ES modules. Serve the folder over http: `python -m http.server 8080`
  (or `npm run serve`) and open http://localhost:8080. Opening `index.html` as a file won't load the data.
- **Tests:** `npm test` (Node 20+). **Bot sweep:** `node tools/simulate.mjs 200 [mode] [modifier,…]`.
- **Re-export cards and art** from the Hood Sorcery workspace: `python tools/export_data.py <workspace>`.
- Read **[DEVLOG.md](DEVLOG.md)** first: architecture, how to add a mode, decisions, backlog.
  **[ART_TODO.md](ART_TODO.md)** lists missing art. **[CLAUDE.md](CLAUDE.md)** briefs AI coding sessions.

```
index.html, css/, ui/       screens (no rules)
engine/                     rules only: no DOM, no network, seeded RNG -> ports to C# / Unity
engine/modules/             one file per rule module (core, matrix, corners, holdTheBlock, postedUp, ...)
data/                       cards.json (72), wheel, crews, matrices, modes/*.json, modifiers.json
modes/*.md                  in-game rules page per mode
net/peer.js                 PeerJS (WebRTC) adapter, host-authoritative
tests/, tools/              node tests, bot simulator, data export
assets/                     card art (webp), crews, wheel, elements
```

Rules authority for the printed game is **SRD v3.10.20**. Every mode here is a **playtest variant**.
Card art and lore © Siyaman Studios.
