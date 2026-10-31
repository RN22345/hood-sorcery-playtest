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

**Modifiers:** Call Out (P16) · Pass the Tab (P12) · Specialist matrix · Forecast · 4 corners · Block heals 1 ·
3 Thumbs · Short game (4 rounds).

---

## Quick guide

1. **Open the link.** Pick a **mode**, tick any **modifiers**, and set each **seat**: *Human (this device)*, *Bot*
   or *Online player*.
2. **Same room, one device:** leave online seats out and press **Start on this device**. When it's a human's
   turn the screen says *Pass the device to …*; only that player taps *show my hand*.
3. **Online:** set some seats to *Online player*, press **Open online room**, and send friends the **room
   code** (or the invite link). They open the same page, type a name and the code under *Join a friend's
   room*. Start when every online seat shows ✔. During the game a strip shows who is connected. If someone
   drops, they press **Reconnect** (or rejoin with the **same name**) and get their seat back; meanwhile the
   host can press **Bot takes over** so the game doesn't stall.
4. **Playing a round:** the Wheel spins by itself. On your turn click a **zone** (Corners: a corner), then
   click cards in your hand to add them to the line, in order. Click a card in the line to take it back.
   **+ Thumbs** commits Trigger Thumbs. **Lock in** lights up when the line is legal.
5. **After each round** the cards flip face up for a few seconds: each crew's line shows in its box, the
   corners that changed hands glow, and a **round summary** line ("Round 3: Ana +1 damage · Ben took the Lot")
   stays above the action panel. On a phone the hand scrolls sideways and sits at the bottom of the screen.
6. **Rules** (top right) shows the rules of the mode you're playing. **Log** shows every roll and result.
7. **At the end:** fill in the 4-question survey and press **Download game log**. Send the `.json` to QA:
   it holds the seed, every choice, the full log, timings and the survey, and can be replayed exactly.
8. **Game stats** (end screen, or **Stats** in the top bar at any time): standings, a score chart, timing
   (game, rounds, decisions), economy (damage/Rep in and out, heals, Thumbs, cards, reshuffles, lead changes,
   margin, Wheel spread) and per-crew averages. Download it as a report (**.md**), a spreadsheet (**.csv**,
   one row per crew per round) or an image (**.png** / **.jpg**). To look at it again, in any tab: lobby →
   *Game stats* → load the `.md` or the game log `.json` (or drop several files), or pick a recent game.

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
