# Corners (pathway P1)

> Four crews, three street corners over the Vein. Every round you secretly split your 8 fingers between the corners. Whoever brings the most force takes the corner. Hold corners to win.

Source: `Docs/Concept Rework/05_Pathways.md` § P1. Playtest draft, not the rules authority.

## The round

1. **Spin** the Wheel.
2. **Deploy (secret).** Click a corner, then click cards to put them under it. You may use any corners, or leave some empty. **All your lines together** must fit in 8 fingers (1–3 cards in total). Seams only count between two cards under the same corner. Thumbs go next to a corner (the active one when you press +).
3. **Reveal.**
4. **Resolve each corner:**
   - **Challengers count ATK.** The **holder counts BLK** (defending home turf).
   - Highest takes or keeps the corner. **The holder wins ties.** Between challengers: shorter line, then a roll-off.
   - An **undefended** corner (the holder put nothing there, or nobody holds it) falls to the best challenger with **ATK 1+**.
5. **Score:** each corner you hold pays **1 Rep**. Refill to 8.

**Win:** after 8 rounds, **most Rep**. Ties: more corners held, then more Rep in the last round, then a roll-off.

## Wheel in Corners

| Sector | Effect here |
|---|---|
| Swap Meet, Flip the Script, Clean Kit, Cuffed | As in Classic |
| The Turf | **An extra corner, "The Turf", opens this round**; up to 4 cards (line stays 8) |
| Mugged | The corner won with the **highest total goes to its runner-up** |
| Sabotage | **Challengers win ties** against holders this round |
| Bleeding | Every crew that **lost a contest loses 1 Rep** |

## Playtest guesses (flagged)

These were not in the pathway draft and were filled in to make the mode playable. Change them in `data/modes/corners.json` or `engine/modules/corners.js`:

- **Thumb 6** = **+1 Rep** (there is no damage in Corners).
- Mugged / Sabotage / Bleeding readings above (the draft only defined The Turf and Mugged loosely).
- **Corner locations** modifier (one location per corner, dealt at setup). Only the six named in the DEVLOG
  are in; the pathway doc lists ~12. Readings:
  - **Laundromat** "💧 seams +2 BLK": a water seam under it gives +2 BLK instead of +1.
  - **Rooftop** "max 1 card": a line under it has at most 1 card.
  - **Bodega** "pays 2 Rep": its holder gets 2 Rep a round instead of 1.
  - **Precinct** "loser +1 damage": Corners has no damage, so every crew that *casts there and loses* −1 Rep.
  - **Subway Grate** "no seams": no seam bonus *and* no −1 length there (counts against your 8 fingers).
  - **Old Church** "ties to challenger": like Sabotage, only at that corner.
- **Block corner** modifier (P1+P2): the first corner becomes *The Block*; its "heal" reads as **+1 Rep a round**
  for the holder (Corners has no damage). Change `blockRep` in `data/modifiers.json`.
- **Open first card** modifier: before casting, each crew picks 1 card and 1 corner at once; all are shown;
  that card must **lead** the line at that corner (it counts toward the 8 fingers and 3 cards). No Thumbs on it.
- **Rep upkeep** modifier (snowball fix): each corner held **beyond the second** costs 1 Rep that round
  (`repUpkeepFrom: 3`). The draft only says "Rep upkeep"; the threshold is a guess.

### Experiments (optional modifiers, group "Experiments"; spec `Docs/Digital/GP3_OVERHAUL_PLAN.md` §0)

Off by default. Not allowed with the physical deck. **Contraband is retired in the SRD; here it is an experiment.**

- **The Plug** (Corners and Classic): at Refill, after the used cards leave the hands, 4 cards go face up. Crews pick one each
  (or pass), the crew furthest behind first: lowest Rep (Corners) or most damage (Classic). Ties: more contests lost this round
  (Classic: more damage this round), then a logged roll-off. Then everyone draws blind up to 8; unpicked cards are discarded.
  No market in the last round.
- **Turf Perks** (Corners; turns on Corner locations): the crew holding a location's corner **at the start of the round** gets
  - Laundromat **Wash**: at Refill, before drawing, put 1 hand card on the bottom of the deck;
  - Rooftop **Lookout**: before casting, see one rival's hand (your choice);
  - Precinct **Badge**: Cuffed and Mugged don't affect you;
  - Subway Grate **Back Way**: your finger limit is +1;
  - Old Church **Confession**: once per game, right after the spin, re-spin the Wheel;
  - Bodega: already pays 2 Rep, no extra perk.
- **Contraband** (Corners): every crew is dealt 2 secret items (of 12: Burner Phone, Lucky Charm, Fake ID, Smoke Bomb, Brass Knuckles,
  Kevlar Hoodie, Extra Hand, Bribe, Getaway Car, Snitch, Spray Can, Pickpocket). One item a round, locked in with the line and revealed
  at the flip, then gone. Lucky Charm is played right after the spin (it is that round's item).

Changed from the §7 draft: **Lookout shows a hand, not a line**; **Burner Phone = +1 card** (not "see a line"); **Back Way = +1 to your total
finger limit**; **Confession = once per game per crew**. Guesses the plan left open:

- Only **one re-spin a round** (Lucky Charm first, then the lowest seat); the re-spun sector replaces the cooldown entry and the sector
  that was spun can't come up again.
- **Immunity:** Badge covers Cuffed and Mugged; Bribe covers any curse. Mugged on an immune crew: nothing happens at that corner. Sabotage:
  an immune holder keeps its ties. Bleeding: no Rep loss.
- **Fake ID:** you count as the holder at one corner where you have a line; the real holder fights as a challenger.
- **Smoke Bomb** only matters for ties between a challenger and the holder. **Snitch:** −1 Rep for each contested corner the named crew wins.
- **Getaway Car:** your lost line with the most ATK moves to the best-paying empty corner and takes it with ATK 1+ (Precinct still charges
  the original loss; Bleeding ignores that loss). **Pickpocket:** a random unused item of a random rival, after this round's items are revealed.

**Try:** the "4 corners" modifier (the draft's open question: is a crew locked out too often with 3?).
