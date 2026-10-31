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

**Try:** the "4 corners" modifier (the draft's open question: is a crew locked out too often with 3?).
