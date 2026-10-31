# Hold the Block (pathway P2)

> There's one Vein corner, *the Block*. Whoever holds it gets fed by the Vein (heals damage), but every other crew aims at them, and they hit everyone back. Each round: stay or bail?

Source: `Docs/Concept Rework/05_Pathways.md` § P2. Playtest draft. **Keeps "least damage wins".** The Damage Matrix is retired.

## The round

1. **Spin** and **cast** exactly as in Classic (one line ≤ 8 fingers, Thumbs).
2. **Reveal.** Two sides: the **Holder** and the **Street** (everyone else).
3. **Hits** (comparisons only):
   - The Holder's ATK hits every Street crew whose **BLK is lower** than it: **+1 damage** each.
   - Each Street crew whose **ATK is higher** than the Holder's BLK hits the Holder: **+1 damage** for each.
4. Thumb 6 still takes 1 off your damage this round.
5. **The Vein feeds the Holder:** if still holding, **−2 damage** (not below 0).
6. **Stay or bail** (everyone at once): the Holder picks stay / bail, the Street picks in / out. If the Holder bails, **or took 3+ hits this round**, the Street crew with the **highest ATK** that said "in" moves in. If nobody said "in", the Block is empty.

**Empty Block:** nobody holds it at the start. In a round with no holder there are no hits, and the crew with the **highest ATK** takes the Block.

**Win:** least damage after 8 rounds (Classic ties).

## Wheel in Hold the Block

| Sector | Effect here |
|---|---|
| Swap Meet, Flip the Script, The Turf, Clean Kit, Cuffed | As in Classic |
| Bleeding | Last on ATK and last on BLK +1 (ranked as in Classic) |
| Mugged | **The Vein doesn't feed the Holder** this round |
| Sabotage | **The Holder's BLK counts 2 less** this round |

## Playtest guesses (flagged)

- Mugged / Sabotage readings above (ranks don't exist in this mode).
- "Knocked off with 3 hits" and nobody "in" → the Block goes empty.
- No stay/bail in the last round (nothing to stay for).
- Heal 2 is the draft value. Bot games end with very low damage (about 2 per crew): try the **"Block heals 1"** modifier.
