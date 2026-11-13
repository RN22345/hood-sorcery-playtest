# Classic (SRD v3.10.20)

The printed game, and the **control group**: every other mode is compared against it.

**Goal.** Four crews fight over one Vein for 8 rounds. When it closes, the crew with the **least damage** takes it.

## The round

1. **Spin.** The Wheel lands on a sector; its effect applies to everyone this round.
2. **Cast** (secret, all at once). Lay **1–3 cards** in a row. You may commit 1 or 2 ready **Trigger Thumbs**.
3. **Flip.** Everyone reveals. Each committed Thumb rolls a d6.
4. **Rank.** Everyone is ranked on ATK and on BLK. Your row (ATK rank) and column (BLK rank) on the Damage Matrix give your damage.
5. **Refill** back to 8 cards.

## The line: 8 fingers

Total length minus matched seams must be **8 or less**. A seam matches when one card ends on the element the next card starts on:
fire–fire or wind–wind **+1 ATK**, water–water or earth–earth **+1 BLK**, and **−1 length**.

## Trigger Thumbs (2 per game)

| Roll | 1 | 2 | 3–4 | 5 | 6 |
|---|---|---|---|---|---|
| Effect | −1/−1 | nothing | +1/+1 | +2/+2 | −1 damage this round |

## Damage Matrix (4 players)

| | BLK 1st | 2nd | 3rd | 4th |
|---|---|---|---|---|
| **ATK 1st** | 0 | 0 | 0 | 1 |
| **2nd** | 0 | 0 | 1 | 1 |
| **3rd** | 0 | 1 | 1 | 2 |
| **4th** | 1 | 1 | 2 | 2 |

**Ties:** shorter line, then higher other total, then a roll-off. **Resolution order:** ties → Mugged/Sabotage rotate → matrix → Bleeding → Thumb 6.

## Wheel

Swap Meet (pass 2 left) · Flip the Script (keep or swap ATK/BLK) · The Turf (line 10, up to 4 cards) · Clean Kit (Thumb 1 = nothing) ·
Bleeding (last on ATK +1, last on BLK +1) · Cuffed (line 6) · Mugged (ATK ranks rotate) · Sabotage (BLK ranks rotate).

**End:** least damage wins. Ties: less damage in the last round, then higher ATK + BLK in the last round, then a roll-off.

## Run It Up (P4 modifier): playtest guesses (flagged)

After casting and before the flip, every crew picks at once: **Fold**, **Call** or **Raise**.
- **Stakes:** one raise doubles this round's matrix damage, two or more raises make it ×4.
- **Fold:** you skip the ranking and take a flat **1 damage** (`foldCost`). The rest are ranked with the
  matrix for their number (3- and 2-player matrices). If only one crew stays in, it takes nothing.
- Bleeding, Thumb 6, Call Out and Pass the Tab apply as usual (Bleeding is not multiplied).
- With naive bots, games end around **×2.5 the damage** of plain Classic: try a lower fold cost or ×2 max.

### Lead card (house rules *Show lead card* and *Lead card: hide ATK/BLK*, Classic only): playtest guesses

Both switch Run It Up on. While the fold / call / raise pick is open, you also see the **first card of every rival's
line** (the card leading it; order matters for seams, so this also hints at the seam order). The rest of their line stays
face down; your own line is shown in full. *Show lead card*: the full card plus a "Lead: ATK a · BLK b · length" readout,
so you have real numbers to bet on. *Lead card: hide ATK/BLK*: the number strip is covered ("ATK ? · BLK ?", and the
tooltip omits them), so only name, elements and length are known. Ticking both means the hidden version. Lead cards are
display info only (`viewFor` adds `lead` / `leadHide` during the pick); bots ignore them. Open: first card vs a chosen
card, and whether other modes could use it (Posted Up has several Spots, so it's Classic-only for now).

## Experiments in Classic (FIN-12, D-42): playtest guesses (flagged)

Off by default, not with the physical deck. **Contraband is retired in the SRD; here it is an experiment.**

### Contraband in Classic

Same deal as Corners: 2 secret items from the 12, one a round, locked in with your line, revealed at the flip, then gone; Lucky Charm right
after the spin. **8 of the 12 items work word for word.** A corner in Corners reads as a **ranking** in Classic (1st on ATK, 1st on BLK);
only the 4 items that need a corner change, with the same name and idea:

| Item | Classic |
|---|---|
| **Fake ID** | After the Thumbs, swap your ATK and BLK (a private Flip the Script) |
| **Getaway Car** | If you would take 2 or more damage this round, take 1 less |
| **Snitch** | Name a rival: each ranking they top this round costs them 1 damage |
| **Spray Can** | Each ranking you top this round heals you 1 damage (first off this round's damage, the rest off your total) |

Readings of the unchanged ones: **Smoke Bomb** wins any rank tie on ATK and BLK before the usual tie-breaks (two Smoke Bombs: normal
tie-breaks). **Bribe** covers Cuffed, Bleeding (no +1) and Mugged / Sabotage (you keep your place, the others rotate around you).
**Brass Knuckles / Kevlar Hoodie** go on your one line. Order at the settle: Snitch, then Getaway Car, then Spray Can, then Thumb 6 last.

### Character cards

Each crew is dealt 2 of the 8 and keeps 1 before the first spin (both at once, hidden until all picked; the other card goes back unseen).
The kept card is public and always on. Not tied to a crew.

| Card | Always on |
|---|---|
| The Arsonist / Storm Chaser / The Groundskeeper / The Plumber | +1 ATK and +1 BLK on a line with 2 or more Fire / Wind / Earth / Water cards ("a Fire card" = Fire at either end) |
| Big Hands | You may cast 1 more card (3 becomes 4; The Turf 5) |
| The Tailor | Your first seam each round pays its bonus twice (length still −1 once) |
| Underdog | From round 2: if you are last (ties count) when the round starts, +1 ATK and +1 BLK |
| Loaded Dice | 1 more Trigger Thumb, and each Thumb is rolled twice, keep the higher |

Bot sweep (500 games each, 4 bots): average damage 6.79 plain, 6.79 Contraband, 6.67 characters, 6.62 both; seat win shares stay 22–30%.
Each card saves its holder about 0.5 to 1.5 damage; Loaded Dice is the weakest and bots rarely keep it.
